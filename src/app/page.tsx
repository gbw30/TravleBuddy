import Link from "next/link";
import { AppNav } from "@/components/layout/app-nav";

export default function Home() {
  return (
    <>
      <AppNav />
      <main className="flex-1 bg-zinc-50">
        <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-6xl flex-col justify-center px-4 py-16 sm:px-6">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-zinc-500">TravleBuddy</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-zinc-950 sm:text-5xl">
              Plan better trips with a secure planning workspace.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600">
              Sign in to start building your protected travel planning session.
              Draft discovery and full planning workflows are being developed
              behind authenticated routes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              >
                Open dashboard
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-white"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
