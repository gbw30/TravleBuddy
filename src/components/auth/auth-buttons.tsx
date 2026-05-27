import { LogIn } from "lucide-react";
import { signIn, signOut } from "@/lib/auth";
import { SignOutConfirmForm } from "./sign-out-confirm-form";

export function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/dashboard" });
      }}
    >
      <button
        type="submit"
        className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
      >
        <LogIn aria-hidden="true" className="size-4" />
        Sign in with Google
      </button>
    </form>
  );
}

export function SignOutButton() {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return <SignOutConfirmForm action={signOutAction} />;
}
