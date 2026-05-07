'use client';
import Link from 'next/link';

interface TarifaCardProps {
  nombre: string;
  nombreComercial?: string | null;
  descripcionCorta: string | null;
  precioConIva: number;
  precioSinIva: number;
  permanencia: string | null;
  velocidad: string | null;
  velocidadBajada: string | null;
  datosIncluidos: string | null;
  minutosIncluidos: string | null;
  esMovil: boolean;
  esFijo: boolean;
  esInternet: boolean;
  esCompuesta: boolean;
  destacada: boolean;
  categoria: string;
  contratosActivos?: number;
  esPopular?: boolean;
}

function CheckIcon() {
  return (
    <svg className="w-5 h-5 text-orange-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

export default function TarifaCard({ tarifa }: { tarifa: TarifaCardProps }) {
  const features: string[] = [];

  if (tarifa.velocidadBajada) features.push(`${tarifa.velocidadBajada}`);
  else if (tarifa.velocidad) features.push(tarifa.velocidad);
  
  if (tarifa.esInternet && tarifa.esMovil) features.push('Internet + Móvil');
  
  if (tarifa.datosIncluidos) features.push(`${tarifa.datosIncluidos} datos`);
  if (tarifa.minutosIncluidos) features.push(`${tarifa.minutosIncluidos} minutos`);
  
  if (tarifa.permanencia && tarifa.permanencia !== 'Sin permanencia') {
    features.push(`Permanencia: ${tarifa.permanencia}`);
  } else {
    features.push('Sin permanencia');
  }

  if (tarifa.descripcionCorta) features.push(tarifa.descripcionCorta);

  // Limit to 4 features
  const displayFeatures = features.slice(0, 4);

  const isPopular = tarifa.esPopular === true;

  if (isPopular) {
    return (
      <div className="bg-orange-500 text-white rounded-2xl p-8 shadow-xl relative md:scale-105 flex flex-col">
        <div className="absolute top-4 right-4 bg-white text-orange-500 px-3 py-1 rounded-full text-sm font-semibold">
          La Más Elegida
        </div>
        <h3 className="text-2xl font-bold mb-1">{tarifa.nombreComercial || tarifa.nombre}</h3>
        <p className="text-sm text-orange-100 mb-1">{tarifa.categoria}</p>
        <div className="mb-6 mt-3">
          <span className="text-5xl font-bold">{tarifa.precioConIva.toFixed(0)}€</span>
          <span className="text-orange-100">/mes</span>
        </div>
        <p className="text-xs text-orange-200 mb-4">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
        <ul className="space-y-3 mb-8 flex-1">
          {displayFeatures.map((f, i) => (
            <li key={i} className="flex items-center text-sm">
              <svg className="w-5 h-5 text-white mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
        <Link href="/contacto" className="block w-full py-3 text-center bg-white text-orange-500 rounded-lg font-semibold hover:bg-orange-50 transition-colors">
          Contratar
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-gray-200 rounded-2xl p-8 hover:border-orange-500 hover:shadow-lg transition-all flex flex-col">
      <h3 className="text-2xl font-bold text-gray-900 mb-1">{tarifa.nombreComercial || tarifa.nombre}</h3>
      <p className="text-sm text-gray-500 mb-1">{tarifa.categoria}</p>
      <div className="mb-6 mt-3">
        <span className="text-5xl font-bold text-gray-900">{tarifa.precioConIva.toFixed(0)}€</span>
        <span className="text-gray-600">/mes</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
      <ul className="space-y-3 mb-8 flex-1">
        {displayFeatures.map((f, i) => (
          <li key={i} className="flex items-center text-sm text-gray-700">
            <CheckIcon />
            {f}
          </li>
        ))}
      </ul>
      <Link href="/contacto" className="block w-full py-3 text-center border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors">
        Contratar
      </Link>
    </div>
  );
}
