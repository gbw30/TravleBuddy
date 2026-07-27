import {
  Check,
  CalendarDays,
  History,
  MapPin,
  MessageSquareText,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import type { ItineraryDto } from "@/features/itinerary/types";
import type {
  PlaceActionLogEntry,
  PlanningTimelineEvent,
  PlanningTopic,
  RecommendationDto,
  RecommendationPreferenceSnapshot,
  SelectedPlanningPlace,
} from "@/features/recommendations/types";
import {
  addUserPlanningPlaceFormAction,
  deselectRecommendationFormAction,
  generateRecommendationsFormAction,
  recordPlanningMessageFormAction,
  refreshRecommendationsFormAction,
  rejectRecommendationFormAction,
  selectRecommendationFormAction,
} from "@/features/recommendations/service";
import { hasTopicRecommendationReadiness } from "@/features/recommendations/extraction";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { AlreadyDecidedPlaceForm } from "./already-decided-place-form";
import { TimedAlert } from "@/components/ui/timed-alert";
import { AdaptiveItineraryPanel } from "./adaptive-itinerary-panel";
import type {
  PlanningItineraryVersionSummary,
  PlanningJobSummary,
} from "@/features/planning/types";

const topicOptions = [
  {
    value: "HOTEL_BASE",
    label: "Hotel/base",
    prompt: "What should your home base feel close to, avoid, or make easier?",
  },
  {
    value: "ACTIVITIES",
    label: "Activities",
    prompt: "What would make the trip feel worth the flight?",
  },
  {
    value: "FOOD_NIGHTLIFE",
    label: "Food/nightlife",
    prompt: "What kind of meals or evenings should shape the plan?",
  },
  {
    value: "BUDGET_PACE",
    label: "Budget/pace",
    prompt:
      "What balance of comfort, cost, and daily energy should guide this?",
  },
] as const satisfies readonly {
  value: PlanningTopic;
  label: string;
  prompt: string;
}[];

const rejectReasonOptions = [
  ["NOT_INTERESTED", "Not interested"],
  ["TOO_EXPENSIVE", "Too expensive"],
  ["TOO_FAR", "Too far"],
  ["WRONG_VIBE", "Wrong vibe"],
  ["ALREADY_BEEN_THERE", "Already been there"],
  ["OTHER", "Other"],
] as const;

function chipList(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "None yet";
}

function topicLabel(topic: PlanningTopic) {
  return (
    topicOptions.find((option) => option.value === topic)?.label ?? "Hotel/base"
  );
}

function currentRecommendations(
  recommendations: readonly RecommendationDto[],
  topic: PlanningTopic,
  destinationId: string | null,
) {
  return recommendations
    .filter(
      (recommendation) =>
        recommendation.topic === topic &&
        recommendation.status !== "REJECTED" &&
        (!destinationId ||
          recommendation.destinationId === destinationId ||
          recommendation.destinationId === null),
    )
    .slice(0, 5);
}

function money(recommendation: RecommendationDto) {
  if (
    !recommendation.estimatedCostAmount ||
    !recommendation.estimatedCostCurrency
  ) {
    return "Cost not estimated";
  }

  return `${recommendation.estimatedCostCurrency} ${recommendation.estimatedCostAmount}`;
}

function itineraryMoney(value: {
  estimatedCostAmount: number | null;
  estimatedCostCurrency: string | null;
  costIsComplete?: boolean;
  excludedCostCurrencies?: string[];
}) {
  if (!value.estimatedCostAmount || !value.estimatedCostCurrency) {
    return "Cost not estimated";
  }

  const estimate = `${value.estimatedCostCurrency} ${value.estimatedCostAmount}`;

  return value.costIsComplete === false
    ? `${estimate} (partial; excludes ${(value.excludedCostCurrencies ?? []).join(", ")})`
    : estimate;
}

function actionLabel(action: PlaceActionLogEntry["action"]) {
  if (action === "SELECT") return "Accepted";
  if (action === "REJECT") return "Rejected";

  return "Removed";
}

function reasonLabel(reason: PlaceActionLogEntry["reason"]) {
  return reason ? reason.toLocaleLowerCase().replaceAll("_", " ") : null;
}

function locationLabel(place: {
  city?: string | null;
  country?: string | null;
}) {
  if (place.city && place.country) {
    return `${place.city}, ${place.country}`;
  }

  return place.city ?? place.country ?? "Location not set";
}

function groupByLocation<
  T extends { city?: string | null; country?: string | null },
>(places: readonly T[]) {
  const groups = new Map<string, { label: string; places: T[] }>();

  places.forEach((place) => {
    const label = locationLabel(place);
    const existing = groups.get(label);

    if (existing) {
      existing.places.push(place);
      return;
    }

    groups.set(label, {
      label,
      places: [place],
    });
  });

  return Array.from(groups.values());
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date);

  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function tripDayOptions(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) {
    return [];
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end < start
  ) {
    return [];
  }

  const options: number[] = [];
  let cursor = start;

  while (cursor <= end) {
    options.push(options.length + 1);
    cursor = addUtcDays(cursor, 1);
  }

  return options;
}

