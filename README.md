# t2-skins

This repository contains custom fan-made skins for Tribes 2 in order to serve
them via GitHub Pages and Cloudflare R2, where they can be loaded by
[t2-model-skinner](https://github.com/exogen/t2-model-skinner).

It’s a separate repository so that it can be deployed separately, since
deploying the large collection of skins to GitHub Pages is slow.

To get new skins to appear in [t2-model-skinner](https://github.com/exogen/t2-model-skinner),
they must be added to this repo and deployed after running the `build` script,
which updates the JSON manifest. To get them to appear on the [gallery page](https://exogen.github.io/t2-model-skinner/gallery/),
both the `build` and `gallery` scripts must be run.

## Extracting `.vl2` files

`node extract-vl2.mjs "path/**/*.vl2"` unpacks player skins into `docs/skins/`
and prompts for a new name when a skin with the same name already exists.
Pass `--overwrite` to replace the existing files instead. Replaced files
keep their on-disk name, and their screenshots in `docs/gallery/` are
deleted so the next `gallery` run re-renders them. The `build` script
does not treat a replaced skin as new, and a pack containing it only
bumps its version if the pack's file list changed.

## Deploying to R2

Pushing to `main` runs [the deploy workflow](.github/workflows/deploy.yml),
which syncs `docs/` to `s3://t2-assets/skins/`, served at
`https://assets.tribes2.online/skins/`:

| Local             | Bucket key            | Cache-Control                                  |
| ----------------- | --------------------- | ---------------------------------------------- |
| `docs/skins.json` | `skins/manifest.json` | `max-age=300`                                  |
| `docs/gallery/*`  | `skins/gallery/*`     | `max-age=86400, stale-while-revalidate=604800` |
| `docs/skins/**`   | `skins/files/**`      | `max-age=86400, stale-while-revalidate=604800` |

`npm run sync` compares file sizes and MD5 hashes against one R2 listing,
sets the headers above, deletes removed files, and purges changed URLs.
New URLs are purged too, since the edge may have cached earlier 404s. The
manifest is uploaded after its images. Header changes in
[`skinAssets.mjs`](skinAssets.mjs) also update existing objects on the next deploy.

The pending purge list is saved in R2 before files change and cleared only
after a successful purge. A failed upload or purge is retried on the next run.
Purges only target URLs under `/skins/`, including for large updates.

Secrets the workflow needs: `CF_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and
`R2_SECRET_ACCESS_KEY` for the bucket, plus `CLOUDFLARE_ZONE_ID` and
`CLOUDFLARE_PURGE_TOKEN` (a token with the zone's Cache Purge permission)
for the purge. Without both purge secrets, the sync still runs and the
pending URLs wait in R2 until a later run with credentials.

To list local files and cache settings without credentials:

```sh
npm run sync -- --plan
```

For a local deploy, set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
`AWS_ENDPOINT_URL` (`https://<account-id>.r2.cloudflarestorage.com`), plus
`CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_API_TOKEN` to enable purging.
`npm run sync -- --dry-run` compares against R2 without writing or purging;
`npm run sync` deploys. Use `--allow-large-prune` for intentional removal of
more than 20% of the remote files. Missing source directories and unknown
file types fail before any changes are made.

The workflow serializes deploys. Run local deploys one at a time and avoid
overlapping them with the workflow.
