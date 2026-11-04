/**
 * Shared holder for the PGlite Prisma client. Tests do:
 *   vi.mock("@/lib/db", () => import("../support/db-mock"));
 * then `testDb.prisma = (await startTestDb()).prisma` in beforeAll.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export const testDb: { prisma: PrismaClient | null } = { prisma: null };

export function getDb(): PrismaClient {
  if (!testDb.prisma) throw new Error("test db not started");
  return testDb.prisma;
}

export const db = new Proxy({} as PrismaClient, {
  get: (_t, prop) => Reflect.get(getDb(), prop) as unknown,
});

export { Prisma } from "@/generated/prisma/client";
