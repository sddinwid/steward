import copy
import itertools
from types import SimpleNamespace
import numpy as np
import pytest
from pydantic import ValidationError
from steward_science.procurement import optimize, ProcurementInput, _checked_solution
from scipy.optimize import Bounds
from scipy.sparse import csc_array

A = '00000000-0000-4000-8000-000000000001'
B = '00000000-0000-4000-8000-000000000002'


def problem(quantities=(39, 37)):
    return {'currency': 'USD', 'entities': [
        {'entityId': e, 'currency': 'USD', 'baselineShippingCents': 1500, 'transitionCents': 200} for e in (A, B)],
        'requirements': [{'entityId': e, 'product': 'tee', 'quantity': q, 'baselineUnitCents': 700} for e, q in zip((A, B), quantities)],
        'suppliers': [{'id': 'shared', 'currency': 'USD', 'products': ['tee'], 'capacity': 12000, 'minimumUnits': 20,
                       'shippingCents': 1800, 'tiers': [{'minimumUnits': 0, 'unitCosts': {'tee': 700}}, {'minimumUnits': 40, 'unitCosts': {'tee': 630}}]}],
        'baselineExternalCents': sum(quantities)*700+3000}


def test_shared_original_deterministic_reference():
    r = optimize(problem())
    assert r['status'] == 'optimal'
    assert (r['baselineExternalCents'], r['proposedCostCents'], r['ecosystemBenefitCents']) == (56200, 50080, 6120)
    assert [i['allocatedShippingCents'] for i in r['impacts']] == [923, 877]
    assert [i['benefitCents'] for i in r['impacts']] == [3107, 3013]
    assert sum(i['benefitCents'] for i in r['impacts']) == r['ecosystemBenefitCents']
    assert r['internalTransferCents'] == 0 and not r['decisionExecuted']
    assert r['solver']['version'] == '1.12.0'


def test_capacity_and_integer_split():
    p = problem((3, 2))
    p['suppliers'][0].update(capacity=3, minimumUnits=1, shippingCents=10, tiers=[{'minimumUnits': 0, 'unitCosts': {'tee': 100}}])
    p['suppliers'].append({**copy.deepcopy(p['suppliers'][0]), 'id': 'second', 'capacity': 4, 'shippingCents': 11,
                           'tiers': [{'minimumUnits': 0, 'unitCosts': {'tee': 200}}]})
    r = optimize(p)
    assert [s['quantity'] for s in r['suppliers']] == [2, 3]  # sorted second, shared
    assert all(type(a['quantity']) is int for a in r['allocations'])
    assert r['proposedCostCents'] == 3*100+2*200+21+400
    assert 'capacity:shared' in r['bindingConstraints']
    p['maxSuppliersPerEntity'] = 1
    assert optimize(p)['status'] == 'optimal'


@pytest.mark.parametrize('change', ['capacity', 'minimumUnits', 'unsupported-product'])
def test_infeasibility_not_an_allocation(change):
    p = problem((2, 2))
    if change == 'capacity':
        p['suppliers'][0].update(capacity=3, minimumUnits=1)
    elif change == 'minimumUnits':
        p['suppliers'][0]['minimumUnits'] = 5
    else:
        p['suppliers'][0].update(products=['other'], tiers=[{'minimumUnits': 0, 'unitCosts': {'other': 1}}])
    r = optimize(p)
    assert r['status'] == 'infeasible' and r['allocations'] == []
    assert r['proposedCostCents'] is None and r['ecosystemBenefitCents'] is None


@pytest.mark.parametrize('quantities,tier', [((19, 20), 0), ((20, 20), 1)])
def test_discount_threshold(quantities, tier):
    r = optimize(problem(quantities))
    assert r['suppliers'][0]['tier'] == tier
    assert r['allocations'][0]['unitCents'] == (700 if tier == 0 else 630)


def test_fixed_shipping_dominates_cheaper_unit_quote():
    p = problem((10, 10))
    p['suppliers'][0].update(minimumUnits=1, shippingCents=10, tiers=[{'minimumUnits': 0, 'unitCosts': {'tee': 100}}])
    p['suppliers'].append({**copy.deepcopy(p['suppliers'][0]), 'id': 'cheaper', 'shippingCents': 500,
                           'tiers': [{'minimumUnits': 0, 'unitCosts': {'tee': 99}}]})
    r = optimize(p)
    assert r['shippingCents'] == 10 and {a['supplierId'] for a in r['allocations']} == {'shared'}


