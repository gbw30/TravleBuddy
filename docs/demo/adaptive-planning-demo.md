# Adaptive Planning Demonstration

Use this script to record repeatable portfolio evidence. Perform it only in an
isolated local or preview environment. Do not point failure injection, worker
termination, fixtures, or migrations at production.

## Prerequisites

- Web app, worker, and database schema come from the same recorded commit.
- The database fingerprint is approved as non-production.
- The adaptive-planning migration is applied and its receipt is saved.
- A test user owns a trip with an active multi-day itinerary.
- The itinerary has at least two replaceable activities and compatible pending
  candidates for the same destination/category.
- `PLACE_PROVIDER_MODE=mock` is used for the deterministic recording.
- Browser developer tools preserve network requests.
- Worker logs are captured through the repository log sanitizer.
- [The evidence template](./evidence-template.md) is open for recording IDs and
  timestamps as they occur.

The active free-first topology uses the existing Vercel QA preview for the web
and API, the existing Neon QA database for durable state, and a local worker
from the same commit. Always-on worker hosting is not required.

Never record database URLs, OAuth tokens, cookies, API keys, raw provider
payloads, or another user's data.

## Scenario 0: Immediate removal without a worker

This scenario proves that bounded user intent does not depend on background
infrastructure.

1. Stop the local worker and confirm no process is consuming QA jobs.
2. Record the active itinerary version and one activity on an otherwise
   populated day.
3. Select a reason and choose **Remove**.
4. Capture HTTP `200` with `status: REMOVED`, the feedback ID, planning
   revision, affected day, and successor itinerary version.
5. Verify the item disappears immediately and remains absent after reload.
6. Verify unrelated days and activities are unchanged and no generation job
   was created.
7. If the reason is **Too expensive**, verify the inferred signal increased by
   `0.10` unless an explicit value was protected.
8. Repeat the exact request with the same operation ID and verify no duplicate
   feedback or versions were created.

Start the worker only for replacement and resilience scenarios below.

## Start the local demonstration worker

In a fresh PowerShell terminal at the repository root:

```powershell
$env:DATABASE_URL = Read-Host "Pooled qa_app QA URL"
$env:NODE_ENV = "production"
$env:PLACE_PROVIDER_MODE = "mock"
$env:QA_PROVIDER_MODE = "mock"
$env:PLANNING_WORKER_ID = "travlebuddy-local-demo-worker"
npm run worker:start
```

Keep this terminal open for Scenario 1. To show durable queuing, stop it, submit
feedback through Vercel, record the persisted pending state, and restart the
same command. After all scenarios, stop the worker and remove every variable
set above with `Remove-Item Env:<NAME>`.

## Scenario 1: Normal targeted replacement

1. Open the trip planning workspace and record:
   - planning revision;
   - active preference profile version;
   - active itinerary version;
   - titles/IDs for the target and one item on an unrelated day.
2. For the target activity, select **Too expensive** and choose **Dislike &
   replace**.
3. Capture the `POST .../itinerary-items/.../feedback` response:
   - HTTP `202`;
   - feedback ID;
   - job ID;
   - new planning revision;
   - initial `PENDING` status.
4. Show persisted phases in the UI:
   - feedback received;
   - updating preferences;
   - finding a replacement;
   - validating the affected day;
   - completed.
5. When the page refreshes, verify:
   - price-sensitivity weight and confidence each increased by `0.10`, capped at
     `1.0`, unless the signal was explicitly protected;
   - one new preference profile version exists;
   - one new itinerary version exists when a replacement was available;
   - the target item changed;
   - unrelated days/items did not change;
   - the former itinerary remains readable with `?version=<old-version>`;
   - result details name the replacement, affected day, and explanation.
6. Repeat the exact captured request with the same operation ID. Verify the
   response replays the same IDs/revision and creates no extra feedback, job,
   preference version, or itinerary version.
7. Save the sanitized browser capture, before/after records, and worker log.

Optional no-replacement branch:

1. Use a fixture with no eligible candidates.
2. Submit the same feedback type.
3. Verify a `NO_REPLACEMENT` result, an updated preference version, and an
   unchanged active itinerary pointer.

## Scenario 2: Worker interruption and recovery

1. Use a dedicated local worker process and record its exact PID/worker ID.
2. Submit item feedback and wait until that worker logs `JOB_CLAIMED`.
3. Force-stop only that recorded non-production worker process before it can
   complete. Do not stop a shared or production worker.
4. Record the last heartbeat and expected lease-expiry time.
5. Start a replacement worker from the same commit.
6. After lease expiry and the next recovery scan, capture:
   - the original attempt as `ABANDONED`;
   - a persistent `RECOVERED` or retry event;
   - the next attempt and worker ID;
   - one terminal result.
7. Verify there is at most one preference version sourced from the feedback and
   at most one itinerary version sourced from the job.
8. Verify the active itinerary remained usable throughout.
9. Record recovery time using the definitions in the evidence template.

If graceful shutdown schedules the retry before lease expiry, record that as the
graceful-shutdown path and repeat with an abrupt termination only in the
isolated environment to demonstrate lease recovery.

If the adaptive handler finishes too quickly for a safe manual interruption,
do not add artificial production delay or repeatedly race-kill processes. Use
the existing real-PostgreSQL expired-lease integration test as deterministic
recovery evidence and label it separately from the live UI journey.

## Scenario 3: Stale-job supersession

1. Stop the isolated worker so jobs remain queued.
2. From one current planning revision, submit feedback A and record its captured
   versions.
3. Submit a newer valid planning mutation or feedback B and record the resulting
   higher trip/planning revision.
4. Start the worker.
5. Capture job A reaching `SUPERSEDED` with
   `STALE_JOB_VERSION`/supersession evidence.
6. Verify job A created no active preference or itinerary successor and did not
   overwrite the state captured by B.
7. Allow the current job, if any, to complete and verify its captured version
   tuple matches the active lineage.
8. Save both job histories and the final active version IDs.

## Closing portfolio recording

In 60-90 seconds, show:

1. The original itinerary.
2. `TOO_EXPENSIVE` feedback and durable progress.
3. The targeted replacement and explanation.
4. Version history and preserved unrelated content.
5. A concise terminal `RECOVERED` or `SUPERSEDED` record.
6. The architecture diagram/README and measured evidence.

State the execution topology plainly: the preview is deployed on Vercel, queue
state is durable in Neon, and the independently runnable worker was local for
the recorded QA demonstration.

Describe guarantees precisely. Say "demonstrated in the recorded QA
environment," not "production-proven," unless production-safe evidence exists.
