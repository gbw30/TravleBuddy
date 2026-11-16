# Provider Check and Clickable Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide the place-data provider with verified figures (roadmap Milestone 0), then build a clickable prototype of the main screens in the keepsake look with sample data, for the product owner to approve (Milestone 1).

**Architecture:** The prototype lives under the public route `/prototype`, with no database, no API routes and no sign-in. Planning behaviour is a pure state module over one sample trip, so it can be unit-tested; screens are thin React components over it. Design tokens and the keepsake components are built in shared locations so the real build reuses them.

**Tech Stack:** Next.js 16.2 (App Router), React 19.2, Tailwind CSS 4, TypeScript, Vitest 4, Playwright with `@axe-core/playwright`. No new dependencies.

**Spec:** `docs/product-vision.md`, `docs/prd.md`, `docs/requirements.md`, `docs/roadmap.md` (Milestones 0 and 1), `docs/architecture/adr-008-modular-services-in-one-deployment.md`, `docs/design/planning-screen-mockup.html`.

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code. This Next.js version differs from older ones (`AGENTS.md`).
- Work directly on the `qa` branch. Do not create a branch or a worktree. Do not push.
- Do not create or change any database, Neon, Vercel or GitHub resource. The prototype reads no environment variables except `VERCEL_ENV`.
- Add no npm dependencies.
- Everything for the prototype is under `/prototype`. Existing screens must look and behave exactly as before; tokens added to `globals.css` are additive.
- `/prototype` returns 404 when `VERCEL_ENV === "production"`.
- Unit tests use Vitest without a DOM. Render components with `renderToStaticMarkup` from `react-dom/server` and assert on the HTML string.
- Playwright's test id attribute is `data-qa`. Prototype browser tests carry no `@critical` tag, so QA runs do not select them.
- Every screen works at 390px wide with no horizontal page scroll (TB-DSN-04).
- Every action works with a keyboard (TB-DSN-05). Text meets WCAG AA contrast (TB-DSN-06). Motion stops under `prefers-reduced-motion` (TB-DSN-03).
- Every prototype page shows a small banner: `Prototype · sample data`.
- Discard reasons, exact copy and order: `Too expensive`, `Too far`, `Not my taste`, `Already been`, `Too touristy`, `Too busy or loud`, `Wrong time of day`, `Something else`.
- Run `npm run lint`, `npm run typecheck` and `npm test` before each commit. All three must exit zero.

## Review Focus

1. **A long place name or reason on a 390px screen** should wrap inside the postcard, not clip or widen the page. Pinned in Task 8.
2. **Asking for others until no places are left** should show a plain message, not an empty frame or a crash. Pinned in Tasks 4 and 8.
3. **A browser without the View Transitions API** should still let the traveller pick a card; only the animation is lost. Pinned in Task 8.
4. **Reloading the page mid-planning** should keep the picks made so far. Pinned in Task 8.
5. **Opening the closer look with a keyboard** should move focus into it, and Escape should close it and return focus to the card. Pinned in Task 8.

## File Structure

| File                                               | Responsibility                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `docs/architecture/adr-009-place-data-provider.md` | Provider decision with sources and figures                                            |
| `src/app/globals.css`                              | Keepsake colour and type tokens (added)                                               |
| `src/lib/contrast.ts`                              | WCAG contrast ratio of two hex colours                                                |
| `src/components/keepsake/types.ts`                 | `CardPlace`, the shape a postcard needs                                               |
| `src/components/keepsake/*.tsx`                    | Postcard, place art, ticket stub, day stamp, itinerary row, agent message, navigation |
| `src/features/prototype/types.ts`                  | Sample trip and planning state types                                                  |
| `src/features/prototype/sample-trip.ts`            | The one sample trip                                                                   |
| `src/features/prototype/sample-home.ts`            | Sample trips for Home and sample profile entries                                      |
| `src/features/prototype/planning-state.ts`         | Pure planning actions over the sample trip                                            |
| `src/features/prototype/brief.ts`                  | Pure Quick plan brief rules                                                           |
| `src/app/prototype/**`                             | Prototype routes: Home, new trip, trip workspace, Quick plan, profile                 |
| `e2e/prototype.spec.ts`                            | Browser walkthrough, accessibility and Review Focus tests                             |
| `docs/design/prototype-review.md`                  | Review guide, open decisions, tokens and components, approval record                  |

---

### Task 1: Place-data provider decision (Milestone 0)

**Files:**

- Create: `docs/architecture/adr-009-place-data-provider.md`
- Modify: `docs/architecture/README.md` (add ADR-009 to the index)
- Modify: `docs/prd.md` section 17 (replace the "Prices are not yet verified" bullet with the verified result and a link to ADR-009)

**Interfaces:**

- Produces: the decision `google` or `openstreetmap` for the first version. Later tasks do not depend on it; the prototype shows cards both with and without photos.

- [ ] **Step 1: Read the official sources**

Use only pages on the provider's own domain. Third-party price tables are not evidence. Start from these and follow links if a page has moved:

- Google Maps Platform price list: `https://developers.google.com/maps/billing-and-pricing/pricing`
- Google Places API policies and Maps Platform service terms (what may be stored, and attribution for photos)
- OpenStreetMap Nominatim usage policy: `https://operations.osmfoundation.org/policies/nominatim/`
- Overpass API usage guidance on `overpass-api.de` or the OSM wiki
- The usage policy of the public OSRM demo server, and the free plan limits of openrouteservice
- Anthropic's price list for `claude-haiku-5-5`

Record for each: URL, date read, and the exact figure or rule quoted.

- [ ] **Step 2: Cost the usage model**

Use this model (an assumption of this plan; state it in the ADR):

| Quantity                      | Value                                               |
| ----------------------------- | --------------------------------------------------- |
| Planned trips per month       | 30                                                  |
| Slots per trip                | 30 (5 days × 6 slots)                               |
| Place searches per trip       | 30 (one per slot, pool of up to 20)                 |
| Place detail lookups per trip | 135 (3 cards × 30 slots × 1.5 for "show me others") |
| Photos per trip               | 135                                                 |
| Travel-time lookups per trip  | 165                                                 |
| AI turns per trip             | 80, at 2,000 input and 300 output tokens each       |

