/**
 * Periodic inbox polling for the bound viewer agent.
 *
 * Runs a single setInterval that fetches the viewer's inbox from the NeuraMD
 * gateway and emits `bubble` events for each unseen message. The webview
 * renders each bubble above the *sender's* character (`message.fromSlug`),
 * so the operator sees what the rest of the team is saying *to the viewer*.
 *
 * Why polling and not push: the gateway has no streaming notification for
 * new inbox entries — the platform team has flagged this as a structural
 * gap ("wake-on-inbox" spec). When a push channel exists, this poller
 * becomes a fallback.
 *
 * Why one inbox and not all: `read_my_inbox` is scoped to the bearer-bound
 * agent. A future per-slug variant would let the poller cover every team
 * member's inbox; until then, we cover the viewer's surface area only.
 *
 * Memory: the seen-id set is bounded to MAX_SEEN_IDS to prevent unbounded
 * growth on long-lived poller instances.
 */

import { EventEmitter } from "events";
import type { InboxMessage, NeuraMdClient } from "./neuramd-client.js";

export const DEFAULT_POLL_INTERVAL_MS = 30_000;
export const DEFAULT_MAX_PENDING = 10;
export const MAX_SEEN_IDS = 100;

export interface BubbleEvent {
  /** Slug the bubble should render above (sender of the inbox message). */
  bubbleOnSlug: string;
  message: InboxMessage;
}

export interface InboxPollerOptions {
  client: NeuraMdClient;
  intervalMs?: number;
  /** Override setInterval/clearInterval for tests. */
  scheduler?: {
    set: (cb: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
}

export class InboxPoller extends EventEmitter {
  private readonly client: NeuraMdClient;
  private readonly intervalMs: number;
  private readonly scheduler: NonNullable<InboxPollerOptions["scheduler"]>;
  private timerHandle: unknown = null;
  // Insertion-ordered set of recent message ids (FIFO eviction at MAX_SEEN_IDS).
  private readonly seen = new Set<string>();

  constructor(opts: InboxPollerOptions) {
    super();
    this.client = opts.client;
    this.intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.scheduler = opts.scheduler ?? {
      set: (cb, ms) => setInterval(cb, ms),
      clear: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    };
  }

  start(): void {
    if (this.timerHandle !== null) return;
    this.timerHandle = this.scheduler.set(() => {
      void this.tick();
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timerHandle === null) return;
    this.scheduler.clear(this.timerHandle);
    this.timerHandle = null;
  }

  /**
   * One polling cycle. Public so tests can drive it directly without waiting
   * on a timer; production code only invokes this through `start`.
   */
  async tick(): Promise<void> {
    const messages = await this.client.readMyInbox(DEFAULT_MAX_PENDING);
    if (messages.length === 0) return;

    for (const message of messages) {
      if (this.seen.has(message.id)) continue;
      this.seen.add(message.id);
      // Empty `from_slug` is possible if the gateway omits it (e.g. system
      // messages). Skip the bubble — there's no character to render above.
      if (!message.fromSlug) continue;
      this.emit("bubble", { bubbleOnSlug: message.fromSlug, message } satisfies BubbleEvent);
    }

    // FIFO eviction once we exceed the cap.
    if (this.seen.size > MAX_SEEN_IDS) {
      const overflow = this.seen.size - MAX_SEEN_IDS;
      const ids = Array.from(this.seen);
      for (let i = 0; i < overflow; i++) this.seen.delete(ids[i]);
    }
  }

  /** Test hook: number of unique message ids the poller has seen. */
  seenCount(): number {
    return this.seen.size;
  }
}
