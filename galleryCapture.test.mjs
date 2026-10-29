import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { captureUrl, planGallery, writeCapture, runGalleryWorkers, captureSkin } from "./galleryCapture.mjs";

const catalog = new Map([
  ["lmale", new Map([["Same name", { files: new Map([["base", ["one.png"]]]) }]])],
  ["disc", new Map([["Same name", { files: new Map([["weapon", ["two.png", "two.png"]]]) }]])],
]);

async function temporary(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-test-"));
  try { await run(directory); } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

test("capture mode preserves a deployment base path and existing query parameters", () => {
  const url = new URL(captureUrl("https://example.test/t2-model-skinner/?m=disc"));
  assert.equal(url.pathname, "/t2-model-skinner/");
  assert.equal(url.searchParams.get("capture"), "1");
  assert.equal(url.searchParams.get("m"), "disc");
});

test("normal generation skips existing images; force plans every skin", () => temporary(async (output) => {
  const existing = path.join(output, "Same name.lmale.webp");
  await fs.writeFile(existing, "old opaque image");
  const ordinary = await planGallery(catalog, { output });
  assert.equal(ordinary.skipped, 1);
  assert.deepEqual(ordinary.jobs.map((job) => job.model), ["disc"]);
  const forced = await planGallery(catalog, { output, force: true });
  assert.equal(forced.skipped, 0);
  assert.deepEqual(forced.jobs.map((job) => job.model), ["lmale", "disc"]);
  assert.equal(await fs.readFile(existing, "utf8"), "old opaque image");
  assert.equal(forced.jobs[1].files.length, 1);
}));

test("filters keep identically named skins on their requested model", () => temporary(async (output) => {
  const plan = await planGallery(catalog, { output, models: ["disc"], skins: ["Same name"], limit: 1 });
  assert.equal(plan.jobs.length, 1);
  assert.equal(plan.jobs[0].model, "disc");
  await assert.rejects(planGallery(catalog, { output, models: ["typo"] }), /No skins found/);
}));

test("writing replaces a preview without leaving a partial output", () => temporary(async (output) => {
  const file = path.join(output, "preview.webp");
  await fs.writeFile(file, "existing");
  assert.equal(await writeCapture(file, Buffer.from("transparent")), true);
  assert.equal(await fs.readFile(file, "utf8"), "transparent");
  assert.deepEqual(await fs.readdir(output), ["preview.webp"]);
}));

for (const concurrency of [1, 3]) {
  test(`workers process every job once with concurrency ${concurrency}`, async () => {
    const gate = Promise.withResolvers();
    const started = Promise.withResolvers();
    const seen = [];
    const closed = [];
    const completedByWorker = new Map();
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 7 }, (_, index) => index);
    const running = runGalleryWorkers(jobs, concurrency, async (worker) => ({
      async capture(job, index, completed) {
        assert.equal(index, job);
        assert.equal(completed, completedByWorker.get(worker) ?? 0);
        completedByWorker.set(worker, completed + 1);
        seen.push(job);
        active++;
        peak = Math.max(peak, active);
        if (seen.length === concurrency) started.resolve();
        await gate.promise;
        active--;
      },
      async close() { closed.push(worker); },
    }));
    await started.promise;
    assert.equal(active, concurrency);
    gate.resolve();
    await running;
    assert.equal(peak, concurrency);
    assert.deepEqual(seen.toSorted((a, b) => a - b), jobs);
    assert.deepEqual(closed.toSorted(), Array.from({ length: concurrency }, (_, index) => index));
  });
}

test("a failed worker stops new jobs and closes workers after active work finishes", async () => {
  const bothStarted = Promise.withResolvers();
  const failedWorkerClosed = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const seen = [];
  const closed = [];
  const running = runGalleryWorkers([0, 1, 2, 3], 2, async (worker) => ({
    async capture(job) {
      seen.push(job);
      if (seen.length === 2) bothStarted.resolve();
      await bothStarted.promise;
      if (job === 0) throw new Error("capture failed");
      await finish.promise;
    },
    async close() {
      closed.push(worker);
      if (worker === 0) failedWorkerClosed.resolve();
    },
  }));
  const failure = assert.rejects(running, /capture failed/);
  await failedWorkerClosed.promise;
  assert.deepEqual(closed, [0]);
  finish.resolve();
  await failure;
  assert.deepEqual(seen, [0, 1]);
  assert.deepEqual(closed, [0, 1]);
});

test("startup failures still close other workers", async () => {
  const closed = [];
  await assert.rejects(runGalleryWorkers([0, 1], 2, async (worker) => {
    if (worker === 0) throw new Error("browser could not start");
    return { async capture() {}, async close() { closed.push(worker); } };
  }), /browser could not start/);
  assert.deepEqual(closed, [1]);
});

test("only workers needed by the job count are opened", async () => {
  const opened = [];
  const open = async (worker) => {
    opened.push(worker);
    return { async capture() {}, async close() {} };
  };
  await runGalleryWorkers([], 4, open);
  assert.deepEqual(opened, []);
  await runGalleryWorkers(["one preview"], 4, open);
  assert.deepEqual(opened, [0]);
});

test("navigation recovery imports the skin again with a fresh file input", async () => {
  let evaluations = 0, uploads = 0, disposed = 0, reloads = 0;
  const page = {
    async evaluate() {
      evaluations++;
      // Lose the document while the first import is awaiting its result.
      if (evaluations === 3) throw new Error("Execution context was destroyed, most likely because of a navigation.");
      return "capture result";
    },
    async waitForFunction() {},
    async waitForSelector() {
      return { async uploadFile() { uploads++; }, async dispose() { disposed++; } };
    },
  };
  const result = await captureSkin(page, { model: "mmale", files: ["Skelebro.mmale.png"] }, undefined, async () => { reloads++; });
  assert.equal(result, "capture result");
  assert.equal(reloads, 1);
  assert.equal(uploads, 2);
  assert.equal(disposed, 2);
});

test("navigation recovery is bounded and does not retry skin failures", async () => {
  let reloads = 0, attempts = 0;
  const page = { async evaluate() { attempts++; throw new Error("Execution context was destroyed"); } };
  const reload = async () => { reloads++; };
  await assert.rejects(captureSkin(page, { model: "mmale" }, undefined, reload), /Execution context was destroyed/);
  assert.equal(attempts, 2);
  assert.equal(reloads, 1);
  page.evaluate = async () => { throw new Error("Unable to load skin texture"); };
  await assert.rejects(captureSkin(page, { model: "mmale" }, undefined, reload), /Unable to load skin texture/);
  assert.equal(reloads, 1);
});
