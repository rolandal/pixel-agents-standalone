/**
 * Persistent identity extraction for Claude Code sessions hosted by NeuraMD.
 *
 * The Claude TUI session_id changes every time a tentacle is restarted, so the
 * upstream `session_id`-keyed character mapping creates a new pixel character on
 * each restart — visually breaking continuity for long-lived agents.
 *
 * NeuraMD spawns each tentacle inside `<repo>/tmp/tentacles/<tentacle-uuid>/`,
 * so the JSONL project dir name carries the tentacle UUID directly:
 *
 *     ~/.claude/projects/-home-rafael-apps-NeuraMD-tmp-tentacles-<UUID>/<session_id>.jsonl
 *
 * The UUID matches the NeuraMD note id, which IS the persistent identity.
 * Two Claude sessions for the same tentacle = same character.
 *
 * For non-NeuraMD projects (regular `claude` runs in /tmp, /home, etc.) the
 * regex returns null and callers fall back to session_id-based keying — no
 * regression for upstream standalone usage.
 */

const TENTACLE_UUID_RE = /-tentacles-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:$|-)/;

/**
 * Extract a NeuraMD tentacle UUID from a project dir name.
 * Returns the UUID string, or null if the dir isn't a tentacle workspace.
 */
export function extractTentacleUuid(projectDirName: string): string | null {
  const match = projectDirName.match(TENTACLE_UUID_RE);
  return match ? match[1] : null;
}

/**
 * Compute the persistent identity key for a session.
 * Prefers the tentacle UUID (NeuraMD-hosted) so character continuity survives
 * Claude TUI restarts; falls back to session_id for non-NeuraMD sessions.
 */
export function identityKey(projectDirName: string, sessionId: string): string {
  return extractTentacleUuid(projectDirName) ?? sessionId;
}
