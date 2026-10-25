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

## Demand forecasting methods (implemented scientific core)

Inputs are 20–2048 finite nonnegative whole-count observations per series, with at most 4096 across eight entity/product series. A fixed hour/day/week grid is explicit. Time-zone offsets normalize to UTC. Missing slots remain null, are excluded from fitting/scoring, and lower reported completeness. Off-grid irregular timestamps require explicit upstream aggregation rather than interpolation; duplicate timestamps/nonfinite observations fail. Less than 20 observations or below 70% grid completeness produces an insufficient-data result. Reporting completeness is separate from grid completeness: a complete grid does not prove a complete company's disclosures.

Chronological split: first 65% for training, next 15% for candidate validation/model selection, final 20% untouched for MAE/RMSE and baseline comparison. Test predictions fit only preceding data. Final forward estimates refit on the full now-observed history after backtest reporting; no held-out outcome enters model selection or backtest predictions. Changing only test outcomes is explicitly tested not to change either.

Candidates: seven-observation moving average, intercept-only level regression, linear trend regression, and trend plus declared seasonal-phase effects. Auto selection prefers simpler models unless trend improves validation MAE by 5%; seasonality additionally needs six cycles, three training cycles, a training partial F-test p<0.01 and at least 10% validation improvement. Missing/unidentifiable seasonal phases exclude that candidate. Seasonality is never assumed just because a period was proposed. Last-value, moving-average and level baselines are reported independently.

Supported regression prediction intervals are Student-t OLS future-observation intervals, using residual variance, residual degrees of freedom and the design covariance including the future-observation noise term. They are not confidence intervals for the mean. At least 30 residual observations/15 residual degrees of freedom, positive residual variance, and explicit normality/serial-dependence/variance diagnostics are required. Unsupported bands remain null with a reason. Known nonnegative count boundaries clip negative estimates/band lower bounds and are disclosed. Conditional model/error assumptions, future structural changes and unquantified model-selection uncertainty are explicit limitations; diagnostics are not proof or a coverage guarantee. The numerical implementation uses [SciPy statistical functions](https://docs.scipy.org/doc/scipy/reference/stats.html) and NumPy least squares; pandas supplies ordered interval indexing.

Thirty independent known synthetic trend/noise experiments validate held-out prediction coverage against a predeclared 83–96% acceptance range for nominal 90% intervals. Serially correlated residuals do not receive validated bands. This is controlled validation, not a guarantee on real company data.

`datasets/scientific-history-v1.json` is a separate reproducible 168-day analytical-only synthetic fixture for two anonymous entity slots, with explicit seeds, trend/weekly components, rounded independent noise and synthetic supplier terms. Its generator is `services/scientific/scripts/generate_history.py`. Entity slots are mapped only after authorization. No operational record, actual historical transaction, commercial quote, purchase or reservation is imported. Forecast dates follow the last synthetic observation and must not be represented as actual current-market predictions.
# Procurement optimization

`fixed-charge-all-units-milp`, method version 1, uses SciPy `optimize.milp` with bundled HiGHS 1.12.0. Integer requirement/supplier/tier quantities meet demand exactly. Binary tier selectors enforce one active all-units tier, its quantity interval and MOQ; supplier quantity is bounded by declared capacity. Fixed shipping enters the objective once per active supplier. Optional binary entity/supplier selectors bound supplier count. Multiple compatible products share a supplier's declared tier thresholds. No overbuy or currency conversion is implicit.

The minimized objective is external merchandise plus supplier shipping. Declared transition expense is a fixed once-per-participant addition. Master must supply the existing deterministic baseline, reconciled against requirement prices and per-entity baseline shipping. No internal transfer enters ecosystem savings. Shipping is quantity-allocated in exact cents, with remainder assigned to the last sorted participant. Entity disadvantage is explicitly flagged even if total benefit is positive. Equal-cost allocations are not a fairness guarantee.

Inputs are bounded to eight entities, 32 requirements, six suppliers, three tiers each, 100000 total integer units, unit prices up to 10000000 cents, and one currency. Solver time is 0.1–3 seconds and node limit 10000, within the independently bounded service execution deadline. Returned incumbents must satisfy integrality (1e-5), bounds and linear constraints (1e-6), and objective reconciliation (0.01 cent); reported money is recomputed using integers. Optimal, feasible-without-proof, infeasible and no-incumbent outcomes remain distinct. Unsupported constraints are rejected, never silently ignored. Solver/library versions are retained with results.

HiGHS uses one thread and seed zero per isolated process. These supported solver
options use SciPy's verbatim option passthrough; only its expected passthrough
notice is filtered. Other solver warnings remain visible. See the [official HiGHS
option definitions](https://ergo-code.github.io/HiGHS/dev/options/definitions/).
This bounds native thread pools under concurrent workloads; equal-cost optimum
selection still does not constitute a fairness guarantee.

# Scenario and sensitivity comparison

`deterministic-procurement-sensitivity`, method version 1, runs up to four named cases and an optional 2–5 point evenly spaced sensitivity. Changes use integer basis points (10000 = unchanged). Demand, supplier unit prices, shipping and transition expenses round upward; capacity rounds downward. Supplier price/shipping/capacity changes can target named existing suppliers. MOQ and tier thresholds remain unchanged. Inputs are independently revalidated after transformation; unsupported constraints, unknown suppliers, currency mixing and out-of-bounds expansion fail closed.

Each case reports its complete declared assumptions, conditional required quantity, feasibility, solver diagnostics, same-demand baseline, estimated external benefit, cost difference from coordinated baseline, and per-entity implications. Reference existing arrangements are retained separately. No statistical probability, scenario likelihood or automatic decision is inferred. Forecast-derived requirements must be explicitly labeled by their enclosing authorized dataset and remain estimates; this scenario operation does not itself forecast demand. Per-solve time is capped at 0.75 seconds inside the overall killable service deadline.

