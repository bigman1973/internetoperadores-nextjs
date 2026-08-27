'use client';

import {
  ACTIVIDADES_COMERCIALES,
  COMPLEJIDADES_COMERCIALES,
  EMPRESAS_GRUPO,
  RESULTADOS_COMERCIALES,
  getActividadComercial,
} from '@/lib/imputaciones-comercial';

export interface CommercialFormValue {
  empresaGrupo: string;
  tipoActividad: string;
  cantidadActividad: string;
  contactosEfectivos: string;
  resultadoComercial: string;
  complejidadComercial: string;
  proximaAccion: string;
  fechaProximaAccion: string;
}

interface Props {
  value: CommercialFormValue;
  onChange: (patch: Partial<CommercialFormValue>) => void;
  horas?: string;
  descripcion?: string;
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <span
        tabIndex={0}
        aria-label={text}
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500 outline-none ring-offset-2 hover:bg-slate-200 focus:ring-2 focus:ring-indigo-400"
      >
        i
      </span>
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-64 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

export default function CommercialContextFields({ value, onChange, horas, descripcion }: Props) {
  const activity = getActividadComercial(value.tipoActividad);
  const horasNumber = Number(horas || 0);
  const faltaContexto = horasNumber >= 2 && (!value.cantidadActividad || !value.resultadoComercial || !descripcion?.trim());

  return (
    <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="rounded-lg bg-white/80 px-3 py-3 text-xs leading-relaxed text-slate-600 ring-1 ring-indigo-100">
        <p className="font-semibold text-slate-800">Un poco de contexto nos ayuda a interpretar bien tu trabajo.</p>
        <p className="mt-1">No buscamos actividad por actividad: cuatro gestiones complejas pueden aportar más que veinte intentos sin resultado. Indica cifras aproximadas para entender el esfuerzo y apoyar mejor el proceso comercial.</p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Empresa del grupo
          <InfoTip text="Selecciona la empresa que se beneficia del trabajo. Internet Operadores aparece por defecto para que la imputación habitual siga siendo rápida." />
        </label>
        <select
          value={value.empresaGrupo}
          onChange={event => onChange({ empresaGrupo: event.target.value })}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
        >
          {EMPRESAS_GRUPO.map(empresa => <option key={empresa} value={empresa}>{empresa}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Actividad principal
            <InfoTip text="Elige la actividad que mejor representa el bloque de tiempo. Si has combinado varias, selecciona la que haya ocupado la mayor parte." />
          </label>
          <select
            value={value.tipoActividad}
            onChange={event => onChange({ tipoActividad: event.target.value, cantidadActividad: '', contactosEfectivos: '' })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Seleccionar actividad...</option>
            {ACTIVIDADES_COMERCIALES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Volumen aproximado
            <InfoTip text="No es una cuota ni una puntuación. Sirve para distinguir, por ejemplo, una reunión larga de muchas llamadas breves." />
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="9999"
              step="1"
              inputMode="numeric"
              value={value.cantidadActividad}
              onChange={event => onChange({ cantidadActividad: event.target.value })}
              placeholder={activity ? `N.º de ${activity.unidad}` : 'Cantidad aproximada'}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pr-24 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
            />
            {activity && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-gray-400">{activity.unidad}</span>}
          </div>
        </div>
      </div>

      {activity?.permiteEfectivos && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Contactos efectivos
            <InfoTip text="Cuenta únicamente las conversaciones o contactos reales. Los intentos sin respuesta ya quedan reflejados en el volumen total." />
          </label>
          <input
            type="number"
            min="0"
            max={value.cantidadActividad || '9999'}
            step="1"
            inputMode="numeric"
            value={value.contactosEfectivos}
            onChange={event => onChange({ contactosEfectivos: event.target.value })}
            placeholder="Personas con las que hubo conversación o respuesta"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Resultado o avance
          <InfoTip text="No todas las gestiones terminan en venta. Queremos saber si el trabajo permitió contactar, concertar una reunión, enviar una oferta o definir un seguimiento." />
        </label>
        <select
          value={value.resultadoComercial}
          onChange={event => onChange({ resultadoComercial: event.target.value })}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">Seleccionar resultado...</option>
          {RESULTADOS_COMERCIALES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-gray-700">
          Complejidad de la gestión
          <InfoTip text="Ayuda a no comparar de la misma forma una tarea rutinaria y una gestión estratégica, técnica o con varios interlocutores." />
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {COMPLEJIDADES_COMERCIALES.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange({ complejidadComercial: value.complejidadComercial === item.value ? '' : item.value })}
              className={`rounded-lg border px-3 py-2 text-left transition-colors ${value.complejidadComercial === item.value ? 'border-indigo-500 bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300' : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'}`}
            >
              <span className="block text-xs font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{item.description}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_145px]">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Próxima acción (opcional)
            <InfoTip text="Una frase breve permite retomar la oportunidad sin perder contexto. No es necesaria si la gestión ha quedado cerrada." />
          </label>
          <input
            type="text"
            maxLength={500}
            value={value.proximaAccion}
            onChange={event => onChange({ proximaAccion: event.target.value })}
            placeholder="Ej: llamar tras revisar la oferta"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Fecha prevista</label>
          <input
            type="date"
            value={value.fechaProximaAccion}
            onChange={event => onChange({ fechaProximaAccion: event.target.value })}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {faltaContexto && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200">
          <span className="font-semibold">Añade un poco de contexto.</span> Has indicado varias horas; el volumen, el resultado y una breve descripción ayudarán a entender correctamente la complejidad del trabajo.
        </p>
      )}
    </div>
  );
}
