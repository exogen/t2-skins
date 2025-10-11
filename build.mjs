import fs from "fs";
import { globby } from "globby";
import orderBy from "lodash.orderby";
import { allModels, fileArrayToModels } from "./modelData.mjs";

const ONE_DAY = 1000 * 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;
const NINE_MONTHS = THIRTY_DAYS * 9;

const nineMonthsAgo = Date.now() - NINE_MONTHS;

async function getSkinManifest() {
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
  };
}

async function buildSkinManifest() {
  const manifest = await getSkinManifest();
  const json = JSON.stringify(manifest);
  fs.writeFileSync(`./docs/skins.json`, json, "utf8");
}

buildSkinManifest();
