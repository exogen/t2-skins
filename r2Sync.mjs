// R2 sync and Cloudflare cache invalidation for the skins deployment.
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { MANIFEST_KEY, metadataFor, policyHash } from "./skinAssets.mjs";

const BUCKET = "t2-assets";
const PREFIX = "skins/";
const PUBLIC_PREFIX = `https://assets.tribes2.online/${PREFIX}`;

export function createClient() {
  if (
    !process.env.AWS_ENDPOINT_URL ||
    new URL(process.env.AWS_ENDPOINT_URL).hostname.startsWith(".")
  ) {
    throw new Error(
      "AWS_ENDPOINT_URL must be set to https://<account-id>.r2.cloudflarestorage.com (check CF_ACCOUNT_ID).",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: process.env.AWS_ENDPOINT_URL,
    forcePathStyle: true,
    maxAttempts: 5,
    // R2 does not accept the CRC checksums newer SDK versions add by default.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

function headers(metadata) {
  return {
    ContentType: metadata.contentType,
    CacheControl: metadata.cacheControl,
  };
}

function isStringArray(value) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function createStore(client) {
  const Bucket = BUCKET;
  const prefix = PREFIX;
  const stateKey = ".asset-sync/skins.json";
  return {
    async readState() {
      let result;
      try {
        result = await client.send(
          new GetObjectCommand({ Bucket, Key: stateKey }),
        );
      } catch (error) {
        if (error.name === "NoSuchKey") return undefined;
        throw error;
      }
      const value = JSON.parse(await result.Body.transformToString());
      if (
        !value ||
        value.version !== 1 ||
        (value.policy !== null && typeof value.policy !== "string") ||
        !isStringArray(value.report) ||
        !result.ETag
      ) {
        throw new Error(
          `Invalid sync state at ${stateKey}; inspect it before synchronizing.`,
        );
      }
      return { value, etag: result.ETag };
    },

    // Conditional writes prevent a stale purge from clearing newer work.
    // Deploys themselves must be serialized (the workflow does this).
    async writeState(value, previousEtag) {
      const result = await client.send(
        new PutObjectCommand({
          Bucket,
          Key: stateKey,
          // R2 ETags describe content, not write order. A new revision makes
          // repeated changes to the same keys distinguishable to IfMatch.
          Body: JSON.stringify({ ...value, revision: randomUUID() }),
          ContentType: "application/json",
          CacheControl: "no-store",
          ...(previousEtag ? { IfMatch: previousEtag } : { IfNoneMatch: "*" }),
        }),
      );
      if (!result.ETag) {
        throw new Error("R2 did not return an ETag for the sync state.");
      }
      return result.ETag;
    },

    /** Every object under the prefix, keyed relative to it. */
    async list() {
      const objects = new Map();
      let token;
      do {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const object of result.Contents ?? []) {
          if (
            object.Key == null ||
            object.Size == null ||
            object.ETag == null ||
            !object.Key.startsWith(prefix)
          ) {
            throw new Error("Incomplete R2 object listing.");
          }
          objects.set(object.Key.slice(prefix.length), {
            size: object.Size,
            etag: object.ETag,
          });
        }
        if (
          result.IsTruncated &&
          (!result.NextContinuationToken ||
            result.NextContinuationToken === token)
        ) {
          throw new Error(
            "Truncated R2 listing without a new continuation token.",
          );
        }
        token = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },

    async upload(key, file, metadata) {
      // Whole-file bodies (skins are a few MB at most) let the SDK retry
      // a failed attempt itself, which it cannot do with a consumed stream.
      const Body = await fs.readFile(file);
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: `${prefix}${key}`,
          Body,
          ContentLength: Body.length,
          ...headers(metadata),
        }),
      );
    },

    /** Rewrite an object's headers in place, without re-sending its bytes. */
    async updateMetadata(key, metadata) {
      await client.send(
        new CopyObjectCommand({
          Bucket,
          Key: `${prefix}${key}`,
          CopySource: [Bucket, ...`${prefix}${key}`.split("/")]
            .map(encodeURIComponent)
            .join("/"),
          MetadataDirective: "REPLACE",
          ...headers(metadata),
        }),
      );
    },

    async delete(keys) {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: `${prefix}${key}` })),
            Quiet: true,
          },
        }),
      );
      if (result.Errors?.length) {
        throw new Error(
          `R2 failed to delete objects: ${JSON.stringify(result.Errors)}`,
        );
      }
    },
  };
}

