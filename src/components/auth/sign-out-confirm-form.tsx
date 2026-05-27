"use client";

import { LogOut } from "lucide-react";

export function shouldSubmitSignOut(confirmed: boolean) {
  return confirmed;
}

export function SignOutConfirmForm({
  action,
}: {
  action: () => Promise<void>;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!shouldSubmitSignOut(window.confirm("Sign out of TravleBuddy?"))) {
          event.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        <LogOut aria-hidden="true" className="size-4" />
        Sign out
      </button>
    </form>
  );
}
