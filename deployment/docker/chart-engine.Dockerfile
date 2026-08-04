FROM python:3.12.13-slim-trixie@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS builder

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONTZPATH=""
ENV PATH="/opt/chart-engine-venv/bin:${PATH}"

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential \
  && rm -rf /var/lib/apt/lists/* \
  && python -m venv /opt/chart-engine-venv

COPY apps/chart-engine/pyproject.toml ./apps/chart-engine/pyproject.toml
COPY apps/chart-engine/build-requirements.lock ./apps/chart-engine/build-requirements.lock
COPY apps/chart-engine/requirements.lock ./apps/chart-engine/requirements.lock

RUN --mount=type=cache,target=/root/.cache/pip,sharing=locked \
  python -m pip install --require-hashes --no-deps -r ./apps/chart-engine/build-requirements.lock \
  && python -m pip install --require-hashes --no-build-isolation -r ./apps/chart-engine/requirements.lock

COPY apps/chart-engine/src ./apps/chart-engine/src

RUN python -m pip install --no-deps --no-build-isolation ./apps/chart-engine

FROM python:3.12.13-slim-trixie@sha256:57cd7c3a7a273101a6485ba99423ee568157882804b1124b4dd04266317710de AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONTZPATH=""
ENV PATH="/opt/chart-engine-venv/bin:${PATH}"

WORKDIR /app

COPY --from=builder /opt/chart-engine-venv /opt/chart-engine-venv

RUN groupadd --system --gid 10001 chartengine \
  && useradd --system --uid 10001 --gid chartengine --home-dir /nonexistent --shell /usr/sbin/nologin chartengine

ENV CHART_ENGINE_HOST=0.0.0.0
ENV CHART_ENGINE_PORT=8012
# Provider concurrency is enforced inside one runtime process. Multiple
# uvicorn workers would create independent semaphores and defeat that cap.
ENV CHART_ENGINE_WORKERS=1

EXPOSE 8012

USER chartengine

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8012/ready', timeout=4).read()"

CMD ["sh", "-c", "uvicorn chart_engine.main:app --host ${CHART_ENGINE_HOST} --port ${CHART_ENGINE_PORT} --workers ${CHART_ENGINE_WORKERS}"]
