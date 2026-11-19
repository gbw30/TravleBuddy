export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    "/login",
    "/home/:path*",
    "/profile/:path*",
    "/trips/:path*",
    "/api/v1/:path*",
  ],
};
