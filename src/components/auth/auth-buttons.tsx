import { LogIn } from "lucide-react";
import { redirect } from "next/navigation";
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

/** Shown on the login page only when the development sign-in is enabled. */
export function DevSignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        // Redirect ourselves with a relative path: Auth.js would send the
        // browser to AUTH_URL, which is the wrong port when dev runs elsewhere.
        await signIn("dev-login", { redirect: false });
        redirect("/dashboard");
      }}
    >
      <button
        type="submit"
        className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-100"
      >
        Sign in as dev user
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
