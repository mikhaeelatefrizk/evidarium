# Current verification — 0.4.0

See [release 0.4](release-0.4.md) for native hosted analysis, 20 independently executed R/metafor numerical comparisons, PDF coverage checks and the public deployed-server reference check. The current JavaScript suite passes 43 checks with a configured test Python and zero skips; TypeScript passed. All four jobs in [the v0.4 CI run](https://github.com/mikhaeelatefrizk/evidarium/actions/runs/38557900671) passed, including 13 Python checks, real launchers and the scientific/Docker job. The [actual hosted reference report](validation/hosted-0.4.json) records HTTP-verified deployed calculations and PDF parsing through documented service access. Live subscription inference and full browser/researcher validation remain unverified.

The previous record follows for historical engine and platform evidence.

# Verification record — 0.3.0

14 October 2026. This records bounded engineering checks, not a scientific or security certification. See [release 0.3](release-0.3.md) for datasets, exact outputs, CI links, defects and remaining blockers.

## Passed

- **27 JavaScript checks and 13 Python checks**, zero skipped with `EVIDARIUM_TEST_PYTHON`. Ownership, request origins, data integrity, retrieval/citations, task approval, OAuth response validation and native readers are covered. The acceptance-runner test uses a controlled model, not live OAuth/inference.
- **Three real scientific workflow tests:** actual metafor, ASReview and INDRA through the local application and worker after approval.
- The published 13-study metafor reference matched displayed results and a separate SciPy numerical calculation.
- ASReview processed 3,453 real records. PySR executed synthetic equation recovery and a measured-data fit. Docling extracted a generated DOCX. Scope and Julia diagnostics are recorded in the release document.
- GitHub CI on **Windows, macOS and Linux** installed dependencies, ran core checks, built the UI, invoked actual launchers, served production assets, and created/exported a project. These are HTTP checks, not browser QA or desktop authentication.
- A real Docker adapter test checked computation, disabled network, read-only root, output collection and image identity.
- A synthetic 20,000-message project retained older retrieval and bounded page loading.
- The previous live Europe PMC import/search remains recorded in [release 0.2](release-0.2.md).

The supported runtime is **Node.js 24.19+ with FTS5 and Python 3.11+**. Node 22.13 failed actual FTS5 checks on every tested operating system. Launchers now reject it before creating/migrating user data. Local scientific checks used Python 3.12.14/Linux. Optional dependencies are not bundled in the base environment.

## Not passed

Real ChatGPT sign-in/inference and token lifecycle; hosted AI; browser interaction/accessibility; PaperQA2/OpenScholar/Biomni with chosen models; general scanned/multilingual/adversarial document quality; concurrency and production load; independent researcher review; security certification. A quotation existing is not proof that an answer interprets it correctly.

## Reproduce

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r companion/requirements.txt
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
EVIDARIUM_TEST_PYTHON="$PWD/.venv/bin/python" node --test tests/*.test.mjs
```

Omitting the test Python skips the real worker and controlled acceptance-runner checks; skipped checks are not passes. Install the actual engines and R libraries for the integration suite:

```bash
EVIDARIUM_TEST_PYTHON=/absolute/path/to/test/python node --test tests/integration/engines.test.mjs
```

Docker: `python tests/integration/verify-docker.py` after building the documented image. Numerical/real-data checks: `scripts/verify-science.py`. Actual account acceptance: the local UI or `scripts/verify-live.mjs`, requiring explicit authorization for plan usage and fixture computation.

Sites deployment success verifies publication, not application correctness. Packaging preserves the exact pushed source and publishes fresh ZIP checksums. No model credentials are included in verification records or release artifacts.
