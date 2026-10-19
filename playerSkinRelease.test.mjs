import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { playerSkinChanges, playerSkinReleaseNotes } from "./playerSkinRelease.mjs";

test("notes compare all player files against the previous release, including skipped commits", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "t2-release-diff-"));
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: "pipe" });
  const write = async (name, content) => {
    const file = path.join(directory, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };
  const commit = () => {
    git("add", ".");
    git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture");
  };
  try {
    git("init", "-q");
    await write("docs/skins/Keep.lmale.png", "unchanged");
    await write("docs/skins/Removed.mfemale.png", "removed");
    await write("docs/skins/Updated.hmale.PNG", "old");
    await write("docs/skins/OldName.lbioderm.png", "renamed");
    await write("docs/skins/Updated.hmale@1x.png", "old alternative");
    await write("docs/skins/Weapons/weapon_disc.png", "old weapon");
    await write("docs/skins/.Hidden.lmale.png", "hidden");
    commit();
    git("tag", "player-skins-baseline");

    await fs.unlink(path.join(directory, "docs/skins/Removed.mfemale.png"));
    await fs.rename(path.join(directory, "docs/skins/OldName.lbioderm.png"), path.join(directory, "docs/skins/NewName.lbioderm.png"));
    await write("docs/skins/Added #50%.hfemale.png", "added");
    await write("docs/skins/Updated.hmale.PNG", "new");
    await write("docs/skins/Updated.hmale@1x.png", "new alternative");
    await write("docs/skins/Weapons/weapon_disc.png", "new weapon");
    await write("docs/skins/vehicle_air_scout.png", "vehicle");
    await fs.symlink("Keep.lmale.png", path.join(directory, "docs/skins/Linked.lmale.png"));
    commit();
    await write(".github/workflows/player-skins.yml", "workflow change only");
    commit();

    assert.deepEqual(playerSkinChanges("player-skins-baseline", "HEAD", directory), {
      added: ["docs/skins/Added #50%.hfemale.png", "docs/skins/NewName.lbioderm.png"],
      removed: ["docs/skins/OldName.lbioderm.png", "docs/skins/Removed.mfemale.png"],
      updated: ["docs/skins/Updated.hmale.PNG", "docs/skins/Updated.hmale@1x.png"],
    });
    const initial = playerSkinChanges(null, "player-skins-baseline", directory);
    assert.equal(initial.added.length, 5);
    assert.deepEqual(initial.removed, []);
    assert.deepEqual(initial.updated, []);
    assert.deepEqual(playerSkinChanges("HEAD", "HEAD", directory), { added: [], removed: [], updated: [] });
    assert.throws(() => playerSkinChanges("missing-release", "HEAD", directory));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

const metadata = {
  previous: "player-skins-baseline", repositoryUrl: "https://github.com/exogen/t2-skins",
};

test("release notes list added, removed and updated filenames inline", () => {
  const notes = playerSkinReleaseNotes({
    ...metadata,
    changes: {
      added: ["docs/skins/New <&`skin`.lmale.png"],
      removed: ["docs/skins/Removed.hmale.png"],
      updated: ["docs/skins/Updated.mfemale.png"],
    },
  });
  assert.ok(notes.includes(`/releases/tag/${metadata.previous}`));
  assert.match(notes, /### Added \(1\)/);
  assert.match(notes, /New &lt;&amp;`skin`\.lmale\.png/);
  assert.match(notes, /### Removed \(1\)/);
  assert.match(notes, /Removed\.hmale\.png/);
  assert.match(notes, /### Updated \(1\)/);
  assert.match(notes, /Updated\.mfemale\.png/);
  assert.ok(!notes.includes("player-skin-changes.md"));
});

test("workflow-only rebuilds explicitly report that no player skin files changed", () => {
  const notes = playerSkinReleaseNotes({ ...metadata, changes: { added: [], removed: [], updated: [] } });
  assert.equal(notes, "No player skin files changed.\n");
});

test("initial releases omit the filename list even for thousands of skins", () => {
  const added = Array.from({ length: 6000 }, (_, index) => `docs/skins/Skin number ${index}.lmale.png`);
  const notes = playerSkinReleaseNotes({
    ...metadata, previous: null, changes: { added, removed: [], updated: [] },
  });
  assert.equal(notes, "Initial release.\n");
});
