import platform
import warnings
import numpy as np
import pandas as pd
import scipy
from scipy import stats
from .contracts import DescribeInput


def metadata():
    return {'service': 'steward-scientific', 'version': '1.0.0', 'contractVersion': 1,
            'python': platform.python_version(), 'numpy': np.__version__,
            'scipy': scipy.__version__, 'pandas': pd.__version__}


def describe(parameters):
    values = DescribeInput.model_validate(parameters).values
    series = pd.Series(values, dtype='float64')
    observed = series.dropna().to_numpy()
    if not len(observed):
        return {'status': 'insufficient_data', 'count': 0, 'missing': len(values),
                'mean': None, 'variance': None, 'limitations': ['No observed values; missing is not zero.']}
    with warnings.catch_warnings():
        warnings.simplefilter('ignore', RuntimeWarning)
        result = stats.describe(observed) if len(observed) > 1 else None
    return {'status': 'completed', 'method': 'descriptive-statistics', 'methodVersion': 1,
            'count': len(observed), 'missing': int(series.isna().sum()),
            'mean': float(np.mean(observed)), 'median': float(np.median(observed)),
            'minimum': float(np.min(observed)), 'maximum': float(np.max(observed)),
            'variance': float(result.variance) if result else None,
            'limitations': ['Sample variance uses n-1 degrees of freedom; no forecast or causal claim.']}


def calculate(capability, parameters):
    if capability == 'describe-series':
        return describe(parameters)
    if capability == 'demand-forecast':
        from .forecast import forecast
        return forecast(parameters)
    if capability == 'procurement-optimization':
        from .procurement import optimize
        return optimize(parameters)
    if capability == 'scenario-comparison':
        from .scenarios import compare
        return compare(parameters)
    raise ValueError('CAPABILITY_UNAVAILABLE')
