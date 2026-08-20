import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { NeuraMdClient } from "../neuramd-client.js";

interface RecordedCall {
  url: string;
  init: RequestInit;
}

function makeFakeFetch(
  responder: (call: RecordedCall) => { ok: boolean; status?: number; json?: unknown },
): { fetch: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const r = responder(call);
    return new Response(r.json !== undefined ? JSON.stringify(r.json) : "", {
      status: r.status ?? (r.ok ? 200 : 500),
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, calls };
}

describe("NeuraMdClient.fromEnv", () => {
  it("returns null when env vars are missing", () => {
    assert.equal(NeuraMdClient.fromEnv({} as NodeJS.ProcessEnv), null);
    assert.equal(NeuraMdClient.fromEnv({ NEURAMD_GATEWAY_URL: "x" } as NodeJS.ProcessEnv), null);
    assert.equal(NeuraMdClient.fromEnv({ NEURAMD_GATEWAY_TOKEN: "x" } as NodeJS.ProcessEnv), null);
  });

  it("constructs a client when both env vars are set", () => {
    const client = NeuraMdClient.fromEnv({
      NEURAMD_GATEWAY_URL: "http://example/mcp",
      NEURAMD_GATEWAY_TOKEN: "tok",
    } as NodeJS.ProcessEnv);
    assert.ok(client instanceof NeuraMdClient);
  });
});

describe("NeuraMdClient.readMyInbox", () => {
  it("sends a JSON-RPC tools/call to read_my_inbox with bearer auth", async () => {
    const { fetch: fakeFetch, calls } = makeFakeFetch(() => ({
      ok: true,
      json: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({ messages: [] }),
            },
          ],
        },
      },
    }));
    const client = new NeuraMdClient({
      url: "http://example/mcp",
      token: "secret-token",
      fetchImpl: fakeFetch,
    });

    await client.readMyInbox();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://example/mcp");
    assert.equal(calls[0].init.method, "POST");

    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer secret-token");
    assert.equal(headers["Content-Type"], "application/json");

    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.jsonrpc, "2.0");
    assert.equal(body.method, "tools/call");
    assert.equal(body.params.name, "read_my_inbox");
    assert.equal(body.params.arguments.only_pending, true);
    assert.equal(body.params.arguments.mark_delivered, false);
  });

  it("parses and returns inbox messages", async () => {
    const { fetch: fakeFetch } = makeFakeFetch(() => ({
      ok: true,
      json: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                slug: "gerente",
                count: 2,
                messages: [
                  {
                    id: "msg-1",
                    from_slug: "severino",
                    from_title: "Severino",
                    content: "ping",
                    created_at: "2026-05-02T15:00:00-03:00",
                  },
                  {
                    id: "msg-2",
                    from_slug: "especialista-neuramd",
                    from_title: "Especialista NeuraMD",
                    content: "PR #59 pronto",
                    created_at: "2026-05-02T15:01:00-03:00",
                  },
                ],
              }),
            },
          ],
        },
      },
    }));
    const client = new NeuraMdClient({
      url: "http://example/mcp",
      token: "tok",
      fetchImpl: fakeFetch,
    });

    const messages = await client.readMyInbox();

    assert.equal(messages.length, 2);
    assert.equal(messages[0].id, "msg-1");
    assert.equal(messages[0].fromSlug, "severino");
    assert.equal(messages[0].content, "ping");
    assert.equal(messages[1].fromTitle, "Especialista NeuraMD");
  });

  it("returns an empty array on network failure (gateway unreachable)", async () => {
    const failingFetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const client = new NeuraMdClient({
      url: "http://example/mcp",
      token: "tok",
      fetchImpl: failingFetch,
    });

    const messages = await client.readMyInbox();
    assert.deepEqual(messages, []);
  });

  it("returns an empty array on non-2xx response", async () => {
    const { fetch: fakeFetch } = makeFakeFetch(() => ({ ok: false, status: 401 }));
    const client = new NeuraMdClient({
      url: "http://example/mcp",
      token: "tok",
      fetchImpl: fakeFetch,
    });
    const messages = await client.readMyInbox();
    assert.deepEqual(messages, []);
  });

  it("returns an empty array on malformed JSON-RPC payload", async () => {
    const { fetch: fakeFetch } = makeFakeFetch(() => ({
      ok: true,
      json: { jsonrpc: "2.0", id: 1, result: { content: [{ text: "not-json{" }] } },
    }));
    const client = new NeuraMdClient({
      url: "http://example/mcp",
      token: "tok",
      fetchImpl: fakeFetch,
    });
    const messages = await client.readMyInbox();
    assert.deepEqual(messages, []);
  });
});

describe("NeuraMdClient.resolveNoteById", () => {
  it("calls resolve_note_by_id and returns the note summary", async () => {
    const { fetch: fakeFetch, calls } = makeFakeFetch(() => ({
      ok: true,
      json: {
        jsonrpc: "2.0",
        id: 1,
        result: {
          content: [
            {
              text: JSON.stringify({
                id: "8f6903e4-4b3c-435e-b13d-dce13f81c20d",
                slug: "gerente",
                title: "Gerente",
                tags: ["agente-team", "agente-gerente"],
              }),
            },
          ],
        },
      },
    }));
    const client = new NeuraMdClient({ url: "http://example/mcp", token: "t", fetchImpl: fakeFetch });
    const note = await client.resolveNoteById("8f6903e4-4b3c-435e-b13d-dce13f81c20d");

    assert.ok(note);
    assert.equal(note?.slug, "gerente");
    assert.equal(note?.title, "Gerente");
    assert.deepEqual(note?.tags, ["agente-team", "agente-gerente"]);

    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.params.name, "resolve_note_by_id");
    assert.equal(body.params.arguments.id, "8f6903e4-4b3c-435e-b13d-dce13f81c20d");
  });

  it("returns null when the gateway response can't be parsed", async () => {
    const { fetch: fakeFetch } = makeFakeFetch(() => ({
      ok: true,
      json: { jsonrpc: "2.0", id: 1, result: { content: [{ text: "{}" }] } },
    }));
    const client = new NeuraMdClient({ url: "http://example/mcp", token: "t", fetchImpl: fakeFetch });
    const note = await client.resolveNoteById("does-not-matter");
    assert.equal(note, null);
  });
});
