"""Configuración local del servicio; no lee secretos de ficheros ni llama a red."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


# Se imponen antes de importar bibliotecas que pudieran intentar consultar hubs.
OFFLINE_ENV = {
    "HF_HUB_OFFLINE": "1",
    "HF_HUB_DISABLE_TELEMETRY": "1",
    "HF_HUB_DISABLE_UPDATE_CHECK": "1",
    "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
    "HF_DATASETS_OFFLINE": "1",
    "TRANSFORMERS_OFFLINE": "1",
    "DO_NOT_TRACK": "1",
    "OTEL_SDK_DISABLED": "true",
    "TOKENIZERS_PARALLELISM": "false",
}


def force_offline_environment() -> None:
    """Impone las salvaguardas offline incluso si el entorno recibiera otro valor."""
    os.environ.update(OFFLINE_ENV)


@dataclass(frozen=True)
class Settings:
    api_key: str
    backend: str
    models_dir: Path
    embeddings_model: str
    reranker_model: str
    spacy_model: str
    rerank_enabled: bool = False
    max_request_bytes: int = 1_048_576
    max_embedding_inputs: int = 64
    max_text_chars: int = 8_000
    max_redact_chars: int = 20_000
    max_rerank_documents: int = 50

    @classmethod
    def from_env(cls) -> "Settings":
        force_offline_environment()
        api_key = os.environ.get("ASSISTANT_RAG_API_KEY", "")
        if not api_key or api_key.startswith("CAMBIAR_"):
            raise RuntimeError(
                "ASSISTANT_RAG_API_KEY es obligatoria y no puede contener un valor de ejemplo"
            )
        backend = os.environ.get("ASSISTANT_RAG_BACKEND", "fake").lower()
        if backend not in {"fake", "real"}:
            raise RuntimeError("ASSISTANT_RAG_BACKEND debe ser 'fake' o 'real'")
        models_dir = Path(os.environ.get("ASSISTANT_MODELS_DIR", "/models"))
        return cls(
            api_key=api_key,
            backend=backend,
            models_dir=models_dir,
            embeddings_model=os.environ.get("ASSISTANT_EMBEDDINGS_MODEL", "bge-m3"),
            reranker_model=os.environ.get("ASSISTANT_RERANK_MODEL", "bge-reranker-v2-m3"),
            spacy_model=os.environ.get("ASSISTANT_SPACY_MODEL", "es_core_news_lg"),
            # El reranker añade carga de CPU y sólo se habilita tras medirlo.
            rerank_enabled=os.environ.get("ASSISTANT_RERANK_ENABLED", "false") == "true",
        )
