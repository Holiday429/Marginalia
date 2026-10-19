/* Marginalia · AI gateway limits.
   FREE_AI_MONTHLY and PRO_AI_MONTHLY_FAIR_USE are product decisions; the Pro value is a
   placeholder until pricing is fixed (see docs/open-questions.md, Q1.2-a). */

export const FREE_AI_MONTHLY = 10;
export const PRO_AI_MONTHLY_FAIR_USE = 300;

export const RATE_LIMIT_PER_MINUTE = 10;
export const RATE_LIMIT_PER_DAY = 200;

export const AI_PROVIDER = 'deepseek';
export const AI_MODEL = 'deepseek-chat';

/** Origins allowed to call the gateway from a browser. Set ALLOWED_ORIGINS (comma-separated) in production. */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  // Safe default: local development only. Production must set ALLOWED_ORIGINS.
  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}

/** Origin to redirect back to after checkout. Null = the request came from a disallowed origin. */
export function resolveAppOrigin(origin: string | undefined, allowed: string[]): string | null {
  if (!origin) return allowed[0] ?? null;
  return allowed.includes(origin) ? origin : null;
}
