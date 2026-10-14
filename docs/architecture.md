# Architecture and trust boundaries

## Code map

| Path | Responsibility |
|---|---|
| `app/workspace.tsx` | Shared chat, literature, files, screening, receipts, notes, activity, and connection UI. |
| `app/api/[...path]/route.ts` | Hosted request adapter; retrieves verified ChatGPT identity and storage bindings. |
| `lib/core.mjs` | Shared research API, ownership checks, literature normalization, multipart uploads, receipt matching, interchange. |
| `db/schema.ts`, `drizzle/` | Versioned SQLite-compatible schema and migrations. |
| `companion/server.mjs` | Loopback HTTP host, task approval/execution, worker lifecycle, and model tool dispatch. |
| `companion/storage.mjs` | D1-compatible SQLite adapter and R2-compatible filesystem upload adapter. |
| `companion/context.mjs` | Bounded recent history and database-backed retrieval of evidence and earlier records. |
| `companion/evidarium_agent/auth.py` | Local OAuth and credential storage. |
| `companion/evidarium_agent/agent.py` | Streaming Responses client and limited research tools. |
| `companion/evidarium_agent/tools.py` | Trusted science adapters and isolated custom-code execution. |
| `companion/docker/` | Optional execution image recipes. |
| `scripts/package-local.py` | Builds source/local archives without credentials, data, or repository metadata; local ZIPs include the pinned XML-reader runtime dependencies. |

## Data model

Every project has a server-controlled owner. Sources, files, messages, tasks, notes, receipts, and audit events refer to their project. Hosted reads/writes check the project owner before exposing child data. IDs are opaque UUIDs; knowledge of an ID is not authorization. Database indexes cover owner/project and timestamps.

A source is a bibliographic record. Deduplication uses a normalized DOI when supplied, otherwise a normalized title. It does not merge different reports of one underlying study. Current stage decisions are stored on the source; previous decisions, criteria, and reviewer identity remain in audit events.

A file initially has `uploading` state. Completion requires every part at the expected length and a matching SHA-256 supplied and independently recomputed for that part. This protects transfer integrity, not file safety or scientific validity. The local analysis path computes a whole-file SHA-256, snapshots the approved input, and verifies the original has not changed since task preparation. Manual cloud uploads record part-level integrity. Imported open-access XML additionally records a whole-object SHA-256.

## Evidence receipts

The source must belong to the current project. An abstract receipt searches only the stored abstract. A file receipt searches one named extracted location. The quotation must appear exactly; semantic similarity is not accepted as a quote match. The receipt stores the quotation, match offsets, time, input fingerprint where available, the proposed relationship, and a separate review state.

An exact-text check says nothing about study quality, causality, external validity, or whether the passage actually entails the claim. These remain research judgments. Imported receipts are explicitly external and unreviewed, with no claim that their passage was rechecked.

## Model loop

The worker obtains the user's account-specific model catalog, verifies the selected slug, and calls `https://api.openai.com/v1/responses` with an OAuth bearer, `store:false`, `stream:true`, and explicit input history. The request is made by the standalone local application, never by the hosted server.

Context includes the project question/criteria, a file inventory, at most 24 recent turns bounded to 48,000 characters, and up to 12 FTS5 BM25 evidence matches. The model can search more project evidence, run exploratory literature retrieval, prepare a task, or record a quoted claim. It cannot approve its own task or screening/claim-review decision. All tool outputs remain untrusted data.

Streaming deltas are periodically saved. Only the provider's completed event marks success. Failure, cancellation, missing completion, and loop-budget exhaustion preserve incomplete text with a non-success status. The worker consumes up to six request rounds; tools use an explicit namespace. No unsupported hosted file-search or Code Interpreter tool is advertised.

## Execution lifecycle

`awaiting_approval → running → completed | failed | cancelled | interrupted`

Preparation snapshots parameters and fingerprints an uploaded input. Approval is a separate user action. The single local analysis slot and compare-and-set state update prevent double approval. Generated Python and Biomni run only in Docker. Trusted package adapters run in the configured local Python/R/Julia environments and can use the privileges of that local account; they are not a universal sandbox.

Outputs retain parameters, input checksum, execution environment/package versions where available, actual output/error, and elapsed time. Docker results also record image identity. Not all optional engine model/data revisions are captured automatically, so provenance is not a complete bitwise reproducibility guarantee.

## Threat and scaling boundaries

The local app is single-user software. It rejects foreign Host/Origin values and cross-site requests, but it does not protect research from other programs already running as the same OS user. Do not expose its port to a network or run it as a shared server.

The hosted app does not fetch arbitrary user URLs, execute submitted code, or accept user-supplied ownership claims. It renders model text as structured React elements. Downloaded originals use attachment/octet-stream headers. External links are restricted to HTTP(S) where stored.

Conversation reads are paginated at 100 messages. Other large project reads still materialize collections; the UI shows the most recent 300 audit events, while JSON export includes the full audit history. The release is designed for early individual use and needs broader pagination, durable job orchestration, backup automation, and load testing before institutional scale. Hosted quotas are application controls, not a purchased infrastructure capacity guarantee.

## Article import, retrieval, and citation access

`lib/papers.mjs` handles bounded Europe PMC/JATS ingestion. `lib/retrieval.mjs` and migration `0005` implement transactional index backfill, triggers, and project-scoped FTS5 search. `lib/citations.mjs` checks response references against project records and the evidence delivered during that run. See [release 0.2](release-0.2.md) for the exact scope, limits, and live-provider result.


## Execution verification and isolation (0.3)

Optional package environments are selected from a local, user-owned `engine-runtimes.json`; project uploads/imports never configure interpreters. ASReview, INDRA, PySR and Docling can be installed separately. Missing configured interpreters fail before task state changes to running. Docling selection applies only to extraction tasks explicitly requesting that engine.

The shared `lib/live-check.mjs` runner is used by both the local UI and CLI. It checks that the runtime is local and the requested model appears in the real account catalog before creating a verification project. It approves only two fixed fixture computations, waits for completed results, performs two cited chat turns, and verifies export/audit persistence. It records failures and never fabricates a passing result. The hosted edition refuses this check. The developer verification used a controlled test model; real account completion remains outstanding.

Runtime launchers probe SQLite FTS5 before opening user data. CI checks actual Windows/macOS/Linux installation and HTTP operation, separately from browser or OAuth validation. See the versioned release record for checks and their limits.

## Website execution (0.4)

`lib/web-tasks.mjs` handles owned, approved native tasks in D1/R2 or local SQLite/files. `lib/web-science.mjs` implements strict CSV parsing, descriptive statistics and an intercept-only REML fit. jStat supplies distribution functions. `lib/web-pdf.mjs` reads PDF text sequentially using pinned unpdf/PDF.js with evaluation and remote resource loading disabled. No custom code, AI token or external analysis server is involved. Input bytes are held as an immutable snapshot for that request and hashed before approval; mutation after preparation rejects execution.

Final results, extraction updates and completion records use a database batch. Compare-and-set transitions prevent double approval and discard a result if cancellation won. Platform termination can still leave an interrupted request recorded as running; this release has no durable hosted job queue or automatic retries. Dataset bounds are distinct from the larger original-file storage bounds. PDF page/character limits and missing text produce explicit partial coverage.

The public reference route runs only pinned public fixtures. It demonstrates actual deployed computation, not authenticated browser behavior or private storage validation.
