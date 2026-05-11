import { getTarifasSeccionParticular } from '@/lib/tarifas-web';
import SeccionTarifasParticular from '@/components/public/SeccionTarifasParticular';

export const revalidate = 60;

export const metadata = {
  title: 'Packs Convergentes | Internet Operadores',
  description: 'Packs de fibra + móvil + fijo. Todo en uno con el mejor precio y sin permanencia.',
};

export default async function PacksPage() {
  const { top3, total } = await getTarifasSeccionParticular('packs');

  const icono = (
    <svg className="w-16 h-16 mx-auto text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </svg>
  );

  return (
    <SeccionTarifasParticular
      titulo="Packs"
      subtitulo="Todo en uno, sin complicaciones"
      descripcion="Combina internet, móvil y fijo en un solo pack. Ahorra y simplifica tus facturas."
      icono={icono}
      color="green"
      top3={top3}
      totalTarifas={total}
      seccion="packs"
    />
  );
}
