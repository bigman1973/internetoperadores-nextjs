'use client';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Panel, Toast, eur } from '@/components/io-ui/kit';
import { useActuation } from '@/components/impersonation/ActuationProvider';
import {
  makeIdempotencyKey, parseConciliarRemesaPreviewResponse, parseConciliarReviewPreviewResponse,
  type ConciliarAccount, type ConciliarReadResponse, type ConciliarRemesaPreview, type ConciliarReviewPreview, type ConciliarRow,
} from '@/components/finanzas/conciliar/conciliar-contract';
import { hasHumanOwnTransferConfirmation, requiresSeparateRemesaConfirmation } from '@/components/finanzas/conciliar/conciliar-ui-helpers';
import { canConfirmSuggestion, noRequireReasonLabel, suggestionEvidenceLabel, type EasyMovement, type EasySuggestion } from '@/components/finanzas/easy/easy-contract';
import { parseEasyAccessProfile, type EasyAccessProfile } from '@/components/finanzas/easy/easy-two-step-client';
import type { ParaPedirRead } from '@/lib/finanzas/para-pedir-contract';
import type { CuentaCuadre, RemesaResumen, ResumenConciliar } from '@/lib/finanzas/conciliar-cuadre';
import {
  CHIPS, PAGINA_BANDEJA, MOTIVOS_NO_REQUIERE, VISTAS, bloqueoPorCuadre, buildKpis, buildPasos, claseEstadoCadena, corteMinimo,
  cuentasActivas, estadoPropuesta, etiquetaCuenta, fechaCorta, fechaLarga, lecturasDeChip, quienEs, tamanoPorLectura, textoEstadoCadena,
  tipoDeFila, unirBandeja, type ChipKey, type VistaConciliar,
} from '@/lib/finanzas/conciliar-unificado';
import {
  API_CONCILIAR, API_FACIL, ErrorServidor, ResultadoIncierto, getJson, leerModoFacilDia, leerParaPedir, leerProyeccion, postJson,
  resultadoConfirmacion, resultadoDeshacer,
} from './api';

const ConciliarConfirmationHistory = dynamic(() => import('@/components/finanzas/conciliar/ConciliarConfirmationHistory'), { ssr: false });
const ConciliarRemesaConfirmationDialog = dynamic(() => import('@/components/finanzas/conciliar/ConciliarRemesaConfirmationDialog'), { ssr: false });
const ConciliarArea3ReviewDialog = dynamic(() => import('@/components/finanzas/conciliar/ConciliarArea3ReviewDialog'), { ssr: false });
const NewAutomaticRulesPanel = dynamic(() => import('@/components/finanzas/easy/newAutomaticRulesPanel'), { ssr: false });
const NewParaPedirWorkspace = dynamic(() => import('@/components/finanzas/easy/newParaPedirWorkspace'), { ssr: false });
const RemesasWorkspace = dynamic(() => import('@/components/finanzas/remesas-b6/RemesasWorkspace'), { ssr: false });
const ComprobacionSinMovimientos = dynamic(() => import('./ComprobacionSinMovimientos'), { ssr: false });

export type ConciliarUnificadoProps = Readonly<{
  hoy: string;
  vistaInicial: VistaConciliar;
  qInicial: string;
  resumen: ResumenConciliar;
  cuentas: readonly CuentaCuadre[];
  conteos: Readonly<{ reglas: number; rojas: number; verdes: number; cobros: number; pagos: number }>;
  remesas: readonly RemesaResumen[];
}>;

const NOMBRE_VISTA: Record<VistaConciliar, string> = { bandeja: 'Bandeja', cobros: 'Cobros de clientes', pagos: 'Pagos a proveedores', remesas: 'Remesas', pedir: 'Para pedir', cuentas: 'Cuentas y extractos' };
const nf = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 0 });
const e2 = (cents: number) => eur(cents / 100, 2);

type Recibo = Readonly<{ key: string; tipo: 'conciliar' | 'facil'; operationId: string; etiqueta: string; deshecho: boolean }>;
type Reintento = Readonly<{ url: string; body: Record<string, unknown>; etiqueta: string }>;
type FilaEstado = Readonly<{ rows: readonly ConciliarRow[]; total: number; cuentas: readonly ConciliarAccount[] }>;
const VACIO: FilaEstado = { rows: [], total: 0, cuentas: [] };

