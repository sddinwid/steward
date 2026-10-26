"""Bounded original-currency planning. No approval, cash movement or participant input."""
from datetime import date
from typing import Literal
from uuid import UUID
import warnings
import numpy as np
from pydantic import Field, StrictInt, model_validator
from scipy.optimize import Bounds, LinearConstraint, milp
from .contracts import Closed

Cents = StrictInt


class Period(Closed):
    start: date
    end: date


class Source(Closed):
    entityId: UUID
    currency: Literal['USD', 'EUR']
    cashCents: Cents | None = Field(ge=0, le=10**12)
    obligationsCents: Cents = Field(ge=0, le=10**12)
    restrictedCents: Cents = Field(ge=0, le=10**12)
    existingCommitmentsCents: Cents = Field(ge=0, le=10**12)
    futureRequirementCents: Cents = Field(ge=0, le=10**12)
    reserveCents: Cents = Field(ge=0, le=10**12)
    approvedAvailableCents: Cents | None = Field(ge=0, le=10**12)
    # Future generation is hypothetical, never current approved cash.
    generationCents: list[Cents] = Field(min_length=1, max_length=12)
    operatingCents: list[Cents] = Field(min_length=1, max_length=12)
    protectedOperatingCents: list[Cents] = Field(min_length=1, max_length=12)
    eligibleProgramIds: list[UUID] = Field(max_length=8)
    assumption: str = Field(min_length=20, max_length=500)


class Programme(Closed):
    programId: UUID
    entityId: UUID
    currency: Literal['USD', 'EUR']
    service: Literal['housing', 'food', 'training', 'employment', 'other']
    unit: str = Field(min_length=1, max_length=40)
    spendableReceivedCents: Cents = Field(ge=0, le=10**12)
    operatingCents: list[Cents] = Field(min_length=1, max_length=12)
    unitCostCents: list[Cents | None] = Field(min_length=1, max_length=12)
    maximumUnits: list[StrictInt] = Field(min_length=1, max_length=12)
    minimumUnits: list[StrictInt] = Field(min_length=1, max_length=12)
    budgetCents: list[Cents] = Field(min_length=1, max_length=12)
    assumption: str = Field(min_length=20, max_length=500)


class Capacity(Closed):
    resourceId: UUID
    ownerEntityId: UUID
    unit: str = Field(min_length=1, max_length=40)
    mode: Literal['consumable', 'reusable']
    availableUnits: list[StrictInt] = Field(min_length=1, max_length=12)
    totalConsumableUnits: StrictInt | None = Field(ge=0, le=10**6)
    unitsPerService: dict[UUID, StrictInt] = Field(min_length=1, max_length=8)
    valuationBasis: Literal['documented-unit-cost', 'documented-replacement-estimate', 'unknown']
    # Valuation is deliberately not an allocation funding source.
    assumption: str = Field(min_length=20, max_length=500)


