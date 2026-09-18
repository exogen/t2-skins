import fs from "fs";
import path from "path";
import orderBy from "lodash.orderby";
import { parseArgs } from "util";
import { allModels, findModelSkins } from "./modelData.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pack: {
      type: "string",
    },
    delete: {
      type: "boolean",
    },
    debug: {
      type: "boolean",
    },
  },
});

const ONE_DAY = 1000 * 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;
const NEW_CUTOFF = THIRTY_DAYS * 3;

const newCutoffDate = Date.now() - NEW_CUTOFF;

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
      sizeMultiplier: {},
    };
  }

  const foundModels = await findModelSkins({
    readModificationDate: true,
    includeIncomplete: values.debug,
  });

  if (values.debug) {
    const allSkins = [];
    foundModels.forEach((skinsByName, modelName) => {
      skinsByName.forEach((skin, skinName) => {
        allSkins.push({
          model: modelName,
          skin: skinName,
          dateFirstSeen: skin.dateFirstSeen,
          isComplete: skin.isComplete,
        });
      });
    });
    allSkins.sort(
      (a, b) =>
        (a.dateFirstSeen?.getTime() ?? 0) - (b.dateFirstSeen?.getTime() ?? 0),
    );
    for (const s of allSkins) {
      const date = s.dateFirstSeen
        ? s.dateFirstSeen.toISOString().slice(0, 10)
        : "NO DATE";
      const isNew =
        !s.dateFirstSeen || s.dateFirstSeen.getTime() > newCutoffDate;
      console.log(
        `${date}  ${isNew ? "NEW" : "   "}  ${s.model}/${s.skin}${s.isComplete ? "" : " (incomplete)"}`,
      );
    }
    process.exit(0);
  }

  const oldPacks = previousManifest.packs ?? {};
  const newPacks = {};
  for (const oldPackName in oldPacks) {
    const oldPack = oldPacks[oldPackName];
    const newPack = { skins: {} };
    for (const modelName in oldPack.skins) {
      const modelSkins = foundModels.get(modelName) ?? new Map();
      const skinsThatStillExist = oldPack.skins[modelName].filter((skinName) =>
        modelSkins.has(skinName),
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
          const allFiles = new Set(
            Array.from(skin.files.values())
              .flat()
              .map((filePath) => path.resolve(filePath)),
          );
          if (inputFiles.some((inputFile) => allFiles.has(inputFile))) {
            const previousSkins = newPack.skins[modelName] ?? [];
            if (!previousSkins.includes(skinName)) {
              newPack.skins[modelName] = orderBy(
                [...previousSkins, skinName],
                (name) => name.toLowerCase(),
                ["asc"],
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
            .map((filePath) => path.relative("./docs/skins", filePath)),
        );
      })
      .flat(Infinity)
      .sort();

    if (oldPack?.version) {
      newPack.version = oldPack.version;
      if (JSON.stringify(oldPack) !== JSON.stringify(newPack)) {
        newPack.version = `${parseInt(oldPack.version, 10) + 1}`;
        console.log(
          `[${packName}] Existing pack has changed content, bumping version number.`,
        );
      } else {
        console.log(
          `[${packName}] Existing pack has not changed, keeping version number.`,
        );
      }
    } else {
      newPack.version = "1";
      console.log(`[${packName}] First version of pack, starting at 1.`);
    }
  }

  const sizeMultiplier = {};

  foundModels.forEach((modelSkins, modelName) => {
    modelSkins.forEach((skin, skinName) => {
      if (skin.sizeMultiplier.size) {
        skin.sizeMultiplier.forEach((multiplier, relativePath) => {
          sizeMultiplier[relativePath] = multiplier;
        });
      }
    });
  });

  const customSkins = {};
  const newSkins = {};
  for (const name of allModels) {
    const modelSkins = foundModels.get(name) ?? new Map();
    customSkins[name] = orderBy(
      [...modelSkins.keys()],
      [(name) => name.toLowerCase()],
      ["asc"],
    );
    newSkins[name] = customSkins[name].filter((skinName) => {
      const { dateFirstSeen } = modelSkins.get(skinName);
      return !dateFirstSeen || dateFirstSeen.getTime() > newCutoffDate;
    });
  }

  return {
    customSkins,
    newSkins,
    packs: newPacks,
    sizeMultiplier,
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
