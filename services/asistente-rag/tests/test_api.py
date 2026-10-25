from __future__ import annotations

import math
import os
import socket

import pytest
from fastapi.testclient import TestClient

# Debe existir antes de importar asistente_rag.main, que expone la aplicación ASGI.
os.environ.setdefault("ASSISTANT_RAG_API_KEY", "clave-de-prueba-local")
os.environ.setdefault("ASSISTANT_RAG_BACKEND", "fake")

from asistente_rag.backends import FakeBackend
from asistente_rag.config import Settings
from asistente_rag.main import create_app


@pytest.fixture
def client() -> TestClient:
    settings = Settings(
        api_key="clave-de-prueba-local",
        backend="fake",
        models_dir=__import__("pathlib").Path("/models"),
        embeddings_model="bge-m3",
        reranker_model="bge-reranker-v2-m3",
        spacy_model="es_core_news_lg",
        rerank_enabled=True,
    )
    with TestClient(create_app(settings=settings, backend=FakeBackend())) as test_client:
        yield test_client


@pytest.fixture
def auth() -> dict[str, str]:
    return {"Authorization": "Bearer clave-de-prueba-local"}


@pytest.fixture(autouse=True)
def no_external_sockets(monkeypatch: pytest.MonkeyPatch):
    """Ninguna prueba puede abrir un socket distinto de loopback."""
    original_connect = socket.socket.connect

    def guarded_connect(sock: socket.socket, address):
        host = address[0] if isinstance(address, tuple) else address
        permitted = {"127.0.0.1", "::1", "localhost"}
        if host not in permitted:
            raise AssertionError(f"Socket saliente bloqueado durante prueba: {host}")
        return original_connect(sock, address)

    monkeypatch.setattr(socket.socket, "connect", guarded_connect)


def test_arranca_y_responde_sin_salida_de_red(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "models": {"embeddings": "bge-m3", "reranker": "bge-reranker-v2-m3", "ner": "es_core_news_lg"},
        "offline": True,
    }


def test_protege_endpoints_con_bearer_y_comparacion_de_clave(client: TestClient) -> None:
    assert client.post("/v1/embeddings", json={"input": ["fibra"]}).status_code == 401
    assert client.post(
        "/v1/embeddings",
        headers={"Authorization": "Bearer clave-incorrecta"},
        json={"input": ["fibra"]},
    ).status_code == 401


def test_embeddings_fake_son_deterministas_normalizados_y_de_dimension_1024(client: TestClient, auth: dict[str, str]) -> None:
    first = client.post("/v1/embeddings", headers=auth, json={"input": ["Fibra simétrica", "Router"]})
    second = client.post("/v1/embeddings", headers=auth, json={"input": ["Fibra simétrica", "Router"]})
    assert first.status_code == 200
    assert first.json() == second.json()
    vector = first.json()["data"][0]["embedding"]
    assert len(vector) == 1024
    assert math.isclose(sum(value * value for value in vector), 1.0, abs_tol=1e-8)


def test_rerank_lexico_devuelve_resultados_ordenados_y_limita_top_n(client: TestClient, auth: dict[str, str]) -> None:
    response = client.post(
        "/v1/rerank",
        headers=auth,
        json={
            "query": "fibra para empresa",
            "documents": ["Telefonía móvil", "Fibra para empresa con respaldo", "Fibra residencial"],
            "top_n": 2,
        },
    )
    assert response.status_code == 200
    assert [item["index"] for item in response.json()["results"]] == [1, 2]


def test_rerank_cerrado_por_defecto_no_carga_un_modelo_ni_degrada_a_red(auth: dict[str, str]) -> None:
    settings = Settings(
        api_key="clave-de-prueba-local",
        backend="fake",
        models_dir=__import__("pathlib").Path("/models"),
        embeddings_model="bge-m3",
        reranker_model="bge-reranker-v2-m3",
        spacy_model="es_core_news_lg",
    )
    with TestClient(create_app(settings=settings, backend=FakeBackend())) as disabled_client:
        response = disabled_client.post(
            "/v1/rerank",
            headers=auth,
            json={"query": "fibra", "documents": ["Fibra empresarial"]},
        )
    assert response.status_code == 503
    assert response.json() == {"detail": "Reranking local no habilitado"}


def test_redacta_patrones_espanoles_sin_devolver_el_texto_original(client: TestClient, auth: dict[str, str]) -> None:
    source = "Contacto ana@example.es, +34 612 345 678, DNI 12345678Z, IBAN ES9121000418450200051332 y 4111 1111 1111 1111"
    response = client.post("/v1/redact", headers=auth, json={"text": source, "language": "es"})
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "Contacto [EMAIL], [TELEFONO], DNI [DNI], IBAN [IBAN] y [TARJETA]"
    assert {item["type"] for item in body["entities"]} == {"EMAIL", "TELEFONO", "DNI", "IBAN", "TARJETA"}
    assert "ana@example.es" not in body["text"]


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/v1/embeddings", {"input": ["x" * 8001]}),
        ("/v1/rerank", {"query": "x", "documents": ["x"] * 51}),
        ("/v1/redact", {"text": "x" * 20001, "language": "es"}),
    ],
)
def test_los_limites_de_contrato_rechazan_excesos(client: TestClient, auth: dict[str, str], path: str, body: dict) -> None:
    assert client.post(path, headers=auth, json=body).status_code == 422


def test_error_de_validacion_no_refleja_texto_ni_pii(client: TestClient, auth: dict[str, str]) -> None:
    secret = "ana@example.es-" + "x" * 8_000
    response = client.post("/v1/embeddings", headers=auth, json={"input": [secret]})
    assert response.status_code == 422
    assert "ana@example.es" not in response.text
