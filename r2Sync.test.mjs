import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  createStore,
  deployAssets,
  purgeAssets,
  syncAssets,
} from "./r2Sync.mjs";
import { metadataFor, policyHash } from "./skinAssets.mjs";

const md5 = (text) => createHash("md5").update(text).digest("hex");
const policy = policyHash();
const quiet = () => {};
const success = () => Response.json({ success: true });

// Use the real R2 adapter, with content-based ETags and conditional writes.
function fakeStore(objects = {}, initialState) {
  const remote = new Map(
    Object.entries(objects).map(([key, body]) => [key, { body }]),
  );
  let stateBody = initialState ? JSON.stringify(initialState) : undefined;
  const calls = [];
  const store = createStore({
    async send(command) {
      const input = command.input;
      switch (command.constructor.name) {
        case "GetObjectCommand":
          if (!stateBody)
            throw Object.assign(new Error(), { name: "NoSuchKey" });
          return {
            ETag: `"${md5(stateBody)}"`,
            Body: { transformToString: async () => stateBody },
          };
        case "PutObjectCommand":
          if (input.Key === ".asset-sync/skins.json") {
            const etag = stateBody ? `"${md5(stateBody)}"` : undefined;
            if (
              input.IfMatch !== etag ||
              (input.IfNoneMatch === "*" && stateBody)
            ) {
              throw new Error("ETag mismatch");
            }
            stateBody = input.Body;
            const value = JSON.parse(stateBody);
            calls.push(["writeState", value.policy, value.report]);
            return { ETag: `"${md5(stateBody)}"` };
          }
          remote.set(input.Key.slice(6), {
            body: input.Body.toString(),
            metadata: {
              contentType: input.ContentType,
              cacheControl: input.CacheControl,
            },
          });
          calls.push(["upload", input.Key.slice(6)]);
          return {};
        case "ListObjectsV2Command":
          return {
            Contents: [...remote].map(([key, { body }]) => ({
              Key: `skins/${key}`,
              Size: Buffer.byteLength(body),
              ETag: `"${md5(body)}"`,
            })),
          };
        case "CopyObjectCommand":
          remote.get(input.Key.slice(6)).metadata = {
            contentType: input.ContentType,
            cacheControl: input.CacheControl,
          };
          calls.push(["updateMetadata", input.Key.slice(6)]);
          return {};
        case "DeleteObjectsCommand": {
          const keys = input.Delete.Objects.map(({ Key }) => Key.slice(6));
          for (const key of keys) remote.delete(key);
          calls.push(["delete", keys]);
          return {};
        }
        default:
          throw new Error(`Unexpected command: ${command.constructor.name}`);
      }
    },
  });
  return Object.assign(store, { remote, calls });
}

let dir;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-skins-sync-"));
});
after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

/** Writes the files and returns the key -> path Map syncAssets takes. */
async function local(contents) {
  const files = new Map();
  for (const [key, body] of Object.entries(contents)) {
    const file = path.join(dir, key.replaceAll("/", "__"));
    await fs.writeFile(file, body);
    files.set(key, file);
  }
  return files;
}

const options = (store, files, extra = {}) => ({
  files,
  store,
  concurrency: 2,
  log: quiet,
  ...extra,
});

test("first run uploads mismatches, rewrites headers, prunes, and purges new URLs too", async () => {
  const store = fakeStore({
    "same.png": "same",
    "same2.png": "same2",
    "changed.png": "old",
    "gone.png": "gone",
    "size.png": "aa",
  });
  const files = await local({
    "same.png": "same",
    "same2.png": "same2",
    "changed.png": "new",
    "size.png": "aaa",
    "new.png": "brand new",
  });
  const result = await syncAssets(options(store, files));
  assert.equal(result.uploads, 3);
  assert.equal(result.metadataUpdates, 2);
  assert.equal(result.deletions, 1);
  assert.equal(result.purges, 6);
  assert.equal(store.remote.get("changed.png").body, "new");
  assert.equal(store.remote.get("new.png").metadata.contentType, "image/png");
  assert.equal(
    store.remote.get("same.png").metadata.cacheControl,
    metadataFor("same.png").cacheControl,
  );
  assert.equal(store.remote.has("gone.png"), false);
  // Newly created files may already have cached 404s at the edge.
  const purged = [
    "changed.png",
    "gone.png",
    "new.png",
    "same.png",
    "same2.png",
    "size.png",
  ];
  assert.deepEqual(result.report, purged);
  // Persist the purge list and invalidate the policy before changing assets.
  assert.deepEqual(store.calls[0], ["writeState", null, purged]);
  assert.deepEqual(store.calls.at(-1), ["writeState", policy, purged]);
});

