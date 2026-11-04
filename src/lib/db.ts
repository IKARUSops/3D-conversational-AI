/**
 * Prisma client singleton (Prisma 7 + pg driver adapter).
 *
 * - Lazy: the client is created on first use, so importing this file never needs DATABASE_URL
 *   (important for `next build`).
 * - DATABASE_URL is the Supabase POOLED url (port 6543). Keep the pool tiny on serverless.
 * - One instance per process (globalThis cache survives Next.js dev hot reload).
 */
import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString, max: 3 });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Returns the shared Prisma client. Throws if DATABASE_URL is missing. */
export function getDb(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Convenience proxy: `db.call.findMany(...)` works like a normal client but is created lazily
 * on first property access.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = Reflect.get(client, prop) as unknown;
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
});

export type { PrismaClient };
export { Prisma } from "@/generated/prisma/client";
