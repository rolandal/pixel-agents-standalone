import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { extractTentacleUuid, identityKey } from "../identity.js";

describe("extractTentacleUuid", () => {
  it("pulls the UUID from a NeuraMD tentacle project dir", () => {
    const dir = "-home-rafael-apps-NeuraMD-tmp-tentacles-417ec8e5-9808-4531-a484-5388c38fc7c0";
    assert.equal(
      extractTentacleUuid(dir),
      "417ec8e5-9808-4531-a484-5388c38fc7c0",
    );
  });

  it("works regardless of host path prefix (different machine layouts)", () => {
    const dir = "-Users-alice-projects-NeuraMD-tmp-tentacles-cbc1fbcb-9699-4909-aa89-3bc97cebca2d";
    assert.equal(
      extractTentacleUuid(dir),
      "cbc1fbcb-9699-4909-aa89-3bc97cebca2d",
    );
  });

  // TODO(workspace-mode): NeuraMD also spawns tentacles inside
  //   /home/rafael/workspaces/.tentacle-worktrees/<workspace>/<uuid>/
  // We don't have production samples of how Claude Code names that project dir
  // (the leading dot may or may not be replaced with `-`). Add a real test case
  // when we observe one.

  it("returns null for non-tentacle dirs (regular claude runs in /tmp)", () => {
    assert.equal(extractTentacleUuid("-tmp-some-project-657"), null);
    assert.equal(extractTentacleUuid("-home-alice-Documents-myproject"), null);
  });

  it("returns null when the segment after `tentacles-` is not a full UUID", () => {
    // partial / malformed — we want a strict UUID match to avoid false positives
    assert.equal(extractTentacleUuid("-tentacles-abc"), null);
    assert.equal(extractTentacleUuid("-tentacles-417ec8e5-9808"), null);
  });

  it("returns null when the literal `tentacles-` substring appears outside a tentacle path", () => {
    // Defensive: the regex requires a hyphen prefix, so a project literally
    // named `tentacles-417ec8e5-...` (no leading hyphen) should not match.
    // Here `-not-tentacles-…` would match (the prefix is `-` from `not-`).
    // That's fine — only a path component literally ending in `tentacles`
    // could collide, which doesn't exist in real Claude project dirs.
    assert.equal(extractTentacleUuid("tentacles-417ec8e5-9808-4531-a484-5388c38fc7c0"), null);
  });
});

describe("identityKey", () => {
  it("returns the tentacle UUID when the dir is a NeuraMD tentacle", () => {
    const dir = "-home-rafael-apps-NeuraMD-tmp-tentacles-417ec8e5-9808-4531-a484-5388c38fc7c0";
    const sessionId = "c3309c3c-13d5-4ad9-87b9-60746da8c588";
    assert.equal(identityKey(dir, sessionId), "417ec8e5-9808-4531-a484-5388c38fc7c0");
  });

  it("returns the same key for two different sessions of the same tentacle", () => {
    const dir = "-home-rafael-apps-NeuraMD-tmp-tentacles-417ec8e5-9808-4531-a484-5388c38fc7c0";
    const session1 = "c3309c3c-13d5-4ad9-87b9-60746da8c588";
    const session2 = "f7d04d0e-cd52-44eb-bc45-88e541cfc8dc";
    assert.equal(
      identityKey(dir, session1),
      identityKey(dir, session2),
      "Same tentacle → same identity, regardless of Claude session_id",
    );
  });

  it("falls back to session_id for non-NeuraMD projects", () => {
    const dir = "-tmp-some-project-657";
    const sessionId = "abc12345-aaaa-bbbb-cccc-ddddeeeeffff";
    assert.equal(identityKey(dir, sessionId), sessionId);
  });
});
