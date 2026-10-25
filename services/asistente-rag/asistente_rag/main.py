"""API FastAPI local para embeddings, reranking y redacción de PII."""
from __future__ import annotations

import hmac
import logging
from collections import Counter
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .backends import Backend, create_backend
from .config import Settings, force_offline_environment
from .schemas import (
    EmbeddingItem,
    EmbeddingsRequest,
    EmbeddingsResponse,
    RedactEntity,
    RedactRequest,
    RedactResponse,
    RerankItem,
    RerankRequest,
    RerankResponse,
)

logger = logging.getLogger("asistente_rag")


class AggregateMetrics:
    """Contadores en memoria: nunca incluyen texto, cabeceras ni identificadores."""

    def __init__(self) -> None:
        self.requests: Counter[str] = Counter()

    def increment(self, endpoint: str) -> None:
        self.requests[endpoint] += 1


def create_app(settings: Settings | None = None, backend: Backend | None = None) -> FastAPI:
    force_offline_environment()
    settings = settings or Settings.from_env()
    backend = backend or create_backend(settings)
    metrics = AggregateMetrics()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Se registra configuración operativa, nunca consultas ni entradas de usuario.
        logger.info("Servicio RAG iniciado (backend=%s, offline=true)", backend.name)
        yield

    app = FastAPI(
        title="Asistente RAG local",
        version="1.0.0",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.backend = backend
    app.state.metrics = metrics

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        """No reflejar entradas inválidas: podrían contener PII o texto sensible."""
        details = [
            {"loc": list(issue["loc"]), "msg": issue["msg"], "type": issue["type"]}
            for issue in error.errors()
        ]
        return JSONResponse({"detail": details}, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)

    @app.middleware("http")
    async def limit_request_size(request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.max_request_bytes:
                    return JSONResponse({"detail": "Cuerpo de solicitud demasiado grande"}, status_code=413)
            except ValueError:
                return JSONResponse({"detail": "Content-Length inválido"}, status_code=400)
        return await call_next(request)

    def require_bearer(authorization: Annotated[str | None, Header()] = None) -> None:
        prefix = "Bearer "
        received = authorization[len(prefix):] if authorization and authorization.startswith(prefix) else ""
        if not hmac.compare_digest(received.encode("utf-8"), settings.api_key.encode("utf-8")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No autorizado",
                headers={"WWW-Authenticate": "Bearer"},
            )

    protected = [Depends(require_bearer)]

    @app.get("/health")
    async def health() -> dict[str, object]:
        metrics.increment("health")
        return {
            "status": "ok",
            "models": {
                "embeddings": settings.embeddings_model,
                "reranker": settings.reranker_model,
                "ner": settings.spacy_model,
            },
            "offline": True,
        }

    @app.post("/v1/embeddings", response_model=EmbeddingsResponse, dependencies=protected)
    async def embeddings(payload: EmbeddingsRequest) -> EmbeddingsResponse:
        metrics.increment("embeddings")
        vectors = backend.embeddings(payload.input)
        return EmbeddingsResponse(
            data=[EmbeddingItem(index=index, embedding=vector) for index, vector in enumerate(vectors)],
            model=payload.model or settings.embeddings_model,
        )

    @app.post("/v1/rerank", response_model=RerankResponse, dependencies=protected)
    async def rerank(payload: RerankRequest) -> RerankResponse:
        metrics.increment("rerank")
        top_n = payload.top_n if payload.top_n is not None else len(payload.documents)
        results = backend.rerank(payload.query, payload.documents)[:top_n]
        return RerankResponse(results=[RerankItem(index=index, relevance_score=score) for index, score in results])

    @app.post("/v1/redact", response_model=RedactResponse, dependencies=protected)
    async def redact(payload: RedactRequest) -> RedactResponse:
        metrics.increment("redact")
        redacted, entities = backend.redact(payload.text)
        return RedactResponse(
            text=redacted,
            entities=[RedactEntity(type=entity_type, start=start, end=end) for entity_type, start, end in entities],
        )

    return app


app = create_app()
