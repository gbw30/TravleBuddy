import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WindowRow } from "./window-row";

describe("WindowRow", () => {
  it("draws the bar of its shape beside the words", () => {
    const html = renderToStaticMarkup(
      <WindowRow
        time="10:00"
        title="Pick up the hire car between 10:00 and 12:00"
        note="Lisbon Airport desk"
        window={{ shape: "BETWEEN", from: "10:00", to: "12:00" }}
      />,
    );
    expect(html).toContain('data-shape="BETWEEN"');
    expect(html).toContain("Pick up the hire car between 10:00 and 12:00");
    expect(html).toContain("12:00");
  });
});
