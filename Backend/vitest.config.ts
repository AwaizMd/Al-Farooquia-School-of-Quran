import { defineConfig } from 'vitest/config'

export const TEST_DATABASE_URL = 'postgresql://madarsa:madarsa_local_only@127.0.0.1:54321/madarsa_test'

export default defineConfig({
  test: {
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL,
      CORS_ORIGINS: 'http://localhost:5173',
      APP_BASE_URL: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      // Fixed, test-only keys (never used anywhere else).
      TOKEN_HMAC_KEY: Buffer.alloc(32, 7).toString('base64'),
      MFA_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 1).toString('base64')},2:${Buffer.alloc(32, 2).toString('base64')}`,
      MFA_ACTIVE_KEY_VERSION: '2',
      SETTINGS_ENCRYPTION_KEYS: `1:${Buffer.alloc(32, 3).toString('base64')}`,
      SETTINGS_ACTIVE_KEY_VERSION: '1',
      PAYMENT_PROVIDER: 'dev',
      DEV_PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-0123456789',
      STORAGE_DIR: '.local/storage-test',
      UPLOAD_MAX_MB: '1',
    },
    // Integration tests share one database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
