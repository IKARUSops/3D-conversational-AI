import { describe, expect, it } from "vitest";
import {
  SentenceSplitter,
  asciiDigitsToBn,
  bnDigitsToAscii,
  cleanPhone,
  dateToBn,
  moneyToBn,
  nfc,
  normalizeForMatch,
  numberToBn,
  spokenDigitsBn,
  splitSentences,
  timeToBn,
  toE164,
  ttsNormalize,
  validateBdMobile,
} from "@/lib/text";

const N = (s: string) => s.normalize("NFC");
// য় written two ways: precomposed U+09DF and য + nukta (U+09AF U+09BC).
const YA_PRE = "য়";
const YA_DECOMP = "য়";

describe("T2.1 normalize", () => {
  it("NFC makes both spellings of য় equal", () => {
    expect(nfc(`ছ${YA_PRE}`)).toBe(nfc(`ছ${YA_DECOMP}`));
  });
  it("converts Bangla digits both ways", () => {
    expect(bnDigitsToAscii("০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
    expect(asciiDigitsToBn("2026")).toBe("২০২৬");
  });
  it("normalizeForMatch lowercases, converts digits and collapses spaces", () => {
    expect(normalizeForMatch("  Next   SUNDAY ১০টা ")).toBe(N("next sunday 10টা"));
  });
});

describe("T2.1 FR-D-VAL phone", () => {
  it("accepts Bangla digits", () => {
    expect(validateBdMobile("০১৭১২৩৪৫৬৭৮")).toMatchObject({ valid: true, digits: "01712345678" });
  });
  it("removes spaces, dashes and brackets", () => {
    expect(cleanPhone("017-1234 (5678)")).toBe("01712345678");
  });
  it("strips +880 and 00880", () => {
    expect(cleanPhone("+8801712345678")).toBe("01712345678");
    expect(cleanPhone("008801712345678")).toBe("01712345678");
    expect(validateBdMobile("+880 1712-345678").valid).toBe(true);
  });
  it("rejects 10 digits as too_short and 12 as too_long", () => {
    expect(validateBdMobile("0171234567").problems).toEqual(["too_short"]);
    expect(validateBdMobile("017123456789").problems).toEqual(["too_long"]);
  });
  it("rejects a bad operator prefix", () => {
    expect(validateBdMobile("01212345678").problems).toEqual(["bad_prefix"]);
  });
  it("rejects empty and letters", () => {
    expect(validateBdMobile("").problems).toEqual(["empty"]);
    expect(validateBdMobile("01712abc678").problems).toEqual(["not_digits"]);
  });
  it("makes E.164", () => {
    expect(toE164("01712345678")).toBe("+8801712345678");
    expect(() => toE164("123")).toThrow();
  });
  it("reads digits back in Bangla with commas (NFC, both য় forms)", () => {
    const spoken = spokenDigitsBn("01769");
    expect(spoken).toBe(N(`শূন্য, এক, সাত, ছ${YA_DECOMP}, ন${YA_PRE}`));
    expect(spoken).toBe(nfc(spoken));
  });
});

describe("T2.1 FR-C22 bangla-numbers", () => {
  it("covers irregular 0 to 99", () => {
    expect(numberToBn(0)).toBe(N("শূন্য"));
    expect(numberToBn(29)).toBe(N("ঊনত্রিশ"));
    expect(numberToBn(48)).toBe(N("আটচল্লিশ"));
    expect(numberToBn(99)).toBe(N("নিরানব্বই"));
  });
  it("builds hundreds and thousands", () => {
    expect(numberToBn(300)).toBe(N("তিনশো"));
    expect(numberToBn(1500)).toBe(N("এক হাজার পাঁচশো"));
    expect(numberToBn(8000)).toBe(N("আট হাজার"));
    expect(numberToBn(9999)).toBe(N("নয় হাজার নয়শো নিরানব্বই"));
  });
  it("speaks times like a Dhaka receptionist", () => {
    expect(timeToBn(10, 0)).toBe(N("সকাল দশটা"));
    expect(timeToBn(18, 30)).toBe(N("সন্ধ্যা সাড়ে ছয়টা"));
    expect(timeToBn(17, 15)).toBe(N("বিকেল সোয়া পাঁচটা"));
    expect(timeToBn(18, 45)).toBe(N("সন্ধ্যা পৌনে সাতটা"));
    expect(timeToBn(13, 30)).toBe(N("দুপুর দেড়টা"));
    expect(timeToBn(18, 10)).toBe(N("সন্ধ্যা ছয়টা দশ মিনিট"));
  });
  it("speaks dates and money", () => {
    expect(dateToBn(8, 11)).toBe(N("আট নভেম্বর"));
    expect(moneyToBn(1500)).toBe(N("এক হাজার পাঁচশো টাকা"));
  });
});

describe("T2.1 FR-C22 tts-normalize", () => {
  it("speaks a phone number digit by digit", () => {
    expect(ttsNormalize("আপনার নাম্বার 01712345678, ঠিক আছে?")).toBe(
      N("আপনার নাম্বার শূন্য, এক, সাত, এক, দুই, তিন, চার, পাঁচ, ছয়, সাত, আট, ঠিক আছে?"),
    );
  });
  it("expands ডা. and Dr. and converts dates and hours", () => {
    expect(ttsNormalize("রবিবার ৮ নভেম্বর ডা. নুসরাত জাহানের সাথে ৬টায়")).toBe(
      N("রবিবার আট নভেম্বর ডাক্তার নুসরাত জাহানের সাথে ছয়টায়"),
    );
    expect(ttsNormalize("Dr. Tanvir")).toBe(N("ডাক্তার Tanvir"));
  });
  it("converts HH:MM and skips a repeated day part", () => {
    expect(ttsNormalize("সময় 18:30")).toBe(N("সময় সন্ধ্যা সাড়ে ছয়টা"));
    expect(ttsNormalize("সন্ধ্যা 18:00 টায়")).toBe(N("সন্ধ্যা ছয়টা টায়"));
  });
  it("speaks money with commas and strips markdown/emoji", () => {
    expect(ttsNormalize("**স্কেলিং** ১,৫০০ টাকা 😊")).toBe(N("স্কেলিং এক হাজার পাঁচশো টাকা"));
  });
  it("leaves English text readable", () => {
    expect(ttsNormalize("See you at 6 pm *today*", "en")).toBe("See you at 6 pm today");
  });
});

describe("T2.1 sentence split", () => {
  it("splits on দাঁড়ি, question mark and newline", () => {
    expect(splitSentences("জি, অবশ্যই। আপনার নামটা বলবেন?\nধন্যবাদ")).toEqual([
      N("জি, অবশ্যই।"),
      N("আপনার নামটা বলবেন?"),
      N("ধন্যবাদ"),
    ]);
  });
  it("does not split ডা. or decimals", () => {
    expect(splitSentences(N("ডা. নুসরাত আছেন। ফি 2.5 হাজার।"))).toEqual([
      N("ডা. নুসরাত আছেন।"),
      N("ফি 2.5 হাজার।"),
    ]);
  });
  it("works on streamed chunks", () => {
    const s = new SentenceSplitter();
    const out = [...s.push("আসসালামু আলাই"), ...s.push("কুম। আমি না"), ...s.push("দিয়া।"), ...s.flush()];
    expect(out).toEqual([N("আসসালামু আলাইকুম।"), N("আমি নাদিয়া।")]);
  });
  it("joins a very short piece to the next sentence", () => {
    expect(splitSentences("জি। আচ্ছা ঠিক আছে।")).toEqual([N("জি। আচ্ছা ঠিক আছে।")]);
  });
});

describe("dedupeRepeatedName (TC-01)", async () => {
  const { dedupeRepeatedName } = await import("@/lib/text/normalize");
  it("keeps one copy of a name said twice", () => {
    expect(dedupeRepeatedName(N("ওমর ওমর"))).toBe(N("ওমর"));
    expect(dedupeRepeatedName("Sharif Uddin  sharif uddin")).toBe("Sharif Uddin");
  });
  it("leaves real names alone", () => {
    expect(dedupeRepeatedName(N("শরীফ উদ্দিন"))).toBe(N("শরীফ উদ্দিন"));
    expect(dedupeRepeatedName(N("মো. ওমর ফারুক"))).toBe(N("মো. ওমর ফারুক"));
  });
});