test("an unchanged tree with the same policy touches nothing but keeps a pending purge", async () => {
  const store = fakeStore(
    { "a.png": "a", "b.png": "b" },
    { version: 1, policy, report: ["b.png"] },
  );
  const files = await local({ "a.png": "a", "b.png": "b" });
  const result = await syncAssets(options(store, files));
  assert.deepEqual(store.calls, []);
  assert.equal(result.uploads + result.metadataUpdates + result.deletions, 0);
  assert.deepEqual(result.report, ["b.png"]);
});

test("a policy change rewrites headers on every unchanged object", async () => {
  const store = fakeStore(
    { "a.png": "a", "b.png": "b" },
    { version: 1, policy: "policy-0", report: [] },
  );
  const files = await local({ "a.png": "a", "b.png": "changed" });
  const result = await syncAssets(options(store, files));
  assert.deepEqual(
    store.calls.filter(([op]) => op !== "writeState"),
    [
      ["upload", "b.png"],
      ["updateMetadata", "a.png"],
    ],
  );
  assert.equal((await store.readState()).value.policy, policy);
  assert.deepEqual(result.report, ["a.png", "b.png"]);
});

test("a dry run plans the same changes without touching the bucket or state", async () => {
  const store = fakeStore(
    {
      "a.png": "old",
      "b.png": "b",
      "c.png": "c",
      "d.png": "d",
      "gone.png": "x",
    },
    { version: 1, policy, report: [] },
  );
  const files = await local({
    "a.png": "new",
    "b.png": "b",
    "c.png": "c",
    "d.png": "d",
    "new.png": "n",
  });
  const result = await syncAssets(options(store, files, { dryRun: true }));
  assert.deepEqual(store.calls, []);
  assert.deepEqual((await store.readState()).value.report, []);
  assert.equal(result.uploads, 2);
  assert.equal(result.metadataUpdates, 0);
  assert.equal(result.deletions, 1);
  assert.equal(result.purges, 3);
  assert.deepEqual(result.report, ["a.png", "gone.png", "new.png"]);
});

test("a large prune is refused unless allowed", async () => {
  const remote = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`k${i}.png`, `${i}`]),
  );
  const files = await local({ "k0.png": "0" });
  await assert.rejects(
    syncAssets(options(fakeStore(remote), files)),
    /Refusing to delete 9 of 10 objects/,
  );
  const store = fakeStore(remote);
  await syncAssets(options(store, files, { allowLargePrune: true }));
  assert.deepEqual([...store.remote.keys()], ["k0.png"]);
});

test("an empty source is refused", async () => {
  await assert.rejects(
    syncAssets(options(fakeStore({ "a.png": "a" }), new Map())),
    /empty source/,
  );
});

test("a successful deploy purges and clears the journal, including old pending URLs", async () => {
  const store = fakeStore(
    { "a.png": "old" },
    { version: 1, policy, report: ["old.png"] },
  );
  const files = await local({ "a.png": "new" });
  const bodies = [];
  await deployAssets(
    options(store, files, {
      zoneId: "zone",
      apiToken: "token",
      async request(url, init) {
        bodies.push(JSON.parse(init.body));
        assert.equal(store.remote.get("a.png").body, "new");
        assert.deepEqual((await store.readState()).value.report, [
          "a.png",
          "old.png",
        ]);
        return success();
      },
    }),
  );
  assert.deepEqual(bodies, [
    {
      files: [
        "https://assets.tribes2.online/skins/a.png",
        "https://assets.tribes2.online/skins/old.png",
      ],
    },
  ]);
  assert.deepEqual((await store.readState()).value.report, []);
});

test("a failed purge remains pending and is retried without reuploading files", async () => {
  const store = fakeStore({ "a.png": "old" });
  const files = await local({ "a.png": "new" });
  const config = options(store, files, { zoneId: "zone", apiToken: "token" });
  await assert.rejects(
    deployAssets({
      ...config,
      request: async () => Response.json({ success: false }, { status: 403 }),
    }),
    /HTTP 403/,
  );
  assert.deepEqual((await store.readState()).value.report, ["a.png"]);
  store.calls.length = 0;
  await deployAssets({ ...config, request: async () => success() });
  assert.deepEqual(store.calls, [["writeState", policy, []]]);
});

test("missing purge credentials keep the journal; dry runs make no requests or writes", async () => {
  for (const extra of [
    {},
    { dryRun: true, zoneId: "zone", apiToken: "token" },
  ]) {
    const store = fakeStore(
      { "a.png": "old" },
      { version: 1, policy, report: [] },
    );
    const files = await local({ "a.png": "new" });
    await deployAssets(
      options(store, files, {
        ...extra,
        request() {
          assert.fail("must not purge");
        },
      }),
    );
    assert.deepEqual(
      (await store.readState()).value.report,
      extra.dryRun ? [] : ["a.png"],
    );
    if (extra.dryRun) assert.deepEqual(store.calls, []);
  }
});

