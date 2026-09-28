# Cloud learning progress

Signed-in learners can mark lessons complete or incomplete and see their latest 20 assessment attempts per subject across devices. Progress is stored under `fynxWebUsers/{uid}/learning/{topic}`, with assessment history in its `attempts` subcollection. All attempts remain stored; the interface displays the most recent 20.

- Lesson changes merge with other lesson progress.
- Scored quizzes save to the subject chosen at quiz start; mixed quizzes use All markets.
- Retrying the same assessment preserves its score and completion timestamp, without creating another result.
- History refreshes after saves and when returning to a tab. Account changes clear private state and discard stale responses.
- Failed loads disable lesson controls until retry succeeds. Failed saves show a retry action rather than claiming success.
- Guests can study and take quizzes, but must sign in before starting an assessment to save its result. Anonymous browser-local records are not silently imported into an account.
- Results are study history, not verified certifications.

Verified with backend and browser-state regression tests, build/search checks, and two isolated Chrome browser contexts using a disposable Firebase account. A completed Forex lesson and a scored Stocks assessment synced between contexts; sign-out cleared the history. Desktop/mobile checks found no overflow or uncaught page errors. The disposable account and records were removed.

Tests: `node --test backend/learning.test.cjs`, `node scripts/test-cloud-learning.cjs`, and `PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify-learning-live.cjs` (the latter creates and cleans up a disposable account).
