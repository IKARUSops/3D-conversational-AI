/**
 * Test database: PGlite (Postgres in WASM) behind a local socket, so Prisma 7 + the pg driver
 * adapter run unchanged. Applies the real migration SQL files (prisma/migrations/*).
 * No network. See docs/DECISIONS.md A-02.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export interface TestDb {
  prisma: PrismaClient;
  stop: () => Promise<void>;
}

const MIGRATIONS_DIR = join(process.cwd(), "prisma", "migrations");

export async function startTestDb(): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { pg_trgm } });
  // Prisma's own table, so 0002 can enable RLS on it like on Supabase.
  await pg.exec(`create table "_prisma_migrations" (id text primary key)`);
  // Supabase roles do not exist in PGlite; nothing in our SQL needs them.
  for (const dir of readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d{4}_/.test(d))
    .sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
  }
  const port = 15000 + Math.floor(Math.random() * 20000);
  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1" });
  await server.start();
  const adapter = new PrismaPg({
    connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    max: 1,
  });
  const prisma = new PrismaClient({ adapter });
  return {
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await server.stop();
      await pg.close();
    },
  };
}
