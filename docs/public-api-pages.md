# Public API pages — original Step 2 release notes

> Historical snapshot: the preview-only boundaries below were superseded by the implemented developer beta. For current status, see [LAUNCH-CHECKLIST.md](LAUNCH-CHECKLIST.md), [developer-workspace.md](developer-workspace.md), and [developer-operations.md](developer-operations.md).

Step 2 implements a public developer preview in `/api/`, with dedicated Overview, Risk API, Prop Firm Rules API, Pricing, Documentation and Access pages. The home-page desktop navigation, mobile drawer and footer link to it. Each page is server-independent static HTML; reading requires no authentication or JavaScript.

The visual system uses FYNX green, pale neutral surfaces, accessible navigation and a dedicated developer layout. JavaScript enhances mobile navigation, code-language selection and clipboard copying. External Google Fonts have local system fallbacks.

## Product boundaries

- No functioning API, key issuance, developer dashboard or billing is claimed.
- Get API Key goes to a transparent launch-access page. Its contact action opens a mail draft; the user must send it. It does not issue a key or pretend to submit an application.
- Sign In goes to an explanatory API access section, which links to the existing FYNX login. It does not promise that login unlocks API features.
- Six Risk operations are described. Liquidation and options remain deferred.
- Prop rule evaluation is separate from payout approval, funding and broker integrations.
- Docs contain draft schemas, illustrative responses and server-side curl/Python/JavaScript snippets. Hostname and endpoint availability are explicitly marked proposed. No client-side live request or private key is used.
- Pricing presents the owner-selected proposed 1,000-call free allowance and $49/month Pro base price. Included Pro calls and overage prices remain unpublished. Usage charging policies are proposals, distinct from operational logging. No checkout or financial charge exists.
- Exact broker symbol metadata remains a production gate from Step 1.

## Page map

- `/api/`: product overview and example uses.
- `/api/risk.html`: input/output table, worked position example and model limitations.
- `/api/prop-firm.html`: account workflow, loss allowance example, rules and audit semantics.
- `/api/pricing.html`: plan structure, usage/overage/reset proposals and availability.
- `/api/docs.html`: quickstart, auth, endpoint summaries, error meanings and examples.
- `/api/access.html`: access request and existing-account login destinations.

The FYNX Funded footer integration remains a separate repository change; this release adds the Finance World entry points only.

## Verification

- `npm run build` passed.
- `npm test` passed existing journal checks.
- `npm run test:api` passed six-page link/fragment/metadata and interaction checks.
- All six public routes checked at a 390px browser viewport: no document horizontal overflow.
- Desktop and mobile visual checks completed; code language switching verified in browser.
