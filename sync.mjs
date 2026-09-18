import { parseArgs } from "node:util";
import { createClient, createStore, deployAssets } from "./r2Sync.mjs";
import {
  SOURCES,
  listLocalAssets,
  metadataFor,
  unknownExtensions,
} from "./skinAssets.mjs";

const { values } = parseArgs({
  options: {
    source: { type: "string", default: "docs" },
    plan: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    "allow-large-prune": { type: "boolean", default: false },
    concurrency: { type: "string", default: "8" },
  },
});

const files = await listLocalAssets(values.source);
const unknown = unknownExtensions(files.keys());
if (unknown.size) {
  for (const [extension, examples] of unknown) {
    console.error(`Unknown content type ${extension}: ${examples.join(", ")}`);
  }
  throw new Error(
    "Add the content types to skinAssets.mjs or remove these files.",
  );
}

if (values.plan) {
  console.log(
    `${files.size} files under ${values.source}, destined for s3://t2-assets/skins/:`,
  );
  for (const { local, key } of SOURCES) {
    console.log(`  ${local} -> ${key}`);
  }
  console.log(`Manifest: ${metadataFor("manifest.json").cacheControl}`);
  console.log(`Images: ${metadataFor("image.png").cacheControl}`);
} else {
  const client = createClient();
  try {
    await deployAssets({
      files,
      store: createStore(client),
      concurrency: Number(values.concurrency),
      dryRun: values["dry-run"],
      allowLargePrune: values["allow-large-prune"],
      zoneId: process.env.CLOUDFLARE_ZONE_ID,
      apiToken: process.env.CLOUDFLARE_API_TOKEN,
    });
  } finally {
    client.destroy();
  }
}
