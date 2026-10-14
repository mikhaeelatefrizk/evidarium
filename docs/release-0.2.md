# Evidarium 0.2 — inspect the evidence, recover the history

Released 14 October 2026. This update improves three research operations; it does not establish scientific superiority or complete the broader product vision.

## Open-access article ingestion

Europe PMC search returns actual abstracts and open-access identifiers. For a saved paper, **Import open-access text** resolves its identifier through Europe PMC, requires the open-access flag, downloads JATS XML from that provider, and checks the returned paper's identifiers. No arbitrary URL fetch or paywall bypass is used. The local model can request this same import through its research tool; the current project permission is rechecked before any remote request.

The original XML remains downloadable. The project stores its whole-file SHA-256, retrieval URL/time, license statement where present, source record, extracted locations, and coverage warnings. Importing the same source twice returns the existing file. Already imported text remains accessible when external search is disabled.

The reader extracts abstract/body paragraphs, headings, and flattened table rows. It does not interpret figure pixels, equation layout, reference-list prose, or supplements. Input is bounded at 6 MiB XML, 128 levels of nesting, 240,000 extracted characters, and 2,000 text blocks. Truncation is disclosed. Malformed XML, unknown external entities, mismatched identifiers, unavailable content, and provider failures are errors, not successful extraction.

A live development-environment test imported **Ten Simple Rules for Reproducible Computational Research**, DOI `10.1371/journal.pcbi.1003285`, Europe PMC `PMC3812051`. It extracted **18,297 characters**, preserved the original fingerprint, and retrieved **five** matching passages for “version control.” This is one live interoperability check, not a broad extraction benchmark or a production-browser test. No third-party article text is bundled with the source release.

## Durable project search

Use **Search this project**, or type `/find terms` in the chat. SQLite/D1 FTS5 ranks matching stored text using BM25. Search covers sources, extracted locations, conversations, notes, completed/imported analysis results, and claims. A record-type filter and paginated matches support inspection of the original stored record.

The earlier 2,000-message retrieval cutoff is removed. Indexes are maintained with database triggers; existing projects are backfilled transactionally on their first search. The search scope is always the authorized project. Streaming output is indexed only once completed or marked partial. Search results are excerpts, and gaps between matches are marked.

The conversation view now initially loads 100 messages and can load earlier pages. JSON export still contains the full conversation. The model's direct recent-history context remains bounded to 24 messages/48,000 characters; indexed retrieval is an additional access path, not unlimited model context. FTS5 is lexical search, not semantic memory. Generic English stop words are omitted; no multilingual stemming or exhaustive-recall claim is made.

## Citation access reports

Completed local model responses receive a reference report for `[S:source-id]` and `[F:file-id, exact location]` citations. Checks distinguish a missing record, missing extracted location, metadata-only access, and evidence not delivered during that model run. Available references remain explicitly subject to interpretation review.

This checks references and access. It does not evaluate whether a passage entails a claim, assess study quality, verify arbitrary web links, or prove an uncited statement. The first 200 citation occurrences are checked, with a visible limit notice. Existing and imported messages are not retroactively labelled checked. The existing exact-quotation evidence receipt remains the separate mechanism for checking text presence and recording human review.

## Upgrade and operational notes

- Back up the local data directory before upgrading. Migrations `0004` and `0005` append fields, the search status table, a rebuildable FTS5 table, and synchronization triggers. Original research records are preserved.
- Local ZIPs now bundle the two small XML-reader dependencies and their license files. The source checkout uses the pinned lockfile. Optional scientific engines are still separate installations.
- FTS indexes consume storage and add write work. No institutional-scale load claim is made. Cloudflare's raw SQL export currently does not support databases containing virtual tables; the application's JSON export and local SQLite backup are separate mechanisms. An infrastructure restore procedure must recreate/rebuild the FTS index as appropriate.
- Hosted subscription inference remains unavailable. Live ChatGPT authorization, broad scientific engine validation, supported browser QA, and cross-platform launcher validation remain outstanding.

## Technical sources

- [Europe PMC REST API](https://europepmc.org/RestfulWebService)
- [Cloudflare D1 SQL/FTS5 support](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Cloudflare D1 import/export limitations](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Saxes XML parser](https://github.com/lddubeau/saxes) — pinned 6.0.0; the upstream repository is archived. It does not fetch DTDs or resolve external entities; the application imposes additional input and nesting bounds.
