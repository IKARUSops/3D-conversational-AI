"use client";
/** FR-A7 contact / demo request form. Saves through POST /api/demo-requests (Agent A). */
import Image from "next/image";
import { useState } from "react";
import { DemoRequestSchema } from "@/contracts";
import { useLang } from "@/lib/i18n/LangProvider";

type Status = "idle" | "sending" | "success" | "error" | "invalid" | "limited";

const field =
  "mt-1.5 block h-12 w-full rounded-sm border border-border-strong bg-glass px-3.5 text-fg placeholder:text-fg-subtle";

export function Contact() {
  const { t } = useLang();
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = {
      name: String(fd.get("name") ?? "").normalize("NFC"),
      clinicName: String(fd.get("clinicName") ?? "").normalize("NFC"),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      message: String(fd.get("message") ?? "").normalize("NFC") || undefined,
    };
    if (!DemoRequestSchema.safeParse(body).success) {
      setStatus("invalid");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus("success");
        form.reset();
      } else setStatus(res.status === 429 ? "limited" : res.status === 400 ? "invalid" : "error");
    } catch {
      setStatus("error");
    }
  }

  const message =
    status === "success"
      ? t.contact.success
      : status === "error"
        ? t.contact.error
        : status === "invalid"
          ? t.contact.invalid
          : status === "limited"
            ? t.contact.limited
            : null;

  return (
    <section id="contact" className="scroll-mt-20 py-20 md:py-28" aria-labelledby="contact-title">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:px-8">
        <div className="flex flex-col">
          <h2 id="contact-title" className="text-3xl font-bold text-balance md:text-4xl">
            {t.contact.title}
          </h2>
          <p className="mt-3 text-lg text-fg-muted">{t.contact.sub}</p>
          <div className="relative mt-10 hidden aspect-square w-64 lg:block">
            <Image
              src="/images/byte-still.webp"
              alt=""
              fill
              sizes="256px"
              className="object-contain opacity-90"
            />
          </div>
        </div>
        <form
          onSubmit={onSubmit}
          noValidate
          className="glass grid gap-4 rounded-lg p-6 sm:grid-cols-2 sm:p-8"
        >
          <label className="block text-sm font-medium">
            {t.contact.name}
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="name"
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            {t.contact.clinic}
            <input
              name="clinicName"
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              className={field}
            />
          </label>
          <label className="block text-sm font-medium">
            {t.contact.phone}
            <input
              name="phone"
              required
              type="tel"
              inputMode="tel"
              maxLength={30}
              autoComplete="tel"
              className={`${field} font-latin`}
              placeholder="01XXXXXXXXX"
            />
          </label>
          <label className="block text-sm font-medium">
            {t.contact.email}
            <input
              name="email"
              type="email"
              maxLength={200}
              autoComplete="email"
              className={`${field} font-latin`}
            />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            {t.contact.message}
            <textarea name="message" rows={3} maxLength={1000} className={`${field} h-auto py-3`} />
          </label>
          <div className="flex flex-col gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={status === "sending"}
              className="inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-6 font-semibold text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "sending" ? t.contact.sending : t.contact.submit}
            </button>
            <p
              aria-live="polite"
              className={`min-h-6 text-sm ${status === "success" ? "text-success" : "text-danger"}`}
            >
              {message}
            </p>
            <p className="text-xs text-fg-subtle">{t.contact.fake}</p>
          </div>
        </form>
      </div>
    </section>
  );
}
