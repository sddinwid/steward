"""Bounded all-units-discount, fixed-charge integer procurement model.

No purchases are submitted. Monetary arithmetic outside the solver uses exact
integer cents; every solver incumbent is independently checked before reporting.
"""
from uuid import UUID
from typing import Annotated
import math
import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp
from scipy.sparse import csc_array
from pydantic import Field, model_validator
from .contracts import Closed


class Entity(Closed):
    entityId: UUID
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    baselineShippingCents: int = Field(strict=True, ge=0, le=100_000_000)
    transitionCents: int = Field(strict=True, ge=0, le=100_000_000)


class Requirement(Closed):
    entityId: UUID
    product: str = Field(min_length=1, max_length=120)
    quantity: int = Field(strict=True, ge=1, le=100_000)
    baselineUnitCents: int = Field(strict=True, ge=0, le=10_000_000)


class Tier(Closed):
    minimumUnits: int = Field(strict=True, ge=0, le=100_000)
    unitCosts: dict[str, Annotated[int, Field(strict=True, ge=0, le=10_000_000)]] = Field(min_length=1, max_length=4)

    @model_validator(mode='after')
    def money(self):
        if any(type(v) is not int or not 0 <= v <= 10_000_000 or not 1 <= len(k) <= 120
               for k, v in self.unitCosts.items()):
            raise ValueError('Invalid integer unit costs')
        return self


class Supplier(Closed):
    id: str = Field(min_length=1, max_length=120)
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    products: list[str] = Field(min_length=1, max_length=4)
    capacity: int = Field(strict=True, ge=0, le=100_000)
    minimumUnits: int = Field(strict=True, ge=0, le=100_000)
    shippingCents: int = Field(strict=True, ge=0, le=100_000_000)
    tiers: list[Tier] = Field(min_length=1, max_length=3)

    @model_validator(mode='after')
    def terms(self):
        if len(set(self.products)) != len(self.products) or any(not 1 <= len(p) <= 120 for p in self.products):
            raise ValueError('Invalid supplier products')
        thresholds = [t.minimumUnits for t in self.tiers]
        if thresholds != sorted(set(thresholds)) or any(set(t.unitCosts) != set(self.products) for t in self.tiers):
            raise ValueError('Tiers must be ordered and cover exactly declared products')
        return self


class ProcurementInput(Closed):
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    entities: list[Entity] = Field(min_length=1, max_length=8)
    requirements: list[Requirement] = Field(min_length=1, max_length=32)
    suppliers: list[Supplier] = Field(min_length=1, max_length=6)
    baselineExternalCents: int = Field(strict=True, ge=0, le=1_000_000_000_000)
    maxSuppliersPerEntity: int | None = Field(strict=True, ge=1, le=6, default=None)
    solverSeconds: float = Field(ge=0.1, le=3, default=2)

    @model_validator(mode='after')
    def valid_problem(self):
        ids = {e.entityId for e in self.entities}
        if len(ids) != len(self.entities) or len({s.id for s in self.suppliers}) != len(self.suppliers):
            raise ValueError('Duplicate entity or supplier')
        if len({(r.entityId, r.product) for r in self.requirements}) != len(self.requirements):
            raise ValueError('Duplicate purchasing requirement')
        if {r.entityId for r in self.requirements} != ids:
            raise ValueError('Every participant must have requirements and every requirement an owner')
        if any(e.currency != self.currency for e in self.entities) or any(s.currency != self.currency for s in self.suppliers):
            raise ValueError('Currency mismatch; no implicit conversion')
        if sum(r.quantity for r in self.requirements) > 100_000:
            raise ValueError('Total quantity limit')
        baseline = sum(r.quantity * r.baselineUnitCents for r in self.requirements) + sum(e.baselineShippingCents for e in self.entities)
        if baseline != self.baselineExternalCents:
            raise ValueError('Baseline does not reconcile with deterministic external-cost reference')
        return self


def _checked_solution(result, matrix, lower, upper, bounds, objective):
    if result.x is None:
        return None
    x = np.asarray(result.x, dtype=float)
    if x.shape != objective.shape or not np.isfinite(x).all() or np.max(np.abs(x - np.rint(x))) > 1e-5:
        raise ValueError('SOLVER_RESULT_INVALID')
    x = np.rint(x)
    actual = matrix @ x
    if (np.any(x < bounds.lb - 1e-6) or np.any(x > bounds.ub + 1e-6)
            or np.any(actual < lower - 1e-6) or np.any(actual > upper + 1e-6)
            or result.fun is None or not math.isfinite(result.fun)
            or abs(float(objective @ x) - result.fun) > 0.01):
        raise ValueError('SOLVER_RESULT_INVALID')
    return x.astype(np.int64)


