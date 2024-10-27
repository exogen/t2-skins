import fs from "fs";
import { globby } from "globby";
import puppeteer from "puppeteer";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const models = [
  "lmale",
  "mmale",
  "hmale",
  "lfemale",
  "mfemale",
  "hfemale",
  "lbioderm",
  "mbioderm",
  "hbioderm",
];

const T2_SKINS_PATH = ".";

const customSkins = await Promise.all(
  models.map((name) => globby(`${T2_SKINS_PATH}/docs/skins/*.${name}.png`))
);

const browser = await puppeteer.launch();
const page = await browser.newPage();

await page.goto("https://exogen.github.io/t2-model-skinner/", {
  waitUntil: "load",
});

await page.waitForNetworkIdle({ idleTime: 2000 });

await page.setViewport({ width: 800, height: 1600 });

const modelSelector = await page.waitForSelector("#ModelSelect");
const fileInput = await page.waitForSelector(
  '#SkinSelect ~ input[type="file"]'
);

const outputType = "webp";

for (let i = 0; i < customSkins.length; i++) {
  const modelName = models[i];
  const modelSkins = customSkins[i];
  if (modelSkins.length) {
    await modelSelector.select(modelName);
    await sleep(1000);
    const modelViewer = await page.waitForSelector("model-viewer");
    await modelViewer.evaluate((node) => {
      node.setAttribute("interaction-prompt", "none");
    });
    for (const skinPath of modelSkins) {
      const outputPath = skinPath
        .replace(/\/skins\//, "/gallery/")
        .replace(/\.png$/, `.${outputType}`);
      if (fs.existsSync(outputPath)) {
        console.log(`${skinPath} (skipped)`);
      } else {
        console.log(skinPath);
        await fileInput.uploadFile(skinPath);
        await sleep(250);
        await await modelViewer.screenshot({
          path: outputPath,
          type: outputType,
          quality: 75,
        });
      }
    }
  }
}

await browser.close();
