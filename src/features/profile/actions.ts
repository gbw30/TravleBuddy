import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  getProfileInputFromFormData,
  updateProfileInputSchema,
} from "./schemas";
import { profileSelect, toProfileDto } from "./queries";
import type { ProfileDto } from "./types";

export type UpdateUserProfileResult =
  | {
      status: "updated";
      profile: ProfileDto;
    }
  | {
      status: "invalid";
    };

export async function updateUserProfile(
  userId: string,
  input: unknown,
): Promise<UpdateUserProfileResult> {
  const parsed = updateProfileInputSchema.safeParse(input);

  if (!parsed.success) {
    return {
      status: "invalid",
    };
  }

  const profile = await db.user.update({
    where: {
      id: userId,
    },
    data: {
      name: parsed.data.name,
    },
    select: profileSelect,
  });

  return {
    status: "updated",
    profile: toProfileDto(profile),
  };
}

export async function updateUserProfileFormAction(formData: FormData) {
  "use server";

  const userId = await requireUser();
  const result = await updateUserProfile(
    userId,
    getProfileInputFromFormData(formData),
  );

  if (result.status === "invalid") {
    redirect("/profile?error=invalid");
  }

  revalidatePath("/profile");
  redirect("/profile?saved=1");
}
