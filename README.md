# t2-skins

This repository contains custom fan-made skins for Tribes 2 in order to serve
them via GitHub Pages, where they can be loaded by
[t2-model-skinner](https://github.com/exogen/t2-model-skinner).

It’s a separate repository so that it can be deployed separately, since
deploying the large collection of skins to GitHub Pages is slow.

To get new skins to appear in [t2-model-skinner](https://github.com/exogen/t2-model-skinner),
they must be added to this repo and deployed after running the `build` script,
which updates the JSON manifest. To get them to appear on the [gallery page](https://exogen.github.io/t2-model-skinner/gallery/),
both the `build` and `gallery` scripts must be run.
