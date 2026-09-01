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
   * Resolves when the queue is idle again for the caller that started the run;
   * a caller that arrived mid-run resolves immediately, since its text has been
   * handed to the run already in progress.
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

  return {
    get busy() {
      return running;
    },

    async submit(text: string): Promise<void> {
      queued = text;
      if (running) return;

      running = true;
      try {
        while (queued !== null) {
          const next = queued;
          queued = null;
          // `send` reports failure through its own state, not by throwing; a
          // rejection here must still release the queue rather than wedge it.
          await send(next);
        }
      } finally {
        running = false;
      }
    },
  };
}

/** The request body every save path uses, so the two cannot drift apart. */
export function saveRequestInit(content: string, keepalive = false): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    ...(keepalive ? { keepalive: true } : {}),
  };
}

/**
 * The one-shot save a page teardown gets.
 *
 * `keepalive` is what lets the request outlive the document; without it the
 * browser cancels an in-flight fetch as the page goes away, which is precisely
 * when the debounce is most likely to be holding something. Fire-and-forget by
 * construction: there is no longer a component to tell about the outcome.
 *
 * Returns whether anything was sent, so the caller can be tested without a DOM.
 */
export function flushPendingSave(
  slug: string,
  content: string | null,
  fetchImpl: typeof fetch = globalThis.fetch
): boolean {
  if (content === null) return false;

  try {
    void Promise.resolve(
      fetchImpl(`/api/rooms/${encodeURIComponent(slug)}/save`, saveRequestInit(content, true))
    ).catch(() => {
      /* nothing left to tell: the page is gone */
    });
  } catch {
    return false;
  }

  return true;
}
