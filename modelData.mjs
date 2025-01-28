import fs from "fs";

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
  lmale: [{ name: "base", fileSuffix: ".lmale" }],
  mmale: [{ name: "base", fileSuffix: ".mmale" }],
  hmale: [{ name: "base", fileSuffix: ".hmale" }],
  lfemale: [{ name: "base", fileSuffix: ".lfemale" }],
  mfemale: [{ name: "base", fileSuffix: ".mfemale" }],
  lbioderm: [{ name: "base", fileSuffix: ".lbioderm" }],
  mbioderm: [{ name: "base", fileSuffix: ".mbioderm" }],
  hbioderm: [{ name: "base", fileSuffix: ".hbioderm" }],
  // Weapons
  disc: [{ name: "weapon_disc" }, { name: "dcase00", optional: true }],
  chaingun: [{ name: "weapon_chaingun" }],
  grenade_launcher: [{ name: "weapon_grenade_launcher" }],
  sniper: [
    { name: "weapon_sniper" },
    { name: "greenlight", optional: true },
    { name: "lite_red", optional: true },
  ],
  plasmathrower: [
    {
      name: "weapon_plasma10",
      file: "weapon_plasma1",
    },
    {
      name: "weapon_plasma21",
      file: "weapon_plasma2",
    },
  ],
  energy: [
    {
      name: "blinn1",
      file: "weapon_energy",
    },
  ],
  shocklance: [
    { name: "weapon_shocklance" },
    {
      name: "weapon_shocklance_glow_",
      file: "weapon_shocklance_glow ",
      optional: true,
    },
  ],
  elf: [
    { name: "weapon_elf", file: "weapon_elf" },
    { name: "weapon_elf0", file: "weapon_elf" },
  ],
  missile: [{ name: "weapon_missile" }],
  mortar: [{ name: "weapon_mortar" }],
  repair: [{ name: "weapon_repair" }],
  targeting: [{ name: "weapon_targeting" }],
  // Vehicles
  vehicle_air_scout: [
    {
      name: "vehicle_air_scout0",
      file: "vehicle_air_scout",
    },
    {
      hidden: true,
    },
    {
      name: "vehicle_air_scout",
      hidden: true,
    },
    {
      name: "shrikeflare2",
      optional: true,
    },
  ],
  vehicle_air_bomber: [
    {
      name: "vehicle_air_bomber10",
      file: "vehicle_air_bomber1",
    },
    {
      hidden: true,
    },
    {
      name: "vehicle_air_bomber2",
    },
    {
      name: "vehicle_air_bomber31",
      file: "vehicle_air_bomber3",
    },
    {
      name: "vehicle_air_bomber1",
      selectable: false,
    },
    {
      name: "vehicle_air_bomber3",
      selectable: false,
    },
  ],
  vehicle_air_hapc: [
    {
      name: "vehicle_air_bomber1",
    },
    {
      hidden: true,
    },
    {
      name: "vehicle_air_hpc2",
    },
    {
      name: "vehicle_air_hpc1",
    },
    {
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
      name: "Vehicle_grav_scout0",
      file: "Vehicle_grav_scout",
    },
    {
      hidden: true,
    },
    {
      name: "Vehicle_grav_scout_pipes1",
      file: "Vehicle_grav_scout_pipes",
    },
    {
      hidden: true,
    },
    {
      name: "Vehicle_grav_scout_pipes",
      file: "Vehicle_grav_scout_pipes",
      selectable: false,
    },
    {
      name: "Vehicle_grav_scout_windshield",
      file: "Vehicle_grav_scout_windshield",
      selectable: false,
    },
    {
      name: "Vehicle_grav_scout_windshieldInner",
      file: "Vehicle_grav_scout_windshieldInner",
      selectable: false,
    },
  ],
  vehicle_grav_tank: [
    {
      name: "Vehicle_grav_tank_bodyMain",
    },
    {
      hidden: true,
    },
    {
      name: "vehicle_grav_tank_bodyside10",
      file: "vehicle_grav_tank_bodyside1",
    },
    {
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
      name: "turret_assaulttank_mortar",
      file: "turret_assaultTank",
    },
  ],
  vehicle_land_mpbbase: [
    {
      name: "vehicle_land_mpb1",
    },
    {
      name: "vehicle_land_mpb2",
    },
    {
      name: "Vehicle_Land_Assault_wheel",
      file: "Vehicle_Land_Assault_Wheel",
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
      const key = parts[0];
      const models = fileToModelMap.get(key);
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
  return null;
}

export function fileArrayToModels(
  paths,
  getSkinName = () => null,
  { readModificationDate = false } = {}
) {
  const foundModels = new Map();
  paths.forEach((path) => {
    const fileInfo = fileToModels(path, getSkinName(path));
    if (fileInfo) {
      fileInfo.models.forEach((model) => {
        const skinsByName = foundModels.get(model.modelName) ?? new Map();
        const skinMaterials = skinsByName.get(fileInfo.skinName) ?? {
          name: fileInfo.skinName,
          isComplete: null,
          dateModified: null,
          files: new Map(),
        };
        if (readModificationDate) {
          const dateModified = fs.statSync(path).mtime;
          if (
            !skinMaterials.dateModified ||
            skinMaterials.dateModified < dateModified
          ) {
            skinMaterials.dateModified = dateModified;
          }
        }
        skinMaterials.files.set(model.material.file ?? model.material.name, [
          path,
        ]);
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
