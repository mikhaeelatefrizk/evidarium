# HTTP API

All routes begin with `/api`. JSON errors use `{ "error": "message" }`; no internal stack traces are exposed by the hosted API. Except bootstrap, hosted routes require the verified signed-in identity. The local edition uses the single OS-user workspace identity.

| Method and route | Input / result |
|---|---|
| `GET /bootstrap` | Version, identity, edition, storage limits, subscription mode. |
| `GET /projects` | Projects owned by the signed-in user. |
| `POST /projects` | `{title, question?, criteria?}`; creates owned project. |
| `GET /projects/:id` | Project, messages, sources, file metadata, receipts, tasks, notes, latest 300 audit events. |
| `PATCH /projects/:id` | `{title?, question?, criteria?, allow_search?}`; records brief changes. |
| `POST /search` | `{project, query, provider: "pubmed" | "crossref"}`; at most 20 real provider records. |
| `POST /projects/:id/sources` | One source or up to 200; normalizes DOI and deduplicates. |
| `PATCH /sources/:id` | `{decision, stage, reason}`; exclusion reason required. |
| `POST /projects/:id/notes` | `{content}`; saves a note. |
| `POST /projects/:id/claims` | `{statement,quote,stance,source_id}` or `{statement,quote,stance,file_id,location}`; exact-match receipt. |
| `PATCH /claims/:id` | `{status: "accepted" | "rejected" | "unreviewed"}`; human review. |
| `POST /projects/:id/files` | `{name,mime,size}`; begins multipart upload, returns ID/part size. |
| `PUT /files/:id/part?n=1` | Binary part, `X-Part-Sha256` hex digest; checks expected size/digest. |
| `POST /files/:id/complete` | `{}`; verifies complete manifest and finalizes original. |
| `GET /files/:id` | Original attachment, ownership protected. |
| `GET /files/:id/text` | Actual extracted segments/warnings, or explicit unavailable error. |
| `DELETE /files/:id` | Deletes original or aborts incomplete upload; leaves audit record. |
| `GET /projects/:id/export` | `evidarium.project.v1` JSON, including full recorded audit trail. |
| `GET /projects/:id/export?format=csv` | Spreadsheet-safe screening CSV. |
| `POST /projects/:id/import` | Bounded project JSON. Preserves external-origin distinction; originals not imported. |

Local-only routes:

| Method and route | Input / result |
|---|---|
| `GET /ai/status` | Connection status and account-specific model choices; short cache. |
| `POST /ai/login` | Starts official OAuth in system browser. No credential returned. |
| `POST /ai/logout` | Attempts revocation and clears local credentials; may return warning. |
| `POST /chat` | `{project,text,model}`; starts a bounded asynchronous model task. |
| `POST /tasks` | `{project,kind,args}`; prepares an immutable task awaiting approval. |
| `POST /tasks/:id/approve` | Starts a pending task if its input fingerprint still matches. |
| `POST /tasks/:id/cancel` | Cancels a pending/running task and stops its worker. |
| `GET /capabilities` | Dependency presence hints; not end-to-end readiness certification. |

Hosted calls to inference/execution return a clear conflict response explaining the local-edition requirement. The local UI polls project state; this release does not expose a general public task-execution API, cross-origin API token, or remotely accessible worker.

## Added in 0.2

| Method and path | Behavior |
|---|---|
| `POST /api/search` with `provider: "europepmc"` | Search abstracts and open-access metadata, up to 20 results |
| `POST /api/sources/:id/fulltext` | Import the matching open-access Europe PMC XML, or return the existing linked file; ownership and external-request permission checked |
| `GET /api/projects/:id/retrieve?q=term&kind=all&offset=0` | Project-scoped FTS5 search, 20 results per page; kinds: source, file, conversation, note, analysis, claim, all |
| `GET /api/projects/:id/records/:kind/:recordId` | Read a selected record within its authorized project |
| `GET /api/projects/:id/messages?before=message-id` | Previous 100 messages plus continuation cursor |
| `POST /api/projects/:id/check-citations` with `{text}` | Check references against current saved evidence; does not claim that evidence was supplied to a model |

Project reads return the latest 100 messages and `message_page`. Project JSON exports retain all messages. Local chat completion stores `messages.citation_audit`, including the run-specific evidence-access check.

## Website-native analysis (0.4)

`POST /api/tasks` accepts `{project, kind, args}` with `kind` equal to `web_describe_csv`, `web_meta_analysis`, `web_extract_text` or `web_extract_pdf`. All require a completed `args.file_id` in the owned project. Meta-analysis also requires `effect`, `variance`, optional `label`, and `independent_effects_confirmed: true`. Unknown parameters are rejected. Preparation records the whole-file SHA-256 and engine version.

`POST /api/tasks/:id/approve` rechecks ownership, version and bytes, claims the pending task once, executes a bounded native calculation and returns its actual state. `POST /api/tasks/:id/cancel` cancels a pending/running record. Completed output and extraction are committed together with completion audit/message records. Approval is not silently retried. A request interrupted by platform failure may leave a running record; inspect/cancel it and prepare a new proposal.

`GET /api/science-check` is public and readonly: it executes three fixed public reference checks, never accepts a user file, and never reads private project data. It is a deployment diagnostic, not account-flow or scientific validation.


## References, manuscripts and upload recovery (0.5)

All project paths below require the authenticated owner. Unsafe methods retain origin checks.

| Method | Route | Behavior |
|---|---|---|
| POST | `/api/projects/:id/bibliography/preview` | `{format: "ris" or "csl-json", text}` → parsed preview, duplicate counts, SHA-256; no imported sources |
| POST | `/api/projects/:id/bibliography/import` | Same body plus preview `sha256`; serialized atomic import, original decisions retained |
| GET | `/api/projects/:id/bibliography?format=csl-json` | Export; also `ris` or `bibtex` |
| GET | `/api/projects/:id/manuscripts` | Draft summaries |
| POST | `/api/projects/:id/manuscripts` | `{title}` → saved empty draft, revision 1 |
| GET / PUT / DELETE | `/api/projects/:id/manuscripts/:document` | Read; save `{title,content,revision}` with optimistic concurrency; or delete draft and revisions |
| GET | `/api/projects/:id/manuscripts/:document/revisions` | Latest 50 saved revision summaries; append `/:revision` to read one |
| POST | `/api/projects/:id/manuscripts/:document/preview` | `{title,content}` → safe HTML, numbered bibliography, citation warnings; no save |
| GET | `/api/projects/:id/manuscripts/:document/export?format=html` | Saved version export; also `markdown` or `source` |
| GET | `/api/projects/:id/screening-ledger` | Recorded stage decisions, searches and import events; `?format=csv` for stage rows |
| GET | `/api/files/:id/upload-status` | Name, size, state, part size and checked/reserved part hashes; no storage key or upload credential |

A 409 on manuscript save means the supplied revision lost a race; preserve the user's draft before reloading. Imported project manuscripts receive new IDs and revision 1; references are remapped, history is not reconstructed. Multipart completion is idempotent for stored files; an interrupted `completing` state can be retried. In-flight part reservations expire after two minutes, reference import locks after five minutes. No automatic background worker or hosted job queue is implied.
