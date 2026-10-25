"""Explicit deterministic counterfactuals; ranges are not probabilities."""
import copy
from typing import Literal
from pydantic import Field, model_validator
from .contracts import Closed
from .procurement import ProcurementInput, optimize


class Changes(Closed):
    demandBasisPoints: int = Field(strict=True, ge=100, le=30000, default=10000)
    supplierPriceBasisPoints: int = Field(strict=True, ge=0, le=30000, default=10000)
    shippingBasisPoints: int = Field(strict=True, ge=0, le=30000, default=10000)
    capacityBasisPoints: int = Field(strict=True, ge=0, le=30000, default=10000)
    transitionBasisPoints: int = Field(strict=True, ge=0, le=30000, default=10000)
    supplierIds: list[str] = Field(max_length=6, default_factory=list)

    @model_validator(mode='after')
    def unique_suppliers(self):
        if len(set(self.supplierIds)) != len(self.supplierIds) or any(not 1 <= len(s) <= 120 for s in self.supplierIds):
            raise ValueError('Invalid supplier selector')
        return self


class Scenario(Closed):
    name: str = Field(min_length=1, max_length=80)
    changes: Changes


class Sensitivity(Closed):
    parameter: Literal['demandBasisPoints', 'supplierPriceBasisPoints', 'shippingBasisPoints', 'capacityBasisPoints', 'transitionBasisPoints']
    startBasisPoints: int = Field(strict=True, ge=0, le=30000)
    endBasisPoints: int = Field(strict=True, ge=0, le=30000)
    steps: int = Field(strict=True, ge=2, le=5)

    @model_validator(mode='after')
    def ordered(self):
        if self.startBasisPoints >= self.endBasisPoints or (self.parameter == 'demandBasisPoints' and self.startBasisPoints < 100):
            raise ValueError('Invalid sensitivity range')
        return self


class ScenarioInput(Closed):
    baseline: ProcurementInput
    scenarios: list[Scenario] = Field(min_length=1, max_length=4)
    sensitivity: Sensitivity | None = None

    @model_validator(mode='after')
    def names(self):
        if len({s.name for s in self.scenarios}) != len(self.scenarios):
            raise ValueError('Duplicate scenario name')
        suppliers = {s.id for s in self.baseline.suppliers}
        if any(set(s.changes.supplierIds) - suppliers for s in self.scenarios):
            raise ValueError('Unknown supplier in scenario')
        return self


def changed_problem(baseline, changes):
    p = copy.deepcopy(baseline)
    def cents(value, bps):
        return (value*bps+9999)//10000
    for r in p['requirements']:
        r['quantity'] = cents(r['quantity'], changes.demandBasisPoints)
    for e in p['entities']:
        e['transitionCents'] = cents(e['transitionCents'], changes.transitionBasisPoints)
    for s in p['suppliers']:
        if changes.supplierIds and s['id'] not in changes.supplierIds:
            continue
        s['capacity'] = s['capacity']*changes.capacityBasisPoints//10000
        s['shippingCents'] = cents(s['shippingCents'], changes.shippingBasisPoints)
        for tier in s['tiers']:
            tier['unitCosts'] = {key: cents(price, changes.supplierPriceBasisPoints) for key, price in tier['unitCosts'].items()}
    # Baseline arithmetic is reconciliation of the caller's same-demand reference,
    # not a second opportunity detector or optimizer.
    p['baselineExternalCents'] = sum(r['quantity']*r['baselineUnitCents'] for r in p['requirements']) + sum(e['baselineShippingCents'] for e in p['entities'])
    p['solverSeconds'] = min(p.get('solverSeconds', 2), 0.75)
    return ProcurementInput.model_validate(p).model_dump(mode='json')


def compare(parameters):
    p = ScenarioInput.model_validate(parameters)
    baseline = p.baseline.model_dump(mode='json')
    baseline['solverSeconds'] = min(baseline['solverSeconds'], 0.75)
    coordinated = optimize(baseline)
    cases = [(s.name, s.changes, 'declared-scenario') for s in p.scenarios]
    if p.sensitivity:
        s = p.sensitivity
        for i in range(s.steps):
            value = s.startBasisPoints + (s.endBasisPoints-s.startBasisPoints)*i//(s.steps-1)
            cases.append((f'{s.parameter} = {value}/10000', Changes(**{s.parameter: value}), 'sensitivity'))
    results = []
    for name, changes, kind in cases:
        problem = changed_problem(baseline, changes)
        result = optimize(problem)
        cost, original = result['proposedCostCents'], coordinated['proposedCostCents']
        original_impacts = {i['entityId']: i for i in coordinated['impacts']}
        results.append({'name': name, 'kind': kind, 'assumptions': changes.model_dump(),
                        'requiredQuantity': sum(r['quantity'] for r in problem['requirements']),
                        'status': result['status'], 'feasible': result['status'] in ('optimal', 'feasible_not_proven_optimal'),
                        'sameDemandBaselineExternalCents': result['baselineExternalCents'],
                        'expectedCostCents': cost, 'benefitVersusSameDemandBaselineCents': result['ecosystemBenefitCents'],
                        'costChangeFromCoordinatedBaselineCents': cost-original if cost is not None and original is not None else None,
                        'entityImplications': [{**i, 'costChangeFromCoordinatedBaselineCents': i['proposedCostCents']-original_impacts[i['entityId']]['proposedCostCents'] if i['entityId'] in original_impacts else None} for i in result['impacts']],
                        'calculation': result})
    return {'method': 'deterministic-procurement-sensitivity', 'methodVersion': 1, 'status': 'completed',
            'currency': baseline['currency'], 'existingArrangements': {'costCents': baseline['baselineExternalCents'], 'status': 'reference_not_optimized'},
            'coordinatedBaseline': coordinated, 'scenarios': results, 'decisionExecuted': False,
            'limitations': ['Counterfactual input ranges are declared assumptions, not probability distributions or forecast intervals.',
                            'Demand changes are conditional integer requirements; this calculation does not estimate their likelihood.',
                            'Quantities and expense multipliers round up; capacity rounds down. Tier thresholds and MOQ remain unchanged.',
                            'A demand change has its own same-demand existing-arrangement baseline; absolute cost differences alone do not imply savings.',
                            'No business change is approved or executed. Full provenance is retained by the enclosing scientific run.']}
