import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import probe from "probe-image-size";

const defaultTextureSize = [512, 512];

export const playerModels = [
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

export const weaponModels = [
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

export const vehicleModels = [
  "vehicle_grav_scout",
  "vehicle_grav_tank",
  "turret_assaulttank_mortar",
  "vehicle_land_mpbbase",
  "vehicle_air_scout",
  "vehicle_air_bomber",
  "vehicle_air_hapc",
];

export const allModels = [...playerModels, ...weaponModels, ...vehicleModels];

export const modelMaterials = {
  lmale: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".lmale",
    },
  ],
  mmale: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".mmale",
    },
  ],
  hmale: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".hmale",
    },
  ],
  lfemale: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".lfemale",
    },
  ],
  mfemale: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".mfemale",
    },
  ],
  lbioderm: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".lbioderm",
    },
  ],
  mbioderm: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".mbioderm",
    },
  ],
  hbioderm: [
    {
      name: "base",
      label: "Warrior",
      fileSuffix: ".hbioderm",
    },
  ],
  disc: [
    {
      name: "weapon_disc",
      label: "Weapon",
    },
    {
      name: "dcase00",
      label: "Disc Case",
      size: [256, 256],
      baseColorFactor: [1, 1, 1, 0.7],
      emissiveFactor: [1, 1, 1],
      emissiveTexture: true,
      alphaMode: "BLEND",
      metallicFactor: 0,
      roughnessFactor: 1,
      frameCount: 6,
      frameTimings: [21, 1, 1, 1, 1, 1],
      optional: true,
    },
  ],
  chaingun: [
    {
      label: "Chaingun",
      name: "weapon_chaingun",
    },
  ],
  grenade_launcher: [
    {
      label: "Grenade Launcher",
      name: "weapon_grenade_launcher",
    },
  ],
  sniper: [
    {
      label: "Weapon",
      name: "weapon_sniper",
    },
    {
      label: "Green Light",
      name: "greenlight",
      hasDefault: false,
      optional: true,
    },
    {
      label: "Red Light",
      name: "lite_red",
      hasDefault: false,
      optional: true,
    },
  ],
  plasmathrower: [
    {
      label: "Rear & Barrel",
      name: "weapon_plasma10",
      file: "weapon_plasma1",
    },
    {
      label: "Top & Front",
      name: "weapon_plasma21",
      file: "weapon_plasma2",
    },
    {
      name: "weapon_plasma1",
      file: "weapon_plasma1",
      selectable: false,
    },
    {
      name: "weapon_plasma2",
      file: "weapon_plasma2",
      selectable: false,
    },
  ],
  energy: [
    {
      label: "Weapon",
      name: "blinn1",
      file: "weapon_energy",
    },
  ],
  shocklance: [
    {
      label: "Weapon",
      name: "weapon_shocklance",
      size: [512, 256],
    },
    {
      label: "Glow",
      name: "weapon_shocklance_glow_",
      file: "weapon_shocklance_glow ",
      emissiveFactor: [1, 1, 1],
      alphaMode: "MASK",
      alphaCutoff: 255,
      emissiveTexture: true,
      metallicFactor: 0,
      roughnessFactor: 1,
      size: [256, 128],
      optional: true,
    },
  ],
  elf: [
    {
      label: "Weapon",
      name: "weapon_elf",
      file: "weapon_elf",
    },
    {
      label: "Glow",
      name: "weapon_elf0",
      file: "weapon_elf",
    },
  ],
  missile: [
    {
      label: "Weapon",
      name: "weapon_missile",
    },
  ],
  mortar: [
    {
      label: "Weapon",
      name: "weapon_mortar",
    },
  ],
  repair: [
    {
      label: "Weapon",
      name: "weapon_repair",
    },
  ],
  targeting: [
    {
      label: "Weapon",
      name: "weapon_targeting",
    },
  ],
  mine: [
    {
      label: "Weapon",
      name: "mine",
      size: [512, 512],
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  ],
  vehicle_air_scout: [
    {
      label: "Vehicle",
      name: "vehicle_air_scout0",
      file: "vehicle_air_scout",
    },
    {
      name: "Unassigned",
      hidden: true,
      hasDefault: false,
    },
    {
      name: "vehicle_air_scout",
      hidden: true,
      hasDefault: false,
    },
    {
      label: "Flare",
      name: "shrikeflare2",
      emissiveFactor: [0, 0, 0],
      alphaMode: "BLEND",
      emissiveTexture: true,
      metallicFactor: 0,
      roughnessFactor: 1,
      size: [256, 256],
      optional: true,
    },
  ],
  vehicle_air_bomber: [
    {
      label: "Cockpit & Thrusters",
      name: "vehicle_air_bomber10",
      file: "vehicle_air_bomber1",
      size: [256, 512],
    },
    {
      name: "Unassigned",
      hidden: true,
      hasDefault: false,
    },
    {
      label: "Rear",
      name: "vehicle_air_bomber2",
      size: [256, 512],
    },
    {
      label: "Wings",
      name: "vehicle_air_bomber31",
      file: "vehicle_air_bomber3",
    },
    {
      name: "vehicle_air_bomber1",
      size: [256, 512],
      selectable: false,
    },
    {
      name: "vehicle_air_bomber3",
      selectable: false,
    },
  ],
  vehicle_air_hapc: [
    {
      label: "Cockpit",
      name: "vehicle_air_bomber1",
      size: [256, 512],
    },
    {
      name: "Unassigned",
      hidden: true,
      hasDefault: false,
    },
    {
      label: "Wings",
      name: "vehicle_air_hpc2",
    },
    {
      label: "Seats",
      name: "vehicle_air_hpc1",
    },
    {
      label: "Thrusters",
      name: "vehicle_air_hpc30",
      file: "vehicle_air_hpc3",
    },
    {
      name: "vehicle_air_hpc3",
      selectable: false,
    },
  ],
  vehicle_grav_scout: [
    {
      label: "Vehicle",
      name: "Vehicle_grav_scout0",
      file: "Vehicle_grav_scout",
      size: [512, 256],
    },
    {
      name: "Unassigned",
      hidden: true,
      hasDefault: false,
    },
    {
      label: "Pipes",
      name: "Vehicle_grav_scout_pipes1",
      file: "Vehicle_grav_scout_pipes",
      metallicFactor: 0,
      roughnessFactor: 1,
    },
    {
      name: "Vehicle_grav_scout",
      hidden: true,
      hasDefault: false,
    },
    {
      label: "Side Thrusters",
      name: "Vehicle_grav_scout_pipes",
      file: "Vehicle_grav_scout_pipes",
      emissiveFactor: [1, 1, 1],
      alphaMode: "OPAQUE",
      metallicFactor: 0,
      roughnessFactor: 1,
      emissiveTexture: true,
      selectable: false,
    },
    {
      label: "Windshield",
      name: "Vehicle_grav_scout_windshield",
      file: "Vehicle_grav_scout_windshield",
      selectable: false,
      alphaMode: "BLEND",
      baseColorFactor: [1, 1, 1, 0.5],
      metallicFactor: 0,
      roughnessFactor: 1,
      size: [128, 128],
      optional: true,
    },
    {
      label: "Windshield Inner",
      name: "Vehicle_grav_scout_windshieldInner",
      file: "Vehicle_grav_scout_windshieldInner",
      selectable: false,
      alphaMode: "BLEND",
      baseColorFactor: [1, 1, 1, 0.5],
      metallicFactor: 0,
      roughnessFactor: 1,
      size: [128, 128],
      optional: true,
    },
  ],
  vehicle_grav_tank: [
    {
      label: "Center",
      name: "Vehicle_grav_tank_bodyMain",
      size: [256, 512],
    },
    {
      name: "Unassigned",
      hidden: true,
      hasDefault: false,
    },
    {
      label: "Sides",
      name: "vehicle_grav_tank_bodyside10",
      file: "vehicle_grav_tank_bodyside1",
      size: [256, 512],
    },
    {
      label: "Thrusters",
      name: "vehicle_grav_tank_bodyside21",
      file: "vehicle_grav_tank_bodyside2",
    },
    {
      name: "vehicle_grav_tank_bodyside2",
      selectable: false,
    },
    {
      name: "vehicle_grav_tank_bodyside1",
      selectable: false,
    },
  ],
  turret_assaulttank_mortar: [
    {
      label: "Turret",
      name: "turret_assaulttank_mortar",
      file: "turret_assaultTank",
    },
  ],
  vehicle_land_mpbbase: [
    {
      label: "Vehicle Front",
      name: "vehicle_land_mpb1",
    },
    {
      label: "Vehicle Back",
      name: "vehicle_land_mpb2",
    },
    {
      label: "Wheels",
      name: "Vehicle_Land_Assault_wheel",
      file: "Vehicle_Land_Assault_Wheel",
      size: [512, 256],
      optional: true,
    },
  ],
};

