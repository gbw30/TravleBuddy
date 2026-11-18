export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    "/login",
    "/home/:path*",
    "/profile/:path*",
    "/trips/:path*",
    "/api/v1/:path*",
    "/api/trips/:path*",
    "/api/export/:path*",
    "/api/itinerary/:path*",
    "/api/recommendations/:path*",
  ],
};