/** Bounded concurrency, waiting for active jobs even if one fails. */
async function concurrent(items, concurrency, action, log, label) {
  if (!items.length) return;
  let next = 0;
  let completed = 0;
  let failed = false;
  const started = Date.now();
  const report = () => {
    const percent = Math.floor((completed / items.length) * 100);
    const seconds = Math.floor((Date.now() - started) / 1000);
    log(
      `${label}: ${completed}/${items.length} (${percent}%, ${seconds}s elapsed)${failed ? " — failed" : ""}`,
    );
  };
  report();
  const timer = setInterval(report, 5000);
  timer.unref();
  try {
    const results = await Promise.allSettled(
      Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (!failed && next < items.length) {
          const item = items[next++];
          try {
            await action(item);
            completed++;
          } catch (error) {
            failed = true;
            throw error;
          }
        }
      }),
    );
    report();
    for (const result of results) {
      if (result.status === "rejected") throw result.reason;
    }
  } finally {
    clearInterval(timer);
  }
}

/**
 * Whether the local file is byte-identical to the remote object. A multipart
 * or otherwise unfamiliar ETag never matches, so such an object is uploaded
 * once and carries a plain MD5 from then on; it must never hide an edit.
 */
async function matchesRemote(file, remote) {
  if (!remote) return false;
  if ((await fs.stat(file)).size !== remote.size) return false;
  return (
    createHash("md5")
      .update(await fs.readFile(file))
      .digest("hex") === remote.etag.replaceAll('"', "")
  );
}

export async function syncAssets(options) {
  const { files, store, concurrency = 8, log = console.log } = options;
  const policy = policyHash();
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency must be a positive integer.");
  }
  if (files.size === 0) {
    throw new Error("Refusing to synchronize an empty source.");
  }

  log("Reading sync state from R2...");
  const previous = await store.readState();
  log("Listing remote objects...");
  const remote = await store.list();

  const uploads = [];
  await concurrent(
    [...files],
    concurrency,
    async ([key, file]) => {
      if (await matchesRemote(file, remote.get(key))) return;
      uploads.push(key);
    },
    log,
    "Comparing files",
  );
  uploads.sort();

  const policyChanged = previous?.value.policy !== policy;
  const uploading = new Set(uploads);
  const metadataUpdates = [];
  const deletions = [];
  for (const key of remote.keys()) {
    if (!files.has(key)) deletions.push(key);
    else if (policyChanged && !uploading.has(key)) metadataUpdates.push(key);
  }
  metadataUpdates.sort();
  deletions.sort();
  if (deletions.length / remote.size > 0.2 && !options.allowLargePrune) {
    throw new Error(
      `Refusing to delete ${deletions.length} of ${remote.size} objects. Use --allow-large-prune for deliberate bulk removal.`,
    );
  }

  const report = [
    ...new Set([
      ...(previous?.value.report ?? []),
      ...uploads,
      ...metadataUpdates,
      ...deletions,
    ]),
  ].sort();
  log(
    `${remote.size} remote objects, ${files.size} local files: ` +
      `${uploads.length} uploads, ` +
      `${metadataUpdates.length} header rewrites, ${deletions.length} deletions; ` +
      `${report.length} URLs to purge.`,
  );
  const counts = {
    uploads: uploads.length,
    metadataUpdates: metadataUpdates.length,
    deletions: deletions.length,
    purges: report.length,
  };
  if (options.dryRun) {
    log("Dry run: no uploads, deletions or sync-state writes.");
    return { ...counts, report };
  }

  const changed =
    uploads.length + metadataUpdates.length + deletions.length > 0;
  let etag = previous?.etag;
  if (changed) {
    // Journal before touching assets. Invalidate the policy while rewriting
    // headers, so even a rollback after a partial failure repairs them all.
    log("Saving pending purge list...");
    etag = await store.writeState(
      { version: 1, policy: policyChanged ? null : policy, report },
      etag,
    );
    const upload = async (key) => {
      await store.upload(key, files.get(key), metadataFor(key));
    };
    await concurrent(
      uploads.filter((key) => key !== MANIFEST_KEY),
      concurrency,
      upload,
      log,
      "Uploading images",
    );
    await concurrent(
      metadataUpdates,
      concurrency,
      async (key) => {
        await store.updateMetadata(key, metadataFor(key));
      },
      log,
      "Rewriting headers",
    );
    // Publish the manifest only after all the files it can reference exist.
    if (uploading.has(MANIFEST_KEY)) {
      log("Uploading manifest...");
      await upload(MANIFEST_KEY);
    }
    if (deletions.length)
      log(`Deleting ${deletions.length} removed objects...`);
    for (let i = 0; i < deletions.length; i += 1000) {
      await store.delete(deletions.slice(i, i + 1000));
      log(
        `Deleted ${Math.min(i + 1000, deletions.length)}/${deletions.length} objects.`,
      );
    }
  }
  if (changed || policyChanged) {
    log("Saving completed sync state...");
    etag = await store.writeState({ version: 1, policy, report }, etag);
  }
  return { ...counts, report, etag };
}

