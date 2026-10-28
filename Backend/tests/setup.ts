import { afterAll } from 'vitest'
import { prisma } from '../src/database/prisma.js'

afterAll(async () => {
  await prisma.$disconnect()
})
