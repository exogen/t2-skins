import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { buildPlayerSkins } from "./buildPlayerSkins.mjs";

test("both VL2s match gallery selection and preserve committed texture bytes", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "t2-player-vl2-test-"));
  const source = path.join(temporary, "skins");
  const output = path.join(temporary, "output");
  try {
    await fs.mkdir(path.join(source, "Weapons"), { recursive: true });
    const standard = Buffer.from("standard texture bytes");
    const hd = Buffer.from("original HD texture bytes");
    const prepared = Buffer.from("prepared @1x texture bytes");
    await fs.writeFile(path.join(temporary, "skins.json"), JSON.stringify({
      sizeMultiplier: { "HD.hmale.png": 2, "NewHD.lfemale.png": 4 },
    }));
    const playerNames = [
      "Space #1 50%.lmale.PNG", "Armor.mmale.png", "Armor.hmale.png",
      "Armor.lfemale.png", "Armor.mfemale.png", "Armor.hfemale.png",
      "Armor.lbioderm.png", "Armor.mbioderm.png", "Armor.hbioderm.png",
    ];
    for (const name of playerNames) await fs.writeFile(path.join(source, name), standard);
    await fs.writeFile(path.join(source, "HD.hmale.png"), hd);
    await fs.writeFile(path.join(source, "HD.hmale@1x.png"), prepared);
    await fs.writeFile(path.join(source, "NewHD.lfemale.png"), hd);
    await fs.writeFile(path.join(source, "NewHD.lfemale@1x.png"), prepared);
    // As in the gallery, an unlisted @1x file does not override an SD original.
    await fs.writeFile(path.join(source, "Armor.mmale@1x.png"), "unused alternative");
    await fs.writeFile(path.join(source, "Weapons/weapon_disc.png"), standard);
    await fs.writeFile(path.join(source, "vehicle_air_scout.png"), standard);
    await fs.writeFile(path.join(source, ".Hidden.lmale.png"), standard);

    const result = await buildPlayerSkins({ source, output });
    assert.equal(result.fileCount, 11);
    assert.equal(result.hdCount, 2);
    for (const archiveName of result.files) {
      const archive = path.join(output, archiveName);
      const names = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
        .trim().split("\n").filter((name) => !name.endsWith("/"));
      assert.deepEqual(names.sort(), [...playerNames, "HD.hmale.png", "NewHD.lfemale.png"]
        .map((name) => `textures/skins/${name}`).sort());
      assert.deepEqual(execFileSync("unzip", ["-p", archive, "textures/skins/Armor.mmale.png"]), standard);
      for (const name of ["HD.hmale.png", "NewHD.lfemale.png"]) {
        const bytes = execFileSync("unzip", ["-p", archive, `textures/skins/${name}`]);
        assert.deepEqual(bytes, archiveName.includes("-HD") ? hd : prepared);
      }
    }
    // Rebuilding removes deleted skins rather than updating an existing ZIP.
    await fs.unlink(path.join(source, "Armor.mmale.png"));
    assert.equal((await buildPlayerSkins({ source, output })).fileCount, 10);
    const names = execFileSync("unzip", ["-Z1", path.join(output, result.files[0])], { encoding: "utf8" });
    assert.equal(names.includes("Armor.mmale.png"), false);
    assert.deepEqual(await fs.readFile(path.join(source, "HD.hmale.png")), hd);
    assert.deepEqual(await fs.readFile(path.join(source, "HD.hmale@1x.png")), prepared);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("conflicting game filenames in different folders are rejected", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "t2-player-vl2-test-"));
  const source = path.join(temporary, "skins");
  try {
    const image = Buffer.from("texture bytes");
    await fs.writeFile(path.join(temporary, "skins.json"), JSON.stringify({ sizeMultiplier: {} }));
    for (const [folder, name] of [["one", "Skin.lmale.png"], ["two", "skin.lmale.PNG"]]) {
      await fs.mkdir(path.join(source, folder), { recursive: true });
      await fs.writeFile(path.join(source, folder, name), image);
    }
    await assert.rejects(buildPlayerSkins({ source, output: path.join(temporary, "output") }), (error) => {
      assert.match(error.message, /Duplicate player texture filename \(case-insensitive\)/);
      assert.ok(error.message.includes("one/Skin.lmale.png"));
      assert.ok(error.message.includes("two/skin.lmale.PNG"));
      return true;
    });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test("an empty player collection fails without replacing existing downloads", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "t2-player-vl2-test-"));
  try {
    await fs.writeFile(path.join(temporary, "zPlayerSkins-All.vl2"), "previous release");
    await assert.rejects(buildPlayerSkins({ source: temporary, output: temporary }), /No player textures/);
    assert.equal(await fs.readFile(path.join(temporary, "zPlayerSkins-All.vl2"), "utf8"), "previous release");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
