export const protectedPagePrefixes = ["/dashboard", "/profile", "/trips"] as const;

export const protectedApiPrefixes = [
  "/api/export",
  "/api/itinerary",
  "/api/recommendations",
] as const;

export const authRouteMatcher = [
  "/login",
  "/dashboard/:path*",
  "/profile/:path*",
  "/trips/:path*",
  "/api/export/:path*",
  "/api/itinerary/:path*",
  "/api/recommendations/:path*",
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isLoginRoute(pathname: string) {
  return pathname === "/login";
}

export function isProtectedPageRoute(pathname: string) {
  return protectedPagePrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isProtectedApiRoute(pathname: string) {
  return protectedApiPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isProtectedRoute(pathname: string) {
  return isProtectedPageRoute(pathname) || isProtectedApiRoute(pathname);
}
