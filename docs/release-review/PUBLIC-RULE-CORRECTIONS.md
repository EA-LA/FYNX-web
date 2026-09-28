# Public rule corrections — item 4

Source changes complete; live Funded publication has not been performed or verified. These changes are included in `patches/funded-public-rules.patch`, applied after the safety and purchase patches. They are also applied to the local Funded source.

Changes:

- Account currency selection is USD only, matching the approved ledger. Checkout no longer presents an arbitrary query-string currency as supported.
- Removed the unsupported 1:100 leverage claim from every program/size configuration. Display now says pending broker verification.
- Normal and Swing descriptions no longer grant universal overnight/weekend permission. Pricing comparison and FAQ describe the same pending instrument/account restrictions.
- Forex is described as planned; no production pairs are approved while checklist item 3 remains incomplete. Crypto and other markets display unavailable, without a promised launch date.
- Shared notice on builder, pricing, rules and How It Works states the 22:00 UTC reset, static maximum loss, below-only breach and 40% consistency. It links to the program-specific target/loss/minimum-day table.
- FAQ describes all three phase structures and human review. How It Works labels its 8%/5% targets and 5%/10% loss limits as a two-phase example.
- Builder no longer promises crypto payment availability; checkout explicitly labels payment methods as previews while purchases remain closed. Payment-method previews are not claims of tradable crypto instruments.

General Terms, Privacy and RefundPolicy legal text was not amended or treated as reviewed. The new numerical policy remains new-account-only. Production deployment, broker approval and effective legal publication are tracked separately; this source correction does not close those gates.

Validation: existing Funded suite (21 tests) and production build passed. Applying all three patches sequentially to the pinned Funded baseline reproduced all eight changed public files exactly. CI now applies the same sequence and runs the Funded suite/build. No live-site verification is claimed.
