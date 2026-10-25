"""Interpretable demand estimates; no operational records are created or imputed."""
import math
from datetime import datetime
from typing import Literal
from uuid import UUID
import numpy as np
import pandas as pd
from pydantic import Field, StrictFloat, field_validator, model_validator
from scipy import stats
from .contracts import Closed


class Observation(Closed):
    at: datetime
    value: StrictFloat | None

    @field_validator('at')
    @classmethod
    def zone(cls, value):
        if value.tzinfo is None:
            raise ValueError('Timezone required')
        return value

    @field_validator('value')
    @classmethod
    def demand(cls, value):
        if value is not None and (not 0 <= value <= 1e6 or not value.is_integer()):
            raise ValueError('Observed demand must be a nonnegative whole count')
        return value


class Series(Closed):
    entityId: UUID
    key: str = Field(min_length=1, max_length=120)
    measure: Literal['orders', 'units']
    observations: list[Observation] = Field(min_length=1, max_length=2048)


class ForecastInput(Closed):
    series: list[Series] = Field(min_length=1, max_length=8)
    interval: Literal['hour', 'day', 'week']
    horizon: int = Field(strict=True, ge=1, le=56)
    method: Literal['auto', 'moving-average', 'level-regression', 'trend-regression', 'seasonal-regression'] = 'auto'
    seasonalPeriod: int | None = Field(strict=True, ge=2, le=52, default=None)
    confidence: float = Field(ge=0.80, le=0.99, default=0.90)
    coverage: Literal['declared-complete', 'partial', 'unknown'] = 'unknown'

    @model_validator(mode='after')
    def bounds(self):
        if sum(len(s.observations) for s in self.series) > 4096:
            raise ValueError('Total observation limit')
        if len({(s.entityId, s.key) for s in self.series}) != len(self.series):
            raise ValueError('Duplicate demand series')
        return self


SECONDS = {'hour': 3600, 'day': 86400, 'week': 604800}
LIMITATIONS = [
    'Estimates describe the authorized disclosed cohort, not an independently verified census of business demand.',
    'Backtests are chronological; model selection uses an earlier validation block and never the final test block.',
    'No purchase, capacity reservation, employment action or other business decision is authorized.',
]


def design(x, method, period, scale):
    columns = [np.ones(len(x))]
    if method != 'level-regression':
        columns.append(x / scale)
    if method == 'seasonal-regression':
        columns.extend([(x.astype(int) % period == j).astype(float) for j in range(1, period)])
    return np.column_stack(columns)


def fit(x, y, method, period, scale):
    if method in ['moving-average', 'last-value']:
        level = float(np.mean(y[-7:])) if method == 'moving-average' else float(y[-1])
        return {'method': method, 'level': level}
    matrix = design(x, method, period, scale)
    coef, _, rank, _ = np.linalg.lstsq(matrix, y, rcond=None)
    if rank != matrix.shape[1] or len(y) <= matrix.shape[1] + 2:
        raise ValueError('Insufficient independent regression observations')
    residual = y - matrix @ coef
    return {'method': method, 'coef': coef, 'residual': residual, 'matrix': matrix,
            'inverse': np.linalg.inv(matrix.T @ matrix), 'df': len(y) - matrix.shape[1],
            'variance': float(residual @ residual / (len(y) - matrix.shape[1])), 'x': x}


def predict(model, x, period, scale):
    if 'level' in model:
        return np.full(len(x), model['level'])
    return design(x, model['method'], period, scale) @ model['coef']


def metrics(actual, predicted):
    error = actual - np.maximum(0, predicted)
    return {'mae': float(np.mean(np.abs(error))), 'rmse': float(np.sqrt(np.mean(error**2))),
            'observations': len(actual)}


