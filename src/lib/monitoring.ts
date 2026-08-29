import { log, classifyError } from './log';
import type { ErrorCodeValue } from './errors';

/**
 * Error monitoring as a port with one built-in adapter.
 *
 * No vendor is added here, and none is required. The reason is not
 * minimalism - it is that an error monitor is the single most likely place for
 * this application to leak the data it promises not to keep. Every SDK on the
 * market captures, by default and helpfully, the request body, the headers
 * (including `cookie` and `authorization`), the URL with its query string, and
 * every property hanging off the thrown object. Dropping one in and configuring
 * scrubbers afterwards means shipping the leak first.
 *
 * So the port accepts only what {@link MonitoredError} allows - the same
 * allowlist the logger uses, because a monitor that redacts differently from
 * the log is a redaction policy with a hole in it. An adapter for a real vendor
 * implements this interface and can physically only forward these fields.
 */

export interface MonitoredError {
  event: string;
  errorCode: ErrorCodeValue;
  providerCode?: string;
  requestId?: string;
  route?: string;
  roomRef?: string;
  /** Present only for background jobs. */
  attempts?: number;
}

export interface ErrorMonitor {
  capture(error: MonitoredError): void;
}

/**
 * The default. Not a stub that discards: an unconfigured deployment still gets
 * every captured error at `error` level in the structured log, which is where a
 * pilot will actually be watching. A silent no-op would make "no monitor
 * configured" and "no errors" look identical.
 */
export const loggingMonitor: ErrorMonitor = {
  capture(error) {
    log.error({
      event: error.event,
      errorCode: error.errorCode,
      providerCode: error.providerCode,
      requestId: error.requestId,
      route: error.route,
      roomRef: error.roomRef,
      attempts: error.attempts,
      outcome: 'failure',
    });
  },
};

let monitor: ErrorMonitor = loggingMonitor;

export function setErrorMonitor(next: ErrorMonitor | null): ErrorMonitor {
  const previous = monitor;
  monitor = next ?? loggingMonitor;
  return previous;
}

/** Report an already-classified failure. */
export function captureError(error: MonitoredError): void {
  try {
    monitor.capture(error);
  } catch {
    /* monitoring must never be the thing that fails a request */
  }
}

/**
 * Classify a caught value and report it in one step. The raw error goes no
 * further than {@link classifyError}, which keeps only the two codes.
 */
export function captureThrown(
  thrown: unknown,
  context: Omit<MonitoredError, 'errorCode' | 'providerCode'> & {
    fallbackCode?: ErrorCodeValue;
  }
): ErrorCodeValue {
  const { fallbackCode, ...rest } = context;
  const { errorCode, providerCode } = classifyError(thrown, fallbackCode);
  captureError({ ...rest, errorCode, providerCode });
  return errorCode;
}
