import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
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

export async function assertAuthenticatedApiUser() {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new UnauthorizedError();
  }

  return userId;
}
