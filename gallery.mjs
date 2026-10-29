import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import puppeteer from "puppeteer";
import { findModelSkins } from "./modelData.mjs";
import { captureSize, captureUrl, planGallery, captureSkin, writeCapture, runGalleryWorkers } from "./galleryCapture.mjs";

const { values } = parseArgs({ options: {
  force: { type: "boolean", default: false },
  url: { type: "string", default: "https://skins.tribes2.online/" },
  output: { type: "string", default: "./docs/gallery" },
  model: { type: "string", multiple: true, default: [] },
  skin: { type: "string", multiple: true, default: [] },
  limit: { type: "string" },
  concurrency: { type: "string", default: "1" },
  "camera-config": { type: "string" },
  help: { type: "boolean", short: "h" },
} });
if (values.help) {
  console.log(`Usage: npm run gallery -- [options]
  --force               Replace existing previews (regenerate all skins)
  --url URL             Skinner main page, including a local dev server
  --output DIR          Preview directory (default: ./docs/gallery)
  --model MODEL         Only this model; may be repeated
  --skin NAME           Only this exact skin name; may be repeated
  --limit COUNT         Generate at most COUNT previews
  --concurrency COUNT   Number of parallel browser workers (default: 1)
  --camera-config FILE  JSON camera overrides keyed by model

Examples:
  npm run gallery -- --force
  npm run gallery -- --force --concurrency 4
  npm run gallery -- --force --url http://localhost:3001/
  npm run gallery -- --model mine --limit 1 --output /tmp/gallery-test`);
  process.exit(0);
}
const limit = values.limit == null ? Infinity : Number(values.limit);
if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1)) throw new Error("--limit must be a positive integer.");
const concurrency = Number(values.concurrency);
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("--concurrency must be a positive integer.");
const cameras = values["camera-config"] ? JSON.parse(await fs.readFile(values["camera-config"], "utf8")) : {};
if (cameras == null || typeof cameras !== "object" || Array.isArray(cameras)) throw new Error("Camera configuration must be an object keyed by model.");
const foundModelSkins = await findModelSkins();
const { jobs, skipped } = await planGallery(foundModelSkins, {
  output: values.output, force: values.force, models: values.model, skins: values.skin, limit,
});
console.log(`${jobs.length} previews to generate; ${skipped} existing previews skipped${values.force ? " (force enabled)" : ""}.`);
if (!jobs.length) process.exit(0);
const workerCount = Math.min(concurrency, jobs.length);
const url = captureUrl(values.url);
console.log(`Using ${workerCount} browser worker${workerCount === 1 ? "" : "s"}.`);

async function loadCapturePage(page) {
  await page.goto(url, { waitUntil: "load" });
  try { await page.waitForFunction(() => window.t2SkinnerCapture?.version === 1); }
  catch { throw new Error("This skinner does not expose the capture interface. Deploy the updated skinner first, or use --url http://localhost:3001/ with the updated local app."); }
}

let written = 0;
const browser = await puppeteer.launch();
try {
  await runGalleryWorkers(jobs, concurrency, async (workerIndex) => {
    // Contexts isolate each viewer and keep its page active without extra browsers.
    const context = await browser.createBrowserContext();
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(60000);
      await page.setViewport(captureSize);
      console.log(`[Worker ${workerIndex + 1}] Loading ${url}`);
      await loadCapturePage(page);
      return {
        async capture(job, index, completed) {
          // Release this worker's cached imports periodically during full rebuilds.
          if (completed > 0 && completed % 50 === 0) await loadCapturePage(page);
          console.log(`[${index + 1}/${jobs.length}] [Worker ${workerIndex + 1}] ${job.outputPath}`);
          try {
            const result = await captureSkin(page, job, cameras[job.model], async () => {
              console.warn(`[Worker ${workerIndex + 1}] Page navigated during ${job.name}; reloading and retrying.`);
              await loadCapturePage(page);
            });
            const bytes = Buffer.from(result.dataUrl.split(",")[1], "base64");
            await writeCapture(job.outputPath, bytes);
            written++;
          } catch (error) {
            throw new Error(`Could not capture ${job.name} (${job.model}): ${error.message}`, { cause: error });
          }
        },
        close: () => context.close(),
      };
    } catch (error) {
      await context.close();
      throw error;
    }
  });
} finally { await browser.close(); }
console.log(`Saved ${written} transparent previews.`);
