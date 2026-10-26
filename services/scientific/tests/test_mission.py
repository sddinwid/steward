import pytest
from pydantic import ValidationError
from steward_science.mission import sustain


def fixture(**changes):
    return {'currency': 'USD', 'approvedAvailableCents': 10000, 'incrementalUnitCostCents': 333,
            'maximumAdditionalUnits': 100, 'capacityConstraints': [
                {'name': 'housing-units', 'availableUnits': 20, 'unitsPerService': 1},
                {'name': 'staff-support', 'availableUnits': 12, 'unitsPerService': 2}],
            'suppressed': False, 'assumptionBasis': 'explicit-planning-assumptions', **changes}


def test_exact_capacity_and_cent_reconciliation():
    r = sustain(fixture())
    assert r['status'] == 'completed'
    assert r['maximumAdditionalUnits'] == 6
    assert r['additionalCostCents'] == 1998
    assert r['remainingApprovedCents'] == 8002
    assert r['bindingConstraints'] == ['staff-support']
    assert r['solver']['exactIntegerReconciliation'] is True


def test_funding_and_zero_cost_remain_bounded():
    assert sustain(fixture(approvedAvailableCents=1000))['maximumAdditionalUnits'] == 3
    assert sustain(fixture(incrementalUnitCostCents=0, maximumAdditionalUnits=4))['maximumAdditionalUnits'] == 4
    assert sustain(fixture(approvedAvailableCents=0))['maximumAdditionalUnits'] == 0


def test_missing_information_does_not_create_funding_or_capacity():
    for changes in [{'approvedAvailableCents': None}, {'incrementalUnitCostCents': None},
                    {'capacityConstraints': [{'name': 'meals', 'availableUnits': None, 'unitsPerService': 1}]}]:
        r = sustain(fixture(**changes))
        assert r['status'] == 'insufficient_data'
        assert r['maximumAdditionalUnits'] is None


def test_closed_synthetic_model_rejects_people_scores_suppressed_data_and_unbounded_solver():
    for changes in [{'participantName': 'Forbidden'}, {'suppressed': True}, {'maximumAdditionalUnits': 10001},
                    {'approvedAvailableCents': -1}, {'incrementalUnitCostCents': 1.5}, {'solverSeconds': 999}]:
        with pytest.raises(ValidationError):
            sustain(fixture(**changes))