export function PlanningWorkspace({
  trip,
  preference,
  selectedPlaces,
  recommendations,
  activeTopic,
  message,
  error,
  timelineEvents,
  placeActionLog,
  itineraryPreview,
  planningRevision = 0,
  activeJobs = [],
  itineraryVersions = [],
  activeDestinationId,
  activeDayNumber,
}: {
  trip: {
    id: string;
    title: string;
    startDate?: string | null;
    endDate?: string | null;
    budgetCurrency: string | null;
    destinations: {
      id: string;
      city: string;
      country: string;
      sortOrder?: number;
    }[];
  };
  preference: RecommendationPreferenceSnapshot;
  selectedPlaces: SelectedPlanningPlace[];
  recommendations: RecommendationDto[];
  timelineEvents: PlanningTimelineEvent[];
  placeActionLog: PlaceActionLogEntry[];
  itineraryPreview: ItineraryDto;
  planningRevision?: number;
  activeJobs?: PlanningJobSummary[];
  itineraryVersions?: PlanningItineraryVersionSummary[];
  activeTopic: PlanningTopic;
  activeDestinationId?: string | null;
  activeDayNumber?: number | null;
  message?: string;
  error?: string;
}) {
  const tripDateDayOptions = tripDayOptions(trip.startDate, trip.endDate);
  const dayOptions =
    tripDateDayOptions.length > 0
      ? tripDateDayOptions
      : itineraryPreview.days.length > 0
        ? itineraryPreview.days.map((day) => day.dayNumber)
        : [1];
  const selectedDayNumber =
    activeDayNumber && dayOptions.includes(activeDayNumber)
      ? activeDayNumber
      : (dayOptions[0] ?? 1);
  const selectedDay = itineraryPreview.days.find(
    (day) => day.dayNumber === selectedDayNumber,
  );
  const selectedDayCityWindows = selectedDay?.cityWindows ?? [];
  const ticketedDestinationId =
    selectedDayCityWindows.find((window) => window.destinationId)
      ?.destinationId ?? null;
  const activeDestination =
    trip.destinations.find(
      (destination) => destination.id === activeDestinationId,
    ) ??
    trip.destinations.find(
      (destination) => destination.id === ticketedDestinationId,
    ) ??
    trip.destinations[0] ??
    null;
  const cityWindowLabels = selectedDayCityWindows.map((window) =>
    window.city && window.country
      ? `${window.city}, ${window.country}`
      : window.city,
  );
  const contextHref = ({
    topic = activeTopic,
    destinationId = activeDestination?.id ?? null,
    dayNumber = selectedDayNumber,
  }: {
    topic?: PlanningTopic;
    destinationId?: string | null;
    dayNumber?: number;
  }) => {
    const params = new URLSearchParams();

    params.set("topic", topic);
    if (destinationId) params.set("destinationId", destinationId);
    params.set("day", String(dayNumber));

    return `/trips/${trip.id}/planning?${params.toString()}`;
  };
  const activeTopicOption =
    topicOptions.find((option) => option.value === activeTopic) ??
    topicOptions[0];
  const readiness = hasTopicRecommendationReadiness({
    topic: activeTopic,
    preference,
    selectedPlaceCount: selectedPlaces.length,
  });
  const visibleRecommendations = currentRecommendations(
    recommendations,
    activeTopic,
    activeDestination?.id ?? null,
  );
  const selectedPlaceGroups = groupByLocation(selectedPlaces);

  return (
    <main className="flex-1 bg-zinc-50">
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-500">Planning loop</p>
            <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
              {trip.title}
            </h1>
          </div>
          <a
            href={`/trips/${trip.id}`}
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-white"
          >
            Trip overview
          </a>
          <a
            href={`/trips/${trip.id}/itinerary`}
            className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 transition-colors hover:bg-white"
          >
            Full itinerary
          </a>
        </div>

        {message ? (
          <TimedAlert className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Planning context saved.
          </TimedAlert>
        ) : null}
        {error === "needs-more-context" ? (
          <TimedAlert
            role="alert"
            className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            Add one more detail for {topicLabel(activeTopic)} before generating
            recommendations.
          </TimedAlert>
        ) : null}
        {error === "invalid-destination" ? (
          <TimedAlert
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            That city is not saved for the selected country on this trip. Choose
            a saved trip city; the matching country will be filled
            automatically.
          </TimedAlert>
        ) : null}
        {error === "invalid-cost" ? (
          <TimedAlert
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            Estimated cost is too large for this planning phase. Enter a cost
            below 1,000,000 so budget conflicts can be calculated safely.
          </TimedAlert>
        ) : null}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="grid gap-5">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Priority</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topicOptions.map((topic) => (
                  <a
                    key={topic.value}
                    href={contextHref({ topic: topic.value })}
                    className={
                      topic.value === activeTopic
                        ? "inline-flex h-9 items-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white"
                        : "inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    }
                  >
                    {topic.label}
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">
                Planning context
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                    City
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {trip.destinations.map((destination) => (
                      <a
                        key={destination.id}
                        href={contextHref({ destinationId: destination.id })}
                        className={
                          destination.id === activeDestination?.id
                            ? "inline-flex h-9 items-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white"
                            : "inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                        }
                      >
                        {destination.city}
                      </a>
                    ))}
                  </div>
                  {cityWindowLabels.length > 0 ? (
                    <p className="mt-2 text-xs leading-5 text-zinc-500">
                      Assigned for Day {selectedDayNumber}:{" "}
                      {Array.from(new Set(cityWindowLabels)).join(" / ")}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                    Day
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dayOptions.map((dayNumber) => (
                      <a
                        key={dayNumber}
                        href={contextHref({ dayNumber })}
                        className={
                          dayNumber === selectedDayNumber
                            ? "inline-flex h-9 items-center rounded-md bg-zinc-950 px-3 text-sm font-medium text-white"
                            : "inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                        }
                      >
                        Day {dayNumber}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <MessageSquareText
                  aria-hidden="true"
                  className="size-5 text-zinc-500"
                />
                <h2 className="text-base font-semibold text-zinc-950">
                  {activeTopicOption.prompt}
                </h2>
              </div>
              <form
                action={recordPlanningMessageFormAction}
                className="mt-4 grid gap-3"
              >
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <input
                  type="hidden"
                  name="destinationId"
                  value={activeDestination?.id ?? ""}
                />
                <input
                  type="hidden"
                  name="planningDayNumber"
                  value={selectedDayNumber}
                />
                <textarea
                  name="message"
                  required
                  rows={4}
                  className="min-h-28 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-500"
                  placeholder="I want a quiet hotel near museums, walkable cafes, and local markets."
                />
                <PendingSubmitButton
                  pendingLabel="Saving..."
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  <MessageSquareText aria-hidden="true" className="size-4" />
                  Save reply
                </PendingSubmitButton>
              </form>
              <form action={generateRecommendationsFormAction} className="mt-3">
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <input
                  type="hidden"
                  name="destinationId"
                  value={activeDestination?.id ?? ""}
                />
                <input
                  type="hidden"
                  name="planningDayNumber"
                  value={selectedDayNumber}
                />
                <PendingSubmitButton
                  pendingLabel="Generating..."
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <Sparkles aria-hidden="true" className="size-4" />
                  Generate 5
                </PendingSubmitButton>
              </form>
              <p className="mt-3 text-sm text-zinc-500">
                {readiness.isReady
                  ? `${topicLabel(activeTopic)} is ready for recommendations.`
                  : `${readiness.missingSignalCount} more detail needed for ${topicLabel(activeTopic)}.`}
              </p>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <MapPin aria-hidden="true" className="size-5 text-zinc-500" />
                <h2 className="text-base font-semibold text-zinc-950">
                  Already-decided place
                </h2>
              </div>
              <AlreadyDecidedPlaceForm
                key={`${activeDestination?.id ?? "destination"}-${selectedDayNumber}`}
                tripId={trip.id}
                activeTopic={activeTopic}
                budgetCurrency={trip.budgetCurrency}
                destinations={trip.destinations}
                activeDestinationId={activeDestination?.id ?? null}
                planningDayNumber={selectedDayNumber}
                action={addUserPlanningPlaceFormAction}
              />
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                {topicLabel(activeTopic)} recommendations
              </h2>
              {visibleRecommendations.length > 0 ? (
                <div className="mt-4 grid gap-3">
                  {visibleRecommendations.map((recommendation) => (
                    <article
                      key={recommendation.id}
                      className="rounded-md border border-zinc-200 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                            {recommendation.category}
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-zinc-950">
                            {recommendation.name}
                          </h3>
                        </div>
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
                          {recommendation.score ?? 0}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-zinc-600">
                        {recommendation.explanation}
                      </p>
                      <p className="mt-2 text-sm text-zinc-500">
                        {money(recommendation)}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {recommendation.status === "SELECTED" ? (
                          <span className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-50 px-3 text-sm font-medium text-emerald-700">
                            <Check aria-hidden="true" className="size-4" />
                            Picked
                          </span>
                        ) : (
                          <form action={selectRecommendationFormAction}>
                            <input
                              type="hidden"
                              name="tripId"
                              value={trip.id}
                            />
                            <input
                              type="hidden"
                              name="topic"
                              value={activeTopic}
                            />
                            <input
                              type="hidden"
                              name="destinationId"
                              value={activeDestination?.id ?? ""}
                            />
                            <input
                              type="hidden"
                              name="planningDayNumber"
                              value={selectedDayNumber}
                            />
                            <input
                              type="hidden"
                              name="suggestionId"
                              value={recommendation.id}
                            />
                            <PendingSubmitButton
                              pendingLabel="Picking..."
                              className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
                            >
                              <Check aria-hidden="true" className="size-4" />
                              Pick
                            </PendingSubmitButton>
                          </form>
                        )}
                      </div>
                      <form
                        action={rejectRecommendationFormAction}
                        className="mt-4 grid gap-2 border-t border-zinc-100 pt-4 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
                      >
                        <input type="hidden" name="tripId" value={trip.id} />
                        <input type="hidden" name="topic" value={activeTopic} />
                        <input
                          type="hidden"
                          name="destinationId"
                          value={activeDestination?.id ?? ""}
                        />
                        <input
                          type="hidden"
                          name="planningDayNumber"
                          value={selectedDayNumber}
                        />
                        <input
                          type="hidden"
                          name="suggestionId"
                          value={recommendation.id}
                        />
                        <select
                          name="reason"
                          required
                          defaultValue="NOT_INTERESTED"
                          className="h-9 rounded-md border border-zinc-300 px-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                          aria-label={`Reject reason for ${recommendation.name}`}
                        >
                          {rejectReasonOptions.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <input
                          name="note"
                          className="h-9 rounded-md border border-zinc-300 px-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                          placeholder="Optional note"
                          aria-label={`Optional rejection note for ${recommendation.name}`}
                        />
                        <PendingSubmitButton
                          pendingLabel="Rejecting..."
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                        >
                          <ThumbsDown aria-hidden="true" className="size-4" />
                          Reject
                        </PendingSubmitButton>
                      </form>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  No recommendations for this priority yet.
                </p>
              )}
              <form
                action={refreshRecommendationsFormAction}
                className="mt-4 grid gap-3"
              >
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <input
                  type="hidden"
                  name="destinationId"
                  value={activeDestination?.id ?? ""}
                />
                <input
                  type="hidden"
                  name="planningDayNumber"
                  value={selectedDayNumber}
                />
                <textarea
                  name="note"
                  rows={2}
                  required
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                  placeholder="Refresh with quieter hotels closer to museums."
                />
                <PendingSubmitButton
                  pendingLabel="Refreshing..."
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Refresh
                </PendingSubmitButton>
              </form>
            </div>
          </section>

          <aside className="grid gap-5 self-start">
            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                Preference chips
              </h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <div>
                  <dt className="font-medium text-zinc-500">Comfort target</dt>
                  <dd className="mt-1 text-zinc-950">
                    {preference.budgetLevel ?? "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Pace</dt>
                  <dd className="mt-1 text-zinc-950">
                    {preference.pace ?? "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Interests</dt>
                  <dd className="mt-1 text-zinc-950">
                    {chipList(preference.interests)}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-zinc-500">Custom</dt>
                  <dd className="mt-1 text-zinc-950">
                    {chipList(preference.customPreferences)}
                  </dd>
                </div>
              </dl>
            </section>

            <AdaptiveItineraryPanel
              tripId={trip.id}
              initialRevision={planningRevision}
              days={itineraryPreview.days}
              initialJobs={activeJobs}
              itineraryVersions={itineraryVersions}
            />

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                Live plan preview
              </h2>
              {selectedPlaces.length > 0 ? (
                <>
                  <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-sm font-semibold text-emerald-800">
                      Ready for itinerary handoff
                    </p>
                    <p className="mt-1 text-sm leading-6 text-emerald-700">
                      The itinerary draft rebuilds from these selected places.
                      More picks will make the first itinerary fuller.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-4">
                    {selectedPlaceGroups.map((group) => (
                      <section key={group.label}>
                        <h3 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                          {group.label}
                        </h3>
                        <ul className="mt-2 grid gap-2">
                          {group.places.map((place) => (
                            <li
                              key={place.id}
                              className="rounded-md border border-zinc-200 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-medium text-zinc-950">
                                    {place.name}
                                  </p>
                                  <p className="mt-1 text-xs uppercase tracking-normal text-zinc-500">
                                    {place.category}
                                  </p>
                                </div>
                                <form action={deselectRecommendationFormAction}>
                                  <input
                                    type="hidden"
                                    name="tripId"
                                    value={trip.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="topic"
                                    value={activeTopic}
                                  />
                                  <input
                                    type="hidden"
                                    name="destinationId"
                                    value={activeDestination?.id ?? ""}
                                  />
                                  <input
                                    type="hidden"
                                    name="planningDayNumber"
                                    value={selectedDayNumber}
                                  />
                                  <input
                                    type="hidden"
                                    name="suggestionId"
                                    value={place.id}
                                  />
                                  <PendingSubmitButton
                                    pendingLabel="Removing..."
                                    className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                  >
                                    <X
                                      aria-hidden="true"
                                      className="size-3.5"
                                    />
                                    Remove
                                  </PendingSubmitButton>
                                </form>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Picked recommendations and anchors will appear here. Select at
                  least one place to prepare the itinerary handoff.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays
                    aria-hidden="true"
                    className="size-5 text-zinc-500"
                  />
                  <h2 className="text-base font-semibold text-zinc-950">
                    Itinerary draft
                  </h2>
                </div>
                <a
                  href={`/trips/${trip.id}/itinerary`}
                  className="text-sm font-medium text-zinc-700 hover:text-zinc-950"
                >
                  Expand
                </a>
              </div>
              {itineraryPreview.days.length > 0 ? (
                <>
                  <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-sm font-semibold text-zinc-950">
                      Trip estimate
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {itineraryPreview.totals.itemCount} items -{" "}
                      {itineraryMoney(itineraryPreview.totals)}
                    </p>
                  </div>
                  <ol className="mt-4 grid gap-3">
                    {itineraryPreview.days.map((day) => (
                      <li
                        key={day.id}
                        className="rounded-md border border-zinc-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-950">
                              Day {day.dayNumber}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {day.date ?? "Date not set"}
                            </p>
                          </div>
                          <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                            {day.itemCount} items
                          </span>
                        </div>
                        {day.items.length > 0 ? (
                          <div className="mt-3 grid gap-3">
                            {groupByLocation(day.items).map((group) => (
                              <section key={group.label}>
                                <h4 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                                  {group.label}
                                </h4>
                                <ul className="mt-1 grid gap-1">
                                  {group.places.map((item) => (
                                    <li
                                      key={item.id}
                                      className="text-sm leading-6 text-zinc-700"
                                    >
                                      {item.title}
                                      {item.category ? (
                                        <span className="ml-2 text-xs uppercase tracking-normal text-zinc-500">
                                          {item.category}
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm leading-6 text-zinc-500">
                            No selected places assigned to this day yet.
                          </p>
                        )}
                        <p className="mt-3 text-xs font-medium text-zinc-500">
                          {itineraryMoney(day)}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {(itineraryPreview.unscheduledItems ?? []).length > 0 ? (
                    <section
                      aria-labelledby="planning-unscheduled-title"
                      className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-4"
                    >
                      <h3
                        id="planning-unscheduled-title"
                        className="text-sm font-semibold text-zinc-950"
                      >
                        Selected but unscheduled
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">
                        These selections are preserved for review and are not
                        placed into a live schedule.
                      </p>
                      <ul className="mt-3 grid gap-2">
                        {(itineraryPreview.unscheduledItems ?? []).map(
                          (item) => (
                            <li key={item.id} className="text-sm text-zinc-700">
                              <span className="font-medium text-zinc-950">
                                {item.title}
                              </span>
                              <span className="block text-xs leading-5 text-zinc-600">
                                {item.reasonMessage}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Select places from recommendations or add already-decided
                  anchors to generate the day-by-day draft.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                Planning timeline
              </h2>
              {timelineEvents.length > 0 ? (
                <ol className="mt-4 grid gap-3">
                  {timelineEvents.map((event) => (
                    <li
                      key={event.id}
                      className="border-l-2 border-zinc-200 pl-3 text-sm"
                    >
                      <p className="font-medium text-zinc-950">{event.title}</p>
                      {event.message ? (
                        <p className="mt-1 leading-6 text-zinc-600">
                          {event.message}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Planning events will appear as you select, reject, remove, and
                  refresh recommendations.
                </p>
              )}
            </section>

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
                  <span className="inline-flex items-center gap-2">
                    <History aria-hidden="true" className="size-4" />
                    Show place log
                  </span>
                  <span className="text-xs text-zinc-500">
                    {placeActionLog.length}
                  </span>
                </summary>
                {placeActionLog.length > 0 ? (
                  <ol className="mt-4 grid gap-3">
                    {placeActionLog.map((entry) => {
                      const reason = reasonLabel(entry.reason);

                      return (
                        <li
                          key={entry.id}
                          className="rounded-md border border-zinc-200 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                                {actionLabel(entry.action)}
                              </p>
                              <p className="mt-1 text-sm font-medium text-zinc-950">
                                {entry.place.name}
                              </p>
                              <p className="mt-1 text-xs uppercase tracking-normal text-zinc-500">
                                {entry.place.category}
                              </p>
                            </div>
                            {entry.place.status === "SELECTED" ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                                In plan
                              </span>
                            ) : (
                              <form action={selectRecommendationFormAction}>
                                <input
                                  type="hidden"
                                  name="tripId"
                                  value={trip.id}
                                />
                                <input
                                  type="hidden"
                                  name="topic"
                                  value={activeTopic}
                                />
                                <input
                                  type="hidden"
                                  name="destinationId"
                                  value={activeDestination?.id ?? ""}
                                />
                                <input
                                  type="hidden"
                                  name="planningDayNumber"
                                  value={selectedDayNumber}
                                />
                                <input
                                  type="hidden"
                                  name="suggestionId"
                                  value={entry.place.id}
                                />
                                <PendingSubmitButton
                                  pendingLabel="Picking..."
                                  className="inline-flex h-8 items-center rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                >
                                  Pick again
                                </PendingSubmitButton>
                              </form>
                            )}
                          </div>
                          {reason || entry.note ? (
                            <p className="mt-2 text-sm leading-6 text-zinc-600">
                              {reason ? `Reason: ${reason}. ` : ""}
                              {entry.note ?? ""}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-zinc-600">
                    Accepted, rejected, and removed places will appear here for
                    quick recovery after a misclick.
                  </p>
                )}
              </details>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