class EconomyInput(Closed):
    currency: Literal['USD', 'EUR']
    horizon: Literal['30-days', '90-days', '12-months']
    periods: list[Period] = Field(min_length=1, max_length=12)
    sources: list[Source] = Field(min_length=1, max_length=6)
    programs: list[Programme] = Field(min_length=1, max_length=8)
    resources: list[Capacity] = Field(max_length=8)
    priorities: list[Literal['housing', 'food', 'training', 'employment', 'other']] = Field(min_length=1, max_length=5)
    assumptionBasis: Literal['explicit-reviewed-synthetic-planning']
    synthetic: Literal[True]

    @model_validator(mode='after')
    def coherent(self):
        n = len(self.periods)
        if any(p.end <= p.start for p in self.periods) or any(a.end != b.start for a, b in zip(self.periods, self.periods[1:])):
            raise ValueError('Periods must be contiguous positive intervals')
        days = (self.periods[-1].end - self.periods[0].start).days
        if self.horizon in ('30-days', '90-days') and days != (30 if self.horizon == '30-days' else 90):
            raise ValueError('Horizon does not match explicit dates')
        if self.horizon == '12-months':
            first, last = self.periods[0].start, self.periods[-1].end
            try:
                anniversary = first.replace(year=first.year + 1)
            except ValueError:
                anniversary = first.replace(year=first.year + 1, day=28)
            if last != anniversary or n != 12:
                raise ValueError('Twelve calendar-month periods required')
            import calendar
            for index, p in enumerate(self.periods):
                def boundary(offset):
                    serial = first.year * 12 + first.month - 1 + offset
                    year, month = divmod(serial, 12)
                    month += 1
                    return date(year, month, min(first.day, calendar.monthrange(year, month)[1]))
                if p.start != boundary(index) or p.end != boundary(index + 1):
                    raise ValueError('Anchored calendar-month interval required')
        ids = {p.programId for p in self.programs}
        if len(ids) != len(self.programs) or len({s.entityId for s in self.sources}) != len(self.sources):
            raise ValueError('Duplicate authoritative entity pool or programme')
        if len({r.resourceId for r in self.resources}) != len(self.resources):
            raise ValueError('Duplicate noncash resource')
        if len(set(self.priorities)) != len(self.priorities) or set(self.priorities) != {p.service for p in self.programs}:
            raise ValueError('Explicit unique priority for every service required')
        for service in self.priorities:
            if len({p.unit for p in self.programs if p.service == service}) != 1:
                raise ValueError('Cannot optimize incomparable service units together')
        for s in self.sources:
            if s.currency != self.currency or len(set(s.eligibleProgramIds)) != len(s.eligibleProgramIds) or not set(s.eligibleProgramIds) <= ids:
                raise ValueError('Source currency or restriction mismatch')
            for values in [s.generationCents, s.operatingCents, s.protectedOperatingCents]:
                if len(values) != n or any(v < 0 or v > 10**12 for v in values):
                    raise ValueError('Invalid bounded period cash flow')
            if sum(s.protectedOperatingCents) > s.futureRequirementCents or any(a > b for a, b in zip(s.protectedOperatingCents, s.operatingCents)):
                raise ValueError('Protected operating coverage must be explicit and cannot exceed already deducted future requirements')
            if s.cashCents is not None and s.approvedAvailableCents is not None:
                available = max(0, s.cashCents - s.obligationsCents - s.restrictedCents - s.existingCommitmentsCents - s.futureRequirementCents - s.reserveCents)
                if s.approvedAvailableCents != available:
                    raise ValueError('Approved availability does not reconcile with protected requirements')
        for p in self.programs:
            if p.currency != self.currency:
                raise ValueError('Currency mismatch; no implicit conversion')
            for values in [p.operatingCents, p.unitCostCents, p.maximumUnits, p.minimumUnits, p.budgetCents]:
                if len(values) != n or any(v is not None and (v < 0 or v > 10**12) for v in values):
                    raise ValueError('Invalid programme periods')
            if any(a > b or b > 10000 for a, b in zip(p.minimumUnits, p.maximumUnits)):
                raise ValueError('Invalid integer service boundaries')
        entity_ids = {s.entityId for s in self.sources} | {p.entityId for p in self.programs}
        for r in self.resources:
            if r.ownerEntityId not in entity_ids or not set(r.unitsPerService) <= ids or any(v < 1 or v > 1000 for v in r.unitsPerService.values()):
                raise ValueError('Noncash owner or programme restriction mismatch')
            if len(r.availableUnits) != n or any(v < 0 or v > 10**6 for v in r.availableUnits):
                raise ValueError('Invalid noncash capacity')
            if (r.mode == 'consumable') != (r.totalConsumableUnits is not None):
                raise ValueError('Consumable horizon budget or reusable mode must be explicit')
        return self


