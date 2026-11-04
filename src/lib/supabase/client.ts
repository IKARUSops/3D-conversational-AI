"use client";
/**
 * Supabase client for the browser (portal login form). Anon key only; RLS denies all table
 * access, so the browser uses Supabase only for auth.
 */
import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    const { url, anonKey } = getSupabasePublicConfig();
    browserClient = createBrowserClient(url, anonKey);
  }
  return browserClient;
}
