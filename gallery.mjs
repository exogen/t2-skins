import fs from "fs";
import { setTimeout as sleep } from "node:timers/promises";
import puppeteer from "puppeteer";
import { findModelSkins } from "./modelData.mjs";

const foundModelSkins = await findModelSkins();
const browser = await puppeteer.launch();
try {
  const page = await browser.newPage();

  await page.goto("https://exogen.github.io/t2-model-skinner/", {
    waitUntil: "load",
  });

  await page.waitForNetworkIdle({ idleTime: 2000 });

  await page.setViewport({ width: 680, height: 800 });

  const modelSelector = await page.waitForSelector("#ModelSelect");
  const fileInput = await page.waitForSelector(
    '#SkinSelect ~ input[type="file"]',
  );

  const outputType = "webp";

  for (const [modelName, skinsByName] of foundModelSkins.entries()) {
    for (const [skinName, skin] of skinsByName.entries()) {
      const outputPath = `./docs/gallery/${skinName}.${modelName}.${outputType}`;
      if (fs.existsSync(outputPath)) {
        console.log(`${outputPath} (skipped)`);
      } else {
        console.log(outputPath);
        const paths = Array.from(skin.files.values()).flat();
        await modelSelector.select(modelName);
        await page.waitForNetworkIdle({ idleTime: 2000 });
        await sleep(500);
        const modelViewer = await page.waitForSelector("model-viewer");
        await modelViewer.evaluate((node) => {
          node.setAttribute("interaction-prompt", "none");
        });
        await fileInput.uploadFile(...paths);
        await page.waitForNetworkIdle({ idleTime: 2000 });
        await sleep(1000);
        await modelViewer.evaluate(async (node) => {
          await node.updateComplete;
        });
        await modelViewer.screenshot({
          path: outputPath,
          type: outputType,
          quality: 75,
        });
      }
    }
  }
} finally {
  await browser.close();
}
