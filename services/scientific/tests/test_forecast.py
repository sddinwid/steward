from datetime import datetime, timedelta, timezone
from uuid import uuid4
import numpy as np
import pytest
from steward_science.forecast import forecast


def data(kind='trend', seed=7, count=168, **changes):
    rng = np.random.default_rng(seed)
    x = np.arange(count)
    mean = np.full(count, 100.)
    if kind in ['trend', 'seasonal']:
        mean += x*0.6
    if kind == 'seasonal':
        mean += np.array([0, 8, 22, 40, 25, 5, -8])[x % 7]
    y = np.maximum(0, np.round(mean+rng.normal(0, 3, count)))
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    body = {'series': [{'entityId': str(uuid4()), 'key': 'all-orders', 'measure': 'orders',
                       'observations': [{'at': (start+timedelta(days=int(i))).isoformat(), 'value': float(v)} for i, v in enumerate(y)]}],
            'interval': 'day', 'horizon': 14, 'method': 'auto', 'seasonalPeriod': 7,
            'coverage': 'declared-complete', **changes}
    return body


def one(body):
    return forecast(body)['series'][0]


def test_known_trend_and_untouched_baseline_comparison():
    r = one(data())
    assert r['status'] == 'completed'
    assert r['model']['id'] == 'trend-regression'
    assert r['backtesting']['metrics']['mae'] < r['backtesting']['baselineComparisons']['last-value']['mae']
    assert r['forecast'][-1]['value'] > r['forecast'][0]['value']
    assert r['forecast'][0]['at'] > r['observedRange']['to']


def test_stable_demand_does_not_invent_seasonality():
    r = one(data('stable'))
    assert r['model']['id'] in ['moving-average', 'level-regression']
    assert abs(np.mean([p['value'] for p in r['forecast']])-100) < 3


def test_known_seasonality_requires_history_and_improvement():
    r = one(data('seasonal'))
    assert r['model']['id'] == 'seasonal-regression'
    assert r['model']['seasonalTrainingPValue'] < .01
    assert r['backtesting']['metrics']['mae'] < 5
    short = one(data('seasonal', count=28, method='seasonal-regression'))
    assert short['status'] == 'insufficient_data'
    assert not short['forecast']


def test_missing_intervals_are_not_zero_and_sparse_data_is_insufficient():
    body = data()
    del body['series'][0]['observations'][20]
    body['series'][0]['observations'][30]['value'] = None
    r = one(body)
    assert r['dataQuality']['missing'] == 2
    assert sum(o['value'] is None for o in r['observations']) == 2
    assert r['status'] == 'completed'
    body['series'][0]['observations'] = body['series'][0]['observations'][::3]
    assert one(body)['status'] == 'insufficient_data'


def test_off_grid_irregular_data_requires_explicit_aggregation():
    body = data()
    body['series'][0]['observations'][5]['at'] = '2025-01-06T12:00:00Z'
    r = one(body)
    assert r['status'] == 'unsupported_data' and not r['forecast']


def test_short_live_history_does_not_create_monthly_predictions():
    r = one(data(count=3, horizon=30))
    assert r['status'] == 'insufficient_data' and r['forecast'] == []


def test_backtest_no_lookahead_or_model_selection_leakage():
    body = data()
    original = one(body)
    # Replace only final test outcomes. Neither selected model nor test predictions may change.
    for o in body['series'][0]['observations'][int(168*.80):]:
        o['value'] += 500
    changed = one(body)
    assert changed['model']['id'] == original['model']['id']
    assert changed['backtesting']['testPredictions'] == original['backtesting']['testPredictions']
    assert changed['backtesting']['metrics']['mae'] > 400


def test_reproducible_and_prediction_interval_is_not_an_arbitrary_band():
    body = data(method='trend-regression')
    r = one(body)
    assert one(body) == r
    assert r['uncertainty']['supported']
    assert r['forecast'][-1]['upper']-r['forecast'][-1]['lower'] > r['forecast'][0]['upper']-r['forecast'][0]['lower']
    assert all(p['lower'] <= p['value'] <= p['upper'] for p in r['forecast'])


def test_interval_behavior_across_known_independent_noise_scenarios():
    covered = total = supported = 0
    # Independent known synthetic trend/noise experiments; no fit/test data reused for tuning bands.
    for seed in range(30):
        r = one(data(seed=seed, method='trend-regression'))
        coverage = r['backtesting']['testPredictionIntervalCoverage']
        if coverage is not None:
            covered += coverage*r['backtesting']['testCount']
            total += r['backtesting']['testCount']
            supported += 1
    assert supported >= 20
    assert .83 < covered/total < .96


def test_serially_correlated_errors_do_not_get_validated_intervals():
    body = data(method='trend-regression')
    for i, row in enumerate(body['series'][0]['observations']):
        row['value'] = float(round(100+i*.4+12*np.sin(i/6)))
    r = one(body)
    assert not r['uncertainty']['supported']
    assert r['forecast'][0]['lower'] is None


@pytest.mark.parametrize('change', [{'horizon': 57}, {'interval': 'month'}, {'seasonalPeriod': 0}])
def test_invalid_assumptions_rejected(change):
    with pytest.raises(ValueError):
        forecast(data(**change))


def test_duplicate_timestamps_and_nonfinite_demand_rejected():
    body = data()
    body['series'][0]['observations'][1] = body['series'][0]['observations'][0]
    with pytest.raises(ValueError):
        forecast(body)
    body = data()
    body['series'][0]['observations'][1]['value'] = float('inf')
    with pytest.raises(ValueError):
        forecast(body)


def test_missing_entire_seasonal_phase_falls_back_without_fabricating_a_fit():
    body = data()
    body['series'][0]['observations'] = [o for i, o in enumerate(body['series'][0]['observations']) if i % 7 != 3]
    r = one(body)
    assert r['status'] == 'completed'
    assert r['model']['id'] != 'seasonal-regression'
    assert any('unidentifiable' in w for w in r['warnings'])


def test_timezone_offsets_are_normalized_to_the_same_instants():
    body = data()
    expected = one(body)
    at = datetime.fromisoformat(body['series'][0]['observations'][1]['at'])
    body['series'][0]['observations'][1]['at'] = at.astimezone(timezone(timedelta(hours=3))).isoformat()
    assert one(body) == expected
