import asyncio
import hashlib
import json
import math
import multiprocessing as mp
import os
import time
from dataclasses import dataclass


class ExecutionFailure(Exception):
    def __init__(self, code, status=503):
        self.code, self.status = code, status


def child_main(connection, capability, parameters, seconds):
    try:
        import resource
        resource.setrlimit(resource.RLIMIT_CPU, (math.ceil(seconds) + 1, math.ceil(seconds) + 2))
        resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024**2, 1536 * 1024**2))
        resource.setrlimit(resource.RLIMIT_NOFILE, (96, 96))
        from .analysis import calculate, metadata
        result = {'calculation': calculate(capability, parameters), 'engine': metadata()}
        # Do not serialize nonfinite solver/statistical values as apparent results.
        json.dumps(result, allow_nan=False)
        connection.send(result)
    except Exception as error:
        code = str(error) if str(error) in ['CAPABILITY_UNAVAILABLE'] else 'CALCULATION_FAILED'
        if error.__class__.__name__ == 'ValidationError':
            code = 'ANALYTICAL_INPUT_INVALID'
        connection.send({'error': code})
    finally:
        connection.close()


@dataclass
class Running:
    process: object
    canceled: bool = False


class Supervisor:
    def __init__(self, concurrency=2, target=child_main):
        if not 1 <= concurrency <= 4:
            raise ValueError('Invalid concurrency')
        self.maximum, self.target, self.running = concurrency, target, {}

    def cancel(self, job_id):
        job = self.running.get(str(job_id))
        if job:
            job.canceled = True
            if job.process.is_alive():
                job.process.terminate()
        return bool(job)

    async def execute(self, request, disconnected=lambda: False):
        key = str(request.jobId)
        if key in self.running:
            raise ExecutionFailure('JOB_ALREADY_RUNNING', 409)
        if len(self.running) >= self.maximum:
            raise ExecutionFailure('SCIENTIFIC_CAPACITY_EXCEEDED', 429)
        ctx = mp.get_context('spawn')
        reader, writer = ctx.Pipe(duplex=False)
        process = ctx.Process(target=self.target, args=(writer, request.capability,
                              request.parameters, request.executionMillis / 1000), daemon=True)
        job = Running(process)
        self.running[key] = job
        started = time.monotonic()
        try:
            process.start()
            writer.close()
            while True:
                gone = disconnected()
                if hasattr(gone, '__await__'):
                    gone = await gone
                if job.canceled or gone:
                    raise ExecutionFailure('SCIENTIFIC_CANCELED', 409)
                if (time.monotonic() - started) * 1000 >= request.executionMillis:
                    raise ExecutionFailure('SCIENTIFIC_TIMEOUT', 504)
                if reader.poll():
                    try:
                        result = reader.recv()
                    except EOFError:
                        raise ExecutionFailure('SCIENTIFIC_PROCESS_FAILED') from None
                    if 'error' in result:
                        raise ExecutionFailure(result['error'], 422 if result['error'] == 'ANALYTICAL_INPUT_INVALID' else 503)
                    return {'schemaVersion': 1, 'jobId': key, 'capability': request.capability,
                            'inputDigest': hashlib.sha256(request.model_dump_json().encode()).hexdigest(),
                            'elapsedMillis': round((time.monotonic() - started) * 1000),
                            'provenance': request.provenance.model_dump(mode='json'),
                            'entityIds': [str(i) for i in request.entityIds],
                            'decisionExecuted': False, **result}
                if not process.is_alive():
                    raise ExecutionFailure('SCIENTIFIC_PROCESS_FAILED')
                await asyncio.sleep(0.025)
        finally:
            if process.pid:
                if process.is_alive():
                    process.terminate()
                process.join(timeout=0.5)
                if process.is_alive():
                    process.kill()
                    process.join(timeout=0.5)
            reader.close()
            writer.close()
            self.running.pop(key, None)

    def close(self):
        for key in list(self.running):
            self.cancel(key)
