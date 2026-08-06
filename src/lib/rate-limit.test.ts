import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, resetRateLimits } from './rate-limit';

describe('rateLimit', () => {
  beforeEach(resetRateLimits);

  it('allows exactly `limit` requests inside the window', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit('k', 5, 60_000, t0 + i).ok).toBe(true);
    }
    expect(rateLimit('k', 5, 60_000, t0 + 5).ok).toBe(false);
  });

  it('reports how long to wait', () => {
    const t0 = 1_000_000;
    rateLimit('k', 1, 60_000, t0);
    const blocked = rateLimit('k', 1, 60_000, t0 + 10_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50);
  });

  it('opens back up once the window rolls over', () => {
    const t0 = 1_000_000;
    rateLimit('k', 1, 60_000, t0);
    expect(rateLimit('k', 1, 60_000, t0 + 1).ok).toBe(false);
    expect(rateLimit('k', 1, 60_000, t0 + 60_001).ok).toBe(true);
  });

  it('keeps separate keys independent', () => {
    const t0 = 1_000_000;
    rateLimit('a', 1, 60_000, t0);
    expect(rateLimit('a', 1, 60_000, t0).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000, t0).ok).toBe(true);
  });
});
