import assert from 'node:assert/strict'
import test from 'node:test'
import { FakeOcrPort, FakeOneDriveDomainPort, FakeOneDriveReadPort } from '../lib/finanzas/sync-jobs/providers/onedrive/fake-provider'
import { B1_FOLDERS, FACTURAS_BASE_PATH, OneDriveSyncProvider } from '../lib/finanzas/sync-jobs/providers/onedrive/provider'
import type { GraphFile } from '../lib/finanzas/sync-jobs/providers/onedrive/graph-read'

const DRIVE = 'drive-1'
const library = { driveId: DRIVE, siteId: 'site-1', rootPath: FACTURAS_BASE_PATH }
const validOcr = {
  proveedor: 'Proveedor SL', cif: 'B12345678', numFactura: 'F-100', fecha: '2026-10-01', fechaProvenancia: 'DOCUMENTO',
  base: 100, tipoIva: 21, importeIva: 21, tipoIrpf: 0, importeIrpf: 0, total: 121, confianza: 0.99,
  lineas: [{ importeNeto: 100 }],
}
const valid = { ok: true as const, identidad: 'CIF:B12345678|NUM:F-100' }

function folder(key: keyof typeof B1_FOLDERS): string {
  return key === 'raiz' ? FACTURAS_BASE_PATH : `${FACTURAS_BASE_PATH}/${B1_FOLDERS[key].nombre}`
}

function file(id: string, name: string, parent: string, opts: Partial<GraphFile> = {}): GraphFile {
  return {
    id, name, size: 10, eTag: `etag-${id}`, lastModifiedDateTime: '2026-10-01T00:00:00Z', file: { mimeType: 'application/pdf' },
    relativeFolderPath: parent, folderPath: parent, fullPath: `${parent}/${name}`, ...opts,
  }
}

function setup(folders: Record<string, { files?: GraphFile[]; error?: Error }>) {
  const read = new FakeOneDriveReadPort(library, folders, { 'doc-1': new Uint8Array([1, 2, 3]) })
  const domain = new FakeOneDriveDomainPort()
  const ocr = new FakeOcrPort(validOcr, valid)
  return { read, domain, ocr, provider: new OneDriveSyncProvider({ read, domain, ocr }) }
}

async function fullInventory(provider: OneDriveSyncProvider<object>) {
  let checkpoint: unknown = {}
  const all = [] as Awaited<ReturnType<OneDriveSyncProvider<object>['inventory']>>['items']
  for (let i = 0; i < Object.keys(B1_FOLDERS).length; i += 1) {
    const page = await provider.inventory(checkpoint)
    all.push(...page.items)
    checkpoint = page.checkpoint
    assert.equal(page.complete, i === Object.keys(B1_FOLDERS).length - 1)
  }
  return all
}

test('B1 processes exactly one fully-read folder per checkpoint and never presents an incomplete inventory as complete', async () => {
  const pending = folder('pendiente')
  const broken = folder('materiales')
  const { provider, domain } = setup({
    [pending]: { files: [file('doc-1', 'one.pdf', pending)] },
    [broken]: { error: new Error('simulated second-folder paging failure') },
  })
  const first = await provider.inventory({})
  assert.equal(first.complete, false)
  assert.equal((first.checkpoint as { folderIndex: number }).folderIndex, 1)
  assert.equal(first.items.length, 1)
  await assert.rejects(() => provider.inventory(first.checkpoint), /simulated second-folder paging failure/)
  assert.equal(domain.calls.invoice, 0)
  assert.equal(domain.calls.review, 0)
  assert.equal(domain.calls.location, 0)
})

test('an item keeps its drive+ID key across a folder move and an existing invoice receives only a location update', async () => {
  const oldFolder = folder('pendiente')
  const newFolder = folder('trimestre1')
  const { provider, domain, ocr } = setup({
    [oldFolder]: { files: [file('doc-1', 'one.pdf', oldFolder)] },
    [newFolder]: { files: [file('doc-1', 'one.pdf', newFolder, { eTag: 'etag-moved' })] },
  })
  const initial = await provider.inventory({})
  const initialItem = initial.items[0]
  const initialData = initialItem.data as unknown as { location: any }
  domain.sources.set('doc-1', { kind: 'INVOICE', id: 'invoice-1', oneDriveDriveId: DRIVE, location: initialData.location })

  const moved = await provider.inventory({ schema: 1, folderIndex: 3 })
  const movedItem = moved.items[0]
  assert.equal(movedItem.key, initialItem.key)
  const prepared = await provider.prepare(movedItem)
  const outcome = await provider.apply({}, movedItem, prepared, 7)
  assert.equal(outcome, 'ACTUALIZADA')
  assert.equal(ocr.calls, 0)
  assert.equal(domain.calls.location, 1)
  assert.equal(domain.calls.invoice, 0)
  assert.equal(domain.calls.review, 0)
})

