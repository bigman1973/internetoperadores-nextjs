import Link from 'next/link'

export type CrmWebCapture = {
  id: string
  formulario: string
  webOrigen: string | null
  paginaOrigen: string | null
  fechaEnvio: string
  segmentoCrm: string | null
  consentimientoPrivacidad: boolean | null
  consentimientoNewsletter: boolean
  consentimientoVersion: string | null
  referenciaTipo: string | null
  referenciaId: string | null
  datos: unknown
  originalHref: string | null
}

export type CrmOriginalDetail = { id: string; label: string; href: string }

export default function CrmWebCaptures({ captures, originalDetails = [] }: { captures: CrmWebCapture[]; originalDetails?: CrmOriginalDetail[] }) {
  return (
    <section aria-labelledby="crm-web-captures-title" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="crm-web-captures-title" className="text-base font-bold text-slate-950">Captaciones web</h2>
        <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-bold text-orange-800">{captures.length}</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate-500">Envíos originales y consentimientos registrados. La ficha conserva cada captación sin sustituir los datos anteriores.</p>
      {originalDetails.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Detalles originales vinculados">
          {originalDetails.map((detail) => <Link key={detail.href} href={detail.href} prefetch={false} className="inline-flex min-h-11 items-center rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100">Abrir {detail.label.toLocaleLowerCase('es-ES')}</Link>)}
        </div>
      )}
      {captures.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No hay captaciones web vinculadas. El histórico no se migra automáticamente.</p>
      ) : (
        <div className="mt-5 space-y-4">
          {captures.map((capture) => (
            <article key={capture.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="break-words text-sm font-bold text-slate-900">{capture.formulario}</p>
                <time dateTime={capture.fechaEnvio} className="text-xs text-slate-500">{new Date(capture.fechaEnvio).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' })}</time>
              </div>
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <CaptureField label="Web de origen" value={capture.webOrigen || 'No consta'} />
                <CaptureField label="Página de origen" value={capture.paginaOrigen || 'No consta'} />
                <CaptureField label="Tipo de formulario" value={capture.formulario} />
                <CaptureField label="Área CRM" value={capture.segmentoCrm || 'Sin clasificar'} />
                <CaptureField label="Privacidad" value={capture.consentimientoPrivacidad == null ? 'No consta' : capture.consentimientoPrivacidad ? 'Aceptada' : 'No aceptada'} />
                <CaptureField label="Newsletter" value={capture.consentimientoNewsletter ? 'Suscripción aceptada' : 'Sin suscripción'} />
                <CaptureField label="Versión del consentimiento" value={capture.consentimientoVersion || 'No consta'} />
              </dl>
              {capture.originalHref && <Link href={capture.originalHref} prefetch={false} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-orange-700 hover:text-orange-800">Abrir detalle original</Link>}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-600">Datos originales del envío</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">{JSON.stringify(capture.datos, null, 2) ?? 'Sin datos'}</pre>
              </details>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function CaptureField({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-words text-slate-800">{value}</dd></div>
}