export default function ConciliarUnificado(props: ConciliarUnificadoProps) {
  const { hoy, resumen, cuentas, conteos, remesas } = props;
  const router = useRouter();
  const { active: actuacion } = useActuation();
  const sesion = actuacion?.sessionId ?? null;
  const [vista, setVistaState] = useState<VistaConciliar>(props.vistaInicial);
  const [aviso, setAviso] = useState('');
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decir = useCallback((texto: string) => { setAviso(texto); if (avisoTimer.current) clearTimeout(avisoTimer.current); avisoTimer.current = setTimeout(() => setAviso(''), 4200); }, []);
  const [reglasAbierto, setReglasAbierto] = useState(false);
  const [auditoriaAbierta, setAuditoriaAbierta] = useState(false);
  const [perfil, setPerfil] = useState<EasyAccessProfile | null>(null);
  const [perfilError, setPerfilError] = useState(false);
  const [rev, setRev] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [reintento, setReintento] = useState<Reintento | null>(null);
  const [recibos, setRecibos] = useState<readonly Recibo[]>([]);

  /* ───────── estado de la bandeja ───────── */
  const [chip, setChip] = useState<ChipKey>('all');
  const [qBorrador, setQBorrador] = useState(props.qInicial);
  const [q, setQ] = useState(props.qInicial);
  const [cuentaId, setCuentaId] = useState('');
  const [pagina, setPagina] = useState(0);
  const [bandeja, setBandeja] = useState<FilaEstado>(VACIO);
  const [cargando, setCargando] = useState(true);
  const [errorLectura, setErrorLectura] = useState('');
  const [selId, setSelId] = useState<string | null>(null);
  const [motivoNoReq, setMotivoNoReq] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [remesaPendiente, setRemesaPendiente] = useState<{ row: ConciliarRow; preview: ConciliarRemesaPreview; payload: Record<string, unknown> } | null>(null);
  const [revision, setRevision] = useState<{ row: ConciliarRow; preview: ConciliarReviewPreview } | null>(null);
  const [facil, setFacil] = useState<ReadonlyMap<string, EasyMovement>>(new Map());
  const diasFacil = useRef<Set<string>>(new Set());

  useEffect(() => { const t = setTimeout(() => { setQ(qBorrador.trim()); setPagina(0); }, 300); return () => clearTimeout(t); }, [qBorrador]);
  useEffect(() => {
    let vivo = true;
    getJson(`${API_FACIL}/perfil`).then(raw => { if (vivo) setPerfil(parseEasyAccessProfile(raw)); }).catch(() => { if (vivo) setPerfilError(true); });
    return () => { vivo = false; };
  }, []);

  const cuadraPorId = useMemo(() => new Map(cuentas.map(c => [c.id, c.cuadra] as const)), [cuentas]);
  const cuentaPorClave = useMemo(() => new Map(bandeja.cuentas.map(c => [`${c.banco}|${c.cuenta ?? ''}`, c.id] as const)), [bandeja.cuentas]);
  const cuentaIdDeFila = useCallback((row: ConciliarRow) => cuentaPorClave.get(`${row.banco ?? ''}|${row.cuenta ?? ''}`) ?? null, [cuentaPorClave]);
  const bloqueoDeFila = useCallback((row: ConciliarRow) => bloqueoPorCuadre(cuentaIdDeFila(row), cuadraPorId), [cuentaIdDeFila, cuadraPorId]);

  /* ───────── lectura de la bandeja (de 50 en 50) ───────── */
  useEffect(() => {
    if (vista !== 'bandeja') return;
    const ctl = new AbortController();
    const lecturas = lecturasDeChip(chip);
    const size = tamanoPorLectura(lecturas.length);
    setCargando(true); setErrorLectura('');
    Promise.all(lecturas.map(l => leerProyeccion(l, { q, cuentaId, limit: size, offset: pagina * size }, ctl.signal)))
      .then((rs: ConciliarReadResponse[]) => {
        setBandeja({ rows: unirBandeja(rs.map(r => r.rows)), total: rs.reduce((s, r) => s + r.total, 0), cuentas: rs[0]?.cuentas ?? [] });
        setCargando(false);
      })
      .catch(err => { if (ctl.signal.aborted) return; setErrorLectura(err instanceof Error ? err.message : 'No se pudo leer la bandeja.'); setCargando(false); });
    return () => ctl.abort();
  }, [vista, chip, q, cuentaId, pagina, rev]);

  useEffect(() => {
    if (!bandeja.rows.length) { setSelId(null); return; }
    setSelId(cur => (cur && bandeja.rows.some(r => r.id === cur) ? cur : bandeja.rows[0].id));
  }, [bandeja.rows]);
  const sel = useMemo(() => bandeja.rows.find(r => r.id === selId) ?? null, [bandeja.rows, selId]);

  /* Sugerencias exactas y «no requiere» propuesto vienen de Modo fácil, por día. */
  useEffect(() => {
    if (!sel?.movimientoId || diasFacil.current.has(`${sel.fecha}:${rev}`)) return;
    diasFacil.current.add(`${sel.fecha}:${rev}`);
    leerModoFacilDia(sel.fecha).then(movs => setFacil(cur => { const n = new Map(cur); for (const m of movs) n.set(m.id, m); return n; })).catch(() => undefined);
  }, [sel?.fecha, sel?.movimientoId, rev]);
  const movFacil = sel?.movimientoId ? facil.get(sel.movimientoId) ?? null : null;
  useEffect(() => { setMotivoNoReq(movFacil?.motivoNoRequierePropuesto ?? ''); }, [movFacil?.id, movFacil?.motivoNoRequierePropuesto]);

  /* ───────── navegación entre vistas ───────── */
  const setVista = useCallback((v: VistaConciliar) => {
    setVistaState(v);
    if (typeof window !== 'undefined') window.history.replaceState(null, '', v === 'bandeja' ? '/admin/finanzas/conciliar' : `/admin/finanzas/conciliar?vista=${v}`);
  }, []);
  const refrescar = useCallback(() => { diasFacil.current.clear(); setRev(r => r + 1); router.refresh(); }, [router]);

  /* ───────── enviar acciones (auditadas; resultado incierto = reintento con la MISMA clave) ───────── */
  const enviar = useCallback(async (url: string, body: Record<string, unknown>, etiqueta: string, alOk: (raw: unknown) => void) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      const raw = await postJson(url, body, sesion);
      setReintento(null);
      alOk(raw);
    } catch (err) {
      if (err instanceof ResultadoIncierto) { setReintento({ url, body, etiqueta }); decir('No hemos podido comprobar el resultado. Reintenta exactamente la misma acción antes de continuar.'); }
      else if (err instanceof ErrorServidor && err.codigo === 'CUENTA_NO_CUADRA') decir(err.message);
      else if (err instanceof ErrorServidor && err.status === 409) { decir('Estos datos han cambiado. Se actualiza la lista; vuelve a comprobar.'); refrescar(); }
      else if (err instanceof ErrorServidor && (err.status === 401 || err.status === 403)) decir('No tienes permiso para esta acción con la sesión actual.');
      else decir(err instanceof Error ? err.message : 'No se pudo completar la acción.');
    } finally { setOcupado(false); }
  }, [ocupado, sesion, decir, refrescar]);

  const guardarRecibo = useCallback((r: Omit<Recibo, 'deshecho' | 'key'>) => setRecibos(cur => [{ ...r, key: `${r.tipo}:${r.operationId}`, deshecho: false }, ...cur.filter(x => x.operationId !== r.operationId)].slice(0, 20)), []);

  const enviarConciliar = useCallback((payload: Record<string, unknown>, etiqueta: string) => {
    void enviar(API_CONCILIAR, { ...payload, idempotencyKey: makeIdempotencyKey() }, etiqueta, raw => {
      let res; try { res = resultadoConfirmacion(raw); } catch { setReintento({ url: API_CONCILIAR, body: payload, etiqueta }); decir('No se pudo comprobar la acción. Actualiza antes de repetirla.'); return; }
      const ok = res.outcomes.filter(o => o.ok).length; const mal = res.outcomes.length - ok;
      if (res.operationId && payload.action !== 'pedir') guardarRecibo({ tipo: 'conciliar', operationId: res.operationId, etiqueta });
      decir(mal ? `${ok} hecha(s); ${mal} necesita(n) revisión.` : payload.action === 'pedir' ? 'Añadido a «Para pedir». No se ha enviado ningún aviso.' : 'Hecho. Queda en auditoría y puedes deshacerlo.');
      refrescar();
    });
  }, [enviar, decir, guardarRecibo, refrescar]);

  const enviarFacil = useCallback((payload: Record<string, unknown>, etiqueta: string) => {
    void enviar(API_FACIL, { ...payload, idempotencyKey: makeIdempotencyKey(), confirmacion: true }, etiqueta, raw => {
      const op = raw && typeof raw === 'object' ? (raw as { operacionId?: unknown }).operacionId : null;
      if (typeof op !== 'string' || !op) { decir('No se pudo comprobar la acción. Actualiza antes de repetirla.'); refrescar(); return; }
      guardarRecibo({ tipo: 'facil', operationId: op, etiqueta });
      decir('Hecho. Queda en auditoría y puedes deshacerlo.');
      refrescar();
    });
  }, [enviar, decir, guardarRecibo, refrescar]);

  const deshacer = useCallback((tipo: Recibo['tipo'], operationId: string) => {
    const hecho = () => { setRecibos(cur => cur.map(r => (r.operationId === operationId ? { ...r, deshecho: true } : r))); decir('Acción deshecha.'); refrescar(); };
    if (tipo === 'conciliar') {
      void enviar(API_CONCILIAR, { action: 'deshacer', operationId, idempotencyKey: makeIdempotencyKey() }, 'deshacer', raw => {
        try { const r = resultadoDeshacer(raw); if (r.undone) hecho(); else decir(r.message || 'La acción ya no se puede deshacer.'); } catch { decir('No se pudo comprobar el deshacer.'); }
      });
    } else {
      void enviar(`${API_FACIL}/deshacer`, { action: 'deshacer', confirmacion: true, operacionId: operationId, idempotencyKey: makeIdempotencyKey() }, 'deshacer', hecho);
    }
  }, [enviar, decir, refrescar]);

  /* ───────── acciones sobre la fila seleccionada ───────── */
  const textoBloqueo = useCallback((row: ConciliarRow) => {
    const b = bloqueoDeFila(row);
    if (!b) return null;
    return b === 'CUENTA_DESCONOCIDA' ? 'No se puede confirmar: no consta la cuenta de este movimiento.' : 'No se puede confirmar hasta que la cuenta cuadre (paso 2).';
  }, [bloqueoDeFila]);

  const confirmable = useCallback((row: ConciliarRow) => row.color === 'VERDE' && (row.seleccionable || hasHumanOwnTransferConfirmation(row)), []);

  const abrirRemesa = useCallback(async (row: ConciliarRow, payload: Record<string, unknown>) => {
    setRevisando(true);
    try {
      const preview = parseConciliarRemesaPreviewResponse(await getJson(`${API_CONCILIAR}/remesa-preview?rowId=${encodeURIComponent(row.id)}`));
      setRemesaPendiente({ row, preview, payload });
    } catch (err) { decir(err instanceof Error ? err.message : 'No se pudo revisar la composición de la remesa.'); }
    finally { setRevisando(false); }
  }, [decir]);

  const confirmarFila = useCallback((row: ConciliarRow) => {
    const t = textoBloqueo(row); if (t) { decir(t); return; }
    if (!confirmable(row)) { decir('Esta propuesta no es confirmable todavía.'); return; }
    const humano = hasHumanOwnTransferConfirmation(row);
    const payload = { action: humano ? 'confirmar_traspasos_propios_manual' : 'confirmar', items: [{ id: row.id, decisionHash: row.decisionHash }] };
    if (!humano && requiresSeparateRemesaConfirmation(row)) { void abrirRemesa(row, payload); return; }
    enviarConciliar(payload, humano ? 'confirmación de pareja propia' : 'confirmación');
  }, [textoBloqueo, confirmable, decir, abrirRemesa, enviarConciliar]);

  const revisarAmbar = useCallback(async (row: ConciliarRow) => {
    setRevisando(true);
    try {
      const raw = await postJson(API_CONCILIAR, { action: 'confirmar', review: { kind: 'REVIEW_PREVIEW', id: row.id, decisionHash: row.decisionHash } }, sesion);
      const preview = parseConciliarReviewPreviewResponse(raw);
      if (preview.id !== row.id || preview.decisionHash !== row.decisionHash) throw new Error('La previsualización no corresponde a la propuesta abierta.');
      setRevision({ row, preview });
    } catch (err) { decir(err instanceof Error ? err.message : 'No se pudo revisar esta propuesta.'); }
    finally { setRevisando(false); }
  }, [sesion, decir]);

  const confirmarRevision = useCallback(() => {
    if (!revision) return;
    const { row, preview } = revision;
    const t = textoBloqueo(row); if (t) { decir(t); setRevision(null); return; }
    if (!preview.puedeConfirmarRevision || !preview.acknowledgement) { setRevision(null); decir('La propuesta ya no conserva una advertencia confirmable. Actualiza y vuelve a revisarla.'); return; }
    setRevision(null);
    enviarConciliar({ action: 'confirmar', review: { kind: 'REVIEW_CONFIRM', id: row.id, decisionHash: preview.decisionHash, acknowledgement: { ...preview.acknowledgement, advertenciaReconocida: true } } }, 'confirmación de revisión humana');
  }, [revision, textoBloqueo, decir, enviarConciliar]);

  const confirmarSugerencia = useCallback((row: ConciliarRow, m: EasyMovement, s: EasySuggestion) => {
    const t = textoBloqueo(row); if (t) { decir(t); return; }
    enviarFacil({ action: 'confirmar_factura', movimientoId: m.id, version: m.version, sugerenciaId: s.id }, `documento ${s.referencia}`);
  }, [textoBloqueo, decir, enviarFacil]);

  const marcarNoRequiere = useCallback((row: ConciliarRow, m: EasyMovement) => {
    const t = textoBloqueo(row); if (t) { decir(t); return; }
    if (!motivoNoReq) { decir('Elige primero el motivo.'); return; }
    enviarFacil({ action: 'no_requiere', movimientoId: m.id, version: m.version, motivoNoRequiere: motivoNoReq }, `no requiere documento: ${noRequireReasonLabel(motivoNoReq)}`);
  }, [textoBloqueo, decir, motivoNoReq, enviarFacil]);

  const pedirPapel = useCallback((row: ConciliarRow) => {
    enviarConciliar({ action: 'pedir', id: row.id, decisionHash: row.decisionHash }, 'solicitud de documento');
  }, [enviarConciliar]);

  const buscarOtraFactura = useCallback((row: ConciliarRow) => {
    setQBorrador(String(Math.abs(row.importeCentimos))); setQ(String(Math.abs(row.importeCentimos))); setPagina(0);
    setVista(row.importeCentimos >= 0 ? 'cobros' : 'pagos');
  }, [setVista]);

  /* ───────── atajos: C confirma y ↓ pasa al siguiente ───────── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (vista !== 'bandeja' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return;
      if (revision || remesaPendiente) return;
      if (e.key === 'ArrowDown') { const i = bandeja.rows.findIndex(r => r.id === selId); if (i >= 0 && i < bandeja.rows.length - 1) { e.preventDefault(); setSelId(bandeja.rows[i + 1].id); } }
      if ((e.key === 'c' || e.key === 'C') && sel && !ocupado) { e.preventDefault(); confirmarFila(sel); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [vista, bandeja.rows, selId, sel, ocupado, confirmarFila, revision, remesaPendiente]);

  /* ───────── exportar ───────── */
  const exportarExcel = useCallback(async () => {
    try {
      const tabs = vista === 'cobros' ? [{ tab: 'EMITIDAS' }] : vista === 'pagos' ? [{ tab: 'RECIBIDAS' }] : lecturasDeChip(chip);
      const filas: ConciliarRow[] = [];
      for (const l of tabs) {
        let total = Infinity;
        for (let offset = 0; offset < total; offset += 100) {
          const r = await leerProyeccion(l, { q, cuentaId, limit: 100, offset });
          total = r.total; filas.push(...r.rows);
          if (filas.length > 5000) throw new Error('La exportación está limitada a 5.000 filas. Acota con la búsqueda o la cuenta.');
        }
      }
      if (!filas.length) { decir('No hay filas para exportar.'); return; }
      const XLSX = await import('xlsx');
      const { createConciliarXlsx, downloadConciliarXlsx } = await import('@/components/finanzas/conciliar/conciliar-xlsx');
      downloadConciliarXlsx(await createConciliarXlsx(XLSX, NOMBRE_VISTA[vista].slice(0, 31), filas), `conciliar-${vista}-${hoy}.xlsx`);
      decir(`${nf(filas.length)} filas exportadas.`);
    } catch (err) { decir(err instanceof Error ? err.message : 'No se pudo exportar.'); }
  }, [vista, chip, q, cuentaId, hoy, decir]);

  const irA = useCallback((d: VistaConciliar | 'reglas') => {
    if (d === 'reglas') { setReglasAbierto(true); setTimeout(() => document.getElementById('reglas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return; }
    setVista(d);
  }, [setVista]);

  /* ───────── datos derivados para cabecera, KPIs y pasos ───────── */
  const entrada = useMemo(() => ({ resumen, cuentas, sinDocumentoCobros: conteos.cobros, sinDocumentoPagos: conteos.pagos, rojas: conteos.rojas, reglas: conteos.reglas, hoy }), [resumen, cuentas, conteos, hoy]);
  const kpis = useMemo(() => buildKpis(entrada), [entrada]);
  const pasos = useMemo(() => buildPasos(entrada), [entrada]);
  const activas = cuentasActivas(cuentas);
  const corte = corteMinimo(cuentas);
  const totalBandeja = conteos.cobros + conteos.pagos;

  return <>
    <header className="top">
      <div className="wrap">
        <div className="bar">
          <div className="brand"><b>internet<i>operadores</i></b><span className="eyebrow">Conciliar · banco con facturas</span></div>
          <div className="scn">
            <span className="small muted">Cobertura revisada hasta {corte ? fechaLarga(corte).slice(0, 5) : '—'} · {activas.length} cuentas</span>
            <a className="btn" href="/admin/finanzas/importar">Cargar extractos</a>
            <button className="btn primary" type="button" onClick={() => irA('reglas')}>Aplicar reglas automáticas</button>
            <Menu label="Acciones">{close => <>
              <button type="button" role="menuitem" onClick={() => { close(); void exportarExcel(); }}>Exportar a Excel</button>
              <a role="menuitem" href="/admin/finanzas/exportar-a3" onClick={close}>Exportar a A3</a>
              <button type="button" role="menuitem" onClick={() => { close(); setAuditoriaAbierta(true); setTimeout(() => document.getElementById('auditoria')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }}>Ver auditoría</button>
            </>}</Menu>
          </div>
        </div>
        <nav className="tabs" aria-label="Vistas">
          {VISTAS.map(v => <a key={v} href={`#${v}`} data-v={v} aria-current={vista === v ? 'page' : 'false'} onClick={e => { e.preventDefault(); setVista(v); }}>{NOMBRE_VISTA[v]}{v === 'bandeja' && <> <span className="tag">{nf(totalBandeja)}</span></>}</a>)}
        </nav>
      </div>
      <div className="kpis" id="kpis">{kpis.map(k => <div className="kpi" key={k.label}><div className="eyebrow">{k.label}</div><div className={`v ${k.tone}`}>{k.value}</div><div className="s">{k.sub}</div></div>)}</div>
    </header>
    <main className="wrap">
      <p className="replaces" style={{ margin: 0 }}>Una sola pantalla en lugar de cinco: Conciliar, Conciliación, Modo fácil, Pendientes y Conciliación de remesas. Todas las cifras son reales; el panel propone y tú confirmas.</p>
      <div className="panel">
        <h2>Cómo se cierra el mes</h2>
        <p className="help">Cinco pasos, en orden. Pulsa uno para ir a él.</p>
        <div className="steps" id="steps">{pasos.map((p, i) => <div key={p.titulo} className={`step ${p.estado}`} data-go={p.ir} role="button" tabIndex={0} onClick={() => irA(p.ir)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); irA(p.ir); } }}><div className="row"><span className="n">{p.estado === 'ok' ? '✓' : i + 1}</span><b>{p.titulo}</b></div><span className="s">{p.texto}</span></div>)}</div>
      </div>

      {reglasAbierto && <div id="reglas"><Panel title="Reglas automáticas" help="Traspasos propios y comisiones del banco. Se previsualizan antes de aplicar; nada se aplica sin que lo confirmes y todo se puede deshacer." aside={<button className="btn small" type="button" onClick={() => setReglasAbierto(false)}>Cerrar</button>}>
        {perfil ? <NewAutomaticRulesPanel profile={perfil} /> : <p className="small muted">{perfilError ? 'No se ha podido comprobar tu perfil de acceso. Las reglas no están disponibles.' : 'Comprobando permisos…'}</p>}
      </Panel></div>}

      {reintento && <div className="note bad" role="alert"><b>Resultado sin comprobar: {reintento.etiqueta}.</b> No repitas otra acción; reintenta exactamente esta. <button className="btn small" type="button" disabled={ocupado} onClick={() => { const r = reintento; void enviar(r.url, r.body, r.etiqueta, () => { decir('Hecho.'); refrescar(); }); }}>Reintentar la misma acción</button> <button className="btn small" type="button" onClick={() => { setReintento(null); refrescar(); }}>Actualizar y descartar</button></div>}

      {vista === 'bandeja' && <section className="view" id="v-bandeja">
        <div className="lay">
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 0' }}>
              <h2>Movimientos sin documento</h2>
              <p className="help">Para cada movimiento, el panel propone la factura o el motivo. Tú confirmas.</p>
              <div className="row" style={{ marginBottom: 10 }}>
                <input className="search" type="search" placeholder="Concepto, importe, cliente o proveedor" id="q" value={qBorrador} onChange={e => setQBorrador(e.target.value)} aria-label="Buscar movimientos" />
                <select className="f" id="fAcc" value={cuentaId} aria-label="Cuenta" onChange={e => { setCuentaId(e.target.value); setPagina(0); }}>
                  <option value="">Todas las cuentas</option>
                  {activas.map(c => <option key={c.id} value={c.id}>{c.etiqueta}</option>)}
                </select>
              </div>
              <div className="chips" id="chips">{CHIPS.map(c => <button key={c[0]} type="button" data-f={c[0]} aria-pressed={c[0] === chip} onClick={() => { setChip(c[0]); setPagina(0); }}>{c[1]}</button>)}</div>
            </div>
            <div id="list" aria-busy={cargando}>
              {errorLectura && <p className="muted" style={{ padding: 16 }} role="alert">{errorLectura}</p>}
              {!errorLectura && cargando && !bandeja.rows.length && <p className="muted" style={{ padding: 16 }}>Cargando movimientos…</p>}
              {!errorLectura && !cargando && !bandeja.rows.length && <p className="muted" style={{ padding: 16 }}>Ningún movimiento cumple el filtro.</p>}
              {bandeja.rows.map(r => { const st = estadoPropuesta(r); return <div key={r.id} className={`mv ${r.id === selId ? 'sel' : ''}`} role="button" tabIndex={0} data-i={r.id} onClick={() => setSelId(r.id)} onKeyDown={e => { if (e.key === 'Enter') setSelId(r.id); }}>
                <span className="d">{fechaCorta(r.fecha)}</span>
                <div className="c"><div>{r.concepto}</div><div className="small muted">{etiquetaCuenta(r.cuenta, cuentas)} · <span className={`st ${st.cls}`}>{st.label}</span></div></div>
                <span className={`a ${r.importeCentimos > 0 ? 'in' : ''}`}>{e2(r.importeCentimos)}</span>
              </div>; })}
            </div>
            <div className="row" style={{ padding: '10px 16px', justifyContent: 'space-between' }}>
              <span className="small muted">{bandeja.total ? `${nf(pagina * tamanoPorLectura(lecturasDeChip(chip).length) * lecturasDeChip(chip).length + 1)}–${nf(Math.min(bandeja.total, (pagina + 1) * PAGINA_BANDEJA))} de ${nf(bandeja.total)} · de 50 en 50 · C confirmar · ↓ siguiente` : 'Sin resultados'}</span>
              <span className="row"><button className="btn small" type="button" disabled={pagina === 0 || cargando} onClick={() => setPagina(p => Math.max(0, p - 1))}>Anterior</button><button className="btn small" type="button" disabled={cargando || (pagina + 1) * PAGINA_BANDEJA >= bandeja.total} onClick={() => setPagina(p => p + 1)}>Siguiente</button></span>
            </div>
          </div>
          <aside className="panel side" id="side" aria-live="polite">{sel ? <Lateral
            row={sel} cuentas={cuentas} movFacil={movFacil} ocupado={ocupado || revisando} bloqueo={textoBloqueo(sel)} confirmable={confirmable(sel)}
            motivo={motivoNoReq} setMotivo={setMotivoNoReq}
            onConfirmar={() => confirmarFila(sel)} onRevisar={() => void revisarAmbar(sel)} onSugerencia={s => movFacil && confirmarSugerencia(sel, movFacil, s)}
            onNoRequiere={() => movFacil && marcarNoRequiere(sel, movFacil)} onPedir={() => pedirPapel(sel)} onBuscar={() => buscarOtraFactura(sel)}
          /> : <p className="muted">Selecciona un movimiento.</p>}</aside>
        </div>
      </section>}

      {vista === 'cobros' && <FacturasVista key="cobros" tab="EMITIDAS" titulo="Facturas emitidas sin cobro encontrado" ayuda="Lo mismo que «Por confirmar» en Facturación. Ordenadas por fecha." prefijo="Factura" tercero="Cliente" qInicial={q} rev={rev} cuentas={cuentas} onVerMovimiento={(texto) => { setQBorrador(texto); setQ(texto); setPagina(0); setVista('bandeja'); }} />}
      {vista === 'pagos' && <FacturasVista key="pagos" tab="RECIBIDAS" titulo="Facturas de proveedor sin pago" ayuda="Facturas recibidas que no casan con ningún cargo del banco." prefijo="Factura" tercero="Proveedor" qInicial={q} rev={rev} cuentas={cuentas} onVerMovimiento={(texto) => { setQBorrador(texto); setQ(texto); setPagina(0); setVista('bandeja'); }} />}

      {vista === 'remesas' && <section className="view" id="v-remesas">
        <div className="panel"><h2>Remesas de domiciliación</h2><p className="help">Cada remesa cobra muchas facturas de golpe: al casarla, todas sus facturas quedan cobradas. Las devoluciones se marcan aparte. Una remesa nunca se casa solo por importe: se confirma sola, tras ver su composición.</p>
          <div className="tablewrap"><table id="tRem"><thead><tr><th>Remesa</th><th>Fecha</th><th className="n">Facturas</th><th className="n">Importe</th><th>Devueltos</th><th>Estado</th></tr></thead><tbody>
            {remesas.map(r => <tr key={r.id}><td>{r.nombre}</td><td>{fechaLarga(r.fecha)}</td><td className="n">{nf(r.facturas)}</td><td className="n">{e2(r.importeCentimos)}</td><td>{r.rechazos ? `${r.rechazos}` : '—'}</td><td><span className={`st ${r.estado === 'CONCILIADA' ? 'g' : r.estado === 'DIFERENCIA' ? 'b' : 'w'}`}>{r.estado === 'CONCILIADA' ? 'Casada' : r.estado === 'DIFERENCIA' ? 'Con diferencia' : r.estado === 'PENDIENTE' ? 'Pendiente' : 'Sin casar'}</span></td></tr>)}
            {!remesas.length && <tr><td colSpan={6} className="muted">No hay remesas en el ejercicio.</td></tr>}
          </tbody></table></div>
          <details className="fold" style={{ marginTop: 12 }}><summary>Conciliar remesas, devoluciones y confirming (herramienta completa)</summary><div className="foldbody"><RemesasWorkspace /></div></details>
        </div>
      </section>}

      {vista === 'pedir' && <ParaPedirVista perfil={perfil} rev={rev} ocupado={ocupado} onPedir={(rowId, hash) => enviarConciliar({ action: 'pedir', id: rowId, decisionHash: hash }, 'solicitud de documento')} />}

      {vista === 'cuentas' && <CuentasVista cuentas={cuentas} hoy={hoy} acting={!!sesion} onSaved={refrescar} />}

      {(auditoriaAbierta || recibos.length > 0) && <div id="auditoria"><Panel title="Auditoría y deshacer" help="Cada confirmación queda registrada con quién, cuándo y qué. Lo que hagas en esta sesión se puede deshacer aquí; el historial completo está debajo." aside={<button className="btn small" type="button" onClick={() => setAuditoriaAbierta(a => !a)}>{auditoriaAbierta ? 'Ocultar historial' : 'Ver historial'}</button>}>
        {recibos.length > 0 && <div>{recibos.map(r => <div className="chain" key={r.key}><div><b style={{ fontWeight: 500 }}>{r.etiqueta}</b><div className="small muted">{r.tipo === 'facil' ? 'Documento o «no requiere»' : 'Confirmación o pedido'}</div></div><span className={`st ${r.deshecho ? '' : 'g'}`}>{r.deshecho ? 'Deshecha' : 'Hecha'}</span><button className="btn small" type="button" disabled={r.deshecho || ocupado} onClick={() => deshacer(r.tipo, r.operationId)}>Deshacer</button></div>)}</div>}
        {auditoriaAbierta && <ConciliarConfirmationHistory activeActuationSessionId={sesion} busy={ocupado} refreshKey={rev} onUndo={(operationId) => deshacer('conciliar', operationId)} onLoadError={m => decir(m)} />}
      </Panel></div>}
    </main>
    {remesaPendiente && <ConciliarRemesaConfirmationDialog confirmation={{ preview: remesaPendiente.preview }} busy={ocupado} onCancel={() => { if (!ocupado) setRemesaPendiente(null); }} onConfirm={() => { const c = remesaPendiente; setRemesaPendiente(null); enviarConciliar(c.payload, 'confirmación de remesa revisada'); }} />}
    {revision && <ConciliarArea3ReviewDialog row={revision.row} review={revision.preview} busy={ocupado} onCancel={() => { if (!ocupado) setRevision(null); }} onConfirm={confirmarRevision} />}
    <Toast text={aviso} />
  </>;
}

