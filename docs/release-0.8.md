# Release 0.8 — English and Arabic workspaces

Development release, 31 October 2026. This release introduces a shared interface language and a revised workspace layout. Final browser, build and release verification is pending at the time of this note. It does not certify scientific interpretation or production readiness. The customer AI provider and pricing decision remains deferred; a separate customer ChatGPT subscription is not an accepted product requirement.

## Implemented scope

English and Arabic share one language preference across the workspace, independent screening, systematic review, research writing, reference import, project retrieval and result inspection. The preference follows the explicit URL setting or the saved choice, then the browser language. Arabic uses right-to-left layout; numbers, dates and file sizes use locale-aware formatting. Switching language updates presentation without reloading the workspace.

Application labels, instructions, known errors, decisions and status messages use explicit translations. Original research titles, passages, filenames, quotations, identifiers and stored scientific values retain their supplied content. Technical identifiers and raw JSON/CSV interchange remain stable. Known network and malformed-response errors have localized explanations; unknown external diagnostics remain verbatim.

The layout uses a consistent hierarchy, spacing, borders, typography and controls, with a responsive navigation drawer and research panel. Dialog headers expose the shared language control. Arabic source content and left-to-right identifiers have separate direction handling. Desktop and 390px mobile browser checks passed in both modes, including visible focus containment, Escape dismissal and focus restoration for mobile navigation. A dedicated assistive-technology audit remains outstanding.

Writing, bibliography, retrieval and analysis controls now use the selected interface language, including human-facing analysis tables and forest-plot text. Manuscript preview and HTML/Markdown presentation exports accept an optional locale. Arabic presentation includes Arabic generated headings, explanatory notices and missing-metadata labels. Default exports remain English; source JSON preserves canonical fields, stored manuscript text and citation identifiers. Locale is not saved into the manuscript record.

Independent-screening permissions, locked submissions, concealed peer decisions, correction rounds and export boundaries continue to follow [release 0.7](release-0.7.md). This release does not combine the independent ledger with the legacy owner-screening counts or establish a complete PRISMA flow.

## Verified evidence

The following checks completed on the Windows development checkout during this change:

| Check | Result |
| --- | --- |
| Complete Node suite, `node --test tests/*.test.mjs`, with the actual local Python worker selected | **127 passed; 0 failed or skipped**, plus **11 localization tests passed** |
| CI Python unit suite, `python -m unittest discover -s tests -p 'test_*.py' -v` | **13 passed** |
| Independent bibliography readers, `python scripts/verify-bibliography.py` | **3 cases passed**, using rispy 0.9.0 and bibtexparser 1.4.3 |
| Native REML comparison against existing independent R/metafor fixtures | **20 bounded cases passed** within the Node suite |
| Actual Node/SQLite FTS5 capability check | **Passed** |
| Windows launcher PowerShell syntax check | **Passed** |

The Node suite includes two new manuscript tests. They check Arabic HTML language/direction and headings, preservation of bilingual research text and citation identities, default English behavior, invalid-locale fallback, API preview/export wiring, unchanged saved records and stable source JSON. Existing permission, audit, storage, upload recovery and actual local-worker checks also passed.

Fresh R/metafor fixture generation was not run: Rscript was unavailable in this environment. Comparing existing independent reference fixtures is distinct from executing R again. The actual Windows launcher/HTTP verifier also passed using the existing dependency environment; it does not claim a fresh-machine install. No real provider conversation, new Docker integration run or independent methodological appraisal is claimed by these local checks. Local run evidence is retained in the workspace's `work/locale-regression.log`, with full Node/Python logs and the bibliography report alongside it.

## Browser and release verification

The controlled loopback browser harness uses the actual application and storage with explicitly synthetic identities. Project creation, protocol editing/saving and manuscript editing/saving retained exact bilingual research text across language changes. Saved-status notices, manuscript preview, independent-review screens, immutable evidence displays and peer-decision concealment appeared in the selected language. A claim's extracted-location picker displays Arabic labels while submitting the original canonical location. The public 13-study BCG CSV was uploaded through the UI, proposed for analysis, explicitly approved, executed and inspected in Arabic; the pooled estimate was -0.7145323 with the expected confidence interval. Numerical table and forest-plot controls remained available.

English and Arabic guides passed structural/link parity and mobile browser inspection. The app was inspected at desktop and 390px widths with no document-level horizontal overflow; wide scientific tables/plots scroll within their own region. Switching language updates document language, direction and URL while preserving other navigation state. The empty project now starts at its heading instead of scrolling to its bottom. UI source audit covers 1,244 translated keys; TypeScript and local production build passed. The frontend bundle is approximately 156 KiB gzipped; Vite's 500 KiB uncompressed warning remains advisory.

The Windows launcher/HTTP acceptance test passed: production assets, projects, bibliography preview/import, manuscript/citation preview, screening ledger and structured review operations. Its initial restricted run failed at the local-network permission boundary, then passed with normal local execution; both results are retained in the test evidence. Hosted build/publication and the current cross-platform CI outcome are recorded by the release owner after completion.

Two real hosted accounts, hosted OAuth acceptance, rehearsed recovery of both database and originals, realistic load testing, independent security review and qualified methodological review remain separate requirements. Project JSON remains an interchange format rather than a complete backup. Hosted AI remains disabled and product-level AI provision/pricing remains deferred. These checks do not establish production readiness or scientific validity.
