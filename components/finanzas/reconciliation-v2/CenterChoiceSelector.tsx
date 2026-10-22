'use client';

export type CentroCosteCatalogo = Readonly<{
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}>;

export type CatalogoCentrosEstado = Readonly<{
  kind: 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';
  items: readonly CentroCosteCatalogo[];
  error: string | null;
}>;

export type CatalogParseResult =
  | Readonly<{ ok: true; items: readonly CentroCosteCatalogo[] }>
  | Readonly<{ ok: false; error: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Frontera de red B8: sólo acepta la respuesta real de
 * GET /api/admin/finanzas/centros-coste?recurso=centros.
 * No fabrica un centro cuando la respuesta es vacía o inválida.
 */
export function parseCentrosCosteCatalogo(raw: unknown): CatalogParseResult {
  if (!isRecord(raw) || raw.recurso !== 'centros' || !Array.isArray(raw.items)) {
    return { ok: false, error: 'La respuesta del catálogo de centros no tiene el contrato esperado.' };
  }
  const ids = new Set<string>();
  const items: CentroCosteCatalogo[] = [];
  for (const item of raw.items) {
    if (!isRecord(item)
      || typeof item.id !== 'string' || !UUID.test(item.id)
      || typeof item.codigo !== 'string' || item.codigo.trim().length === 0
      || typeof item.nombre !== 'string' || item.nombre.trim().length === 0
      || typeof item.activo !== 'boolean') {
      return { ok: false, error: 'El catálogo de centros contiene un elemento no verificable.' };
    }
    const id = item.id.toLowerCase();
    if (ids.has(id)) return { ok: false, error: 'El catálogo de centros contiene identificadores repetidos.' };
    ids.add(id);
    items.push(Object.freeze({ id, codigo: item.codigo.trim(), nombre: item.nombre.trim(), activo: item.activo }));
  }
  return { ok: true, items: Object.freeze(items) };
}

export function centrosActivos(items: readonly CentroCosteCatalogo[]): readonly CentroCosteCatalogo[] {
  return items.filter((center) => center.activo);
}

/** Una selección existente nunca desaparece del estado si deja de ser verificable. */
export function problemaSeleccionCentro(
  centroCosteFinanzasId: string | null | undefined,
  catalogo: CatalogoCentrosEstado,
): string | null {
  if (!centroCosteFinanzasId) return null;
  if (catalogo.kind === 'error' || catalogo.kind === 'forbidden') {
    return 'La selección de centro no se puede verificar porque el catálogo no está disponible. Límpiela o actualice el catálogo antes de confirmar.';
  }
  if (catalogo.kind === 'idle' || catalogo.kind === 'loading') {
    return 'La selección de centro está pendiente de verificación del catálogo. Espere a que termine la lectura antes de confirmar.';
  }
  const center = catalogo.items.find((item) => item.id === centroCosteFinanzasId);
  if (!center) return 'El centro seleccionado ya no está disponible en el catálogo activo. Límpielo o actualice el catálogo antes de confirmar.';
  if (!center.activo) return 'El centro seleccionado está inactivo y no admite nuevas imputaciones. Límpielo antes de confirmar.';
  return null;
}

export function etiquetaCentro(center: Pick<CentroCosteCatalogo, 'codigo' | 'nombre'>): string {
  return `${center.codigo} · ${center.nombre}`;
}

export default function CenterChoiceSelector({
  value,
  catalogo,
  disabled,
  onChange,
  onReload,
  inputId,
}: {
  /** undefined/null equivale a propiedad omitida en la línea DOCUMENTO. */
  value: string | null | undefined;
  catalogo: CatalogoCentrosEstado;
  disabled: boolean;
  onChange: (centroCosteFinanzasId: string | undefined) => void;
  onReload: () => void;
  inputId: string;
}) {
  const active = centrosActivos(catalogo.items);
  const problem = problemaSeleccionCentro(value, catalogo);
  // Si una selección dejó de estar disponible, el select muestra el valor vacío
  // pero el estado conserva el UUID y el aviso lo expone de forma explícita.
  const selectValue = problem ? '' : (value || '');
  const catalogueUnavailable = catalogo.kind === 'error' || catalogo.kind === 'forbidden';
  const emptyCatalog = catalogo.kind === 'ready' && active.length === 0;

  return <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><label htmlFor={inputId} className="block text-sm font-semibold text-slate-800">Centro de coste <span className="font-normal text-slate-500">(opcional)</span></label><p className="mt-0.5 text-xs text-slate-600">Sólo imputación explícita de esta línea DOCUMENTO. No se infiere por categoría, proveedor u operadora.</p></div>
      <a href="/admin/finanzas/centros-coste" className="shrink-0 text-xs font-semibold text-orange-800 underline underline-offset-2 hover:text-orange-950">Ver catálogo de centros</a>
    </div>
    <select
      id={inputId}
      value={selectValue}
      onChange={(event) => onChange(event.target.value || undefined)}
      disabled={disabled || catalogo.kind === 'loading' || catalogo.kind === 'idle'}
      aria-invalid={problem ? true : undefined}
      aria-describedby={`${inputId}-help`}
      className="mt-3 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <option value="">{catalogo.kind === 'loading' || catalogo.kind === 'idle' ? 'Cargando catálogo…' : 'Sin centro de coste'}</option>
      {active.map((center) => <option key={center.id} value={center.id}>{etiquetaCentro(center)}</option>)}
    </select>
    {problem ? <p id={`${inputId}-help`} role="alert" className="mt-2 text-xs font-semibold text-red-800">{problem}</p> : catalogueUnavailable ? <p id={`${inputId}-help`} role="status" className="mt-2 text-xs text-amber-900">No se pudo cargar el catálogo. Puede continuar sin centro de coste; no se creará una opción ficticia.</p> : emptyCatalog ? <p id={`${inputId}-help`} role="status" className="mt-2 text-xs text-amber-900">No hay centros activos. Puede continuar sin centro de coste; el catálogo se gestiona en su pantalla específica.</p> : <p id={`${inputId}-help`} className="mt-2 text-xs text-slate-500">Dejar esta selección vacía omite el campo en la confirmación B4.</p>}
    {(catalogueUnavailable || emptyCatalog || problem) && <button type="button" onClick={onReload} disabled={disabled} className="mt-2 text-xs font-bold text-orange-800 underline underline-offset-2 hover:text-orange-950 disabled:cursor-not-allowed disabled:opacity-60">Actualizar catálogo</button>}
  </div>;
}
