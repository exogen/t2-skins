import fs from "fs";
import { globby } from "globby";
import orderBy from "lodash.orderby";

const ONE_DAY = 1000 * 60 * 60 * 24;
const THIRTY_DAYS = ONE_DAY * 30;
const NINE_MONTHS = THIRTY_DAYS * 9;

const nineMonthsAgo = Date.now() - NINE_MONTHS;

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

async function getSkinManifest() {
  const [customSkins, customWeaponSkins] = await Promise.all([
    Promise.all(
      models.map((name) => globby(`${T2_SKINS_PATH}/docs/skins/*.${name}.png`))
    ),
    Promise.all(
      weaponModels.map((name) =>
        globby(`${T2_SKINS_PATH}/docs/skins/*/weapon_${name}.png`)
      )
    ),
  ]);

  return {
    customSkins: {
      ...models.reduce((skins, name, i) => {
        skins[name] = orderBy(
          customSkins[i].map((name) =>
            name.replace(/(^.*\/|\.[lmh](male|female|bioderm)\.png$)/g, "")
          ),
          [(name) => name.toLowerCase()],
          ["asc"]
        );
        return skins;
      }, {}),
      ...weaponModels.reduce((skins, name, i) => {
        skins[name] = orderBy(
          customWeaponSkins[i].map((name) => {
            const match = name.match(/\/([^/]+)\/weapon_\w+\.png$/);
            return match[1];
          }),
          [(name) => name.toLowerCase()],
          ["asc"]
        );
        return skins;
      }, {}),
    },
    newSkins: {
      ...models.reduce((skins, name, i) => {
        skins[name] = orderBy(
          customSkins[i]
            .map((filename) => {
              const dateModified = fs.statSync(filename).mtime;
              return {
                filename,
                dateModified,
              };
            })
            .filter((details) => details.dateModified.getTime() > nineMonthsAgo)
            .map((details) =>
              details.filename.replace(
                /(^.*\/|\.[lmh](male|female|bioderm)\.png$)/g,
                ""
              )
            ),
          [(name) => name.toLowerCase()],
          ["asc"]
        );
        return skins;
      }, {}),
      ...weaponModels.reduce((skins, name, i) => {
        skins[name] = orderBy(
          customWeaponSkins[i]
            .map((filename) => {
              const dateModified = fs.statSync(filename).mtime;
              return {
                filename,
                dateModified,
              };
            })
            .filter((details) => details.dateModified.getTime() > nineMonthsAgo)
            .map(
              (details) =>
                details.filename.match(/\/([^/]+)\/weapon_\w+\.png$/)[1]
            ),
          [(name) => name.toLowerCase()],
          ["asc"]
        );
        return skins;
      }, {}),
    },
  };
}

async function buildSkinManifest() {
  const manifest = await getSkinManifest();
  const json = JSON.stringify(manifest);
  fs.writeFileSync(`${T2_SKINS_PATH}/docs/skins.json`, json, "utf8");
}

buildSkinManifest();
