import { describe, it, expect, vi } from 'vitest';
import { createSaveQueue, flushPendingSave, saveRequestInit } from './save-queue';

/**
 * The room's text is last-write-wins over the whole document, so the order
 * requests arrive in *is* the correctness of the feature. These tests exist
 * because that order used to be whatever the network felt like: saves were
 * fired as they were produced, and a retry could carry text the person had
 * already replaced.
 */

/** A sender that resolves only when the test says so, so overlap is observable. */
function controllableSender() {
  const sent: string[] = [];
  const resolvers: Array<() => void> = [];

  const send = (text: string) => {
    sent.push(text);
    return new Promise<void>((resolve) => resolvers.push(resolve));
  };

  return {
    send,
    sent,
    /** Let the oldest outstanding send finish. */
    async settle() {
      resolvers.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    },
    get outstanding() {
      return resolvers.length;
    },
  };
}

describe('one save at a time', () => {
  it('never lets a second request start while the first is in flight', async () => {
    const net = controllableSender();
    const queue = createSaveQueue(net.send);

    void queue.submit('one');
    void queue.submit('two');
    await Promise.resolve();

    // Two overlapping requests can be reordered by the network, and the one
    // that lands second wins whatever it happens to contain.
    expect(net.sent).toEqual(['one']);
    expect(queue.busy).toBe(true);
  });

  it('sends the queued text once the first finishes', async () => {
    const net = controllableSender();
    const queue = createSaveQueue(net.send);

    void queue.submit('one');
    void queue.submit('two');
    await net.settle();

    expect(net.sent).toEqual(['one', 'two']);
  });

  it('is idle again after the queue drains', async () => {
    const net = controllableSender();
    const queue = createSaveQueue(net.send);

    void queue.submit('one');
    await net.settle();

    expect(queue.busy).toBe(false);
    expect(net.outstanding).toBe(0);
  });
});

describe('coalescing', () => {
  it('keeps only the newest text of everything offered while busy', async () => {
    const net = controllableSender();
    const queue = createSaveQueue(net.send);

    void queue.submit('v1');
    void queue.submit('v2');
    void queue.submit('v3');
    void queue.submit('v4');
    await net.settle();

    // Sending the intermediate versions would mean deliberately transmitting
    // text already known to be stale, and each one is a chance to land last.
    expect(net.sent).toEqual(['v1', 'v4']);
  });

  it('never lets an older text land after a newer one', async () => {
    const net = controllableSender();
    const queue = createSaveQueue(net.send);

    // The exact shape of the bug: a retry of the failed text fires next to a
    // debounced save carrying what the person has typed since.
    void queue.submit('typed-later');
    void queue.submit('failed-earlier');
    await net.settle();
    await net.settle();

    expect(net.sent[net.sent.length - 1]).toBe('failed-earlier');
    // …which is why the component resends the newest text rather than the copy
    // that failed. The queue guarantees order, not choice of content; the two
    // together are what make a retry safe.
    expect(net.sent).toHaveLength(2);
  });
});

describe('a failing send', () => {
  it('releases the queue so the next save is not wedged behind it', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('network gone'));
    const queue = createSaveQueue(failing);

    await expect(queue.submit('one')).rejects.toThrow('network gone');

    expect(queue.busy).toBe(false);

    const ok = vi.fn().mockResolvedValue(undefined);
    await createSaveQueue(ok).submit('two');
    expect(ok).toHaveBeenCalledWith('two');
  });

  it('still delivers text queued behind a send that resolves with a failure', async () => {
    const sent: string[] = [];
    // The component's sender reports failure through its own state rather than
    // by throwing, which is the path that actually runs in production.
    const queue = createSaveQueue(async (text) => {
      sent.push(text);
    });

    await queue.submit('one');
    await queue.submit('two');

    expect(sent).toEqual(['one', 'two']);
  });
});

describe('the teardown flush', () => {
  it('sends what the debounce was still holding, with keepalive', () => {
    const fetchImpl = vi.fn().mockResolvedValue(undefined);

    expect(flushPendingSave('quiet-fox-k3n8xq2p', 'pasted at the last second', fetchImpl)).toBe(
      true
    );

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/rooms/quiet-fox-k3n8xq2p/save');
    // Without `keepalive` the browser cancels the request as the page goes
    // away, which is precisely when the debounce is most likely to be holding
    // something.
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body)).toEqual({ content: 'pasted at the last second' });
  });

  it('sends nothing when there is nothing pending', () => {
    const fetchImpl = vi.fn();

    expect(flushPendingSave('quiet-fox-k3n8xq2p', null, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends an empty document, which is a real edit', () => {
    const fetchImpl = vi.fn().mockResolvedValue(undefined);

    // Clearing the buffer and closing the tab is a save, not a no-op. Treating
    // '' as "nothing to send" would make deletion the one edit that never
    // survives a teardown.
    expect(flushPendingSave('quiet-fox-k3n8xq2p', '', fetchImpl)).toBe(true);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ content: '' });
  });

  it('does not throw when the browser refuses the request outright', () => {
    const fetchImpl = vi.fn(() => {
      throw new Error('page is gone');
    });

    expect(flushPendingSave('quiet-fox-k3n8xq2p', 'text', fetchImpl)).toBe(false);
  });

  it('builds the same body as a normal save', () => {
    const normal = saveRequestInit('same text');
    const teardown = saveRequestInit('same text', true);

    expect(normal.body).toBe(teardown.body);
    expect(normal.method).toBe('POST');
    expect(normal.keepalive).toBeUndefined();
  });
});
