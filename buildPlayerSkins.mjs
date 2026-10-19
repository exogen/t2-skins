import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { globby } from "globby";

const PLAYER_TEXTURE = /^(.+)\.[lmh](male|female|bioderm)\.png$/i;
const MAX_VL2_BYTES = 2093790080; // Same 1.95 GiB ceiling as tribes2/vl2-builder.

export function isPlayerTexture(file) {
  return !file.split("/").some((part) => part.startsWith(".")) &&
    PLAYER_TEXTURE.test(path.basename(file));
}

export async function buildPlayerSkins({
  source = "docs/skins",
  output = "dist/player-skins",
} = {}) {
  const files = (await globby("**/*", {
    cwd: source,
    followSymbolicLinks: false,
  })).filter(isPlayerTexture).sort();
  if (!files.length) throw new Error(`No player textures found in ${source}`);
  const { sizeMultiplier } = JSON.parse(
    await fs.readFile(path.join(source, "..", "skins.json"), "utf8"),
  );

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "t2-player-skins-"));
  const variants = [
    { directory: "standard", name: "zPlayerSkins-All.vl2" },
    { directory: "hd", name: "zPlayerSkins-All-HD.vl2" },
  ];
  try {
    for (const { directory } of variants) {
      await fs.mkdir(path.join(temporary, directory, "textures/skins"), {
        recursive: true,
      });
    }
    const names = new Map();
    let hdCount = 0;
    for (const file of files) {
      const name = path.basename(file);
      const existing = names.get(name.toLowerCase());
      if (existing) {
        throw new Error(`Duplicate player texture filename (case-insensitive): ${existing} and ${file}`);
      }
      names.set(name.toLowerCase(), file);
      // Match the gallery: the manifest selects prepared @1x copies for HD
      // textures, with the original game filename restored inside the VL2.
      const isHd = sizeMultiplier[file] > 1;
      const standard = isHd ? file.replace(/\.png$/i, "@1x.png") : file;
      if (isHd) hdCount++;
      await fs.copyFile(path.join(source, standard), path.join(temporary, "standard/textures/skins", name));
      await fs.copyFile(path.join(source, file), path.join(temporary, "hd/textures/skins", name));
    }

    // Build both successfully before replacing either download. PNGs are
    // already compressed; ordinary stored ZIP entries work in Tribes 2.
    for (const { directory, name } of variants) {
      const archive = path.join(temporary, name);
      execFileSync("zip", ["-0", "-q", "-r", archive, "textures"], {
        cwd: path.join(temporary, directory),
      });
      if ((await fs.stat(archive)).size > MAX_VL2_BYTES) {
        throw new Error(`${name} exceeds the single-VL2 size limit`);
      }
    }
    await fs.mkdir(output, { recursive: true });
    for (const { name } of variants) {
      await fs.copyFile(path.join(temporary, name), path.join(output, name));
    }
    return { fileCount: files.length, hdCount, files: variants.map(({ name }) => name) };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildPlayerSkins({ output: process.argv[2] });
  console.log(`Built both VL2s: ${result.fileCount} player textures, ${result.hdCount} HD originals.`);
}
