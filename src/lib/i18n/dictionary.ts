/**
 * Landing page text (FR-A6). Bangla is the default; English mirrors every key.
 * Copy is original (not taken from bytevoice.com.au). Keep it short and spoken.
 */
export type Lang = "bn" | "en";

const bn = {
  meta: { langName: "বাংলা", switchTo: "English", switchLabel: "Switch language to English" },
  nav: {
    how: "কীভাবে কাজ করে",
    features: "সুবিধা",
    useCases: "কাদের জন্য",
    pricing: "মূল্য",
    contact: "যোগাযোগ",
    portal: "পোর্টাল",
  },
  hero: {
    kicker: "ByteVoice এখন বাংলাদেশে",
    title: "রোগীর ফোন ধরবে Byte, বাংলায়, দিনরাত ২৪ ঘণ্টা",
    sub: "ডেন্টাল ক্লিনিক আর হাসপাতালের জন্য AI রিসেপশনিস্ট। স্বাভাবিক বাংলায় কথা বলে, সিরিয়াল দেয়, প্রশ্নের উত্তর দেয়, আর দরকার হলে আপনার স্টাফকে কলব্যাকের কথা জানায়।",
    cta: "বাংলা কলারের সাথে কথা বলুন",
    secondary: "কীভাবে কাজ করে",
    note: "ডেমো: আসল নাম, ফোন নম্বর বা চিকিৎসার তথ্য দেবেন না।",
    headphones: "হেডফোন ব্যবহার করলে সবচেয়ে ভালো শোনা যায়।",
    bubbleCaller: "আগামী রবিবার সন্ধ্যায় দাঁত দেখাতে চাই।",
    bubbleAgent: "রবিবার সন্ধ্যা ৬টায় ডা. নুসরাত জাহানের সিরিয়াল খালি আছে। বুক করে দেব?",
    chips: ["২৪/৭ কল ধরা", "অ্যাপয়েন্টমেন্ট বুকিং", "স্টাফ কলব্যাক", "পোর্টালে সব তথ্য"],
    mascotAlt: "Byte, হেডসেট পরা একটি টিয়া, ডেস্কে ল্যাপটপের সামনে বসে আছে",
  },
  how: {
    title: "একটি কল, তিন ধাপে",
    sub: "রোগী ফোন করেন, Byte কথা বলে, আর আপনার টিম সব দেখে পোর্টালে।",
    steps: [
      {
        title: "রোগী কল করেন",
        body: "যেকোনো সময়, ছুটির দিনেও। অপেক্ষা নেই, ব্যস্ত লাইন নেই।",
      },
      {
        title: "Byte বাংলায় কথা বলে",
        body: "নাম, নম্বর, সমস্যা আর পছন্দের সময় জেনে নেয়, পড়ে শুনিয়ে নিশ্চিত করে, খালি স্লট দেখে বুক করে।",
      },
      {
        title: "আপনার টিম সব দেখে",
        body: "পুরো কথোপকথন, সারাংশ, বুকিং আর কলব্যাক এক পোর্টালে, কল শেষের দুই মিনিটের মধ্যে।",
      },
    ],
  },
  features: {
    title: "রিসেপশনের কাজ, যা Byte নিজেই সামলায়",
    leadTitle: "মানুষের মতো স্বাভাবিক বাংলা",
    leadBody:
      "ঢাকার রোগী যেভাবে কথা বলেন, Byte সেভাবেই বোঝে: বাংলা-ইংরেজি মিশিয়ে বললেও। “আগামী রবিবার সন্ধ্যায়” শুনে সঠিক তারিখ বের করে, আর নম্বর পড়ে শুনিয়ে ভুল ঠিক করে নেয়।",
    sampleCaller: "আমার একটা scaling appointment লাগবে, next Saturday morning।",
    sampleAgent: "ঠিক আছে। শনিবার সকাল ১১টায় স্কেলিং, ফি ১,৫০০ টাকা। নিশ্চিত করব?",
    items: [
      { title: "২৪/৭ কল ধরা", body: "রাত ১১টায় বা শুক্রবারেও কোনো কল মিস হয় না।" },
      {
        title: "অ্যাপয়েন্টমেন্ট বুকিং",
        body: "ডাক্তারের সময়সূচি দেখে নতুন বুকিং, সময় বদল বা বাতিল।",
      },
      {
        title: "স্টাফ কলব্যাক",
        body: "চিকিৎসার প্রশ্ন, অভিযোগ বা জরুরি অবস্থায় আপনার টিমকে জানিয়ে দেয়।",
      },
      {
        title: "পোর্টালে সব তথ্য",
        body: "ট্রান্সক্রিপ্ট, রেকর্ডিং, সারাংশ আর কলের ফলাফল এক জায়গায়।",
      },
    ],
  },
  useCases: {
    title: "যেখানে ফোন থামে না",
    items: [
      {
        title: "ডেন্টাল ক্লিনিক",
        body: "চেকআপ, স্কেলিং, রুট ক্যানেল: সিরিয়াল আর ফি নিয়ে প্রতিদিনের প্রশ্ন।",
      },
      {
        title: "ডায়াগনস্টিক সেন্টার",
        body: "টেস্টের প্রস্তুতি, রিপোর্টের সময় আর খোলার সময় নিয়ে উত্তর।",
      },
      { title: "হাসপাতালের আউটডোর", body: "কোন ডাক্তার কবে বসেন, কীভাবে সিরিয়াল দেবেন।" },
      {
        title: "রিমাইন্ডার কল",
        body: "অ্যাপয়েন্টমেন্টের আগের দিন মনে করিয়ে দেওয়া, যাতে কেউ মিস না করেন।",
      },
    ],
    soon: "শীঘ্রই",
  },
  pricing: {
    title: "ক্লিনিকের মাপে প্ল্যান",
    note: "উদাহরণ মূল্য, শুধু ডেমোর জন্য। আসল মূল্য আলোচনা সাপেক্ষে।",
    perMonth: "/মাস",
    popular: "বেশিরভাগ ক্লিনিকের পছন্দ",
    choose: "ডেমো চাই",
    plans: [
      {
        name: "স্টার্টার",
        price: "৳ ৪,৯০০",
        desc: "একজন ডাক্তারের চেম্বার",
        points: [
          "মাসে ৩০০ মিনিট",
          "বাংলা ও ইংরেজি কল",
          "অ্যাপয়েন্টমেন্ট বুকিং",
          "পোর্টাল, একজন স্টাফ",
        ],
      },
      {
        name: "ক্লিনিক",
        price: "৳ ১২,৫০০",
        desc: "কয়েকজন ডাক্তারের ক্লিনিক",
        points: [
          "মাসে ১,০০০ মিনিট",
          "সব ডাক্তারের সময়সূচি",
          "স্টাফ কলব্যাক ও রেকর্ডিং",
          "পোর্টাল, পাঁচজন স্টাফ",
        ],
      },
      {
        name: "হাসপাতাল",
        price: "আলোচনা সাপেক্ষে",
        desc: "একাধিক বিভাগ ও শাখা",
        points: ["সীমাহীন মিনিট", "নিজের API কী (BYOK)", "রিমাইন্ডার কল", "আলাদা সাপোর্ট"],
      },
    ],
  },
  contact: {
    title: "আপনার ক্লিনিকে Byte কেমন কাজ করবে, দেখে নিন",
    sub: "ফর্মটি পূরণ করুন, আমরা এক কর্মদিবসের মধ্যে ফোন করব।",
    name: "আপনার নাম",
    clinic: "ক্লিনিক বা হাসপাতালের নাম",
    phone: "ফোন নম্বর",
    email: "ইমেইল (ঐচ্ছিক)",
    message: "কিছু জানাতে চান? (ঐচ্ছিক)",
    submit: "ডেমোর অনুরোধ পাঠান",
    sending: "পাঠানো হচ্ছে…",
    success: "ধন্যবাদ! আপনার অনুরোধ পেয়েছি। শীঘ্রই যোগাযোগ করব।",
    error: "পাঠানো যায়নি। একটু পরে আবার চেষ্টা করুন।",
    invalid: "নাম, ক্লিনিকের নাম আর ফোন নম্বর ঠিকভাবে লিখুন।",
    limited: "অনেকবার চেষ্টা হয়েছে। এক ঘণ্টা পরে আবার পাঠান।",
    fake: "ডেমো সাইট: আসল ব্যক্তিগত তথ্য দেবেন না।",
  },
  footer: {
    tagline: "বাংলায় কথা বলা AI রিসেপশনিস্ট।",
    portal: "স্টাফ পোর্টাল লগইন",
    repo: "সোর্স কোড (GitHub)",
    demo: "এটি একটি ডেমো, সব তথ্য কাল্পনিক।",
    made: "StrategyByte-এর AI Engineer টাস্কের জন্য তৈরি কনসেপ্ট।",
  },
  call: {
    previewTitle: "কল প্যানেল",
    states: { idle: "অপেক্ষা", listening: "শুনছে", thinking: "ভাবছে", speaking: "বলছে" },
    close: "বন্ধ করুন",
  },
};

