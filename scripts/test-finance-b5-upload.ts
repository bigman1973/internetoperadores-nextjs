import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_DOCUMENT_BYTES,
  UploadValidationError,
  readStrictMultipart,
  requestPayloadHash,
  storageNameForPayload,
  validatePendingDocument,
} from "../lib/finanzas/pending-document-helper";

const boundary = "B5FixtureBoundary_4e7d65d6";
const fields = {
  movimientoId: "mov-fixture-1",
  versionGestion: "1",
  fechaDocumento: "2026-10-22",
  importeDocumento: "12.34",
  nombreProveedor: "Proveedor Fixture SL",
  concepto: "Ticket de prueba",
  confirmacionDocumento: "true",
  idempotencyKey: "31b786d2-b654-4c9a-8b81-1c76e8943c90",
};

function multipart(parts: Array<{ name: string; value: string | Buffer; type?: string; filename?: string }>): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"${part.filename ? `; filename="${part.filename}"` : ""}\r\n${part.type ? `Content-Type: ${part.type}\r\n` : ""}\r\n`));
    chunks.push(typeof part.value === "string" ? Buffer.from(part.value) : part.value);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function fixtureRequest(body: Buffer, fragment = false): Pick<Request, "headers" | "body"> {
  const stream = fragment
    ? new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (let index = 0; index < body.length; index += 17) controller.enqueue(new Uint8Array(body.subarray(index, index + 17)));
        controller.close();
      },
    })
    : new ReadableStream<Uint8Array<ArrayBuffer>>({ start(controller) { controller.enqueue(new Uint8Array(body)); controller.close(); } });
  return {
    headers: new Headers({
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.length),
    }),
    body: stream,
  };
}

async function invalid(task: () => Promise<unknown> | unknown, code: string, status?: number) {
  await assert.rejects(async () => task(), (error: unknown) => error instanceof UploadValidationError && error.code === code && (status === undefined || error.status === status));
}

function validBody(file = Buffer.from("%PDF-1.7\nfixture"), type = "application/pdf") {
  return multipart([
    ...Object.entries(fields).map(([name, value]) => ({ name, value })),
    { name: "archivo", filename: "irrelevant-original-name.pdf", type, value: file },
  ]);
}

test("parses a fragmented, bounded multipart fixture and normalizes exact cents", async () => {
  const parsed = await readStrictMultipart(fixtureRequest(validBody(), true));
  const input = validatePendingDocument(parsed);
  assert.equal(input.mimeType, "application/pdf");
  assert.equal(input.extension, "pdf");
  assert.equal(input.importeCentimos, 1234);
  assert.equal(input.fechaDocumentoIso, "2026-10-22");
  assert.match(input.fileSha256, /^[a-f0-9]{64}$/);
  const hash = requestPayloadHash(91, input);
  assert.match(storageNameForPayload(hash, input.extension), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/);
});

test("rejects a spoofed MIME even when the filename says PDF", async () => {
  const parsed = await readStrictMultipart(fixtureRequest(validBody(Buffer.from("not a pdf"), "application/pdf")));
  await invalid(() => validatePendingDocument(parsed), "FILE_SIGNATURE", 415);
});

test("rejects SVG/content-type declarations and a non-confirmed human action", async () => {
  const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
  const parsed = await readStrictMultipart(fixtureRequest(validBody(svg, "image/svg+xml")));
  await invalid(() => validatePendingDocument(parsed), "FILE_SIGNATURE", 415);
  const body = multipart([
    ...Object.entries({ ...fields, confirmacionDocumento: "false" }).map(([name, value]) => ({ name, value })),
    { name: "archivo", filename: "x.pdf", type: "application/pdf", value: Buffer.from("%PDF-1.7") },
  ]);
  const unconfirmed = await readStrictMultipart(fixtureRequest(body));
  await invalid(() => validatePendingDocument(unconfirmed), "CONFIRMACION_REQUERIDA", 422);
});

test("requires declared content length and rejects a body whose stream exceeds 4 MiB", async () => {
  const body = validBody();
  const noLength = fixtureRequest(body);
  noLength.headers.delete("content-length");
  await invalid(() => readStrictMultipart(noLength), "BODY_LIMIT", 413);
  const declared = 4 * 1024 * 1024 + 1;
  const request = fixtureRequest(body);
  request.headers.set("content-length", String(declared));
  await invalid(() => readStrictMultipart(request), "BODY_LIMIT", 413);
});

test("rejects a 3 MiB plus one file while staying within the 4 MiB body bound", async () => {
  const file = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(MAX_DOCUMENT_BYTES - 8)]);
  const body = validBody(file);
  // The multipart delimiters mean this body is slightly over the 3 MiB file cap
  // but remains lower than the separate whole-body cap.
  assert.ok(body.length < 4 * 1024 * 1024);
  await invalid(() => readStrictMultipart(fixtureRequest(body)), "FILE_LIMIT", 413);
});

test("SOPORTE desconocido conserva fecha e importe NULL y no los rellena con el banco",()=>{
  const input=validatePendingDocument({fields:{...fields,tipoDocumento:'SOPORTE',fechaDocumento:'',importeDocumento:''},file:{mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.7')}})
  assert.equal(input.fechaDocumento,null);assert.equal(input.importeCentimos,null)
})
test("TICKET exige fecha e importe positivos; SOPORTE admite el signo documentado",()=>{
  const source={fields:{...fields,tipoDocumento:'TICKET' as const},file:{mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.7')}}
  assert.equal(validatePendingDocument(source).importeCentimos,1234)
  assert.throws(()=>validatePendingDocument({...source,fields:{...source.fields,importeDocumento:'-12.34'}}))
  assert.equal(validatePendingDocument({...source,fields:{...source.fields,tipoDocumento:'SOPORTE',importeDocumento:'-12.34'}}).importeCentimos,-1234)
})
test("La firma de idempotencia distingue tipo de documento y datos humanos",()=>{
  const source={fields,file:{mimeType:'application/pdf',bytes:Buffer.from('%PDF-1.7')}}
  const support=validatePendingDocument(source),ticket=validatePendingDocument({...source,fields:{...fields,tipoDocumento:'TICKET'}})
  assert.notEqual(requestPayloadHash(91,support),requestPayloadHash(91,ticket))
})
