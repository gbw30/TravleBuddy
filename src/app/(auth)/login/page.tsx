import { redirect } from "next/navigation";

import { DevSignInButton, SignInButton } from "@/components/auth/auth-buttons";
import { eyebrow, panel, sectionTitle } from "@/components/keepsake/styles";
import { auth } from "@/lib/auth";
import { isDevLoginEnabled } from "@/lib/env";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/home");
  }

  return (
    <main className="keepsake-paper flex min-h-dvh flex-1 items-center justify-center px-5 text-[17px] leading-[1.55]">
      <section className={`${panel} w-full max-w-md p-8 md:p-10`}>
        <p className={eyebrow}>
          Travle<em>Buddy</em>
        </p>
        <h1 className={`mt-3 ${sectionTitle}`}>Sign in</h1>
        <p className="mt-3 text-base text-muted">
          Use your Google account to keep your trips and pick up where you left
          off.
        </p>
        <div className="mt-7">
          <SignInButton />
        </div>
        {isDevLoginEnabled() && (
          <div className="mt-6 border-t border-ink/12 pt-5">
            <DevSignInButton />
            <p className="mt-2 text-[13px] text-muted">
              Development only. Signs in a fixed local user without Google.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
