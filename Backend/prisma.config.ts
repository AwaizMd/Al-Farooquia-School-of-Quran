import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

if (!process.env.DATABASE_URL && existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
