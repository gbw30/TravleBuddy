import { redirect } from "next/navigation";
import { SignInButton } from "@/components/auth/auth-buttons";
import { auth } from "@/lib/auth";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4">
      <section className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-zinc-950">Sign in</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Use your Google account to continue planning trips.
          </p>
        </div>
        <SignInButton />
      </section>
    </main>
  );
}
