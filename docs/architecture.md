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
| `companion/context.mjs` | Bounded recent history and term-overlap retrieval of evidence and earlier records. |
| `companion/evidarium_agent/auth.py` | Local OAuth and credential storage. |
| `companion/evidarium_agent/agent.py` | Streaming Responses client and limited research tools. |
| `companion/evidarium_agent/tools.py` | Trusted science adapters and isolated custom-code execution. |
| `companion/docker/` | Optional execution image recipes. |
| `scripts/package-local.py` | Builds source/local archives without credentials, data, dependencies, or repository metadata. |

## Data model

Every project has a server-controlled owner. Sources, files, messages, tasks, notes, receipts, and audit events refer to their project. Hosted reads/writes check the project owner before exposing child data. IDs are opaque UUIDs; knowledge of an ID is not authorization. Database indexes cover owner/project and timestamps.

A source is a bibliographic record. Deduplication uses a normalized DOI when supplied, otherwise a normalized title. It does not merge different reports of one underlying study. Current stage decisions are stored on the source; previous decisions, criteria, and reviewer identity remain in audit events.

A file initially has `uploading` state. Completion requires every part at the expected length and a matching SHA-256 supplied and independently recomputed for that part. This protects transfer integrity, not file safety or scientific validity. The local analysis path computes a whole-file SHA-256, snapshots the approved input, and verifies the original has not changed since task preparation. Cloud storage currently records part-level integrity, not a whole-object SHA-256.

## Evidence receipts

The source must belong to the current project. An abstract receipt searches only the stored abstract. A file receipt searches one named extracted location. The quotation must appear exactly; semantic similarity is not accepted as a quote match. The receipt stores the quotation, match offsets, time, input fingerprint where available, the proposed relationship, and a separate review state.

An exact-text check says nothing about study quality, causality, external validity, or whether the passage actually entails the claim. These remain research judgments. Imported receipts are explicitly external and unreviewed, with no claim that their passage was rechecked.

## Model loop

The worker obtains the user's account-specific model catalog, verifies the selected slug, and calls `https://api.openai.com/v1/responses` with an OAuth bearer, `store:false`, `stream:true`, and explicit input history. The request is made by the standalone local application, never by the hosted server.

Context includes the project question/criteria, a file inventory, at most 24 recent turns bounded to 48,000 characters, and up to 12 literal-term evidence matches. The model can search more project evidence, run exploratory literature retrieval, prepare a task, or record a quoted claim. It cannot approve its own task or screening/claim-review decision. All tool outputs remain untrusted data.

Streaming deltas are periodically saved. Only the provider's completed event marks success. Failure, cancellation, missing completion, and loop-budget exhaustion preserve incomplete text with a non-success status. The worker consumes up to six request rounds; tools use an explicit namespace. No unsupported hosted file-search or Code Interpreter tool is advertised.

## Execution lifecycle

`awaiting_approval → running → completed | failed | cancelled | interrupted`

Preparation snapshots parameters and fingerprints an uploaded input. Approval is a separate user action. The single local analysis slot and compare-and-set state update prevent double approval. Generated Python and Biomni run only in Docker. Trusted package adapters run in the configured local Python/R/Julia environments and can use the privileges of that local account; they are not a universal sandbox.

Outputs retain parameters, input checksum, execution environment/package versions where available, actual output/error, and elapsed time. Docker results also record image identity. Not all optional engine model/data revisions are captured automatically, so provenance is not a complete bitwise reproducibility guarantee.

## Threat and scaling boundaries

The local app is single-user software. It rejects foreign Host/Origin values and cross-site requests, but it does not protect research from other programs already running as the same OS user. Do not expose its port to a network or run it as a shared server.

The hosted app does not fetch arbitrary user URLs, execute submitted code, or accept user-supplied ownership claims. It renders model text as structured React elements. Downloaded originals use attachment/octet-stream headers. External links are restricted to HTTP(S) where stored.

Large project reads currently materialize collections; the UI shows the most recent 300 audit events, while JSON export includes the full audit history. The release is designed for early individual use and needs pagination, durable job orchestration, backup automation, and load testing before institutional scale. Hosted quotas are application controls, not a purchased infrastructure capacity guarantee.
