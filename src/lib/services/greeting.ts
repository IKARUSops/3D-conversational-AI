/**
 * Opening line (SRS 1 section 4.3.2, FR-C1). `ttsText` goes through the same ttsNormalize as
 * every agent sentence, so a clinic name with digits or "Dr." is still spoken correctly.
 */
import { DEFAULT_CLINIC_SLUG, type CallLang, type Greeting } from "@/contracts";
import { ttsNormalize } from "@/lib/text/tts-normalize";

export function greetingFor(
  clinic: { slug: string; nameBn: string; nameEn: string },
  lang: CallLang,
): Greeting {
  const text =
    lang === "en"
      ? `Assalamu alaikum, welcome to ${clinic.nameEn}. I am Nadia. How can I help you?`
      : clinic.slug === DEFAULT_CLINIC_SLUG
        ? "আসসালামু আলাইকুম, ঢাকা ডেন্টাল কেয়ারে আপনাকে স্বাগতম। আমি নাদিয়া, বলেন কীভাবে সাহায্য করতে পারি?"
        : `আসসালামু আলাইকুম, ${clinic.nameBn}-এ আপনাকে স্বাগতম। আমি নাদিয়া, বলেন কীভাবে সাহায্য করতে পারি?`;
  return { text, ttsText: ttsNormalize(text, lang) };
}
