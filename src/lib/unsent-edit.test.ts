import { describe, it, expect } from 'vitest';
import { createUnsentEdit } from './unsent-edit';

/**
 * The room's text is last-write-wins over the whole document, so anything that
 * resends an old version is a way to undo somebody's writing. `save-queue.ts`
 * stops that happening between two requests from this browser; this stops it
 * happening between this browser and everyone else.
 */

describe('what a resend carries', () => {
  it('offers nothing while every save has landed', () => {
    const edit = createUnsentEdit('start');
    edit.edited('typed');

    expect(edit.resend).toBeNull();
  });

  it('offers the newest text, not the copy that failed', () => {
    const edit = createUnsentEdit('start');
    edit.edited('failed-text');
    edit.failed();
    edit.edited('typed-since');

    // Resending the copy that failed would undo everything typed after it. The
    // document is last-write-wins in full, so the newest version is always the
    // correct thing to send.
    expect(edit.resend).toBe('typed-since');
  });

  it('stops offering anything once a save lands', () => {
    const edit = createUnsentEdit('start');
    edit.edited('text');
    edit.failed();
    edit.saved();

    expect(edit.resend).toBeNull();
  });
});

describe('when somebody else writes to the room', () => {
  it('disarms the resend, so a reconnect cannot echo their text back', () => {
    const edit = createUnsentEdit('start');
    edit.edited('mine');
    edit.failed();

    // Their save arrives and this browser adopts it: the textarea now shows
    // their words and the edit that failed is gone from the screen.
    edit.superseded('theirs-v1');

    // Left armed, the `online` handler fires with no one touching anything and
    // posts `theirs-v1` — which by then has been written over by `theirs-v2`.
    // An older text overwriting a newer one, with nobody's edit to justify it.
    expect(edit.resend).toBeNull();
    expect(edit.latest).toBe('theirs-v1');
  });

  it('arms again when this browser types after adopting their text', () => {
    const edit = createUnsentEdit('start');
    edit.failed();
    edit.superseded('theirs');
    edit.edited('mine-after-theirs');
    edit.failed();

    // A genuine local edit that failed is still owed, and it is the newest
    // text — disarming on `superseded` must not make the browser stop
    // retrying its own work.
    expect(edit.resend).toBe('mine-after-theirs');
  });

  it('keeps reporting the newest text even with nothing owed', () => {
    const edit = createUnsentEdit('start');
    edit.superseded('theirs');

    expect(edit.latest).toBe('theirs');
    expect(edit.resend).toBeNull();
  });
});
