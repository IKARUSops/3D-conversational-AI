-- =============================================================================
-- 001_constraints_rls.sql: things Prisma cannot express in schema.prisma
-- (SRS 2 section 6.2)
--
-- HOW TO APPLY: nothing to do by hand. This file is copied as
-- prisma/migrations/0002_constraints_rls/migration.sql, so `pnpm db:deploy`
-- (prisma migrate deploy) applies it right after 0001_init. Keep both copies equal.
--
-- WARNING: Prisma does not know about the partial unique index or the trigram
-- index below. Check EVERY later migration.sql for `DROP INDEX` lines on
-- "appointments_doctor_slot_active" or "patients_name_trgm" and delete them.
-- =============================================================================

-- No double booking (FR-C19): one active appointment per doctor per slot.
create unique index if not exists appointments_doctor_slot_active
  on appointments (doctor_id, slot_start)
  where status in ('booked', 'rescheduled');

-- Search helpers for the portal (name search).
create extension if not exists pg_trgm;
create index if not exists patients_name_trgm
  on patients using gin ((coalesce(full_name_en, '') || ' ' || coalesce(full_name_bn, '')) gin_trgm_ops);

-- Row level security: deny everything to the anon and authenticated browser roles.
-- No policies are created on purpose. All data access goes through the server
-- (Prisma connects as the database owner, which bypasses RLS).
alter table clinics              enable row level security;
alter table staff_users          enable row level security;
alter table doctors              enable row level security;
alter table doctor_schedules     enable row level security;
alter table services             enable row level security;
alter table patients             enable row level security;
alter table calls                enable row level security;
alter table transcript_turns     enable row level security;
alter table call_extractions     enable row level security;
alter table appointments         enable row level security;
alter table appointment_history  enable row level security;
alter table callbacks            enable row level security;
alter table call_events          enable row level security;
alter table provider_keys        enable row level security;
alter table demo_requests        enable row level security;
alter table rate_limits          enable row level security;
alter table _prisma_migrations   enable row level security;

-- No Supabase realtime: the portal polls (router.refresh every 5 s).