function createReverseFileMap(materialMap) {
  const map = new Map();
  for (const modelName in materialMap) {
    materialMap[modelName].forEach((material, i) => {
      let filename;
      if (material.fileSuffix) {
        filename = material.fileSuffix;
      } else if (
        material.selectable !== false &&
        material.hidden !== true &&
        (material.file || material.name)
      ) {
        filename = material.file || material.name;
      }
      if (filename) {
        const models = map.get(filename) ?? [];
        models.push({ modelName, material, index: i });
        map.set(filename, models);
      }
    });
  }
  return map;
}

const fileToModelMap = createReverseFileMap(modelMaterials);

function getFrameInfo(nameWithoutExtension) {
  const match = /^(.+[^\d])(\d{2,})$/.exec(nameWithoutExtension);
  if (match) {
    const head = match[1];
    const tail = match[2];
    const frameIndex = parseInt(tail, 10);
    const frameZeroFile = `${head}${"0".padStart(tail.length, "0")}`;
    const models = fileToModelMap.get(frameZeroFile) ?? [];
    return models
      .filter((model) => typeof model.material.frameCount === "number")
      .map((model) => {
        return {
          ...model,
          frameIndex,
        };
      });
  }
  return [];
}

export function fileToModels(path, skinName = null) {
  const basename = path.split("/").slice(-1)[0];
  const match = basename.match(/^(.+)\.(PNG|png)$/);
  if (match) {
    const nameWithoutExtension = match[1];
    const parts = nameWithoutExtension.split(".");
    if (parts.length > 1) {
      const key = `.${parts[parts.length - 1]}`;
      const models = fileToModelMap.get(key);
      if (models) {
        return {
          path,
          basename,
          nameWithoutExtension,
          extension: match[2],
          skinName: parts.slice(0, parts.length - 1).join("."),
          models,
        };
      }
    } else {
      const frameInfo = getFrameInfo(parts[0]);
      if (frameInfo.length) {
        return {
          path,
          basename,
          nameWithoutExtension,
          extension: match[2],
          skinName,
          models: frameInfo,
        };
      } else {
        const models = fileToModelMap.get(parts[0]);
        if (models) {
          return {
            path,
            basename,
            nameWithoutExtension,
            extension: match[2],
            skinName,
            models,
          };
        }
      }
    }
  }
  return null;
}

