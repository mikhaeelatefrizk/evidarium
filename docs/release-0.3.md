# Evidarium 0.3 — execution checks and repaired integrations

14 October 2026. **This release does not complete the original all-in-one research promise.** It closes specific engineering gaps and records the evidence. Hosted subscription AI, live developer-verified OAuth/inference, browser interaction testing and independent scientific review remain open.

## What real execution changed

- ASReview 3.0.8 expects a DataFrame with title/abstract columns. The previous adapter supplied a list and failed. The adapter now uses the actual contract and a fixed classifier seed, retaining all human decisions.
- INDRA can silently skip malformed statements. The adapter now rejects incomplete parses. Node identity incorporates grounding and supplied agent state; identical names no longer merge different entities.
- CSV ingestion rejects duplicate/empty headers and ragged rows rather than silently discarding or misaligning values.
- R/jsonlite retains numerical precision instead of rounding to its default display precision.
- Scientific dependencies are isolated. PySR's filelock constraint conflicts with authorization dependencies, and PySR/INDRA can have incompatible SymPy requirements. The installer registers a separate interpreter only after successful installation.
- Node 22.13 failed on all three CI operating systems because its SQLite lacked FTS5. The supported minimum is now Node **24.19**, with a real FTS5 startup check before migrating user data. A PowerShell smart-apostrophe parsing defect was also fixed.
- OAuth replacements are checked for required scopes, identity, credentials, bearer type and finite positive expiry before persistence. These are validation tests, not proof of a provider-accepted sign-in.

## Executed checks

| Check | Observed result | Scope |
|---|---|---|
| Base suite | 27 JavaScript + 13 Python checks passed; zero skips with the configured test Python | API/storage, authorization validation, actual native file parsing, worker protocol, acceptance runner with a controlled model |
| Three real approved workflows | metafor, ASReview and INDRA passed project API → proposal → approval → worker → stored result/export | No simulated engine outputs |
| BCG meta-analysis | 13 studies; log risk ratio −0.7145323483651012; 95% CI [−1.1084437230000497, −0.32062097373015264] | Matches the published metafor example; not a new clinical recommendation |
| Independent numerical check | Separate SciPy REML objective/t interval agreed within 1e−5; largest checked difference about 6.95e−8 | Independent implementation, not independent researcher review |
| ASReview real data | 3,453 records, 10 fixed seeds, 3,443 unique unreviewed records ranked; decisions unchanged | One ranking, not a recall guarantee |
| PySR known equation | Recovered a form numerically equivalent to y = 2*x + 3; held-out RMSE ~5.63e−8 with 80/20 rows | Synthetic equation recovery |
| PySR measured data | scikit-learn diabetes data, BMI only; 353 training / 89 test rows; RMSE ~64.02 after three iterations | Execution check, not a validated medical predictor |
| Docling | Expected 182 characters of prose/table content from one generated DOCX | Not OCR, scanned PDF or general layout benchmarking |
| Docker | Calculation, read-only root, disabled network, retained CSV and image fingerprint passed in CI | Declared-boundary checks, not a security audit |
| Windows/macOS/Linux | Actual launchers, package installation, built UI assets, project creation/export passed | HTTP installation checks, not browser interaction or desktop consent |
| Larger local project | 20,000 synthetic messages; older passage retrieval; latest view limited to 100 messages | One run: ingest ~709 ms, initial retrieval/index ~257 ms, latest-page API ~45 ms; not concurrency or hosted capacity certification |

PySR 2.7.0 / Julia 1.13.1 completed both fits despite an initialization error from the optional SymbolicRegression PythonCall extension. This remains an environment-compatibility limitation; a clean universal Julia installation is not claimed. PySR/Docling can download several GiB. Engines and model weights are not bundled into the normal download.

Machine-readable results are in [validation](validation/). The cross-platform installation run is [38551401788](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/38551401788), commit `5c5653ed91c7e2e920ceaea235c2908e47fee4c8`. Scientific/Docker checks passed in [38551656487](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/38551656487), commit `7d4fcdd48e31605c0d562f077c857682d3f451a9`. The final account-check code passed all three platform installation jobs in [38553322453](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/38553322453), commit `add728bbbf82c521fcc91a34eb5899dcd8ec9f36`. These identify the code actually run; future commits do not automatically inherit a passing result.

