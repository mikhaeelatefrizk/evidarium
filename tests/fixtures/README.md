# Verification fixtures

`bcg.csv` contains the numerical 2×2 counts for the 13 trials in the `dat.bcg` example distributed with metafor/metadat and displayed at <https://wviechtb.github.io/metafor/>. The app derives log risk ratios and sampling variances from these counts; it does not substitute rounded displayed effects. Trial numbers identify the original order. This is a software reference check, not a new medical recommendation or an independent appraisal of the trials.

ASReview's separately downloaded Appenzeller-Herzog dataset is not bundled. Its source, attribution and exact SHA-256 are recorded in `docs/release-0.3.md`. Synthetic text, mechanism and equation fixtures are explicitly labeled and must not be presented as research findings.

`web-meta-reference.json` contains 20 independently executed R/metafor comparisons. Regenerate with `scripts/verify-web-science.py`. The three PDF base64 fixtures were generated with ReportLab: two pages of known text, a blank page, and 51 pages for the coverage limit. They contain no private research. `public/examples/bcg-effects.csv` derives log risk ratios and variances from the existing attributed BCG counts.