def allocate(parameters, objective_seconds=0.5):
    p = EconomyInput.model_validate(parameters)
    base = {'method': 'reserve-aware-lexicographic-milp', 'methodVersion': 1,
            'currency': p.currency, 'horizon': p.horizon, 'decisionExecuted': False,
            'synthetic': True, 'requiresSeparateHumanApprovals': True,
            'priorities': p.priorities,
            'assumptions': [s.assumption for s in p.sources] + [q.assumption for q in p.programs] + [r.assumption for r in p.resources],
            'limitations': ['Future generation is an explicit hypothetical flow, not current approved cash.',
                           'Service capacity is conditional and is not a recorded outcome or unique person count.',
                           'Priority order is lexicographic, not a hidden utility score.',
                           'No contribution, reservation, transfer, budget or expenditure is authorized.']}
    if any(s.cashCents is None or s.approvedAvailableCents is None for s in p.sources) or any(v is None for q in p.programs for v in q.unitCostCents):
        return {**base, 'status': 'insufficient_data', 'allocations': [], 'reason': 'Missing current cash, approved availability or service cost; unknown is not zero.'}
    source_shortfalls = [str(s.entityId) for s in p.sources if s.cashCents < s.obligationsCents + s.restrictedCents + s.existingCommitmentsCents + s.futureRequirementCents + s.reserveCents]
    if source_shortfalls:
        return {**base, 'status': 'infeasible', 'allocations': [], 'constraints': ['current-protected-requirements'], 'affectedEntityIds': source_shortfalls}
    n, m, count = len(p.periods), len(p.programs), len(p.sources)
    unit_count = n * m
    size = unit_count + n * m * count
    x = lambda j, t: j * n + t
    f = lambda i, j, t: unit_count + (i * m + j) * n + t
    lower, upper = [0] * size, [0] * size
    for j, q in enumerate(p.programs):
        for t in range(n):
            lower[x(j, t)], upper[x(j, t)] = q.minimumUnits[t], q.maximumUnits[t]
    for i, s in enumerate(p.sources):
        for j, q in enumerate(p.programs):
            for t in range(n):
                upper[f(i, j, t)] = 10**12 if q.programId in s.eligibleProgramIds and q.entityId != s.entityId else 0
    rows, limits, labels = [], [], []
    def constraint(coefficients, limit, label):
        row = [0] * size
        for index, coefficient in coefficients:
            row[index] += coefficient
        rows.append(row)
        limits.append(limit)
        labels.append(label)
    for i, s in enumerate(p.sources):
        net = s.approvedAvailableCents
        for t in range(n):
            net += s.generationCents[t] - (s.operatingCents[t] - s.protectedOperatingCents[t])
            constraint([(f(i, j, k), 1) for j in range(m) for k in range(t + 1)], net, 'source-reserve:' + str(s.entityId) + ':' + str(t))
    for j, q in enumerate(p.programs):
        for t in range(n):
            constraint([(x(j, k), q.unitCostCents[k]) for k in range(t + 1)] + [(f(i, j, k), -1) for i in range(count) for k in range(t + 1)], q.spendableReceivedCents - sum(q.operatingCents[:t + 1]), 'programme-cash:' + str(q.programId) + ':' + str(t))
            constraint([(x(j, t), q.unitCostCents[t])], q.budgetCents[t] - q.operatingCents[t], 'programme-budget:' + str(q.programId) + ':' + str(t))
    for r in p.resources:
        for t in range(n):
            constraint([(x(j, t), r.unitsPerService[q.programId]) for j, q in enumerate(p.programs) if q.programId in r.unitsPerService], r.availableUnits[t], 'resource-period:' + str(r.resourceId) + ':' + str(t))
        if r.mode == 'consumable':
            constraint([(x(j, t), r.unitsPerService[q.programId]) for j, q in enumerate(p.programs) if q.programId in r.unitsPerService for t in range(n)], r.totalConsumableUnits, 'consumable-horizon:' + str(r.resourceId))
    result, fixed_rows, fixed_values = None, [], []
    # Each category's optimal units are fixed before optimizing the next category.
    objectives = [[-1 if k < unit_count and p.programs[k // n].service == service else 0 for k in range(size)] for service in p.priorities]
    objectives.append([0] * unit_count + [1] * (size - unit_count))
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', message=r'Unrecognized options detected:.*', category=RuntimeWarning)
        for objective in objectives:
            matrix = np.asarray(rows + fixed_rows, dtype=float)
            bounds_lower = [-np.inf] * len(rows) + fixed_values
            bounds_upper = limits + fixed_values
            result = milp(c=np.asarray(objective, dtype=float), integrality=np.ones(size), bounds=Bounds(lower, upper),
                          constraints=LinearConstraint(matrix, bounds_lower, bounds_upper),
                          options={'time_limit': objective_seconds, 'mip_rel_gap': 0.0, 'threads': 1, 'random_seed': 0})
            if result.status != 0 or result.x is None:
                return {**base, 'status': 'infeasible' if result.status == 2 else 'no_feasible_solution', 'allocations': [],
                        'constraints': labels, 'solverStatus': int(result.status), 'reason': 'No exact optimal allocation established within bounded execution.'}
            values = [int(round(float(v))) for v in result.x]
            if any(v < a or v > b for v, a, b in zip(values, lower, upper)) or any(sum(a * b for a, b in zip(row, values)) > limit for row, limit in zip(rows, limits)) or any(sum(a * b for a, b in zip(row, values)) != limit for row, limit in zip(fixed_rows, fixed_values)):
                raise ValueError('SOLVER_RESULT_INVALID')
            fixed_rows.append(objective)
            fixed_values.append(sum(a * b for a, b in zip(objective, values)))
    allocations = [{'sourceEntityId': str(s.entityId), 'programId': str(q.programId), 'receiverEntityId': str(q.entityId), 'period': t, 'amountCents': values[f(i, j, t)]} for i, s in enumerate(p.sources) for j, q in enumerate(p.programs) for t in range(n) if values[f(i, j, t)]]
    effects = []
    for i, s in enumerate(p.sources):
        remaining = s.approvedAvailableCents
        for t in range(n):
            used = sum(values[f(i, j, t)] for j in range(m))
            remaining += s.generationCents[t] - s.operatingCents[t] + s.protectedOperatingCents[t] - used
            effects.append({'entityId': str(s.entityId), 'period': t, 'contributionCents': used, 'remainingUnallocatedCents': remaining, 'protectedReserveCents': s.reserveCents, 'assumedGenerationCents': s.generationCents[t]})
    programs = []
    for j, q in enumerate(p.programs):
        balance = q.spendableReceivedCents
        for t in range(n):
            funded = sum(values[f(i, j, t)] for i in range(count))
            units = values[x(j, t)]
            cost = q.operatingCents[t] + units * q.unitCostCents[t]
            balance += funded - cost
            programs.append({'programId': str(q.programId), 'entityId': str(q.entityId), 'period': t, 'service': q.service, 'unit': q.unit, 'additionalUnits': units, 'operatingCents': q.operatingCents[t], 'serviceCostCents': units * q.unitCostCents[t], 'proposedFundingCents': funded, 'remainingProgramCents': balance, 'unfundedUnits': q.maximumUnits[t] - units, 'fundingGapCents': (q.maximumUnits[t] - units) * q.unitCostCents[t]})
    resource_effects = []
    for r in p.resources:
        total_used = 0
        for t in range(n):
            used = sum(values[x(j, t)] * r.unitsPerService[q.programId] for j, q in enumerate(p.programs) if q.programId in r.unitsPerService)
            total_used += used
            resource_effects.append({'resourceId': str(r.resourceId), 'ownerEntityId': str(r.ownerEntityId), 'period': t,
                                     'mode': r.mode, 'unit': r.unit, 'usedUnits': used, 'remainingPeriodUnits': r.availableUnits[t] - used,
                                     'remainingHorizonUnits': r.totalConsumableUnits - total_used if r.mode == 'consumable' else None,
                                     'valuationBasis': r.valuationBasis, 'cashCreatedCents': 0})
    return {**base, 'status': 'optimal', 'allocations': allocations, 'sourceEffects': effects, 'programEffects': programs, 'resourceEffects': resource_effects,
            'newEcosystemIncomeFromAllocationsCents': 0, 'proposedContributionCents': sum(a['amountCents'] for a in allocations),
            'solver': {'name': 'SciPy/HiGHS', 'timeLimitSecondsPerObjective': objective_seconds, 'maximumObjectives': 6, 'threads': 1, 'randomSeed': 0, 'exactIntegerReconciliation': True}}


class EconomicScenario(Closed):
    name: Literal['conservative', 'baseline', 'expansion', 'sensitivity']
    generationBasisPoints: StrictInt = Field(ge=0, le=20000)
    costBasisPoints: StrictInt = Field(ge=5000, le=20000)
    assumption: str = Field(min_length=20, max_length=500)


class EconomicScenarios(Closed):
    baseline: EconomyInput
    scenarios: list[EconomicScenario] = Field(min_length=3, max_length=5)

    @model_validator(mode='after')
    def labeled(self):
        names = [s.name for s in self.scenarios]
        if not {'conservative', 'baseline', 'expansion'} <= set(names) or any(names.count(v) != 1 for v in ['conservative', 'baseline', 'expansion']):
            raise ValueError('Three explicit scenarios required; bounded additional sensitivity cases optional')
        for s in self.scenarios:
            if s.name == 'baseline' and (s.generationBasisPoints != 10000 or s.costBasisPoints != 10000):
                raise ValueError('Baseline cannot silently change reviewed assumptions')
            if s.name == 'conservative' and (s.generationBasisPoints > 10000 or s.costBasisPoints < 10000):
                raise ValueError('Conservative assumptions must not improve generation or costs')
            if s.name == 'expansion' and (s.generationBasisPoints < 10000 or s.costBasisPoints > 10000):
                raise ValueError('Expansion assumptions must be explicit optimistic bounds')
        return self


def scenario_problem(baseline, scenario):
    import copy
    problem = copy.deepcopy(baseline.model_dump(mode='json'))
    # Optimistic generation rounds down; expenses round up. Never scale approved cash,
    # reserves, commitments, restrictions or physical resource capacity.
    for source in problem['sources']:
        source['generationCents'] = [v * scenario.generationBasisPoints // 10000 for v in source['generationCents']]
        source['operatingCents'] = [(v * scenario.costBasisPoints + 9999) // 10000 for v in source['operatingCents']]
        # Previously protected coverage cannot exceed a lower hypothetical expense.
        source['protectedOperatingCents'] = [min(a, b) for a, b in zip(source['protectedOperatingCents'], source['operatingCents'])]
    for programme in problem['programs']:
        programme['operatingCents'] = [(v * scenario.costBasisPoints + 9999) // 10000 for v in programme['operatingCents']]
        programme['unitCostCents'] = [None if v is None else (v * scenario.costBasisPoints + 9999) // 10000 for v in programme['unitCostCents']]
    return problem


def compare_economy(parameters):
    p = EconomicScenarios.model_validate(parameters)
    # At most five cases and six objectives/case. Per-case solver bounds are tightened
    # by the existing process supervisor's overall execution budget; no runaway loop.
    results = []
    for scenario in p.scenarios:
        results.append({'name': scenario.name, 'generationBasisPoints': scenario.generationBasisPoints,
                        'costBasisPoints': scenario.costBasisPoints, 'assumption': scenario.assumption,
                        'calculation': allocate(scenario_problem(p.baseline, scenario), objective_seconds=0.15)})
    return {'status': 'completed' if all(r['calculation']['status'] == 'optimal' for r in results) else 'partial',
            'method': 'explicit-economic-scenario-comparison', 'methodVersion': 1, 'currency': p.baseline.currency,
            'decisionExecuted': False, 'synthetic': True, 'requiresSeparateHumanApprovals': True,
            'scenarios': results, 'limitations': ['Explicit hypothetical scenarios are not probabilities or confidence intervals.',
            'Approved cash, restrictions, commitments, reserves and physical capacity are unchanged across scenarios.',
            'A higher conditional service count is not an observed mission outcome.']}
