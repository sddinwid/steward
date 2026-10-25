"""Reproducible analytical-only history; never imports into operational modules."""
from pathlib import Path
import json
from datetime import datetime, timedelta, timezone
import numpy as np

start = datetime(2025, 1, 1, tzinfo=timezone.utc)
series = []
for key, seed, base, slope in [('participant-a', 7, 35, .35), ('participant-b', 19, 28, .25)]:
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(168):
        mean = base + slope*i + [0, 3, 8, 14, 8, 1, -3][i % 7]
        rows.append({'at': (start+timedelta(days=i)).isoformat().replace('+00:00','Z'),
                     'value': max(0, int(round(mean+rng.normal(0, 2))))})
    series.append({'entityKey': key, 'key': 'synthetic-tee:standard', 'measure': 'units', 'observations': rows})
result = {'schemaVersion': 1, 'kind': 'synthetic-analytical-history', 'synthetic': True,
          'label': 'Scientific demonstration history — not completed commercial activity',
          'generator': {'version': 1, 'periods': 168, 'interval': 'day', 'seasonalPeriod': 7,
                        'seeds': [7,19], 'noise': 'Independent rounded normal noise, standard deviation 2 units'},
          'series': series,
          'purchasingTerms': {'currency': 'USD', 'product': 'synthetic-tee:standard',
              'baselineUnitCents': 700, 'baselineShippingCents': 1500, 'transitionCents': 200,
              'suppliers': [{'id': 'synthetic-shared-supplier', 'products': ['synthetic-tee:standard'],
                             'capacity': 12000, 'minimumUnits': 20, 'shippingCents': 1800,
                             'tiers': [{'minimumUnits': 0, 'unitCosts': {'synthetic-tee:standard': 700}},
                                       {'minimumUnits': 40, 'unitCosts': {'synthetic-tee:standard': 630}}]}]},
          'limitations': ['All observations and supplier terms are synthetic analytical inputs.',
                         'No historical order, supplier commitment, reservation or completed purchase is created.',
                         'Entity identities are assigned only after Master authorizes the participating companies.']}
root = Path(__file__).resolve().parents[3]
(root/'datasets/scientific-history-v1.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8')
