import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import type { City } from "@/features/places/contracts";
import type { PlanSnapshot } from "@/use-cases/plan-snapshot";

import { signedIn, type Call } from "../site";
import { isMovement, onlyColourDiffers, type Look } from "./rules";

// Walks every real screen in each browser and checks the design
// requirements a machine can check (TB-DSN-01 to TB-DSN-07): keyboard,
// phone width, contrast, colour alone, motion, and text for screen readers.
//
//   npm run quality:design -- http://localhost:3100
//
// It needs a local server started with PLACE_PROVIDER_MODE=mock, AI_MODE=off
// and the development sign-in. It signs in as the development user, resets
// that user's profile, and deletes the trips it makes (two per browser).

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "docs/quality/design-checks.md";
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
const NARROW = { width: 320, height: 700 };
const BROWSERS = { Chromium: chromium, Firefox: firefox, WebKit: webkit };
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// tsx names the functions it compiles; a page does not know that helper.
// The counter records each time the page starts a view transition.
const INIT = `
  window.__name = (fn) => fn;
  window.__vt = 0;
  if (Document.prototype.startViewTransition) {
    const start = Document.prototype.startViewTransition;
    Document.prototype.startViewTransition = function (...args) {
      window.__vt += 1;
      return start.apply(this, args);
    };
  }
`;

type Row = {
  screen: string;
  check: string;
  requirement: string;
  ok: boolean;
  detail: string;
};
type Data = { guided: string; quick: string; kyoto: string };
type Screen = { name: string; path: string; cards?: boolean };

const row = (
  screen: string,
  check: string,
  requirement: string,
  problems: string[],
  fine: string,
): Row => ({
  screen,
  check,
  requirement,
  ok: problems.length === 0,
  detail:
    problems.length === 0
      ? fine
      : [...new Set(problems)].slice(0, 6).join("; ") +
        (new Set(problems).size > 6
          ? `; and ${new Set(problems).size - 6} more`
          : ""),
});

async function open(page: Page, path: string) {
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page
    .waitForLoadState("networkidle", { timeout: 20_000 })
    .catch(() => undefined);
}

/** Opens the trip at a slot that has cards to show. */
async function showCards(page: Page, call: Call, tripId: string) {
  const plan: PlanSnapshot = (await call("get", `/trips/${tripId}/plan`)).json
    .plan;
  const slots = plan.view.days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "open" && entry.kind !== "lunch" && entry.kind !== "dinner"
        ? [entry.slotId]
        : [],
    ),
  );
  for (const slotId of slots) {
    await open(page, `/trips/${tripId}?slot=${slotId}`);
    const shown = await page
      .getByRole("button", { name: /Flip card/ })
      .first()
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (shown) return true;
  }
  return false;
}

// ---- What a page is asked. Each of these runs inside the browser. ----

const CONTROLS =
  "a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=slider], [role=checkbox], [role=radio], [role=switch], [role=tab], [role=menuitem]";

/** Every control a person can see, numbered, and anything clickable that is not a control. */
const scanControls = (selector: string) => {
  const visible = (el: Element) => {
    const box = el.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      // False inside a closed <details>, whose content keeps its size.
      (el.checkVisibility?.({ visibilityProperty: true }) ?? true) &&
      !el.closest("[aria-hidden='true'], [inert]")
    );
  };
  const say = (el: Element) =>
    `${el.tagName.toLowerCase()} “${(el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).labels?.[0]?.textContent?.trim() || el.getAttribute("placeholder") || el.getAttribute("type") || "").trim().replace(/\s+/g, " ").slice(0, 40)}”`;
  const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter(
    (el) => visible(el) && !el.matches(":disabled"),
  );
  controls.forEach((el, index) => (el.dataset.kb = String(index)));
  const clickOnly = [...document.querySelectorAll<HTMLElement>("body *")]
    .filter(
      (el) =>
        getComputedStyle(el).cursor === "pointer" &&
        visible(el) &&
        !el.closest(selector) &&
        !el.closest("label") &&
        (!el.parentElement ||
          getComputedStyle(el.parentElement).cursor !== "pointer"),
    )
    .map(say);
  return {
    controls: controls.map((el, index) => ({
      kb: String(index),
      say: say(el),
      group:
        el instanceof HTMLInputElement && el.type === "radio"
          ? `radio:${el.name}`
          : null,
      off: el.tabIndex < 0,
      box: el.getBoundingClientRect().toJSON() as {
        width: number;
        height: number;
      },
      inline: getComputedStyle(el).display === "inline",
      native:
        el instanceof HTMLInputElement &&
        (el.type === "checkbox" || el.type === "radio"),
    })),
    clickOnly,
  };
};

/** Where keyboard focus is, and whether a person can see it there. */
const focusNow = () => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) return null;
  const style = getComputedStyle(el);
  return {
    kb: el.dataset.kb ?? null,
    ring:
      (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
      style.boxShadow !== "none" ||
      // The last Tab stop of a date or time field is the browser's own
      // picker button, which draws its own ring inside the field.
      (el instanceof HTMLInputElement &&
        ["date", "time"].includes(el.type) &&
        !el.matches(":focus-visible")),
    say: `${el.tagName.toLowerCase()} “${(el.getAttribute("aria-label") || el.textContent?.trim() || (el as HTMLInputElement).labels?.[0]?.textContent?.trim() || el.getAttribute("placeholder") || el.getAttribute("type") || "").trim().replace(/\s+/g, " ").slice(0, 40)}”`,
  };
};

