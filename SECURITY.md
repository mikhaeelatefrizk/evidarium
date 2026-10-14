# Security and privacy

This early release has not undergone an independent penetration test or institutional compliance assessment. Do not infer certification from automated unit tests.

## Hosted edition

ChatGPT identity is obtained by the server through the Sites identity integration. Project owners are assigned server-side. All child-record operations recheck parent ownership. Unknown/inaccessible records return not found. Cross-origin writes are rejected. SQL values are bound parameters, not interpolated user input.

Project metadata is stored in the deployment's D1 database; original files in R2. The app uses no analytics SDK. Hosting operators/platform infrastructure necessarily process hosted data. The application does not claim end-to-end encryption, a zero-retention agreement, an institutional DPA, or operator-inaccessible storage.

Search queries go to the selected public literature provider. Disabling external searches in Project brief blocks both manual and assistant-initiated search endpoints. This does not recall previously sent queries or disable ChatGPT inference in the local app. Do not include confidential details in an external query unless you intend to disclose them.

## Local edition

Research records and originals remain in the selected local data directory. When you chat, selected project text and history are sent to OpenAI. Optional specialist tools may contact their configured local model servers or download resources as documented. “Local storage” does not mean “no data ever leaves the machine.” Provider retention and account controls remain applicable; `store:false` is not a blanket zero-retention guarantee.

The HTTP listener binds only to `127.0.0.1`, validates Host/Origin, and has no cross-origin bridge for the hosted site. It is intended for one trusted OS user. Other programs running with that user's privileges can access that user's data. Disk encryption and OS account access are the user's environment controls.

OpenAI OAuth uses PKCE, a fresh state and nonce, OIDC discovery, signed ID-token verification, issuer/audience/expiry checks, account consistency, and scope validation. Tokens live in the operating-system keyring. Refresh operations are serialized across processes with a file lock and replace rotated credentials atomically at the keyring-record level. No access/refresh token is emitted to the browser, source repository, or logs. Authorization URLs containing a retained ID-token hint are not returned to the UI.

One registration per data directory is supported. Tokens are not transferred in project exports. Disconnect stops future use, attempts renewable-session revocation, and deletes local credentials. If revocation fails, the UI must tell the user to review ChatGPT's connected-app settings.

## Computation

User/model-generated Python and Biomni code is executed only inside the optional constrained Docker workers. Trusted adapters (extraction, CSV, R/metafor, ASReview, PySR, INDRA, PaperQA, OpenScholar) execute installed third-party code with the local process's privileges and are not sandboxed by the container policy. Install only packages/environments you trust. Approval is per task, not a claim that every installed library is safe.

Task parameters are immutable after proposal; approved uploaded inputs are fingerprinted and snapshotted. Results and errors are separate states. Audit records are append-only by application convention, not cryptographically tamper-proof and not protected from the local owner or a database administrator.

## Render and file boundaries

Model output is rendered with React, never raw model HTML. Stored external source links allow HTTP(S) only. Originals are downloaded as attachments/octet-stream. Upload filenames are not used as storage keys. The app does not extract archives, run document macros, fetch arbitrary submitted URLs, or execute user-supplied code in the hosted Worker. Bounded native analysis runs trusted application code after approval.

File-format parsers may have their own vulnerabilities. Uploaded files are not antivirus-scanned by this code. Browser download safety, OS protection, patched dependencies, and source trust still matter.

## Reporting and maintenance

For a public deployment, the owner should configure a private security-reporting channel in the repository before inviting sensitive research use. Do not post credentials, private documents, or an exploitable vulnerability in a public issue. This source does not invent a support address or claim a staffed security team exists.

Review dependency advisories and optional runtime versions before deployment. When changing authorization, uploads, ownership checks, tool permissions, or worker isolation, run the focused tests and perform appropriate integration testing. Do not replace failed security checks with permissive fallbacks.

## Open-access imports and search indexes

Version 0.2 fetches article metadata and XML only from the fixed Europe PMC API origin, with redirects rejected, response/input bounds, strict parsing, and identifier checks. The parser does not resolve external entities. Original XML is stored privately as an attachment. Public article access does not imply unrestricted redistribution.

FTS5 indexes derived research text and therefore have the same confidentiality requirements as the project database. Search and record retrieval authorize the owning project before querying. Deletion/update triggers remove stale index text. Citation reports check reference existence and run-specific access; they are not a fact-checking or prompt-injection defense.
