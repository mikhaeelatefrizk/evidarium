# Release 0.7 — independent reviewers and research-record integrity

Development release, 31 October 2026. This release completes a bounded independent-screening workflow. It does not establish that the entire paid research product, scientific interpretation or hosted disaster recovery is validated. AI provider, subscription and pricing decisions are deliberately deferred; a separate customer ChatGPT subscription is not an accepted product requirement.

## Working workflow

The owner invites a reviewer by their verified sign-in email. Invitations are one-use, expire, store only token hashes and can be cancelled. Two distinct active accounts receive the same immutable criteria and evidence snapshot. Each submits a locked decision with a reason. Peer choices remain concealed until both submit, including in archives. Agreement records an outcome; a disagreement requires an owner resolution with a reason, preserving both submissions. This resolution is explicitly not a third independent assessment.

Arabic and English forms support review, team management, full-text evidence, corrections and archives. Corrections create a new numbered round and retain the old one; repeating a round cannot undo earlier exposure to decisions. Revoked reviewers lose access and rejoining does not revive old assignments. Already downloaded material cannot be recalled.

For manually uploaded full text, upload the original, run text/PDF extraction to calculate and verify its whole-file checksum, link it to the correct saved report, then assign it. Association changes compare revisions and preserve retained screening/extraction references. Extracted coverage warnings remain visible. Original downloads require assignment access and matching saved identity/checksum metadata. The local edition has one user identity and therefore refuses to simulate independent reviewers.

Independent outcomes remain separate from legacy single-owner screening labels and counts. A complete reconciled PRISMA flow is still unfinished. Full-text evidence currently supports one original per report. Screening limits include 5,000 rounds, 20 active members, 1 MiB UTF-8 per snapshot and 8 MiB total snapshot data per project. Lists are paginated. Archive pages contain ten rounds and must share an unchanged archive version; incomplete peer decisions stay concealed.

## Integrity corrections

Project import now validates before mutation and commits atomically, including correct citation remapping, duplicate-source/study mapping checks, protocol conflict detection and byte limits. Protocol changes, legacy decisions and claim review commit with their audit event or roll back. File deletion retains a retryable unavailable marker after ambiguous storage failures. Extraction completion, original state, task result, audit and message commit together; cancelled work or deleting/changed files cannot be revived by a late worker.

The detailed findings, regression evidence, export contents and operating limits are in [workflow audit](workflow-audit-0.7.md). Schema migrations `0008` and `0009` add reviewer tables and file-association revisions without deleting existing records.

## Verification

The complete JavaScript suite passed **125/125**, with no skips; Python passed **13/13**. Three bibliography fixtures passed independent RIS/BibTeX readers and CSL checks. TypeScript, local production build, hosted production build and the actual Windows installer/HTTP workflow passed. [The current release's CI run](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/41216480867) passed all four jobs: Windows, macOS, Linux and scientific engines. Each runtime job passed all 125 JavaScript checks with no skips, the Python and bibliography checks, the local UI build and the real installer/HTTP workflow. The scientific job passed the approved engine workflows, independent numerical reference and Docker boundary checks. The [machine-readable record](validation/ci-0.7.json) identifies the exact tested commit; this documentation update does not change tested application code.

Browser testing used the built application and actual database/API with explicitly synthetic authenticated identities. It covered invitation acceptance, concealed decisions, conflicting submissions, preserved owner resolution, original/report association and full-text assignment/read access in Arabic and English. Browser download automation stalled; this is not counted as a successful browser download. Separate real HTTP checks verify exact original bytes, checksum, unassigned denial, archive completeness and revocation. This does not establish real hosted OAuth acceptance.

Remaining requirements include two real hosted accounts completing the workflow, cross-browser/mobile/accessibility testing, interrupted-network testing, a rehearsed hosted database-plus-originals restore, realistic load tests, independent security review and qualified methodological review with Arabic-speaking researchers. Project JSON is interchange, not a complete backup: original bytes, full revision histories and the independent ledger require separate retention. Hosted AI remains disabled.
