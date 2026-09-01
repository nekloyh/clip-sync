/**
 * What this browser still owes the server.
 *
 * This exists because the answer used to be spread across two refs that nobody
 * kept in step: one holding whether a save had failed, the other holding the
 * text a resend would carry. Three different places wrote to them, the rule
 * binding them was written down nowhere, and the gap between them was a way to
 * lose somebody's writing.
 *
 * The failure it prevents, concretely. A save fails, so a resend is armed. A
 * moment later a *different* person's save arrives and this browser adopts the
 * server's text — the textarea now shows their words, and the local edit that
 * failed is gone from the screen. Nothing disarmed the resend, and the resend
 * sends the newest text it knows of, which is now the other person's. So a
 * reconnect fires it without anyone touching anything and puts back a copy of a
 * version that has since been written over: an older text overwriting a newer
 * one, which is the exact thing {@link ./save-queue} was built to make
 * impossible, arrived at from the other side.
 *
 * The rule, in one line: **a resend carries the newest text, and only exists
 * while this browser is the one holding something unsent.** Adopting the
 * server's version ends that, because there is then nothing of this browser's
 * left to send.
 *
 * Deliberately a plain object rather than component state: the rule is worth
 * proving, and proving it inside a React component would need a DOM, a renderer
 * and a fake network.
 */
export interface UnsentEdit {
  /** The person typed. Always the newest text this browser holds. */
  edited(text: string): void;
  /** A save failed. There is now something to resend. */
  failed(): void;
  /** A save landed. Nothing is owed. */
  saved(): void;
  /**
   * The server's version was adopted, replacing what was on screen.
   *
   * This both updates the newest text and disarms the resend, and the second
   * half is the point: the edit that failed is no longer anywhere, so there is
   * nothing to resend, and resending what replaced it would send the room
   * backwards.
   */
  superseded(text: string): void;
  /** The newest text this browser holds, saved or not. */
  readonly latest: string;
  /** The text a resend should carry, or `null` when nothing is owed. */
  readonly resend: string | null;
}

export function createUnsentEdit(initial: string): UnsentEdit {
  let latest = initial;
  let owed = false;

  return {
    edited(text: string) {
      latest = text;
    },
    failed() {
      owed = true;
    },
    saved() {
      owed = false;
    },
    superseded(text: string) {
      latest = text;
      owed = false;
    },
    get latest() {
      return latest;
    },
    get resend() {
      return owed ? latest : null;
    },
  };
}