/* ───────── panel lateral de la bandeja ───────── */
function Lateral(p: Readonly<{
  row: ConciliarRow; cuentas: readonly CuentaCuadre[]; movFacil: EasyMovement | null; ocupado: boolean; bloqueo: string | null; confirmable: boolean;
  motivo: string; setMotivo: (v: string) => void;
  onConfirmar: () => void; onRevisar: () => void; onSugerencia: (s: EasySuggestion) => void; onNoRequiere: () => void; onPedir: () => void; onBuscar: () => void;
}>) {
  const { row: r, movFacil: m } = p;
  const q = quienEs(r);
  const quien = m?.quienEs?.nombre ? { cls: m.quienEs.estado === 'IDENTIFICADO' ? 'g' as const : 'w' as const, label: m.quienEs.estado === 'IDENTIFICADO' ? m.quienEs.nombre : `${m.quienEs.nombre} · por confirmar` } : q;
  const yaPedida = r.gestionDocumento?.estado === 'PEDIDO' || r.gestionDocumento?.estado === 'PEDIDO_SIN_AUDITORIA';
  const sugerencias = (m?.sugerencias ?? []).filter(s => s.referencia !== r.documento?.referencia);
  const hayPropuesta = !!r.documento || sugerencias.length > 0;
  const confirmaVerde = p.confirmable;
  const etiquetaConfirmar = hasHumanOwnTransferConfirmation(r) ? 'Confirmar pareja' : 'Confirmar';
  const puedePedir = r.color === 'ROJO' && !!r.movimientoId;
  return <>
    <h2>{e2(r.importeCentimos)}</h2>
    <div className="small muted">{fechaLarga(r.fecha)} · {etiquetaCuenta(r.cuenta, p.cuentas)}</div>
    <dl className="kv"><dt>Concepto</dt><dd>{r.concepto}</dd><dt>Tipo</dt><dd>{tipoDeFila(r)}</dd><dt>Quién es</dt><dd><span className={`st ${quien.cls}`}>{quien.label}</span></dd></dl>
    <h3 className="eyebrow" style={{ margin: '0 0 6px' }}>Propuestas</h3>
    {r.documento && <div className={`sug ${confirmaVerde ? 'best' : ''}`}>
      <div><div style={{ fontWeight: 500 }}>Factura {r.documento.referencia}{r.documento.tercero ? ` · ${r.documento.tercero}` : ''}</div>
        <div className="conf">{e2(r.documento.importeCentimos)}{r.documento.fecha ? ` · emitida ${fechaLarga(r.documento.fecha)}` : ''} · {r.color === 'VERDE' ? 'coincidencia exacta' : 'requiere revisión'}</div>
        <div className="conf">{r.motivo}</div></div>
      {confirmaVerde ? <button className="btn small primary" type="button" disabled={p.ocupado || !!p.bloqueo} title={p.bloqueo ?? undefined} onClick={p.onConfirmar}>{etiquetaConfirmar}</button>
        : r.color === 'AMBAR' && r.movimientoId ? <button className="btn small" type="button" disabled={p.ocupado} onClick={p.onRevisar}>Revisar propuesta</button> : null}
    </div>}
    {!r.documento && r.color === 'VERDE' && confirmaVerde && <div className="sug best"><div><div style={{ fontWeight: 500 }}>{tipoDeFila(r)}</div><div className="conf">{r.motivo}</div></div><button className="btn small primary" type="button" disabled={p.ocupado || !!p.bloqueo} title={p.bloqueo ?? undefined} onClick={p.onConfirmar}>{etiquetaConfirmar}</button></div>}
    {sugerencias.map(s => <div className="sug" key={s.id}>
      <div><div style={{ fontWeight: 500 }}>Factura {s.referencia}{s.tercero ? ` · ${s.tercero}` : ''}</div>
        <div className="conf">{e2(s.importeCentimos)}{s.fecha ? ` · emitida ${fechaLarga(s.fecha)}` : ''}{s.vencimiento ? ` · vence ${fechaLarga(s.vencimiento)}` : ''} · {suggestionEvidenceLabel(s).toLowerCase()}</div></div>
      <button className="btn small" type="button" disabled={p.ocupado || !!p.bloqueo || !m || !canConfirmSuggestion(m, s)} title={p.bloqueo ?? (m && canConfirmSuggestion(m, s) ? undefined : 'Sólo se confirma una coincidencia exacta con su archivo.')} onClick={() => p.onSugerencia(s)}>Confirmar</button>
    </div>)}
    {!hayPropuesta && !(r.color === 'VERDE' && confirmaVerde) && <p className="small muted">Sin propuesta de factura. {r.motivo}</p>}
    {p.bloqueo && <p className="small" style={{ color: 'var(--bad)', margin: '4px 0 0' }}>{p.bloqueo}</p>}
    {m && <div className="row" style={{ marginTop: 10 }}>
      <select className="f" aria-label="Motivo para «No requiere documento»" value={p.motivo} onChange={e => p.setMotivo(e.target.value)}><option value="">Motivo…</option>{MOTIVOS_NO_REQUIERE.map(o => <option key={o[0]} value={o[0]}>{o[1]}</option>)}</select>
      <button className="btn small" type="button" disabled={p.ocupado || !!p.bloqueo || !p.motivo} onClick={p.onNoRequiere}>No requiere documento</button>
    </div>}
    <div className="acts">
      <button className="btn small" type="button" onClick={p.onBuscar}>Buscar otra factura</button>
      <button className="btn small" type="button" disabled title="La división de un movimiento entre varias facturas aún no tiene acción propia; las sumas de varias facturas ya llegan propuestas.">Dividir entre varias</button>
      {!m && <button className="btn small" type="button" disabled title="Este movimiento no está en la cola «sin documento»: no admite «No requiere documento».">No requiere documento</button>}
      {puedePedir && (yaPedida ? <button className="btn small" type="button" disabled>Ya pedida</button> : <button className="btn small" type="button" disabled={p.ocupado} onClick={p.onPedir}>Pedir el papel</button>)}
    </div>
    {r.gestionDocumento?.estado === 'PEDIDO' && r.gestionDocumento.pedido && <p className="small muted" style={{ margin: '8px 0 0' }}>Pedida el {fechaLarga(r.gestionDocumento.pedido.fecha)}{r.gestionDocumento.pedido.por ? ` · ${r.gestionDocumento.pedido.por}` : ''}. No se ha enviado ningún aviso.</p>}
    <p className="small muted" style={{ margin: '12px 0 0' }}>Confirmar no se aplica hasta que la cuenta cuadre (paso 2). Queda en auditoría y se puede deshacer.</p>
  </>;
}

