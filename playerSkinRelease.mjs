import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { isPlayerTexture } from "./buildPlayerSkins.mjs";

function playerFilesAt(ref, cwd) {
  if (!ref) return new Map();
  const tree = execFileSync("git", ["ls-tree", "-r", "-z", ref, "--", "docs/skins/"], {
    cwd, encoding: "utf8", stdio: "pipe", maxBuffer: 16 * 1024 * 1024,
  });
  return new Map(tree.split("\0").filter(Boolean).flatMap((entry) => {
    const separator = entry.indexOf("\t");
    const [mode, type, hash] = entry.slice(0, separator).split(" ");
    const file = entry.slice(separator + 1);
    return type === "blob" && /^100/.test(mode) && isPlayerTexture(file.replace(/@1x\.png$/i, ".png"))
      ? [[file, hash]] : [];
  }));
}

// Compare the complete trees, so skipped or failed runs do not lose changes.
// A rename appears as a removal and an addition. Include prepared @1x files:
// changes to those committed copies also change the standard download.
export function playerSkinChanges(previous, current = "HEAD", cwd = process.cwd()) {
  const before = playerFilesAt(previous, cwd);
  const after = playerFilesAt(current, cwd);
  return {
    added: [...after.keys()].filter((file) => !before.has(file)).sort(),
    removed: [...before.keys()].filter((file) => !after.has(file)).sort(),
    updated: [...after.keys()].filter((file) => before.has(file) && before.get(file) !== after.get(file)).sort(),
  };
}

function fileLabel(file) {
  // HTML code spans handle literal backticks, angle brackets and Markdown in names.
  const label = file.replace(/^docs\/skins\//, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  return `<code>${label}</code>`;
}

export function playerSkinReleaseNotes({
  changes, previous, current, tag, repositoryUrl, builtAt = new Date().toISOString(),
}) {
  const download = `${repositoryUrl}/releases/download/${encodeURIComponent(tag)}`;
  const counts = ["added", "removed", "updated"].map((kind) => `${changes[kind].length} ${kind}`).join(", ");
  const introduction = [
    `Built at **${builtAt}** (UTC) from [${current.slice(0, 12)}](${repositoryUrl}/commit/${current}).`,
    "",
    "Download all player skins in one VL2:",
    "",
    `- [Standard resolution](${download}/zPlayerSkins-All.vl2): 1× textures.`,
    `- [Including HD](${download}/zPlayerSkins-All-HD.vl2): original textures, including HD where available.`,
    "",
    "Install **one** file in your Tribes 2 **GameData/base/** folder.",
    "",
    previous
      ? `Changes since [${previous}](${repositoryUrl}/releases/tag/${encodeURIComponent(previous)}): **${counts}**.`
      : `Initial release: **${changes.added.length} player skin files**, including prepared @1x copies. All are listed as added below.`,
  ];
  const sections = [];
  for (const [kind, title] of [["added", "Added"], ["removed", "Removed"], ["updated", "Updated"]]) {
    if (changes[kind].length) {
      sections.push("", `### ${title} (${changes[kind].length})`, "",
        ...changes[kind].map((file) => `- ${fileLabel(file)}`));
    }
  }
  if (!sections.length) sections.push("", "No player skin files changed. This release rebuilds the existing collection.");
  const changesUrl = `${download}/player-skin-changes.md`;
  const footer = ["", `[Complete file change list](${changesUrl}).`, ""];
  const full = [...introduction, ...sections, ...footer].join("\n");
  // The first release can list thousands of files. Keep the release body small
  // and attach the complete Markdown report, without dropping any filenames.
  const notes = Buffer.byteLength(full) <= 60000 ? full : [
    ...introduction, "", "The full filename list is in the attached report.", ...footer,
  ].join("\n").replace("All are listed as added below.", "All are listed as added in the attached report.");
  return { notes, full };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_REPOSITORY, GITHUB_SHA, PLAYER_SKINS_TAG, PREVIOUS_PLAYER_SKINS_TAG } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_SHA || !PLAYER_SKINS_TAG) {
    throw new Error("GITHUB_REPOSITORY, GITHUB_SHA and PLAYER_SKINS_TAG are required");
  }
  const previous = PREVIOUS_PLAYER_SKINS_TAG || null;
  const changes = playerSkinChanges(previous, GITHUB_SHA);
  const report = playerSkinReleaseNotes({
    changes, previous, current: GITHUB_SHA, tag: PLAYER_SKINS_TAG,
    repositoryUrl: `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${GITHUB_REPOSITORY}`,
  });
  const output = process.argv[2] || "dist/player-skins";
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "release-notes.md"), report.notes);
  await fs.writeFile(path.join(output, "player-skin-changes.md"), report.full);
  console.log(`Player skin changes: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.updated.length} updated.`);
}