export async function purgeAssets(keys, options) {
  const {
    zoneId,
    apiToken,
    log = console.log,
    request = fetch,
    sleep = setTimeout,
  } = options;
  // Encode filenames, including literal spaces, #, ? and %, as URL paths.
  const urls = keys.map(
    (key) => PUBLIC_PREFIX + key.split("/").map(encodeURIComponent).join("/"),
  );
  log(`Purging ${urls.length} URLs from the Cloudflare cache...`);
  // https://developers.cloudflare.com/cache/how-to/purge-cache/#single-file-purge-limits
  for (let i = 0; i < urls.length; i += 100) {
    for (let attempt = 0; ; attempt++) {
      let response;
      try {
        response = await request(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ files: urls.slice(i, i + 100) }),
            signal: AbortSignal.timeout(30_000),
          },
        );
        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(
            `Purge failed (HTTP ${response.status}): ${JSON.stringify(result.errors ?? result)}`,
          );
        }
        break;
      } catch (error) {
        if (
          attempt >= 2 ||
          (response && response.status < 500 && response.status !== 429)
        ) {
          throw error;
        }
        const delay = Math.max(
          1000 * 2 ** attempt,
          Number(response?.headers.get("retry-after")) * 1000 || 0,
        );
        log(`Purge failed; retrying in ${delay}ms.`);
        await sleep(delay);
      }
    }
    log(`Purged ${Math.min(i + 100, urls.length)}/${urls.length} URLs.`);
  }
}

export async function deployAssets(options) {
  const { store, dryRun, zoneId, apiToken, log = console.log } = options;
  const result = await syncAssets(options);
  if (!result.report.length) return result;
  if (dryRun) {
    log("Dry run: no purge requests sent.");
  } else if (!zoneId || !apiToken) {
    log(
      "Purge skipped: set CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN. Pending URLs remain in R2.",
    );
  } else {
    await purgeAssets(result.report, options);
    log("Clearing pending purge list...");
    await store.writeState(
      { version: 1, policy: policyHash(), report: [] },
      result.etag,
    );
    log("Purge complete; pending URLs cleared.");
  }
  return result;
}
