import { getTarifasSeccionParticular } from '@/lib/tarifas-web';
import SeccionTarifasParticular from '@/components/public/SeccionTarifasParticular';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tarifas Móvil | Internet Operadores',
  description: 'Tarifas móvil con datos, llamadas y SMS. Cobertura nacional con la mejor relación calidad-precio.',
};

export default async function MovilPage() {
  noStore();
  const { top3, total } = await getTarifasSeccionParticular('movil');

  const icono = (
    <svg className="w-16 h-16 mx-auto text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
    </svg>
  );

  return (
    <SeccionTarifasParticular
      titulo="Móvil"
      subtitulo="Tarifas móvil sin sorpresas"
      descripcion="Datos, llamadas y SMS con cobertura nacional. Elige el plan que mejor se adapte a tu consumo."
      icono={icono}
      color="blue"
      top3={top3}
      totalTarifas={total}
      seccion="movil"
    />
  );
}