/* ───────── Cobros / Pagos (facturas sin movimiento) ───────── */
function FacturasVista(p: Readonly<{ tab: 'EMITIDAS' | 'RECIBIDAS'; titulo: string; ayuda: string; prefijo: string; tercero: string; qInicial: string; rev: number; cuentas: readonly CuentaCuadre[]; onVerMovimiento: (texto: string) => void }>) {
  const [q, setQ] = useState(p.qInicial);
  const [qDeb, setQDeb] = useState(p.qInicial);
  const [pagina, setPagina] = useState(0);
  const [datos, setDatos] = useState<ConciliarReadResponse | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQDeb(q.trim()); setPagina(0); }, 300); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const ctl = new AbortController(); setError('');
    leerProyeccion({ tab: p.tab }, { q: qDeb, cuentaId: '', limit: PAGINA_BANDEJA, offset: pagina * PAGINA_BANDEJA }, ctl.signal).then(setDatos).catch(e => { if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo leer.'); });
    return () => ctl.abort();
  }, [p.tab, qDeb, pagina, p.rev]);
  const resumen = datos?.tabs.find(t => t.tab === p.tab);
  return <section className="view"><div className="panel"><h2>{p.titulo}</h2>
    <p className="help">{p.ayuda}{resumen ? ` ${nf(resumen.count)} facturas, ${e2(Math.abs(resumen.amountCentimos))}.` : ''}</p>
    <div className="row" style={{ marginBottom: 10 }}><input className="search" type="search" placeholder="Referencia, tercero o importe exacto en céntimos" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar facturas" /></div>
    {error && <p className="muted" role="alert">{error}</p>}
    <div className="tablewrap"><table><thead><tr><th>{p.prefijo}</th><th>{p.tercero}</th><th>Fecha</th><th className="n">Importe</th><th>Propuesta</th></tr></thead><tbody>
      {(datos?.rows ?? []).map(r => { const st = estadoPropuesta(r); return <tr key={r.id}>
        <td>{r.documento?.referencia ?? r.concepto}</td><td>{r.documento?.tercero ?? '—'}</td><td>{fechaLarga(r.fecha)}</td><td className="n">{e2(r.importeCentimos)}</td>
        <td>{r.movimientoId ? <button className="btn small" type="button" onClick={() => p.onVerMovimiento(String(Math.abs(r.importeCentimos)))}><span className={`st ${st.cls}`}>{r.color === 'VERDE' ? 'Propuesta segura' : r.color === 'AMBAR' ? 'Propuesta · revisar' : 'Sin pista'}</span> Ver movimiento</button> : <span className="st">{r.motivo.length > 60 ? 'Sin cobro encontrado' : r.motivo}</span>}</td></tr>; })}
      {datos && !datos.rows.length && <tr><td colSpan={5} className="muted">No hay facturas con ese filtro.</td></tr>}
      {!datos && !error && <tr><td colSpan={5} className="muted">Cargando…</td></tr>}
    </tbody></table></div>
    <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
      <span className="small muted">{datos ? `${nf(Math.min(datos.total, pagina * PAGINA_BANDEJA + 1))}–${nf(Math.min(datos.total, (pagina + 1) * PAGINA_BANDEJA))} de ${nf(datos.total)}` : ''}</span>
      <span className="row"><button className="btn small" type="button" disabled={pagina === 0} onClick={() => setPagina(x => Math.max(0, x - 1))}>Anterior</button><button className="btn small" type="button" disabled={!datos || (pagina + 1) * PAGINA_BANDEJA >= datos.total} onClick={() => setPagina(x => x + 1)}>Siguiente</button></span>
    </div></div></section>;
}

