export { auth as proxy } from "@/lib/auth";

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/profile/:path*",
    "/trips/:path*",
    "/api/trips/:path*",
    "/api/export/:path*",
    "/api/itinerary/:path*",
    "/api/recommendations/:path*",
  ],
};
