/**
 * Pure helper for src/proxy.ts. Returns the redirect path, or null when no redirect is needed.
 * Host comparison ignores case and port.
 */
export function portalRedirectPath(
  host: string | null | undefined,
  pathname: string,
  portalHost: string | null | undefined,
): string | null {
  if (!host || !portalHost) return null;
  const clean = (h: string) => h.trim().toLowerCase().replace(/:\d+$/, "");
  const wanted = portalHost.split(",").map(clean).filter(Boolean);
  if (!wanted.includes(clean(host))) return null;
  return pathname === "/" ? "/portal" : null;
}
