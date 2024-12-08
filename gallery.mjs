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

const weaponModels = [
  "chaingun",
  "disc",
  "elf",
  "energy",
  "grenade_launcher",
  "missile",
  "mortar",
  "plasmathrower",
  "repair",
  "shocklance",
  "sniper",
  "targeting",
];

const T2_SKINS_PATH = ".";

const customSkins = await Promise.all(
  models.map((name) => globby(`${T2_SKINS_PATH}/docs/skins/*.${name}.png`))
);

const customWeaponSkins = await Promise.all(
  weaponModels.map((name) =>
    globby(`${T2_SKINS_PATH}/docs/skins/*/weapon_${name}.png`)
  )
);

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

const allModels = [...models, ...weaponModels];
const allCustomSkins = [...customSkins, ...customWeaponSkins];

for (let i = 0; i < allCustomSkins.length; i++) {
  const modelName = allModels[i];
  const modelSkins = allCustomSkins[i];
  if (modelSkins.length) {
    await modelSelector.select(modelName);
    await sleep(1000);
    const modelViewer = await page.waitForSelector("model-viewer");
    await modelViewer.evaluate((node) => {
      node.setAttribute("interaction-prompt", "none");
    });
    for (const skinPath of modelSkins) {
      const outputPath = models.includes(modelName)
        ? skinPath
            .replace(/\/skins\//, "/gallery/")
            .replace(/\.png$/, `.${outputType}`)
        : skinPath
            .replace(/\/skins\//, "/gallery/")
            .replace(/\/weapon_/, ".")
            .replace(/\.png$/, `.${outputType}`);

      if (fs.existsSync(outputPath)) {
        console.log(`${skinPath} (skipped)`);
      } else {
        console.log(skinPath);
        await fileInput.uploadFile(skinPath);
        await sleep(250);
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
