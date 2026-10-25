"""Backends intercambiables; todos operan exclusivamente con ficheros locales."""
from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Iterable

from .config import Settings, force_offline_environment

DIMENSION = 1024


def _normalise_words(text: str) -> set[str]:
    normalised = unicodedata.normalize("NFD", text.lower())
    normalised = "".join(char for char in normalised if unicodedata.category(char) != "Mn")
    return set(re.findall(r"[a-z0-9]{2,}", normalised))


def _luhn(value: str) -> bool:
    digits = [int(char) for char in value if char.isdigit()]
    if not 13 <= len(digits) <= 19:
        return False
    total = 0
    parity = len(digits) % 2
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


class Backend(ABC):
    name: str

    @abstractmethod
    def embeddings(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    @abstractmethod
    def rerank(self, query: str, documents: list[str]) -> list[tuple[int, float]]:
        raise NotImplementedError

    @abstractmethod
    def redact(self, text: str) -> tuple[str, list[tuple[str, int, int]]]:
        raise NotImplementedError


class FakeBackend(Backend):
    """Sustituto determinista: útil en CI y explícitamente no apto para producción."""

    name = "fake-local"
    _patterns: tuple[tuple[str, re.Pattern[str]], ...] = (
        ("EMAIL", re.compile(r"(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+", re.IGNORECASE)),
        ("IBAN", re.compile(r"\bES\d{2}(?:[ -]?\d{4}){5}\b", re.IGNORECASE)),
        ("DNI", re.compile(r"\b(?:\d{8}|[XYZ]\d{7})[A-Z]\b", re.IGNORECASE)),
        ("TELEFONO", re.compile(r"(?<!\d)(?:\+34[ .-]?)?(?:[6789]\d{2}[ .-]?\d{3}[ .-]?\d{3})(?!\d)")),
        ("TARJETA", re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")),
    )

    def embeddings(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            raw = bytearray()
            counter = 0
            while len(raw) < DIMENSION:
                raw.extend(hashlib.sha256(f"{counter}:".encode("ascii") + text.encode("utf-8")).digest())
                counter += 1
            vector = [(value - 127.5) / 127.5 for value in raw[:DIMENSION]]
            norm = math.sqrt(sum(value * value for value in vector))
            vectors.append([value / norm for value in vector])
        return vectors

    def rerank(self, query: str, documents: list[str]) -> list[tuple[int, float]]:
        query_words = _normalise_words(query)
        ranked: list[tuple[int, float]] = []
        for index, document in enumerate(documents):
            document_words = _normalise_words(document)
            if not query_words or not document_words:
                score = 0.0
            else:
                score = len(query_words & document_words) / math.sqrt(
                    len(query_words) * len(document_words)
                )
            ranked.append((index, round(score, 8)))
        return sorted(ranked, key=lambda item: (-item[1], item[0]))

    def redact(self, text: str) -> tuple[str, list[tuple[str, int, int]]]:
        matches: list[tuple[int, int, str]] = []
        for entity_type, pattern in self._patterns:
            for match in pattern.finditer(text):
                if entity_type == "TARJETA" and not _luhn(match.group(0)):
                    continue
                matches.append((match.start(), match.end(), entity_type))
        matches.sort(key=lambda item: (item[0], -(item[1] - item[0])))
        selected: list[tuple[int, int, str]] = []
        end = -1
        for start, candidate_end, entity_type in matches:
            if start >= end:
                selected.append((start, candidate_end, entity_type))
                end = candidate_end
        output: list[str] = []
        cursor = 0
        for start, candidate_end, entity_type in selected:
            output.append(text[cursor:start])
            output.append(f"[{entity_type}]")
            cursor = candidate_end
        output.append(text[cursor:])
        return "".join(output), [(entity_type, start, candidate_end) for start, candidate_end, entity_type in selected]


class RealBackend(Backend):
    """Backend de producción cargado localmente; las importaciones pesadas son diferidas."""

    name = "local-models"

    def __init__(self, settings: Settings) -> None:
        force_offline_environment()
        self._models_dir = settings.models_dir
        self._embeddings_path = self._required_path(settings.embeddings_model)
        self._reranker_path = self._required_path(settings.reranker_model)
        self._spacy_path = self._required_path(settings.spacy_model)
        try:
            from sentence_transformers import SentenceTransformer
            from FlagEmbedding import FlagReranker
            import spacy
            from presidio_analyzer import AnalyzerEngine, Pattern, PatternRecognizer
        except ImportError as error:  # pragma: no cover - se cubre en build real
            raise RuntimeError("Faltan dependencias locales del backend real") from error
        self._embedder = SentenceTransformer(str(self._embeddings_path), local_files_only=True)
        self._reranker = FlagReranker(str(self._reranker_path), use_fp16=False)
        nlp = spacy.load(str(self._spacy_path))
        self._analyzer = AnalyzerEngine(nlp_engine=self._presidio_nlp(nlp), supported_languages=["es"])
        self._add_spanish_recognizers(Pattern, PatternRecognizer)

    def _required_path(self, name: str) -> Path:
        path = (self._models_dir / name).resolve()
        if self._models_dir.resolve() not in path.parents or not path.is_dir():
            raise RuntimeError(f"Modelo local no disponible en {path}")
        return path

    @staticmethod
    def _presidio_nlp(nlp):
        from presidio_analyzer.nlp_engine import SpacyNlpEngine
        engine = SpacyNlpEngine(models=[])
        engine.nlp = {"es": nlp}
        return engine

    def _add_spanish_recognizers(self, Pattern, PatternRecognizer) -> None:
        definitions = [
            ("DNI", r"\b(?:\d{8}|[XYZ]\d{7})[A-Z]\b"),
            ("IBAN", r"\bES\d{2}(?:[ -]?\d{4}){5}\b"),
            ("TELEFONO", r"(?<!\d)(?:\+34[ .-]?)?(?:[6789]\d{2}[ .-]?\d{3}[ .-]?\d{3})(?!\d)"),
        ]
        for entity, regex in definitions:
            self._analyzer.registry.add_recognizer(
                PatternRecognizer(supported_entity=entity, patterns=[Pattern(entity, regex, 0.85)])
            )

    def embeddings(self, texts: list[str]) -> list[list[float]]:
        values = self._embedder.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
        return [[float(value) for value in row] for row in values]

    def rerank(self, query: str, documents: list[str]) -> list[tuple[int, float]]:
        scores = self._reranker.compute_score([[query, document] for document in documents])
        return sorted(enumerate(float(score) for score in scores), key=lambda item: (-item[1], item[0]))

    def redact(self, text: str) -> tuple[str, list[tuple[str, int, int]]]:
        results = self._analyzer.analyze(text=text, language="es")
        presidio_entities = [
            (self._map_entity(result.entity_type), result.start, result.end) for result in results
        ]
        # Presidio aporta NER de persona/dirección; el recognizer local garantiza
        # los formatos españoles y Luhn incluso si cambia un recognizer base.
        _, regex_entities = FakeBackend().redact(text)
        candidates = presidio_entities + regex_entities
        candidates.sort(key=lambda item: (item[1], -(item[2] - item[1]), item[0]))
        entities: list[tuple[str, int, int]] = []
        occupied_until = -1
        for entity_type, start, end in candidates:
            if start >= occupied_until:
                entities.append((entity_type, start, end))
                occupied_until = end
        output = text
        for entity_type, start, end in sorted(entities, key=lambda item: item[1], reverse=True):
            output = output[:start] + f"[{entity_type}]" + output[end:]
        return output, entities

    @staticmethod
    def _map_entity(entity_type: str) -> str:
        aliases = {"PHONE_NUMBER": "TELEFONO", "PERSON": "PERSONA", "LOCATION": "DIRECCION"}
        allowed = {"EMAIL", "TELEFONO", "DNI", "IBAN", "TARJETA", "PERSONA", "DIRECCION"}
        mapped = aliases.get(entity_type, entity_type)
        return mapped if mapped in allowed else "OTRO"


def create_backend(settings: Settings) -> Backend:
    return FakeBackend() if settings.backend == "fake" else RealBackend(settings)