/** Pictures, stamps, ticket stubs and cards without text for a screen reader. */
const scanText = () => {
  const problems: string[] = [];
  const hidden = (el: Element) => !!el.closest("[aria-hidden='true']");
  for (const image of document.querySelectorAll("img")) {
    if (!image.hasAttribute("alt")) problems.push("an image has no alt text");
  }
  for (const picture of document.querySelectorAll("[role=img]")) {
    if (
      !(picture.getAttribute("aria-label") ?? "").trim() &&
      !hidden(picture)
    ) {
      problems.push("a picture has no spoken name");
    }
  }
  for (const icon of document.querySelectorAll("svg")) {
    const named =
      icon.getAttribute("aria-label") ||
      icon.querySelector("title") ||
      icon.closest("[aria-label]") ||
      (icon.closest("button, a")?.textContent ?? "").trim();
    if (!hidden(icon) && !named) {
      problems.push("an icon is neither named nor hidden from screen readers");
    }
  }
  const stubs = [...document.querySelectorAll("[data-qa='ticket-stub']")];
  for (const stub of stubs) {
    if (!(stub.textContent ?? "").trim() || hidden(stub)) {
      problems.push("a ticket stub has no text for a screen reader");
    }
  }
  const cards = [...document.querySelectorAll("[data-qa='postcard']")];
  for (const card of cards) {
    const flip = card.querySelector("button[aria-pressed]");
    if (!(flip?.getAttribute("aria-label") ?? "").trim()) {
      problems.push("a card's flip button has no name");
    }
    if (!card.querySelector("[aria-live]")) {
      problems.push("a card's back is not announced when it flips");
    }
  }
  const stamps = [
    ...document.querySelectorAll("[role=img][aria-label]"),
  ].filter((el) => /day \d+/i.test(el.getAttribute("aria-label") ?? ""));
  return {
    problems,
    cards: cards.length,
    stubs: stubs.length,
    stamps: stamps.length,
  };
};

/** The paper and the type of the keepsake direction. */
const scanLook = () => {
  const probe = document.createElement("span");
  probe.style.backgroundColor = "var(--color-paper)";
  document.body.append(probe);
  const paper = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const grounds = [
    ...document.querySelectorAll(".keepsake-paper"),
    document.body,
  ].map((el) => getComputedStyle(el).backgroundColor);
  const heading = document.querySelector("h1, h2");
  return {
    paper,
    ground: grounds.find((colour) => colour !== "rgba(0, 0, 0, 0)") ?? "none",
    heading: heading ? getComputedStyle(heading).fontFamily : "",
  };
};

