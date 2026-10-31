# Evidarium: first paid product and release gates

Decision agreed with Mikhaeel on 31 October 2026.

The first paid audience is Arabic-speaking master's researchers conducting health-science systematic reviews. The longer-term ambition remains a broader research workspace. Phase 1 is product completion and validation. A custom domain and marketing belong to phase 2, after the gates below pass and the owner agrees to proceed. No launch date or commercial completeness is claimed.

## What the first product must deliver

A researcher must be able to plan a review, document comprehensive searches, import and manage reports, collaborate with a second reviewer and supervisor, resolve screening disagreements, link reports to studies, extract and appraise evidence, conduct supported analyses reproducibly, write and export a correctly formatted thesis, and recover or export the project without losing its audit trail. Arabic and English must work throughout that journey. The owner remains responsible for methodological decisions; exact quotations and automated checks do not establish scientific validity.

The app must explain outside dependencies at the point of use: institutional literature access, registry submissions, supervisor/ethics approval, actual experiments, paid compute and any eventual model-provider requirements. It must not imply unrestricted access to all journals, unlimited model context, guaranteed graduation, or universal coverage of all disciplines.

## Required acceptance gates

| Gate | Evidence needed before paid launch | Current state |
| --- | --- | --- |
| Hosted AI | Approved provider access; actual consented-account chat; correct account model catalog; expiry, refresh, revocation, quota and account-isolation checks; grounded answers against held-out research examples | Provider, access and commercial model deliberately deferred until the research workflow is stable; no requirement that customers buy a separate ChatGPT subscription has been decided |
| Complete bilingual journey | Arabic/English navigation, RTL forms and documents, terminology review by Arabic-speaking researchers, accessible keyboard/mobile flows | Review desk bilingual in 0.6; whole product still incomplete |
| Search coverage | Exact database strategies, dates, result totals, pagination/export ingestion, duplicates and excluded retrievals accounted for; licensed access used legitimately | Current in-app search exploratory, limited to 20 records per request |
| Screening and reporting | Independent reviewer accounts, blinded decisions, conflict resolution, stage histories, study/report linkage, reconciled PRISMA flow | 0.7 adds distinct reviewer identities, concealed decisions, immutable snapshots and owner resolution; real two-account hosted acceptance and complete PRISMA reconciliation remain outstanding |
| Evidence extraction and appraisal | Pilot extraction, independent checking, source locations, corrected-data tracking, appropriate validated appraisal tools and usable evidence-certainty workflow | Source-linked manual extraction and owner checks; independent review and appraisal incomplete |
| Analysis | Supported effect calculations, diagnostic checks, independent numerical reference results, transparent exclusions/assumptions and reproducible outputs | Bounded native meta-analysis exists; additional methods/hosted specialist engines incomplete |
| Thesis delivery | Tested Arabic and English Word/LaTeX/PDF exports, supported citation styles and real university templates, supervisor feedback and revisions | Basic manuscript and numbered-reference exports; full thesis tooling incomplete |
| Reliability and privacy | Authenticated browser walkthrough; access tests, recovery/backups, deletion controls, load/large-project tests, security review and documented operational support | Automated bounded checks exist; browser/private-account, institutional scale and independent security work incomplete |
| Researcher pilot | Proposed: at least 10 consented Arabic-speaking researchers complete a real or rights-cleared reference review, with independent methodological assessment and documented defects/resolution | Not recruited; no outcome or time-saving claims supported |
| Sustainable pricing | Actual per-project storage, model, compute, payments and support costs; user interviews; tested billing/cancellation/refund/access states; owner-approved price | No validated price, payment integration or subscriptions sold |

Items are not marked complete by a filled form or a passing unit test. Each gate requires a dated verification record, exact software version, test scope, failures and unresolved limits. Independent researcher and security reviews require qualified people; code generation does not substitute for them.

## Better value than Theioptera: a testable goal

On 31 October 2026, Theioptera's [public welcome page](https://theioptera.com/welcome) advertised Student Founding at **US$9/month** and Pro at **US$14/month**. It described literature-grounded chat, project roadmaps, materials and additional Pro reporting/export features. These are vendor statements and advertised prices, not our independent assessment of quality or actual account limits. This check did not constitute a full signed-in product evaluation.

Do not publish a superiority or lower-price claim until comparing equivalent tasks and total user costs. If Evidarium requires a separate eligible ChatGPT subscription, include that expense for a new subscriber rather than comparing our workspace fee alone. Compare users who already subscribe separately. Also include compute fees, taxes and payment charges when applicable. Provider commercial terms and model availability still need confirmation.

Proposed comparisons, using the same rights-cleared corpus and independent adjudication:

- Correct source attribution and support for claims; unsupported or invented claims.
- Screening errors, including relevant studies missed; reviewer workload.
- Accuracy of extracted values, units, denominators and time points.
- Statistical agreement with reference software within declared tolerances.
- Arabic readability, RTL correctness, terminology and exported thesis formatting.
- Successful project recovery/export; time, intervention count and total cost per completed workflow.

Pricing is a hypothesis until costs and willingness to pay are measured. Possible options include a researcher workspace subscription, a supervisor/team plan, and explicitly approved metered heavy compute. The AI provider and whether usage is bundled will be decided after workflow validation; a separate customer ChatGPT subscription is not an accepted product requirement. No automatic paid plan, unlimited-compute promise, revenue forecast, or provider agreement has been created.

## Sources guiding methodology

- [Cochrane Handbook chapter 4](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04): search and selection; study/report distinction.
- [Cochrane Handbook chapter 5](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-05): structured extraction and linking reports of the same study.
- [PRISMA 2020](https://www.prisma-statement.org/prisma-2020): reporting checklist and flow diagrams. Implementing a ledger does not by itself establish PRISMA completeness.
- [OpenAI hosted access guidance](https://developers.openai.com/siwc/token-sharing-open-source) and [prepared application](hosted-inference-request.md): hosted ChatGPT plan use remains a provider dependency.