test("repeated changes to the same keys cannot be cleared by an earlier purge", async () => {
  const store = fakeStore(
    { "a.png": "old" },
    { version: 1, policy, report: [] },
  );
  const files = await local({ "a.png": "new" });
  await assert.rejects(
    deployAssets(
      options(store, files, {
        zoneId: "zone",
        apiToken: "token",
        async request() {
          // Another change to exactly the same key arrives during the purge.
          await fs.writeFile(files.get("a.png"), "newer");
          await syncAssets(options(store, files));
          return success();
        },
      }),
    ),
    /ETag mismatch/,
  );
  assert.deepEqual((await store.readState()).value.report, ["a.png"]);
});

test("a failed upload keeps the old manifest and journals all changes for recovery", async () => {
  const store = fakeStore({ "manifest.json": "old" });
  const files = await local({
    "manifest.json": "new",
    "a.png": "a",
    "b.png": "b",
  });
  const upload = store.upload;
  store.upload = async (key, ...args) => {
    if (key === "b.png") throw new Error("upload failed");
    await upload(key, ...args);
  };
  await assert.rejects(syncAssets(options(store, files)), /upload failed/);
  assert.equal(store.remote.get("manifest.json").body, "old");
  assert.deepEqual((await store.readState()).value.report, [
    "a.png",
    "b.png",
    "manifest.json",
  ]);
  store.upload = upload;
  await syncAssets(options(store, files));
  const uploaded = store.calls
    .filter(([op]) => op === "upload")
    .map(([, key]) => key);
  assert.deepEqual(uploaded, ["a.png", "b.png", "manifest.json"]);
});

test("a partial metadata update invalidates the policy and repairs every object's headers on retry", async () => {
  const store = fakeStore(
    { "a.png": "a", "b.png": "b" },
    {
      version: 1,
      policy: "previous-policy",
      report: [],
    },
  );
  const files = await local({ "a.png": "a", "b.png": "b" });
  const updateMetadata = store.updateMetadata;
  store.updateMetadata = async (key, metadata) => {
    if (key === "b.png") throw new Error("header update failed");
    await updateMetadata(key, metadata);
  };
  await assert.rejects(
    syncAssets(options(store, files)),
    /header update failed/,
  );
  const interrupted = (await store.readState()).value;
  assert.equal(interrupted.policy, null);
  assert.deepEqual(store.remote.get("a.png").metadata, metadataFor("a.png"));
  assert.equal(store.remote.get("b.png").metadata, undefined);
  store.updateMetadata = updateMetadata;
  store.calls.length = 0;
  const result = await syncAssets(options(store, files));
  assert.equal(result.metadataUpdates, 2);
  assert.deepEqual(
    store.calls.filter(([op]) => op === "updateMetadata"),
    [
      ["updateMetadata", "a.png"],
      ["updateMetadata", "b.png"],
    ],
  );
  assert.equal((await store.readState()).value.policy, policy);
});

test("large purges stay limited to the changed URLs and encode filenames", async () => {
  const keys = Array.from({ length: 301 }, (_, i) => `files/${i}.png`);
  keys[0] = "files/Name #1?100%.png";
  const bodies = [];
  await purgeAssets(keys, {
    zoneId: "zone",
    apiToken: "token",
    log: quiet,
    async request(url, init) {
      bodies.push(JSON.parse(init.body));
      return success();
    },
  });
  assert.deepEqual(
    bodies.map(({ files }) => files.length),
    [100, 100, 100, 1],
  );
  assert.equal(
    bodies[0].files[0],
    "https://assets.tribes2.online/skins/files/Name%20%231%3F100%25.png",
  );
  assert.ok(bodies.every((body) => !body.purge_everything));
});

test("purges retry rate limits, server errors and connection errors", async () => {
  for (const [first, delay] of [
    [
      () =>
        Response.json(
          { success: false },
          { status: 429, headers: { "Retry-After": "4" } },
        ),
      4000,
    ],
    [() => new Response("unavailable", { status: 503 }), 1000],
    [
      () => {
        throw new Error("connection reset");
      },
      1000,
    ],
  ]) {
    let attempts = 0;
    const delays = [];
    await purgeAssets(["a.png"], {
      zoneId: "zone",
      apiToken: "token",
      log: quiet,
      request: async () => (attempts++ ? success() : first()),
      sleep: async (delay) => {
        delays.push(delay);
      },
    });
    assert.equal(attempts, 2);
    assert.deepEqual(delays, [delay]);
  }
});

test("permanent purge errors fail immediately; transient failures stop after three attempts", async () => {
  for (const status of [403, 500]) {
    let attempts = 0;
    await assert.rejects(
      purgeAssets(["a.png"], {
        zoneId: "zone",
        apiToken: "token",
        log: quiet,
        request: async () => {
          attempts++;
          return Response.json({ success: false }, { status });
        },
        sleep: async () => {},
      }),
      new RegExp(`HTTP ${status}`),
    );
    assert.equal(attempts, status === 403 ? 1 : 3);
  }
});
