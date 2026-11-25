/** Solo se carga al pulsar «Exportar»: xlsx no viaja en el paquete inicial de la pantalla. */
export type FilaExport = { numero: string; cliente: string; fecha: string; vencimiento: string; importe: number | null; cobrado: number | null; pendiente: number | null; estado: string; serie: string }
export async function exportFacturas(rows: FilaExport[], periodo: string) {
  const XLSX = await import('xlsx')
  const head = ['Nº factura', 'Cliente', 'Serie', 'Fecha', 'Vencimiento', 'Importe', 'Cobrado', 'Pendiente', 'Estado de cobro']
  const clean = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v)
  const aoa: (string | number)[][] = [head, ...rows.map(r => [clean(r.numero), clean(r.cliente), clean(r.serie), r.fecha, r.vencimiento, r.importe ?? 'sin dato', r.cobrado ?? 'sin dato', r.pendiente ?? 'sin dato', r.estado])]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)
  sheet['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }]
  for (let r = 1; r <= rows.length; r++) for (const c of [5, 6, 7]) { const cell = sheet[XLSX.utils.encode_cell({ r, c })]; if (cell?.t === 'n') cell.z = '#,##0.00' }
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Facturas')
  const file = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }))
  const url = URL.createObjectURL(new Blob([file.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = `facturas-emitidas-${periodo}.xlsx`
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
