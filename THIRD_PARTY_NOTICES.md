# Third-party components

Original Evidarium code is MIT licensed. This does not change any third-party code, model, data, article, or service terms. Dependencies are installed separately through the lockfiles/requirements; model weights and article text are not bundled. The Sites/Vinext starter notices remain under `build/` where supplied.

| Component | Code license / separate terms | Primary source |
|---|---|---|
| INDRA | BSD-2-Clause | https://github.com/gyorilab/indra |
| Biomni | Apache-2.0; model/data terms separate | https://github.com/snap-stanford/Biomni |
| PySR | Apache-2.0; Julia dependencies retain their licenses | https://github.com/astroautomata/PySR |
| metafor | GPL-2-or-later; separately installed R program | https://cran.r-project.org/package=metafor |
| PaperQA2 | Apache-2.0; model terms separate | https://github.com/Future-House/paper-qa |
| OpenScholar | Apache-2.0 code; underlying Llama/other model terms separate | https://github.com/AkariAsai/OpenScholar |
| ASReview | Apache-2.0 | https://github.com/asreview/asreview |
| Docling | MIT code; model/data licenses separate | https://github.com/docling-project/docling |
| React | MIT | https://github.com/facebook/react |
| Lucide | ISC | https://github.com/lucide-icons/lucide |
| NumPy / SciPy | BSD-3-Clause | https://numpy.org / https://scipy.org |
| pypdf | BSD-3-Clause | https://github.com/py-pdf/pypdf |
| python-docx / openpyxl | MIT | https://python-docx.readthedocs.io / https://openpyxl.readthedocs.io |

Before distributing a combined binary, image, modified GPL component, or model, review the actual installed components and applicable redistribution obligations. Invoking an optional adapter is not permission to redistribute its dependencies or the user's research content.

OpenAI's ChatGPT plan integration is subject to the provider's current eligibility, scope, usage, and deployment rules:

- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/sign-in
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations

Literature metadata is retrieved from PubMed/NCBI E-utilities and Crossref REST. Availability, rate limits, licenses, and rights to full-text content remain with their providers and publishers. A DOI or open-access marker is not a blanket license to redistribute an article.

## Bundled local XML reader

The local release includes `saxes` 6.0.0 (ISC) and `xmlchars` 2.2.0 (MIT). Their package license files are included alongside the bundled runtime code. Saxes upstream is archived; dependency maintenance remains an explicit project responsibility. [Saxes](https://github.com/lddubeau/saxes) · [xmlchars](https://github.com/lddubeau/xmlchars).

## jStat 1.9.6

Website-native statistical distribution functions use [jStat](https://github.com/jstat/jstat), MIT License, copyright (c) 2013 jStat. Its complete license is included with the bundled package in the local download. This is not metafor; the native REML implementation is Evidarium code, with independently executed metafor used as a numerical reference.

## unpdf 1.8.1 and PDF.js

The website text extractor uses [unpdf](https://github.com/unjs/unpdf) (MIT, copyright 2023–present Johann Schopplich), including its serverless [Mozilla PDF.js](https://github.com/mozilla/pdf.js) build (Apache-2.0). See `vendor/pdfjs.LICENSE` and the unpdf package LICENSE distributed in the local ZIP. No upstream parser code was modified. Original source and notices remain with their packages.
