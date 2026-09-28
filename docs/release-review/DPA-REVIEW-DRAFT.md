# API data-processing addendum — review draft

**Incomplete legal draft; not executed or effective.** Use only if the verified processing relationship requires a processor agreement. Complete parties, schedules and legal review before signing.

Parties: [Customer/controller legal entity] and [FYNX/processor legal entity]. Service agreement: [version/date]. Term: [service term plus approved deletion/return period].

FYNX will process Customer personal data only on documented instructions to provide and secure the contracted API service, including lawful instructions concerning international transfers. If a legal requirement compels other processing, FYNX will notify Customer where legally permitted. Customer is responsible for lawful instructions and required notices. Instructions that appear unlawful must be escalated for review.

Access will be limited to personnel bound by appropriate confidentiality obligations. The parties will agree proportionate security measures and document them in Schedule B. FYNX will provide reasonable assistance with individual-rights requests, incident investigation and applicable impact-assessment obligations, considering the nature of processing and available information. Incident notification procedure and timing: **[counsel-approved requirement and operational contact]**.

Subprocessors require **[specific authorization or approved general authorization plus change notice/objection process]** and appropriate written obligations. Schedule C must identify actual providers, purposes and locations. Cross-border processing requires **[applicable lawful mechanism and any required supplemental measures]**. This draft does not itself supply completed international transfer clauses.

At service end, Customer may request **[return/deletion method and deadline]**, subject to documented legal retention. Backup expiry and restoration handling must follow the approved retention schedule. FYNX will make available relevant compliance information and support **[reasonable audit process, scope and safeguards]**. Responsibility, costs and liability must be reconciled with the final service agreement and applicable mandatory law.

## Schedule A — processing particulars

- Subject matter: API rule-account monitoring and related service support using Customer-submitted events.
- Nature: receive, validate, calculate, store, retrieve and maintain audit history; delete/return under approved process.
- Data subjects: Customer's authorized users and traders, to the extent submitted data identifies them.
- Data categories: account aliases/IDs, timestamped trading/P&L/exposure events, rule results and related support material. No identity documents, secrets or sensitive categories are needed for these endpoints; review any proposed exception separately.
- Duration and controller instructions: [complete].

## Schedule B — controls to verify

Authentication; workspace/environment authorization; hashed API-key lookup and revocation; transport and provider storage encryption; least-privilege operator access; event replay controls; telemetry and incident response; recovery testing; export/deletion and backup handling. Specify verified implementation and responsibility for each control; do not claim certification or guaranteed recovery times.

## Schedule C — subprocessors and transfer inventory

Complete provider legal entities, service purpose, data categories, processing regions, access regions, agreement references, transfer mechanism and notification process. Google/Firebase and applicable hosting/support providers require review; classify Stripe's role for each billing activity rather than assuming it is always a subprocessor.

Review against the final applicable law, including [GDPR Article 28](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng) where applicable. Counsel must settle missing commercial and jurisdiction-specific clauses.
