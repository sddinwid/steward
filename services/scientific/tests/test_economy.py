import copy
from datetime import date
import pytest
from pydantic import ValidationError
from steward_science.economy import allocate, compare_economy
from steward_science.contracts import Request

A = '00000000-0000-4000-8000-000000000001'
B = '00000000-0000-4000-8000-000000000002'
H = '00000000-0000-4000-8000-000000000011'
F = '00000000-0000-4000-8000-000000000012'
R = '00000000-0000-4000-8000-000000000013'


def fixture():
    return {'currency': 'USD', 'horizon': '30-days', 'periods': [{'start': '2026-11-01', 'end': '2026-12-01'}],
            'sources': [{'entityId': A, 'currency': 'USD', 'cashCents': 10000, 'obligationsCents': 1000,
                         'restrictedCents': 1000, 'existingCommitmentsCents': 1000, 'futureRequirementCents': 1000,
                         'reserveCents': 2000, 'approvedAvailableCents': 4000, 'generationCents': [0],
                         'operatingCents': [1000], 'protectedOperatingCents': [1000], 'eligibleProgramIds': [H, F],
                         'assumption': 'Synthetic already protected operating costs; no assumed new earnings.'}],
            'programs': [{'programId': pid, 'entityId': B, 'currency': 'USD', 'service': service, 'unit': unit,
                          'spendableReceivedCents': 0, 'operatingCents': [500], 'unitCostCents': [cost],
                          'maximumUnits': [10], 'minimumUnits': [0], 'budgetCents': [10000],
                          'assumption': 'Explicit synthetic incremental unit cost and capacity; not observed outcomes.'}
                         for pid, service, unit, cost in [(H, 'housing', 'placement-months', 1000), (F, 'food', 'meal-bundles', 100)]],
            'resources': [], 'priorities': ['housing', 'food'],
            'assumptionBasis': 'explicit-reviewed-synthetic-planning', 'synthetic': True}


def test_independent_exact_reference_reserves_minimum_costs_and_tradeoffs():
    p = fixture()
    result = allocate(p)
    assert result['status'] == 'optimal'
    effects = {v['programId']: v for v in result['programEffects']}
    assert effects[H]['additionalUnits'] == 3
    assert effects[F]['additionalUnits'] == 0
    assert result['proposedContributionCents'] == 4000
    assert result['sourceEffects'][0]['remainingUnallocatedCents'] == 0
    assert result['sourceEffects'][0]['protectedReserveCents'] == 2000
    assert result['newEcosystemIncomeFromAllocationsCents'] == 0
    assert result['decisionExecuted'] is False
    p['priorities'].reverse()
    alternative = allocate(p)
    effects = {v['programId']: v for v in alternative['programEffects']}
    assert effects[F]['additionalUnits'] == 10
    assert effects[H]['additionalUnits'] == 2


def test_restrictions_minima_and_reserve_shortfalls_report_infeasible():
    p = fixture()
    p['sources'][0]['eligibleProgramIds'] = [H]
    assert allocate(p)['status'] == 'infeasible'  # Food minimum operating cost is still required.
    p = fixture()
    p['programs'][0]['minimumUnits'] = [4]
    assert allocate(p)['status'] == 'infeasible'
    p = fixture()
    p['sources'][0]['cashCents'] = 5000
    p['sources'][0]['approvedAvailableCents'] = 0
    result = allocate(p)
    assert result['status'] == 'infeasible'
    assert result['constraints'] == ['current-protected-requirements']


def test_received_program_funds_reduce_new_contributions_without_becoming_new_income():
    p = fixture()
    p['programs'][0]['spendableReceivedCents'] = 1000
    result = allocate(p)
    assert result['status'] == 'optimal'
    assert result['programEffects'][0]['additionalUnits'] == 4
    assert sum(a['amountCents'] for a in result['allocations']) == 4000
    assert sum(e['remainingProgramCents'] for e in result['programEffects']) == 0


def test_consumable_horizon_and_reusable_period_capacity_are_distinct():
    p = fixture()
    p['resources'] = [{'resourceId': R, 'ownerEntityId': A, 'unit': 'staff-hours', 'mode': 'consumable',
                       'availableUnits': [20], 'totalConsumableUnits': 2, 'unitsPerService': {H: 1},
                       'valuationBasis': 'unknown', 'assumption': 'Synthetic staff time is a finite horizon budget, never reusable cash.'}]
    result = allocate(p)
    assert result['programEffects'][0]['additionalUnits'] == 2
    assert result['programEffects'][1]['additionalUnits'] == 10
    p['resources'][0].update(mode='reusable', totalConsumableUnits=None, availableUnits=[1])
    assert allocate(p)['programEffects'][0]['additionalUnits'] == 1