Compute monthly cost for Google, for OpenStreetMap services, and for the AI model, after free allowances.

- [ ] **Step 3: Apply the decision rule and write the ADR**

Rule: choose Google if Google plus AI is at most 20 US dollars a month under the model **and** its terms allow keeping enough data to redisplay a saved itinerary (or refetching it fits the cost). Otherwise choose OpenStreetMap, with Google kept as the switch-on option ([PRD 17](../../prd.md#17-ai-model-place-data-and-running-cost)).

ADR sections, in the format of `adr-008`: Context; Sources (table of URL, date read, figure); Usage model; Cost per provider; Terms on saved data and attribution; Decision; Consequences (what the product loses on the chosen provider); Owner actions.

Owner actions is a checklist for the product owner, not for the implementer: set a spending cap on the Google Cloud billing account and on the Anthropic account.

- [ ] **Step 4: Verify**

Run: `npx prettier --check docs/architecture/adr-009-place-data-provider.md docs/architecture/README.md docs/prd.md`
Expected: `All matched files use Prettier code style!`

Check by reading: every figure in the cost table has a row in Sources on an official domain; if a figure could not be confirmed, the ADR says so and the rule treats that provider as not fitting the cap.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture/adr-009-place-data-provider.md docs/architecture/README.md docs/prd.md
git commit -m "docs: record place-data provider decision (ADR-009)"
```

---

### Task 2: Keepsake tokens and contrast check

**Files:**

- Create: `src/lib/contrast.ts`, `src/lib/contrast.test.ts`, `src/app/keepsake-tokens.test.ts`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

**Interfaces:**

- Produces: `contrastRatio(a: string, b: string): number` for `#rrggbb` colours.
- Produces: Tailwind tokens `paper`, `ink`, `card`, `row`, `row-edge`, `terracotta`, `terracotta-deep`, `stamp`, `stamp-paper` (usable as `bg-paper`, `text-ink`, `border-row-edge`), the `font-serif` family, and the CSS class `keepsake-paper` for the textured page background.

- [ ] **Step 1: Write the failing tests**

`src/lib/contrast.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("is 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });
  it("is 1 for identical colours and symmetric", () => {
    expect(contrastRatio("#b4542f", "#b4542f")).toBeCloseTo(1, 5);
    expect(contrastRatio("#2b2622", "#d9c3a0")).toBeCloseTo(
      contrastRatio("#d9c3a0", "#2b2622"),
      5,
    );
  });
});
```

`src/app/keepsake-tokens.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const token = (name: string) => {
  const match = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`missing token ${name}`);
  return match[1];
};

// [text colour, background colour]
const textPairs = [
  ["ink", "paper"],
  ["ink", "row"],
  ["ink", "card"],
  ["ink", "stamp-paper"],
  ["terracotta", "card"],
  ["terracotta", "stamp-paper"],
  ["terracotta-deep", "paper"],
  ["stamp", "paper"],
] as const;

describe("keepsake tokens", () => {
  it.each(textPairs)("%s on %s meets WCAG AA", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/lib/contrast.test.ts src/app/keepsake-tokens.test.ts`
Expected: FAIL, `contrast` module not found.

- [ ] **Step 3: Implement `contrastRatio` in `src/lib/contrast.ts`**

Use the WCAG 2 relative-luminance formula.

- [ ] **Step 4: Add the tokens to `src/app/globals.css` inside the existing `@theme inline` block**

Starting values. If a pair fails the test, darken the text colour until it passes; do not relax the test.

| Token                     | Value     |
| ------------------------- | --------- |
| `--color-paper`           | `#d9c3a0` |
| `--color-ink`             | `#2b2622` |
| `--color-card`            | `#ffffff` |
| `--color-row`             | `#fffaf0` |
| `--color-row-edge`        | `#cdbb98` |
| `--color-terracotta`      | `#b4542f` |
| `--color-terracotta-deep` | `#7a3319` |
| `--color-stamp`           | `#8a2420` |
| `--color-stamp-paper`     | `#fdf8ec` |

Add `--font-serif` pointing at the Lora font variable with `Georgia, serif` as fallback. Load `Lora` with `next/font/google` in `src/app/layout.tsx` as `--font-lora`, beside the existing Geist fonts, without changing the body font of existing screens.

Add the class:

```css
.keepsake-paper {
  background: var(--color-paper)
    repeating-linear-gradient(
      45deg,
      rgb(120 85 45 / 0.07) 0 2px,
      transparent 2px 9px
    );
  color: var(--color-ink);
  font-family: var(--font-serif);
}
```

- [ ] **Step 5: Run the tests and the full check**

Run: `npx vitest run src/lib/contrast.test.ts src/app/keepsake-tokens.test.ts && npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contrast.ts src/lib/contrast.test.ts src/app/keepsake-tokens.test.ts src/app/globals.css src/app/layout.tsx
git commit -m "feat(design): add keepsake tokens with contrast check"
```

---

### Task 3: Keepsake components

**Files:**

- Create: `src/components/keepsake/types.ts`, `place-art.tsx`, `postcard.tsx`, `ticket-stub.tsx`, `day-stamp.tsx`, `itinerary-row.tsx`, `agent-message.tsx`, `keepsake.test.tsx` (all in `src/components/keepsake/`)

**Interfaces:**

- Consumes: tokens and `keepsake-paper` from Task 2.
- Produces:

```ts
// types.ts
export type ArtStyle = "sunset" | "sea" | "brick";
export type CardPlace = {
  id: string;
  name: string;
  essentials: string; // "Okonomiyaki · 9 min walk"
  summary: string;
  reason: string; // why it suits the traveller and the slot
  address: string;
  hours: string | null; // null = unknown
  priceLevel: 1 | 2 | 3 | 4 | null; // null = unknown
  rating: number | null; // null = unknown
  photo: string | null; // URL under /prototype/photos, or null
  photoCredit: string | null;
  art: ArtStyle; // illustration used when there is no photo
};

// place-art.tsx: photo when showPhoto && place.photo, else a CSS poster illustration
export function PlaceArt(props: {
  place: CardPlace;
  showPhoto: boolean;
  className?: string;
}): JSX.Element;

// postcard.tsx ("use client"): flips on click, Enter or Space
export function Postcard(props: {
  place: CardPlace;
  showPhoto: boolean;
  onPick?: () => void;
  onSave?: () => void;
  onCloserLook?: () => void;
}): JSX.Element;
export function priceLabel(level: CardPlace["priceLevel"]): string; // "¥¥" style marks, or "Price unknown"
export function ratingLabel(rating: number | null): string; // "4.5 rating" or "No rating yet"

// ticket-stub.tsx: a booked, locked item
export function TicketStub(props: {
  time: string;
  title: string;
  note?: string;
}): JSX.Element;

// day-stamp.tsx
export function DayStamp(props: { city: string; day: number }): JSX.Element;

// itinerary-row.tsx
export function ItineraryRow(props: {
  time: string;
  title: string;
  variant: "item" | "open" | "wander";
  active?: boolean; // open slot being chosen now
  flag?: string | null; // broken-rule note
  children?: React.ReactNode; // row actions
}): JSX.Element;

// agent-message.tsx
export function AgentMessage(props: { children: React.ReactNode }): JSX.Element;
```

Markup contract the tests and later tasks rely on:

- `Postcard`: the flip control is a `<button>` with `aria-pressed` (`"false"` front, `"true"` back) and `aria-label` `` `${place.name}. Flip card` ``. The root has `data-qa="postcard"`. Under the card are buttons labelled `Pick`, `Save for later` and `Closer look`, each rendered only when its handler is given. The back shows `summary` and `reason`. Flip uses a CSS 3D transform that is disabled under `prefers-reduced-motion`.
- `PlaceArt`: with a photo, an `<img>` whose `alt` is the place name. Without, a `<div data-art={place.art} role="img" aria-label={place.name}>`.
- `TicketStub`: contains the text `BOOKED`, has `data-qa="ticket-stub"`.
- `DayStamp`: visible text `` `${CITY} · DAY ${day}` `` in capitals, `role="img"`, `aria-label` `` `${city}, day ${day}` ``.
- `ItineraryRow`: `data-qa="itinerary-row"`, `data-variant`; when `variant="open"` and `active`, contains `choosing now`; a non-null `flag` is rendered as text, not colour alone.

- [ ] **Step 1: Write the failing test**

`src/components/keepsake/keepsake.test.tsx`, using `renderToStaticMarkup`:

```tsx
const place: CardPlace = {
  id: "sometaro",
  name: "Sometaro",
  essentials: "Okonomiyaki · 9 min walk",
  summary: "Cook-it-yourself okonomiyaki in an old wooden house.",
  reason: "You like slow lunches, and it is nine minutes from Senso-ji.",
  address: "2-2-2 Nishiasakusa, Taito",
  hours: null,
  priceLevel: null,
  rating: null,
  photo: null,
  photoCredit: null,
  art: "sea",
};

it("postcard front shows the place and is not flipped", () => {
  const html = renderToStaticMarkup(
    <Postcard place={place} showPhoto onPick={() => {}} />,
  );
  expect(html).toContain("Sometaro");
  expect(html).toContain('aria-pressed="false"');
  expect(html).toContain('aria-label="Sometaro. Flip card"');
  expect(html).toContain(">Pick<");
  expect(html).not.toContain(">Save for later<");
});
it("uses the illustration when there is no photo", () => {
  const html = renderToStaticMarkup(<PlaceArt place={place} showPhoto />);
  expect(html).toContain('data-art="sea"');
  expect(html).not.toContain("<img");
});
it("uses the photo only when photos are on", () => {
  const withPhoto = { ...place, photo: "/prototype/photos/sometaro.jpg" };
  expect(
    renderToStaticMarkup(<PlaceArt place={withPhoto} showPhoto />),
  ).toContain('alt="Sometaro"');
  expect(
    renderToStaticMarkup(<PlaceArt place={withPhoto} showPhoto={false} />),
  ).not.toContain("<img");
});
it("states unknown price and rating", () => {
  expect(priceLabel(null)).toBe("Price unknown");
  expect(priceLabel(2)).toBe("¥¥");
  expect(ratingLabel(null)).toBe("No rating yet");
  expect(ratingLabel(4.5)).toBe("4.5 rating");
});
it("ticket stub is marked booked", () => {
  expect(
    renderToStaticMarkup(<TicketStub time="09:00" title="Hotel check-out" />),
  ).toContain("BOOKED");
});
it("day stamp has visible and spoken text", () => {
  const html = renderToStaticMarkup(<DayStamp city="Tokyo" day={2} />);
  expect(html).toContain("TOKYO · DAY 2");
  expect(html).toContain('aria-label="Tokyo, day 2"');
});
it("open active row says it is being chosen, and flags are text", () => {
  expect(
    renderToStaticMarkup(
      <ItineraryRow time="12:30" title="Lunch" variant="open" active />,
    ),
  ).toContain("choosing now");
  expect(
    renderToStaticMarkup(
      <ItineraryRow
        time="20:00"
        title="Senso-ji"
        variant="item"
        flag="Closed at this time"
      />,
    ),
  ).toContain("Closed at this time");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/keepsake/keepsake.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the components**

Follow `docs/design/planning-screen-mockup.html` for the look: white-bordered postcard with a dotted stamp in the corner, ticket stub with a dashed tear line, double-bordered rotated day stamp, cream rows with a `row-edge` border, dashed terracotta open row, italic agent message. Use the Task 2 tokens through Tailwind classes. The three `ArtStyle` illustrations are the CSS gradients in the mockup (`art1` = sunset, `art2` = sea, `art3` = brick).

- [ ] **Step 4: Run the tests and the full check**

Run: `npx vitest run src/components/keepsake/keepsake.test.tsx && npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/keepsake
git commit -m "feat(design): add keepsake postcard, ticket stub, stamp and row components"
```

---

### Task 4: Sample trip and planning state

**Files:**

- Create: `src/features/prototype/types.ts`, `sample-trip.ts`, `planning-state.ts`, `planning-state.test.ts`

**Interfaces:**

- Consumes: `CardPlace` from Task 3.
- Produces:

```ts
// types.ts
export type SamplePlace = CardPlace & { visitMinutes: number };
export type Slot = {
  id: string; // "d2-lunch"
  day: number; // 1-based
  start: string; // "12:30"
  label: string; // "Lunch"
  travelIn: { means: string; minutes: number } | null; // leg shown above this slot
};
export type Entry =
  | {
      type: "item";
      slotId: string;
      placeId: string;
      locked: boolean;
      flag: string | null;
    }
  | { type: "wander"; slotId: string; minutes: number; area: string | null }
  | { type: "open"; slotId: string };
export type Commitment = {
  id: string;
  kind: "transport" | "stay" | "reservation" | "must-see" | "other";
  title: string;
  date: string;
  time: string | null;
};
export type SampleTrip = {
  title: string;
  days: { day: number; city: string; date: string }[];
  slots: Slot[]; // in time order across the trip
  fillOrder: string[]; // slot ids in the order the agent proposes (PRD 7.5)
  places: Record<string, SamplePlace>;
  proposals: Record<string, string[][]>; // slot id -> successive sets of place ids
  initial: Entry[]; // one per slot, same order as slots
  commitments: Commitment[];
  moveFlags: Record<string, string>; // `${placeId}@${slotId}` -> broken-rule note
  agentLines: Record<string, string>; // slot id -> the agent's proposal sentence
};
export type PlanningState = {
  entries: Entry[];
  shelf: string[]; // place ids
  discarded: string[]; // place ids
  activeSlotId: string | null;
  proposalSet: Record<string, number>; // slot id -> index into proposals[slot]
  past: Omit<PlanningState, "past">[]; // undo stack, newest last
};

// planning-state.ts: every function is pure and returns a new state
export function initialState(trip: SampleTrip): PlanningState;
export function currentProposal(
  trip: SampleTrip,
  state: PlanningState,
): SamplePlace[]; // 0 to 3 places
export function pickCard(
  trip: SampleTrip,
  state: PlanningState,
  placeId: string,
): PlanningState;
export function saveForLater(
  state: PlanningState,
  placeId: string,
): PlanningState;
export function showOthers(
  trip: SampleTrip,
  state: PlanningState,
): PlanningState;
export function setActiveSlot(
  state: PlanningState,
  slotId: string,
): PlanningState;
export function moveItem(
  trip: SampleTrip,
  state: PlanningState,
  fromSlotId: string,
  toSlotId: string,
): PlanningState;
export function removeItem(state: PlanningState, slotId: string): PlanningState;
export function placeFromShelf(
  trip: SampleTrip,
  state: PlanningState,
  placeId: string,
  slotId: string,
): PlanningState;
export function buildRest(
  trip: SampleTrip,
  state: PlanningState,
): PlanningState;
export function undo(state: PlanningState): PlanningState;

// sample-trip.ts
export const sampleTrip: SampleTrip;
```

Behaviour the signatures do not settle:

- `initialState`: `activeSlotId` is the first id in `fillOrder` whose entry is `open`.
- `currentProposal`: the set at `proposalSet[active]` (default 0), minus places that are discarded, shelved or already scheduled. Empty when there is no active slot or the sets are used up.
- `pickCard`: fills the active slot with an unlocked item, then moves `activeSlotId` to the next `open` slot in `fillOrder`, or `null`.
- `showOthers`: adds the current proposal's places to `discarded` and advances `proposalSet` for the active slot by one.
- `moveItem`: swaps the two entries' contents. Returns the same state object if either entry is a locked item. After the swap, each moved item's `flag` is `moveFlags[`${placeId}@${newSlotId}`] ?? null`.
- `removeItem`: turns an unlocked item into `open`. Returns the same state object for a locked item.
- `placeFromShelf`: target must be `open`; removes the place from the shelf; applies `moveFlags` as above.
- `buildRest`: fills every `open` slot with the first place of its first unused proposal set that is not discarded, shelved or scheduled. A slot with nothing left stays open.
- `undo`: restores the newest snapshot in `past`. Returns the same state object when `past` is empty.
- Every function that changes anything pushes the previous state onto `past`.

`sampleTrip` content (the implementer writes it within these limits): a 3-day Tokyo trip for a solo vegetarian traveller who likes slow days. It contains one locked transport commitment and one locked stay on day 1, one locked timed must-see on day 2, one `wander` entry with an area, and at least five `open` slots. Each open slot has at least two proposal sets of three places, except one slot whose second set has two places. At least six places have `photo: null`. One place has `hours`, `priceLevel` and `rating` all `null`. One place name is at least 45 characters long. `moveFlags` has at least one entry. `agentLines` sentences name the day and time, for example `For lunch on Day 2 at 12:30, I'd suggest one of these.` Every `reason` names something about the traveller and something about the slot (TB-RSN-02).

- [ ] **Step 1: Write the failing tests**

`src/features/prototype/planning-state.test.ts`, against a small inline fixture trip `t` with slots `a`, `b`, `c` (`a` holds a locked item `hotel`; `b` and `c` open; `fillOrder: ["b", "c"]`; `proposals: { b: [["p1","p2","p3"],["p4","p5"]], c: [["p6","p7","p8"]] }`; `moveFlags: { "p1@c": "Closed at this time" }`):

```ts
it("starts on the first open slot in fill order with three cards", () => {
  const s = initialState(t);
  expect(s.activeSlotId).toBe("b");
  expect(currentProposal(t, s).map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
});
it("picking fills the slot and moves to the next open slot", () => {
  const s = pickCard(t, initialState(t), "p2");
  expect(s.entries[1]).toEqual({
    type: "item",
    slotId: "b",
    placeId: "p2",
    locked: false,
    flag: null,
  });
  expect(s.activeSlotId).toBe("c");
});
it("showing others discards the set and can return fewer than three, then none", () => {
  const s1 = showOthers(t, initialState(t));
  expect(s1.discarded).toEqual(["p1", "p2", "p3"]);
  expect(currentProposal(t, s1).map((p) => p.id)).toEqual(["p4", "p5"]);
  expect(currentProposal(t, showOthers(t, s1))).toEqual([]);
});
it("saved places leave the proposal and join the shelf", () => {
  const s = saveForLater(initialState(t), "p1");
  expect(s.shelf).toEqual(["p1"]);
  expect(currentProposal(t, s).map((p) => p.id)).toEqual(["p2", "p3"]);
});
it("moving flags a broken rule and keeps the move", () => {
  const s = moveItem(t, pickCard(t, initialState(t), "p1"), "b", "c");
  expect(s.entries[2]).toMatchObject({
    type: "item",
    placeId: "p1",
    flag: "Closed at this time",
  });
  expect(s.entries[1]).toEqual({ type: "open", slotId: "b" });
});
it("refuses to move or remove a locked item", () => {
  const s = initialState(t);
  expect(moveItem(t, s, "a", "b")).toBe(s);
  expect(moveItem(t, s, "b", "a")).toBe(s);
  expect(removeItem(s, "a")).toBe(s);
});
it("places from the shelf into an open slot", () => {
  const s = placeFromShelf(t, saveForLater(initialState(t), "p1"), "p1", "c");
  expect(s.shelf).toEqual([]);
  expect(s.entries[2]).toMatchObject({
    placeId: "p1",
    flag: "Closed at this time",
  });
});
it("builds the rest with the top place per open slot", () => {
  const s = buildRest(t, initialState(t));
  expect(
    s.entries.map((e) => (e.type === "item" ? e.placeId : e.type)),
  ).toEqual(["hotel", "p1", "p6"]);
});
it("undo restores the previous state and is a no-op with no history", () => {
  const s0 = initialState(t);
  expect(undo(s0)).toBe(s0);
  expect(undo(pickCard(t, s0, "p2")).entries).toEqual(s0.entries);
});
it("the sample trip meets its content limits", () => {
  const open = sampleTrip.initial.filter((e) => e.type === "open");
  expect(open.length).toBeGreaterThanOrEqual(5);
  expect(
    Object.values(sampleTrip.places).some((p) => p.name.length >= 45),
  ).toBe(true);
  expect(
    Object.values(sampleTrip.places).filter((p) => p.photo === null).length,
  ).toBeGreaterThanOrEqual(6);
  for (const e of open)
    expect(sampleTrip.proposals[e.slotId].length).toBeGreaterThanOrEqual(2);
  for (const ids of Object.values(sampleTrip.proposals).flat(2))
    expect(sampleTrip.places[ids]).toBeDefined();
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npx vitest run src/features/prototype/planning-state.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `types.ts`, `planning-state.ts` and `sample-trip.ts`**

- [ ] **Step 4: Add sample photos**

Put photos for three of the sample places in `public/prototype/photos/`. Use only images whose licence allows reuse (public domain, CC0 or CC BY), for example from Wikimedia Commons. Record file, source URL, author and licence in `public/prototype/photos/CREDITS.md`, and set each place's `photoCredit`. If no suitable image can be fetched, leave `photo: null` for that place and say so in the task report; the tests do not require photos.

- [ ] **Step 5: Run the tests and the full check**

Run: `npx vitest run src/features/prototype/planning-state.test.ts && npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/features/prototype public/prototype
git commit -m "feat(prototype): add sample trip and planning state"
```

---

### Task 5: Prototype shell, Home, starting a trip and profile

**Files:**

- Create: `src/app/prototype/layout.tsx`, `src/app/prototype/page.tsx`, `src/app/prototype/new/page.tsx`, `src/app/prototype/profile/page.tsx`
- Create: `src/components/keepsake/keepsake-nav.tsx`, `src/components/keepsake/start-trip.tsx`
- Create: `src/features/prototype/sample-home.ts`
- Test: `src/app/prototype/prototype-pages.test.tsx`

**Interfaces:**

- Consumes: Task 2 tokens, Task 3 components.
- Produces:

```ts
// sample-home.ts
export type HomeTrip = {
  id: string;
  title: string;
  dates: string;
  state: "planning" | "upcoming" | "past";
  progress: string | null;
  art: ArtStyle;
};
export const homeTrips: HomeTrip[]; // at least one of each state
export type ProfileTopic =
  | "pace"
  | "day shape"
  | "interests"
  | "atmosphere"
  | "food"
  | "budget"
  | "getting around"
  | "stay";
export type ProfileEntry = {
  topic: ProfileTopic;
  value: string;
  kind: "hard limit" | "taste";
  sureness: "I think" | "usually" | "always";
  source: string;
};
export const profileEntries: ProfileEntry[]; // at least one hard limit; sources include "you told me" and a named trip; one "pace" entry whose value is "packed", "balanced" or "relaxed"
// keepsake-nav.tsx: Home, Create, Profile links to /prototype, /prototype/new, /prototype/profile
export function KeepsakeNav(): JSX.Element;
// default exports of the pages, by these names; all are synchronous functions
// layout.tsx: PrototypeLayout(props: { children: React.ReactNode })
// page.tsx: PrototypeHome()   new/page.tsx: PrototypeNewTrip()   profile/page.tsx: PrototypeProfile()
```

Screen content (PRD 3, 4, 5, 12.5):

- **Layout:** calls `notFound()` when `process.env.VERCEL_ENV === "production"`. Wraps children in `keepsake-paper`, shows the banner `Prototype · sample data` and `KeepsakeNav`. Navigation is a top bar from the `md` breakpoint and a fixed bottom bar below it. No Discover link.
- **Home (`/prototype`):** trip cards with title, dates, illustration and the state as text; the planning trip shows its progress and links to `/prototype/trip`; a `New trip` link to `/prototype/new`; past trips carry a `DayStamp`-style stamp.
- **New trip (`/prototype/new`):** step 1 asks `Do you already have tickets?` with `Yes` and `Not yet`; `Yes` reveals one ticket form (type, from, to, departure, arrival, reference) whose saved result is shown as a `TicketStub`. Step 2 asks `How do you want to plan?` with `Guided planning` linking to `/prototype/trip` and `Quick plan` linking to `/prototype/quick-plan`, each with a one-line description. Leave visible room for two more choices.
- **Profile (`/prototype/profile`):** entries grouped by topic, each showing value, kind, sureness and source, with `Edit` and `Delete` buttons that update local state, and `Add your own` and `Reset everything` controls.

- [ ] **Step 1: Write the failing test**

`src/app/prototype/prototype-pages.test.tsx`:

```tsx
import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllEnvs());

it("is not served in production", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect(() => PrototypeLayout({ children: null })).toThrow();
});
it("layout shows the prototype banner and navigation without Discover", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  const html = renderToStaticMarkup(PrototypeLayout({ children: null }));
  expect(html).toContain("Prototype · sample data");
  expect(html).toContain('href="/prototype/new"');
  expect(html).not.toContain("Discover");
});
it("home lists trips in all three states and links to a new trip", () => {
  const html = renderToStaticMarkup(<PrototypeHome />);
  for (const state of ["Planning", "Upcoming", "Past"])
    expect(html).toContain(state);
  expect(html).toContain('href="/prototype/trip"');
  expect(html).toContain("New trip");
});
it("profile shows kind, sureness and source for each entry", () => {
  const html = renderToStaticMarkup(<PrototypeProfile />);
  expect(html).toContain("Hard limit");
  expect(html).toContain("you told me");
  expect(html).toContain(
    profileEntries.find((e) => e.source !== "you told me")!.source,
  );
});
it("starting a trip asks about tickets, then how to plan", () => {
  const html = renderToStaticMarkup(<PrototypeNewTrip />);
  expect(html).toContain("Do you already have tickets?");
  expect(html).toContain("Guided planning");
  expect(html).toContain("Quick plan");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/app/prototype/prototype-pages.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement the layout, pages, navigation and sample data**

- [ ] **Step 4: Run the tests and the full check**

Run: `npx vitest run src/app/prototype/prototype-pages.test.tsx && npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/prototype src/components/keepsake src/features/prototype
git commit -m "feat(prototype): add shell, home, new trip and profile screens"
```

---

### Task 6: Planning workspace

**Files:**

- Create: `src/app/prototype/trip/page.tsx`
- Create in `src/components/keepsake/`: `prototype-workspace.tsx`, `live-itinerary.tsx`, `closer-look.tsx`, `discard-reasons.tsx`, `shelf.tsx`, `commitments-panel.tsx`, `move-menu.tsx`
- Test: `src/components/keepsake/prototype-workspace.test.tsx`

**Interfaces:**

- Consumes: Task 3 components; Task 4 `sampleTrip` and all `planning-state` functions.
- Produces:

```ts
export type WorkspaceOptions = {
  photos: boolean; // ?photos=off turns photos off; default on
  closerLook: "enlarged" | "overlay"; // ?look=overlay; default enlarged
  phoneItinerary: "sheet" | "tab"; // ?phone=tab; default sheet
  built: boolean; // ?built=1: start from buildRest and show the build report
};
export function PrototypeWorkspace(props: {
  trip: SampleTrip;
  options: WorkspaceOptions;
}): JSX.Element; // "use client"
export const DISCARD_REASONS: readonly string[]; // exact copy and order from Global Constraints
```

`page.tsx` reads the search params, builds `WorkspaceOptions`, and renders `PrototypeWorkspace` with `sampleTrip`.

Behaviour (PRD 6 to 10, 15.2):

- **Layout:** from the `lg` breakpoint, conversation and cards on the left and the live itinerary on the right, both visible. Below it, the itinerary is a pull-up sheet (`sheet`) or a second tab (`tab`), with a count of changes since it was last opened.
- **Conversation:** `AgentMessage` with `trip.agentLines[activeSlotId]`, then the cards from `currentProposal`. Fewer than three: add `I only found {n} that fit.` None: `I have no more places for this slot.` No active slot: `Every slot is filled. Move anything you like.`
- **Cards:** `Postcard` with `Pick`, `Save for later` and `Closer look`. `Show me others` opens `DiscardReasons` (the eight reasons as toggle buttons plus a text box, all optional), then calls `showOthers`.
- **Pick animation:** wrap the state update in `document.startViewTransition(() => flushSync(update))` when that function exists; otherwise update directly. The picked card and its target row share one `view-transition-name`. Disable view-transition animation under `prefers-reduced-motion`.
- **Closer look:** a native `<dialog>` opened with `showModal()`. `enlarged` styles it as the card grown to the centre; `overlay` as a plain centred panel. Shows more of the photo or illustration, address, hours or `Hours unknown`, `priceLabel`, `ratingLabel`, the reason, and the photo credit when there is one.
- **Live itinerary:** `data-qa="live-itinerary"`. One section per day with a `DayStamp`; `TicketStub` for locked items; `ItineraryRow` otherwise; each slot's `travelIn` as a small line above it; wander entries with their area. Clicking an open row calls `setActiveSlot`. Unlocked items have `Move to…` (a `MoveMenu` listing every other unlocked slot, operable by keyboard) and `Remove`, and can also be dragged onto another unlocked row with native drag and drop. Locked items have neither control.
- **Shelf:** `data-qa="shelf"`, lists saved places, each with `Place in…` listing open slots.
- **Fixed commitments:** lists `trip.commitments` as ticket stubs with an `Add` form that appends to local state.
- **Toolbar:** `Undo` (disabled when `past` is empty), `Build the rest for me` (`buildRest`), and `Reset prototype`.
- **Build report:** when `options.built`, show a panel with the headings `What I built`, `What I assumed`, `What I could not fit` and `Where I was unsure` with sample text (PRD 11.4).
- **Persistence:** keep `PlanningState` in `sessionStorage` under `tb-prototype-state` and restore it after mount. `Reset prototype` clears it.

- [ ] **Step 1: Write the failing test**

`src/components/keepsake/prototype-workspace.test.tsx`:

```tsx
const options: WorkspaceOptions = {
  photos: true,
  closerLook: "enlarged",
  phoneItinerary: "sheet",
  built: false,
};

it("opens on the first proposal with three postcards and the itinerary", () => {
  const html = renderToStaticMarkup(
    <PrototypeWorkspace trip={sampleTrip} options={options} />,
  );
  const first = initialState(sampleTrip).activeSlotId!;
  expect(html).toContain(sampleTrip.agentLines[first]);
  expect(html.match(/data-qa="postcard"/g)).toHaveLength(3);
  expect(html).toContain('data-qa="live-itinerary"');
  expect(html).toContain('data-qa="ticket-stub"');
  expect(html).toContain("choosing now");
});
it("shows the build report when opened from Quick plan", () => {
  const html = renderToStaticMarkup(
    <PrototypeWorkspace
      trip={sampleTrip}
      options={{ ...options, built: true }}
    />,
  );
  for (const h of [
    "What I built",
    "What I assumed",
    "What I could not fit",
    "Where I was unsure",
  ])
    expect(html).toContain(h);
});
it("uses the fixed discard reasons", () => {
  expect(DISCARD_REASONS).toEqual([
    "Too expensive",
    "Too far",
    "Not my taste",
    "Already been",
    "Too touristy",
    "Too busy or loud",
    "Wrong time of day",
    "Something else",
  ]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/components/keepsake/prototype-workspace.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the workspace and its parts**

- [ ] **Step 4: Run the tests and the full check**

Run: `npx vitest run src/components/keepsake/prototype-workspace.test.tsx && npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Look at it**

Run `npm run dev`, open `http://127.0.0.1:3000/prototype/trip` at a wide and a 390px viewport, and compare with `docs/design/planning-screen-mockup.html`. Fix anything that does not match the mockup's look.

- [ ] **Step 6: Commit**

```bash
git add src/app/prototype/trip src/components/keepsake
git commit -m "feat(prototype): add planning workspace with cards, live itinerary and shelf"
```

---

### Task 7: Quick plan brief

**Files:**

- Create: `src/features/prototype/brief.ts`, `src/features/prototype/brief.test.ts`
- Create: `src/components/keepsake/trip-brief.tsx`, `src/app/prototype/quick-plan/page.tsx`

**Interfaces:**

- Consumes: Task 5 `profileEntries`; Task 6 route `/prototype/trip?built=1`.
- Produces:

```ts
export type Brief = {
  cities: { name: string; nights: number }[];
  startDate: string | null; // ISO date
  endDate: string | null;
  travellers: number;
  children: number;
  purpose: string | null;
  budget: number | null;
  currency: string;
  pace: "packed" | "balanced" | "relaxed" | null;
  interests: string[];
  food: string[];
  gettingAround: string | null;
  stay: string | null;
  anythingElse: string;
};
export const BRIEF_STEPS: readonly [
  "Where and when",
  "Already decided",
  "This trip",
  "Your style",
  "Review",
];
export function emptyBrief(): Brief;
export function validateBrief(
  brief: Brief,
): Partial<Record<keyof Brief, string>>;
export function canBuild(brief: Brief): boolean;
export function briefSummary(brief: Brief): string[]; // plain sentences for the review step
export function prefillFromProfile(
  brief: Brief,
  entries: ProfileEntry[],
): { brief: Brief; sources: Partial<Record<keyof Brief, string>> };
```

Rules:

- `canBuild`: at least one city with a name and at least one night, a start date, `travellers >= 1`, and no validation errors.
- `validateBrief` messages, exact copy: end before start → `endDate: "The end date is before the start date."`; `travellers < 1` → `travellers: "At least one traveller is needed."`; a city with fewer than one night → `cities: "Each city needs at least one night."`
- `briefSummary`: one sentence per answered part, for example `3 nights in Tokyo.` and `1 traveller.`; an unanswered optional part yields `Pace: I'll use your profile or a sensible default.` style sentences so the review shows what will be assumed.
- `prefillFromProfile`: fills `pace`, `food`, `gettingAround` and `stay` from entries whose `topic` is `pace`, `food`, `getting around` or `stay`, only where the brief's value is empty, and returns each filled field's `source`.

`TripBrief` (client): five steps with a progress marker naming the step (`Step 2 of 5: Already decided`); `Back` and `Next`; only step 1 blocks `Next` on errors, shown beside the field; choices are chips, a pace slider and pickers; prefilled answers show their source, such as `from your Kyoto trip`; step 2 lists the sample commitments; step 5 shows `briefSummary`, an `Edit` link per part, the `Anything else?` box, and `Build my trip`. `Talk it through instead` links to `/prototype/trip`. Building shows the days appearing one at a time (`Day 1 built`, about 600 ms apart, instant under reduced motion), then routes to `/prototype/trip?built=1`.

- [ ] **Step 1: Write the failing test**

`src/features/prototype/brief.test.ts`:

```ts
const step1 = {
  ...emptyBrief(),
  cities: [{ name: "Tokyo", nights: 3 }],
  startDate: "2027-05-10",
  travellers: 1,
};

it("needs only the first step to build", () => {
  expect(canBuild(emptyBrief())).toBe(false);
  expect(canBuild(step1)).toBe(true);
});
it("explains an end date before the start date", () => {
  const errors = validateBrief({ ...step1, endDate: "2027-05-01" });
  expect(errors.endDate).toBe("The end date is before the start date.");
  expect(canBuild({ ...step1, endDate: "2027-05-01" })).toBe(false);
});
it("rejects zero travellers and zero nights", () => {
  expect(validateBrief({ ...step1, travellers: 0 }).travellers).toBe(
    "At least one traveller is needed.",
  );
  expect(
    validateBrief({ ...step1, cities: [{ name: "Tokyo", nights: 0 }] }).cities,
  ).toBe("Each city needs at least one night.");
});
it("summarises in plain sentences and says what will be assumed", () => {
  const lines = briefSummary(step1);
  expect(lines).toContain("3 nights in Tokyo.");
  expect(lines.some((l) => l.startsWith("Pace:"))).toBe(true);
});
it("prefills empty answers from the profile and names the source", () => {
  const entries = [
    {
      topic: "pace",
      value: "relaxed",
      kind: "taste",
      sureness: "usually",
      source: "from your Kyoto trip",
    },
  ] as ProfileEntry[];
  const { brief, sources } = prefillFromProfile(step1, entries);
  expect(brief.pace).toBe("relaxed");
  expect(sources.pace).toBe("from your Kyoto trip");
  expect(
    prefillFromProfile({ ...step1, pace: "packed" }, entries).brief.pace,
  ).toBe("packed");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/features/prototype/brief.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `brief.ts`, then `trip-brief.tsx` and the page**

- [ ] **Step 4: Run the tests and the full check**

Run: `npx vitest run src/features/prototype/brief.test.ts && npm run lint && npm run typecheck && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/prototype/brief.ts src/features/prototype/brief.test.ts src/components/keepsake/trip-brief.tsx src/app/prototype/quick-plan
git commit -m "feat(prototype): add Quick plan brief and build report"
```

---

### Task 8: Browser walkthrough, accessibility and review guide

**Files:**

- Create: `e2e/prototype.spec.ts`, `docs/design/prototype-review.md`
- Modify: `docs/README.md` (link the review guide under Main indexes)

**Interfaces:**

- Consumes: every route and `data-qa` hook from Tasks 3 to 7.

- [ ] **Step 1: Write the browser tests**

`e2e/prototype.spec.ts`. No `storageState`, no `@critical` tag. Tests, each named as below:

1. `walks from Home to a picked card`: `/prototype` → `New trip` → `Not yet` → `Guided planning`; focus the first postcard's flip button and press Enter; expect `aria-pressed="true"` and its reason visible; click `Pick`; expect the place name inside `[data-qa="live-itinerary"]`.
2. `asks for others with a reason`: note the three names; `Show me others` → `Too far` → confirm; expect none of the three names among the postcards.
3. `says so when a slot runs out of places`: repeat `Show me others` on the active slot until no postcards remain; expect `I have no more places for this slot.`
4. `moves an item by keyboard, flags it, and undoes`: pick a card, open `Move to…` with the keyboard, choose a slot for which `sampleTrip.moveFlags` has a note; expect the note's text visible; click `Undo`; expect it gone.
5. `booked items cannot be moved or removed`: inside the first `[data-qa="ticket-stub"]` row, expect no `Move to…` and no `Remove` button.
6. `closer look traps focus and closes on Escape`: activate `Closer look` with the keyboard; expect focus inside the `dialog`; press Escape; expect the dialog closed and focus back on the `Closer look` button. Run for `?look=enlarged` and `?look=overlay`.
7. `keeps picks after a reload`: pick a card, reload, expect the place still inside the live itinerary.
8. `picking works without view transitions`: `page.addInitScript(() => { delete (Document.prototype as { startViewTransition?: unknown }).startViewTransition; })`, then pick and expect the place in the itinerary.
9. `picking works with reduced motion`: `page.emulateMedia({ reducedMotion: "reduce" })`, then as test 8's assertion.
10. `Quick plan builds from step 1 alone`: `/prototype/quick-plan`; fill city, nights, start date and travellers; `Next` to the review; `Build my trip`; expect the URL to contain `built=1` and the heading `What I assumed`.
11. `no page scrolls sideways and long names wrap`: for each of `/prototype`, `/prototype/new`, `/prototype/trip`, `/prototype/trip?photos=off`, `/prototype/quick-plan`, `/prototype/profile`, expect `document.documentElement.scrollWidth <= document.documentElement.clientWidth`. On `/prototype/trip`, use `Show me others` or `setActiveSlot` navigation to reach the 45-character place and expect its postcard's `scrollWidth <= clientWidth`.
12. `has no serious accessibility violations`: for the same routes, `new AxeBuilder({ page }).analyze()` and expect no violation with impact `serious` or `critical`.

- [ ] **Step 2: Run them**

Run: `npx playwright test e2e/prototype.spec.ts --project=chromium --project=mobile-chrome`
Expected: all pass on both projects. Fix the screens, not the tests, where they fail. If the local dev server cannot start for an environmental reason, fix the environment and re-run; report it if it cannot be fixed.

- [ ] **Step 3: Write the review guide**

`docs/design/prototype-review.md`, with the header block used by other docs (`Status: operational`):

- How to open the prototype locally and on the QA preview.
- A walkthrough of each screen and what to judge on it.
- The three open decisions and how to compare them: closer look (`?look=enlarged` or `?look=overlay`), the itinerary on a phone (`?phone=sheet` or `?phone=tab`), and the navigation layout. Also `?photos=off` for the look without photos.
- The tokens table from Task 2 and the list of keepsake components with one line each.
- An approval record with empty fields: date, decision on each of the three, changes requested. This is the exit evidence for TB-DSN-08 and TB-DSN-09.

- [ ] **Step 4: Full check**

Run: `npm run lint && npm run typecheck && npm test && npx prettier --check docs/design/prototype-review.md docs/README.md`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/prototype.spec.ts docs/design/prototype-review.md docs/README.md
git commit -m "test(prototype): add browser walkthrough and review guide"
```

- [ ] **Step 6: Hand to the product owner**

Report the local URL and the review guide. Milestone 1 exits only when the product owner fills in the approval record; the implementer does not fill it in.