def optimize(parameters):
    p = ProcurementInput.model_validate(parameters)
    entities = sorted(p.entities, key=lambda e: str(e.entityId))
    requirements = sorted(p.requirements, key=lambda r: (str(r.entityId), r.product))
    suppliers = sorted(p.suppliers, key=lambda s: s.id)
    objective, ceilings, names = [], [], []

    def variable(name, price, maximum):
        index = len(objective)
        objective.append(price)
        ceilings.append(maximum)
        names.append(name)
        return index

    x, y, z = {}, {}, {}
    for j, s in enumerate(suppliers):
        for k, tier in enumerate(s.tiers):
            y[j, k] = variable(('tier', j, k), s.shippingCents, 1)
            for i, r in enumerate(requirements):
                if r.product in s.products:
                    x[i, j, k] = variable(('units', i, j, k), tier.unitCosts[r.product], min(r.quantity, s.capacity))
        for e in entities:
            z[e.entityId, j] = variable(('use', str(e.entityId), j), 0, 1)
    rows, lowers, uppers, labels = [], [], [], []

    def constraint(coefficients, low, high, label):
        row = np.zeros(len(objective))
        for index, coefficient in coefficients:
            row[index] += coefficient
        rows.append(row)
        lowers.append(low)
        uppers.append(high)
        labels.append(label)

    for i, r in enumerate(requirements):
        constraint([(idx, 1) for (a, _, _), idx in x.items() if a == i], r.quantity, r.quantity,
                   f'demand:{r.entityId}:{r.product}')
    for j, s in enumerate(suppliers):
        constraint([(y[j, k], 1) for k in range(len(s.tiers))], 0, 1, f'one-tier:{s.id}')
        constraint([(idx, 1) for (_, b, _), idx in x.items() if b == j], 0, s.capacity, f'capacity:{s.id}')
        for k, tier in enumerate(s.tiers):
            units = [(idx, 1) for (_, b, c), idx in x.items() if b == j and c == k]
            minimum = max(1, s.minimumUnits, tier.minimumUnits)
            maximum = min(s.capacity, s.tiers[k+1].minimumUnits - 1 if k+1 < len(s.tiers) else s.capacity)
            constraint(units + [(y[j, k], -minimum)], 0, np.inf, f'moq:{s.id}:{k}')
            constraint(units + [(y[j, k], -maximum)], -np.inf, 0, f'tier-upper:{s.id}:{k}')
        for e in entities:
            units = [(idx, 1) for (a, b, _), idx in x.items() if b == j and requirements[a].entityId == e.entityId]
            maximum = sum(r.quantity for r in requirements if r.entityId == e.entityId)
            constraint(units + [(z[e.entityId, j], -maximum)], -np.inf, 0, f'use-upper:{e.entityId}:{s.id}')
            constraint(units + [(z[e.entityId, j], -1)], 0, np.inf, f'use-lower:{e.entityId}:{s.id}')
    if p.maxSuppliersPerEntity is not None:
        for e in entities:
            constraint([(z[e.entityId, j], 1) for j in range(len(suppliers))], 0, p.maxSuppliersPerEntity,
                       f'max-suppliers:{e.entityId}')
    matrix = csc_array(np.array(rows))
    lower, upper = np.asarray(lowers), np.asarray(uppers)
    objective = np.asarray(objective, dtype=float)
    bounds = Bounds(np.zeros(len(objective)), np.asarray(ceilings))
    result = milp(objective, integrality=np.ones(len(objective)), bounds=bounds,
                  constraints=LinearConstraint(matrix, lower, upper),
                  options={'presolve': True, 'time_limit': p.solverSeconds, 'node_limit': 10000, 'mip_rel_gap': 0.0})
    from scipy.optimize._highspy import _core as highs
    solver = {'name': 'SciPy milp / HiGHS', 'version': f'{highs.HIGHS_VERSION_MAJOR}.{highs.HIGHS_VERSION_MINOR}.{highs.HIGHS_VERSION_PATCH}',
              'statusCode': int(result.status), 'mipGap': _finite(getattr(result, 'mip_gap', None)),
              'dualBoundCents': _finite(getattr(result, 'mip_dual_bound', None)),
              'nodes': _finite(getattr(result, 'mip_node_count', None)), 'timeLimitSeconds': p.solverSeconds,
              'integerTolerance': 1e-5, 'constraintTolerance': 1e-6}
    base = {'method': 'fixed-charge-all-units-milp', 'methodVersion': 1, 'currency': p.currency,
            'baselineExternalCents': p.baselineExternalCents, 'solver': solver, 'internalTransferCents': 0,
            'decisionExecuted': False, 'assumptions': [
                'Approved requirements must be met exactly in integer units; no speculative excess purchases.',
                'All-units supplier tiers aggregate compatible products; one active tier and one shipping charge per supplier.',
                'Fixed shipping is quantity-allocated in integer cents; the last sorted entity receives the remainder.',
                'Transition expense is charged once per participant. Taxes, timing and unlisted constraints are excluded.',
                'External-cost estimates only; internal transfers do not count as savings. Separate entity consent is required.',
                'Equal-cost allocations may have multiple optima; allocation is not a fairness guarantee.'],
            'limitations': ['Input prices and capacities are declared assumptions, not supplier commitments.',
                            'No procurement, reservation, financial transfer or production is authorized.']}
    if result.status not in (0, 1):
        if result.status != 2:
            raise ValueError('SOLVER_FAILED')
        return {**base, 'status': 'infeasible', 'proposedCostCents': None, 'ecosystemBenefitCents': None,
                'allocations': [], 'suppliers': [], 'impacts': [], 'bindingConstraints': []}
    values = _checked_solution(result, matrix, lower, upper, bounds, objective)
    if values is None:
        if result.status == 0:
            raise ValueError('SOLVER_RESULT_INVALID')
        return {**base, 'status': 'no_feasible_solution', 'proposedCostCents': None, 'ecosystemBenefitCents': None,
                'allocations': [], 'suppliers': [], 'impacts': [], 'bindingConstraints': []}
    allocations, supplier_results = [], []
    shipping = {e.entityId: 0 for e in entities}
    merchandise = {e.entityId: 0 for e in entities}
    for j, s in enumerate(suppliers):
        units_by_entity = {}
        for (i, b, k), idx in x.items():
            if b != j or not values[idx]:
                continue
            r, qty = requirements[i], int(values[idx])
            cost = qty * s.tiers[k].unitCosts[r.product]
            merchandise[r.entityId] += cost
            units_by_entity[r.entityId] = units_by_entity.get(r.entityId, 0) + qty
            allocations.append({'entityId': str(r.entityId), 'product': r.product, 'supplierId': s.id,
                                'tier': k, 'quantity': qty, 'unitCents': s.tiers[k].unitCosts[r.product], 'merchandiseCents': cost})
        total = sum(units_by_entity.values())
        assigned = 0
        used = sorted(units_by_entity, key=str)
        for n, entity_id in enumerate(used):
            share = s.shippingCents - assigned if n == len(used)-1 else s.shippingCents * units_by_entity[entity_id] // total
            shipping[entity_id] += share
            assigned += share
        supplier_results.append({'id': s.id, 'quantity': total, 'capacity': s.capacity, 'unusedCapacity': s.capacity-total,
                                 'shippingCents': s.shippingCents if total else 0,
                                 'tier': next((k for k in range(len(s.tiers)) if values[y[j, k]]), None)})
    impacts = []
    for e in entities:
        original = sum(r.quantity*r.baselineUnitCents for r in requirements if r.entityId == e.entityId) + e.baselineShippingCents
        proposed = merchandise[e.entityId] + shipping[e.entityId] + e.transitionCents
        impacts.append({'entityId': str(e.entityId), 'quantity': sum(r.quantity for r in requirements if r.entityId == e.entityId),
                        'baselineExternalCents': original, 'pooledMerchandiseCents': merchandise[e.entityId],
                        'allocatedShippingCents': shipping[e.entityId], 'transitionCostCents': e.transitionCents,
                        'proposedCostCents': proposed, 'benefitCents': original-proposed, 'disadvantaged': proposed > original})
    proposed = sum(i['proposedCostCents'] for i in impacts)
    if proposed != sum(a['merchandiseCents'] for a in allocations) + sum(s['shippingCents'] for s in supplier_results) + sum(e.transitionCents for e in entities):
        raise ValueError('SOLVER_RESULT_INVALID')
    activity = matrix @ values
    binding = [label for label, a, lo, hi in zip(labels, activity, lower, upper)
               if (math.isfinite(lo) and abs(a-lo) <= 1e-6) or (math.isfinite(hi) and abs(a-hi) <= 1e-6)]
    return {**base, 'status': 'optimal' if result.status == 0 else 'feasible_not_proven_optimal',
            'proposedCostCents': proposed, 'ecosystemBenefitCents': p.baselineExternalCents-proposed,
            'shippingCents': sum(shipping.values()), 'transitionCostCents': sum(e.transitionCents for e in entities),
            'allocations': allocations, 'suppliers': supplier_results, 'impacts': impacts,
            'bindingConstraints': binding, 'requiresEntityReview': any(i['disadvantaged'] for i in impacts)}


def _finite(value):
    return float(value) if value is not None and math.isfinite(value) else None
