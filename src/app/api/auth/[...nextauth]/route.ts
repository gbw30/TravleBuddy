import type { NextRequest } from "next/server";

import { handlers } from "@/lib/auth";

import { fairly } from "../../v1/respond";

// NextAuth's routes are the only API a device reaches without sign-in (the
// proxy answers 401 for /api/v1 before any work is done). Each request counts
// against the device's own limit: its cookie and its signature (TB-SYS-16).
export const GET = (request: NextRequest) =>
  fairly(request, null, ["unsigned"], () => handlers.GET(request));
export const POST = (request: NextRequest) =>
  fairly(request, null, ["unsigned"], () => handlers.POST(request));
