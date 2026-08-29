import { randomUUID } from 'node:crypto';
import { isErrorCode, providerCodeOf, ErrorCode, type ErrorCodeValue } from './errors';

/**
 * Structured logging with an allowlist, not a redaction list.
 *
 * The distinction is the whole design. A denylist ("strip anything called
 * `pin`") is a promise you renew every time somebody adds a field: the day a
 * handler logs `{ body }` for a quick debug, the room's content is in the log
 * and no rule fired, because nothing was called `pin`. An allowlist inverts the
 * default — a field nobody thought about is dropped, and the failure mode of
 * forgetting is a missing dimension rather than a leaked one.
 *
 * So {@link LOG_FIELDS} is exhaustive, and everything else is discarded. There
 * is deliberately no escape hatch: no `extra`, no `meta`, no `...rest`. Adding a
 * field means editing this file, which is where someone will ask whether it
 * belongs in a log at all.
 *
 * What can never be in here, by construction rather than by care:
 *
 *   room content · PIN or PIN hash · owner or access token · any cookie ·
 *   the authorization header · the room slug · filenames · raw IP ·
 *   raw user agent · URL fragments
 *
 * The slug is the one that surprises people. It looks like an identifier, but
 * for a room with no PIN the URL *is* the credential, so a slug in a log line
 * is a password in a log line. `roomRef` — an HMAC — is what goes in its place.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Every field that may ever appear in a log line. Order is emission order,
 * chosen so the columns a human scans first come first.
 */
export const LOG_FIELDS = [
  'timestamp',
  'level',
  'event',
  'requestId',
  'route',
  'method',
  'status',
  'outcome',
  'errorCode',
  'providerCode',
  'durationMs',
  // Pseudonymous room id (HMAC). Never the slug.
  'roomRef',
  // 'owner' | 'recipient' | 'system'. A class, never a capability.
  'actor',
  // Named rate-limit policy, e.g. 'pin_verify'.
  'policy',
  // What the line is about, drawn from a closed application vocabulary: an
  // analytics event name, a background job name. Never a user-supplied string -
  // that is the whole reason it is a separate field from `event` rather than
  // being interpolated into it.
  'subject',
  // True when a subsystem is running in a reduced mode.
  'degraded',
  // Job counters.
  'deletedRooms',
  'deletedObjects',
  'failedObjects',
  'pendingWork',
  'attempts',
  'findings',
] as const;

export type LogField = (typeof LOG_FIELDS)[number];

export interface LogRecord {
  event: string;
  requestId?: string;
  route?: string;
  method?: string;
  status?: number;
  outcome?: 'success' | 'failure' | 'degraded';
  errorCode?: ErrorCodeValue;
  providerCode?: string;
  durationMs?: number;
  roomRef?: string;
  actor?: 'owner' | 'recipient' | 'system';
  policy?: string;
  subject?: string;
  degraded?: boolean;
  deletedRooms?: number;
  deletedObjects?: number;
  failedObjects?: number;
  pendingWork?: number;
  attempts?: number;
  findings?: number;
}

const ALLOWED: ReadonlySet<string> = new Set(LOG_FIELDS);

/**
 * Values are constrained as well as keys.
 *
 * An allowlisted key with an unconstrained value is only half a fence: the
 * fastest way to get room content into a log is to put it in a field that is
 * allowed to hold a string. Strings are capped and stripped of newlines (a log
 * line that can contain a newline can forge a second log line); objects, arrays
 * and functions are refused outright, since nothing in {@link LogRecord} is one
 * and a nested object is exactly how a whole database row arrives by accident.
 */
const MAX_STRING = 200;

function sanitize(value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const flat = value.replace(/[\r\n\t]+/g, ' ').trim();
  if (flat === '') return undefined;
  return flat.length > MAX_STRING ? flat.slice(0, MAX_STRING) : flat;
}

/**
 * The allowlist applied. Exported because the redaction tests assert against
 * this directly rather than against stdout — a test that scrapes console output
 * passes for the wrong reason the moment the transport changes.
 */
export function buildLogLine(level: LogLevel, record: LogRecord): Record<string, unknown> {
  const source = record as unknown as Record<string, unknown>;
  const line: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
  };

  for (const field of LOG_FIELDS) {
    if (field === 'timestamp' || field === 'level') continue;
    if (!(field in source)) continue;
    const value = sanitize(source[field]);
    if (value !== undefined) line[field] = value;
  }

  return line;
}

/** Where lines go. Swapped by tests and by a future log shipper. */
export type LogSink = (level: LogLevel, line: Record<string, unknown>) => void;

const consoleSink: LogSink = (level, line) => {
  const text = JSON.stringify(line);
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
};

let sink: LogSink = consoleSink;

/** Test seam. Returns the previous sink so a test can restore it. */
export function setLogSink(next: LogSink | null): LogSink {
  const previous = sink;
  sink = next ?? consoleSink;
  return previous;
}

function emit(level: LogLevel, record: LogRecord): void {
  // A logger that can throw turns a handled error into an unhandled one.
  try {
    sink(level, buildLogLine(level, record));
  } catch {
    /* never let logging break a request */
  }
}

export const log = {
  debug: (record: LogRecord) => emit('debug', record),
  info: (record: LogRecord) => emit('info', record),
  warn: (record: LogRecord) => emit('warn', record),
  error: (record: LogRecord) => emit('error', record),
};

/**
 * Correlation id for one request.
 *
 * Reuses an inbound `x-request-id` so a line here can be joined to the proxy's
 * line for the same request, but only after checking its shape: the header is
 * attacker-controlled, and an unvalidated one is a free field in every log line
 * this request produces — newlines and all.
 */
export function requestIdFrom(headers: { get(name: string): string | null }): string {
  const inbound = headers.get('x-request-id') ?? headers.get('x-vercel-id');
  if (inbound && /^[A-Za-z0-9_:.-]{8,64}$/.test(inbound)) return inbound;
  return randomUUID();
}

/**
 * An unknown thrown value reduced to two safe facts: which of our codes it maps
 * to, and the provider's own code if it published one.
 *
 * This is the only bridge between a caught error and a log line, and it is
 * intentionally lossy — the message, the stack, the `details` and the `hint`
 * all stop here. `hint` in particular reads like help and is frequently a
 * verbatim echo of the failing value.
 */
export function classifyError(
  error: unknown,
  fallback: ErrorCodeValue = ErrorCode.INTERNAL
): { errorCode: ErrorCodeValue; providerCode?: string } {
  if (isErrorCode((error as { errorCode?: unknown })?.errorCode)) {
    return {
      errorCode: (error as { errorCode: ErrorCodeValue }).errorCode,
      providerCode: providerCodeOf(error),
    };
  }
  return { errorCode: fallback, providerCode: providerCodeOf(error) };
}
