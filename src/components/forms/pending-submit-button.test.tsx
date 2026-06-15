import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const formStatus = vi.hoisted(() => ({
  pending: false,
}));

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom")>();

  return {
    ...actual,
    useFormStatus: () => ({
      pending: formStatus.pending,
    }),
  };
});

import { PendingSubmitButton } from "./pending-submit-button";

function textContent(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textContent).join("");
  }

  if (!isValidElement(node)) {
    return "";
  }

  return textContent((node as { props: { children?: ReactNode } }).props.children);
}

describe("PendingSubmitButton", () => {
  it("renders the normal label when the parent form is idle", () => {
    formStatus.pending = false;

    const button = PendingSubmitButton({
      children: "Pick",
      pendingLabel: "Picking...",
      className: "button",
    });

    expect(textContent(button)).toBe("Pick");
    expect(button.props.disabled).toBe(false);
    expect(button.props["aria-busy"]).toBeUndefined();
  });

  it("renders the pending label and disables itself during form submission", () => {
    formStatus.pending = true;

    const button = PendingSubmitButton({
      children: "Pick",
      pendingLabel: "Picking...",
      className: "button",
    });

    expect(textContent(button)).toBe("Picking...");
    expect(button.props.disabled).toBe(true);
    expect(button.props["aria-busy"]).toBe(true);
  });
});
