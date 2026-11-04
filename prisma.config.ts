// Prisma 7 CLI config. The app itself connects through src/lib/db.ts (pg driver adapter).
// Migrations use the DIRECT connection (port 5432); the pooled URL (port 6543) is for the app.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not required for `prisma generate` / `prisma validate`, so missing env is fine at build time.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