def test_unknown_cost_or_cash_is_insufficient_not_zero():
    for key in ['cashCents', 'approvedAvailableCents']:
        p = fixture()
        p['sources'][0][key] = None
        assert allocate(p)['status'] == 'insufficient_data'
    p = fixture()
    p['programs'][0]['unitCostCents'] = [None]
    assert allocate(p)['status'] == 'insufficient_data'


def test_closed_inputs_reject_currency_duplicates_false_approval_and_double_protection():
    for change in ['currency', 'duplicate', 'approval', 'coverage', 'float', 'private']:
        p = fixture()
        if change == 'currency': p['programs'][0]['currency'] = 'EUR'
        if change == 'duplicate': p['sources'].append(copy.deepcopy(p['sources'][0]))
        if change == 'approval': p['sources'][0]['approvedAvailableCents'] = 4001
        if change == 'coverage': p['sources'][0]['protectedOperatingCents'] = [1001]
        if change == 'float': p['programs'][0]['unitCostCents'] = [0.1]
        if change == 'private': p['participantName'] = 'Forbidden'
        with pytest.raises(ValidationError): allocate(p)


def test_period_boundaries_horizon_cash_conservation_and_no_double_deduction():
    p = fixture()
    p['horizon'] = '90-days'
    p['periods'] = [{'start': a, 'end': b} for a, b in [('2026-11-01', '2026-12-01'), ('2026-12-01', '2026-12-31'), ('2026-12-31', '2027-01-30')]]
    source = p['sources'][0]
    source.update(generationCents=[0, 4000, 4000], operatingCents=[1000]*3, protectedOperatingCents=[1000, 0, 0])
    for q in p['programs']:
        for key in ['operatingCents', 'unitCostCents', 'maximumUnits', 'minimumUnits', 'budgetCents']:
            q[key] *= 3
    result = allocate(p)
    assert result['status'] == 'optimal'
    assert sum(v['contributionCents'] for v in result['sourceEffects']) == 10000
    assert result['sourceEffects'][-1]['remainingUnallocatedCents'] == 0
    # Initial 4000 plus hypothetical 8000 generation minus incremental 2000 opex.
    source['generationCents'] = [0, 0, 0]
    assert allocate(p)['status'] == 'infeasible'
    p['periods'][-1]['end'] = '2027-01-31'
    with pytest.raises(ValidationError): allocate(p)


