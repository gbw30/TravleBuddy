import Link from "next/link";
import { auth } from "@/lib/auth";
import { SignInButton, SignOutButton } from "@/components/auth/auth-buttons";

export async function AppNav() {
  const session = await auth();
  const isSignedIn = Boolean(session?.user?.id);

  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-base font-semibold text-zinc-950">
          TravleBuddy
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {isSignedIn ? (
            <>
              <Link className="font-medium text-zinc-700 hover:text-zinc-950" href="/dashboard">
                Dashboard
              </Link>
              <Link className="font-medium text-zinc-700 hover:text-zinc-950" href="/profile">
                Profile
              </Link>
              <SignOutButton />
            </>
          ) : (
            <SignInButton />
          )}
        </nav>
      </div>
    </header>
  );
}
