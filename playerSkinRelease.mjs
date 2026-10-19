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
  changes, previous, repositoryUrl,
}) {
  if (!previous) return "Initial release.\n";

  const sections = [];
  for (const [kind, title] of [["added", "Added"], ["removed", "Removed"], ["updated", "Updated"]]) {
    if (changes[kind].length) {
      sections.push("", `### ${title} (${changes[kind].length})`, "",
        ...changes[kind].map((file) => `- ${fileLabel(file)}`));
    }
  }
  if (!sections.length) return "No player skin files changed.\n";
  return [
    `Changes since the [previous release](${repositoryUrl}/releases/tag/${encodeURIComponent(previous)}).`,
    ...sections, "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_REPOSITORY, GITHUB_SHA, PREVIOUS_PLAYER_SKINS_TAG } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_SHA) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_SHA are required");
  }
  const previous = PREVIOUS_PLAYER_SKINS_TAG || null;
  const changes = playerSkinChanges(previous, GITHUB_SHA);
  const notes = playerSkinReleaseNotes({
    changes, previous,
    repositoryUrl: `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${GITHUB_REPOSITORY}`,
  });
  const output = process.argv[2] || "dist/player-skins";
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, "release-notes.md"), notes);
  console.log(`Player skin changes: ${changes.added.length} added, ${changes.removed.length} removed, ${changes.updated.length} updated.`);
}
