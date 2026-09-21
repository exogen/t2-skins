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

  const outputType = "webp";

  for (const [modelName, skinsByName] of foundModelSkins.entries()) {
    for (const [skinName, skin] of skinsByName.entries()) {
      const outputPath = `./docs/gallery/${skinName}.${modelName}.${outputType}`;
      if (fs.existsSync(outputPath)) {
        console.log(`${outputPath} (skipped)`);
      } else {
        console.log(outputPath);
        const paths = Array.from(skin.files.values()).flat();
        // Model and skin changes remount the editor's controls.
        const modelSelector = await page.waitForSelector("#ModelSelect");
        await modelSelector.select(modelName);
        await modelSelector.dispose();
        await page.waitForNetworkIdle({ idleTime: 2000 });
        await sleep(500);
        const fileInput = await page.waitForSelector(
          '#SkinSelect ~ input[type="file"]',
        );
        await fileInput.uploadFile(...paths);
        await fileInput.dispose();
        await page.waitForFunction(
          (modelName, skinName) => {
            const error = document.querySelector('[role="alert"]');
            if (error) throw new Error(error.textContent);
            const viewer = document.querySelector("model-viewer");
            const actualModel = modelName === "hfemale" ? "hmale" : modelName;
            return (
              document.querySelector("#ModelSelect")?.value === modelName &&
              document.querySelector("#SkinSelect")?.value ===
                `import/${skinName}` &&
              viewer?.loaded &&
              viewer.src?.endsWith(`/${actualModel}.glb`)
            );
          },
          {},
          modelName,
          skinName,
        );
        await page.waitForNetworkIdle({ idleTime: 2000 });
        await sleep(1000);
        const modelViewer = await page.waitForSelector("model-viewer");
        await modelViewer.evaluate(async (node) => {
          node.setAttribute("interaction-prompt", "none");
          await node.updateComplete;
        });
        await modelViewer.screenshot({
          path: outputPath,
          type: outputType,
          quality: 75,
        });
        await modelViewer.dispose();
      }
    }
  }
} finally {
  await browser.close();
}
