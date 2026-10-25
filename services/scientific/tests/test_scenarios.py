import copy
import pytest
from pydantic import ValidationError
from steward_science.scenarios import compare, ScenarioInput
from test_procurement import problem


def request():
    return {'baseline': problem(), 'scenarios': [
        {'name': 'Unchanged', 'changes': {}},
        {'name': 'Demand +20%', 'changes': {'demandBasisPoints': 12000}},
        {'name': 'Demand -20%', 'changes': {'demandBasisPoints': 8000}},
        {'name': 'Capacity restricted', 'changes': {'capacityBasisPoints': 50}}]}


def test_baseline_demand_and_infeasibility():
    r = compare(request())
    assert r['existingArrangements']['costCents'] == 56200
    unchanged, increased, reduced, constrained = r['scenarios']
    assert unchanged['expectedCostCents'] == 50080 and unchanged['costChangeFromCoordinatedBaselineCents'] == 0
    assert increased['requiredQuantity'] == 47+45
    assert increased['expectedCostCents'] == 92*630+1800+400
    assert increased['sameDemandBaselineExternalCents'] == 92*700+3000
    assert reduced['requiredQuantity'] == 32+30
    assert constrained['status'] == 'infeasible' and constrained['expectedCostCents'] is None
    assert constrained['costChangeFromCoordinatedBaselineCents'] is None


@pytest.mark.parametrize('parameter,expected', [
    ('supplierPriceBasisPoints', [50080, 52512, 54868]),
    ('shippingBasisPoints', [50080, 50170, 50260]),
    ('transitionBasisPoints', [50080, 50100, 50120])])
def test_independent_sensitivity_references(parameter, expected):
    p = request()
    p['scenarios'] = p['scenarios'][:1]
    p['sensitivity'] = {'parameter': parameter, 'startBasisPoints': 10000, 'endBasisPoints': 11000, 'steps': 3}
    r = compare(p)
    assert [s['expectedCostCents'] for s in r['scenarios'][1:]] == expected
    assert r == compare(p)
    assert all(sum(i['benefitCents'] for i in s['entityImplications']) == s['benefitVersusSameDemandBaselineCents'] for s in r['scenarios'])


def test_targeted_supplier_change_does_not_mutate_original():
    p = request()
    original = copy.deepcopy(p)
    p['scenarios'] = [{'name': 'Selected supplier +10%', 'changes': {'supplierIds': ['shared'], 'supplierPriceBasisPoints': 11000}}]
    r = compare(p)
    assert p['baseline'] == original['baseline']
    assert r['scenarios'][0]['expectedCostCents'] == (693*76+2200)


@pytest.mark.parametrize('change', [
    {'scenarios': [{'name': 'Bad', 'changes': {'capacityBasisPoints': -1}}]},
    {'scenarios': [{'name': 'Bad', 'changes': {'demandBasisPoints': 1.5}}]},
    {'scenarios': [{'name': 'Bad', 'changes': {'supplierIds': ['unknown']}}]},
    {'scenarios': [{'name': 'Bad', 'changes': {'unapprovedProduction': True}}]},
    {'sensitivity': {'parameter': 'priceDistribution', 'startBasisPoints': 1, 'endBasisPoints': 2, 'steps': 2}},
    {'sensitivity': {'parameter': 'demandBasisPoints', 'startBasisPoints': 0, 'endBasisPoints': 2, 'steps': 2}},
    {'sensitivity': {'parameter': 'shippingBasisPoints', 'startBasisPoints': 10, 'endBasisPoints': 5, 'steps': 2}},
])
def test_invalid_assumptions_fail_closed(change):
    with pytest.raises(ValidationError):
        ScenarioInput.model_validate({**request(), **change})


def test_bounds_still_apply_after_scenario_expansion():
    p = request()
    p['baseline'] = problem((50000, 50000))
    with pytest.raises(ValidationError): compare(p)
