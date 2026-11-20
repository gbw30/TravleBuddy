import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { chromium } from "@playwright/test";

import {
  isMeal,
  placeWordFor,
  SLOT_WORDS,
  type PlanEntry,
} from "@/features/itinerary/contracts";
import type { City } from "@/features/places/contracts";
import { sampleSource } from "@/features/places/sample-source";
import type { BriefView } from "@/use-cases/brief-view";
import type { PlanSnapshot } from "@/use-cases/plan-snapshot";

import {
  checkItinerary,
  checkReasons,
  type Finding,
  type KnownPlace,
  type Truth,
} from "./checks";
import { signedIn, type Call } from "../site";
import { TRAVELLERS, type Traveller } from "./travellers";

// Plans the sample travellers of PRD 18 through the running site, by
// Guided planning and by Quick plan, checks each plan, and writes the eight
// itineraries out for the developer to read (TB-SYS-15).
//
//   npm run quality:samples -- http://localhost:3100
//
// It needs a local server started with PLACE_PROVIDER_MODE=mock, AI_MODE=off
// and the development sign-in. It signs in as the development user, resets
// that user's profile, and deletes the trips it makes.

const base = process.argv[2] ?? "http://localhost:3100";
const out = process.argv[3] ?? "docs/quality/sample-travellers.md";
const WAYS = ["Guided planning", "Quick plan"] as const;
type Way = (typeof WAYS)[number];

async function main() {
  const browser = await chromium.launch();
  const { call } = await signedIn(browser, base);

  const sections: string[] = [];
  const summary: string[] = [];
  let failures = 0;
  const made: string[] = [];

  try {
    for (const traveller of TRAVELLERS) {
      await call("delete", "/profile");
      for (const said of traveller.profile) {
        await call("post", "/profile/entries", said);
      }
      const parts: string[] = [];
      for (const way of WAYS) {
        const result = await planOne(call, traveller, way, made);
        failures += result.findings.filter((item) => !item.ok).length;
        summary.push(
          `| ${traveller.name} | ${way} | ${result.places} | ${
            result.findings.every((item) => item.ok)
              ? "all pass"
              : result.findings
                  .filter((item) => !item.ok)
                  .map((item) => item.check)
                  .join("; ")
          } |`,
        );
        parts.push(result.text);
      }
      sections.push(
        [
          `## ${traveller.name}`,
          "",
          `${traveller.who} *Tests: ${traveller.tests}*`,
          "",
          ...parts,
        ].join("\n"),
      );
    }
  } finally {
    for (const id of made) await call("delete", `/trips/${id}`);
    await call("delete", "/profile");
    await browser.close();
  }

  const document = [
    "# The sample travellers",
    "",
    "Status: evidence",
    "Authority: What the checks of PRD 18 found. Written by `npm run quality:samples`; do not edit by hand.",
    "Related: [PRD 18](../prd.md#18-judging-itinerary-quality), [requirements](../requirements.md) TB-SYS-15",
    "",
    "Each traveller of PRD 18 is planned twice against the sample places: by Guided planning, where the traveller picks every slot from the cards offered, and by Quick plan, where the site builds the trip. The AI model is off.",
    "",
    "A machine checks five of PRD 18's six points on each plan, and that no day is left without a meal. The sixth point is the developer's: **read the itinerary; would you follow it?**",
    "",
    "Two limits of the sample places show in the itineraries, and are not faults of the plan:",
    "",
    "- There are six sample restaurant names, repeated from area to area. A name on several days is a different place each time.",
    "- Every sample city but Tokyo has nine sights. A long or packed trip has more slots than that, so some stay open.",
    "",
    "| Traveller | Way | Places | Checks |",
    "| --- | --- | --- | --- |",
    ...summary,
    "",
    ...sections,
    "",
  ].join("\n");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, document);
  console.log(summary.join("\n"));
  console.log(`\n${failures} failed checks. Written to ${out}`);
  if (failures > 0) process.exitCode = 1;
}

