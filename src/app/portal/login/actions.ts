"use server";
/** Login and logout server actions (T3.1, FR-D1). Credentials never reach the client bundle. */
import { redirect } from "next/navigation";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error?: string;
  email?: string;
}

const LoginSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(6).max(200),
  next: z.string().max(200).optional(),
});

/** Only allow redirects to portal paths (no open redirect). */
function safeNext(next: string | undefined): string {
  return next && /^\/portal(\/[\w\-/]*)?$/.test(next) && !next.startsWith("/portal/login")
    ? next
    : "/portal/calls";
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const parsed = LoginSchema.safeParse({
    email,
    password: String(form.get("password") ?? ""),
    next: String(form.get("next") ?? "") || undefined,
  });
  if (!parsed.success)
    return { error: "Enter a valid email and a password of 6+ characters.", email };
  if (!isSupabaseConfigured()) {
    return { error: "Login is not configured on this server yet (Supabase env missing).", email };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) return { error: "Email or password is wrong. Please try again.", email };
  } catch (err) {
    console.error("[login] sign in failed", err);
    return { error: "Could not reach the login service. Please try again in a minute.", email };
  }
  redirect(safeNext(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[logout] sign out failed", err);
    }
  }
  redirect("/portal/login");
}
