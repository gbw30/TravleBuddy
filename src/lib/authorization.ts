import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { buildTripOwnerWhere } from "@/lib/authorization-rules";
import { db } from "@/lib/db";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export const getCurrentUserId = cache(async () => {
  const session = await auth();
  const sessionUserId = session?.user?.id ?? null;

  if (!sessionUserId) {
    return null;
  }

  const user = await db.user.findUnique({
    where: {
      id: sessionUserId,
    },
    select: {
      id: true,
    },
  });

  return user?.id ?? null;
});

export const requireUser = cache(async () => {
  const userId = await getCurrentUserId();

  if (!userId) {
    redirect("/login");
  }

  return userId;
});

export async function requireTripOwner(userId: string, tripId: string) {
  const trip = await db.trip.findFirst({
    where: buildTripOwnerWhere(userId, tripId),
    select: {
      id: true,
      userId: true,
    },
  });

  if (!trip) {
    notFound();
  }

  return trip;
}

export async function assertAuthenticatedApiUser() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new UnauthorizedError();
  }

  return userId;
}
