import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Liveness: is this process able to serve a request at all?
 *
 * Touches nothing external, on purpose. A liveness probe that consults the
 * database reports "dead" during a database outage, and an orchestrator that
 * believes it restarts every healthy instance it has - turning a dependency
 * outage into a restart storm on top of a dependency outage. Readiness is where
 * dependencies belong; this endpoint answers only "is the runtime up".
 *
 * Deliberately says nothing else: no version, no region, no configuration.
 */
export function GET() {
  return NextResponse.json(
    { status: 'ok' },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