def test_twelve_month_calendar_and_temporal_noncash_consumption():
    p = fixture()
    p['horizon'] = '12-months'
    p['periods'] = [{'start': date(2026 + (i // 12), i % 12 + 1, 1).isoformat(), 'end': date(2026 + ((i+1)//12), (i+1)%12 + 1, 1).isoformat()} for i in range(12)]
    p['sources'][0].update(generationCents=[4000]*12, operatingCents=[1000]*12, protectedOperatingCents=[1000]+[0]*11)
    for q in p['programs']:
        for key in ['operatingCents', 'unitCostCents', 'maximumUnits', 'minimumUnits', 'budgetCents']:
            q[key] *= 12
    p['resources'] = [{'resourceId': R, 'ownerEntityId': A, 'unit': 'hours', 'mode': 'consumable', 'availableUnits': [10]*12,
                       'totalConsumableUnits': 5, 'unitsPerService': {H: 1}, 'valuationBasis': 'unknown',
                       'assumption': 'Synthetic five-hour total across twelve months; cannot reuse consumed time.'}]
    result = allocate(p)
    assert result['status'] == 'optimal'
    assert sum(q['additionalUnits'] for q in result['programEffects'] if q['programId'] == H) == 5
    assert all(v['remainingUnallocatedCents'] >= 0 for v in result['sourceEffects'])


def test_explicit_scenarios_sensitivity_and_repeatability_preserve_current_cash():
    p = fixture()
    p['sources'][0]['generationCents'] = [1000]
    scenarios = [{'name': name, 'generationBasisPoints': generation, 'costBasisPoints': cost,
                  'assumption': 'Explicit synthetic deterministic what-if; no probability is asserted.'}
                 for name, generation, cost in [('conservative', 8000, 12000), ('baseline', 10000, 10000), ('expansion', 12000, 10000), ('sensitivity', 5000, 15000)]]
    result = compare_economy({'baseline': p, 'scenarios': scenarios})
    assert result['status'] == 'completed'
    first = result['scenarios'][0]['calculation']['programEffects'][0]['additionalUnits']
    last = result['scenarios'][2]['calculation']['programEffects'][0]['additionalUnits']
    assert first <= last
    assert result == compare_economy({'baseline': p, 'scenarios': scenarios})
    scenarios[1]['generationBasisPoints'] = 11000
    with pytest.raises(ValidationError): compare_economy({'baseline': p, 'scenarios': scenarios})


def test_authenticated_request_scope_includes_all_financial_owners():
    request = {'schemaVersion': 1, 'jobId': R, 'principalId': H, 'entityIds': [A], 'capability': 'economic-allocation',
               'parameters': fixture(), 'executionMillis': 6000, 'provenance': {'datasetId': F, 'synthetic': True,
               'basis': 'authorized-synchronized-projection', 'asOf': '2026-11-01T00:00:00Z', 'references': []}}
    with pytest.raises(ValidationError): Request.model_validate(request)
    request['entityIds'].append(B)
    assert Request.model_validate(request).capability == 'economic-allocation'


def test_authenticated_process_supervised_economic_http_and_replay_protection(tmp_path):
    import hashlib
    import hmac
    import json
    import secrets
    import time
    from fastapi.testclient import TestClient
    from steward_science.app import create_app
    key = secrets.token_hex(32).encode()
    secret = tmp_path / 'science-key'
    secret.write_bytes(key)
    data = {'schemaVersion': 1, 'jobId': R, 'principalId': H, 'entityIds': [A, B], 'capability': 'economic-allocation',
            'parameters': fixture(), 'executionMillis': 6000, 'provenance': {'datasetId': F, 'synthetic': True,
            'basis': 'authorized-synchronized-projection', 'asOf': '2026-11-01T00:00:00Z', 'references': []}}
    raw = json.dumps(data).encode()
    stamp, nonce = str(int(time.time())), secrets.token_hex(16)
    signature = hmac.new(key, stamp.encode()+b'\n'+nonce.encode()+b'\nPOST\n/v1/execute\n'+raw, hashlib.sha256).hexdigest()
    headers = {'x-steward-timestamp': stamp, 'x-steward-nonce': nonce, 'x-steward-signature': signature}
    with TestClient(create_app(secret)) as client:
        response = client.post('/v1/execute', content=raw, headers=headers)
        assert response.status_code == 200, response.text
        result = response.json()
        assert result['engine']['version'] == '1.2.0'
        assert result['calculation']['status'] == 'optimal'
        assert result['calculation']['proposedContributionCents'] == 4000
        assert result['decisionExecuted'] is False
        assert result['elapsedMillis'] < 6000
        assert client.post('/v1/execute', content=raw, headers=headers).status_code == 409


def test_multiple_sources_remain_independent_and_follow_explicit_programme_restrictions():
    p = fixture()
    third = '00000000-0000-4000-8000-000000000003'
    second = copy.deepcopy(p['sources'][0])
    second.update(entityId=third, cashCents=2000, obligationsCents=0, restrictedCents=0,
                  existingCommitmentsCents=0, futureRequirementCents=0, reserveCents=0,
                  approvedAvailableCents=2000, operatingCents=[0], protectedOperatingCents=[0], eligibleProgramIds=[F])
    p['sources'][0]['eligibleProgramIds'] = [H]
    p['sources'].append(second)
    result = allocate(p)
    assert result['status'] == 'optimal'
    assert result['programEffects'][0]['additionalUnits'] == 3
    assert result['programEffects'][1]['additionalUnits'] == 10
    assert result['proposedContributionCents'] == 5000
    assert all(a['programId'] == (H if a['sourceEntityId'] == A else F) for a in result['allocations'])
    assert sum(e['remainingUnallocatedCents'] for e in result['sourceEffects']) == 1000
    assert result['sourceEffects'][0]['protectedReserveCents'] == 2000


def test_zero_cost_is_bounded_by_real_capacity_and_invalid_calendar_intervals_fail():
    p = fixture()
    p['programs'][0]['unitCostCents'] = [0]
    assert allocate(p)['programEffects'][0]['additionalUnits'] == 10
    p['resources'] = [{'resourceId': R, 'ownerEntityId': A, 'unit': 'physical-units', 'mode': 'reusable',
                       'availableUnits': [0], 'totalConsumableUnits': None, 'unitsPerService': {H: 1},
                       'valuationBasis': 'unknown', 'assumption': 'Zero known physical availability prevents free unlimited services.'}]
    assert allocate(p)['programEffects'][0]['additionalUnits'] == 0
    p['horizon'] = '12-months'
    with pytest.raises(ValidationError): allocate(p)


def test_month_end_and_leap_anniversaries_preserve_exact_calendar_horizons():
    import calendar
    from steward_science.economy import EconomyInput
    for first in [date(2024, 2, 29), date(2026, 1, 31)]:
        p = fixture()
        def boundary(offset):
            year, month = divmod(first.year * 12 + first.month - 1 + offset, 12)
            month += 1
            return date(year, month, min(first.day, calendar.monthrange(year, month)[1])).isoformat()
        p['horizon'] = '12-months'
        p['periods'] = [{'start': boundary(i), 'end': boundary(i+1)} for i in range(12)]
        p['sources'][0].update(generationCents=[4000]*12, operatingCents=[1000]*12, protectedOperatingCents=[1000]+[0]*11)
        for q in p['programs']:
            for key in ['operatingCents', 'unitCostCents', 'maximumUnits', 'minimumUnits', 'budgetCents']:
                q[key] *= 12
        assert len(EconomyInput.model_validate(p).periods) == 12
