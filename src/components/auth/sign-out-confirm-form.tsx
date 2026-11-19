"use client";

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
        className="inline-flex min-h-8 items-center font-mono text-xs tracking-[0.08em] whitespace-nowrap text-muted uppercase sm:tracking-[0.12em] transition-colors duration-150 ease-settle hover:text-ink"
      >
        Sign out
      </button>
    </form>
  );
}
