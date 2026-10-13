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