/** A chosen control and one that is not chosen, from each group that has both. */
const scanChoices = () => {
  // "#rrggbb" of a computed colour; nothing for one that cannot be seen.
  const hex = (colour: string) => {
    const [red, green, blue, alpha = 1] = (colour.match(/[\d.]+/g) ?? []).map(
      Number,
    );
    return !colour.startsWith("rgb") || alpha === 0
      ? ""
      : `#${[red, green, blue].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
  };
  // The colour behind an element: its own, or the nearest one behind it.
  const ground = (el: Element | null): string =>
    !el
      ? ""
      : hex(getComputedStyle(el).backgroundColor) || ground(el.parentElement);
  const look = (el: Element) => {
    const style = getComputedStyle(el);
    const drawn = (pseudo: string) => {
      const content = getComputedStyle(el, pseudo).content;
      return content !== "none" && content !== "normal" ? 1 : 0;
    };
    return {
      weight: style.fontWeight,
      decoration: style.textDecorationLine,
      border: [
        [style.borderTopWidth, style.borderTopStyle, style.borderTopColor],
        [
          style.borderBottomWidth,
          style.borderBottomStyle,
          style.borderBottomColor,
        ],
      ]
        .map(([width, line, colour]) =>
          line === "none" || hex(colour) === "" ? "none" : `${width} ${line}`,
        )
        .join(" / "),
      ground: ground(el),
      ink: hex(style.color),
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      shadow: style.boxShadow.replace(/rgba?\([^)]*\)|#[0-9a-f]+/gi, "c"),
      marks:
        el.querySelectorAll("svg, img").length +
        drawn("::before") +
        drawn("::after"),
    };
  };
  const pairs: { name: string; chosen: Look; other: Look }[] = [];
  for (const attribute of [
    "aria-pressed",
    "aria-checked",
    "aria-selected",
    "aria-current",
  ]) {
    const groups = new Map<Element, Element[]>();
    for (const el of document.querySelectorAll(`[${attribute}]`)) {
      const group =
        el.closest("nav, [role=group], [role=radiogroup], fieldset, ul") ??
        el.parentElement;
      if (group) groups.set(group, [...(groups.get(group) ?? []), el]);
    }
    for (const members of groups.values()) {
      const on = (el: Element) =>
        !["false", null].includes(el.getAttribute(attribute));
      const chosen = members.find(on);
      const other =
        members.find((el) => !on(el)) ??
        (chosen?.tagName === "A"
          ? [...(chosen.closest("nav")?.querySelectorAll("a") ?? [])].find(
              (el) => el !== chosen,
            )
          : undefined);
      if (chosen && other) {
        pairs.push({
          name: `${(chosen.getAttribute("aria-label") ?? chosen.textContent ?? "").trim().slice(0, 30)} (${attribute})`,
          chosen: look(chosen),
          other: look(other),
        });
      }
    }
  }
  return pairs;
};

/** Sideways scrolling, and what causes it. */
const scanWidth = () => {
  const width = document.documentElement.clientWidth;
  const scroll = document.documentElement.scrollWidth;
  const wide =
    scroll <= width + 1
      ? []
      : [...document.querySelectorAll<HTMLElement>("body *")]
          .filter((el) => el.getBoundingClientRect().right > width + 1)
          .slice(0, 3)
          .map(
            (el) =>
              `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} reaches ${Math.round(el.getBoundingClientRect().right)} px`,
          );
  return { width, scroll, wide };
};

/** Animations and transitions running at this moment. */
const running = () =>
  document
    .getAnimations()
    .filter((animation) => animation.playState === "running")
    .map((animation) => {
      const effect = animation.effect as KeyframeEffect | null;
      const target = effect?.target;
      return {
        properties:
          "transitionProperty" in animation
            ? [String(animation.transitionProperty)]
            : (effect?.getKeyframes().flatMap((frame) => Object.keys(frame)) ??
              []),
        target: target
          ? `${target.tagName.toLowerCase()}${target.getAttribute("data-qa") ? `[${target.getAttribute("data-qa")}]` : ""}${effect?.pseudoElement ?? ""}`
          : "the page",
      };
    });

// ---- The checks of one screen ----

async function axeRows(page: Page, screen: string, at: string): Promise<Row[]> {
  const { violations } = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    .analyze();
  const say = (list: typeof violations) =>
    list.map(
      (item) =>
        `${item.id} on ${item.nodes.length}: ${String(item.nodes[0]?.target[0]).slice(0, 70)}`,
    );
  const contrast = violations.filter((item) => item.id === "color-contrast");
  const rest = violations.filter((item) => item.id !== "color-contrast");
  return [
    row(
      screen,
      `Text contrast is AA (axe, ${at})`,
      "TB-DSN-06",
      say(contrast),
      "no contrast violation",
    ),
    row(
      screen,
      `Names, roles and structure (axe, ${at})`,
      "TB-DSN-07",
      say(rest),
      "no violation",
    ),
  ];
}

async function keyboardRow(page: Page, screen: string): Promise<Row> {
  const { controls, clickOnly } = await page.evaluate(scanControls, CONTROLS);
  const reached = new Set<string>();
  const noRing: string[] = [];
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  for (let press = 0; press < Math.min(controls.length + 20, 260); press += 1) {
    await page.keyboard.press("Tab");
    const at = await page.evaluate(focusNow);
    if (!at || at.say.startsWith("nextjs-portal")) continue;
    if (at.kb) reached.add(at.kb);
    if (at.ring) continue;
    // A ring that fades in is not there in the first instant: look again.
    let ring = false;
    for (let look = 0; look < 5 && !ring; look += 1) {
      await page.waitForTimeout(200);
      ring = (await page.evaluate(focusNow))?.ring ?? false;
    }
    if (!ring) noRing.push(`no visible focus on ${at.say}`);
  }
  const groups = new Set(
    controls.filter((item) => reached.has(item.kb)).map((item) => item.group),
  );
  const missed = controls
    .filter(
      (item) =>
        !reached.has(item.kb) && !(item.group && groups.has(item.group)),
    )
    .map((item) => `Tab does not reach ${item.say}`);
  return row(
    screen,
    "Tab reaches every control, focus shows, nothing is click-only",
    "TB-DSN-05",
    [
      ...missed,
      ...noRing,
      ...clickOnly.map((item) => `${item} is clickable but not a control`),
    ],
    `${controls.length} controls, each reached by Tab with focus showing`,
  );
}

async function screenRows(
  page: Page,
  screen: Screen,
  call: Call,
  data: Data,
): Promise<Row[]> {
  if (screen.cards) await showCards(page, call, data.guided);
  else await open(page, screen.path);
  const rows = await axeRows(page, screen.name, "desktop");

  const text = await page.evaluate(scanText);
  rows.push(
    row(
      screen.name,
      "Pictures, stamps, ticket stubs and cards have text for screen readers",
      "TB-DSN-07",
      [
        ...text.problems,
        ...(screen.cards && text.cards === 0
          ? ["no card on the page to check"]
          : []),
        ...(screen.cards && text.stubs === 0
          ? ["no ticket stub on the page to check"]
          : []),
        ...(screen.cards && text.stamps === 0
          ? ["no day stamp on the page to check"]
          : []),
      ],
      screen.cards
        ? `${text.cards} cards, ${text.stubs} ticket stubs and ${text.stamps} day stamps, each with text`
        : "every picture and icon is named or hidden",
    ),
  );

  const look = await page.evaluate(scanLook);
  rows.push(
    row(
      screen.name,
      "Paper background and serif headings",
      "TB-DSN-01",
      [
        ...(look.ground === look.paper
          ? []
          : [
              `the background is ${look.ground}, not the paper colour ${look.paper}`,
            ]),
        ...(/fraunces|(^|,\s*)serif/i.test(look.heading)
          ? []
          : [`the heading is set in ${look.heading || "no heading found"}`]),
      ],
      "the page is on paper and its heading is in the serif",
    ),
  );

  const choices = await page.evaluate(scanChoices);
  rows.push(
    row(
      screen.name,
      "A chosen control differs by more than colour",
      "TB-DSN-06",
      choices
        .filter((pair) => onlyColourDiffers(pair.chosen, pair.other))
        .map(
          (pair) => `“${pair.name}” differs from the others by colour alone`,
        ),
      choices.length === 0
        ? "no chosen control on this screen"
        : `${choices.length} groups, each marked by more than colour`,
    ),
  );

  rows.push(await keyboardRow(page, screen.name));
  return rows;
}

async function phoneRows(
  page: Page,
  screen: Screen,
  call: Call,
  data: Data,
): Promise<Row[]> {
  if (screen.cards) await showCards(page, call, data.guided);
  else await open(page, screen.path);
  const rows = await axeRows(page, screen.name, "phone");
  const problems: string[] = [];
  for (const size of [PHONE, NARROW]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    const found = await page.evaluate(scanWidth);
    if (found.scroll > found.width + 1) {
      problems.push(
        `at ${size.width} px the page is ${found.scroll} px wide: ${found.wide.join(", ")}`,
      );
    }
  }
  rows.push(
    row(
      screen.name,
      "No sideways scrolling at 390 and 320 px",
      "TB-DSN-04",
      problems,
      "the page fits both widths",
    ),
  );

  await page.setViewportSize(PHONE);
  const { controls } = await page.evaluate(scanControls, CONTROLS);
  rows.push(
    row(
      screen.name,
      "Touch targets are at least 24 by 24 px",
      "TB-DSN-04",
      controls
        .filter(
          (item) =>
            !item.inline &&
            !item.native &&
            item.box.width > 2 &&
            (item.box.width < 24 || item.box.height < 24),
        )
        .map(
          (item) =>
            `${item.say} is ${Math.round(item.box.width)} by ${Math.round(item.box.height)}`,
        ),
      `${controls.length} controls, none too small`,
    ),
  );
  return rows;
}

/** The trip page with cards: what moves, with motion on or asked off. */
async function motionRows(
  context: BrowserContext,
  screens: Screen[],
  reduce: boolean,
  call: Call,
  data: Data,
): Promise<Row[]> {
  const page = await context.newPage();
  const seen: string[] = [];
  const sample = async (step: string) => {
    for (const wait of [30, 120]) {
      await page.waitForTimeout(wait);
      for (const item of await page.evaluate(running)) {
        if (isMovement(item.properties)) {
          seen.push(
            `${step}: ${item.target} (${item.properties.filter((name) => isMovement([name])).join(", ")})`,
          );
        }
      }
    }
  };
  if (reduce) {
    for (const screen of screens) {
      await page.goto(
        `${base}${screen.cards ? `/trips/${data.guided}` : screen.path}`,
        { waitUntil: "domcontentloaded" },
      );
      await sample(`loading ${screen.name}`);
    }
  }
  if (!(await showCards(page, call, data.guided))) {
    return [
      row(
        "Trip",
        "Motion",
        "TB-DSN-03",
        ["no cards were offered, so nothing could be checked"],
        "",
      ),
    ];
  }
  const card = page.locator("[data-qa='postcard']").first();
  await card.hover();
  await sample("hovering a card");
  const flip = card.getByRole("button", { name: /Flip card/ });
  const before = seen.length;
  await flip.click();
  await sample("flipping a card");
  const flipped = (await flip.getAttribute("aria-pressed")) === "true";
  const flipMoved = seen.length > before;
  await flip.click();
  await page.waitForTimeout(700);
  await card.getByRole("button", { name: /Closer look/ }).click();
  await sample("opening the closer look");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await card.getByRole("button", { name: /^Pick / }).click();
  // The place lands when the server has answered: watch until the card is gone.
  for (let watch = 0; watch < 40; watch += 1) {
    await sample("picking a card");
    if ((await flip.count()) === 0) break;
  }
  await sample("after the pick");
  const travel = await page.evaluate(() => ({
    started: (window as unknown as { __vt: number }).__vt,
    known: "startViewTransition" in document,
  }));
  await page.close();

  if (reduce) {
    return [
      row(
        "Trip",
        "Nothing moves when the device asks for less motion",
        "TB-DSN-03",
        [
          ...seen,
          ...(travel.started > 0
            ? ["a picked card still travelled to its slot"]
            : []),
        ],
        "loading each screen, hovering, flipping, the closer look and picking: no movement",
      ),
    ];
  }
  return [
    row(
      "Trip",
      "A card flips on click",
      "TB-DSN-02",
      [
        ...(flipped ? [] : ["the card did not report itself flipped"]),
        ...(flipMoved ? [] : ["the flip showed no movement"]),
      ],
      "the card turns over, and says so to screen readers",
    ),
    row(
      "Trip",
      "A picked card visibly moves to its slot",
      "TB-DSN-02",
      travel.started > 0
        ? []
        : [
            travel.known
              ? "picking did not start a view transition"
              : "this browser has no view transitions, so the picked place appears in its slot without travelling",
          ],
      "picking started a view transition from the card to the slot",
    ),
  ];
}

/** Three actions done with the keyboard alone: a card, a slider, a step. */
async function keyboardActions(
  page: Page,
  call: Call,
  data: Data,
): Promise<Row[]> {
  const rows: Row[] = [];

  const problems: string[] = [];
  if (await showCards(page, call, data.guided)) {
    const flip = page.getByRole("button", { name: /Flip card/ }).first();
    await flip.focus();
    await page.keyboard.press("Enter");
    if ((await flip.getAttribute("aria-pressed")) !== "true") {
      problems.push("Enter did not flip the card");
    }
    const pick = page.getByRole("button", { name: /^Pick / }).first();
    const name = ((await pick.getAttribute("aria-label")) ?? "").replace(
      /^Pick /,
      "",
    );
    await pick.focus();
    await page.keyboard.press("Enter");
    let landed = false;
    for (let attempt = 0; attempt < 20 && !landed; attempt += 1) {
      await page.waitForTimeout(500);
      const plan: PlanSnapshot = (
        await call("get", `/trips/${data.guided}/plan`)
      ).json.plan;
      landed = plan.view.days.some((day) =>
        day.entries.some(
          (entry) =>
            entry.type === "place" && plan.chosen[entry.placeId]?.name === name,
        ),
      );
    }
    if (!landed)
      problems.push(`Enter on “Pick ${name}” did not put it in the plan`);
  } else {
    problems.push("no cards were offered, so nothing could be checked");
  }
  rows.push(
    row(
      "Trip",
      "A card is flipped and picked with the keyboard",
      "TB-DSN-05",
      problems,
      "Enter flips the card; Enter on Pick puts the place in the plan",
    ),
  );

  await open(page, "/profile");
  const slider = page.getByRole("slider", { name: "Pace" });
  const sliderProblems: string[] = [];
  if (await slider.isVisible().catch(() => false)) {
    const before = await slider.getAttribute("aria-valuetext");
    const atEnd =
      (await slider.inputValue()) === (await slider.getAttribute("max"));
    await slider.focus();
    await page.keyboard.press(atEnd ? "ArrowLeft" : "ArrowRight");
    await page.waitForTimeout(150);
    const soon = await slider.getAttribute("aria-valuetext");
    await page.waitForTimeout(2500);
    const after = await slider.getAttribute("aria-valuetext");
    if (soon === before)
      sliderProblems.push("the slider jumped back while its change was saved");
    if (after === before)
      sliderProblems.push(`the arrow key left the pace at “${before}”`);
    await page.keyboard.press(atEnd ? "ArrowRight" : "ArrowLeft");
    await page.waitForTimeout(2500);
  } else {
    sliderProblems.push("the Pace slider is not on the page");
  }
  rows.push(
    row(
      "Profile",
      "A slider is moved with the arrow keys",
      "TB-DSN-05",
      sliderProblems,
      "the arrow key changes the pace, and its spoken value",
    ),
  );

  await open(page, `/trips/${data.quick}/brief`);
  const step = async () =>
    (
      await page
        .getByText(/Step \d of 5/)
        .first()
        .textContent()
        .catch(() => null)
    )?.match(/\d/)?.[0] ?? null;
  const from = await step();
  const next = page.getByRole("button", { name: "Next", exact: true });
  const button = (await next.isVisible().catch(() => false))
    ? next
    : page.getByRole("button", { name: "Back", exact: true });
  const stepProblems: string[] = [];
  if (await button.isVisible().catch(() => false)) {
    await button.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const to = await step();
    if (!from || !to || from === to)
      stepProblems.push(`Enter left the brief at step ${from ?? "?"}`);
  } else {
    stepProblems.push("the brief has no Next or Back button");
  }
  rows.push(
    row(
      "Brief",
      "The brief's steps are walked with the keyboard",
      "TB-DSN-05",
      stepProblems,
      "Enter on the step button moves to the next step",
    ),
  );
  return rows;
}

// ---- The trips the screens show ----

async function setUp(call: Call): Promise<Data> {
  await call("delete", "/profile");
  for (const text of ["Packed", "Museums and exhibitions"]) {
    await call("post", "/profile/entries", { text });
  }
  const city = async (name: string): Promise<City> => {
    const found: City[] = (await call("get", `/places/cities?q=${name}`)).json
      .cities;
    const match = found.find((item) => item.name === name);
    if (!match) throw new Error(`No sample city called ${name}`);
    return match;
  };
  const trip = async (planningMode: "GUIDED" | "QUICK", tickets: object[]) => {
    const id: string = (await call("post", "/trips", { tickets, planningMode }))
      .json.trip.id;
    let revision: number = (await call("get", `/trips/${id}/brief`)).json.brief
      .revision;
    const change = async (
      method: "post" | "put" | "patch",
      path: string,
      body: object,
    ) => {
      const answer = await call(method, `/trips/${id}${path}`, {
        ...body,
        operationId: randomUUID(),
        expectedRevision: revision,
      });
      if (answer.status >= 300) {
        throw new Error(
          `${method} ${path} answered ${answer.status} ${JSON.stringify(answer.json)}`,
        );
      }
      revision = answer.json.revision ?? revision;
    };
    return { id, change };
  };

  // A trip planned in conversation: a ticket, a booking, answers, one pick.
  const guided = await trip("GUIDED", [
    {
      mode: "FLIGHT",
      from: "Osaka",
      to: "Tokyo",
      departDate: "2027-05-10",
      departTime: "07:10",
      arriveDate: "2027-05-10",
      arriveTime: "08:25",
      reference: "NH14",
    },
  ]);
  await guided.change("patch", "", {
    action: "facts",
    facts: {
      cities: [{ city: await city("Tokyo"), nights: null }],
      startDate: "2027-05-10",
      endDate: "2027-05-13",
      adults: 2,
      children: 0,
    },
  });
  await guided.change("post", "/commitments", {
    commitment: {
      kind: "RESERVATION",
      title: "Dinner at Den",
      date: "2027-05-11",
      startTime: "19:00",
      endTime: "21:00",
    },
  });
  const answers: Record<string, string[]> = {
    pace: ["relaxed"],
    food: ["vegetarian"],
    breakfast: ["suggest"],
    interests: ["markets"],
  };
  for (let turn = 0; turn < 40; turn += 1) {
    const waiting = (await call("get", `/trips/${guided.id}/conversation`)).json
      .conversation.waiting;
    if (!waiting) break;
    const values = answers[waiting.topic as string];
    await guided.change("post", "/conversation", {
      turn: values
        ? { type: "answer", topic: waiting.topic, values }
        : { type: "skip", topic: waiting.topic },
    });
  }
  const plan: PlanSnapshot = (await call("get", `/trips/${guided.id}/plan`))
    .json.plan;
  const slot = plan.view.days[1].entries.find(
    (entry) => entry.type === "open" && entry.kind === "morning",
  );
  if (slot && slot.type === "open") {
    const offered: PlanSnapshot = (
      await call("get", `/trips/${guided.id}/plan?slot=${slot.slotId}`)
    ).json.plan;
    const card = offered.proposal?.cards[0];
    if (card) {
      await guided.change("post", "/plan", {
        action: { type: "pick", slotId: slot.slotId, placeId: card.placeId },
      });
    }
  }

  // A trip to be built from a brief: only where and when.
  const quick = await trip("QUICK", []);
  await quick.change("put", "/brief", {
    facts: {
      cities: [{ city: await city("Lisbon"), nights: null }],
      startDate: "2027-07-10",
      endDate: "2027-07-12",
      adults: 2,
      children: 0,
    },
  });

  // A trip to Kyoto, which no sample traveller plans: the place the walk adds
  // by hand is saved for that city and stays out of their plans.
  const kyoto = await trip("QUICK", []);
  await kyoto.change("put", "/brief", {
    facts: {
      cities: [{ city: await city("Kyoto"), nights: null }],
      startDate: "2027-07-10",
      endDate: "2027-07-12",
      adults: 2,
      children: 0,
    },
  });
  return { guided: guided.id, quick: quick.id, kyoto: kyoto.id };
}

/** A place added by hand, opened in its closer look: the links to check it with. */
async function checkItYourself(
  page: Page,
  call: Call,
  data: Data,
): Promise<Row[]> {
  const problems: string[] = [];
  const name = "Walk Test Gallery";
  const plan: PlanSnapshot = (await call("get", `/trips/${data.kyoto}/plan`))
    .json.plan;
  const slot = plan.view.days
    .flatMap((day) => day.entries)
    .find((entry) => entry.type === "open" && entry.kind === "afternoon");
  if (slot?.type !== "open") {
    return [
      row(
        "Trip",
        "Check it yourself",
        "TB-TRU-02",
        ["the plan has no open afternoon to put a place of my own in"],
        "",
      ),
    ];
  }
  const added = await call("post", `/trips/${data.kyoto}/places`, {
    name,
    kind: "museum",
    slotId: slot.slotId,
  });
  const placeId: string = added.json.card.placeId;
  const revision: number = (await call("get", `/trips/${data.kyoto}/brief`))
    .json.brief.revision;
  await call("post", `/trips/${data.kyoto}/plan`, {
    operationId: randomUUID(),
    expectedRevision: revision,
    action: { type: "pick", slotId: slot.slotId, placeId },
  });

  await open(page, `/trips/${data.kyoto}`);
  await page.getByRole("button", { name: `Details for ${name}` }).click();
  const dialog = page.getByRole("dialog");
  const maps = dialog.getByRole("link", {
    name: `${name} on Google Maps, opens in a new tab`,
  });
  if ((await maps.count()) !== 1) {
    problems.push("the closer look has no Google Maps link");
  } else {
    const href = (await maps.getAttribute("href")) ?? "";
    if (!href.startsWith("https://www.google.com/maps/search/?api=1&query=")) {
      problems.push(`the Maps link goes to ${href}`);
    }
    if ((await maps.getAttribute("target")) !== "_blank") {
      problems.push("the Maps link does not open in a new tab");
    }
    // The links sit just before Close, which has focus when the dialog opens.
    await dialog.getByRole("button", { name: "Close" }).focus();
    let reached = false;
    for (let press = 0; press < 6 && !reached; press += 1) {
      await page.keyboard.press("Shift+Tab");
      reached = await maps.evaluate((el) => el === document.activeElement);
    }
    if (!reached) problems.push("Tab does not reach the Maps link");
    else {
      let ring = false;
      for (let look = 0; look < 5 && !ring; look += 1) {
        await page.waitForTimeout(200);
        ring = (await page.evaluate(focusNow))?.ring ?? false;
      }
      if (!ring) problems.push("no visible focus on the Maps link");
    }
    const box = await maps.boundingBox();
    if (!box || box.width < 24 || box.height < 24) {
      problems.push(
        `the Maps link is ${Math.round(box?.width ?? 0)} by ${Math.round(box?.height ?? 0)}`,
      );
    }
  }
  if ((await dialog.getByText("Check it yourself").count()) !== 1) {
    problems.push("the closer look has no Check it yourself row");
  }
  if (
    (await dialog
      .getByText("Hours not known. Check before you go.")
      .count()) !== 1
  ) {
    problems.push("the doubt line is not under the hours");
  }
  for (const size of [PHONE, NARROW]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(250);
    const found = await page.evaluate(scanWidth);
    if (found.scroll > found.width + 1) {
      problems.push(
        `at ${size.width} px the page is ${found.scroll} px wide: ${found.wide.join(", ")}`,
      );
    }
  }
  await page.setViewportSize(DESKTOP);
  await page.keyboard.press("Escape");
  return [
    row(
      "Trip",
      "A place of my own offers links to check it, reached by Tab, 24 px or more, no sideways scroll at 390 and 320 px",
      "TB-TRU-02",
      problems,
      "the closer look shows its doubt line and the Maps link, reached by Tab with focus showing",
    ),
  ];
}

/**
 * A stay is added, its address looked up, the one found confirmed, and the
 * plan then shows the leg from the stay and the way back to it.
 */
async function stayAddress(page: Page, call: Call, data: Data): Promise<Row[]> {
  const problems: string[] = [];
  const plan = async (): Promise<PlanSnapshot> =>
    (await call("get", `/trips/${data.kyoto}/plan`)).json.plan;

  // Every slot of the second day is filled, so there is a leg from the stay
  // in the morning and the way back comes last, after the final place.
  const slots = (await plan()).view.days[1]?.entries.flatMap((entry) =>
    entry.type === "open" ? [entry.slotId] : [],
  );
  let picked = 0;
  for (const slotId of slots ?? []) {
    const offered: PlanSnapshot = (
      await call("get", `/trips/${data.kyoto}/plan?slot=${slotId}`)
    ).json.plan;
    const card =
      offered.proposal?.slotId === slotId && offered.proposal.cards[0];
    if (!card) continue;
    const revision: number = (await call("get", `/trips/${data.kyoto}/brief`))
      .json.brief.revision;
    await call("post", `/trips/${data.kyoto}/plan`, {
      operationId: randomUUID(),
      expectedRevision: revision,
      action: { type: "pick", slotId, placeId: card.placeId },
    });
    picked += 1;
  }
  if (picked === 0) {
    return [
      row(
        "Trip",
        "A stay's address",
        "TB-FIX-07",
        ["day 2 offers no card"],
        "",
      ),
    ];
  }

  await open(page, `/trips/${data.kyoto}`);
  const decided = page.locator('[data-qa="commitments"]');
  await decided.getByText("Add something already decided").click();
  await decided.getByLabel("What", { exact: true }).fill("Walk Test Hotel");
  await decided.getByLabel("Kind").selectOption("STAY");
  await decided.getByLabel("Date", { exact: true }).fill("2027-07-10");
  await decided.getByLabel("Ends on another day").fill("2027-07-12");
  const lookup = decided.getByRole("button", { name: "Look up address" });
  await decided.getByLabel("Address").fill("1 Walk Street");
  await lookup.click();
  const confirm = decided.getByRole("button", { name: /Confirm this address/ });
  await confirm.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const label = "Sample address, city centre";
  if ((await decided.getByText(label).count()) < 1) {
    problems.push("the address found is not shown");
  }
  if ((await confirm.count()) !== 1) {
    problems.push("the found address has no Confirm button");
  } else {
    // The lookup form fits the phone and the narrowest screen.
    for (const size of [PHONE, NARROW]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(250);
      const width = await page.evaluate(scanWidth);
      if (width.scroll > width.width + 1) {
        problems.push(
          `at ${size.width} px the page is ${width.scroll} px wide: ${width.wide.join(", ")}`,
        );
      }
    }
    await page.setViewportSize(DESKTOP);
    await confirm.focus();
    await page.keyboard.press("Enter");
    const confirmed = decided.getByText("Address confirmed: ");
    if ((await confirmed.count()) !== 1) {
      problems.push("the address was not confirmed");
    } else if (
      !(await confirmed.evaluate((el) => el === document.activeElement))
    ) {
      problems.push("focus is not on the confirmed address");
    }
  }
  await decided.getByRole("button", { name: "Add", exact: true }).click();
  // The page refreshes itself after the change; the way back appears with it.
  await page
    .getByText(/^Back to Walk Test Hotel/)
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);

  const after = await plan();
  const day2 = after.view.days[1].entries;
  const firstPlace = day2.find((entry) => entry.type === "place");
  const lastEntry = day2[day2.length - 1];
  const lastPlace = day2.filter((entry) => entry.type === "place").at(-1);
  if (firstPlace?.type !== "place" || !firstPlace.travelIn) {
    problems.push("the first place of day 2 has no leg from the stay");
  }
  if (
    lastEntry?.type !== "return" ||
    lastPlace?.type !== "place" ||
    lastEntry.start < lastPlace.start
  ) {
    problems.push("day 2 does not end with the way back, after its last place");
  }
  if ((await page.getByText(/^Back to Walk Test Hotel/).count()) < 1) {
    problems.push("the plan on the page shows no way back");
  }
  return [
    row(
      "Trip",
      "A stay is added, its address looked up and confirmed, and the plan shows the leg from it and the way back; the form fits 390 and 320 px",
      "TB-FIX-07",
      problems,
      "the found address is shown and confirmed with focus on the result; day 2 starts with a leg from the stay and a day ends with the way back",
    ),
  ];
}

/** A place is dragged onto an open slot; a fixed commitment cannot be dragged. */
async function dragMove(page: Page, call: Call, data: Data): Promise<Row[]> {
  const problems: string[] = [];
  const read = async (): Promise<PlanSnapshot> =>
    (await call("get", `/trips/${data.guided}/plan`)).json.plan;
  const plan = await read();
  const entries = plan.view.days.flatMap((day) => day.entries);
  const from = entries.findIndex((entry) => entry.type === "place");
  const to = entries.findIndex((entry) => entry.type === "open");
  const fixed = entries.findIndex((entry) => entry.type === "commitment");
  const source = entries[from];
  const target = entries[to];
  if (source?.type !== "place" || target?.type !== "open") {
    problems.push("the plan has no placed place and open slot to drag between");
  } else {
    await open(page, `/trips/${data.guided}`);
    const items = page.locator('section[aria-label^="Day "] ol > li');
    if ((await items.count()) !== entries.length) {
      problems.push("the page lists a different number of items than the plan");
    } else {
      const name = plan.chosen[source.placeId]?.name;
      await items.nth(from).dragTo(items.nth(to));
      let moved = false;
      for (let attempt = 0; attempt < 20 && !moved; attempt += 1) {
        await page.waitForTimeout(500);
        moved = (await read()).view.days.some((day) =>
          day.entries.some(
            (entry) =>
              entry.type === "place" &&
              entry.slotId === target.slotId &&
              entry.placeId === source.placeId,
          ),
        );
      }
      if (!moved)
        problems.push(`dragging ${name} onto ${target.kind} did not move it`);
      if (
        fixed >= 0 &&
        (await items.nth(fixed).getAttribute("draggable")) === "true"
      ) {
        problems.push("the fixed commitment can be dragged");
      }
    }
  }
  return [
    row(
      "Trip",
      "A place is moved by drag",
      "TB-ITN-09",
      problems,
      "dragging a place onto an open slot moves it; a fixed item is not draggable",
    ),
  ];
}

async function walk(browser: Browser, admin: Call, data: Data): Promise<Row[]> {
  const screens: Screen[] = [
    { name: "Home", path: "/home" },
    { name: "Create", path: "/trips/new" },
    { name: "Trip", path: `/trips/${data.guided}`, cards: true },
    { name: "Brief", path: `/trips/${data.quick}/brief` },
    { name: "Profile", path: "/profile" },
  ];
  const rows: Row[] = [];
  const desktop = await signedIn(browser, base, { viewport: DESKTOP });
  await desktop.page.context().addInitScript(INIT);
  const storageState = await desktop.page.context().storageState();
  const context = async (options: Parameters<Browser["newContext"]>[0]) => {
    const made = await browser.newContext({ ...options, storageState });
    await made.addInitScript(INIT);
    return made;
  };

  for (const screen of screens) {
    rows.push(...(await screenRows(desktop.page, screen, admin, data)));
  }
  rows.push(...(await keyboardActions(desktop.page, admin, data)));
  rows.push(...(await dragMove(desktop.page, admin, data)));
  rows.push(...(await checkItYourself(desktop.page, admin, data)));
  rows.push(...(await stayAddress(desktop.page, admin, data)));

  const phone = await (await context({ viewport: PHONE })).newPage();
  for (const screen of screens) {
    rows.push(...(await phoneRows(phone, screen, admin, data)));
  }

  rows.push(
    ...(await motionRows(
      await context({ viewport: DESKTOP, reducedMotion: "reduce" }),
      screens,
      true,
      admin,
      data,
    )),
    ...(await motionRows(
      await context({ viewport: DESKTOP, reducedMotion: "no-preference" }),
      screens,
      false,
      admin,
      data,
    )),
  );
  return rows;
}

async function main() {
  const only = process.env.DESIGN_BROWSERS?.split(",");
  const adminBrowser = await chromium.launch();
  const admin = (await signedIn(adminBrowser, base)).call;
  const summary: string[] = [];
  const sections: string[] = [];
  let failures = 0;
  try {
    for (const [name, type] of Object.entries(BROWSERS)) {
      if (only && !only.includes(name)) continue;
      let browser: Browser;
      try {
        // WebKit can be started through a script of one's own, for a
        // machine whose system libraries are unpacked in a private folder.
        browser = await type.launch(
          name === "WebKit" && process.env.WEBKIT_EXECUTABLE
            ? { executablePath: process.env.WEBKIT_EXECUTABLE }
            : undefined,
        );
      } catch (error) {
        const why = String(error).includes("missing dependencies")
          ? "this machine lacks the system libraries it needs (`sudo npx playwright install-deps webkit`)"
          : String(error).split("\n")[0];
        summary.push(`| ${name} | not run | ${why} |`);
        continue;
      }
      // Trips of its own for each browser: every walk picks three cards, and
      // one shared trip ran out of open slots before the third browser.
      let data: Data | null = null;
      try {
        data = await setUp(admin);
        const rows = await walk(browser, admin, data);
        const failed = rows.filter((item) => !item.ok);
        failures += failed.length;
        summary.push(
          `| ${name} ${browser.version()} | ${rows.length - failed.length} of ${rows.length} pass | ${failed.length === 0 ? "" : [...new Set(failed.map((item) => item.requirement))].sort().join(", ")} |`,
        );
        sections.push(
          [
            `## ${name}`,
            "",
            "| Screen | Check | Requirement | Result | What was found |",
            "| --- | --- | --- | --- | --- |",
            ...rows.map(
              (item) =>
                `| ${item.screen} | ${item.check} | ${item.requirement} | ${item.ok ? "pass" : "**FAIL**"} | ${item.detail.replace(/\|/g, "\\|")} |`,
            ),
            "",
          ].join("\n"),
        );
      } finally {
        await browser.close();
        if (data) {
          await admin("delete", `/trips/${data.guided}`);
          await admin("delete", `/trips/${data.quick}`);
          await admin("delete", `/trips/${data.kyoto}`);
        }
      }
    }
  } finally {
    await admin("delete", "/profile");
    await adminBrowser.close();
  }

  const document = [
    "# Design checks on the real screens",
    "",
    "Status: evidence",
    "Authority: What the design walk found. Written by `npm run quality:design`; do not edit by hand.",
    "Related: [requirements](../requirements.md) TB-DSN-01 to TB-DSN-07, TB-ITN-09",
    "",
    "Every real screen (Home, Create, a trip with cards, the brief, Profile) is opened in each browser at desktop and phone width, with motion on and asked off, signed in as the development user against the sample places.",
    "",
    "A machine cannot judge whether the screens look like a keepsake, or whether a phone is pleasant to use. Those stay the developer's.",
    "",
    "| Browser | Checks | Requirements with a failed check |",
    "| --- | --- | --- |",
    ...summary,
    "",
    ...sections,
  ].join("\n");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, document);
  console.log(summary.join("\n"));
  console.log(`\n${failures} failed checks. Written to ${out}`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
