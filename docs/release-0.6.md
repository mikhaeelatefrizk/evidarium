# Evidarium 0.6 — bilingual systematic-review desk

31 October 2026. This increment implements part of [phase 1](phase-1-product.md); it does not complete or commercially launch the product. Hosted AI remains disabled. No model key, payment account, custom domain or marketing campaign was added.

## Implemented workflow

Open **Systematic review · المراجعة** from the sidebar of a project. The review desk defaults to Arabic and offers English. The choice is stored only as a browser preference. Direction, mixed-language text and typography are scoped to this desk; the rest of the app is still primarily English.

- **Protocol:** 14 structured planning fields, including PICO, eligibility, search, screening, extraction, bias assessment, synthesis and registration status. The written-field counter is explicitly not a scientific-quality score. Saving is not preregistration.
- **Studies and reports:** manually associate one or more saved reports with a study. A report cannot belong to two study groups. Linked reports remain in the reference library. Grouping notes record why the researcher believes the reports belong together.
- **Data extraction:** preserve field, value, unit, time point, study/report, exact quotation and abstract or file location. The server checks the passage against the project's stored text, hashes that text, and records file hashes where available. Wrong quotations, wrong locations and cross-project/report associations fail before saving.
- **Owner checks:** the signed-in owner may mark a value checked. This is not independent dual review. Changed values or evidence cannot silently retain a previous checked state; edited entries must first be saved unchecked. No automatic risk-of-bias or certainty judgment is generated.
- **Revisions:** explicit save with a reason, optimistic revision checking, atomic snapshot/history/audit writes and the latest 30 complete snapshots. Concurrent stale saves return 409. Unsaved drafts can be downloaded, including unfinished extraction forms. Restoring a historical snapshot creates a draft; saving creates a new revision and rechecks available evidence.
- **Exports:** review JSON with retained history and bibliographic labels; UTF-8 extraction CSV with spreadsheet formula protection; current review state included in whole-project exports. Whole-project import remaps studies/reports and resets imported checks. Imported quotations remain clearly external/unverified until reassociated and checked. Imported original file bytes and historical revisions are not reconstructed. An existing review workspace cannot be overwritten through project import.

Limits: 200 studies, 500 extraction entries, 300,000 serialized characters including verification metadata, 12,000 characters per protocol field, 30 retained revisions. These are explicit current bounds, not unlimited research storage. Other documented workspace limits still apply.

## Data and access

Schema-only migration `0007_review_workspace.sql` adds `review_workspaces` and `review_revisions`. D1 and local SQLite share the HTTP implementation. Existing projects/data are unchanged by migration. Reads, exports and writes require the project's owner; cross-origin writes remain blocked.

`GET/PUT /api/projects/:id/review` reads/saves the workspace. A PUT contains `data`, the last saved `revision` (0 for a new workspace), and a non-empty `reason`. `GET .../history` lists retained snapshots; `GET .../history/:revision` reads one. `GET .../export` returns JSON; `?format=csv` returns extraction rows. Server-generated verification/actor fields are not trusted from incoming drafts.

## Verification

Ten new real SQLite/HTTP tests cover Arabic persistence, quotes and hashes, ownership/origin checks, report uniqueness, concurrent saves, changed reviewed data, exact file locations, import remapping/unverified provenance, CSV safety and bounded history. These are controlled fixtures, not a researcher pilot.

See `docs/validation/review-0.6.json` and `docs/validation/hosted-0.6.json` for this release's actual check results and scope. The latter records the tested deployment and download checksums. No previous release's CI pass is represented as a pass for this code. Full authenticated browser testing, independent scientific review and hosted AI are separate gates.

The first 0.6 Windows installer run failed: the launcher preferred `py -3`, which selected a different installed Python and attempted a slow source build of NumPy. The launcher now respects the interpreter selected on PATH, reports its version, and uses explicit Python 3.11/3.12 fallbacks when only the Windows launcher is available. [The corrected run](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/41208873148) passed all four jobs: Windows, Linux, macOS and the scientific-engine workflow. Runtime jobs include the real launcher, dependency installation and HTTP application checks; a syntax check alone is not treated as proof of installation. Machine-readable results are in `docs/validation/ci-0.6.json`.

## Known gaps

The whole app is not yet translated. HTTP validation details remain English, under a bilingual error heading. Structured review data is available through this desk/export, but is not yet included in the general project full-text search or local AI context. Project import retains the current review with external provenance; the standalone review/draft JSON downloads are archival exports, not a one-click reimport feature. A deleted evidence file blocks rechecking its entries until original evidence is restored or those entries are explicitly corrected. Complete PRISMA flow, dual reviewers, reviewer invitations, risk-of-bias tools, GRADE, full thesis formats, hosted models/engines and payment operations remain incomplete.