def test_multiple_products_transition_once_and_compatibility():
    p = problem((10, 10))
    p['requirements'].append({'entityId': A, 'product': 'hat', 'quantity': 5, 'baselineUnitCents': 500})
    p['baselineExternalCents'] += 2500
    p['suppliers'].append({'id': 'hats', 'currency': 'USD', 'products': ['hat'], 'capacity': 5, 'minimumUnits': 1,
                           'shippingCents': 100, 'tiers': [{'minimumUnits': 0, 'unitCosts': {'hat': 450}}]})
    r = optimize(p)
    assert r['status'] == 'optimal' and r['transitionCostCents'] == 400
    assert next(a for a in r['allocations'] if a['product'] == 'hat')['supplierId'] == 'hats'
    p['maxSuppliersPerEntity'] = 1
    assert optimize(p)['status'] == 'infeasible'


def test_entity_conflict_despite_overall_benefit():
    p = problem((1, 1))
    for e in p['entities']:
        e.update(baselineShippingCents=0, transitionCents=0)
    p['requirements'][0]['baselineUnitCents'] = 100
    p['requirements'][1]['baselineUnitCents'] = 10000
    p['baselineExternalCents'] = 10100
    p['suppliers'][0].update(minimumUnits=1, shippingCents=0, tiers=[{'minimumUnits': 0, 'unitCosts': {'tee': 1000}}])
    r = optimize(p)
    assert r['ecosystemBenefitCents'] == 8100 and r['requiresEntityReview']
    assert r['impacts'][0]['benefitCents'] == -900 and r['impacts'][0]['disadvantaged']


def test_zero_benefit_and_repeatability():
    p = problem((20, 20))
    p['suppliers'][0].update(shippingCents=2600, tiers=[{'minimumUnits': 0, 'unitCosts': {'tee': 700}}])
    first = optimize(p)
    assert first['ecosystemBenefitCents'] == 0
    assert first == optimize(p)


@pytest.mark.parametrize('change', ['currency', 'fraction', 'bool', 'baseline', 'duplicate', 'unknown-constraint', 'price-fraction'])
def test_invalid_inputs(change):
    p = problem()
    if change == 'currency': p['suppliers'][0]['currency'] = 'EUR'
    if change == 'fraction': p['requirements'][0]['quantity'] = 1.5
    if change == 'bool': p['requirements'][0]['quantity'] = True
    if change == 'baseline': p['baselineExternalCents'] -= 1
    if change == 'duplicate': p['requirements'].append(copy.deepcopy(p['requirements'][0]))
    if change == 'unknown-constraint': p['allowUnapprovedSupplier'] = True
    if change == 'price-fraction': p['suppliers'][0]['tiers'][0]['unitCosts']['tee'] = 1.1
    with pytest.raises(ValidationError): ProcurementInput.model_validate(p)


def test_independently_enumerated_fixed_charge_cases():
    for q, cap, price, shipping in itertools.product((2, 5, 7), (2, 5), (3, 7), (0, 11)):
        p = problem((q, 1))
        p['suppliers'][0].update(minimumUnits=1, capacity=cap, shippingCents=shipping,
                                  tiers=[{'minimumUnits': 0, 'unitCosts': {'tee': price}}])
        p['suppliers'].append({**copy.deepcopy(p['suppliers'][0]), 'id': 'fallback', 'capacity': 100,
                               'shippingCents': 5, 'tiers': [{'minimumUnits': 0, 'unitCosts': {'tee': 8}}]})
        independent = min(n*price+(shipping if n else 0)+(q+1-n)*8+(5 if n < q+1 else 0)
                          for n in range(min(cap, q+1)+1)) + 400
        assert optimize(p)['proposedCostCents'] == independent


@pytest.mark.parametrize('values,fun', [([0.5], 0.5), ([2], 2), ([float('nan')], 0), ([1], 2)])
def test_rejects_invalid_solver_incumbents(values, fun):
    with pytest.raises(ValueError, match='SOLVER_RESULT_INVALID'):
        _checked_solution(SimpleNamespace(x=values, fun=fun), csc_array([[1.]]), np.array([1.]), np.array([1.]), Bounds([0], [1]), np.array([1.]))


def test_large_exact_cent_reconciliation():
    p = problem((50000, 50000))
    p['suppliers'][0].update(capacity=100000, shippingCents=99999999,
                           tiers=[{'minimumUnits': 0, 'unitCosts': {'tee': 9999999}}])
    r = optimize(p)
    assert r['proposedCostCents'] == 100000*9999999+99999999+400
    assert sum(i['benefitCents'] for i in r['impacts']) == r['ecosystemBenefitCents']
