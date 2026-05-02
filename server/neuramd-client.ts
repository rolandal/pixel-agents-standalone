/**
 * HTTP client for the NeuraMD MCP gateway.
 *
 * Lets the server fetch read-only context about each tracked tentacle
 * (inbox, parent links, label) without bundling a full MCP SDK. The gateway
 * exposes JSON-RPC over a single POST endpoint with bearer auth, so a thin
 * fetch wrapper is sufficient.
 *
 * Configured via env:
 *   NEURAMD_GATEWAY_URL   — e.g. http://AIrch.local:3000/mcp
 *   NEURAMD_GATEWAY_TOKEN — bearer token issued by the gateway
 *
 * Both must be set; if either is missing, `enabled` is false and callers
 * should silently skip MCP-dependent features (preserves standalone usage
 * for non-NeuraMD pixel-agents users).
 */

export interface InboxMessage {
  id: string;
  fromSlug: string;
  fromTitle: string;
  content: string;
  createdAt: string;
}

export interface NoteSummary {
  id: string;
  slug: string;
  title: string;
  tags: string[];
}

export interface NeuraMdClientOptions {
  url: string;
  token: string;
  // Injected for testability — defaults to global fetch.
  fetchImpl?: typeof fetch;
}

export class NeuraMdClient {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private nextRequestId = 1;

  constructor(opts: NeuraMdClientOptions) {
    this.url = opts.url;
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): NeuraMdClient | null {
    const url = env.NEURAMD_GATEWAY_URL;
    const token = env.NEURAMD_GATEWAY_TOKEN;
    if (!url || !token) return null;
    return new NeuraMdClient({ url, token });
  }

  /**
   * Fetch the bound viewer agent's inbox via `read_my_inbox`.
   *
   * The gateway's tool is scoped to the bearer-bound agent — there's no
   * per-slug variant yet. Pixel-agents uses this to surface what the team
   * is sending to a designated viewer (e.g. `severino` or a dedicated
   * read-only spectator slug). Messages carry `from_slug`, so the webview
   * renders each speech bubble above the *sender's* character.
   *
   * `markDelivered: false` (default) is critical: this is observation,
   * not consumption — the receiving agent should still be the one to mark
   * its own messages delivered.
   */
  async readMyInbox(limit = 5, markDelivered = false): Promise<InboxMessage[]> {
    const result = await this.callTool("read_my_inbox", {
      only_pending: true,
      limit,
      mark_delivered: markDelivered,
    });
    const text = result?.content?.[0]?.text;
    if (typeof text !== "string") return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return [];
    }
    if (!parsed || typeof parsed !== "object") return [];
    const messagesRaw = (parsed as { messages?: unknown }).messages;
    if (!Array.isArray(messagesRaw)) return [];

    const messages: InboxMessage[] = [];
    for (const m of messagesRaw) {
      if (!m || typeof m !== "object") continue;
      const r = m as Record<string, unknown>;
      if (typeof r.id !== "string") continue;
      messages.push({
        id: r.id,
        fromSlug: typeof r.from_slug === "string" ? r.from_slug : "",
        fromTitle: typeof r.from_title === "string" ? r.from_title : "",
        content: typeof r.content === "string" ? r.content : "",
        createdAt: typeof r.created_at === "string" ? r.created_at : "",
      });
    }
    return messages;
  }

  /**
   * Resolve a tentacle UUID to a NeuraMD note summary (slug, title, tags).
   * Returns null when the gateway doesn't know about the UUID — caller
   * should fall back to UUID-only labelling.
   */
  async resolveNoteById(id: string): Promise<NoteSummary | null> {
    const result = await this.callTool("resolve_note_by_id", { id });
    const text = result?.content?.[0]?.text;
    if (typeof text !== "string") return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const r = parsed as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.slug !== "string") return null;
    return {
      id: r.id,
      slug: r.slug,
      title: typeof r.title === "string" ? r.title : "",
      tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === "string") : [],
    };
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content?: Array<{ text?: string }> } | null> {
    const id = this.nextRequestId++;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Gateway HTTP transport accepts both content types.
          Accept: "application/json,text/event-stream",
          Authorization: `Bearer ${this.token}`,
        },
        body,
      });
    } catch {
      // Network failure (gateway down, DNS, etc) — caller treats as "no data".
      return null;
    }

    if (!response.ok) return null;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return null;
    }

    if (!payload || typeof payload !== "object") return null;
    const result = (payload as { result?: unknown }).result;
    if (!result || typeof result !== "object") return null;
    return result as { content?: Array<{ text?: string }> };
  }
}
