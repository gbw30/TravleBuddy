import { z } from "zod";

export const updateProfileInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
});

export type UpdateProfileInput = z.input<typeof updateProfileInputSchema>;
export type ParsedUpdateProfileInput = z.output<typeof updateProfileInputSchema>;

export function getProfileInputFromFormData(formData: FormData) {
  return {
    name: formData.get("name"),
  };
}
