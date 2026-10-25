import Link from 'next/link';
import { getTarifasWeb } from '@/lib/tarifas-web';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import TarifasEmpresaCatalog from './TarifasEmpresaCatalog';
import TarifasEmpresaClient from './TarifasEmpresaClient';

export const revalidate = 60;

export const metadata = {
  title: 'Tarifas para Empresas | Internet Operadores',
  description: 'Soluciones de conectividad, comunicaciones y mantenimiento IT para tu negocio. Tarifas transparentes y sin sorpresas.',
};

export default async function TarifasEmpresaPage() {
  const { tarifas, categorias, total } = await getTarifasWeb('empresa');

  if (total === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Tarifas para <span className="text-orange-500">Empresas</span>
            </h1>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-8">
              Estamos preparando nuestro catálogo de tarifas. Contacta con nosotros para un presupuesto personalizado.
            </p>
            <Link href="/contacto" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Solicitar Presupuesto
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const categoriasResumen = Object.entries(categorias)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([nombre, tarifasCategoria]) => ({ nombre, total: tarifasCategoria.length }));

  return (
    <div className="min-h-screen bg-gray-50">
      <EmpresaNav currentPage="tarifas" />

      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-block bg-orange-500/20 text-orange-400 text-sm font-semibold px-4 py-1 rounded-full mb-4">
              TARIFAS 2026
            </span>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Tarifas para <span className="text-orange-500">Empresas</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Soluciones de conectividad, comunicaciones y mantenimiento IT para tu negocio.
              Todos los precios incluyen IVA. Sin sorpresas.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/contacto" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
                Solicitar Presupuesto Personalizado
              </Link>
              <Link href="/tarifas/particular" className="border-2 border-white/30 text-white hover:bg-white/10 px-8 py-3 rounded-lg font-semibold transition-colors">
                Ver Tarifas Particulares
              </Link>
            </div>
          </div>
        </div>
      </div>

      <TarifasEmpresaClient categorias={categoriasResumen} total={total} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div id="tarifas-empresa-sin-resultados" className="text-center py-16" hidden>
          <p className="text-gray-500 text-lg mb-4">
            No se encontraron tarifas con los filtros seleccionados.
          </p>
          <button
            type="reset"
            form="tarifas-empresa-filtros"
            className="text-orange-600 hover:text-orange-700 font-medium"
          >
            Limpiar filtros
          </button>
        </div>

        <TarifasEmpresaCatalog tarifas={tarifas} />
      </div>

      <div className="bg-gradient-to-r from-orange-500 to-orange-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">¿Necesitas una solución a medida?</h2>
          <p className="text-lg opacity-90 mb-8">
            Nuestro equipo comercial te preparará un presupuesto personalizado adaptado a las necesidades de tu empresa. Sin compromiso.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
              Solicitar Presupuesto
            </Link>
            <Link href="/tarifas/particular" className="border-2 border-white text-white hover:bg-white/10 px-8 py-3 rounded-lg font-semibold transition-colors">
              Ver Tarifas Particulares
            </Link>
          </div>
        </div>
      </div>
      <EmpresaFooter />
    </div>
  );
}
