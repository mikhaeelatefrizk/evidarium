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

## Independent screening (v0.7)

These routes require hosted, separately authenticated accounts. The local edition returns 409 because it has only one identity. Reviewer membership grants only the assigned screening snapshots, decisions and originals below; ordinary project, source, file, review, task and export APIs remain owner-only. Writes reject cross-origin requests. Errors use the usual `{error}` shape; 409 requires reloading current state rather than overwriting it.

`P` below means `/api/screening/projects/:project`. Member identities and invitation email addresses are visible only to the owner through team management.

| Method and route | Contract |
|---|---|
| `GET /api/screening/shared` | `{projects:[{id,title,role:"owner"|"reviewer"}],local:false}` |
| `POST /api/screening/invitations/accept` | `{token}` → `{project:{id,title},role:"reviewer"}`. Must match the signed-in email. |
| `GET P/team` | Owner: `{project,owner:{userId,displayName,email},members:[{userId,email,displayName,status,revision}],invitations:[{id,email,status,revision,expires,created}]}`. |
| `POST P/invitations` | Owner: `{email}` → `{id,email,expires,revision,token,notice}`. Token shown only here; copy the link manually. No email is sent. |
| `POST P/invitations/:id/cancel` | Owner: `{revision}`. |
| `POST P/members/:userId/revoke` | Owner: `{revision}`. Revocation preserves records and invalidates existing assignment generations. Rejoining does not restore old assignments. |
| `GET P/rounds?offset=0` | `{project,isOwner,userId,rounds,hasMore,nextOffset}`; 25 summaries per page. Summary `snapshot` contains only `source.title` and `summary:true`; fetch detail before making a judgment. Reload after changes because this browsing list is ordered newest first. |
| `POST P/rounds` | Owner: `{sourceId,stage:"title_abstract"|"full_text",reviewerIds:[id,id],reason}` → complete round, status 201. Two distinct active identities; owner may be one reviewer. Saved eligibility criteria are required. |
| `GET P/rounds/:id` | Owner or assigned active reviewer: complete round below. |
| `PUT P/rounds/:id/decision` | Assigned reviewer: `{decision:"include"|"exclude",reason,revision:0}`. Exclusion needs a reason. Submission is immutable. |
| `POST P/rounds/:id/resolve` | Owner: `{decision,reason,revision}` for a conflict. |
| `POST P/rounds/:id/cancel` | Owner: `{reason,revision}` for an open/conflict round. Final rounds remain final; corrections use a new numbered round. |
| `GET P/rounds/:id/evidence/:fileId` | Original bytes scoped to the exact snapshot/project/report and recorded checksum/size. No access to other project files. |
| `GET P/export?offset=0` | Owner: one archival JSON page, described below. |

A complete round includes `id,sourceId,stage,round,status,revision,created,updated,snapshotHash,snapshot,reviewerIds,ownDecision,decisions,finalDecision,finalReason,resolvedBy,canSubmit,canResolve,canCancel,notice`. Status is `open`, `conflict`, `consensus`, `resolved` or `cancelled`. A decision is `{reviewer,decision,reason,revision,submitted}`; unsubmitted choices/times are null. `decisions` is null until both reviewers submit, even for the owner. The owner can coordinate two other reviewers but cannot submit as either. Revoking either member freezes further submissions for that pair; cancel and create a new assignment.

The immutable `snapshot` contains the saved question, criteria, structured protocol, bibliographic source fields (without legacy screening labels), and linked files with their metadata, SHA-256 and available extracted text. Full-text rounds require a linked completed original with a full-file checksum. The workflow for manually uploaded evidence is **upload → extract text/PDF → link original to report → assign full-text round**. Website extraction limits still apply; a partial extraction is labelled and the original remains available. Snapshots are capped at 1 MiB UTF-8 each and 8 MiB total per project; 5,000 retained rounds are allowed. Detail/actions/export recompute the saved snapshot checksum before proceeding. A matching checksum checks consistency, not scientific correctness or authenticity against a privileged database writer.

Peer decisions remain concealed until both submit. A cancelled round with only one submission retains concealed records internally; an owner export does not reveal another person's pending decision. Current-round choices are concealed, but earlier revealed rounds or prior familiarity may compromise methodological independence. Independent screening is a separate ledger: it does not overwrite legacy owner source decisions, the owner review workspace, or legacy counts.

Invitations expire after 72 hours, contain 256-bit random tokens stored only as hashes, and can be accepted once by the bound email. Limits are 20 retained member identities, 25 pending invitations and 500 retained invitations per project. Revocation cannot retract information already downloaded.

### Archival pages and preservation

The first export returns `{schema,project,exportedAt,archiveVersion,rounds,events,complete,concealedDecisionEvents,pagination:{offset,pageSize:10,totalRounds,hasMore,nextOffset},notice}`. Download every page while `hasMore` is true, passing both `offset=nextOffset` and `version=archiveVersion` for subsequent requests. Rounds use stable ascending insertion order. Team/invitation events are included only on page one; round events accompany their round. Any screening event change during or between pages returns 409: restart at page one. These are version-checked pages, not an atomic full-database backup.

`concealedDecisionEvents` counts redacted peer submission events on that page. `complete:true` is possible only for an unredacted single-page archive. A multi-page archive therefore has `complete:false` on every page, even after all pages are saved; consult pagination and omission counts. No original bytes, invitation tokens or transferable access grants are included, and no archive import endpoint exists. Keep original files separately. The general project interchange export also excludes this independent ledger; it is not a full backup.

## Original/report association and task integrity (v0.7)

Owner-only `GET /api/files/:id/association` returns `{fileId,sourceId:null|string,revision,sha256,status,locked,notice}`. Owner-only `PUT` accepts `{sourceId:null|string,revision,sha256,reason}` and returns the new view. `sourceId:null` explicitly unlinks. Report and file must belong to the same project, the current revision/checksum must match, and the reason must be nonempty and at most 2,000 characters. One original per report is supported. Uploading, completing and deleting files cannot be linked. A full SHA-256 is required; ordinary multipart uploads initially retain per-part hashes, so extract the original first to compute and save its full checksum.

Any retained independent-screening snapshot or review-workspace/revision extraction reference locks the existing association, including a formerly unlinked file. Linking, unlinking or replacing that association must not rewrite historical evidence. The SQL update checks references and current revision atomically with its audit event; concurrent changes return 409. Review saves also recheck the file/project/report association, checksum, revision and state at commit, so a concurrent relink/deletion cannot silently attach stale evidence.

Both hosted and local task preparation/approval refuse unfinished or deleting originals. Extraction completion atomically saves the text, input fingerprint, task result and completion receipts only while the input record is still eligible and unchanged and the task is running. Cancellation or deletion cannot be undone by a late worker; a changed/missing input produces a failed task without a completed result. Deletion tombstones remain retryable after uncertain storage failure.
