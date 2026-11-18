import { redirect } from "next/navigation";
import {
  buttonArrow,
  buttonLarge,
  buttonSecond,
} from "@/components/keepsake/styles";
import { signIn, signOut } from "@/lib/auth";
import { SignOutConfirmForm } from "./sign-out-confirm-form";

export function SignInButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("google", { redirectTo: "/home" });
      }}
    >
      <button type="submit" className={buttonLarge}>
        Sign in with Google
        <span aria-hidden className={buttonArrow}>
          →
        </span>
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
        redirect("/home");
      }}
    >
      <button type="submit" className={buttonSecond}>
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
