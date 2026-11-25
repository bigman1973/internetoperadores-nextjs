/* Área 1 · batería del lector por cliente de la Subida (sin BD). */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { extraerSubidaCliente, textoSubida, normCif } from '../lib/area1-subida-cliente'
import { construirPromptBorrador, type ContextoBorrador } from '../lib/area1-m365-borrador'
let ok = 0, ko = 0
const t = (n: string, c: boolean) => { if (c) { ok++; console.log('  ✔', n) } else { ko++; console.log('  ✘', n) } }
const precios = [
  { contrato: 'C-100', producto: 'Fibra', cliente: 'Empresa A', cif: 'B-12345678', precioHoyMes: 40, precioNuevoMes: 42, subidaPct: 5, costeMes: 20, margenHoyPct: 50, margenNuevoPct: 52 },
  { contrato: 'C-101', producto: 'Móvil', cliente: 'Empresa A', cif: 'B-12345678', precioHoyMes: 10, precioNuevoMes: 10.5, subidaPct: 5 },
  { contrato: 'C-200', producto: 'Fibra', cliente: 'Otra', cif: '', precioHoyMes: 30, precioNuevoMes: 31.5, subidaPct: 5 },
]
const avisos = [
  { cliente: 'Empresa A', cif: 'B-12345678', email: 'x@ejemplo.com', subidaMes: 2.5, subidaAnio: 30, pctMedio: 5, fechaLimiteAviso: '2026-12-01', fechaEfecto: '2027-01-01' },
  { cliente: 'Otra', cif: '', subidaMes: 1.5, subidaAnio: 18, pctMedio: 5, fechaLimiteAviso: '2026-12-01', fechaEfecto: '2027-01-01' },
]
const ds = { precios, avisos, fechaEfecto: '2027-01-01' }
const a = extraerSubidaCliente(ds, { codigosContrato: ['C-100', 'C-999'], cif: null })
t('cruce por contrato: encuentra solo los contratos de la ficha', a?.cruce === 'CONTRATO' && a.contratos.length === 1 && a.contratos[0].contrato === 'C-100')
t('cruce por contrato: toma el aviso del mismo cliente', a?.subidaAnio === 30 && a?.fechaLimiteAviso === '2026-12-01')
const b = extraerSubidaCliente(ds, { codigosContrato: [], cif: 'b12345678' })
t('cruce por CIF normalizado cuando no hay contrato', b?.cruce === 'CIF' && b.contratos.length === 2 && normCif('b-1234 5678') === 'B12345678')
const c = extraerSubidaCliente(ds, { codigosContrato: ['C-200'], cif: null })
t('CIF vacío en el aviso: cruza por contrato y cliente', c?.subidaMes === 1.5 && c.contratos[0].contrato === 'C-200')
t('cliente sin subida → null (no se inventa)', extraerSubidaCliente(ds, { codigosContrato: ['C-777'], cif: 'A00000000' }) === null)
t('contratos vacíos y sin CIF → null', extraerSubidaCliente(ds, { codigosContrato: [], cif: null }) === null)
t('CIF vacío de la ficha no casa con avisos de CIF vacío', extraerSubidaCliente(ds, { codigosContrato: [], cif: '' }) === null)
const txt = textoSubida(a) || ''
t('texto: nunca incluye coste ni margen', !/coste|margen|20,00|50 %/i.test(txt) && !JSON.stringify(a).match(/coste|margen/i))
t('texto: precios hoy → nuevo, fechas y confirmación con dirección', /40,00 € → 42,00 €/.test(txt) && /2027-01-01/.test(txt) && /2026-12-01/.test(txt) && /confirmar con dirección/.test(txt))
t('texto: null si no hay subida', textoSubida(null) === null)
const ctx: ContextoBorrador = { contacto: { nombre: 'Cliente Prueba', cargo: null, empresa: null, segmento: 'EMPRESA', ciudad: null }, negocios: [], actividades: [], contratos: [], facturacion2026: null, subidaPrecios: txt, autor: 'Comercial' }
const prompt = JSON.stringify(construirPromptBorrador(ctx, { objetivo: 'Avisar de la subida', tono: 'formal' }))
t('prompt: incluye la subida y la regla de usarla solo si toca', /Subida de precios: escenario APROBADO/.test(prompt) && /Menciona la subida de precios solo si/.test(prompt))
const src = readFileSync('lib/area1-subida-cliente.ts', 'utf8')
t('SQL: solo escenario APROBADO, el último por aprobado_at', /estado_aprobacion = 'APROBADO'/.test(src) && /ORDER BY aprobado_at DESC NULLS LAST LIMIT 1/.test(src))
t('SQL: solo lectura (sin INSERT/UPDATE/DELETE) y sin importar lib/subida-precios', !/\b(INSERT|UPDATE|DELETE)\b/.test(src) && !/from ['"]@\/lib\/subida-precios|lib\/subida-precios\//.test(src.replace(/\/\*[\s\S]*?\*\//, '')))
const proj = src.slice(src.indexOf('jsonb_build_object'))
t('SQL: la proyección no saca costeMes ni márgenes', !/costeMes|margenHoyPct|margenNuevoPct|email/.test(proj))
const diff = execSync('git diff origin/staging --stat -- lib/subida-precios app/admin/subida-precios app/api/admin/subida-precios', { encoding: 'utf8' })
t('Subida de la integradora sin tocar', diff.trim() === '')
console.log(`\nResultado: ${ok}/${ok + ko}`)
if (ko) process.exit(1)