/* ───────── Para pedir ───────── */
function ParaPedirVista(p: Readonly<{ perfil: EasyAccessProfile | null; rev: number; ocupado: boolean; onPedir: (rowId: string, hash: string) => void }>) {
  const [datos, setDatos] = useState<ParaPedirRead | null>(null);
  const [tercero, setTercero] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const ctl = new AbortController(); setError('');
    leerParaPedir({ estado: 'TODOS', q: '', tercero, limit: 50, offset: 0 }, ctl.signal).then(setDatos).catch(e => { if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : 'No se pudo leer.'); });
    return () => ctl.abort();
  }, [tercero, p.rev]);
  return <section className="view"><div className="panel"><h2>Para pedir</h2>
    <p className="help">Movimientos a los que les falta el papel. Agrupados por a quién hay que pedírselo. Pedir sólo lo anota: no se envía ningún correo ni aviso.</p>
    {error && <p className="muted" role="alert">{error}</p>}
    <div className="tablewrap"><table id="tPed"><thead><tr><th>A quién</th><th>Qué falta</th><th className="n">Movimientos</th><th className="n">Importe</th><th>Acción</th></tr></thead><tbody>
      {(datos?.agrupaciones ?? []).map(a => <tr key={a.tercero}><td>{a.tercero}</td><td>{a.faltanPedir ? `${nf(a.faltanPedir)} por pedir` : 'Todo pedido'}{a.pedidos ? ` · ${nf(a.pedidos)} pedidos` : ''}{a.recibidos ? ` · ${nf(a.recibidos)} recibidos` : ''}</td><td className="n">{nf(a.movimientos)}</td><td className="n">{e2(a.pendienteCentimos)}</td><td><button className="btn small" type="button" onClick={() => setTercero(tercero === a.tercero ? null : a.tercero)}>{tercero === a.tercero ? 'Ver todos' : 'Ver movimientos'}</button></td></tr>)}
      {datos && !datos.agrupaciones.length && <tr><td colSpan={5} className="muted">No hay nada que pedir.</td></tr>}
      {!datos && !error && <tr><td colSpan={5} className="muted">Cargando…</td></tr>}
    </tbody></table></div>
    {tercero && datos && <div className="tablewrap" style={{ marginTop: 12 }}><table><thead><tr><th>Fecha</th><th>Concepto</th><th className="n">Importe</th><th>Estado</th><th>Acción</th></tr></thead><tbody>
      {datos.movimientos.map(m => <tr key={m.movimientoId}><td>{fechaLarga(m.fecha)}</td><td>{m.concepto}</td><td className="n">{e2(m.importeCentimos)}</td><td><span className={`st ${m.estadoPedido === 'RECIBIDO' ? 'g' : m.estadoPedido === 'SIN_PEDIR' ? 'b' : 'w'}`}>{m.estadoPedido === 'SIN_PEDIR' ? 'Falta pedirla' : m.estadoPedido === 'RECIBIDO' ? 'Recibida' : 'Pedida'}</span></td>
        <td>{m.conciliarPedir ? <button className="btn small" type="button" disabled={p.ocupado} onClick={() => m.conciliarPedir && p.onPedir(m.conciliarPedir.rowId, m.conciliarPedir.decisionHash)}>Marcar como pedida</button> : '—'}</td></tr>)}
    </tbody></table></div>}
    {datos && p.perfil && <details className="fold" style={{ marginTop: 12 }}><summary>Carga manual de documentos y exportación (herramienta completa)</summary><div className="foldbody"><NewParaPedirWorkspace environment={p.perfil.environment} initialData={datos} /></div></details>}
  </div></section>;
}

