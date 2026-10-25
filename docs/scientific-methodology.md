# Scientific methodology and transport

## Pinned foundation

The initial scientific service uses Python 3.13.16 (official slim-bookworm image pinned by digest), NumPy 2.5.4, SciPy 1.18.1, pandas 3.1.0, FastAPI 0.162.0, Pydantic 2.14.1 and Uvicorn 0.54.0. Tests use pytest 9.1.1 and httpx 0.28.1. Exact transitive Linux-amd64/Python-3.13 wheel hashes are in `services/scientific/requirements.lock`; regenerate only explicitly in the pinned image with `scripts/lock.py`. No host Python/scientific install or large ML framework is required. Runtime/dependency pins were checked against [Python release policy](https://peps.python.org/pep-0719/), [NumPy](https://pypi.org/project/numpy/), [SciPy](https://pypi.org/project/scipy/), [pandas](https://pypi.org/project/pandas/) and [FastAPI](https://pypi.org/project/fastapi/).

The optional service is a separate nonroot process/container, with no database/commerce credentials, socket, code-execution endpoint or authoritative-business access. Source authorization/minimization belongs to Master; service envelopes additionally reject cross-scope references and mislabeled synthetic history. Existing analytical capability definitions and Master MCP are extended, not replaced.

Requests use a closed v1 envelope and private file-held per-installation HMAC key. Sign timestamp, nonce, HTTP method, path and exact body bytes; accept a thirty-second clock window and reject replayed nonces. Production transport must also use trusted TLS; an expressly configured internal-only two-party Docker network is the local-development equivalent. No secret enters frontend output, model context or error messages.

Execution uses bounded process admission, one subprocess per calculation, finite wall/CPU/address-space/pid/response limits and single-thread BLAS environment settings. Cancellation/client disconnect and timeouts terminate the process and release its slot. Restarted application-level jobs will retain interrupted status rather than claim completion. The service has no ordinary Worker/Master availability role.

## Implemented descriptive foundation

`describe-series` computes finite observed counts, missing counts, mean, median, min/max and n-1 sample variance using pandas, NumPy and SciPy. Missing observations are not zero. No variance is claimed from one observation; no statistic is invented for an empty observed series. This is descriptive evidence, not a forecast or causal claim. Unimplemented operations are rejected rather than simulated.

Run `node scripts/test-scientific-service.mjs` to build the hash-locked image, run isolated pytest and exercise an actual authenticated HTTP calculation in a nonroot network-disabled container. The test creates and deletes only its own private temporary key/container; it never mounts an operator deployment.

Forecasting, optimization, scenarios, governed persistence and UI/MCP execution are subsequent Phase 12 checkpoints, not claimed by this foundation.
