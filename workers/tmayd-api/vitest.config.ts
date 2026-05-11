import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          d1Databases: ["DB"],
          d1Persist: false,
          bindings: {
            TMAYD_ENV: "test",
            TMAYD_ALLOWED_ORIGINS: "https://cbassuarez.com",
            TMAYD_HEARTBEAT_STALE_SECONDS: "90",
            TMAYD_RATE_WINDOW_SECONDS: "600",
            TMAYD_RATE_MAX_REQUESTS: "3",
            TMAYD_MIN_CHARS: "3",
            TMAYD_MAX_CHARS: "700",
            MODERATION_MODE: "deterministic_only",
            TMAYD_ALLOW_TEST_TURNSTILE: "true",
            TMAYD_ALLOW_DETERMINISTIC_ONLY_IN_PROD: "true",
            TMAYD_LEASE_SECONDS: "120",
            TMAYD_MAX_ATTEMPTS: "5",
            TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
            TMAYD_BRIDGE_TOKEN: "test-bridge-token-xxxxxxxxxxxxxxxxxx",
            TMAYD_ADMIN_TOKEN: "test-admin-token-xxxxxxxxxxxxxxxxxxxx",
            TMAYD_RATE_HASH_SALT: "test-salt"
          }
        }
      }
    }
  }
});
