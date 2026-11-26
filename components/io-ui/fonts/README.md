# Fuentes locales del kit io-ui

Se conservan sin transformación los tres WOFF2 latinos que servía el staging validado `1c80b50d52749bd945238d0459d4e931022f091f`. Se comprobó su igualdad byte a byte con los assets públicos el 26/11/2026. Son fuentes variables, declaradas únicamente con los mismos pesos utilizados por el kit anterior: Roboto 400/500/700, Roboto Condensed 500/700 y Roboto Mono 400/500. Cubren los caracteres españoles, cifras y euro del panel.

`next/font/local` los incorpora al build sin peticiones a Google. Las variables siguen siendo `--io-f-body`, `--io-f-display` y `--io-f-mono`; `display: swap`, el CSS del kit y sus consumidores no cambian.

## Procedencia y huellas SHA-256

- `RobotoLatin.woff2`: asset anterior `ce62453a442c7f35-s.p.0333ktddfbsxy.woff2`; SHA-256 `0a44e0bb6ba5c8537e8814c148ef7755f1bce12112361231f595ecc584a18d7a`.
- `RobotoCondensedLatin.woff2`: asset anterior `ef1484efef1c9752-s.p.09utjot42e~ja.woff2`; SHA-256 `718ced55c5d8e207d6d14b1765fe6cf5886882834f45cc0ad23283cd210f9a96`.
- `RobotoMonoLatin.woff2`: asset anterior `2f13ad8e538108e0-s.p.0o52u8sd-fo14.woff2`; SHA-256 `2ed6ac9efae6d21f51b2946176a0eef79a4043d643f9ac976e66d7fc4d57803a`.

## Licencias

Se incluyen los avisos completos de los autores y la SIL Open Font License 1.1 de cada familia, obtenidos de Google Fonts:

- https://github.com/google/fonts/blob/main/ofl/roboto/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/robotocondensed/OFL.txt
- https://github.com/google/fonts/blob/main/ofl/robotomono/OFL.txt

El archivo histórico de Roboto Condensed conserva además una referencia a Apache 2.0 en sus metadatos. Se incluye también `Apache-2.0.txt` para no retirar ese aviso. No se modifican ni renombrarán internamente los archivos de fuente y no se venden separadamente.
