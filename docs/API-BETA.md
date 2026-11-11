# FYNX API external beta

Status: ready for invitations; no external participants have been supplied or verified yet. Automated internal tests are not external beta evidence.

## Invitation draft

Subject: Try the FYNX API developer beta

Hi [name],

We’re inviting a small group to test FYNX’s Risk API and Prop Firm Rules API. Start at https://www.fynxfinanceworld.com/api/docs.html and create your workspace at https://www.fynxfinanceworld.com/api/workspace.html. Please use test keys and synthetic account data. This beta does not execute trades or approve funded accounts.

Your first task is to follow the docs without help, create a test key, and run the Node quickstart linked below. Please note anything unclear or missing. Free test usage includes 1,000 successful calls per UTC month, and paid subscriptions are currently on a waitlist. No payment is needed.

Quickstart: https://www.fynxfinanceworld.com/api/examples/quickstart.mjs

Send feedback through Settings & support in your workspace. Include the request ID, expected result and observed result; never send an API key. Please tell us your language/runtime, time to first successful request, and any steps where you needed help.

Thanks,
FYNX

## Participant acceptance checklist

Use three to five real external developers. For each, record an alias and runtime in `proof/beta-results.csv`; keep personal contact details outside the repository.

1. Read the public docs without a private walkthrough. Record doc gaps before helping.
2. Create a workspace, verify email, create a test key, and run the downloaded quickstart with Node.js 22+ and FYNX_API_KEY set locally. It checks the expected 0.33 lot result and a 422 response for a wrong-side stop.
3. Verify request history, test/live separation, key rotation and old-key rejection. Never publish keys or screenshots containing them.
4. Download `https://www.fynxfinanceworld.com/api/examples/prop-firm-quickstart.mjs` and run `node prop-firm-quickstart.mjs` with your test key in a quiet workspace. The script uses six successful test calls, retains one synthetic account/rule set, and prints their IDs. Then inspect those records in the workspace. Create a synthetic rule set and account manually if testing another language. Submit an ordered event, retry its exact payload and confirm no extra successful-call usage. Change the same event key’s payload and confirm rejection. Try the next sequence and examine the account's event history.
5. Lower the request cap and confirm rejection at the cap, then restore it. Confirm the Pro action saves waitlist interest without taking payment.
6. Submit a support ticket with request IDs and friction points. Fix documentation/integration defects, then have the participant repeat the failed step from the updated docs.

External beta passes when at least three independent participants complete the steps and no unresolved integration blocker remains. A participant who needs undocumented instructions is evidence to improve the docs, not an automatic pass. Invitations and participant results are still pending the owner's recipient list.
