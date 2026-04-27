import { getTarifasSeccionParticular } from '@/lib/tarifas-web';
import SeccionTarifasParticular from '@/components/public/SeccionTarifasParticular';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Internet para tu Hogar | Internet Operadores',
  description: 'Fibra óptica, 4G y WIMAX para tu hogar. Conexión estable y rápida con la mejor cobertura.',
};

export default async function InternetPage() {
  noStore();
  const { top3, total } = await getTarifasSeccionParticular('internet');

  const icono = (
    <svg className="w-16 h-16 mx-auto text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
    </svg>
  );

  return (
    <SeccionTarifasParticular
      titulo="Internet"
      subtitulo="Conexión de alta velocidad para tu hogar"
      descripcion="Fibra óptica, 4G y WIMAX. Elige la tecnología que mejor se adapte a tu zona y necesidades."
      icono={icono}
      color="orange"
      top3={top3}
      totalTarifas={total}
      seccion="internet"
    />
  );
}
