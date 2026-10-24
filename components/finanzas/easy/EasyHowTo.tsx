'use client';

import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

type EasyHowToMode = 'modo-facil' | 'para-pedir';

type Props = Readonly<{ mode: EasyHowToMode }>;

/**
 * Ayuda breve y modular con el estilo corporativo actual del panel.
 */
export default function EasyHowTo({ mode }: Props) {
  const [open, setOpen] = useState(false);
  const isEasy = mode === 'modo-facil';

  return <section className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950" aria-labelledby={`easy-how-to-${mode}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><QuestionMarkCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" /><h2 id={`easy-how-to-${mode}`} className="font-extrabold">¿Cómo se hace?</h2></div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-bold text-blue-950 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-600">{open ? 'Ocultar guía' : '? Ver guía'}</button>
    </div>
    {open && (isEasy ? <ol className="mt-3 grid gap-3 leading-6 md:grid-cols-2">
      <li className="rounded-lg bg-white/80 p-3"><strong>1. Quién es.</strong> Elige la persona o empresa sólo cuando estés seguro. Si no lo estás, déjalo pendiente; eso no impide revisar el papel.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>2. Qué papel lo justifica.</strong> Revisa por separado el ticket, factura u otro comprobante. Saber quién es no sustituye el papel, y tener un papel no cambia por sí solo quién es.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>“Es este documento”.</strong> Úsalo cuando el documento corresponda exactamente al movimiento. Por ejemplo, una factura del proveedor por el mismo importe.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>“Añadir foto o PDF”.</strong> Úsalo si tienes un ticket o recibo en papel. Haz una foto o añade el PDF, copia sus datos y revísalos antes de subirlo.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>“No necesita documento”.</strong> Úsalo sólo para el motivo que realmente corresponda, como una comisión bancaria o un traspaso entre cuentas propias comprobado.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>Si no encuentras el papel.</strong> Abre «Para pedir» y revisa qué comprobante falta. Esta lista no envía solicitudes por ti.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>Hecho y Deshacer.</strong> Tras una confirmación comprobada verás <strong>Hecho</strong>. Si detectas un error, pulsa <strong>Deshacer</strong> junto a esa acción.</li>
    </ol> : <ol className="mt-3 grid gap-3 leading-6 md:grid-cols-2">
      <li className="rounded-lg bg-white/80 p-3"><strong>1. Filtra la lista.</strong> Acota fechas, cargos o cobros y busca el concepto que necesitas revisar.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>2. Separa quién de qué papel falta.</strong> El nombre de un documento candidato no confirma por sí solo quién es. Primero identifica a la persona o empresa y después reúne el papel.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>3. Si falta el papel.</strong> Pide un ticket o factura usando los datos del movimiento. Por ejemplo: “Necesitamos el comprobante del cargo de esta fecha e importe”.</li>
      <li className="rounded-lg bg-white/80 p-3"><strong>4. Abre el documento si está disponible.</strong> Comprueba si sirve antes de pedir otro. Esta pantalla no envía correos ni realiza cambios.</li>
    </ol>)}
  </section>;
}
