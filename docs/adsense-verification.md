# AdSense site verification

The site owner supplied publisher `ca-pub-8416444551809049` for
`https://www.fynxfinanceworld.com`. The exact asynchronous verification loader is
included once in each public sitemap page's HTML head. Private account pages and
the script-free lightweight directory are excluded. FYNX Funded is not modified.

`scripts/build-adsense-verification.cjs` runs last in the static build, after the
public page generators, so regeneration preserves the verification tag. GitHub
Pages currently publishes the committed HTML from `main` at the repository root;
the generated HTML must be committed with the generator change.

Advertising remains disabled in `config/advertising.json`. A synchronous
`pauseAdRequests = 1` instruction precedes the exact supplied loader. No slots,
ad requests, resume instruction, or ads.txt are added by this verification release.
The build refuses to enable placements while this verification-only gate exists.

Google documents that this pause prevents ad requests, although Google scripts
still load and existing Google-domain cookies may be read. This is not a consent
manager. Before serving ads, configure the required certified consent management,
review privacy disclosures, obtain site approval and actual ad-slot IDs, and
replace the verification-only gate with the consent-aware ad-serving integration.
Keep Auto ads off in the AdSense account to retain control of placements.

After deployment, inspect the live HTML source and click **Verify** for the site
in AdSense. A successful deployment is not an AdSense approval or earnings claim.

Validation: `npm run build` and `node scripts/test-adsense-verification.cjs`.

Google documentation:
- https://support.google.com/adsense/answer/7584263?hl=en
- https://support.google.com/adsense/answer/7670312?hl=en
