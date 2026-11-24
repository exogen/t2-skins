import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { extractVl2, removeGalleryScreenshots } from "./extract-vl2.mjs";

async function inTemporaryDirectory(run) {
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-extract-vl2-"));
  try {
    process.chdir(dir);
    await run();
  } finally {
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function writeFiles(files) {
  for (const file of files) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, file);
  }
}

test("archive names reach unzip as data, never as shell syntax or an option", async () => {
  await inTemporaryDirectory(async () => {
    await writeFiles(["source/textures/skins/weapon_disc.png"]);
    const names = ["Skin $(touch pwned) `touch pwned` [v2].vl2", "-x.vl2"];
    for (const [index, name] of names.entries()) {
      execFileSync("zip", ["-q", "-r", path.resolve(name), "textures"], {
        cwd: "source",
      });
      const output = `output${index}`;
      await fs.mkdir(output);
      extractVl2(name, output);
      // Extracted flat, without the archive's folders.
      assert.deepEqual(await fs.readdir(output), ["weapon_disc.png"]);
    }
    await assert.rejects(fs.access("pwned"), { code: "ENOENT" });
  });
});

test("replacing a skin file removes that skin's gallery screenshots, for folder and player skins", async () => {
  await inTemporaryDirectory(async () => {
    await writeFiles([
      "docs/skins/Viserion/mine.png",
      "docs/skins/Hero.lmale.png",
      "docs/gallery/Viserion.mine.webp",
      "docs/gallery/Viserion.disc.webp",
      "docs/gallery/Other.mine.webp",
      "docs/gallery/Hero.lmale.webp",
    ]);
    assert.deepEqual(removeGalleryScreenshots("docs/skins/Viserion/mine.png"), [
      path.join("docs/gallery", "Viserion.mine.webp"),
    ]);
    assert.deepEqual(removeGalleryScreenshots("docs/skins/Hero.lmale.png"), [
      path.join("docs/gallery", "Hero.lmale.webp"),
    ]);
    assert.deepEqual((await fs.readdir("docs/gallery")).sort(), [
      "Other.mine.webp",
      "Viserion.disc.webp",
    ]);
  });
});
