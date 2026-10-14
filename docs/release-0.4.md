# Evidarium 0.4 — native analysis on the website

14 October 2026. This release removes the local-installation requirement for four bounded research operations. It does not complete hosted AI chat or the original universal research-platform promise.

## What runs on the website

| Operation | Actual implementation | Bounds |
|---|---|---|
| CSV statistics | Strict CSV parser, per-column finite-number counts, missing/nonnumeric counts, mean, sample SD, median, minimum and maximum | 1 MiB; 50,000 rows; 100 columns; 250,000 cells |
| Meta-analysis | Native JavaScript intercept-only REML; unmodified Knapp–Hartung t inference; jStat 1.9.6 distributions | 3–200 independent comparable effects; positive sampling variances; no moderators or dependent effects |
| UTF-8 extraction | Actual UTF-8 decoding, preserving markup and page-independent text | Listed text extensions; 1 MiB input; 200,000 characters |
| PDF text | unpdf 1.8.1 / its bundled Mozilla PDF.js; sequential page text streams | 5 MiB; first 50 pages; 200,000 characters; time-budget checks between parsing operations |

These operations require no local app, Python, R, model account, or API key. PDF reading has no OCR, image interpretation, table reconstruction or guaranteed reading order. Empty pages and exceeded bounds produce explicit partial coverage. A byte-size bound is not a guarantee against every pathological PDF; platform termination remains possible.

## Reviewable execution

Preparation validates the engine/parameters, ownership, completed upload, size and whole-file SHA-256. The user reviews the proposal and approves it. Approval checks the engine version and original bytes again. A conditional state transition prevents two requests from running the same proposal. Calculations use the bytes read for that request, never a user-provided executable or remote URL.

Completion batches the result, extracted file text where applicable, and completion audit/message records. Cancellation that wins before completion prevents the completed result from being retained. Failed parsing/calculation records a failure instead of invented results. An infrastructure interruption can leave a running record: cancel it after inspecting the state and prepare a new proposal. There is no durable hosted job queue or automatic retry in this release.

Activity → Inspect result & export shows the actual result, warnings and fingerprint. Statistics and meta-analysis have readable tables and CSV/JSON downloads. Meta-analysis includes an SVG forest plot with study normal intervals and a pooled Knapp–Hartung interval. Outputs stay on the supplied effect scale; log ratios are not silently exponentiated. The CSV export protects string labels against spreadsheet formula interpretation while retaining numeric values as numbers.

## Numerical validation

`scripts/verify-web-science.py` executes the JavaScript implementation and a separate R/metafor process. Twenty cases passed: the published 13-study BCG example; low/zero heterogeneity and identical effects; fixed-seed cases with 3, 5, 13, 50 and 200 studies; small-scale and shifted effects. R's stopping threshold is scaled to each case's sampling variance, avoiding a misleading absolute convergence tolerance for tiny variances.

Reference runtime: R 4.5.3, metafor 5.0.1. Tolerance: `1e-8 × dimensional scale + 2e-6 × abs(reference)`. Maximum observed differences were approximately 4.75e-10 for the pooled estimate, 9.68e-9 for confidence bounds, 5.41e-8 for tau-squared, 1.50e-6 percentage points for I-squared and 5.24e-10 for p-values. A zero-standard-error test has no meaningful p-value and is reported as null; that degenerate p-value comparison is explicitly excluded.

The full inputs, R outputs, JavaScript outputs and errors are in `tests/fixtures/web-meta-reference.json`. The [metafor reference](https://wviechtb.github.io/metafor/reference/rma.uni.html) describes the reference model and inference. This is numerical agreement on declared cases, not independent researcher review, an exhaustive solver proof, or a scientific recommendation.

## Engineering validation

The local run passed **43 JavaScript checks with zero skips**, including real PDF parsing and a real Python worker. New checks cover malformed CSV rejection, numeric/resource bounds, PDF text/page coverage, empty and corrupt PDFs, reference fits, hosted approval and duplicate-approval races, foreign-owner/cross-origin denial, changed inputs, stale engine versions, failure records, extraction-to-receipt retrieval and export. TypeScript checking passed. The existing 13 Python checks and cross-platform installer/engine tests remain in CI.

All four jobs in [CI run 38557900671](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/38557900671) passed for code commit `4af4bc58bb1edbafb25f3e3bae89eebe354bfefd`: Windows, macOS and Linux core checks/build/actual launcher operation, plus real scientific engines, a fresh R/metafor comparison and Docker execution. The 13 Python checks passed on each platform. A clean extracted v0.4 local ZIP also started and passed its actual CSV/meta-analysis/PDF reference checks.

The deployed server returned **HTTP 200 and three passing reference checks** at `2026-10-14T11:42:29.299Z`, using Sites' documented service authorization. An unauthenticated scripted request was rejected by the hosting access layer before reaching application code; no visitor identity was fabricated. [The saved actual report](validation/hosted-0.4.json) includes the computed values and PDF.js 6.1.200 parser identity. This does not establish anonymous browser access or an authenticated private-project walkthrough. Cloudflare clock granularity can report zero elapsed milliseconds; this field is not a latency benchmark.

The public readonly `/api/science-check` endpoint runs three fixed reference operations on the deployed server: known CSV values, the BCG fit, and a generated two-page PDF. It takes no private input and accesses no project data. The in-app “Check the website calculations” control downloads its actual report. A passing report does not verify authenticated browser flows, private hosted storage, ChatGPT authorization or scientific suitability of a user's dataset.

Reproduce the independent numerical run with R/metafor/jsonlite installed:

```bash
python scripts/verify-web-science.py --output web-reference.json
```

The local download bundles jStat and unpdf alongside its XML reader, including their license files. Launchers still require Node.js/Python for the optional local edition; website-native operations do not.

## Still incomplete

- Hosted subscription AI remains disabled pending the appropriate OpenAI enrollment/approval and integration. The [owner review brief](hosted-inference-request.md) is prepared but not submitted.
- Real desktop ChatGPT sign-in/inference, refresh and revocation have not been developer-verified against an actual consenting account.
- PaperQA2, OpenScholar and Biomni remain experimental; full high-quality model/data runs are not established.
- Supported browser control was unavailable, so no complete browser, keyboard, screen-reader or visual QA pass is claimed.
- No independent researcher assessment, institutional load certification, universal file support, remote hardware rental, full thesis editor, collaboration or journal submission is claimed.

The [0.3 record](release-0.3.md) retains prior actual scientific-engine, platform and scale checks. New hosted execution does not change those checks into broader guarantees.
