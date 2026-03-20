"use client";
import Link from 'next/link';
import { useState, useMemo } from 'react';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

export default function CalculadoraROIPage() {
  const [empleados, setEmpleados] = useState(25);
  const [costeTelefoniaActual, setCosteTelefoniaActual] = useState(800);
  const [costeViajes, setCosteViajes] = useState(2000);
  const [horasReunionesSemanales, setHorasReunionesSemanales] = useState(5);
  const [numSedes, setNumSedes] = useState(1);
  const [tieneVoIP, setTieneVoIP] = useState(false);

  const resultados = useMemo(() => {
    // Costes actuales mensuales
    const costeTelefoniaAnual = costeTelefoniaActual * 12;
    const costeViajesAnual = costeViajes * 12;
    const horasPerdidasDesplazamiento = horasReunionesSemanales * 0.3 * 52; // 30% del tiempo en desplazamientos
    const costeSalarialPerdido = horasPerdidasDesplazamiento * 35 * empleados * 0.1; // 10% empleados afectados
    const costeInfraActual = tieneVoIP ? 200 * numSedes * 12 : 500 * numSedes * 12;
    const costeTotalActual = costeTelefoniaAnual + costeViajesAnual + costeSalarialPerdido + costeInfraActual;

    // Costes con UCaaS
    const costeUCaaSPorEmpleado = 15; // €/mes por empleado
    const costeUCaaSAnual = costeUCaaSPorEmpleado * empleados * 12;
    const costeTelefoniaUCaaS = costeTelefoniaActual * 0.4 * 12; // 60% ahorro
    const costeViajesUCaaS = costeViajes * 0.5 * 12; // 50% ahorro
    const costeInfraUCaaS = 100 * numSedes * 12;
    const costeTotalUCaaS = costeUCaaSAnual + costeTelefoniaUCaaS + costeViajesUCaaS + costeInfraUCaaS;

    // Beneficios
    const ahorroAnual = costeTotalActual - costeTotalUCaaS;
    const ahorroTelefonia = costeTelefoniaAnual - (costeTelefoniaActual * 0.4 * 12);
    const ahorroViajes = costeViajesAnual - (costeViajes * 0.5 * 12);
    const ahorroProductividad = costeSalarialPerdido * 0.7;
    
    // Inversión inicial
    const inversionInicial = empleados * 50 + numSedes * 500; // Setup + hardware
    
    // ROI
    const roi = ahorroAnual > 0 ? ((ahorroAnual - inversionInicial) / inversionInicial) * 100 : 0;
    const mesesRecuperacion = ahorroAnual > 0 ? Math.ceil((inversionInicial / (ahorroAnual / 12))) : 0;

    return {
      costeTotalActual,
      costeTotalUCaaS,
      ahorroAnual,
      ahorroTelefonia,
      ahorroViajes,
      ahorroProductividad,
      inversionInicial,
      roi: Math.round(roi),
      mesesRecuperacion,
      costeUCaaSAnual
    };
  }, [empleados, costeTelefoniaActual, costeViajes, horasReunionesSemanales, numSedes, tieneVoIP]);

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      <section className="bg-gradient-to-br from-purple-50 via-white to-purple-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/recursos/herramientas" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Herramientas
            </Link>
            <div className="text-5xl mb-4">📊</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
              Calculadora de ROI
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Estima el retorno de inversión de implementar comunicaciones unificadas (UCaaS) en tu empresa.
            </p>
          </div>
        </div>
      </section>

      <section className="py-8 sm:py-12 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Panel de entrada */}
              <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Datos de tu empresa</h2>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Numero de empleados: <span className="text-orange-600">{empleados}</span>
                    </label>
                    <input type="range" min="5" max="500" step="5" value={empleados}
                      onChange={(e) => setEmpleados(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>5</span><span>500</span></div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Gasto mensual en telefonía: <span className="text-orange-600">{costeTelefoniaActual}€</span>
                    </label>
                    <input type="range" min="100" max="5000" step="50" value={costeTelefoniaActual}
                      onChange={(e) => setCosteTelefoniaActual(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>100€</span><span>5.000€</span></div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Gasto mensual en viajes/desplazamientos: <span className="text-orange-600">{costeViajes}€</span>
                    </label>
                    <input type="range" min="0" max="10000" step="100" value={costeViajes}
                      onChange={(e) => setCosteViajes(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>0€</span><span>10.000€</span></div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Horas semanales en reuniones: <span className="text-orange-600">{horasReunionesSemanales}h</span>
                    </label>
                    <input type="range" min="1" max="20" value={horasReunionesSemanales}
                      onChange={(e) => setHorasReunionesSemanales(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1h</span><span>20h</span></div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Numero de sedes/oficinas: <span className="text-orange-600">{numSedes}</span>
                    </label>
                    <input type="range" min="1" max="20" value={numSedes}
                      onChange={(e) => setNumSedes(Number(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                    <div className="flex justify-between text-xs text-gray-400 mt-1"><span>1</span><span>20</span></div>
                  </div>

                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="voip" checked={tieneVoIP}
                      onChange={(e) => setTieneVoIP(e.target.checked)}
                      className="w-4 h-4 text-orange-600 rounded accent-orange-600" />
                    <label htmlFor="voip" className="text-sm font-medium text-gray-700">
                      Ya tengo VoIP / centralita IP
                    </label>
                  </div>
                </div>
              </div>

              {/* Panel de resultados */}
              <div className="space-y-6">
                {/* ROI destacado */}
                <div className="bg-gradient-to-br from-orange-600 to-orange-700 rounded-2xl p-6 sm:p-8 text-white">
                  <h2 className="text-xl font-bold mb-4">Retorno de Inversión</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-3xl sm:text-4xl font-bold">{resultados.roi}%</div>
                      <div className="text-sm text-orange-100 mt-1">ROI anual</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-4 text-center">
                      <div className="text-3xl sm:text-4xl font-bold">{resultados.mesesRecuperacion}</div>
                      <div className="text-sm text-orange-100 mt-1">Meses recuperación</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/20">
                    <div className="flex justify-between items-center">
                      <span className="text-orange-100">Ahorro anual estimado</span>
                      <span className="text-2xl font-bold">{resultados.ahorroAnual.toLocaleString()}€</span>
                    </div>
                  </div>
                </div>

                {/* Desglose */}
                <div className="bg-gray-50 rounded-2xl p-6 sm:p-8">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Desglose del ahorro</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Ahorro en telefonía</span>
                        <p className="text-xs text-gray-500">Reducción del 60% con VoIP integrada</p>
                      </div>
                      <span className="font-bold text-green-600">{resultados.ahorroTelefonia.toLocaleString()}€/año</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Ahorro en viajes</span>
                        <p className="text-xs text-gray-500">Reducción del 50% con videoconferencia</p>
                      </div>
                      <span className="font-bold text-green-600">{resultados.ahorroViajes.toLocaleString()}€/año</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Ganancia en productividad</span>
                        <p className="text-xs text-gray-500">Menos tiempo en desplazamientos</p>
                      </div>
                      <span className="font-bold text-green-600">{Math.round(resultados.ahorroProductividad).toLocaleString()}€/año</span>
                    </div>
                    <div className="flex justify-between items-center pb-3 border-b border-gray-200">
                      <div>
                        <span className="text-sm font-medium text-gray-900">Coste UCaaS</span>
                        <p className="text-xs text-gray-500">{empleados} empleados x 15€/mes</p>
                      </div>
                      <span className="font-bold text-red-500">-{resultados.costeUCaaSAnual.toLocaleString()}€/año</span>
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-sm font-bold text-gray-900">Inversión inicial</span>
                      <span className="font-bold text-gray-900">{resultados.inversionInicial.toLocaleString()}€</span>
                    </div>
                  </div>
                </div>

                {/* Comparativa visual */}
                <div className="bg-white border-2 border-gray-200 rounded-2xl p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Comparativa anual</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Coste actual</span>
                        <span className="font-bold text-red-600">{resultados.costeTotalActual.toLocaleString()}€</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div className="bg-red-500 h-4 rounded-full" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">Con UCaaS</span>
                        <span className="font-bold text-green-600">{resultados.costeTotalUCaaS.toLocaleString()}€</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-4">
                        <div className="bg-green-500 h-4 rounded-full transition-all duration-500" 
                          style={{ width: `${Math.min(100, (resultados.costeTotalUCaaS / resultados.costeTotalActual) * 100)}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <Link href="/contacto" className="block w-full px-6 py-4 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-bold text-center text-lg">
                  Solicitar Propuesta Personalizada
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
