import hashlib
import hmac
import json
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request as HttpRequest
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from .contracts import Request
from .execution import Supervisor, ExecutionFailure

MAX_BYTES = 262144


def create_app(secret_file=None, supervisor=None):
    supervisor = supervisor or Supervisor(int(os.environ.get('SCIENCE_CONCURRENCY', '2')))
    key_file = Path(secret_file or os.environ.get('SCIENCE_SECRET_FILE', '/run/secrets/science-key'))
    nonces = {}

    @asynccontextmanager
    async def lifespan(_app):
        yield
        supervisor.close()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    def secret():
        try:
            key = key_file.read_bytes().strip()
            if len(key) < 32:
                raise ValueError()
            return key
        except (OSError, ValueError):
            raise ExecutionFailure('SCIENTIFIC_NOT_CONFIGURED') from None

    async def authorize(request):
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > MAX_BYTES:
                raise ExecutionFailure('SCIENTIFIC_INPUT_TOO_LARGE', 413)
        stamp = request.headers.get('x-steward-timestamp', '')
        nonce = request.headers.get('x-steward-nonce', '')
        signature = request.headers.get('x-steward-signature', '')
        now = time.time()
        if not re.fullmatch(r'\d{10}', stamp) or abs(now - int(stamp)) > 30 or not re.fullmatch(r'[a-f0-9]{32}', nonce) or not re.fullmatch(r'[a-f0-9]{64}', signature):
            raise ExecutionFailure('SCIENTIFIC_AUTHENTICATION_REQUIRED', 401)
        expected = hmac.new(secret(), stamp.encode() + b'\n' + nonce.encode() + b'\n' + request.method.encode() + b'\n' + request.url.path.encode() + b'\n' + bytes(raw), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            raise ExecutionFailure('SCIENTIFIC_AUTHENTICATION_REQUIRED', 401)
        for old in list(nonces):
            if nonces[old] < now - 60:
                del nonces[old]
        if nonce in nonces:
            raise ExecutionFailure('SCIENTIFIC_REPLAY_REJECTED', 409)
        if len(nonces) >= 4096:
            raise ExecutionFailure('SCIENTIFIC_ADMISSION_LIMIT', 429)
        nonces[nonce] = now
        return bytes(raw)

    @app.exception_handler(ExecutionFailure)
    async def failure(_request, error):
        return JSONResponse({'schemaVersion': 1, 'error': error.code}, status_code=error.status)

    @app.get('/health')
    async def health():
        return {'status': 'ok', 'service': 'steward-scientific', 'contractVersion': 1}

    @app.get('/ready')
    async def ready():
        secret()
        return {'status': 'ready', 'contractVersion': 1}

    @app.post('/v1/execute')
    async def execute(request: HttpRequest):
        raw = await authorize(request)
        try:
            parsed = Request.model_validate_json(raw)
        except (ValidationError, ValueError):
            raise ExecutionFailure('SCIENTIFIC_INPUT_INVALID', 422) from None
        return await supervisor.execute(parsed, request.is_disconnected)

    @app.delete('/v1/jobs/{job_id}')
    async def cancel(job_id: str, request: HttpRequest):
        await authorize(request)
        if not re.fullmatch(r'[a-f0-9-]{36}', job_id):
            raise ExecutionFailure('SCIENTIFIC_INPUT_INVALID', 422)
        return {'schemaVersion': 1, 'canceled': supervisor.cancel(job_id)}

    return app


app = create_app()
