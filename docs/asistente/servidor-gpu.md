# Servidor GPU recomendado y dimensionado

**Estado:** recomendación técnica acotada a staging y preparación. No es una orden de compra ni autoriza producción. Precios, stock, DPA, región y subencargados requieren reconfirmación antes de contratar.

## Candidato de modelo: Mistral Small 3.1 24B Instruct

La primera opción para una evaluación ciega es **Mistral Small 3.1 24B Instruct**. La ficha oficial declara licencia Apache-2.0, uso y modificación comercial, soporte explícito de español, 24.000 millones de parámetros y vLLM como framework recomendado [1]. La misma ficha estima aproximadamente 55 GB de VRAM para BF16/FP16; la guía offline de la ficha advierte más de 60 GB de VRAM. Por prudencia, el presupuesto de memoria debe partir de al menos 60 GB antes de caché KV, runtime y concurrencia [1].

No se ha descargado, fijado ni validado un checkpoint ni una cuantización en esta entrega. El `models.lock.example` contiene marcadores intencionados y no es un lock final. Una alternativa Apache-2.0 multilingüe es Qwen3; su ficha oficial declara soporte de más de 100 idiomas y dialectos, pero tampoco está congelada en este repositorio [2].

## Hardware UE a evaluar

| Prioridad | Candidato | VRAM | Precio de catálogo consultado | Motivo y condición |
|---|---|---:|---:|---|
| 1 | Dedicado RTX PRO 6000 Max-Q en Países Bajos | 96 GB GDDR7 ECC | desde 1.190 €/mes sin IVA | Deja margen para Mistral 24B BF16, caché KV y servicios auxiliares. La página publica sala de datos UE en Países Bajos; confirmar contrato, DPA, borrado, soporte, red privada y stock. [3] |
| 2 | OVHcloud L40S | 48 GB GDDR6 | 1,80 USD/h; ≈1.314 USD/mes a 730 h | Sólo piloto cuantizado si checkpoint exacto, contexto y concurrencia superan evaluación. OVHcloud declara la L40S apta para inferencia generativa; la residencia se valida con región/contrato. [4] |
| 3 | OVHcloud H100 | 80 GB HBM2e | 2,99 USD/h; ≈2.182,70 USD/mes a 730 h | Alternativa para evaluación BF16 con margen de memoria; coste de catálogo sin impuestos, almacenamiento o conectividad. [4] |

El coste mensual orientativo se calcula como tarifa horaria multiplicada por 730 horas. No incorpora IVA, disco, snapshots, soporte, egress, relay/VPN, certificados, copias, administración ni costes de parada. No se recomienda comprar ni crear una cuenta desde esta documentación.

## Dimensionado inicial

| Recurso | Punto de partida para host dedicado 96 GB | Justificación |
|---|---:|---|
| VRAM | 96 GB; objetivo P95 <85 % | 24B BF16 necesita ≥55–60 GB según el proveedor del modelo; queda margen operativo para KV, CUDA y concurrencia. [1] |
| RAM | 128 GB | vLLM, FastAPI y cachés necesitan margen sin *offload* de CPU. |
| CPU | 12 vCPU vLLM + 6 vCPU RAG como límite inicial | Ajustar en host real. El reranker parte apagado y sólo se habilita si su aumento P95 es ≤600 ms. |
| Disco NVMe cifrado | ≥2 TB, preferiblemente separado por SO/modelos/volúmenes | Debe alojar bundle offline, pesos, imágenes, temporales de restauración y copias locales. |
| Red | 1 Gb/s o superior, relay/VPN en 443 | No habilitar navegación general. El acceso se reduce a relay/VPN y Caddy con mTLS. |

Un vector `float32` de 1.024 dimensiones ocupa 4 KiB brutos. Cien mil fragmentos requieren aproximadamente 0,4 GB sólo de vectores; WAL, índices HNSW, metadatos y restauraciones se dimensionan en la base vectorial separada, no en el host de vLLM.

## Criterios de aceptación

El modo `local` sigue bloqueado hasta superar una batería ciega de 100 preguntas españolas, con fidelidad/citas ≥95 %, cero fuga ACL, respuesta fuera de dominio apropiada ≥90 %, P95 de primer token <3 s bajo carga acordada, VRAM P95 <85 % y error <1 %. También son obligatorios bundle offline revisado, firewall con egress denegado, DNS/TCP negativos desde cada contenedor, mTLS, copia/restauración, DPA y aprobación jurídica. Si un criterio falla, staging conserva el modo `extractivo` y producción permanece `desactivado`.

## Referencias

[1]: https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503 "Model card Mistral Small 3.1 24B Instruct"
[2]: https://huggingface.co/Qwen/Qwen3-4B "Qwen3 4B model card"
[3]: https://www.leadergpu.com/ "LeaderGPU bare-metal GPU servers in Europe"
[4]: https://www.ovhcloud.com/en/public-cloud/gpu/ "OVHcloud GPU instances"