async function planOne(
  call: Call,
  traveller: Traveller,
  way: Way,
  made: string[],
): Promise<{ text: string; findings: Finding[]; places: number }> {
  const quick = way === "Quick plan";
  const started = await call("post", "/trips", {
    tickets: traveller.tickets,
    planningMode: quick ? "QUICK" : "GUIDED",
  });
  const tripId: string = started.json.trip.id;
  made.push(tripId);
  let revision: number = (await call("get", `/trips/${tripId}/brief`)).json
    .brief.revision;
  const change = async (
    method: "post" | "put" | "patch",
    path: string,
    body: object,
  ) => {
    const answer = await call(method, `/trips/${tripId}${path}`, {
      ...body,
      operationId: randomUUID(),
      expectedRevision: revision,
    });
    if (answer.status >= 300) {
      throw new Error(
        `${traveller.name}, ${way}: ${method} ${path} answered ${answer.status} ${JSON.stringify(answer.json)}`,
      );
    }
    revision = answer.json.revision ?? revision;
    return answer.json;
  };

  // Where, when and who: the same facts by either way.
  const cities: { city: City; nights: number | null }[] = [];
  for (const { name, nights } of traveller.cities) {
    const found: City[] = (
      await call("get", `/places/cities?q=${encodeURIComponent(name)}`)
    ).json.cities;
    const city = found.find((item) => item.name === name);
    if (!city) throw new Error(`No sample city called ${name}`);
    cities.push({ city, nights });
  }
  const facts = {
    cities,
    startDate: traveller.startDate,
    endDate: traveller.endDate,
    adults: traveller.adults,
    children: traveller.children,
    ...(traveller.budget
      ? {
          budgetAmount: traveller.budget.amount,
          budgetCurrency: traveller.budget.currency,
          budgetBasis: traveller.budget.basis,
        }
      : {}),
    ...(traveller.purpose ? { purpose: traveller.purpose } : {}),
  };

  const shown: string[] = [];
  if (quick) {
    await change("put", "/brief", {
      facts,
      ...(traveller.onlyStepOne ? {} : { style: traveller.answers }),
    });
  } else {
    await change("patch", "", { action: "facts", facts });
  }
  for (const commitment of traveller.commitments) {
    await change("post", "/commitments", { commitment });
  }
  // What is decided before any planning, to compare with afterwards.
  const before: PlanSnapshot = (await call("get", `/trips/${tripId}/plan`)).json
    .plan;
  const decided = before.view.days.flatMap((day) =>
    day.entries.flatMap((entry) =>
      entry.type === "commitment"
        ? [
            {
              title: entry.title,
              // A check-in is a window: it moves to the first gap after its time.
              start: entry.commitmentKind === "STAY" ? null : entry.start,
            },
          ]
        : [],
    ),
  );

  if (quick) {
    for (let step = 0; step < 40; step += 1) {
      const built = await change(
        "post",
        "/build",
        step === 0 ? { start: true } : {},
      );
      if (built.data.done) break;
    }
  } else {
    // The agent's questions about taste: answered, or skipped.
    for (let turn = 0; turn < 40; turn += 1) {
      const waiting = (await call("get", `/trips/${tripId}/conversation`)).json
        .conversation.waiting;
      if (!waiting) break;
      const topic: string = waiting.topic;
      const values =
        topic === "difference"
          ? [traveller.different ?? "ordinary"]
          : traveller.answers[topic as keyof Traveller["answers"]];
      await change("post", "/conversation", {
        turn: values
          ? { type: "answer", topic, values }
          : { type: "skip", topic },
      });
    }
    // Every slot in turn: sights and activities first, then the meals.
    const tried = new Set<string>();
    for (let pick = 0; pick < 120; pick += 1) {
      const now: PlanSnapshot = (await call("get", `/trips/${tripId}/plan`))
        .json.plan;
      const open = now.view.days.flatMap((day) =>
        day.entries.flatMap((entry) =>
          entry.type === "open" && !tried.has(entry.slotId) ? [entry] : [],
        ),
      );
      const slot = open.find((entry) => !isMeal(entry.kind)) ?? open[0];
      if (!slot) break;
      tried.add(slot.slotId);
      const offered: PlanSnapshot = (
        await call("get", `/trips/${tripId}/plan?slot=${slot.slotId}`)
      ).json.plan;
      const cards =
        offered.proposal?.slotId === slot.slotId ? offered.proposal.cards : [];
      shown.push(...cards.map((card) => card.reason));
      if (cards.length === 0) continue;
      const card =
        traveller.picks === "first"
          ? cards[0]
          : traveller.picks === "last"
            ? cards[cards.length - 1]
            : cards[Math.min(1, cards.length - 1)];
      await change("post", "/plan", {
        action: { type: "pick", slotId: slot.slotId, placeId: card.placeId },
      });
    }
  }

  const plan: PlanSnapshot = (await call("get", `/trips/${tripId}/plan`)).json
    .plan;
  const brief: BriefView = (await call("get", `/trips/${tripId}/brief`)).json
    .brief;
  const profile = (await call("get", "/profile")).json.profile;

  // What the place source knows: the only places that exist.
  const known = new Map<string, KnownPlace>();
  for (const { city } of cities) {
    const point = {
      latitude: city.latitude ?? 0,
      longitude: city.longitude ?? 0,
    };
    const places = [
      ...(await sampleSource.sights({ ...city, ...point })),
      ...(await sampleSource.foodNear({ ...city, ...point }, point)),
    ];
    for (const place of places) {
      known.set(place.name, {
        serves: place.serves,
        servesNot: place.servesNot,
      });
    }
  }

  const findings = checkItinerary({
    plan,
    expected: { ...traveller.expected, decided },
    known,
  });
  if (!quick) {
    const answer = (topic: string) =>
      brief.style.find((item) => item.topic === topic);
    const interests = answer("interests");
    const food = answer("food");
    const truth: Truth = {
      cities: cities.map(({ city }) => city.name),
      interests:
        !interests || interests.from === "none"
          ? null
          : interests.values.map(
              (value) =>
                interests.choices
                  .find((choice) => choice.value === value)
                  ?.label.toLowerCase() ?? value,
            ),
      food:
        !food || food.from === "none"
          ? null
          : food.values.filter((value) => value !== "none"),
      atmosphere:
        (["lively", "quiet"] as const).find(
          (value) => value === answer("atmosphere")?.values[0],
        ) ?? null,
      onFoot: answer("getting_around")?.values[0] === "walk",
      trips: profile.entries.flatMap(
        (entry: { source: { type: string; tripTitle?: string } }) =>
          entry.source.type === "trip" && entry.source.tripTitle
            ? [entry.source.tripTitle]
            : [],
      ),
    };
    findings.push(checkReasons(shown, truth));
  }
  // No sample traveller adds a place by hand. One in a plan was left on the
  // account by something else, and makes the run say less than it seems to.
  const own = Object.values(plan.chosen)
    .filter((card) => card.origin === "USER")
    .map((card) => card.name);
  if (own.length > 0) {
    findings.push({
      check: "The account holds no place added by hand",
      ok: false,
      detail: `${own.join(", ")}: remove it from the development account and run again`,
    });
  }

  const places = plan.view.days.flatMap((day) =>
    day.entries.filter((entry) => entry.type === "place"),
  ).length;
  return { text: render(way, plan, brief, findings), findings, places };
}

