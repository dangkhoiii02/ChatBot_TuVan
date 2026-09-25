# Backend adversarial regression report

Run date: 2026-09-25

## Test environment

- **Authentication:** tests sign a fake `staff-test` session for `page-test` with a test-only secret. Requests pass through the real auth middleware and page/student/message authorization. No demo login endpoint or production auth bypass is used.
- **Database:** `BACKEND_DATABASE_PATH` points to a fresh SQLite file under `os.tmpdir()/backend-fixes-*`. Tests close and remove it in `finally`; they do not open the repository's `storage/app.db`. `ALLOW_DEMO_MODE=0`.
- **Fixtures:** stable fake page/customer/student A/student B IDs; shared conversation with historical A/B ownership; student and teacher messages; facts including private/relevant events and conflict pairs; assignment, confirmed review session, issue, occurrence, evidence, and history cursor.
- **Pancake:** HTTP `fetch` is mocked at the existing `pancakeClient` boundary. Tests check requested cursors and fake token; responses cover terminal pages, valid/absent/null/conflicting cursors, duplicate IDs with changed metadata/timestamps, mid-page failure, retry from the last confirmed cursor, and live messages interleaved with backfill. Internal cursor and DB handling remain real.
- **AI provider:** HTTP `fetch` is mocked at the provider boundary. Tests capture the exact outbound JSON body from the real adapter and compare prompt facts with `usedFacts` and generation audit IDs. Private-event filtering, provider errors, successful retry, and a DB trigger failing generation persistence are checked against SQLite state.

## Results

| Check | Result | Verification |
| --- | --- | --- |
| FIX-003 | PASS | Client-only, fake, and student sources cannot create teacher-confirmed evidence; rejected requests leave issue/evidence/action rows unchanged. |
| FIX-004 | PASS | PATCH promotion requires valid teacher provenance; `staff_confirmed` alone cannot create a teacher prescription; confirmed review evidence can promote a sourced occurrence. |
| FIX-005 | PASS | Evidence retains the occurrence's issue relation; two evidence rows attach to one occurrence; retries dedupe by canonical message despite changed client keys; distinct messages create distinct occurrences. |
| FIX-007 | PASS | Provider failure writes no review/assignment/generation; generation DB failure returns failure and rolls back review, assignment, audit, cache, and revision mutations. |
| FIX-009 | PASS | CREATE and PATCH share conflict detection; updates into/out of conflict and archive/resolve are checked; captured prompt, `usedFacts`, and generation audit use only the resolved fact set; concurrent updates remain unusable while conflicting. |
| FIX-013 | PASS | Live sync does not overwrite historical cursor; null, absent, and contradictory cursors do not complete coverage; retry uses the last confirmed cursor; duplicate metadata changes do not rewrite sender/timestamp provenance. |
| REGRESSION-001 | PASS | Backfill error/retry, idempotent duplicates, live arrivals, absent/null/conflicting cursors preserve the last confirmed cursor and coverage state. |
| REGRESSION-002 | PASS | Captured provider payload and `usedFacts` match; provider and DB persistence failures are asserted against actual DB state. |
| FIX-001 smoke | PASS | Captured prompt and response `usedFacts` exclude the private event. |
| FIX-002 smoke | PASS | A/B ownership remains correct after relink/resync, including same-ID metadata edits. |
| FIX-006 smoke | PASS | Conflicting facts remain unavailable until an explicit resolution. |
| FIX-008 smoke | PASS | Backup restores to a separate SQLite file; restored DB integrity and foreign-key checks pass. |
| FIX-010 smoke | PASS | Legacy migration is rerunnable and preserves legacy content/evidence attribution. |
| FIX-011 smoke | PASS | Start evidence and history coverage control the date/duration labels. |
| FIX-012 smoke | PASS | Message-level A/B mapping allows review only for the source message's student. |
| Grading revision and assignment identity | PASS | Stale grading context returns 409; a retry keeps its review and assignment, while separate reviews with the same title create separate assignments. |
| Incremental proposal extraction | PASS | Processed messages are skipped on retry; an older message discovered later by backfill is still processed; the queued worker processes a newly synchronized message. |

`CANNOT_VERIFY_WITH_REAL_VENDOR`: no Pancake production account/request was available. Vendor responses were modeled at the current HTTP boundary; internal ownership, provenance, cursor, retry, idempotency, transaction, privacy, and DB behavior were tested with the real backend and isolated SQLite.

## Commands

- `npm run typecheck` — PASS.
- `npm run build` — PASS.
- `npm test` — PASS, 18/18 tests.
- `npm run test:integration` — included in `npm test`; 17 integration subtests passed.
- `npm run test:migrations` — PASS, 1/1 test.
- `git diff --check` — PASS.

Expected mock provider and forced DB-trigger errors appear in test logs; their tests assert the resulting 502/500 responses and unchanged DB state. Remaining test failures: none.
