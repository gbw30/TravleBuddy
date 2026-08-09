# Adaptive Planning Evidence Template

Replace every `[RECORD]` placeholder with measured or observed evidence. Delete
unused rows. Never invent values, and never paste secrets or unsanitized
production data.

## Run identity

| Field                        | Evidence                         |
| ---------------------------- | -------------------------------- |
| Date/time (UTC)              | `[RECORD]`                       |
| Operator                     | `[RECORD]`                       |
| Commit SHA                   | `[RECORD]`                       |
| Branch/tag                   | `[RECORD]`                       |
| Environment                  | `local / QA / preview: [RECORD]` |
| Database fingerprint receipt | `[PATH OR SAFE ID]`              |
| Migration head               | `[RECORD]`                       |
| Web deployment/version       | `[RECORD]`                       |
| Worker execution/version     | `local + commit: [RECORD]`       |
| Worker count                 | `[RECORD]`                       |
| Provider mode                | `mock / google / auto: [RECORD]` |
| QA run ID                    | `[RECORD]`                       |

External-service configuration status:

- Google Places enabled/configured: `[YES / NO / NOT USED]`
- Worker execution: `[LOCAL WORKER / OPTIONAL HOSTED]`
- Vercel preview/production configured: `[YES / NO / LOCAL WEB]`
- Figma styling applied: `[YES / NO / NOT REQUIRED]`

## Deterministic gate

| Check                          | Command/run   | Result                    | Evidence path   |
| ------------------------------ | ------------- | ------------------------- | --------------- |
| Prisma validate/generate       | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| ESLint                         | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| TypeScript                     | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| Full unit/integration tests    | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| Production build               | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| Migration preflight/postflight | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| Critical browser journey       | `[RECORD]`    | `[PASS / FAIL]`           | `[RECORD]`      |
| Release QA auditor             | `[QA RUN ID]` | `[PASS / FAIL / BLOCKED]` | `[REPORT PATH]` |

## Scenario 1: Normal replacement

| Observation                  | Before     | After      |
| ---------------------------- | ---------- | ---------- |
| Planning revision            | `[RECORD]` | `[RECORD]` |
| Trip version                 | `[RECORD]` | `[RECORD]` |
| Preference version ID/number | `[RECORD]` | `[RECORD]` |
| Price-sensitivity weight     | `[RECORD]` | `[RECORD]` |
| Price-sensitivity confidence | `[RECORD]` | `[RECORD]` |
| Itinerary version ID/number  | `[RECORD]` | `[RECORD]` |
| Target item/suggestion       | `[RECORD]` | `[RECORD]` |
| Unrelated-day fingerprint    | `[RECORD]` | `[RECORD]` |

- Feedback ID: `[RECORD]`
- Job ID: `[RECORD]`
- Operation ID: `[RECORD OR REDACTED HASH]`
- HTTP acknowledgement: `[STATUS AND DURATION]`
- Terminal outcome: `[REPLACED / NO_REPLACEMENT / OTHER]`
- Provider provenance: `[RECORD]`
- Explanation shown to user: `[RECORD]`
- Replay response matched original: `[YES / NO]`
- Duplicate effect counts after replay:
  - feedback events: `[RECORD]`
  - jobs: `[RECORD]`
  - sourced preference versions: `[RECORD]`
  - sourced itinerary versions: `[RECORD]`
- Historical itinerary still readable: `[YES / NO, EVIDENCE]`
- Artifacts: `[SCREENSHOT / HAR / SANITIZED LOG / QUERY RECEIPT PATHS]`

## Scenario 2: Recovery

