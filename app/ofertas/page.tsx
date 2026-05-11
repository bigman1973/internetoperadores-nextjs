import { getTarifasSeccionParticular } from '@/lib/tarifas-web';
import SeccionTarifasParticular from '@/components/public/SeccionTarifasParticular';

export const revalidate = 60;

export const metadata = {
  title: 'Ofertas Especiales | Internet Operadores',
  description: 'Las mejores ofertas y promociones en internet, móvil y packs. Aprovecha nuestros descuentos.',
};

export default async function OfertasPage() {
  const { top3, total } = await getTarifasSeccionParticular('ofertas');

  const icono = (
    <svg className="w-16 h-16 mx-auto text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6h.008v.008H6V6z" />
    </svg>
  );

  return (
    <SeccionTarifasParticular
      titulo="Ofertas"
      subtitulo="Las mejores promociones para ti"
      descripcion="Descubre nuestras ofertas especiales y promociones exclusivas. Tiempo limitado."
      icono={icono}
      color="purple"
      top3={top3}
      totalTarifas={total}
      seccion="ofertas"
    />
  );
}