/* ───────── Cuentas y extractos ───────── */
function CuentasVista({ cuentas, hoy, acting, onSaved }: Readonly<{ cuentas: readonly CuentaCuadre[]; hoy: string; acting: boolean; onSaved: () => void }>) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const activas = cuentasActivas(cuentas);
  const cerradas = cuentas.filter(c => !c.activa);
  const cuadran = activas.filter(c => c.cuadra).length;
  const resumenCuadre = (c: CuentaCuadre) => c.cuadra
    ? [c.diasAmbiguosAceptados ? `${nf(c.diasAmbiguosAceptados)} día${c.diasAmbiguosAceptados === 1 ? '' : 's'} con varios órdenes válidos (el saldo de cierre es correcto)` : '', c.duplicadosIgnorados ? `${nf(c.duplicadosIgnorados)} apunte${c.duplicadosIgnorados === 1 ? '' : 's'} repetido${c.duplicadosIgnorados === 1 ? '' : 's'} de importación ignorado${c.duplicadosIgnorados === 1 ? '' : 's'} al comprobar` : '', c.saldosDeducidos ? `${nf(c.saldosDeducidos)} saldo${c.saldosDeducidos === 1 ? '' : 's'} en blanco deducido${c.saldosDeducidos === 1 ? '' : 's'} por continuidad` : ''].filter(Boolean).join(' · ')
    : c.cadenaCorrectaDesde ? `${nf(c.huecosTotal)} hueco${c.huecosTotal === 1 ? '' : 's'}; la cadena es correcta desde el ${fechaLarga(c.cadenaCorrectaDesde)}` : `${nf(c.huecosTotal)} hueco${c.huecosTotal === 1 ? '' : 's'}`;
  return <section className="view" id="v-cuentas"><div className="panel"><h2>Cuentas y extractos</h2>
    <p className="help">Para poder confirmar, el saldo de cada cuenta tiene que encadenar sin huecos. Dentro de un mismo día basta con que el saldo de cierre sea correcto. {cuadran === activas.length ? 'Hoy todas cuadran.' : cuadran === 0 ? 'Hoy ninguna cuadra: faltan apuntes intermedios.' : `Hoy cuadran ${cuadran} de ${activas.length}.`}</p>
    <div id="chain">{activas.map(c => <div key={c.id}>
      <div className="chain"><div><b style={{ fontWeight: 500 }}>{c.etiqueta}{c.ultimos4 ? ` · ****${c.ultimos4}` : ''}</b><div className="small muted">Extracto hasta {c.fechaCorteExtracto ? fechaLarga(c.fechaCorteExtracto) : 'sin fecha'} · {nf(c.totalMovimientos)} movimientos{resumenCuadre(c) ? ` · ${resumenCuadre(c)}` : ''}{c.duplicadosMarcados ? ` · ${nf(c.duplicadosMarcados)} apunte${c.duplicadosMarcados === 1 ? '' : 's'} marcado${c.duplicadosMarcados === 1 ? '' : 's'} como duplicado (fuera de la bandeja)` : ''}</div></div>
        <span className={`st ${claseEstadoCadena(c.estado)}`}>{textoEstadoCadena(c.estado)}</span>
        <button className="btn small" type="button" aria-expanded={abierta === c.id} onClick={() => setAbierta(abierta === c.id ? null : c.id)}>{abierta === c.id ? 'Ocultar huecos' : c.cuadra ? 'Ver detalle' : 'Ver huecos'}</button></div>
      {c.fechaComprobadaSinMovimientos && <p className="small muted">Comprobada por una persona sin movimientos hasta {fechaLarga(c.fechaComprobadaSinMovimientos)}. No es una nueva importación ni acredita cuadre.</p>}
      {c.comprobacionSinMovimientosObsoleta && <p className="small" role="status">Comprobación sin movimientos obsoleta: cambiaron apuntes, importes o importaciones. Revisa de nuevo; no se usa en el paso 1.</p>}
      <ComprobacionSinMovimientos cuentaId={c.id} eligible={c.activa && c.cuadra && c.totalMovimientos > 0} hoy={hoy} acting={acting} onSaved={onSaved} />
      {abierta === c.id && <div className="small" style={{ padding: '4px 0 10px' }}>{c.avisos.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{c.avisos.map((a, i) => <li key={i}>{a.mensaje}</li>)}</ul> : <span className="muted">Sin huecos: la cadena de saldos encadena de principio a fin.</span>}</div>}
    </div>)}</div>
    {cerradas.length > 0 && <div id="chain-cerradas" style={{ marginTop: 14 }}>
      <p className="small muted" style={{ margin: '0 0 6px' }}>Cuentas cerradas o inactivas · no entran en el recuento ni bloquean nada</p>
      {cerradas.map(c => <div className="chain" key={c.id} style={{ opacity: 0.6 }}><div><b style={{ fontWeight: 500 }}>{c.etiqueta.replace(/\s*\(cerrada\)\s*$/i, '')}{c.ultimos4 && c.ultimos4 !== '0000' ? ` · ****${c.ultimos4}` : ''}</b><div className="small muted">{c.totalMovimientos ? `${nf(c.totalMovimientos)} movimientos · último ${c.ultimoMovimiento ? fechaLarga(c.ultimoMovimiento) : 'sin fecha'}` : 'Sin movimientos cargados'}</div></div>
        <span className="st b" style={{ background: 'transparent', color: 'inherit', border: '1px solid currentColor' }}>Cerrada</span><span /></div>)}
    </div>}
    <p className="small muted" style={{ margin: '10px 0 0' }}>Solución habitual: descargar del banco el extracto completo del periodo (Norma 43 o Excel) y <a href="/admin/finanzas/importar">cargarlo de nuevo</a>.</p>
  </div></section>;
}
