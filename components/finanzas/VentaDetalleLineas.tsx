"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import type { SaleInvoiceContext } from "@/lib/finanzas/sale-invoice-context";

const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const money = (value: number | null) => value === null ? "—" : euros.format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("es-ES", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)) : "No consta";
type State = { key: string; data?: SaleInvoiceContext; error?: string };

/** Read only, local data. Invoice changes immediately hide previous results. */
export default function VentaDetalleLineas({ facturaId }: { facturaId: string }) {
  const heading = useId();
  const [filter, setFilter] = useState<"periodo" | "actuales" | "todos">("periodo");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<State>({ key: "" });
  const version = useRef(0);
  const key = `${facturaId}:${filter}:${page}`;
  const current = state.key === key ? state : null;
  useEffect(() => { setFilter("periodo"); setPage(1); }, [facturaId]);
  useEffect(() => {
    const seq = ++version.current;
    const controller = new AbortController();
    let timeout = false;
    const timer = window.setTimeout(() => { timeout = true; controller.abort(); }, 15_000);
    setState({ key });
    const params = new URLSearchParams({ facturaId, contratos: filter, page: String(page) });
    fetch(`/api/admin/finanzas/rentabilidad/lineas?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "No se pudo consultar el detalle.");
        if (seq === version.current && !controller.signal.aborted) setState({ key, data: body });
      })
      .catch(error => {
        if (seq === version.current && (!controller.signal.aborted || timeout)) setState({ key, error: timeout ? "La consulta ha tardado demasiado. Puedes reintentar." : error instanceof Error ? error.message : "No se pudo consultar el detalle." });
      })
      .finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [facturaId, filter, page, retry, key]);

  const data = current?.data;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-950" aria-labelledby={heading}>
      <header className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 id={heading} className="text-base font-bold text-slate-950">Servicios del cliente y detalle de venta</h3>
        <p className="mt-1 text-xs text-slate-700">Los mismos contratos de Clientes · Contratos / Servicios, aquí junto al proveedor. Sin abrir ISPgestion.</p>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-800">
            Ver contratos
            <select value={filter} onChange={e => { setFilter(e.target.value as typeof filter); setPage(1); }} className="rounded border border-slate-400 bg-white px-2 py-2 text-sm text-slate-950 [color-scheme:light] focus:ring-2 focus:ring-blue-700">
              <option value="periodo">Del mes de la factura</option>
              <option value="actuales">Activos actualmente</option>
              <option value="todos">Todos, incluidas bajas</option>
            </select>
          </label>
        </div>
        {!current?.data && !current?.error ? <p aria-live="polite" className="py-3 text-sm text-slate-700">Consultando contratos locales…</p> : current?.error ? (
          <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-950">
            {current.error} <button type="button" onClick={() => setRetry(r => r + 1)} className="ml-2 rounded border border-red-400 bg-white px-2 py-1 font-bold focus:ring-2 focus:ring-red-700">Reintentar</button>
          </div>
        ) : data && <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="font-bold text-slate-950">{data.numFactura} · {date(data.fecha)}</p>
            <p className="text-slate-800">Base factura: <strong className="tabular-nums text-slate-950">{money(data.base)}</strong></p>
          </div>
          <p className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-950">
            <strong>Referencia contractual, no desglose facturado.</strong> Las cuotas registradas ayudan a identificar el servicio; no prueban que se haya cobrado en esta factura ni se usan para repartir ingresos o costes. El filtro mensual usa las fechas del contrato, no el período real de consumo de la factura.
          </p>
          {data.clienteWebId === null ? <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">No hay una relación inequívoca con la ficha del cliente. No se han buscado contratos por similitud de nombre.</p> : !data.contratos.length ? <p className="rounded border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">No hay contratos con este filtro. Puedes consultar todos, incluidas las bajas.</p> : <>
            <p className="text-xs font-semibold text-slate-700">{data.totalContratos} contratos · página {data.page} de {data.totalPages}</p>
            <div className="divide-y divide-slate-200 rounded border border-slate-300">
              {data.contratos.map(contract => <article key={contract.id} className="p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-bold text-slate-950">{contract.titulo}</p>
                    {contract.tarifa !== contract.titulo && <p className="mt-1 break-words text-xs text-slate-800">{contract.tarifa}</p>}
                  </div>
                  <p className="text-right text-sm font-bold tabular-nums text-slate-950">{money(contract.precio)}<span className="block text-xs font-normal text-slate-700">Cuota contractual</span></p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700">
                  <span className={`rounded px-2 py-0.5 font-semibold ${contract.activo ? "bg-emerald-50 text-emerald-950" : "bg-slate-100 text-slate-900"}`}>{contract.activo ? "Activo ahora" : "Baja actual"}</span>
                  <span>Inicio: {date(contract.fechaInicio)}</span>
                  {contract.fechaBaja && <span>Baja: {date(contract.fechaBaja)}</span>}
                  <span className={contract.vigencia === "sin_confirmar" ? "font-bold text-amber-900" : "text-slate-700"}>{contract.vigencia === "en_periodo" ? "Vigencia en el mes" : contract.vigencia === "fuera_periodo" ? "Fuera del mes de la factura" : "Vigencia histórica sin confirmar"}</span>
                </div>
                {contract.concepto && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800"><span className="font-semibold">Concepto del contrato:</span> {contract.concepto}</p>}
              </article>)}
            </div>
            {data.totalPages > 1 && <nav aria-label="Páginas de contratos" className="flex items-center justify-between gap-2 text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded border border-slate-400 bg-white px-3 py-2 font-bold text-slate-900 disabled:opacity-40">Anterior</button>
              <span>{data.page} / {data.totalPages}</span>
              <button type="button" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="rounded border border-slate-400 bg-white px-3 py-2 font-bold text-slate-900 disabled:opacity-40">Siguiente</button>
            </nav>}
          </>}
          <details className="rounded border border-slate-300 bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-bold text-slate-950">Líneas registradas en la factura · {data.lineas.length}</summary>
            <div className="mt-3 space-y-2 text-sm text-slate-800">
              {!data.lineas.length ? <p>Esta factura no tiene líneas registradas localmente. Arriba se muestran sus contratos como referencia, sin convertirlos en líneas de venta.</p> : <>
                {data.lineas.map((line, index) => <div key={index} className="rounded border border-slate-200 bg-white p-2">
                  <p className="whitespace-pre-wrap break-words font-semibold text-slate-950">{line.descripcion}</p>
                  <p className="mt-1 text-xs text-slate-700">Cantidad: {line.cantidad ?? "—"} · Precio unitario: {money(line.precioUnitario)} · Base registrada: {money(line.base)}</p>
                </div>)}
                <p className="font-semibold">{data.lineasConciliadas === true ? "Las bases de líneas cuadran con la base de factura." : data.lineasConciliadas === false ? "Bases pendientes de conciliación." : "No hay bases explícitas suficientes para conciliar las líneas."}</p>
              </>}
              {data.avisoLineas && <p className="text-amber-950">{data.avisoLineas}</p>}
            </div>
          </details>
        </>}
      </div>
    </section>
  );
}
