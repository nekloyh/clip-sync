/**
 * Ordering for a last-write-wins document.
 *
 * The room's text is saved as a whole document and the server keeps whichever
 * write arrives last, so the *order requests arrive in* is the entire
 * correctness story. Firing saves as they are produced does not guarantee that
 * order: two overlapping requests can be reordered by the network, and the one
 * that lands second wins whatever it happens to contain. The autosave debounce
 * makes overlap ordinary rather than exotic — a save can still be in flight
 * fifteen seconds later while the next one is already due — and a retry makes
 * it worse, because the text being retried is by definition older than the text
 * the person has since typed.
 *
 * The fix is to have at most one save in flight and to keep only the newest
 * text behind it. A single-slot queue is what makes that true: submissions that
 * arrive while a request is running collapse onto each other, so the next
 * request always carries the newest text and never an intermediate version that
 * would land on top of it.
 *
 * Deliberately a plain object rather than component state. It has one property
 * worth proving — that a newer text can never be overtaken by an older one —
 * and proving it inside a React component would need a DOM, a renderer and a
 * fake network. Here it needs a function that resolves.
 */

export type SaveSender = (text: string) => Promise<void>;

export interface SaveQueue {
  /**
   * Offer text to be saved.
   *
   * The returned promise reports on the *run*, not on this caller's text: a
   * caller that arrives mid-run resolves immediately, and a caller whose text
   * is replaced before it is sent resolves as though it had been. Only the
   * caller that starts a run can observe a send failing, and only the first
   * one. Callers who need the outcome of their own save must get it from the
   * sender, which is what the component does.
   */
  submit(text: string): Promise<void>;
  /** True while a send is in flight. */
  readonly busy: boolean;
}

export function createSaveQueue(send: SaveSender): SaveQueue {
  let running = false;
  // At most one. A newer submission replaces an older one that has not been
  // sent yet, because sending both would mean deliberately transmitting a
  // version already known to be stale.
  let queued: string | null = null;

  async function drain(): Promise<void> {
    running = true;
    try {
      while (queued !== null) {
        const next = queued;
        queued = null;
        await send(next);
      }
    } finally {
      running = false;
    }
  }

  return {
    /** True while a send is in flight. The property the tests assert ordering against. */
    get busy() {
      return running;
    },

    async submit(text: string): Promise<void> {
      queued = text;
      if (running) return;

      try {
        await drain();
      } finally {
        // A send that threw unwound the loop with newer text still in the slot,
        // and that text is by definition an edit made while the request was in
        // flight — it has been offered nowhere else and nothing else will pick
        // it up. Stranding it would make the queue lose exactly the writing it
        // exists to protect. Restarting swallows a second failure; the first
        // one still reaches the caller.
        if (!running && queued !== null) void drain().catch(() => {});
      }
    },
  };
}

/**
 * The request body every save path uses, so they cannot drift apart.
 *
 * `keepalive` is what lets a request outlive the document, and only the
 * teardown path needs it: without it the browser cancels an in-flight fetch as
 * the page goes away.
 */
export function saveRequestInit(content: string, keepalive = false): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    ...(keepalive ? { keepalive: true } : {}),
  };
}
