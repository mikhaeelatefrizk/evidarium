# Theioptera workflow review — 13 October 2026

This is a bounded product review, not a benchmark, security audit, or claim of superiority. It records the interfaces directly inspected in a signed-in session and one live paper-discussion test. Account identifiers, private project text, credentials, and screenshots of private settings are deliberately excluded from this source repository.

## What was directly inspected

| Surface | Observed behavior | Implication for Evidarium |
|---|---|---|
| New-project flow | Asks intended outcome, confidence, starting experience, then an optional topic. Outcomes include learning a technique, reproducing a paper, reviewing literature, analyzing data, and building a tool. | Research guidance should adapt to the objective and experience. Do not mistake a generic chat transcript for a complete research plan. |
| Focus workspace | Conversation beside an editable project understanding, an in-progress next step, contextual materials, and deadlines. | Keep the next action small and connected to the project brief. |
| Work review | Controls to submit work for review, work on a step, or mark completion without review. | Execution, submitted evidence, and human approval are different states. |
| Materials | Paper/tool/case/note filters, search, starring, source links, notes, paper-specific conversations, URL resources. | Preserve original source identity and distinguish metadata from full text. |
| Live paper discussion | Asked for methodological limitations with exact quotations and locations. Lio explicitly reported access to metadata and a saved note only and declined to invent quotations. | Honest access reporting is a baseline expectation; it is not a unique advantage. Evidarium adds a programmatic exact-passage check and separately records human interpretation review. |
| Paper map | Search returned papers and a graph grouped references, citing works, and related works. Seeded with a reproducible-computing paper. | A citation edge or similarity edge does not establish scientific support. Relation types need explicit meaning. |
| Progress and research graph | Task area, check-in prompts, activity log, phases, and a graph section. The inspected project had no populated research graph. | No conclusion about its populated graph or reasoning quality follows from an empty state. |
| Privacy and security pages | Described AI recipients, external search disclosure, confidential-project controls, retention, export, account deletion, and limitations. These are vendor disclosures, not independently verified controls. | Show actual destinations and capability boundaries, including the fact that a model still receives selected text. |
| Navigation reliability | Opening Menu produced a blank view in this browser; the project was recoverable by returning to the dashboard. | One observation is not a general reliability verdict. |

The paper test used a published paper and a generic evaluation question. It added one question and its response to that paper's conversation. No new project, paid plan, external resource, or research decision was created. No existing research records were deleted. The onboarding tour was advanced and the navigation was expanded during inspection.

## Changes made in Evidarium following the review

- Added exact-text evidence receipts: statement, quotation, source or extracted file location, relationship, match provenance, and explicit human review.
- Added a project switch that blocks manual and model-requested external literature searches.
- Made extracted passages accessible for inspection, with extraction warnings and coverage limits visible.
- Retained explicit proposed, approved, running, completed, failed, cancelled, and interrupted execution states.

## Not established by this review

No hidden backend, paid-only feature, institution-scale workload, complete onboarding submission, overnight automation, actual file ingestion, scientific computation, microphone capture, or populated research graph was tested. Source matching and scientific correctness were not benchmarked. Theioptera's vendor statements are not evidence that every described behavior passed verification. Evidarium also needs real user trials and domain-specific evaluation before any superiority or breakthrough claim is defensible.
