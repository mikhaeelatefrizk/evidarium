# Evidarium 0.5 — references, writing and recoverable uploads

14 October 2026. This release adds working research workflows to both the hosted website and the standalone edition. Hosted ChatGPT plan inference remains disabled pending provider enrollment and implementation. No AI responses or scientific results are simulated.

## What changed

Open **Writing & references** in a signed-in project:

- **Reference library:** upload RIS or CSL JSON, review the parsed records and duplicates, then import. Parsing is offline: identifiers and embedded URLs never trigger requests. Existing records keep their metadata and decisions. A per-project write lock prevents concurrent source imports from duplicating records; interrupted locks expire after five minutes. Atomic bibliography imports retain the input SHA-256, actual counts and an audit entry.
- **Reference exports:** CSL JSON, RIS and BibTeX. Structured authors, publication dates, journal, volume, issue, pages, publisher and other documented citation fields are retained. Legacy display-only author strings stay literal: the app does not invent a name split. Unmapped import fields are reported. Original attachments, collections and reference-manager tags are not transferred. RIS dialects vary; malformed records fail instead of being silently skipped. The CSL subset and mapping are implemented in `lib/references.mjs`, informed by [Zotero's format documentation](https://www.zotero.org/support/dev/data_formats).
- **Manuscripts:** create a draft or chapter, insert references from saved sources, save revisions, inspect earlier versions, restore by saving a new version, and permanently delete a manuscript/history when requested. A stale revision receives HTTP 409 rather than overwriting a newer save. Drafts are searchable alongside project evidence. Edits are manual; no generated or validated science is implied.
- **Citation preview and exports:** source tokens become numbered citations and a bibliography, with warnings for missing citations and excluded records. HTML preview escapes input and is placed in a sandboxed frame. Saved HTML has a restrictive content security policy and a print layout; Markdown and source JSON are also downloadable. Formatting is basic numbered bibliography, not a journal-certified CSL style, Word citation field or full thesis/LaTeX environment. File citations remain literal and generate a warning.
- **Screening ledger:** the last recorded decision at each stage, exclusion reasons, recorded searches, imports and CSV/JSON exports. Earlier stage decisions remain visible after a record advances. Counts concern records, not unique studies, and are not additive PRISMA flow counts. Missing search history and study linkage are not invented.
- **Upload recovery:** interrupted uploads remain in Files. Choose **Resume with original file**, reselect the same file, and the client verifies all previously reserved part hashes before sending missing parts. It does not persist file handles or copy files into browser storage. Changed bytes are rejected. Concurrent distinct parts no longer overwrite the manifest. Completing an already stored upload is idempotent; an object completed before a database interruption can be recovered on retry. An interrupted in-flight part has a two-minute lease before retry.

## Data preservation and boundaries

Migration `0006_research_writing.sql` adds source metadata, manuscripts, revisions, reference locks and durable upload parts. The migration is schema-only. When an owner next inspects or resumes an unfinished upload, bounded recovery copies its old manifest without changing stored part hashes. Source metadata and current manuscript contents are included in project exports; import creates new local IDs, remaps source citations and labels the event as external. Imported manuscript revision history is not reconstructed. Original files remain separate.

Limits: 1 MiB / 200 records per bibliography import; 20 manuscripts per project; 200,000 characters per manuscript; latest 50 saved revisions retained. Saves are explicit. The UI warns before abandoning unsaved drafts and offers a current-text download. Project JSON import still has its documented size/collection bounds; individual manuscript exports remain available. Other 0.4 upload/extraction/analysis limits remain unchanged.

## Actual validation

- **59 JavaScript checks passed with zero skips**, using the configured real Python worker. Sixteen new checks cover bibliography parsing, malformed inputs, independent field expectations, explicit import preview/commit, duplicate and concurrent import handling, draft storage/conflicts/history/deletion, citation escaping and warnings, project interchange, screening-stage history, resumed multipart data integrity, interrupted completion recovery, and migration of old upload manifests.
- TypeScript checking and the production local frontend build passed.
- [Independent bibliography reader report](validation/bibliography-0.5.json): three actual exported fixtures were parsed by **rispy 0.9.0** and **bibtexparser 1.4.3**, checking expected authors, titles, dates, DOI and entry types. These are independent parsers, not Evidarium's own import code. They do not establish complete format conformance or a live Zotero/EndNote walkthrough.
- The cross-platform installer check now includes actual HTTP reference preview/import, draft creation/save, numbered citation preview and screening-ledger retrieval, in addition to launching and serving the application. The first Windows run exposed a test-harness Unicode decoding error; the independent-reader subprocess now explicitly decodes UTF-8. Final run results are recorded below when available; earlier CI is not represented as evidence for the final source.

Reproduce with the documented base environment, plus test-only `rispy==0.9.0` and `bibtexparser==1.4.3`:

```sh
EVIDARIUM_TEST_PYTHON=/path/to/test/python node --test tests/*.test.mjs
python scripts/verify-bibliography.py
pnpm exec tsc --noEmit
pnpm build:local
python scripts/verify-install.py
```

## Still blocked or unfinished

OpenAI's [official hosted-access guidance](https://developers.openai.com/siwc/token-sharing-open-source) still directs remotely hosted apps to its interest form. [The prepared enrollment brief](hosted-inference-request.md) is not submitted. Hosted inference, a real account token lifecycle and an end-to-end live cited conversation remain unverified. No API billing substitution was added.

The Sites workflow requires the supported `control-browser` capability for managed browser QA; it was unavailable. No full browser, visual or accessibility pass is claimed. Other remaining work includes specialist engines hosted end to end, OCR/complex document interpretation, comprehensive evidence appraisal, researcher validation, institutional concurrency/load and security assessment, managed compute infrastructure, collaboration, full thesis tooling and submission workflows. This is a working increment, not completion of the universal research-platform promise.
