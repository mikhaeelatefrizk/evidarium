# Contributing

Start with the architecture and verification documents. Keep claims about features aligned with executable behavior. Do not add synthetic research results, pretend integrations, fabricated citations, silent model fallbacks, or a “verified” label that conflates text presence with scientific validity.

For behavior changes, include a focused check of the affected boundary: ownership, approval, integrity, numerical reference result, citation support, or failure recovery. Update the user guide and engine contract when inputs, resources, data destinations, licenses, or limits change.

Keep third-party engine environments isolated and explicitly configured. Never check in tokens, OAuth callbacks, `.env` files, account data, private research, model weights, local databases, or browser-session artifacts. The app's local data directory must remain outside source control.

Before a production-quality release: validate OAuth on real eligible accounts and all supported operating systems; run browser and accessibility checks; reproduce numerical fixtures against published references; benchmark evidence matching and full-text extraction with domain reviewers; test cancellation/recovery and concurrency under load; review dependencies and security; then document exactly what passed.
