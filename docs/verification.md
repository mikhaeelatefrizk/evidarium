# Release verification record

Release: **0.2.0**, 14 October 2026. This is a bounded engineering verification record, not scientific validation or a security certification.

## Checks completed

| Check | Result | What it establishes |
|---|---|---|
| JavaScript HTTP core and local runtime suite | **24 passed, 0 skipped** | Ownership isolation; foreign-origin rejection; DOI deduplication; exclusion reasons; multipart integrity; export/import; provider failure handling; bounded retrieval; honest hosted inference rejection; explicit task approval and preserved failure; exact-passage receipt checks; external-search restriction |
| Python unit suite | **9 passed** | Hand-computed CSV result; actual text extraction; unknown-engine and row-limit errors; SSE parser; valid signed ID tokens; issuer/audience/expiry/nonce rejection; plaintext credential-store rejection |
| Real worker subprocess | **Passed**, included in the 24 checks above | Production JSON-lines protocol calculates the mean 4 and sample SD 2 for values 2, 4, 6, returning execution provenance |
| TypeScript | **Passed** | Application type compilation, not runtime correctness |
| Local Vite build | **Passed** | Production frontend can be bundled |

The observed test environment used Node.js 24.19 and Python 3.12.14 on Linux. The application targets Node.js 22.13+ and Python 3.11+, but minimum-version and cross-platform testing remain outstanding. Tests use temporary databases and files. Model credentials and paid calls are not used.

## Added verification in 0.2

Eleven new tests cover JATS text/identity/license extraction, malformed and external-entity XML rejection, bounded responses, actual provider-field mapping, original-byte preservation, idempotent import, identifier mismatch, project isolation, retrieval beyond 2,000 turns, late-text retrieval, index updates/deletes/backfill, citation access states, message pagination/full export, and a controlled local model-completion citation audit. The controlled model test is not live model inference.

A live Europe PMC metadata → XML → extraction → indexed retrieval check passed for `PMC3812051`: 18,297 extracted characters and five matching passages for “version control.” See [release record](release-0.2.md). This ran in the development environment, not through a production browser.

A cleanly extracted local ZIP also passed runtime-import, migration, and bootstrap checks without using the development checkout’s Node dependencies. Bundled license notices were verified.

## Publication gates

The Sites publication workflow runs the supported hosted build, commits/pushes the exact source state, packages its deployment archive, then saves and deploys that version. A successful production deployment is reported separately by the hosting service. Local release ZIPs include prebuilt local UI assets; checksums are published at `/downloads/checksums.json`.

## Explicitly not verified end to end

- A real account completing local ChatGPT OAuth, operating-system credential persistence, refresh/revocation, model catalog retrieval, and streamed inference. JWT tests cover validation logic, not provider acceptance or eligible-account availability.
- Hosted sign-in and data operations through a supported browser. Browser QA was unavailable in this development environment; it was not replaced by an unsupported test route.
- Actual PubMed/Crossref requests from the production deployment. Tests use controlled provider responses; exploratory discovery is not a comprehensive systematic search.
- Every supported PDF/DOCX/XLSX variant, scanned documents, multilingual layouts, damaged files, or adversarial documents.
- Docker execution, Windows/macOS launchers, Linux desktop keyring integration, R/metafor, ASReview, PySR/Julia, INDRA, Docling, PaperQA2/Ollama, OpenScholar/GPU, and Biomni. Their adapters and installation contracts are supplied, but no scientific success is claimed merely because code exists.
- Load/concurrency, accessibility audits, penetration testing, independent reproducibility reviews, or any comparison establishing superiority over competing products.

## Reproduce the checks

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r companion/requirements.txt
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
EVIDARIUM_TEST_PYTHON="$PWD/.venv/bin/python" node --test tests/*.test.mjs
corepack pnpm install --frozen-lockfile
corepack pnpm exec tsc --noEmit
corepack pnpm build:local
```

Omitting `EVIDARIUM_TEST_PYTHON` deliberately skips the real subprocess test. A passing test count must disclose any skips. Optional scientific engines need independent fixtures, upstream-version checks, and domain review before their results are relied on.
