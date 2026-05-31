import {
  Check,
  MapPin,
  MessageSquareText,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type {
  PlanningTopic,
  RecommendationDto,
  RecommendationPreferenceSnapshot,
  SelectedPlanningPlace,
} from "@/features/recommendations/types";
import {
  addUserPlanningPlaceFormAction,
  generateRecommendationsFormAction,
  recordPlanningMessageFormAction,
  refreshRecommendationsFormAction,
  selectRecommendationFormAction,
} from "@/features/recommendations/service";
import { hasTopicRecommendationReadiness } from "@/features/recommendations/extraction";

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
    prompt: "What balance of comfort, cost, and daily energy should guide this?",
  },
] as const satisfies readonly {
  value: PlanningTopic;
  label: string;
  prompt: string;
}[];

const categoryOptions = [
  "HOTEL",
  "ATTRACTION",
  "RESTAURANT",
  "ACTIVITY",
  "LANDMARK",
  "ENTERTAINMENT",
] as const;

function chipList(values: readonly string[]) {
  return values.length > 0 ? values.join(", ") : "None yet";
}

function topicLabel(topic: PlanningTopic) {
  return topicOptions.find((option) => option.value === topic)?.label ?? "Hotel/base";
}

function currentRecommendations(
  recommendations: readonly RecommendationDto[],
  topic: PlanningTopic,
) {
  return recommendations
    .filter((recommendation) => recommendation.topic === topic)
    .slice(0, 5);
}

function uniqueValues(values: readonly string[]) {
  return Array.from(new Set(values)).filter(Boolean);
}

function money(recommendation: RecommendationDto) {
  if (!recommendation.estimatedCostAmount || !recommendation.estimatedCostCurrency) {
    return "Cost not estimated";
  }

  return `${recommendation.estimatedCostCurrency} ${recommendation.estimatedCostAmount}`;
}

export function PlanningWorkspace({
  trip,
  preference,
  selectedPlaces,
  recommendations,
  activeTopic,
  message,
  error,
}: {
  trip: {
    id: string;
    title: string;
    destinations: { city: string; country: string }[];
  };
  preference: RecommendationPreferenceSnapshot;
  selectedPlaces: SelectedPlanningPlace[];
  recommendations: RecommendationDto[];
  activeTopic: PlanningTopic;
  message?: string;
  error?: string;
}) {
  const activeTopicOption = topicOptions.find(
    (option) => option.value === activeTopic,
  ) ?? topicOptions[0];
  const readiness = hasTopicRecommendationReadiness({
    topic: activeTopic,
    preference,
    selectedPlaceCount: selectedPlaces.length,
  });
  const visibleRecommendations = currentRecommendations(
    recommendations,
    activeTopic,
  );
  const destinationCountries = uniqueValues(
    trip.destinations.map((destination) => destination.country),
  );
  const destinationCities = trip.destinations;

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
        </div>

        {message ? (
          <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Planning context saved.
          </div>
        ) : null}
        {error === "needs-more-context" ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Add one more detail for {topicLabel(activeTopic)} before generating
            recommendations.
          </div>
        ) : null}
        {error === "invalid-destination" ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Choose a city and country already saved on this trip.
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="grid gap-5">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-medium text-zinc-500">Priority</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topicOptions.map((topic) => (
                  <a
                    key={topic.value}
                    href={`/trips/${trip.id}/planning?topic=${topic.value}`}
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
              <div className="flex items-center gap-2">
                <MessageSquareText aria-hidden="true" className="size-5 text-zinc-500" />
                <h2 className="text-base font-semibold text-zinc-950">
                  {activeTopicOption.prompt}
                </h2>
              </div>
              <form action={recordPlanningMessageFormAction} className="mt-4 grid gap-3">
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <textarea
                  name="message"
                  required
                  rows={4}
                  className="min-h-28 rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-500"
                  placeholder="I want a quiet hotel near museums, walkable cafes, and local markets."
                />
                <button
                  type="submit"
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  <MessageSquareText aria-hidden="true" className="size-4" />
                  Save reply
                </button>
              </form>
              <form action={generateRecommendationsFormAction} className="mt-3">
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <Sparkles aria-hidden="true" className="size-4" />
                  Generate 5
                </button>
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
              <form
                action={addUserPlanningPlaceFormAction}
                className="mt-4 grid gap-3 md:grid-cols-2"
              >
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <input
                  name="name"
                  required
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                  placeholder="Place name"
                />
                <select
                  name="category"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                  defaultValue="ATTRACTION"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category.toLocaleLowerCase().replace("_", " ")}
                    </option>
                  ))}
                </select>
                <select
                  name="country"
                  required
                  defaultValue={trip.destinations[0]?.country ?? ""}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                >
                  <option value="">Country</option>
                  {destinationCountries.map((country) => (
                    <option key={country} value={country}>
                      {country}
                    </option>
                  ))}
                </select>
                <select
                  name="city"
                  required
                  defaultValue={trip.destinations[0]?.city ?? ""}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                >
                  <option value="">City</option>
                  {destinationCities.map((destination) => (
                    <option
                      key={`${destination.country}-${destination.city}`}
                      value={destination.city}
                    >
                      {destination.city}
                    </option>
                  ))}
                </select>
                <textarea
                  name="note"
                  rows={2}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500 md:col-span-2"
                  placeholder="Why this place matters"
                />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:w-fit"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add place
                </button>
              </form>
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
                            <input type="hidden" name="tripId" value={trip.id} />
                            <input type="hidden" name="topic" value={activeTopic} />
                            <input
                              type="hidden"
                              name="suggestionId"
                              value={recommendation.id}
                            />
                            <button
                              type="submit"
                              className="inline-flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
                            >
                              <Check aria-hidden="true" className="size-4" />
                              Pick
                            </button>
                          </form>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  No recommendations for this priority yet.
                </p>
              )}
              <form action={refreshRecommendationsFormAction} className="mt-4 grid gap-3">
                <input type="hidden" name="tripId" value={trip.id} />
                <input type="hidden" name="topic" value={activeTopic} />
                <textarea
                  name="note"
                  rows={2}
                  required
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none focus:border-zinc-500"
                  placeholder="Refresh with quieter hotels closer to museums."
                />
                <button
                  type="submit"
                  className="inline-flex h-10 w-fit items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  <RefreshCw aria-hidden="true" className="size-4" />
                  Refresh
                </button>
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

            <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-950">
                Live plan preview
              </h2>
              {selectedPlaces.length > 0 ? (
                <ul className="mt-4 grid gap-3">
                  {selectedPlaces.map((place) => (
                    <li key={place.id} className="rounded-md border border-zinc-200 p-3">
                      <p className="text-sm font-medium text-zinc-950">
                        {place.name}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-normal text-zinc-500">
                        {place.category}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  Picked recommendations and anchors will appear here.
                </p>
              )}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