The optional-engine installer also completed a fresh ASReview installation on Linux, then executed the same 3,453-record verification using its registered interpreter. The packaged local ZIP was extracted into a clean directory and successfully initialized the actual v0.3 application and database.

## Reproduce the checks

BCG counts in `tests/fixtures/bcg.csv` come from the [metafor example](https://wviechtb.github.io/metafor/). Log risk ratios/variances are derived from raw counts, not rounded displayed effects. Local versions were R 4.5.3 / metafor 5.0.1.

```bash
python scripts/verify-science.py metafor --output metafor-check.json
python scripts/verify-science.py indra --output indra-check.json
python scripts/verify-science.py pysr --output pysr-check.json
```

Use the interpreter containing each engine; metafor also needs Rscript, metafor and jsonlite. These commands perform actual calculations and fail on assertion errors.

The ASReview fixture is Appenzeller-Herzog_2020, associated with Appenzeller-Herzog et al.'s Wilson disease review, DOI [10.1111/liv.14179](https://doi.org/10.1111/liv.14179). The [dataset record](https://doi.org/10.5281/zenodo.3625931) and [ASReview index](https://raw.githubusercontent.com/asreview/synergy-dataset/master/index_v1.json) identify CC BY 4.0 attribution terms. The [CSV used](https://raw.githubusercontent.com/asreview/systematic-review-datasets/metadata-v1-final/datasets/Appenzeller-Herzog_2020/output/Appenzeller-Herzog_2020.csv) is downloaded separately, not redistributed here. Its SHA-256 is `456f9306b0ce1aee840ac0244f11df3b2a168aa46007a92f5dcf59916d309a69`.

```bash
python scripts/verify-science.py asreview --dataset /path/to/downloaded.csv --output asreview-check.json
```

The first five final-inclusion and first five final-exclusion labels are seeds. Of the 24 remaining final inclusions, 13 appeared in the first 100 ranked records. **Eleven did not.** This does not authorize stopping at 100 or establish independently adjudicated title/abstract labels.

## Real account verification

In the standalone local edition, finish **Continue with ChatGPT**, select a model, and expand **Verify this connected workflow**. Review and authorize the two fixture computations and two chat turns (up to twelve inference requests). The app creates a separate project, uploads known text/CSV bytes, requires completed results, checks two completed responses with available passage citations, and verifies retained audit/export records. Download the actual report or inspect the project.

The equivalent CLI is `scripts/verify-live.mjs`. Neither path reads/exports OAuth tokens. The runner passed with real storage and calculations plus a controlled test model. **A real account has not completed this check in developer verification.** Resolving citations do not guarantee correct interpretation.

## Remaining blockers

1. **Hosted ChatGPT plan inference:** disabled. [OpenAI's official overview](https://developers.openai.com/siwc/token-sharing-open-source) directs paid/remotely hosted apps to its approval process. Website identity grants no inference allowance. No API-billing substitution or local-token bridge is implemented. An [owner review brief](hosted-inference-request.md) is prepared; it has not been submitted.
2. **Live sign-in, inference, refresh and revocation:** require real account consent and a supported desktop credential store. The development environment has no secure desktop keyring. No credentials/cookies were borrowed to claim success.
3. **PaperQA2, OpenScholar and Biomni:** remain experimental and unverified with actual chosen models and representative datasets. Adapter presence is not a tested capability promise.
4. **Browser interaction/accessibility:** the Sites workflow lacked its supported browser-control capability. Rendering, keyboard interaction and complete hosted sign-in remain unverified in a supported browser.
5. **Independent scientific quality:** no external researcher has evaluated a preregistered representative reference set. Numerical checks do not establish domain-wide reliability.
6. **Broader scope:** collaboration, hardware rental, universal files, unlimited context, a thesis editor, full citation-manager interoperability and journal submission are not implemented. Local/hosted projects do not automatically sync.

Do not describe the release as complete, 100% accurate, superior to all alternatives, or the only tool needed for every PhD.
