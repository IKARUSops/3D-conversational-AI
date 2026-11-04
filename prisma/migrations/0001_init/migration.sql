-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('processing', 'booked', 'rescheduled', 'cancelled', 'enquiry', 'follow_up_needed', 'incomplete', 'failed', 'spam');

-- CreateEnum
CREATE TYPE "ProcessingState" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('agent', 'caller', 'system');

-- CreateEnum
CREATE TYPE "TranscriptSource" AS ENUM ('live', 'batch');

-- CreateEnum
CREATE TYPE "InputMode" AS ENUM ('voice', 'typed');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('book', 'reschedule', 'cancel', 'enquiry', 'callback', 'other', 'unknown');

-- CreateEnum
CREATE TYPE "EndReason" AS ENUM ('caller_hangup', 'agent_end', 'time_limit', 'silence', 'error', 'tab_closed');

-- CreateEnum
CREATE TYPE "SttProviderId" AS ENUM ('browser', 'elevenlabs', 'openai', 'azure');

-- CreateEnum
CREATE TYPE "TtsProviderId" AS ENUM ('elevenlabs', 'openai', 'azure');

-- CreateEnum
CREATE TYPE "KeyProvider" AS ENUM ('elevenlabs', 'openai', 'azure');

-- CreateEnum
CREATE TYPE "KeySource" AS ENUM ('platform', 'byok');

-- CreateEnum
CREATE TYPE "CallLang" AS ENUM ('bn', 'en');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'receptionist');

