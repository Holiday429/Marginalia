/* Marginalia · typed environment config, sourced from import.meta.env (Vite) */

export const ENV = {
  FIREBASE_API_KEY:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  FIREBASE_AUTH_DOMAIN:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  FIREBASE_PROJECT_ID:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  FIREBASE_STORAGE_BUCKET:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  FIREBASE_MESSAGING_SENDER_ID:import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  FIREBASE_APP_ID:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
  WORKSPACE_ID:                import.meta.env.VITE_WORKSPACE_ID                as string,
  AI_GATEWAY_URL:              import.meta.env.VITE_AI_GATEWAY_URL              as string,
  SENTRY_DSN:                  import.meta.env.VITE_SENTRY_DSN                  as string | undefined,
  POSTHOG_KEY:                 import.meta.env.VITE_POSTHOG_KEY                 as string | undefined,
  POSTHOG_HOST:                import.meta.env.VITE_POSTHOG_HOST                as string | undefined,
} as const;
