import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { cronSecret } from './env';

/**
 * The bearer check shared by every operator-only endpoint.
 *
 * One implementation, because there are now three of these (cleanup, reconcile,
 * ops) and three copies of a comparison is three chances for one of them to be
 * written with `===`. The constant-time comparison is not theatre: the secret is
 * a fixed string checked on an endpoint an attacker can call as often as they
 * like, which is the exact shape a timing oracle needs.
 */
export type CronAuth = 'ok' | 'not_configured' | 'unauthorized';

export function checkCronAuth(headers: { get(name: string): string | null }): CronAuth {
  const secret = cronSecret();
  if (!secret) return 'not_configured';

  const provided = headers.get('authorization') ?? '';
  return safeEqual(provided, `Bearer ${secret}`) ? 'ok' : 'unauthorized';
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // Length is compared first and leaks only the length, which the format
  // already gives away.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
