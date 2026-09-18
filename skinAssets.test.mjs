import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  ASSET_CACHE_CONTROL,
  MANIFEST_CACHE_CONTROL,
  listLocalAssets,
  metadataFor,
  policyHash,
  unknownExtensions,
} from "./skinAssets.mjs";

test("the manifest is cached briefly and images for longer", () => {
  assert.deepEqual(metadataFor("manifest.json"), {
    contentType: "application/json",
    cacheControl: MANIFEST_CACHE_CONTROL,
  });
  assert.deepEqual(metadataFor("files/Skin Name/disc27.PNG"), {
    contentType: "image/png",
    cacheControl: ASSET_CACHE_CONTROL,
  });
  assert.equal(metadataFor("gallery/x.webp").contentType, "image/webp");
  assert.equal(metadataFor("files/readme.txt"), undefined);
  assert.match(MANIFEST_CACHE_CONTROL, /^max-age=300$/);
  assert.match(
    ASSET_CACHE_CONTROL,
    /^max-age=\d+, stale-while-revalidate=\d+$/,
  );
  assert.match(policyHash(), /^[0-9a-f]{64}$/);
});

test("the docs tree maps onto the bucket layout, skipping dotfiles", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-skins-docs-"));
  try {
    await fs.mkdir(path.join(dir, "gallery"));
    await fs.mkdir(path.join(dir, "skins", "Pack Name"), { recursive: true });
    await fs.writeFile(path.join(dir, "skins.json"), "{}");
    await fs.writeFile(path.join(dir, "index.html"), "");
    await fs.writeFile(path.join(dir, ".nojekyll"), "");
    await fs.writeFile(path.join(dir, "gallery", "A.hmale.webp"), "");
    await fs.writeFile(path.join(dir, "gallery", ".DS_Store"), "");
    await fs.writeFile(path.join(dir, "skins", "A.hmale.png"), "");
    await fs.writeFile(path.join(dir, "skins", "Pack Name", "disc.PNG"), "");
    await fs.writeFile(path.join(dir, "skins", "Pack Name", ".DS_Store"), "");
    await fs.writeFile(path.join(dir, "skins", "notes.txt"), "");
    const files = await listLocalAssets(dir);
    assert.deepEqual(
      [...files.keys()],
      [
        "files/A.hmale.png",
        "files/Pack Name/disc.PNG",
        "files/notes.txt",
        "gallery/A.hmale.webp",
        "manifest.json",
      ],
    );
    assert.equal(files.get("manifest.json"), path.join(dir, "skins.json"));
    assert.deepEqual(
      [...unknownExtensions(files.keys())],
      [[".txt", ["files/notes.txt"]]],
    );
    await fs.rm(path.join(dir, "gallery"), { recursive: true });
    await assert.rejects(listLocalAssets(dir), { code: "ENOENT" });
    await fs.writeFile(path.join(dir, "gallery"), "not a directory");
    await assert.rejects(listLocalAssets(dir), /Expected a directory/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
