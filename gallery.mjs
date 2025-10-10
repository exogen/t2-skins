import fs from "fs";
import { globby } from "globby";
import puppeteer from "puppeteer";
import { fileArrayToModels } from "./modelData.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const browser = await puppeteer.launch();
const page = await browser.newPage();

await page.goto("https://exogen.github.io/t2-model-skinner/", {
  waitUntil: "load",
});

await page.waitForNetworkIdle({ idleTime: 2000 });

await page.setViewport({ width: 680, height: 800 });

const modelSelector = await page.waitForSelector("#ModelSelect");
const fileInput = await page.waitForSelector(
  '#SkinSelect ~ input[type="file"]'
);

const outputType = "webp";

async function findModelSkins() {
  const skinPaths = await globby(`./docs/skins/**/*.png`);

  const foundModels = fileArrayToModels(skinPaths, (path) => {
    const parts = path.split("/");
    if (parts.length === 4) {
      return null;
    } else {
      return parts[3];
    }
  });

  return foundModels;
}

const foundModelSkins = await findModelSkins();

for (const [modelName, skinsByName] of foundModelSkins.entries()) {
  for (const [skinName, skin] of skinsByName.entries()) {
    if (skinName && skin.isComplete) {
      const outputPath = `./docs/gallery/${skinName}.${modelName}.${outputType}`;
      if (fs.existsSync(outputPath)) {
        console.log(`${outputPath} (skipped)`);
      } else {
        console.log(outputPath);
        const paths = Array.from(skin.files.values()).flat();
        await modelSelector.select(modelName);
        await sleep(1000);
        const modelViewer = await page.waitForSelector("model-viewer");
        await modelViewer.evaluate((node) => {
          node.setAttribute("interaction-prompt", "none");
        });
        await fileInput.uploadFile(...paths);
        await sleep(1000);
        await modelViewer.screenshot({
          path: outputPath,
          type: outputType,
          quality: 75,
        });
      }
    }
  }
}

await browser.close();
