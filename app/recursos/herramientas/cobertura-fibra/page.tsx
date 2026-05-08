"use client";
import Link from 'next/link';
import { useState } from 'react';
import DynamicNav from '../../../../components/DynamicNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

interface CoberturaResult {
  direccion: string;
  codigoPostal: string;
  tecnologias: {
    nombre: string;
    disponible: boolean;
    velocidadMax: string;
    tipo: string;
  }[];
  operadores: number;
  recomendacion: string;
}

const provincias = [
  'Álava', 'Albacete', 'Alicante', 'Almería', 'Asturias', 'Ávila', 'Badajoz', 'Barcelona',
  'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña',
  'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Guipúzcoa', 'Huelva', 'Huesca', 'Jaén',
  'León', 'Lleida', 'Lugo', 'Madrid', 'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Palencia',
  'Las Palmas', 'Pontevedra', 'La Rioja', 'Salamanca', 'Segovia', 'Sevilla', 'Soria',
  'Tarragona', 'Santa Cruz de Tenerife', 'Teruel', 'Toledo', 'Valencia', 'Valladolid',
  'Vizcaya', 'Zamora', 'Zaragoza'
];

export default function CoberturaFibraPage() {
  const [direccion, setDireccion] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [provincia, setProvincia] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CoberturaResult | null>(null);
  const [error, setError] = useState('');

  const checkCobertura = async () => {
    if (!direccion.trim() || !codigoPostal.trim() || !provincia) {
      setError('Por favor, completa todos los campos');
      return;
    }
    if (!/^\d{5}$/.test(codigoPostal)) {
      setError('El código postal debe tener 5 dígitos');
      return;
    }

    setError('');
    setChecking(true);
    setResult(null);

    // Simular consulta (en producción conectaría con API real)
    await new Promise(r => setTimeout(r, 2500));

    const cp = parseInt(codigoPostal);
    const esUrbano = cp < 30000 || (cp >= 28000 && cp <= 28999) || (cp >= 8000 && cp <= 8999) || (cp >= 46000 && cp <= 46999);
    const esSemiurbano = cp >= 30000 && cp < 45000;

    const tecnologias = [
      {
        nombre: 'Fibra Óptica FTTH',
        disponible: esUrbano || (esSemiurbano && Math.random() > 0.3),
        velocidadMax: '1 Gbps simétrico',
        tipo: 'fibra'
      },
      {
        nombre: 'Fibra Óptica NEBA',
        disponible: esUrbano || esSemiurbano,
        velocidadMax: '600 Mbps',
        tipo: 'fibra'
      },
      {
        nombre: 'VDSL2',
        disponible: true,
        velocidadMax: '100 Mbps / 20 Mbps',
        tipo: 'cobre'
      },
      {
        nombre: '4G/5G Empresarial',
        disponible: true,
        velocidadMax: esUrbano ? '1 Gbps (5G)' : '300 Mbps (4G+)',
        tipo: 'movil'
      },
      {
        nombre: 'Línea Dedicada',
        disponible: esUrbano,
        velocidadMax: '10 Gbps simétrico',
        tipo: 'dedicada'
      },
      {
        nombre: 'Radio Enlace',
        disponible: true,
        velocidadMax: '500 Mbps simétrico',
        tipo: 'radio'
      }
    ];

    const fibraDisponible = tecnologias.filter(t => t.tipo === 'fibra' && t.disponible).length > 0;
    const dedicadaDisponible = tecnologias.find(t => t.tipo === 'dedicada')?.disponible;

    let recomendacion = '';
    if (dedicadaDisponible) {
      recomendacion = 'Tu ubicación tiene cobertura completa. Para empresas con necesidades críticas, recomendamos fibra dedicada con SLA garantizado. Para el resto, FTTH simétrico ofrece excelente relación calidad-precio.';
    } else if (fibraDisponible) {
      recomendacion = 'Dispones de cobertura de fibra óptica. Recomendamos FTTH simétrico como línea principal y 4G/5G como backup automático para garantizar la continuidad.';
    } else {
      recomendacion = 'La fibra FTTH no está disponible en tu zona, pero tenemos alternativas como NEBA, radio enlace o 4G/5G empresarial. Contacta con nosotros para un estudio personalizado.';
    }

    setResult({
      direccion: `${direccion}, ${codigoPostal} ${provincia}`,
      codigoPostal,
      tecnologias,
      operadores: esUrbano ? Math.floor(Math.random() * 3) + 4 : Math.floor(Math.random() * 2) + 2,
      recomendacion
    });
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <DynamicNav currentPage="recursos" />
      
      <section className="bg-gradient-to-br from-green-50 via-white to-green-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/recursos/herramientas" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Herramientas
            </Link>
            <div className="text-5xl mb-4">📍</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
              Comprobador de Cobertura
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Consulta qué tecnologías de conectividad están disponibles en tu dirección.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-12 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-3xl mx-auto">
            {/* Formulario */}
            <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Introduce tu dirección</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Dirección completa</label>
                  <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)}
                    placeholder="Ej: Calle Gran Vía 28, 3o"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Código postal</label>
                    <input type="text" value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)}
                      placeholder="Ej: 28013" maxLength={5}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Provincia</label>
                    <select value={provincia} onChange={(e) => setProvincia(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900 bg-white">
                      <option value="">Selecciona provincia</option>
                      {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button onClick={checkCobertura} disabled={checking}
                  className="w-full px-6 py-4 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                  {checking ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      Consultando cobertura...
                    </span>
                  ) : 'Comprobar Cobertura'}
                </button>
              </div>
            </div>

            {/* Resultados */}
            {result && (
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-2xl p-6 sm:p-8">
                  <div className="flex items-start gap-3 mb-6">
                    <span className="text-2xl">📍</span>
                    <div>
                      <h3 className="font-bold text-gray-900">Resultados para:</h3>
                      <p className="text-gray-600">{result.direccion}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {result.tecnologias.map((tech, i) => (
                      <div key={i} className={`flex items-center justify-between p-4 rounded-xl border-2 ${
                        tech.disponible ? 'bg-white border-green-200' : 'bg-gray-100 border-gray-200 opacity-60'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            tech.disponible ? 'bg-green-100' : 'bg-gray-200'
                          }`}>
                            {tech.disponible ? (
                              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            )}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 text-sm">{tech.nombre}</span>
                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                              tech.tipo === 'fibra' ? 'bg-blue-100 text-blue-700' :
                              tech.tipo === 'dedicada' ? 'bg-purple-100 text-purple-700' :
                              tech.tipo === 'movil' ? 'bg-green-100 text-green-700' :
                              tech.tipo === 'radio' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>{tech.tipo}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium text-gray-700">{tech.velocidadMax}</span>
                          <div className={`text-xs ${tech.disponible ? 'text-green-600' : 'text-gray-400'}`}>
                            {tech.disponible ? 'Disponible' : 'No disponible'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recomendación */}
                <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-6">
                  <h3 className="font-bold text-orange-800 mb-2">Nuestra recomendación</h3>
                  <p className="text-orange-700 text-sm">{result.recomendacion}</p>
                </div>

                {/* CTA */}
                <div className="bg-gradient-to-r from-orange-600 to-orange-700 rounded-2xl p-6 sm:p-8 text-white text-center">
                  <h3 className="text-xl font-bold mb-2">¿Quieres un estudio detallado?</h3>
                  <p className="text-orange-100 mb-4 text-sm">Nuestros técnicos analizarán las mejores opciones para tu empresa sin compromiso.</p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Link href="/contacto" className="px-6 py-3 bg-white text-orange-600 rounded-xl hover:bg-orange-50 transition-all font-semibold">
                      Solicitar Estudio Gratuito
                    </Link>
                    <a href="https://wa.me/34900123456" className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold">
                      Consultar por WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
