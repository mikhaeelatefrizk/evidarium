# Engine contracts

Prepare an analysis in the UI, select its input, inspect the JSON parameters in Activity, and approve. The model may prepare one on request, but cannot approve it. Dependencies absent from your selected Python environment produce an explicit failed task. These optional adapters are experimental, not certified integrations.

## Base tools

**`describe_csv`** — select a UTF-8 CSV with a header. Parameters `{}`. Reports record count, empty/missing cells, numeric/non-numeric counts, and finite numeric mean/median/min/max/sample SD. It does not infer a study design, units, causal meaning, or whether an identifier should be averaged. Limit 100,000 rows; excessive rows raise an error.

**`extract`** — select a supported original. Parameters `{}` or `{"max_pages":300}`. PDF extraction is text-based; scanned/empty pages are flagged, not invented. DOCX paragraphs/tables are supported, but layout, images and revisions are not fully interpreted. XLSX/XLSM extraction reads cached cell values without running macros or recalculating formulas. UTF-8 text/code/bibliography formats are text only. Default extracted text cap is two million characters. Inspect all warnings under Files → Read text.

Docling: run `python3 scripts/install-engine.py docling` to create a separate environment and use `{"engine":"docling","max_pages":300}`. Consult its [document-converter API](https://docling-project.github.io/docling/reference/document_converter/). First use can fetch model resources. A generated DOCX prose/table fixture passed in 0.3. Scanned PDF/OCR and complex-layout accuracy remain unverified.

## Meta-analysis with metafor

Install R, then install `metafor` and `jsonlite` in the R library available to `Rscript`. Input: CSV with effect and **sampling variance** columns, not standard-error columns. Example parameters:

```json
{"effect":"yi","variance":"vi","independent_effects_confirmed":true}
```

Set the confirmation only after checking study/report dependence. The adapter runs `rma(..., method="REML", test="knha")` and `predict()`, retaining the R code and package version. Outcomes/effect scales must be scientifically comparable. No automated risk-of-bias assessment, moderator selection, publication-bias correction, or multilevel dependence model is implied. See [metafor reference](https://wviechtb.github.io/metafor/reference/rma.uni.html).

## Screening with ASReview

Use `python3 scripts/install-engine.py asreview` (tested ASReview 3.0.8), exposing `ActiveLearningCycle`, `Tfidf`, `SVM`, `Balanced`, and `Max`. The adapter targets the documented 3.x API. Parameters `{"stage":"title_abstract"}`. At least one included and one excluded record at the same stage are required. All candidate features are fit consistently; the classifier uses labeled seeds and ranks only unreviewed records. Labels are never changed. Rankings do not guarantee sensitivity/recall or replace a complete search strategy. [Upstream](https://github.com/asreview/asreview).

## Symbolic regression with PySR

Run `python3 scripts/install-engine.py pysr` and complete Julia setup in that environment. First execution may download Julia and packages and use significant CPU/storage. Input: finite numeric CSV, 20–20,000 rows, at most 15 features. Example:

```json
{"features":["temperature","pressure"],"target":"response","iterations":30}
```

The adapter uses a fixed 80/20 random split, seed 42, serial deterministic mode, arithmetic operators, and at most 100 iterations. The result includes an equation and held-out RMSE. A random split is inappropriate for some grouped/time-series settings; this adapter does not silently solve that design issue. [Upstream](https://github.com/astroautomata/PySR).

## Mechanistic claims with INDRA

Run `python3 scripts/install-engine.py indra`. Input: **INDRA statement JSON**, or parameters with a `statements` array. No PDF-to-mechanism reader is bundled. The adapter parses statements and returns agents, relationship types, and their attached evidence. These are represented claims, not new biological verification. Malformed/dropped statements fail the task instead of returning a partial graph. Agent identities include their full supplied state and grounding, so different grounded agents with identical names are retained separately. [Upstream](https://github.com/gyorilab/indra).

## PaperQA2 with an explicit local model

Install `paper-qa` and Ollama, obtain a model under its applicable terms, and set `EVIDARIUM_OLLAMA_MODEL` to the actual installed model. Input: a compatible document. Parameters `{"question":"What are the reported limitations?"}`.

The adapter sets `llm`, `summary_llm`, and `agent_llm` to that Ollama model and uses sparse embeddings, so it does not silently choose paid OpenAI API defaults. This specialist model is separate from the selected ChatGPT conversation model. You must verify your PaperQA/Ollama version compatibility. Do not infer top-tier quality from this adapter's presence. [Upstream](https://github.com/Future-House/paper-qa).

## OpenScholar

Install [OpenScholar](https://github.com/AkariAsai/OpenScholar) in its own appropriate GPU environment, including its local inference dependencies and model weights. Set `EVIDARIUM_OPENSCHOLAR_DIR` and optionally `EVIDARIUM_OPENSCHOLAR_PYTHON`/`EVIDARIUM_OPENSCHOLAR_MODEL`. Input must follow that repository's query/context JSON schema, not an arbitrary PDF.

The adapter invokes upstream `run.py` with explicit input/output/model flags, `--use_contexts`, `--top_n 10`, `--llama3`, and `--zero_shot`. Runtime limit is 30 minutes. It does not use the ChatGPT allowance. Review the underlying model's license separately from the Apache code license. This adapter was not executed in the release checks.

## Custom Python in Docker

Install Docker and explicitly build the bounded analysis image:

```bash
docker build -f companion/docker/Dockerfile -t evidarium-analysis:0.1.0 companion/docker
```

Select an optional input file. Example parameters:

```json
{"code":"import pandas as pd\nd = pd.read_csv('/work/input')\nprint(d.describe().to_string())\nd.describe().to_csv('/output/summary.csv')","timeout_seconds":120,"memory_gib":2,"cpus":2}
```

The exact code is visible before approval. Container network is disabled; the root filesystem and selected input are read-only. No host credential, Docker socket, home directory, or arbitrary host path is mounted. The output directory is the only persistent writable mount. The process runs as an unprivileged UID, drops capabilities, enables no-new-privileges, and is bounded by memory, CPUs, processes, tmpfs, and timeout. Limits: at most 64 GiB/16 CPUs/600 seconds per custom job; approve values appropriate to your machine.

The app collects at most eight regular output files, four MiB each/eight MiB total. Symlinks are rejected. Files exceeding these collection bounds are not retained by this adapter; stdout/stderr tails and filenames remain in the result. Containers are an isolation boundary, not a formal guarantee against kernel/runtime vulnerabilities.

## Biomni offline worker

This experimental path executes [Biomni](https://github.com/snap-stanford/Biomni) inside Docker with a model server in the **same isolated container**. It uses no hosted-model API key or ChatGPT token. The minimal image recipe does not install Biomni's entire multi-tool environment or data lake.

1. Select and obtain a licensed GGUF model compatible with `llama-cpp-python`. Copy it to `companion/docker/model.gguf` locally. Model files are excluded from the repository/archive.
2. Select explicit compatible Biomni and llama-cpp-python versions from their upstream releases. Pass them as `BIOMNI_VERSION` and `LLAMA_CPP_VERSION` build arguments to `Dockerfile.biomni`; the build deliberately fails if either is missing.
3. Build the image named `evidarium-biomni:0.1.0` using `companion/docker` as the build context.
4. Run a task such as `{"task":"Inspect the selected dataset at /work/input and report its dimensions and missing values. Save any results under /output.","memory_gib":8,"cpus":2,"timeout_seconds":600}`.

The image starts a local OpenAI-compatible model server on container loopback and configures Biomni's Custom source. This model is not the ChatGPT conversation model. Biomni methods needing unavailable packages, models, data, external databases, or internet will fail. No internet-enabled fallback is provided. The recipe and adapter need end-to-end testing on the user's chosen environment; no claim of full Biomni capability is made.

## External computation

You can export project metadata, run an analysis elsewhere, and upload its input/output/code/logs as original files. An imported Evidarium task record is labeled externally supplied and keeps its claimed provenance. The app does not assert it performed or independently reproduced that work. Cloud hardware rental, billing, credential delegation, and remote scheduling are not implemented.

## Verification scope in 0.3

See [the release record](release-0.3.md) for exact datasets, versions, outputs and remaining gaps. R/metafor reproduced the published BCG example and matched a separately implemented SciPy REML calculation. ASReview processed 3,453 real records. Three approved engine workflows passed through the actual local API and Python worker. PySR fit a known synthetic equation and a measured dataset; an optional Julia PythonCall extension emitted an initialization error even though the core fits completed. Docling passed one generated DOCX fixture. Docker passed execution and declared-boundary checks in CI. PaperQA2, OpenScholar and Biomni remain unverified end to end, and no engine has independent domain-wide scientific certification.