def diagnostics(model, confidence):
    if 'level' in model:
        return {'supported': False, 'reason': 'Moving/last-value baselines have no validated prediction interval.'}
    residual = model['residual']
    n = len(residual)
    if n < 30 or model['df'] < 15:
        return {'supported': False, 'reason': 'At least 30 residual observations and 15 residual degrees of freedom required.'}
    if model['variance'] < 1e-12:
        return {'supported': False, 'reason': 'Zero observed residual variance does not establish future certainty.'}
    normal_p = float(stats.shapiro(residual).pvalue)
    denominator = float(residual @ residual)
    lag_count = min(10, n // 5)
    q = n * (n + 2) * sum(float(residual[k:] @ residual[:-k] / denominator)**2 / (n-k)
                          for k in range(1, lag_count+1))
    serial_p = float(stats.chi2.sf(q, lag_count))
    fitted = model['matrix'] @ model['coef']
    if np.ptp(fitted) > 1e-9:
        rho, variance_p = stats.spearmanr(np.abs(residual), fitted)
        unstable = bool(abs(rho) > 0.3 and variance_p < 0.01)
    else:
        variance_p, unstable = None, False
    supported = normal_p >= 0.01 and serial_p >= 0.01 and not unstable
    return {'supported': supported, 'confidenceLevel': confidence,
            'method': 'Student-t OLS prediction interval for a future observation',
            'normalityPValue': normal_p, 'serialDependencePValue': serial_p,
            'varianceTrendPValue': None if variance_p is None else float(variance_p),
            'reason': None if supported else 'Residual normality, independence or stable-variance diagnostic failed.',
            'assumptions': ['Approximately normal independent errors with stable variance and unchanged model structure.',
                            'Diagnostics and model selection do not prove these assumptions or guarantee future coverage.',
                            'Intervals predict future demand observations, not confidence intervals for a mean.']}


def intervals(model, x, period, scale, confidence):
    check = diagnostics(model, confidence)
    if not check['supported']:
        return None, check
    matrix = design(x, model['method'], period, scale)
    error = np.sqrt(model['variance'] * (1 + np.einsum('ij,jk,ik->i', matrix, model['inverse'], matrix)))
    half = stats.t.ppf((1 + confidence) / 2, model['df']) * error
    center = predict(model, x, period, scale)
    return list(zip(np.maximum(0, center-half), np.maximum(0, center+half))), check


def seasonal_signal(x, y, period, scale):
    base = fit(x, y, 'trend-regression', period, scale)
    extended = fit(x, y, 'seasonal-regression', period, scale)
    base_ss = float(base['residual'] @ base['residual'])
    extended_ss = float(extended['residual'] @ extended['residual'])
    if extended_ss < 1e-12:
        return 0.0 if base_ss > 1e-9 else 1.0
    f = max(0, (base_ss-extended_ss)/(period-1)) / (extended_ss/extended['df'])
    return float(stats.f.sf(f, period-1, extended['df']))


def one_series(series, settings):
    observed = pd.Series([o.value for o in series.observations],
                         index=pd.to_datetime([o.at for o in series.observations], utc=True), dtype='float64').sort_index()
    if observed.index.has_duplicates:
        raise ValueError('Duplicate observation timestamps')
    seconds = SECONDS[settings.interval]
    offsets = (observed.index-observed.index[0]).total_seconds().to_numpy()/seconds
    common = {'entityId': str(series.entityId), 'key': series.key, 'measure': series.measure,
              'interval': settings.interval, 'horizon': settings.horizon,
              'observedRange': {'from': observed.index[0].isoformat(), 'to': observed.index[-1].isoformat()},
              'target': 'authorized disclosed demand cohort', 'limitations': LIMITATIONS.copy()}
    if np.any(np.abs(offsets-np.round(offsets)) > 1e-8):
        return {**common, 'status': 'unsupported_data', 'forecast': [], 'observations': [],
                'warnings': ['Off-grid irregular timestamps require explicit upstream aggregation; no observations were interpolated.']}
    span = int(offsets[-1])+1
    if span > 2048:
        raise ValueError('Observation range exceeds bounded grid')
    grid = pd.date_range(observed.index[0], periods=span, freq=pd.Timedelta(seconds=seconds))
    values = observed.reindex(grid).to_numpy()
    x = np.arange(span, dtype=float)
    mask = np.isfinite(values)
    count = int(mask.sum())
    quality = {'observed': count, 'expectedSlots': span, 'missing': span-count,
               'gridCompleteness': count/span, 'disclosureCoverage': settings.coverage}
    common['dataQuality'] = quality
    common['observations'] = [{'at': at.isoformat(), 'value': float(v) if np.isfinite(v) else None}
                              for at, v in zip(grid, values)]
    warnings = []
    if settings.coverage != 'declared-complete':
        warnings.append('Disclosure completeness is not established; results must not be called total company demand.')
    if span-count:
        warnings.append('Missing slots remain missing and are excluded from fitting/scoring, never replaced with zero transactions.')
    if count < 20 or count/span < 0.70:
        return {**common, 'status': 'insufficient_data', 'forecast': [], 'warnings': warnings + ['Need at least 20 observed intervals and 70% grid completeness.']}
    train_end, select_end = int(span*0.65), int(span*0.80)
    train = mask & (x < train_end)
    selection = mask & (x >= train_end) & (x < select_end)
    test = mask & (x >= select_end)
    if train.sum() < 10 or selection.sum() < 3 or test.sum() < 3:
        return {**common, 'status': 'insufficient_data', 'forecast': [], 'warnings': warnings + ['Insufficient chronological train/validation/test observations.']}
    period, scale = settings.seasonalPeriod, max(1, span-1)
    eligible_seasonal = bool(period and span >= 6*period and train.sum() >= max(3*period, 20))
    candidates = ['moving-average', 'level-regression', 'trend-regression']
    seasonal_p = None
    if eligible_seasonal:
        try:
            seasonal_p = seasonal_signal(x[train], values[train], period, scale)
            candidates.append('seasonal-regression')
        except ValueError:
            eligible_seasonal = False
            warnings.append('Missing seasonal phases make the seasonal candidate unidentifiable; it was not fitted.')
    if settings.method == 'seasonal-regression' and not eligible_seasonal:
        return {**common, 'status': 'insufficient_data', 'forecast': [],
                'warnings': warnings + ['Seasonal regression needs six observed cycles and at least three training cycles.']}
    scores = {}
    for method in candidates:
        model = fit(x[train], values[train], method, period, scale)
        scores[method] = metrics(values[selection], predict(model, x[selection], period, scale))
    if settings.method == 'auto':
        selected = min(['moving-average', 'level-regression'], key=lambda m: scores[m]['mae'])
        if scores['trend-regression']['mae'] < scores[selected]['mae']*0.95:
            selected = 'trend-regression'
        if eligible_seasonal and seasonal_p < 0.01 and scores['seasonal-regression']['mae'] < scores[selected]['mae']*0.90:
            selected = 'seasonal-regression'
    else:
        selected = settings.method
    before_test = mask & (x < select_end)
    test_model = fit(x[before_test], values[before_test], selected, period, scale)
    test_prediction = predict(test_model, x[test], period, scale)
    test_bands, _ = intervals(test_model, x[test], period, scale, settings.confidence)
    coverage = None if test_bands is None else float(np.mean([(low <= actual <= high) for (low, high), actual in zip(test_bands, values[test])]))
    baseline_scores = {}
    for method in ['last-value', 'moving-average', 'level-regression']:
        model = fit(x[before_test], values[before_test], method, period, scale)
        baseline_scores[method] = metrics(values[test], predict(model, x[test], period, scale))
    final = fit(x[mask], values[mask], selected, period, scale)
    future_x = np.arange(span, span+settings.horizon, dtype=float)
    prediction = np.maximum(0, predict(final, future_x, period, scale))
    bands, uncertainty = intervals(final, future_x, period, scale, settings.confidence)
    future_times = pd.date_range(grid[-1]+pd.Timedelta(seconds=seconds), periods=settings.horizon, freq=pd.Timedelta(seconds=seconds))
    if not uncertainty['supported']:
        warnings.append(uncertainty['reason'])
    if period and not eligible_seasonal:
        warnings.append('Requested seasonal candidate was not eligible; seasonality was not assumed.')
    return {**common, 'status': 'completed', 'model': {'id': selected, 'version': 1,
             'seasonalPeriod': period if selected == 'seasonal-regression' else None,
             'seasonalTrainingPValue': seasonal_p, 'selection': 'Chronological validation MAE with complexity/improvement safeguards.'},
            'forecast': [{'at': at.isoformat(), 'value': float(value),
                          'lower': None if bands is None else float(bands[j][0]),
                          'upper': None if bands is None else float(bands[j][1])}
                         for j, (at, value) in enumerate(zip(future_times, prediction))],
            'uncertainty': uncertainty, 'backtesting': {'trainingEnd': grid[train_end-1].isoformat(),
                'validationEnd': grid[select_end-1].isoformat(), 'testFrom': grid[select_end].isoformat(),
                'testTo': grid[-1].isoformat(), 'trainingCount': int(train.sum()), 'validationCount': int(selection.sum()),
                'testCount': int(test.sum()), 'validationScores': scores,
                'metrics': metrics(values[test], test_prediction), 'baselineComparisons': baseline_scores,
                'testPredictionIntervalCoverage': coverage, 'testPredictions': [float(v) for v in np.maximum(0, test_prediction)]},
            'warnings': warnings, 'limitations': LIMITATIONS + [
                'Final estimates refit on all observed history; the untouched test block is used only to report historical performance.',
                'Prediction intervals are conditional on the selected model/error assumptions; model-selection and structural-break uncertainty are not quantified.',
                'Negative predictions/interval lower bounds are clipped at the known nonnegative count boundary.']}


def forecast(parameters):
    settings = ForecastInput.model_validate(parameters)
    results = [one_series(s, settings) for s in settings.series]
    return {'status': 'completed' if all(r['status'] == 'completed' for r in results) else 'partial',
            'method': 'chronological-demand-forecast', 'methodVersion': 1,
            'series': results, 'horizon': settings.horizon, 'interval': settings.interval,
            'decisionExecuted': False, 'limitations': LIMITATIONS}