-- CreateEnum
CREATE TYPE "Specialty" AS ENUM ('general', 'orthodontist', 'oral_surgeon');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('booked', 'rescheduled', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "AppointmentAction" AS ENUM ('created', 'rescheduled', 'cancelled');

-- CreateEnum
CREATE TYPE "CallbackCategory" AS ENUM ('medical', 'urgent', 'complaint', 'billing', 'human_request', 'unknown_info', 'other');

-- CreateEnum
CREATE TYPE "CallbackStatus" AS ENUM ('open', 'done');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('positive', 'neutral', 'negative');

-- CreateEnum
CREATE TYPE "LanguageMix" AS ENUM ('bn', 'en', 'mixed');

-- CreateTable
CREATE TABLE "clinics" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "phone_display" TEXT,
    "address_bn" TEXT,
    "address_en" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "role" "StaffRole" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "specialty" "Specialty" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_schedules" (
    "id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doctor_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name_bn" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "fee_bdt_from" INTEGER NOT NULL,
    "fee_is_from" BOOLEAN NOT NULL DEFAULT false,
    "specialty_required" "Specialty",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "full_name_bn" TEXT,
    "full_name_en" TEXT,
    "phone_e164" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration_s" INTEGER,
    "status" "CallStatus" NOT NULL DEFAULT 'processing',
    "processing_state" "ProcessingState" NOT NULL DEFAULT 'pending',
    "intent" "Intent",
    "end_reason" "EndReason",
    "lang" "CallLang" NOT NULL DEFAULT 'bn',
    "stt_provider" "SttProviderId" NOT NULL,
    "tts_provider" "TtsProviderId" NOT NULL,
    "llm_model" TEXT,
    "key_source" "KeySource" NOT NULL DEFAULT 'platform',
    "recording_path" TEXT,
    "summary_bn" TEXT,
    "summary_en" TEXT,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "agent_state" JSONB NOT NULL DEFAULT '{}',
    "metrics" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_turns" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "text_bn" TEXT NOT NULL,
    "text_en" TEXT,
    "started_ms" INTEGER,
    "ended_ms" INTEGER,
    "source" "TranscriptSource" NOT NULL DEFAULT 'live',
    "input_mode" "InputMode",
    "interrupted" BOOLEAN NOT NULL DEFAULT false,
    "stt_confidence" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "transcript_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_extractions" (
    "id" UUID NOT NULL,
    "call_id" UUID NOT NULL,
    "intent" "Intent",
    "patient_name_bn" TEXT,
    "patient_name_en" TEXT,
    "phone_raw" TEXT,
    "phone_e164" TEXT,
    "phone_valid" BOOLEAN NOT NULL DEFAULT false,
    "reason_for_visit" TEXT,
    "service_code" TEXT,
    "doctor_requested" TEXT,
    "preferred_datetime_text" TEXT,
    "preferred_datetime" TIMESTAMPTZ(3),
    "caller_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "sentiment" "Sentiment",
    "language_mix" "LanguageMix",
    "field_confidence" JSONB,
    "validation_errors" JSONB,
    "model" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "call_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "doctor_id" UUID NOT NULL,
    "service_id" UUID,
    "slot_start" TIMESTAMPTZ(3) NOT NULL,
    "slot_end" TIMESTAMPTZ(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'booked',
    "reason" TEXT,
    "created_by_call_id" UUID,
    "updated_by_call_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_history" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "call_id" UUID,
    "action" "AppointmentAction" NOT NULL,
    "from_slot" TIMESTAMPTZ(3),
    "to_slot" TIMESTAMPTZ(3),
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callbacks" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "call_id" UUID,
    "patient_id" UUID,
    "name" TEXT,
    "phone_e164" TEXT,
    "category" "CallbackCategory" NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "status" "CallbackStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "done_by" UUID,
    "done_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "callbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" UUID NOT NULL,
    "call_id" UUID,
    "ts" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_keys" (
    "id" UUID NOT NULL,
    "clinic_id" UUID NOT NULL,
    "provider" "KeyProvider" NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "meta" JSONB,
    "validated_at" TIMESTAMPTZ(3),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "clinic_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "message" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clinics_slug_key" ON "clinics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE INDEX "staff_users_clinic_id_idx" ON "staff_users"("clinic_id");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_clinic_id_code_key" ON "doctors"("clinic_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_schedules_doctor_id_weekday_start_time_key" ON "doctor_schedules"("doctor_id", "weekday", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "services_clinic_id_code_key" ON "services"("clinic_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "patients_clinic_id_phone_e164_key" ON "patients"("clinic_id", "phone_e164");

-- CreateIndex
CREATE INDEX "calls_clinic_id_started_at_idx" ON "calls"("clinic_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "calls_status_idx" ON "calls"("status");

-- CreateIndex
CREATE INDEX "calls_processing_state_last_activity_at_idx" ON "calls"("processing_state", "last_activity_at");

-- CreateIndex
CREATE INDEX "calls_patient_id_idx" ON "calls"("patient_id");

-- CreateIndex
CREATE INDEX "transcript_turns_call_id_seq_idx" ON "transcript_turns"("call_id", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_turns_call_id_source_seq_key" ON "transcript_turns"("call_id", "source", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "call_extractions_call_id_key" ON "call_extractions"("call_id");

-- CreateIndex
CREATE INDEX "call_extractions_phone_e164_idx" ON "call_extractions"("phone_e164");

-- CreateIndex
CREATE INDEX "appointments_clinic_id_slot_start_idx" ON "appointments"("clinic_id", "slot_start");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_slot_start_idx" ON "appointments"("doctor_id", "slot_start");

-- CreateIndex
CREATE INDEX "appointments_patient_id_idx" ON "appointments"("patient_id");

-- CreateIndex
CREATE INDEX "appointment_history_appointment_id_at_idx" ON "appointment_history"("appointment_id", "at");

-- CreateIndex
CREATE INDEX "appointment_history_call_id_idx" ON "appointment_history"("call_id");

-- CreateIndex
CREATE INDEX "callbacks_clinic_id_status_priority_idx" ON "callbacks"("clinic_id", "status", "priority");

-- CreateIndex
CREATE INDEX "callbacks_call_id_idx" ON "callbacks"("call_id");

-- CreateIndex
CREATE INDEX "call_events_call_id_ts_idx" ON "call_events"("call_id", "ts");

-- CreateIndex
CREATE INDEX "call_events_type_ts_idx" ON "call_events"("type", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "provider_keys_clinic_id_provider_key" ON "provider_keys"("clinic_id", "provider");

-- CreateIndex
CREATE INDEX "demo_requests_created_at_idx" ON "demo_requests"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "rate_limits_window_start_idx" ON "rate_limits"("window_start");

-- AddForeignKey
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_schedules" ADD CONSTRAINT "doctor_schedules_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_turns" ADD CONSTRAINT "transcript_turns_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_extractions" ADD CONSTRAINT "call_extractions_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_call_id_fkey" FOREIGN KEY ("created_by_call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_updated_by_call_id_fkey" FOREIGN KEY ("updated_by_call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_history" ADD CONSTRAINT "appointment_history_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_done_by_fkey" FOREIGN KEY ("done_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "calls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "clinics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

