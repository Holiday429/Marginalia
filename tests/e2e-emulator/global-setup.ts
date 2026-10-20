/**
 * Marginalia · Playwright globalSetup for the signed-in emulator suite.
 *
 * Why this exists
 * ---------------
 * The Functions emulator starts a fresh Node worker the first time each function is called and
 * waits `FUNCTIONS_DISCOVERY_TIMEOUT` (default 30 s) for that worker's socket. Loading
 * `functions/lib/index.js` costs ~0.3 s on an idle machine, but the suite runs a software-GL
 * Chrome next to two Vite servers and the Java Firestore emulator, and under that load the same
 * load has been measured at 28 s — enough to trip the 30 s wait and print
 * "Failed to handle request for function …" / "Failed to start functions … Failed to load function".
 * The test that happened to make the first call to a given function then failed, which is why the
 * failures moved around between runs (see docs/phase-reports/phase-2.md, "Flaky signed-in e2e").
 *
 * So before any test runs, call every HTTP-triggered function once with a deliberately invalid
 * request. We do not care about the answer — any HTTP status means the worker is up and the module
 * is loaded. From then on the pool is warm and no test pays the cold start inside its own timeout.
 *
 * The scheduled functions (`weeklyDigest`, `actionReminders`) have no HTTP endpoint; the tests that
 * exercise them call the run logic directly, which shares the same already-warm worker pool.
 */
const HOST = '127.0.0.1:5001';
const PROJECT = 'demo-marginalia';
const REGION = 'us-central1';

// Every function the suite reaches over HTTP. onCall and onRequest are both plain POST endpoints
// in the emulator, so one shape warms either kind.
const FUNCTIONS = [
  'aiGenerate',
  'billingWebhook',
  'createCheckout',
  'emailAction',
  'resolveBookGeo',
  'resolveReadingPlace',
  'profileSlugCheck',
  'deleteAccount',
];

async function warm(name: string): Promise<string> {
  const url = `http://${HOST}/${PROJECT}/${REGION}/${name}`;
  const started = Date.now();
  try {
    // No auth token and an empty body: every function rejects this early (401/400). The point is
    // only to make the emulator spawn and load the worker.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(180_000),
    });
    return `${name} ${res.status} in ${Date.now() - started}ms`;
  } catch (err) {
    // A warm-up failure is not a test failure: the suite should still run and report the real
    // problem from the test that needs the function.
    return `${name} FAILED after ${Date.now() - started}ms: ${(err as Error).message}`;
  }
}

export default async function globalSetup(): Promise<void> {
  const started = Date.now();
  // Serially: warming all eight at once recreates exactly the CPU spike this is meant to avoid.
  const lines: string[] = [];
  for (const name of FUNCTIONS) {
    lines.push(await warm(name));
  }
  console.log(`[global-setup] warmed ${FUNCTIONS.length} functions in ${Date.now() - started}ms`);
  for (const line of lines) console.log(`[global-setup]   ${line}`);
}