| Event              | UTC timestamp | Worker/attempt |
| ------------------ | ------------- | -------------- |
| Feedback persisted | `[RECORD]`    | `n/a`          |
| Job claimed        | `[RECORD]`    | `[RECORD]`     |
| Last heartbeat     | `[RECORD]`    | `[RECORD]`     |
| Worker terminated  | `[RECORD]`    | `[RECORD]`     |
| Lease expired      | `[RECORD]`    | `[RECORD]`     |
| Recovery recorded  | `[RECORD]`    | `[RECORD]`     |
| Retry claimed      | `[RECORD]`    | `[RECORD]`     |
| Terminal result    | `[RECORD]`    | `[RECORD]`     |

- Original attempt status: `[ABANDONED / FAILED / OTHER]`
- Final job status: `[RECORD]`
- Preference versions sourced from feedback: `[RECORD; EXPECT 0 OR 1]`
- Itinerary versions sourced from job: `[RECORD; EXPECT 0 OR 1]`
- Active itinerary available during failure: `[YES / NO]`
- Recovery evidence paths: `[RECORD]`

## Scenario 3: Stale supersession

| Field                       | Older job A  | Winning mutation/job B |
| --------------------------- | ------------ | ---------------------- |
| Job/operation ID            | `[RECORD]`   | `[RECORD]`             |
| Captured trip version       | `[RECORD]`   | `[RECORD]`             |
| Captured preference version | `[RECORD]`   | `[RECORD]`             |
| Parent itinerary version    | `[RECORD]`   | `[RECORD]`             |
| Terminal status             | `[RECORD]`   | `[RECORD]`             |
| Created active successor    | `[YES / NO]` | `[YES / NO]`           |

- Superseded error/event code: `[RECORD]`
- Final active preference version: `[RECORD]`
- Final active itinerary version: `[RECORD]`
- Proof job A did not overwrite B: `[QUERY OR SCREENSHOT PATH]`
- Sanitized job-event/log paths: `[RECORD]`

## Measured performance

Use one clock source per duration and record the sample count.

| Metric                | Definition                                  |    Samples |           p50 |           p95 |           Max |
| --------------------- | ------------------------------------------- | ---------: | ------------: | ------------: | ------------: |
| API acknowledgement   | Feedback request start to HTTP `202`        | `[RECORD]` | `[RECORD] ms` | `[RECORD] ms` | `[RECORD] ms` |
| Queue wait            | Job `createdAt` to first `claimedAt`        | `[RECORD]` | `[RECORD] ms` | `[RECORD] ms` | `[RECORD] ms` |
| Processing            | Successful claim to terminal completion     | `[RECORD]` | `[RECORD] ms` | `[RECORD] ms` | `[RECORD] ms` |
| End-to-end adaptation | Feedback persistence to terminal completion | `[RECORD]` | `[RECORD] ms` | `[RECORD] ms` | `[RECORD] ms` |
| Lease recovery        | Lease expiry to recovered retry claim       | `[RECORD]` | `[RECORD] ms` | `[RECORD] ms` | `[RECORD] ms` |

Additional counts:

- Jobs processed: `[RECORD]`
- Retries: `[RECORD]`
- Recovered claims: `[RECORD]`
- Dead-lettered jobs: `[RECORD]`
- Superseded jobs: `[RECORD]`
- Duplicate effects prevented: `[RECORD]`

## Safety and review

- [ ] Database proved non-production before state-changing QA.
- [ ] Cross-user ownership tests passed.
- [ ] No raw secrets, URLs with credentials, cookies, tokens, or provider
      payloads appear in artifacts.
- [ ] Logs were sanitized.
- [ ] External calls occurred outside the activation transaction.
- [ ] Metrics are measured, not estimated.
- [ ] Web and worker use the recorded commit.
- [ ] Known limitations and deferred features are disclosed.

## Portfolio artifacts and claims

- Architecture diagram: `[PATH]`
- Desktop screenshot: `[PATH]`
- Mobile screenshot: `[PATH]`
- 60-90 second video: `[PATH/URL]`
- QA reports: `[PATHS]`
- Resume bullet draft: `[RECORD]`
- Evidence supporting every numeric claim: `[PATHS]`
- Reviewer sign-off: `[NAME/DATE]`
