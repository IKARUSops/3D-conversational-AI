/**
 * Portal auth helpers (T3.1, FR-D1, NFR-5). SERVER ONLY.
 *
 * - Identity comes from the Supabase session cookie (validated with auth.getUser()).
 * - Role and the reviewer `read_only` flag come from the `staff_users` table (Prisma).
 * - requireStaff() redirects anonymous users to /portal/login and users without the needed
 *   role to /portal/calls. Use it at the top of every portal page, layout and server action.
 */
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type StaffRole = "admin" | "receptionist";

export interface StaffSession {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  /** Reviewer account: admin who may look at everything but change nothing sensitive. */
  readOnly: boolean;
  clinicId: string;
}

export type StaffLookup =
  | { ok: true; staff: StaffSession }
  | { ok: false; reason: "not_configured" | "anonymous" | "not_staff" | "error" };

/** Reads the current staff user once per request. Never throws. */
export const getStaffSession = cache(async (): Promise<StaffLookup> => {
  if (!isSupabaseConfigured() || !process.env.DATABASE_URL) {
    return { ok: false, reason: "not_configured" };
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return { ok: false, reason: "anonymous" };
    const row = await db.staffUser.findUnique({ where: { id: data.user.id } });
    if (!row) return { ok: false, reason: "not_staff" };
    return {
      ok: true,
      staff: {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        readOnly: row.readOnly,
        clinicId: row.clinicId,
      },
    };
  } catch (err) {
    console.error("[auth] staff lookup failed", err);
    return { ok: false, reason: "error" };
  }
});

/** Pure role check, unit tested. `admin` passes every role check. */
export function hasRole(staff: Pick<StaffSession, "role">, role?: StaffRole): boolean {
  if (!role) return true;
  return staff.role === "admin" || staff.role === role;
}

/** true when the user may change data (mark callbacks done, edit keys). */
export function canWrite(staff: Pick<StaffSession, "readOnly">): boolean {
  return !staff.readOnly;
}

/**
 * Guard for portal pages and server actions. Redirects (throws) when the user is not allowed.
 * @param role when "admin", receptionists are sent back to the calls list.
 */
export async function requireStaff(role?: StaffRole): Promise<StaffSession> {
  const result = await getStaffSession();
  if (!result.ok) {
    const reason = result.reason === "anonymous" ? "" : `?error=${result.reason}`;
    redirect(`/portal/login${reason}`);
  }
  if (!hasRole(result.staff, role)) redirect("/portal/calls?denied=1");
  return result.staff;
}
