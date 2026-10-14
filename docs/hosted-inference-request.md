# Hosted ChatGPT plan usage — owner review brief

Prepared 14 October 2026. **Not submitted; no provider approval has been granted.** This is a concrete product description for the owner to review before requesting access, not evidence that hosted inference works.

## Proposed integration

Evidarium is an open-source research workspace for literature, original files, screening, evidence-linked claims, and reproducible computation. The requested hosted experience is a private project conversation using the user's authorized ChatGPT plan, with the actual account model catalog and visible usage/error states.

- Public application: https://evidarium.mikhaeelatef.chatgpt.site
- Source: https://github.com/mikhaeelatefrizk/evidarium
- Existing hosted data: project records in D1 and original uploads in R2, with server-side owner checks.
- Requested inference input: the user's message, bounded project history and selected research passages. Arbitrary code execution would remain a separately approved compute operation.
- Current inference implementation: standalone local open-source OAuth client, with credentials in the OS keyring. It does not relay local credentials to the hosted application.
- Current hosted state: identity and research storage work independently; model inference is disabled.

## Provider decision required

The [official ChatGPT plan usage overview](https://developers.openai.com/siwc/token-sharing-open-source) directs paid or remotely hosted applications to its linked interest form. Local open-source eligibility does not establish approval for this hosted service.

The owner should confirm the legal applicant, contact information, business/pricing model, intended users and expected traffic before submitting. These business facts have not been supplied and are not invented here. No password, OAuth token or private research document belongs in this application.

The request should ask OpenAI to confirm eligibility, enrollment/client configuration, supported hosted token handling, model/plan limits, and applicable data-processing requirements. The implementation must follow the approved contract; identity-only authorization is insufficient to enable inference.

## Work after approval

Implement the provider-approved hosted authorization and credential lifecycle; verify account isolation, model selection, a cited conversation, expiry/refresh, revocation and quota errors against actual authorized accounts; then run browser and accessibility checks. Publish the results and enable the feature only after those checks pass.

No approval timeline, acceptance, commercial agreement, usage volume or scientific certification is claimed. Existing engineering evidence and unresolved research-quality work are recorded in [release 0.3](release-0.3.md).


## Submission-ready product description (updated for 0.5)

Official form: https://openai.com/form/sign-in-with-chatgpt-interest/

Requested capability: **Sign in and ChatGPT plan use for AI requests**.

Website URL: https://evidarium.mikhaeelatef.chatgpt.site

Product description:

> Evidarium is an open-source research workspace for students and researchers. It stores private research projects, searches literature, tracks screening decisions and exact-passage evidence, performs bounded native statistics/meta-analysis and document text extraction, and supports reference imports, manuscript drafts and reproducible exports. We request permission to integrate ChatGPT identity and eligible user-authorized ChatGPT plan usage directly into the hosted website, without asking users for API keys. Hosted inference is currently disabled. We intend to use provider-approved server-side credential handling, the actual account model catalog, visible usage/error states and explicit approval for computational tasks. Source code and bounded verification evidence are public at https://github.com/mikhaeelatefrizk/evidarium. We do not claim universal scientific accuracy or unrestricted model/file access.

The form requires work email, first name, last name, company name and website; job title is optional. Applicant/company identity and the contact to submit have not been confirmed for this request. This document does not transmit an application, grant access or assert a legal company registration.
