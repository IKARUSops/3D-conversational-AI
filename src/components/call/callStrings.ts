/**
 * Call panel text in Bangla and English. Agent C/D may move these into the shared i18n
 * dictionary; keys are stable.
 */
import type { CallLang, CallUiState } from "@/contracts";
import type { CallErrorKind, CallNotice } from "./callState";

export interface CallStrings {
  title: string;
  subtitle: string;
  sttLabel: string;
  ttsLabel: string;
  start: string;
  startTyping: string;
  end: string;
  tryAgain: string;
  newCall: string;
  headphoneTip: string;
  states: Record<CallUiState, string>;
  processing: string;
  you: string;
  agent: string;
  captionsShow: string;
  captionsHide: string;
  typePlaceholder: string;
  typeLabel: string;
  send: string;
  timerLabel: string;
  notices: Record<CallNotice, string>;
  errors: Record<CallErrorKind, string>;
  micHelp: string[];
  summaryTitle: string;
  summaryFallback: string;
  endReasons: Record<string, string>;
  portalLink: string;
  demoNotice: string;
}

export const CALL_STRINGS: Record<CallLang, CallStrings> = {
  bn: {
    title: "নাদিয়ার সাথে কথা বলুন",
    subtitle: "ঢাকা ডেন্টাল কেয়ারের AI রিসেপশনিস্ট (ডেমো)",
    sttLabel: "কথা চেনা (STT)",
    ttsLabel: "কণ্ঠ (TTS)",
    start: "কল শুরু করুন",
    startTyping: "মাইক ছাড়া লিখে কথা বলুন",
    end: "কল শেষ করুন",
    tryAgain: "আবার চেষ্টা করুন",
    newCall: "নতুন কল",
    headphoneTip: "সবচেয়ে ভালো ফলের জন্য হেডফোন ব্যবহার করুন।",
    states: {
      idle: "প্রস্তুত",
      requesting_mic: "মাইক্রোফোনের অনুমতি চাওয়া হচ্ছে",
      connecting: "সংযোগ হচ্ছে",
      listening: "শুনছি",
      thinking: "ভাবছি",
      speaking: "বলছি",
      ending: "কল শেষ হচ্ছে",
      ended: "কল শেষ",
      error: "সমস্যা হয়েছে",
    },
    processing: "আপনার কথা বোঝা হচ্ছে...",
    you: "আপনি",
    agent: "নাদিয়া",
    captionsShow: "লেখা দেখান",
    captionsHide: "লেখা লুকান",
    typePlaceholder: "এখানে লিখুন...",
    typeLabel: "কথা না বলে লিখুন",
    send: "পাঠান",
    timerLabel: "কলের সময়",
    notices: {
      tts_fallback: "কণ্ঠের সার্ভিসে সমস্যা, বিকল্প কণ্ঠ ব্যবহার করা হচ্ছে।",
      stt_fallback: "কথা চেনার সার্ভিসে সমস্যা, বিকল্প ব্যবহার করা হচ্ছে।",
      stt_network_switch: "ব্রাউজারের কথা চেনা কাজ করছে না, সার্ভার STT চালু করা হলো।",
      browser_stt_unsupported: "এই ব্রাউজারে ব্রাউজার STT নেই, তাই ElevenLabs ব্যবহার হবে।",
      tts_failed: "এই বাক্যটি শোনানো যায়নি।",
      recording_skipped: "এই ডিভাইসে কল রেকর্ড করা হচ্ছে না।",
      checking: "দেখে নিচ্ছি...",
      turn_failed: "উত্তর আনতে সমস্যা হয়েছে, আবার বলুন।",
    },
    errors: {
      mic_denied: "মাইক্রোফোনের অনুমতি দেওয়া হয়নি।",
      mic_missing: "কোনো মাইক্রোফোন পাওয়া যায়নি।",
      mic_busy: "মাইক্রোফোন অন্য অ্যাপ ব্যবহার করছে।",
      mic_insecure: "নিরাপদ (https) পেজ ছাড়া মাইক্রোফোন চালু হয় না।",
      network: "সংযোগ করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।",
      rate_limited: "এখন অনেক কল হচ্ছে। একটু পরে আবার চেষ্টা করুন।",
      providers: "দুঃখিত, সার্ভিস এখন পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।",
      unknown: "দুঃখিত, আবার চেষ্টা করুন।",
    },
    micHelp: [
      "ঠিকানা বারের বাঁ পাশের তালা চিহ্নে চাপ দিন।",
      "মাইক্রোফোন \"Allow\" করুন, তারপর পেজ রিফ্রেশ করুন।",
      "অথবা নিচের \"কথা না বলে লিখুন\" ব্যবহার করুন।",
    ],
    summaryTitle: "কলের সারাংশ",
    summaryFallback: "কল শেষ হয়েছে। ধন্যবাদ!",
    endReasons: {
      caller_hangup: "আপনি কল শেষ করেছেন।",
      agent_end: "নাদিয়া কল শেষ করেছেন।",
      time_limit: "৫ মিনিটের সময় শেষ।",
      silence: "কোনো উত্তর না পাওয়ায় কল শেষ হয়েছে।",
      error: "সমস্যার কারণে কল শেষ হয়েছে।",
      tab_closed: "ট্যাব বন্ধ হয়েছে।",
    },
    portalLink: "পোর্টালে এই কলটি দেখুন",
    demoNotice: "ডেমো: আসল চিকিৎসা বা ব্যক্তিগত তথ্য দেবেন না।",
  },
  en: {
    title: "Talk to Nadia",
    subtitle: "AI receptionist of Dhaka Dental Care (demo)",
    sttLabel: "Speech recognition (STT)",
    ttsLabel: "Voice (TTS)",
    start: "Start call",
    startTyping: "Chat by typing (no microphone)",
    end: "End call",
    tryAgain: "Try again",
    newCall: "New call",
    headphoneTip: "For best results, use headphones.",
    states: {
      idle: "Ready",
      requesting_mic: "Requesting microphone",
      connecting: "Connecting",
      listening: "Listening",
      thinking: "Thinking",
      speaking: "Speaking",
      ending: "Ending call",
      ended: "Call ended",
      error: "Something went wrong",
    },
    processing: "Processing your words...",
    you: "You",
    agent: "Nadia",
    captionsShow: "Show captions",
    captionsHide: "Hide captions",
    typePlaceholder: "Type here...",
    typeLabel: "Type instead",
    send: "Send",
    timerLabel: "Call time",
    notices: {
      tts_fallback: "Voice provider problem, using a backup voice.",
      stt_fallback: "Speech recognition problem, using a backup provider.",
      stt_network_switch: "Browser speech recognition stopped working, switched to server STT.",
      browser_stt_unsupported: "Browser STT is not available in this browser, so ElevenLabs is used.",
      tts_failed: "This sentence could not be played.",
      recording_skipped: "This call is not recorded on this device.",
      checking: "Checking...",
      turn_failed: "Could not get a reply. Please say it again.",
    },
    errors: {
      mic_denied: "Microphone permission was denied.",
      mic_missing: "No microphone was found.",
      mic_busy: "The microphone is being used by another app.",
      mic_insecure: "The microphone only works on a secure (https) page.",
      network: "Could not connect. Check your internet and try again.",
      rate_limited: "Too many calls right now. Please try again a bit later.",
      providers: "Sorry, the service is not available now. Please try again.",
      unknown: "Sorry, please try again.",
    },
    micHelp: [
      "Click the lock icon at the left of the address bar.",
      "Set Microphone to \"Allow\", then refresh the page.",
      "Or use \"Type instead\" below.",
    ],
    summaryTitle: "Call summary",
    summaryFallback: "The call has ended. Thank you!",
    endReasons: {
      caller_hangup: "You ended the call.",
      agent_end: "Nadia ended the call.",
      time_limit: "The 5 minute limit was reached.",
      silence: "The call ended because there was no answer.",
      error: "The call ended because of a problem.",
      tab_closed: "The tab was closed.",
    },
    portalLink: "See this call in the portal",
    demoNotice: "Demo: do not share real medical or personal information.",
  },
};
