import Link from "next/link";
import { redirect } from "next/navigation";

import {
  buttonArrow,
  buttonLarge,
  eyebrow,
  pageTitle,
  quietLarge,
} from "@/components/keepsake/styles";
import { auth } from "@/lib/auth";

export default async function Landing() {
  const session = await auth();
  if (session?.user?.id) redirect("/home");

  return (
    <main className="keepsake-paper flex min-h-dvh flex-1 flex-col text-[17px] leading-[1.55]">
      <div className="mx-auto w-full max-w-[1240px] px-5 pt-6 md:px-10 md:pt-7">
        <span className="font-serif text-[24px] tracking-[-0.02em]">
          Travle<em>Buddy</em>
        </span>
      </div>
      <section className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col justify-center px-5 py-16 md:px-10">
        <p className={eyebrow}>A travel agent with a memory</p>
        <h1 className={`mt-4 max-w-[14ch] ${pageTitle}`}>
          Trips planned the way <em>you travel.</em>
        </h1>
        <p className="mt-5 max-w-[32rem] text-lg text-ink/80 md:text-xl">
          Tell it where you are going and what is already booked. It keeps your
          trips, your tickets and what you have decided in one place.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-6">
          <Link href="/login" className={buttonLarge}>
            Sign in
            <span aria-hidden className={buttonArrow}>
              →
            </span>
          </Link>
          <Link href="/prototype" className={quietLarge}>
            See a sample trip
          </Link>
        </div>
      </section>
    </main>
  );
}
