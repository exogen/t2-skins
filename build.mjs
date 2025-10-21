import fs from "fs";
import path from "path";
import { globby } from "globby";
import orderBy from "lodash.orderby";
import { parseArgs } from "util";
import { allModels, fileArrayToModels } from "./modelData.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pack: {
      type: "string",
    },
    delete: {
      type: "boolean",
    },
  },
});

const ONE_DAY = 1000 * 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;
const NINE_MONTHS = THIRTY_DAYS * 9;

const nineMonthsAgo = Date.now() - NINE_MONTHS;

async function getSkinManifest({
  packName = null,
  deletePack = false,
  inputFiles = [],
}) {
  let previousManifest;
  try {
    previousManifest = JSON.parse(fs.readFileSync("./docs/skins.json", "utf8"));
  } catch (err) {
    previousManifest = {
      customSkins: {},
      newSkins: {},
      packs: {},
    };
  }

  const skinPaths = await globby(`./docs/skins/**/*.png`);

  const foundModels = fileArrayToModels(
    skinPaths,
    (path) => {
      const parts = path.split("/");
      if (parts.length === 4) {
        return null;
      } else {
        return parts[3];
      }
    },
    {
      readModificationDate: true,
    }
  );

  const oldPacks = previousManifest.packs ?? {};
  const newPacks = {};
  for (const oldPackName in oldPacks) {
    const oldPack = oldPacks[oldPackName];
    const newPack = { skins: {} };
    for (const modelName in oldPack.skins) {
      const modelSkins = foundModels.get(modelName) ?? new Map();
      const skinsThatStillExist = oldPack.skins[modelName].filter(
        (skinName) => modelSkins.get(skinName)?.isComplete
      );
      if (skinsThatStillExist.length) {
        newPack.skins[modelName] = skinsThatStillExist;
        newPacks[oldPackName] = newPack;
      }
    }
  }

  if (packName) {
    if (deletePack) {
      delete newPacks[packName];
    } else {
      const newPack = newPacks[packName] ?? { skins: {} };
      for (const modelName of foundModels.keys()) {
        const modelSkins = foundModels.get(modelName) ?? new Map();
        for (const skinName of modelSkins.keys()) {
          const skin = modelSkins.get(skinName);
          if (!skin.isComplete) {
            continue;
          }
          const allFiles = new Set(
            Array.from(skin.files.values())
              .flat()
              .map((filePath) => path.resolve(filePath))
          );
          if (inputFiles.some((inputFile) => allFiles.has(inputFile))) {
            const previousSkins = newPack.skins[modelName] ?? [];
            if (!previousSkins.includes(skinName)) {
              newPack.skins[modelName] = orderBy(
                [...previousSkins, skinName],
                (name) => name.toLowerCase(),
                ["asc"]
              );
              newPacks[packName] = newPack;
            }
          }
        }
      }
    }
  }

  for (const packName in newPacks) {
    const newPack = newPacks[packName];
    const oldPack = oldPacks[packName];

    newPack.files = Object.entries(newPack.skins)
      .map(([modelName, modelSkins]) => {
        return modelSkins.map((skinName) =>
          Array.from(foundModels.get(modelName).get(skinName).files.values())
            .flat()
            .map((filePath) => path.relative("./docs/skins", filePath))
        );
      })
      .flat(Infinity)
      .sort();

    if (oldPack?.version) {
      newPack.version = oldPack.version;
      if (JSON.stringify(oldPack) !== JSON.stringify(newPack)) {
        newPack.version = `${parseInt(oldPack.version, 10) + 1}`;
        console.log(
          `[${packName}] Existing pack has changed content, bumping version number.`
        );
      } else {
        console.log(
          `[${packName}] Existing pack has not changed, keeping version number.`
        );
      }
    } else {
      newPack.version = "1";
      console.log(`[${packName}] First version of pack, starting at 1.`);
    }
  }

  return {
    customSkins: allModels.reduce((skins, name, i) => {
      const modelSkins = foundModels.get(name) ?? new Map();
      skins[name] = orderBy(
        [...modelSkins.keys()].filter(
          (skinName) => modelSkins.get(skinName).isComplete
        ),
        [(name) => name.toLowerCase()],
        ["asc"]
      );
      return skins;
    }, {}),
    newSkins: allModels.reduce((skins, name, i) => {
      const modelSkins = foundModels.get(name) ?? new Map();
      skins[name] = orderBy(
        [...modelSkins.keys()].filter(
          (skinName) =>
            !modelSkins.get(skinName).dateFirstSeen ||
            modelSkins.get(skinName).dateFirstSeen.getTime() > nineMonthsAgo
        ),
        [(name) => name.toLowerCase()],
        ["asc"]
      );
      return skins;
    }, {}),
    packs: newPacks,
  };
}

async function buildSkinManifest() {
  const manifest = await getSkinManifest({
    packName: values.pack,
    inputFiles: positionals.map((filePath) => path.resolve(filePath)),
    deletePack: values.delete,
  });
  const json = JSON.stringify(manifest);
  fs.writeFileSync(`./docs/skins.json`, json, "utf8");
}

buildSkinManifest();