export function fileArrayToModels(
  paths,
  getSkinName = () => null,
  { readModificationDate = false } = {}
) {
  const foundModels = new Map();
  const firstSeenDates = readModificationDate
    ? getFileFirstAddedDate("./docs/skins")
    : {};

  paths.forEach((filePath) => {
    const fullPath = path.resolve(filePath);
    const fileInfo = fileToModels(filePath, getSkinName(filePath));
    if (fileInfo) {
      fileInfo.models.forEach((model) => {
        const skinsByName = foundModels.get(model.modelName) ?? new Map();
        const skinMaterials = skinsByName.get(fileInfo.skinName) ?? {
          name: fileInfo.skinName,
          isComplete: null,
          dateFirstSeen: null,
          files: new Map(),
          sizeMultiplier: new Map(),
        };

        const sizeInfo = probe.sync(fs.readFileSync(fullPath));
        const key = model.material.file ?? model.material.name;
        const baseSize = model.material.size ?? defaultTextureSize;
        const sizeMultiplier = Math.max(
          sizeInfo.width / baseSize[0],
          sizeInfo.height / baseSize[1]
        );
        if (sizeMultiplier > 1) {
          skinMaterials.sizeMultiplier.set(
            path.relative("docs/skins", fullPath),
            sizeMultiplier
          );
        }

        if (readModificationDate) {
          const dateFirstSeen = firstSeenDates[fullPath];
          if (
            !skinMaterials.dateFirstSeen ||
            skinMaterials.dateFirstSeen < dateFirstSeen
          ) {
            skinMaterials.dateFirstSeen = dateFirstSeen;
          }
        }
        const materialFrames = skinMaterials.files.get(key) ?? [];
        materialFrames[model.frameIndex ?? 0] = filePath;
        skinMaterials.files.set(key, materialFrames);
        skinsByName.set(fileInfo.skinName, skinMaterials);
        foundModels.set(model.modelName, skinsByName);
      });
    }
  });
  foundModels.forEach((skinsByName, modelName) => {
    const requiredMaterials = modelMaterials[modelName].filter(
      (material) =>
        material.selectable !== false &&
        material.hidden !== true &&
        material.optional !== true
    );
    skinsByName.forEach((skin) => {
      skin.isComplete = requiredMaterials.every((material) =>
        skin.files.has(material.file ?? material.name)
      );
    });
  });
  return foundModels;
}

function getFileFirstAddedDate(dirPath) {
  const output = execFileSync(
    "git",
    [
      "log",
      "--follow",
      "--diff-filter=AR",
      "--name-only",
      "--format=%aI",
      "--",
      dirPath,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 256 }
  );

  const entries = {};
  let date = null;
  for (const line of output.split("\n")) {
    if (!line.trim()) continue;
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
      date = new Date(line.trim());
    } else if (date) {
      entries[path.resolve(line.trim())] = date;
    }
  }

  return entries;
}
