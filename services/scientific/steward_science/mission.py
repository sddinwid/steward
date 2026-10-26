"""Bounded hypothetical service capacity; never participant selection or authority."""
from typing import Literal
from pydantic import Field, StrictInt
import numpy as np
import warnings
from scipy.optimize import milp, Bounds, LinearConstraint
from .contracts import Closed


class Constraint(Closed):
    name: Literal['housing-units', 'training-seats', 'meals', 'staff-support', 'essential-supplies']
    availableUnits: StrictInt | None = Field(ge=0, le=10000)
    unitsPerService: StrictInt = Field(ge=1, le=1000)


class MissionInput(Closed):
    currency: str = Field(pattern=r'^[A-Z]{3}$')
    approvedAvailableCents: StrictInt | None = Field(ge=0, le=10**12)
    incrementalUnitCostCents: StrictInt | None = Field(ge=0, le=10**12)
    maximumAdditionalUnits: StrictInt = Field(ge=0, le=10000)
    capacityConstraints: list[Constraint] = Field(min_length=1, max_length=5)
    suppressed: Literal[False]
    assumptionBasis: Literal['explicit-planning-assumptions']


def sustain(parameters):
    p = MissionInput.model_validate(parameters)
    base = {'method': 'bounded-mission-capacity-milp', 'methodVersion': 1,
            'currency': p.currency, 'decisionExecuted': False,
            'assumptionBasis': p.assumptionBasis,
            'limitations': ['Explicit conditional capacity and incremental costs are assumptions.',
                           'Approved available balances are already net of commitments; never subtract them twice.',
                           'Service units are not unique people or participant eligibility decisions.',
                           'No funding transfer, reservation, purchase or service approval is executed.']}
    if p.approvedAvailableCents is None or p.incrementalUnitCostCents is None or any(c.availableUnits is None for c in p.capacityConstraints):
        return {**base, 'status': 'insufficient_data', 'maximumAdditionalUnits': None,
                'additionalCostCents': None, 'solver': None}
    # One integer service bundle with explicit ratios avoids inventing a
    # weighting/utility score for people. No sensitive participant input exists.
    coefficients = [p.incrementalUnitCostCents] + [c.unitsPerService for c in p.capacityConstraints]
    upper = [p.approvedAvailableCents] + [c.availableUnits for c in p.capacityConstraints]
    with warnings.catch_warnings():
        warnings.filterwarnings('ignore', message=r'Unrecognized options detected:.*(threads|random_seed).*These will be passed to HiGHS verbatim\.', category=RuntimeWarning)
        result = milp(c=np.array([-1.0]), integrality=np.array([1]),
                      bounds=Bounds([0], [p.maximumAdditionalUnits]),
                      constraints=LinearConstraint(np.asarray(coefficients, dtype=float).reshape(-1, 1),
                                                   np.zeros(len(upper)), np.asarray(upper, dtype=float)),
                      options={'time_limit': 2.0, 'mip_rel_gap': 0.0, 'threads': 1, 'random_seed': 0})
    if result.status != 0 or result.x is None:
        return {**base, 'status': 'no_feasible_solution', 'maximumAdditionalUnits': None,
                'additionalCostCents': None, 'solver': {'name': 'SciPy/HiGHS', 'statusCode': int(result.status)}}
    units = int(round(float(result.x[0])))
    reference = min([p.maximumAdditionalUnits] +
                    ([p.approvedAvailableCents // p.incrementalUnitCostCents] if p.incrementalUnitCostCents else []) +
                    [c.availableUnits // c.unitsPerService for c in p.capacityConstraints])
    # Independently reconcile solver output using exact integer arithmetic.
    if units != reference or units < 0 or any(coefficient * units > bound for coefficient, bound in zip(coefficients, upper)):
        raise ValueError('SOLVER_RESULT_INVALID')
    return {**base, 'status': 'completed', 'maximumAdditionalUnits': units,
            'additionalCostCents': units * p.incrementalUnitCostCents,
            'remainingApprovedCents': p.approvedAvailableCents - units * p.incrementalUnitCostCents,
            'bindingConstraints': [c.name for c in p.capacityConstraints if c.availableUnits // c.unitsPerService == units],
            'solver': {'name': 'SciPy/HiGHS', 'statusCode': int(result.status), 'timeLimitSeconds': 2.0,
                       'threads': 1, 'randomSeed': 0,
                       'exactIntegerReconciliation': True}}