const minutes = (count: number) => `${count} min`;
function line(entry: PlanEntry, plan: PlanSnapshot): string {
  switch (entry.type) {
    case "place": {
      const flags = entry.flags.map((flag) =>
        flag.rule === "hours-unknown" ? "opening hours not known" : flag.rule,
      );
      return `${entry.start}  ${SLOT_WORDS[entry.kind]}: **${plan.chosen[entry.placeId]?.name ?? "?"}** (${minutes(entry.minutes)})${
        entry.travelIn
          ? `, ${minutes(entry.travelIn.minutes)} ${entry.travelIn.means} to get there`
          : ""
      }${flags.length > 0 ? ` [${flags.join(", ")}]` : ""}`;
    }
    case "open":
      return `${entry.start}  ${SLOT_WORDS[entry.kind]}: *open*`;
    case "commitment":
      return `${entry.start ?? "--:--"}  Already decided: ${entry.title}`;
    case "transfer":
      return `${entry.start}  Travel from ${entry.from} to ${entry.to}, assumed (${minutes(entry.minutes)})${
        entry.arriveLocal
          ? `, arriving about ${entry.arriveLocal} ${entry.to} time`
          : ""
      }`;
    case "allowance":
      return `${entry.start}  Allowed ${minutes(entry.minutes)} ${entry.way} ${placeWordFor(entry.mode) ? `the ${placeWordFor(entry.mode)}` : "the journey"} (${entry.mode?.toLowerCase() ?? "mode not known"})`;
    case "breakfast-at-stay":
      return `${entry.start}  Breakfast where you stay (${minutes(entry.minutes)})`;
    case "return":
      return `${entry.start}  Back to ${entry.stay} (${minutes(entry.travel.minutes)} ${entry.travel.means})`;
    case "wander":
      return `${entry.start}  Time to wander${entry.area ? ` around ${entry.area}` : ""} (${minutes(entry.minutes)})`;
  }
}

function render(
  way: Way,
  plan: PlanSnapshot,
  brief: BriefView,
  findings: Finding[],
): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  const report = plan.build;
  return [
    `### ${way}`,
    "",
    "| Check | Result | What was found |",
    "| --- | --- | --- |",
    ...findings.map(
      (item) =>
        `| ${item.check} | ${item.ok ? "pass" : "**FAIL**"} | ${item.detail} |`,
    ),
    "",
    brief.review[3].lines.slice(0, 5).join(" "),
    "",
    ...plan.view.days.flatMap((item) => [
      `**Day ${item.day}, ${day(item.date)}, ${item.city}**`,
      "",
      ...item.entries.map((entry) => `- ${line(entry, plan)}`),
      "",
    ]),
    ...(report
      ? [
          "**The agent's report**",
          "",
          `- Built: ${report.built.join(" ")}`,
          `- Assumed: ${report.assumed.map((item) => item.line).join(" ") || "nothing."}`,
          `- Could not fit: ${report.unfitted.map((item) => item.line).join(" ") || "nothing was left over."}`,
          `- Unsure: ${report.unsure.map((item) => item.line).join(" ") || "nowhere."}`,
          "",
        ]
      : []),
  ].join("\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
