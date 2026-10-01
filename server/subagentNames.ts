// Resolve a friendly display name for a background subagent character.
//
// Background subagents are written to their own transcript file, named
// `agent-<agentId>.jsonl`, under `<parentSession>/subagents/`. The watcher can
// only label a file by its project-folder tail, so every subagent would show as
// "subagents".
//
// Alongside each transcript sits a sidecar `agent-<agentId>.meta.json` written
// at spawn time, carrying `agentType` (e.g. "forti-medic") and `description`.
// That's the crisp label source — read the sidecar, no parent-transcript join
// and no launch race.

import { readFileSync } from "fs";

const MAX_LABEL_LEN = 28;

export function resolveSubagentName(jsonlFilePath: string): string | null {
  const metaPath = jsonlFilePath.replace(/\.jsonl$/, ".meta.json");

  let meta: { agentType?: unknown; description?: unknown };
  try {
    meta = JSON.parse(readFileSync(metaPath, "utf-8"));
  } catch {
    return null; // sidecar missing or not written yet
  }

  const type = typeof meta.agentType === "string" ? meta.agentType : "";
  const desc = typeof meta.description === "string" ? meta.description : "";

  // agentType is the crisp name; "general-purpose" agents carry no useful type,
  // so fall back to the human description.
  let name = type && type !== "general-purpose" ? type : desc || type;
  if (!name) return null;
  if (name.length > MAX_LABEL_LEN) name = name.slice(0, MAX_LABEL_LEN - 1) + "…";
  return name;
}
