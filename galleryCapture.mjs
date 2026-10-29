import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const captureSize = { width: 680, height: 800, deviceScaleFactor: 1 };

export function captureUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.searchParams.set("capture", "1");
  return url.href;
}

export async function planGallery(foundModels, { output, force = false, models = [], skins = [], limit = Infinity }) {
  for (const model of models) if (!foundModels.has(model)) throw new Error(`No skins found for model: ${model}`);
  for (const name of skins) if (![...foundModels.values()].some((names) => names.has(name))) throw new Error(`No skin found named: ${name}`);
  const jobs = [];
  let skipped = 0;
  for (const [model, names] of foundModels) {
    if (models.length && !models.includes(model)) continue;
    for (const [name, skin] of names) {
      if (skins.length && !skins.includes(name)) continue;
      const outputPath = path.resolve(output, `${name}.${model}.webp`);
      if (!force && await fs.stat(outputPath).then(() => true, (error) => { if (error.code === "ENOENT") return false; throw error; })) {
        skipped++;
        continue;
      }
      if (jobs.length < limit) jobs.push({ model, name, files: [...new Set([...skin.files.values()].flat())].map((file) => path.resolve(file)), outputPath });
    }
  }
  return { jobs, skipped };
}

export async function writeCapture(outputPath, bytes) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const temporary = `${outputPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: "wx" });
    await fs.rename(temporary, outputPath);
    return true;
  } finally { await fs.rm(temporary, { force: true }); }
}

export async function runGalleryWorkers(jobs, concurrency, openWorker) {
  let next = 0;
  let failure;
  async function run(workerIndex) {
    let worker;
    try {
      worker = await openWorker(workerIndex);
      let completed = 0;
      while (!failure && next < jobs.length) {
        const index = next++;
        await worker.capture(jobs[index], index, completed);
        completed++;
      }
    } catch (error) {
      failure ??= error;
    } finally {
      if (worker) {
        try { await worker.close(); }
        catch (error) { failure ??= error; }
      }
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(concurrency, jobs.length) },
    (_, index) => run(index),
  ));
  if (failure) throw failure;
}

export async function captureSkin(page, job, camera, reloadPage) {
  try {
    return await captureLoadedSkin(page, job, camera);
  } catch (error) {
    if (!reloadPage || !error.message.includes("Execution context was destroyed")) throw error;
    await reloadPage();
    return captureLoadedSkin(page, job, camera);
  }
}

async function captureLoadedSkin(page, job, camera) {
  await page.evaluate((model) => window.t2SkinnerCapture.selectModel(model), job.model);
  await page.waitForFunction((model) => window.t2SkinnerCapture?.getState().model === model, {}, job.model);
  const before = await page.evaluate(() => window.t2SkinnerCapture.getState().revision);
  const input = await page.waitForSelector("input[data-capture-files]");
  try {
    await input.uploadFile(...job.files);
    await page.evaluate(() => window.t2SkinnerCapture.importFiles(Array.from(document.querySelector("input[data-capture-files]").files)));
  } finally { await input.dispose(); }
  await page.waitForFunction((revision, model) => {
    const state = window.t2SkinnerCapture?.getState();
    return state && state.revision !== revision && state.model === model && state.skinType === "import";
  }, {}, before, job.model);
  const revision = await page.evaluate(() => window.t2SkinnerCapture.getState().revision);
  return page.evaluate((options) => window.t2SkinnerCapture.exportImage(options), {
    revision, model: job.model, type: "image/webp", quality: 0.75, trim: false,
    camera: camera && Object.fromEntries(Object.entries(camera).filter(([key, value]) => ["orbit", "target", "fov"].includes(key) && value != null)),
    fitCurrentPose: camera?.fitCurrentPose,
  });
}
