FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl \
  && rm -rf /var/lib/apt/lists/*

COPY apps/chart-engine/pyproject.toml ./apps/chart-engine/pyproject.toml
COPY apps/chart-engine/src ./apps/chart-engine/src

RUN python -m pip install --upgrade pip \
  && python -m pip install ./apps/chart-engine

ENV CHART_ENGINE_HOST=0.0.0.0
ENV CHART_ENGINE_PORT=8012
ENV CHART_ENGINE_WORKERS=2

EXPOSE 8012

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8012/ready || exit 1

CMD ["sh", "-c", "uvicorn chart_engine.main:app --host ${CHART_ENGINE_HOST} --port ${CHART_ENGINE_PORT} --workers ${CHART_ENGINE_WORKERS}"]
