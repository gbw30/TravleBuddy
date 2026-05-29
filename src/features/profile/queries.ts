import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { ProfileDto, UserTravelPreferenceDto } from "./types";

export const profileSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} satisfies Prisma.UserSelect;

export const userTravelPreferenceSelect = {
  id: true,
  userId: true,
  budgetLevel: true,
  pace: true,
  interests: true,
  transportationModes: true,
  accommodationTypes: true,
  hotelPriority: true,
  walkingToleranceKm: true,
  dietaryRestrictions: true,
  accessibilityNeeds: true,
  mustAvoid: true,
  customPreferences: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserTravelPreferenceSelect;

type ProfileRecord = Prisma.UserGetPayload<{
  select: typeof profileSelect;
}>;

type UserTravelPreferenceRecord = Prisma.UserTravelPreferenceGetPayload<{
  select: typeof userTravelPreferenceSelect;
}>;

function toStringArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function serializeDecimalNumber(value: { toString: () => string } | number | null) {
  if (value === null) {
    return null;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

export function toProfileDto(profile: ProfileRecord): ProfileDto {
  return profile;
}

export function toUserTravelPreferenceDto(
  preference: UserTravelPreferenceRecord,
): UserTravelPreferenceDto {
  return {
    id: preference.id,
    userId: preference.userId,
    budgetLevel: preference.budgetLevel,
    pace: preference.pace,
    interests: preference.interests,
    transportationModes: preference.transportationModes,
    accommodationTypes: preference.accommodationTypes,
    hotelPriority: preference.hotelPriority,
    walkingToleranceKm: serializeDecimalNumber(preference.walkingToleranceKm),
    dietaryRestrictions: toStringArray(preference.dietaryRestrictions),
    accessibilityNeeds: toStringArray(preference.accessibilityNeeds),
    mustAvoid: toStringArray(preference.mustAvoid),
    customPreferences: toStringArray(preference.customPreferences),
    metadata: preference.metadata,
    createdAt: preference.createdAt.toISOString(),
    updatedAt: preference.updatedAt.toISOString(),
  };
}

export async function getProfileForUser(userId: string) {
  const profile = await db.user.findUnique({
    where: {
      id: userId,
    },
    select: profileSelect,
  });

  return profile ? toProfileDto(profile) : null;
}

export async function getUserTravelPreferenceForUser(userId: string) {
  const preference = await db.userTravelPreference.findUnique({
    where: {
      userId,
    },
    select: userTravelPreferenceSelect,
  });

  return preference ? toUserTravelPreferenceDto(preference) : null;
}
