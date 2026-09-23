import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { parseArgs } from "util";
import { globby } from "globby";
import { fileToModels } from "./modelData.mjs";

const SKIN_DIR = "./docs/skins";
const GALLERY_DIR = "./docs/gallery";
const PLAYER_PATTERN =
  /^(.+)\.(l|m|h)(male|female|bioderm)\.png$/i;

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function getExistingNamesLower(dir) {
  try {
    return new Set(fs.readdirSync(dir).map((n) => n.toLowerCase()));
  } catch {
    return new Set();
  }
}

// Returns the on-disk name matching `name` case-insensitively, or null.
function findExistingName(dir, name) {
  try {
    const lower = name.toLowerCase();
    return fs.readdirSync(dir).find((n) => n.toLowerCase() === lower) ?? null;
  } catch {
    return null;
  }
}

// Copies `src` to `dir/name`. With overwrite, a file whose name matches
// case-insensitively is replaced in place, keeping its on-disk name so the
// skin stays under one name on case-sensitive filesystems.
// Returns { destPath, replaced }.
function copyInto(src, dir, name, overwrite) {
  const existing = overwrite ? findExistingName(dir, name) : null;
  const destPath = path.join(dir, existing ?? name);
  fs.copyFileSync(src, destPath);
  return { destPath, replaced: existing !== null };
}

// Removes stale gallery screenshots for a skin file so `gallery.mjs`
// re-renders it. Returns the removed paths.
function removeGalleryScreenshots(skinFilePath) {
  const info = fileToModels(skinFilePath);
  if (!info) return [];
  const removed = [];
  for (const { modelName } of info.models) {
    const name = `${info.skinName}.${modelName}.webp`;
    const existing = findExistingName(GALLERY_DIR, name);
    if (existing) {
      const galleryPath = path.join(GALLERY_DIR, existing);
      fs.rmSync(galleryPath);
      removed.push(galleryPath);
    }
  }
  return removed;
}

async function resolveFileConflict(basename, destDir) {
  const existing = getExistingNamesLower(destDir);
  let name = basename;
  while (existing.has(name.toLowerCase())) {
    name = await prompt(
      `  "${name}" conflicts with an existing file in ${destDir}/\n  Enter an alternative name: `
    );
  }
  return name;
}

async function resolveSkinNameConflict(skinName, suffixes, destDir) {
  const existing = getExistingNamesLower(destDir);
  let name = skinName;
  while (true) {
    const hasConflict = suffixes.some((suffix) =>
      existing.has(`${name}${suffix}`.toLowerCase())
    );
    if (!hasConflict) break;
    const conflicting = suffixes
      .filter((suffix) => existing.has(`${name}${suffix}`.toLowerCase()))
      .map((suffix) => `${name}${suffix}`);
    name = await prompt(
      `  Skin name "${name}" conflicts (${conflicting.join(", ")})\n  Enter an alternative skin name: `
    );
  }
  return name;
}

function usage() {
  console.error("Usage: node extract-vl2.mjs [--overwrite] <glob of .vl2 files>");
  console.error('Example: node extract-vl2.mjs "./foo/**/*.vl2"');
  console.error("");
  console.error("  --overwrite  Replace existing files with the same name instead of");
  console.error("               prompting for a new name. Matching gallery screenshots");
  console.error("               are deleted so `npm run gallery` re-renders them.");
  process.exit(1);
}

let values, positionals;
try {
  ({ values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      overwrite: { type: "boolean", default: false },
    },
  }));
} catch (err) {
  console.error(err.message);
  usage();
}
const overwrite = values.overwrite;
if (!positionals.length) usage();

const vl2Files = await globby(positionals);
if (!vl2Files.length) {
  console.error("No .vl2 files matched.");
  process.exit(1);
}

for (const vl2 of vl2Files) {
  console.log(`Processing: ${vl2}`);
  let otherFolder = null;
  const tmpDir = fs.mkdtempSync(path.join("/tmp", "vl2-"));

  try {
    // -o overwrite, -j junk paths (flatten)
    execSync(`unzip -o -j ${JSON.stringify(vl2)} -d ${JSON.stringify(tmpDir)}`, {
      stdio: "pipe",
    });
  } catch {
    console.warn(`  Warning: failed to extract ${vl2}, skipping`);
    fs.rmSync(tmpDir, { recursive: true });
    continue;
  }

  const files = fs.readdirSync(tmpDir).filter((f) =>
    fs.statSync(path.join(tmpDir, f)).isFile()
  );

  // Group player skins by their name prefix.
  const skinGroups = new Map(); // skinName -> [{ basename, suffix }]
  const otherFiles = [];

  for (const basename of files) {
    const match = basename.match(PLAYER_PATTERN);
    if (match) {
      const skinName = match[1];
      const suffix = basename.slice(skinName.length); // e.g. ".lmale.png"
      if (!skinGroups.has(skinName)) skinGroups.set(skinName, []);
      skinGroups.get(skinName).push({ basename, suffix });
    } else {
      otherFiles.push(basename);
    }
  }

  // Process player skins grouped by skin name.
  fs.mkdirSync(SKIN_DIR, { recursive: true });
  for (const [skinName, group] of skinGroups) {
    const suffixes = group.map((g) => g.suffix);
    const finalName = overwrite
      ? skinName
      : await resolveSkinNameConflict(skinName, suffixes, SKIN_DIR);
    for (const { basename, suffix } of group) {
      const destName = `${finalName}${suffix}`;
      const { destPath, replaced } = copyInto(
        path.join(tmpDir, basename),
        SKIN_DIR,
        destName,
        overwrite
      );
      let note = "";
      if (finalName !== skinName) note = " (renamed)";
      else if (replaced) note = " (replaced)";
      console.log(`  ${basename} -> ${destPath}${note}`);
      if (replaced) {
        for (const galleryPath of removeGalleryScreenshots(destPath)) {
          console.log(`    removed ${galleryPath}`);
        }
      }
    }
  }

  // Process non-player files.
  for (const basename of otherFiles) {
    if (otherFolder === null) {
      otherFolder = await prompt(
        `  Non-player file found: ${basename}\n  Enter folder name under ${SKIN_DIR} for non-player files: `
      );
    }
    const dest = path.join(SKIN_DIR, otherFolder);
    fs.mkdirSync(dest, { recursive: true });
    const finalName = overwrite
      ? basename
      : await resolveFileConflict(basename, dest);
    const { destPath, replaced } = copyInto(
      path.join(tmpDir, basename),
      dest,
      finalName,
      overwrite
    );
    console.log(`  ${basename} -> ${destPath}${replaced ? " (replaced)" : ""}`);
    if (replaced) {
      for (const galleryPath of removeGalleryScreenshots(destPath)) {
        console.log(`    removed ${galleryPath}`);
      }
    }
  }

  fs.rmSync(tmpDir, { recursive: true });
}

console.log("Done.");
