import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PNG } from "pngjs";
import { findModelSkins } from "./modelData.mjs";

test("shared discovery excludes incomplete and unnamed skins, retaining them for diagnostics", async () => {
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-skin-discovery-"));
  const png = PNG.sync.write(new PNG({ width: 1, height: 1 }));
  try {
    const fixtures = ["Player.lmale.png", "vehicle_air_scout.png"];
    for (const name of ["SilverBlue", "RainbowNeon"]) {
      fixtures.push(
        ...[1, 2, 3].map((n) => `${name}/vehicle_air_bomber${n}.png`),
      );
    }
    fixtures.push("CompleteHavoc/vehicle_air_bomber1.png");
    fixtures.push(
      ...[1, 2, 3].map((n) => `CompleteHavoc/vehicle_air_hpc${n}.png`),
    );
    for (const file of fixtures) {
      const destination = path.join(dir, "docs/skins", file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, png);
    }
    process.chdir(dir);

    const models = await findModelSkins();
    for (const name of ["SilverBlue", "RainbowNeon"]) {
      assert.ok(models.get("vehicle_air_bomber").has(name));
      assert.equal(models.get("vehicle_air_hapc").has(name), false);
    }
    assert.ok(models.get("vehicle_air_hapc").has("CompleteHavoc"));
    assert.ok(models.get("lmale").has("Player"));
    assert.equal(models.get("vehicle_air_scout").size, 0);

    const diagnosticModels = await findModelSkins({ includeIncomplete: true });
    for (const name of ["SilverBlue", "RainbowNeon"]) {
      assert.equal(
        diagnosticModels.get("vehicle_air_hapc").get(name).isComplete,
        false,
      );
    }
    assert.ok(diagnosticModels.get("vehicle_air_scout").has(null));
  } finally {
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("discovery refuses a missing, invalid or empty skin directory", async () => {
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-skin-discovery-"));
  try {
    process.chdir(dir);
    await assert.rejects(findModelSkins(), { code: "ENOENT" });
    await fs.mkdir("docs");
    await fs.writeFile("docs/skins", "not a directory");
    await assert.rejects(findModelSkins(), /Expected a directory/);
    await fs.rm("docs/skins");
    await fs.mkdir("docs/skins");
    await assert.rejects(findModelSkins(), /No PNG skins found/);
  } finally {
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("uppercase PNG extensions are discovered and resized without overwriting originals", async () => {
  const cwd = process.cwd();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-skin-discovery-"));
  const original = PNG.sync.write(new PNG({ width: 1024, height: 1024 }));
  try {
    process.chdir(dir);
    await fs.mkdir("docs/skins", { recursive: true });
    await fs.writeFile("docs/skins/Upper.lmale.PNG", original);
    await fs.writeFile("docs/skins/Mixed.lmale.PnG", original);
    const models = await findModelSkins();
    for (const [name, extension] of [
      ["Upper", "PNG"],
      ["Mixed", "PnG"],
    ]) {
      assert.ok(models.get("lmale").has(name));
      assert.deepEqual(
        await fs.readFile(`docs/skins/${name}.lmale.${extension}`),
        original,
      );
      const resized = PNG.sync.read(
        await fs.readFile(`docs/skins/${name}.lmale@1x.png`),
      );
      assert.equal(resized.width, 512);
      assert.equal(resized.height, 512);
    }
  } finally {
    process.chdir(cwd);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
