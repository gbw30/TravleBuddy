import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import {
  checkItineraryConflicts,
  updateItineraryConflictStatus,
} from "./conflict-engine";

function formString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function formConflictStatus(value: FormDataEntryValue | null) {
  return formString(value) === "IGNORED" ? "IGNORED" : "RESOLVED";
}

export async function checkItineraryConflictsFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));

  if (!tripId) {
    redirect("/trips?error=invalid-trip");
  }

  const result = await checkItineraryConflicts(userId, tripId);

  if (result.status === "not_found") redirect("/trips?error=not-found");

  revalidatePath(`/trips/${tripId}/itinerary`);
  redirect(`/trips/${tripId}/itinerary?conflicts=checked`);
}

export async function updateItineraryConflictStatusFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const tripId = formString(formData.get("tripId"));
  const conflictId = formString(formData.get("conflictId"));

  if (!tripId || !conflictId) {
    redirect("/trips?error=invalid-conflict");
  }

  const result = await updateItineraryConflictStatus(userId, tripId, {
    conflictId,
    status: formConflictStatus(formData.get("status")),
  });

  if (result.status === "not_found") redirect("/trips?error=not-found");

  revalidatePath(`/trips/${tripId}/itinerary`);
  redirect(`/trips/${tripId}/itinerary`);
}
