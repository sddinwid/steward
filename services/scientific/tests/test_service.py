import asyncio
import hashlib
import hmac
import json
import secrets
import time
from uuid import uuid4
import pytest
from fastapi.testclient import TestClient
from steward_science.app import create_app
from steward_science.contracts import Request
from steward_science.execution import Supervisor, ExecutionFailure


def envelope(**changes):
    entity = str(uuid4())
    return {'schemaVersion': 1, 'jobId': str(uuid4()), 'principalId': str(uuid4()),
            'capability': 'describe-series', 'entityIds': [entity],
            'provenance': {'datasetId': str(uuid4()), 'synthetic': True,
                           'basis': 'synthetic-analytical-history', 'asOf': '2026-01-01T00:00:00Z', 'references': []},
            'parameters': {'values': [1, 2, 3, None]}, 'executionMillis': 6000, **changes}


def signed(key, body, nonce=None, stamp=None, method='POST', path='/v1/execute'):
    nonce, stamp = nonce or secrets.token_hex(16), str(stamp or int(time.time()))
    signature = hmac.new(key, stamp.encode() + b'\n' + nonce.encode() + b'\n' + method.encode() + b'\n' + path.encode() + b'\n' + body, hashlib.sha256).hexdigest()
    return {'x-steward-timestamp': stamp, 'x-steward-nonce': nonce, 'x-steward-signature': signature}


@pytest.fixture
def client(tmp_path):
    key = secrets.token_bytes(32).hex().encode()
    path = tmp_path / 'key'
    path.write_bytes(key)
    with TestClient(create_app(path)) as client:
        yield client, key


def test_real_descriptive_calculation_and_provenance(client):
    c, key = client
    data = envelope()
    raw = json.dumps(data).encode()
    r = c.post('/v1/execute', content=raw, headers=signed(key, raw))
    assert r.status_code == 200, r.text
    result = r.json()
    assert result['calculation']['mean'] == 2
    assert result['calculation']['variance'] == 1
    assert result['calculation']['missing'] == 1
    assert result['provenance'] == data['provenance']
    assert result['entityIds'] == data['entityIds']
    assert result['engine']['scipy'] == '1.18.1'
    assert result['decisionExecuted'] is False


def test_authentication_replay_and_bounds(client):
    c, key = client
    raw = json.dumps(envelope()).encode()
    assert c.post('/v1/execute', content=raw).status_code == 401
    assert c.post('/v1/execute', content=raw, headers=signed(b'wrong', raw)).status_code == 401
    assert c.post('/v1/execute', content=raw, headers=signed(key, raw, stamp=int(time.time())-60)).status_code == 401
    headers = signed(key, raw)
    assert c.post('/v1/execute', content=raw, headers=headers).status_code == 200
    assert c.post('/v1/execute', content=raw, headers=headers).json()['error'] == 'SCIENTIFIC_REPLAY_REJECTED'
    assert c.post('/v1/execute', content=b'x'*262145).status_code == 413


@pytest.mark.parametrize('change', [{'extra': 'forbidden'}, {'executionMillis': 12001},
                                  {'capability': 'exec-python'}, {'parameters': {'values': [float('nan')]}}])
def test_invalid_or_undeclared_input_fails_closed(client, change):
    c, key = client
    raw = json.dumps(envelope(**change)).encode()
    r = c.post('/v1/execute', content=raw, headers=signed(key, raw))
    assert r.status_code == 422


def test_cross_entity_reference_and_false_history_rejected():
    body = envelope()
    body['provenance']['references'] = [{'entityId': str(uuid4()), 'recordId': str(uuid4()),
                                        'moduleId': 'test.source', 'streamId': 'orders', 'revision': 1}]
    with pytest.raises(ValueError):
        Request.model_validate(body)
    body['provenance']['references'] = []
    body['provenance']['synthetic'] = False
    with pytest.raises(ValueError):
        Request.model_validate(body)


def sleeping_child(_connection, _capability, _parameters, _seconds):
    time.sleep(20)


def test_wall_timeout_kills_process_and_releases_admission():
    async def run():
        supervisor = Supervisor(target=sleeping_child)
        with pytest.raises(ExecutionFailure) as e:
            await supervisor.execute(Request.model_validate(envelope(executionMillis=100)))
        assert e.value.code == 'SCIENTIFIC_TIMEOUT'
        assert not supervisor.running
    asyncio.run(run())


def test_real_cancel_busy_and_duplicate_job_admission():
    async def run():
        supervisor = Supervisor(concurrency=1, target=sleeping_child)
        request = Request.model_validate(envelope())
        task = asyncio.create_task(supervisor.execute(request))
        await asyncio.sleep(0.05)
        with pytest.raises(ExecutionFailure) as e:
            await supervisor.execute(request)
        assert e.value.code == 'JOB_ALREADY_RUNNING'
        with pytest.raises(ExecutionFailure) as e:
            await supervisor.execute(Request.model_validate(envelope()))
        assert e.value.code == 'SCIENTIFIC_CAPACITY_EXCEEDED'
        assert supervisor.cancel(request.jobId)
        with pytest.raises(ExecutionFailure) as e:
            await task
        assert e.value.code == 'SCIENTIFIC_CANCELED'
        assert not supervisor.running
    asyncio.run(run())


def test_readiness_requires_private_configuration(tmp_path):
    with TestClient(create_app(tmp_path/'absent')) as c:
        assert c.get('/health').status_code == 200
        assert c.get('/ready').status_code == 503


def test_forecast_payload_cannot_bypass_envelope_entity_scope(client):
    c, key = client
    body = envelope(capability='demand-forecast', parameters={'series': [{'entityId': str(uuid4())}]})
    raw = json.dumps(body).encode()
    assert c.post('/v1/execute', content=raw, headers=signed(key, raw)).status_code == 422


def test_authenticated_forecast_executes_in_bounded_process(client):
    from test_forecast import data
    c, key = client
    parameters = data('seasonal')
    body = envelope(capability='demand-forecast', parameters=parameters, entityIds=[parameters['series'][0]['entityId']])
    raw = json.dumps(body).encode()
    r = c.post('/v1/execute', content=raw, headers=signed(key, raw))
    assert r.status_code == 200, r.text
    assert r.json()['calculation']['series'][0]['model']['id'] == 'seasonal-regression'
    assert r.json()['calculation']['series'][0]['uncertainty']['supported']
