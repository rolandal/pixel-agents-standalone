import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { InboxPoller, MAX_SEEN_IDS, type BubbleEvent } from "../inbox-poller.js";
import type { InboxMessage, NeuraMdClient } from "../neuramd-client.js";

function fakeMessage(id: string, fromSlug = "gerente", content = "ping"): InboxMessage {
  return {
    id,
    fromSlug,
    fromTitle: fromSlug,
    content,
    createdAt: "2026-05-02T16:00:00-03:00",
  };
}

class StubClient {
  public callCount = 0;
  constructor(private inbox: InboxMessage[]) {}

  setInbox(messages: InboxMessage[]): void {
    this.inbox = messages;
  }

  async readMyInbox(): Promise<InboxMessage[]> {
    this.callCount++;
    return this.inbox;
  }
  async resolveNoteById(): Promise<null> {
    return null;
  }
}

function asClient(stub: StubClient): NeuraMdClient {
  return stub as unknown as NeuraMdClient;
}

function captureBubbles(poller: InboxPoller): BubbleEvent[] {
  const events: BubbleEvent[] = [];
  poller.on("bubble", (e: BubbleEvent) => events.push(e));
  return events;
}

describe("InboxPoller.tick", () => {
  it("calls the client once per cycle", async () => {
    const stub = new StubClient([]);
    const poller = new InboxPoller({ client: asClient(stub) });

    await poller.tick();
    await poller.tick();

    assert.equal(stub.callCount, 2);
  });

  it("emits a bubble per pending message, anchored on the sender's slug", async () => {
    const stub = new StubClient([
      fakeMessage("m1", "gerente", "hello"),
      fakeMessage("m2", "especialista-neuramd", "PR pronto"),
    ]);
    const poller = new InboxPoller({ client: asClient(stub) });
    const bubbles = captureBubbles(poller);

    await poller.tick();

    assert.equal(bubbles.length, 2);
    assert.equal(bubbles[0].bubbleOnSlug, "gerente");
    assert.equal(bubbles[0].message.id, "m1");
    assert.equal(bubbles[1].bubbleOnSlug, "especialista-neuramd");
    assert.equal(bubbles[1].message.content, "PR pronto");
  });

  it("does not re-emit messages that were already seen on a previous tick", async () => {
    // Simulates the gateway returning the same message on every tick because
    // the receiving agent never marks it delivered (read-only polling).
    const stub = new StubClient([fakeMessage("m1")]);
    const poller = new InboxPoller({ client: asClient(stub) });
    const bubbles = captureBubbles(poller);

    await poller.tick();
    await poller.tick();
    await poller.tick();

    assert.equal(bubbles.length, 1);
    assert.equal(bubbles[0].message.id, "m1");
  });

  it("emits bubbles for new ids even when older ones are still pending", async () => {
    const stub = new StubClient([fakeMessage("m1")]);
    const poller = new InboxPoller({ client: asClient(stub) });
    const bubbles = captureBubbles(poller);

    await poller.tick();
    stub.setInbox([fakeMessage("m1"), fakeMessage("m2", "agenda", "novo")]);
    await poller.tick();

    assert.equal(bubbles.length, 2);
    assert.equal(bubbles[1].message.id, "m2");
    assert.equal(bubbles[1].bubbleOnSlug, "agenda");
  });

  it("skips messages without a from_slug (no character to anchor the bubble)", async () => {
    const stub = new StubClient([fakeMessage("m1", "")]);
    const poller = new InboxPoller({ client: asClient(stub) });
    const bubbles = captureBubbles(poller);

    await poller.tick();

    assert.equal(bubbles.length, 0);
    // Message id was still recorded so we don't re-process it next cycle.
    assert.equal(poller.seenCount(), 1);
  });

  it("bounds the seen set at MAX_SEEN_IDS", async () => {
    const stub = new StubClient([]);
    const poller = new InboxPoller({ client: asClient(stub) });

    for (let i = 0; i < MAX_SEEN_IDS + 25; i++) {
      stub.setInbox([fakeMessage(`m${i}`)]);
      await poller.tick();
    }

    assert.equal(poller.seenCount(), MAX_SEEN_IDS);
  });
});

describe("InboxPoller.start/stop", () => {
  it("schedules ticks via the injected scheduler and clears on stop", () => {
    let scheduledCb: (() => void) | null = null;
    let scheduledMs = 0;
    let cleared = false;
    const handle = Symbol("timer");

    const poller = new InboxPoller({
      client: asClient(new StubClient([])),
      intervalMs: 1234,
      scheduler: {
        set: (cb, ms) => {
          scheduledCb = cb;
          scheduledMs = ms;
          return handle;
        },
        clear: (h) => {
          cleared = h === handle;
        },
      },
    });

    poller.start();
    assert.equal(scheduledMs, 1234);
    assert.ok(scheduledCb, "scheduler.set should have been called");

    poller.stop();
    assert.equal(cleared, true);
  });

  it("is idempotent — calling start twice still results in a single timer", () => {
    let scheduleCount = 0;
    const poller = new InboxPoller({
      client: asClient(new StubClient([])),
      scheduler: {
        set: () => {
          scheduleCount++;
          return Symbol();
        },
        clear: () => {},
      },
    });

    poller.start();
    poller.start();
    assert.equal(scheduleCount, 1);
  });
});
