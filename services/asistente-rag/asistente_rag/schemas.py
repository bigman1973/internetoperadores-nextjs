"""Esquemas exactos y límites del contrato del microservicio RAG."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class EmbeddingsRequest(BaseModel):
    input: list[str] = Field(min_length=1, max_length=64)
    model: str | None = Field(default=None, max_length=128)

    @field_validator("input")
    @classmethod
    def validate_input(cls, values: list[str]) -> list[str]:
        if any(not value.strip() for value in values):
            raise ValueError("input no admite textos vacíos")
        if any(len(value) > 8_000 for value in values):
            raise ValueError("cada texto de input debe tener como máximo 8000 caracteres")
        return values


class EmbeddingItem(BaseModel):
    index: int = Field(ge=0)
    embedding: list[float] = Field(min_length=1024, max_length=1024)


class EmbeddingsResponse(BaseModel):
    data: list[EmbeddingItem]
    model: str
    dim: Literal[1024] = 1024


class RerankRequest(BaseModel):
    query: str = Field(min_length=1, max_length=8_000)
    documents: list[str] = Field(min_length=1, max_length=50)
    top_n: int | None = Field(default=None, ge=1, le=50)

    @field_validator("documents")
    @classmethod
    def validate_documents(cls, values: list[str]) -> list[str]:
        if any(not value.strip() for value in values):
            raise ValueError("documents no admite textos vacíos")
        if any(len(value) > 8_000 for value in values):
            raise ValueError("cada documento debe tener como máximo 8000 caracteres")
        return values


class RerankItem(BaseModel):
    index: int = Field(ge=0)
    relevance_score: float


class RerankResponse(BaseModel):
    results: list[RerankItem]


class RedactRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    language: Literal["es"] = "es"


class RedactEntity(BaseModel):
    type: Literal[
        "EMAIL", "TELEFONO", "DNI", "IBAN", "TARJETA", "PERSONA", "DIRECCION", "OTRO"
    ]
    start: int = Field(ge=0)
    end: int = Field(gt=0)


class RedactResponse(BaseModel):
    text: str
    entities: list[RedactEntity]
