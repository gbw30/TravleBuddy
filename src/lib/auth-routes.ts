export const protectedPagePrefixes = ["/home", "/profile", "/trips"] as const;

export const protectedApiPrefixes = ["/api/v1"] as const;

export const authRouteMatcher = [
  "/login",
  "/home/:path*",
  "/profile/:path*",
  "/trips/:path*",
  "/api/v1/:path*",
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isLoginRoute(pathname: string) {
  return pathname === "/login";
}

export function isProtectedPageRoute(pathname: string) {
  return protectedPagePrefixes.some((prefix) =>
    matchesPrefix(pathname, prefix),
  );
}

export function isProtectedApiRoute(pathname: string) {
  return protectedApiPrefixes.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isProtectedRoute(pathname: string) {
  return isProtectedPageRoute(pathname) || isProtectedApiRoute(pathname);
}
