FROM python:3.13.16-slim-bookworm@sha256:73aa5faee130c60da030e105ec971ccf57473fbd22ce73bd6fc9ba99a40b838d AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 NUMEXPR_NUM_THREADS=1
WORKDIR /app
COPY services/scientific/requirements.lock ./requirements.lock
RUN pip install --no-cache-dir --require-hashes --only-binary=:all: -r requirements.lock && useradd --uid 10001 --create-home science
COPY services/scientific/steward_science ./steward_science
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/ready',timeout=2)"
CMD ["python", "-m", "uvicorn", "steward_science.app:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--limit-concurrency", "12", "--timeout-keep-alive", "3"]
FROM runtime AS test
COPY services/scientific/tests ./tests
CMD ["python", "-m", "pytest", "-q", "-p", "no:cacheprovider", "tests"]
