# Workflow integrity audit — 0.7

Audit date: 31 October 2026. This is a bounded source review and regression record, not certification, a penetration test, or proof that a research conclusion is correct. Automated account tests use synthetic authenticated contexts against the actual API and SQLite database; they do not establish that two real hosted accounts have completed the browser workflow.

## What was examined

The review followed project creation and account boundaries, source import and reference mapping, original-file upload and extraction, exact-passage receipts, protocol and extraction revision history, approved analysis provenance, manuscript revisions and citations, export/import, migrations, and the new independent-screening ledger. Existing upload, scientific-engine, review, bibliography, and manuscript suites remain relevant; this audit adds failure and recovery checks instead of replacing those suites.

Independent screening is intentionally a separate record. Ordinary project editing, tasks, files, claims, manuscript drafts, and legacy screening remain owner-only. Invited reviewers receive assigned immutable snapshots and evidence access through dedicated screening routes. Independent decisions do not silently overwrite legacy source decisions or their counts. A researcher must choose which record a report represents.

## Corrections and evidence

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| A malformed later project-import item could leave earlier items saved. | Validate every collection before mutation, then commit the complete import in one database batch. | Valid first source followed by invalid source, note, message, task, claim, or metadata leaves the original project unchanged. |
| A database failure during import could leave a partial project. | Sources, current drafts, notes, messages, task provenance, claims, review state, project settings, and import audit events share one transaction. | An injected SQL error after several mutations rolls everything back; reopening the database and retrying succeeds. |
| Reused incoming source IDs could silently bind citations to different papers. | Reject duplicate incoming IDs before saving. | Duplicate-ID import is rejected with no project changes. |
| Reference deduplication could collapse two external report IDs into an invalid two-study association. | Revalidate study/report relationships after reference IDs have been mapped. | An import describing the same DOI as two different studies is rejected without writes. |
| Import planning could race a protocol correction. | The transaction admits import writes only after comparing the protocol snapshot; manuscript capacity is also checked within the transaction. | A concurrent protocol correction survives, and the competing import leaves every collection unchanged. |
| Multibyte text could exceed a hosted database row limit even below a character limit. | Check encoded row bytes before submitting the transaction. | An oversized CJK audit record is rejected with no research records saved. |
| Citation replacement could mistake one source ID for the prefix of another. | Replace complete citation identifiers once. | `paper` and `paper-longer`, including a page locator, map to their respective records. |
| Import scaling relied on per-record source operations. | Resolve duplicate references once, prepare bounded statements, and use one atomic batch. | All supported collection maxima together produce one 2,202-statement batch and no more than ten individual queries. |
| Import could appear to establish execution or evidence verification. | Imported tasks retain externally supplied provenance; claims and extracted review values require checking again. | Maximum-size import retains `imported` task state and `unreviewed` claims. |
| Research edits must survive restarts without losing their supporting originals. | Existing persistence is exercised through the real API and file store. | Source, original bytes, checksums, analysis provenance, claim, structured review, manuscript, citations, and histories are compared after reopening SQLite. |
| A failed manuscript save must not produce mismatched text and history. | Existing transactional save behavior is tested adversarially. | Injected SQL failure preserves text, revision history, and audit; a later retry succeeds. |
| Legacy screening, claim review, and protocol updates could commit without their audit entry, or overwrite a concurrent edit. | Compare the saved state and commit the change with its audit event in one transaction. | Injected audit failure rolls back each operation; concurrent changes yield one success and one conflict, with one new audit event. |
| Object deletion followed by SQL failure could advertise a physically missing original as usable evidence. | Keep an unavailable deletion marker until idempotent cleanup succeeds; never restore availability after an ambiguous object-store response. | SQL failure, object-store connection loss after deletion, database restart, and concurrent retries preserve the marker and eventually produce exactly one deletion event. |

The independent-screening suite separately exercises email-bound one-use invitations, expiry and revocation, two distinct active reviewers, concealed peer choices, immutable submissions, agreement and adjudication, stale revisions, concurrent requests, account separation, snapshot evidence, migration preservation, and SQL failure rollback. Revocation is checked again at the decision-write boundary. Rejoining does not revive an old assignment generation. Corrections create a new numbered round; they cannot erase the previous round or restore methodological blinding after earlier choices were already known.

## What each export preserves

| Mechanism | Preserved | Not restored by that mechanism |
| --- | --- | --- |
| Project JSON interchange | Project metadata, sources, notes, messages, externally attributed tasks and claims, current manuscript drafts, current structured review, and recorded legacy audit data within import bounds | Original file bytes, complete manuscript/review revision histories, independent-screening ledger, reviewer access grants, installation credentials |
| Independent-screening archive | Saved screening snapshots, assignments, submitted decisions that the requester may see, resolutions, cancellations, and screening events | Original file bytes, account access grants, invitation tokens, a one-click database restore; incomplete pairs remain concealed |
| Consistent local data-directory backup | Database and original-file store when copied together while the application is closed | OS-keyring credentials; account authorization must be re-established separately |

Project interchange is not a full backup. Imported scientific output is not an independently reproduced calculation. Original files need separate retention. A hosted disaster-recovery process must preserve and restore both database and object storage, rebuild search indexes where required, and be rehearsed against a separate recovery environment before it is relied upon for irreplaceable work. This audit did not perform a production backup restore.

## Database and operating bounds

Cloudflare documents a D1 batch as one invocation query even when it contains thousands of statements, and states that the sequence rolls back on failure. Each statement and the entire batch still have platform limits. The collection-maxima regression uses actual SQLite and verifies the application's query shape; it is not a hosted timing or capacity benchmark. See [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) and [D1 batch semantics](https://developers.cloudflare.com/d1/worker-api/d1-database/).

The independent-screening list uses bounded pages and bulk decision/member reads. Snapshots are limited by UTF-8 bytes: 1 MiB per round and 8 MiB per project. Archive pages contain at most ten rounds, require the same event-based archive version, and reject a page if the ledger changes while it is being read. All pages must be retained; project/team events are on page one, and concealed decisions are identified explicitly. Other existing project reads still materialize collections, as documented in the architecture guide. No institutional-scale performance claim is made.

## Reproduction and remaining validation

Run `node --test tests/workflow-integrity.test.mjs` for the fourteen new integrity regressions. The combined integrity, review, and writing run passed all 40 tests after these changes. Run the complete JavaScript suite with the documented test Python configured, the Python scientific tests, the bibliography reference checks, the type check, and the production build before releasing. Scientific engine tests and synthetic identities are different evidence from authenticated browser acceptance or research-methods review.

Revocation prevents future authorized access and blocks affected decision writes; it cannot erase evidence a reviewer already downloaded or guarantee recall of a response already in flight. Stored fingerprints identify the captured inputs and allow verification; a download checksum header is not a fresh proof of the bytes being streamed. Database history is not cryptographically tamper-proof. These boundaries need to remain visible in any assurance or retention claims.

Remaining validation includes two real hosted accounts completing invitation, independent submission, disagreement, adjudication, revocation, evidence download, and archive inspection; cross-browser navigation and interrupted-network behavior; a clean-environment restore drill; realistic large-project and multibyte-text load testing; and domain researchers independently checking extraction interpretation, study grouping, eligibility decisions, effect definitions, and reporting. An exact matching quotation establishes text presence, not that a claim is scientifically supported.
