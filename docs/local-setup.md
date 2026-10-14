# Local setup and operation

## Requirements

Node.js 24.19 or newer; Python 3.11 or newer with `venv`; a desktop browser; an operating-system credential store; outbound HTTPS access to OpenAI for authorization/inference and to Europe PMC/PubMed/Crossref when literature search is enabled. Package installation needs access to the configured Python package index. Optional tools have separate requirements.

Use the prebuilt local ZIP for the shortest installation. Extract it to a folder where your user account can write. Run `bash start.sh` on macOS/Linux or `./start-windows.ps1` on Windows. No administrator privileges are needed by the app itself.

If you prefer individual commands:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r companion/requirements.txt
node companion/server.mjs
```

On Windows substitute `py -3 -m venv .venv` and `.venv/Scripts/python.exe`. These commands assume the prebuilt ZIP; a source checkout also needs `corepack pnpm install --frozen-lockfile` and `corepack pnpm build:local`.

## Authorization

The app opens OpenAI's authorization page in your system browser. Passwords and verification codes are entered there, not into Evidarium. PKCE, state, nonce, ID-token signature, issuer, audience, expiry, identity, and the granted plan-usage scope are checked. Dynamic registration is retained for reauthorization. The callback listener exists on an ephemeral loopback port for up to five minutes.

The initial release supports one ChatGPT account registration per data directory. For a different account, use a separate `EVIDARIUM_DATA_DIR`; this also separates research data. A multiple-account picker is not implemented. Disconnect attempts remote refresh-session revocation and removes local tokens, while retaining the registration mapping. If revocation cannot be confirmed, the UI reports it. You can also revoke access in ChatGPT settings.

Tokens are kept in `keyring`, never a plaintext fallback. A working Windows Credential Manager, macOS Keychain, or Linux desktop Secret Service is required. A headless machine without a credential store fails with an explanation. The app does not borrow Codex credentials, scrape ChatGPT cookies, or treat a ChatGPT website session as an API credential.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `EVIDARIUM_DATA_DIR` | `~/.evidarium` | Local project database, original files, identity mapping, and job snapshots. |
| `EVIDARIUM_PORT` | `4317` | Loopback port, 1024–65535. Host binding remains `127.0.0.1`. |
| `EVIDARIUM_PYTHON` | Project `.venv` Python | Interpreter for trusted scientific and authorization workers. |
| `EVIDARIUM_NO_OPEN` | unset | Set to `1` to avoid automatically opening the workspace browser. |
| `EVIDARIUM_OLLAMA_MODEL` | unset | Explicit locally installed specialist model for PaperQA2. |
| `EVIDARIUM_OPENSCHOLAR_DIR` | unset | Installed upstream OpenScholar repository. |
| `EVIDARIUM_OPENSCHOLAR_PYTHON` | worker Python | Interpreter for the configured OpenScholar environment. |
| `EVIDARIUM_OPENSCHOLAR_MODEL` | upstream OpenScholar 8B model ID | Local specialist model selection; may download weights. |

Environment variables are read by the local process. Never put tokens into source files or a public hosting manifest.

## Backup and transfer

Close Evidarium before copying the data directory for a filesystem backup, so SQLite WAL data is consistent. Back up the entire data directory, not only `research.sqlite`. OS-keyring credentials are separate and are not part of the project backup. Reauthorize on a new machine rather than copying session tokens.

Project JSON export is portable research metadata, including messages, notes, decisions, receipts, run records, and audit events. Download each original separately. Import into a new empty project when you want a separate copy. Source IDs in recognized source citations are remapped. File citations cannot resolve until the corresponding originals are separately supplied; imported claims retain their quoted text but are labeled externally supplied and unreviewed. Imported run results are not marked as locally executed.

Import limits: 1,000 sources; 100 notes; 500 messages; 100 tasks; 500 receipts; 1,000 audit entries. Oversized collections are rejected before import. The import is not a single cross-table transaction: an operational failure can leave a partial import with its started audit event. Inspect the record before retrying into a fresh project.

## Recovery

- **Port in use:** close the existing local app or choose another `EVIDARIUM_PORT`.
- **Worker cannot start:** rerun the launcher and inspect the dependency-install error.
- **Authorization unavailable:** verify account eligibility and finish the official OpenAI flow. No API billing fallback is enabled.
- **429/model limit:** inspect ChatGPT usage; wait or explicitly choose another available model. The app will not silently switch models.
- **Interrupted response:** partial text is retained; send a narrower follow-up. Automatic retries are avoided because they can duplicate work or consumption.
- **App stopped during a run:** the next startup marks its record interrupted. Prepare and approve a new run after inspecting the original.
- **Incomplete upload:** delete the incomplete file entry and upload again. There is no automatic resume yet.
- **Optional package missing:** install the documented engine in the configured worker environment. An installation alone is not scientific validation.

Stopping an app process does not guarantee every external runtime stops immediately. Cancellation kills the local worker process tree and asks Docker to remove its named container. If the operating system or Docker is unresponsive, inspect running processes/containers yourself.
