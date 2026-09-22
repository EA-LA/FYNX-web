# FYNX API completion checklist — 2026-09-22

This records verified engineering work separately from production rollout and external evidence. The current release is a developer beta, not a verified broker integration or an unrestricted commercial launch.

| Step | Finished | Remaining |
| --- | --- | --- |
| 1. Product scope | Two products; six Forex Risk calculations using caller-supplied metadata; submitted-event USD Prop Firm Rules beta; available/later boundary now explicit in public docs. Formula and event-state regression tests pass. | Broker-authoritative instrument specifications; applicable Funded account terms; reconciliation of the five existing policy differences. |
| 2. Public pages | Overview, Risk, Prop Firm Rules, Pricing, Docs, Access and workspace entry. Corrected stale planned-feature wording and the incomplete position-size example. | Production publication of this update. |
| 3. Developer workspace | Existing free workspace, keys, environments, playground, histories, rules/accounts, support and billing waitlist implementation. | Live Stripe configuration and payment verification; paid activation remains deferred. |
| 4. Engine | 25 backend tests pass. Existing operations/recovery work is documented in developer-operations.md. | Fresh live integration verification needs administrator Application Default Credentials; this session could not load them. Prior production evidence is dated September 21 and is not a new test result. |
| 5. First-party proof | All 16 local calculator comparisons match; invalid-input and pilot-access checks pass; nine synthetic Funded scenarios rerun. | Real histories; all five policy differences; at least seven days of representative shadow results; 3–5 external beta participants and at least three completed integrations. |
| 6. Entry points and launch | Finance World already has landing-page desktop/mobile/footer API links. Added a shared authenticated-header API link. Added Funded desktop/mobile API links and footer links to API, documentation and pricing. Seven API routes checked at 390px and 1440px without horizontal overflow. Funded desktop/mobile navigation checked visually. | Publish scoped changes; rerun complete authenticated live journey; reviewed API terms before declaring full launch. |

## Verification performed this session

- `npm run test:api`: seven pages, links, fragments, mobile menu, code-language selection, clipboard and executable position-size example.
- `npm run test:proof`: 16 matching local calculator fixtures, invalid-input checks, pilot route isolation and nine Funded scenarios. Four scenarios match; five deliberately expose unresolved policy differences. Passing this command does not mean the policies agree.
- `npm test --prefix backend`: 25 tests passed.
- `npm run build`: API/static site passed, including 79-page shared design checks.
- Funded `npm run build`: passed.
- Browser: all seven API routes at 390px and 1440px fit the viewport. Funded API menu link and three footer links render; mobile menu opens with accurate expanded state.
- Production smoke command: blocked before creating any QA user because Google administrator default credentials were unavailable. No production parity or signup-to-usage success is claimed for this session.

## Required inputs

1. Broker/provider export or authoritative data location, with account terms and complete ordered event/reset coverage. See STEP-5-PROOF.md for exact fields.
2. Broker symbol/contract specification source; example EURUSD values are illustrative, not verified availability.
3. Dedicated live API Stripe secret configured in Secret Manager when paid activation is desired. Do not paste credentials into chat or commit them.
4. Three to five beta recipients. Invitation and integration checklist already exist in API-BETA.md; no invitations were sent.
5. Reviewed API terms and privacy/retention commitments for commercial launch.

No customer account rules, funded decisions, billing credentials or paid activation were changed.
