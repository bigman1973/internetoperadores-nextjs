# syntax=docker/dockerfile:1
# Se construye en una estación conectada con ruedas y modelos previamente auditados.
# El host aislado sólo carga la imagen OCI resultante mediante docker load.
FROM python:3.11.11-slim AS wheels
WORKDIR /build
COPY requirements.txt ./
COPY wheelhouse/ /wheelhouse/
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheelhouse --prefix=/install -r requirements.txt

FROM python:3.11.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 \
    HF_HUB_DISABLE_TELEMETRY=1 \
    HF_HUB_DISABLE_UPDATE_CHECK=1 \
    HF_HUB_DISABLE_IMPLICIT_TOKEN=1 \
    HF_DATASETS_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    DO_NOT_TRACK=1 \
    OTEL_SDK_DISABLED=true \
    TOKENIZERS_PARALLELISM=false \
    ASSISTANT_MODELS_DIR=/models
RUN groupadd --gid 10001 asistente && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin asistente
COPY --from=wheels /install /usr/local
COPY --chown=10001:10001 asistente_rag/ /app/asistente_rag/
WORKDIR /app
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["python", "-m", "uvicorn", "asistente_rag.asgi:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