export type Dictionary = typeof bn;

const en: Dictionary = {
  meta: { langName: "English", switchTo: "বাংলা", switchLabel: "ভাষা বাংলায় বদলান" },
  nav: {
    how: "How it works",
    features: "Features",
    useCases: "Who it's for",
    pricing: "Pricing",
    contact: "Contact",
    portal: "Portal",
  },
  hero: {
    kicker: "ByteVoice is now in Bangladesh",
    title: "Byte answers your patients in Bangla, 24 hours a day",
    sub: "An AI receptionist for dental clinics and hospitals. It speaks natural Bangla, books appointments, answers questions and tells your staff when someone needs a call back.",
    cta: "Talk to our Bangla caller",
    secondary: "How it works",
    note: "Demo: do not share real names, phone numbers or medical details.",
    headphones: "For best results, use headphones.",
    bubbleCaller: "I'd like a dental check-up next Sunday evening.",
    bubbleAgent: "Dr. Nusrat Jahan is free on Sunday at 6 PM. Shall I book it?",
    chips: ["Answers 24/7", "Books appointments", "Staff callbacks", "Everything in the portal"],
    mascotAlt: "Byte, a parrot wearing a headset, sitting at a desk with a laptop",
  },
  how: {
    title: "One call, three steps",
    sub: "A patient calls, Byte talks, and your team sees everything in the portal.",
    steps: [
      { title: "A patient calls", body: "Any time, even on holidays. No waiting, no busy line." },
      {
        title: "Byte talks in Bangla",
        body: "Takes name, number, problem and preferred time, reads them back, checks free slots and books.",
      },
      {
        title: "Your team sees it all",
        body: "Full transcript, summary, bookings and callbacks in one portal, within two minutes of the call.",
      },
    ],
  },
  features: {
    title: "Front-desk work that Byte handles on its own",
    leadTitle: "Natural Bangla, like a real receptionist",
    leadBody:
      "Byte understands people the way they really talk in Dhaka, even when they mix Bangla and English. It turns “next Sunday evening” into the right date and reads numbers back to catch mistakes.",
    sampleCaller: "আমার একটা scaling appointment লাগবে, next Saturday morning।",
    sampleAgent: "Sure. Scaling on Saturday at 11 AM, the fee is 1,500 taka. Shall I confirm?",
    items: [
      { title: "Answers 24/7", body: "No missed calls at 11 PM or on a Friday." },
      {
        title: "Books appointments",
        body: "New bookings, changes and cancellations against real doctor schedules.",
      },
      {
        title: "Staff callbacks",
        body: "Medical questions, complaints and urgent cases go straight to your team.",
      },
      {
        title: "Everything in the portal",
        body: "Transcripts, recordings, summaries and outcomes in one place.",
      },
    ],
  },
  useCases: {
    title: "Where the phone never stops",
    items: [
      {
        title: "Dental clinics",
        body: "Check-ups, scaling, root canals: daily questions about slots and fees.",
      },
      { title: "Diagnostic centres", body: "Test preparation, report times and opening hours." },
      { title: "Hospital outpatients", body: "Which doctor sits when, and how to get a serial." },
      {
        title: "Reminder calls",
        body: "A call the day before the appointment so nobody misses it.",
      },
    ],
    soon: "Coming soon",
  },
  pricing: {
    title: "Plans that fit your clinic",
    note: "Example prices for this demo only. Real pricing on request.",
    perMonth: "/month",
    popular: "Most clinics pick this",
    choose: "Request a demo",
    plans: [
      {
        name: "Starter",
        price: "৳ 4,900",
        desc: "Single doctor chamber",
        points: [
          "300 minutes a month",
          "Bangla and English calls",
          "Appointment booking",
          "Portal for 1 staff",
        ],
      },
      {
        name: "Clinic",
        price: "৳ 12,500",
        desc: "Clinic with several doctors",
        points: [
          "1,000 minutes a month",
          "All doctor schedules",
          "Staff callbacks and recordings",
          "Portal for 5 staff",
        ],
      },
      {
        name: "Hospital",
        price: "Let's talk",
        desc: "Many departments or branches",
        points: [
          "Unlimited minutes",
          "Your own API keys (BYOK)",
          "Reminder calls",
          "Dedicated support",
        ],
      },
    ],
  },
  contact: {
    title: "See how Byte would work at your clinic",
    sub: "Fill in the form and we will call you within one working day.",
    name: "Your name",
    clinic: "Clinic or hospital name",
    phone: "Phone number",
    email: "Email (optional)",
    message: "Anything to add? (optional)",
    submit: "Send demo request",
    sending: "Sending…",
    success: "Thank you! We got your request and will be in touch soon.",
    error: "Could not send. Please try again in a moment.",
    invalid: "Please enter your name, clinic name and phone number.",
    limited: "Too many tries. Please send again in an hour.",
    fake: "Demo site: do not enter real personal information.",
  },
  footer: {
    tagline: "The AI receptionist that speaks Bangla.",
    portal: "Staff portal login",
    repo: "Source code (GitHub)",
    demo: "This is a demo. All data is fake.",
    made: "Concept built for the StrategyByte AI Engineer task.",
  },
  call: {
    previewTitle: "Call panel",
    states: { idle: "Idle", listening: "Listening", thinking: "Thinking", speaking: "Speaking" },
    close: "Close",
  },
};

export const dictionaries: Record<Lang, Dictionary> = { bn, en };
export const DEFAULT_LANG: Lang = "bn";
export const LANG_STORAGE_KEY = "bv-lang";

export function isLang(value: unknown): value is Lang {
  return value === "bn" || value === "en";
}
