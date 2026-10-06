# manual e2e sample data

`manual-e2e-2026-10-06.sqlite` is a consistent SQLite snapshot of the isolated mock database after the 31 UI test cases. It contains synthetic learners, conversations, assignments, reviews, issues, notes, custom fields and proposal decisions. The seed scripts remain available to start a fresh test run.

To view the completed sample, run these commands from the repository root:

```bash
cp backend/tests/fixtures/manual-e2e-2026-10-06.sqlite storage/manual-e2e-sample.db
FIXTURE_DATABASE_PATH=storage/manual-e2e-sample.db FIXTURE_SCENARIO=manual-e2e FIXTURE_BACKEND_PORT=4011 FIXTURE_FRONTEND_PORT=5182 node backend/tests/run-fixture-ui.mjs
```

Open http://127.0.0.1:5182/. Use a new destination filename when keeping an existing test run. The runner creates a temporary login session; no real Pancake or AI credentials are required.

For a fresh end-to-end run, omit `FIXTURE_DATABASE_PATH` and follow [the test guide](../../../docs/HUONG_DAN_TEST_E2E_HO_SO_HOC_VIEN.md).
