// The GitHub Pages files, their R2 names, and their HTTP headers.
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { globby } from "globby";

export const MANIFEST_KEY = "manifest.json";
export const MANIFEST_CACHE_CONTROL = "max-age=300";
export const ASSET_CACHE_CONTROL =
  "max-age=86400, stale-while-revalidate=604800";

const CONTENT_TYPES = {
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
};

function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()];
}

/**
 * Every header an object gets, or undefined for an extension the table has
 * never seen. A writer that replaces object metadata must set all of these,
 * or it silently drops the ones it leaves out.
 */
export function metadataFor(key) {
  const contentType = contentTypeFor(key);
  if (!contentType) return undefined;
  return {
    contentType,
    cacheControl:
      key === MANIFEST_KEY ? MANIFEST_CACHE_CONTROL : ASSET_CACHE_CONTROL,
  };
}

/**
 * A digest of the whole metadata table. It is stored with the sync state, so
 * changing a value above rewrites the headers on every unchanged object too.
 */
export function policyHash() {
  const table = Object.keys(CONTENT_TYPES)
    .sort()
    .map((ext) => [ext, metadataFor(`asset${ext}`)]);
  table.push([MANIFEST_KEY, metadataFor(MANIFEST_KEY)]);
  return createHash("sha256").update(JSON.stringify(table)).digest("hex");
}

/** How the docs tree maps onto the bucket prefix. */
export const SOURCES = [
  { local: "skins.json", key: MANIFEST_KEY },
  { local: "gallery", key: "gallery/" },
  { local: "skins", key: "files/" },
];

/**
 * Every file to sync, as a sorted Map from object key (under the prefix) to
 * local path. Dotfiles (.DS_Store and friends) are skipped wherever they are.
 */
export async function listLocalAssets(source) {
  const files = new Map();
  for (const { local, key } of SOURCES) {
    const root = path.join(source, local);
    const stat = await fs.stat(root);
    if (key === MANIFEST_KEY) {
      if (!stat.isFile()) throw new Error(`Expected a file at ${root}`);
      files.set(key, root);
    } else {
      // Check required directories before globbing; a missing one must not
      // look like an empty directory and cause its remote files to be deleted.
      if (!stat.isDirectory())
        throw new Error(`Expected a directory at ${root}`);
      for (const file of await globby("**/*", { cwd: root })) {
        files.set(`${key}${file}`, path.join(root, file));
      }
    }
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** Keys the metadata table cannot type, grouped by extension with examples. */
export function unknownExtensions(keys) {
  const unknown = new Map();
  for (const key of keys) {
    if (contentTypeFor(key)) continue;
    const ext = path.extname(key).toLowerCase() || "(none)";
    const examples = unknown.get(ext) ?? [];
    if (examples.length < 3) examples.push(key);
    unknown.set(ext, examples);
  }
  return unknown;
}
