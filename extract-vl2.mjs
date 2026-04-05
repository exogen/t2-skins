import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { globby } from "globby";

const SKIN_DIR = "./docs/skins";
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

const args = process.argv.slice(2);
if (!args.length) {
  console.error('Usage: node extract-vl2.mjs <glob of .vl2 files>');
  console.error('Example: node extract-vl2.mjs "./foo/**/*.vl2"');
  process.exit(1);
}

const vl2Files = await globby(args);
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
    const finalName = await resolveSkinNameConflict(skinName, suffixes, SKIN_DIR);
    for (const { basename, suffix } of group) {
      const destName = `${finalName}${suffix}`;
      fs.copyFileSync(path.join(tmpDir, basename), path.join(SKIN_DIR, destName));
      if (finalName !== skinName) {
        console.log(`  ${basename} -> ${SKIN_DIR}/${destName} (renamed)`);
      } else {
        console.log(`  ${basename} -> ${SKIN_DIR}/${destName}`);
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
    const finalName = await resolveFileConflict(basename, dest);
    fs.copyFileSync(path.join(tmpDir, basename), path.join(dest, finalName));
    console.log(`  ${basename} -> ${dest}/${finalName}`);
  }

  fs.rmSync(tmpDir, { recursive: true });
}

console.log("Done.");