test('confirming is durable inventory metadata only: no download, OCR, invoice/review, C9 support, B4, or bank action', async () => {
  const confirming = folder('confirming_draxton')
  const { provider, read, domain, ocr } = setup({
    [confirming]: { files: [file('confirm-1', 'confirming.pdf', confirming)] },
  })
  const listed = await provider.inventory({ schema: 1, folderIndex: 2 })
  assert.equal(listed.items.length, 1)
  assert.equal(listed.items[0].tipo, 'ONEDRIVE_CONFIRMING_SOPORTE')
  const prepared = await provider.prepare(listed.items[0])
  assert.equal(await provider.apply({}, listed.items[0], prepared, 7), 'SIN_CAMBIOS')
  assert.equal(read.downloads, 0)
  assert.equal(ocr.calls, 0)
  assert.equal(domain.calls.invoice, 0)
  assert.equal(domain.calls.review, 0)
  assert.equal(domain.calls.location, 0)
  // The fake domain intentionally has no B4, bank-link, support or email API.
})

test('a legacy source without a library ID is REVIEW until the exact configured drive acknowledgement is supplied', async () => {
  const pending = folder('pendiente')
  const first = setup({ [pending]: { files: [file('doc-1', 'one.pdf', pending)] } })
  const item = (await first.provider.inventory({})).items[0]
  const loc = (item.data as unknown as { location: any }).location
  first.domain.sources.set('doc-1', { kind: 'INVOICE', id: 'legacy-1', oneDriveDriveId: null, location: loc })
  assert.equal(await first.provider.apply({}, item, await first.provider.prepare(item), 7), 'REVISAR')
  assert.equal(first.domain.calls.location, 0)

  const acknowledged = setup({ [pending]: { files: [file('doc-1', 'one.pdf', pending)] } })
  const acknowledgedProvider = new OneDriveSyncProvider({
    read: acknowledged.read, domain: acknowledged.domain, ocr: acknowledged.ocr, historicalLibraryConfirmedDriveId: DRIVE,
  })
  const acknowledgedItem = (await acknowledgedProvider.inventory({})).items[0]
  const movedLocation = { ...(acknowledgedItem.data as unknown as { location: any }).location, carpetaOrigen: 'legacy' }
  acknowledged.domain.sources.set('doc-1', { kind: 'INVOICE', id: 'legacy-1', oneDriveDriveId: null, location: movedLocation })
  assert.equal(await acknowledgedProvider.apply({}, acknowledgedItem, await acknowledgedProvider.prepare(acknowledgedItem), 7), 'ACTUALIZADA')
  assert.equal(acknowledged.domain.calls.location, 1)
})

test('new invoice OCR is performed outside apply and a repeated delivery becomes an audited-source no-op', async () => {
  const pending = folder('pendiente')
  const { provider, domain, ocr, read } = setup({ [pending]: { files: [file('doc-1', 'one.pdf', pending)] } })
  const item = (await provider.inventory({})).items[0]
  const prepared = await provider.prepare(item)
  assert.equal(read.downloads, 1)
  assert.equal(ocr.calls, 1)
  assert.equal(await provider.apply({}, item, prepared, 7), 'NUEVA')
  assert.equal(domain.calls.invoice, 1)
  // A second worker delivery re-reads source under its supplied TX and writes nothing.
  assert.equal(await provider.apply({}, item, prepared, 7), 'SIN_CAMBIOS')
  assert.equal(domain.calls.invoice, 1)
})

test('a canonical-null legacy exact identity match is REVIEW rather than a heuristic duplicate import', async () => {
  const pending = folder('pendiente')
  const { provider, domain } = setup({ [pending]: { files: [file('doc-1', 'one.pdf', pending)] } })
  domain.legacyMatch = true
  const item = (await provider.inventory({})).items[0]
  assert.equal(await provider.apply({}, item, await provider.prepare(item), 7), 'REVISAR')
  assert.equal(domain.calls.invoice, 0)
  assert.equal(domain.calls.legacy, 1)
})

test('all configured B1 folders complete before the resulting item set is processable by a worker barrier', async () => {
  const pending = folder('pendiente')
  const { provider } = setup({ [pending]: { files: [file('doc-1', 'one.pdf', pending)] } })
  const items = await fullInventory(provider)
  assert.equal(items.filter(item => item.tipo === 'ONEDRIVE_FACTURA').length, 1)
})
