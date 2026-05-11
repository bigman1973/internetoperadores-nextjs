'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import ParticularNav from '@/components/ParticularNav';
import ParticularFooter from '@/components/ParticularFooter';
import AddToCartButton from '@/components/AddToCartButton';

interface TarifaWeb {
  id: number;
  tipoCliente: string;
  categoria: string;
  nombre: string;
  nombreComercial?: string | null;
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  velocidad: string | null;
  velocidadBajada: string | null;
  velocidadSubida: string | null;
  fibraBajada: string | null;
  fibraSubida: string | null;
  datosIncluidos: string | null;
  minutosIncluidos: string | null;
  smsIncluidos: string | null;
  precioSinIva: number;
  precioConIva: number;
  permanencia: string | null;
  duracionPermanenciaMeses: number | null;
  garantia: string | null;
  destacada: boolean;
  esMovil: boolean;
  esFijo: boolean;
  esInternet: boolean;
  esTv: boolean;
  esCompuesta: boolean;
  seccionWebParticular: string | null;
  cuotaAlta?: number | null;
  contratosActivos?: number;
  esPopular?: boolean;
}

function CheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`${className} text-orange-500 flex-shrink-0`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function SpeedIcon() {
  return (
    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
    </svg>
  );
}

function NoContractIcon() {
  return (
    <svg className="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

// Static fallback cards when no tarifas are published yet
function StaticTarifaCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
      {/* Básica */}
      <div className="bg-white rounded-2xl p-8 border-2 border-gray-100 hover:border-orange-300 hover:shadow-xl transition-all duration-300 flex flex-col">
        <div className="mb-6">
          <span className="inline-block bg-orange-50 text-orange-600 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">Internet</span>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Fibra 300</h3>
        <p className="text-gray-500 mb-6">Para el día a día</p>
        <div className="mb-6">
          <span className="text-5xl font-black text-gray-900">29</span>
          <span className="text-2xl font-bold text-gray-900">€</span>
          <span className="text-gray-500 text-lg">/mes</span>
        </div>
        <ul className="space-y-3 mb-8 flex-1">
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Fibra 300 Mbps simétrica</li>
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Router WiFi 6 incluido</li>
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Sin permanencia</li>
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Instalación gratuita</li>
        </ul>
        <Link href="/tarifas/particular?cat=internet" className="block w-full py-3.5 text-center bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors">
          Lo quiero
        </Link>
      </div>

      {/* Popular */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-2xl p-8 shadow-2xl relative flex flex-col md:scale-[1.03]">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
          Recomendado
        </div>
        <div className="mb-6 mt-2">
          <span className="inline-block bg-white/20 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">Fibra + Móvil</span>
        </div>
        <h3 className="text-2xl font-bold mb-2">Pack Familia</h3>
        <p className="text-orange-100 mb-6">Todo lo que necesitas</p>
        <div className="mb-6">
          <span className="text-5xl font-black">39</span>
          <span className="text-2xl font-bold">€</span>
          <span className="text-orange-100 text-lg">/mes</span>
        </div>
        <ul className="space-y-3 mb-8 flex-1">
          <li className="flex items-center gap-3"><CheckIcon className="w-5 h-5 !text-white" />Fibra 600 Mbps simétrica</li>
          <li className="flex items-center gap-3"><CheckIcon className="w-5 h-5 !text-white" />1 línea móvil 25GB</li>
          <li className="flex items-center gap-3"><CheckIcon className="w-5 h-5 !text-white" />Llamadas ilimitadas</li>
          <li className="flex items-center gap-3"><CheckIcon className="w-5 h-5 !text-white" />Sin permanencia</li>
        </ul>
        <Link href="/tarifas/particular?cat=packs" className="block w-full py-3.5 text-center bg-white text-orange-600 rounded-xl font-bold hover:bg-orange-50 transition-colors">
          Lo quiero
        </Link>
      </div>

      {/* Premium */}
      <div className="bg-white rounded-2xl p-8 border-2 border-gray-100 hover:border-orange-300 hover:shadow-xl transition-all duration-300 flex flex-col">
        <div className="mb-6">
          <span className="inline-block bg-orange-50 text-orange-600 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">Todo incluido</span>
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">Pack Total</h3>
        <p className="text-gray-500 mb-6">Máxima velocidad</p>
        <div className="mb-6">
          <span className="text-5xl font-black text-gray-900">49</span>
          <span className="text-2xl font-bold text-gray-900">€</span>
          <span className="text-gray-500 text-lg">/mes</span>
        </div>
        <ul className="space-y-3 mb-8 flex-1">
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Fibra 1 Gbps simétrica</li>
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />2 líneas móvil 50GB</li>
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Llamadas ilimitadas</li>
          <li className="flex items-center gap-3 text-gray-700"><CheckIcon />Sin permanencia</li>
        </ul>
        <Link href="/tarifas/particular" className="block w-full py-3.5 text-center bg-gray-900 text-white rounded-xl font-semibold hover:bg-gray-800 transition-colors">
          Lo quiero
        </Link>
      </div>
    </div>
  );
}

// Dynamic tarifa card for real data
function DynamicTarifaCard({ tarifa, featured = false }: { tarifa: TarifaWeb; featured?: boolean }) {
  const features: string[] = [];
  if (tarifa.velocidadBajada) features.push(`Fibra ${tarifa.velocidadBajada} Mbps`);
  else if (tarifa.velocidad) features.push(tarifa.velocidad);
  if (tarifa.datosIncluidos) features.push(`${tarifa.datosIncluidos} datos móvil`);
  if (tarifa.minutosIncluidos) features.push(`${tarifa.minutosIncluidos} minutos`);
  features.push('Sin permanencia');
  if (tarifa.descripcionCorta && features.length < 5) features.push(tarifa.descripcionCorta);
  const displayFeatures = features.slice(0, 5);

  if (featured || tarifa.esPopular) {
    return (
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-2xl p-8 shadow-2xl relative flex flex-col md:scale-[1.03]">
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider">
          Recomendado
        </div>
        <div className="mb-4 mt-2">
          <span className="inline-block bg-white/20 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">{tarifa.categoria}</span>
        </div>
        <h3 className="text-2xl font-bold mb-2">{tarifa.nombreComercial || tarifa.nombre}</h3>
        <div className="mb-6">
          <span className="text-5xl font-black">{tarifa.precioConIva.toFixed(0)}</span>
          <span className="text-2xl font-bold">€</span>
          <span className="text-orange-100 text-lg">/mes</span>
        </div>
        <p className="text-xs text-orange-200 mb-4">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
        <ul className="space-y-3 mb-8 flex-1">
          {displayFeatures.map((f, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <svg className="w-5 h-5 text-white flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {f}
            </li>
          ))}
        </ul>
        <AddToCartButton tarifa={tarifa} variant="secondary" className="!bg-white !text-orange-600 hover:!bg-orange-50 !rounded-xl !font-bold !py-3.5" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-8 border-2 border-gray-100 hover:border-orange-300 hover:shadow-xl transition-all duration-300 flex flex-col">
      <div className="mb-4">
        <span className="inline-block bg-orange-50 text-orange-600 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full">{tarifa.categoria}</span>
      </div>
      <h3 className="text-2xl font-bold text-gray-900 mb-2">{tarifa.nombreComercial || tarifa.nombre}</h3>
      <div className="mb-6">
        <span className="text-5xl font-black text-gray-900">{tarifa.precioConIva.toFixed(0)}</span>
        <span className="text-2xl font-bold text-gray-900">€</span>
        <span className="text-gray-500 text-lg">/mes</span>
      </div>
      <p className="text-xs text-gray-400 mb-4">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
      <ul className="space-y-3 mb-8 flex-1">
        {displayFeatures.map((f, i) => (
          <li key={i} className="flex items-center gap-3 text-sm text-gray-700">
            <CheckIcon />
            {f}
          </li>
        ))}
      </ul>
      <AddToCartButton tarifa={tarifa} variant="primary" className="!bg-gray-900 !text-white hover:!bg-gray-800 !rounded-xl !font-semibold !py-3.5" />
    </div>
  );
}

export default function ParticularLandingClient({ tarifasTop }: { tarifasTop: TarifaWeb[] }) {
  const hasDynamicTarifas = tarifasTop.length > 0;

  return (
    <div className="min-h-screen bg-white">
      <ParticularNav currentPage="" />

      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden bg-gray-900">
        {/* Background image with overlay */}
        <div className="absolute inset-0">
          <img
            src="/hero-b2c-familia.png"
            alt="Familia conectada en casa"
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/95 to-gray-900/70" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          <div className="max-w-3xl">
            {/* Pain point badge */}
            <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-2 mb-8">
              <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              <span className="text-orange-400 text-sm font-medium">Operador de telecomunicaciones registrado en la CNMC</span>
            </div>

            {/* Main headline - attacks the pain */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black text-white leading-[1.1] mb-6">
              Internet donde vivas.
              <br />
              <span className="text-orange-500">Sin excusas.</span>
            </h1>

            {/* Subheadline - emotional */}
            <p className="text-lg sm:text-xl lg:text-2xl text-gray-300 mb-10 max-w-2xl leading-relaxed">
              Fibra, 4G o 5G: te conectamos con la mejor tecnología disponible en tu zona. 
              Tus hijos estudian, tú trabajas, todos conectados. <strong className="text-white">Siempre.</strong>
            </p>

            {/* CTA buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/recursos/herramientas/cobertura-fibra"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Comprobar mi cobertura
              </Link>
              <Link
                href="#tarifas"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 border-2 border-white/30 text-white hover:bg-white/10 rounded-xl font-semibold text-lg transition-all"
              >
                Ver tarifas
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </Link>
            </div>

            {/* Trust badges */}
            <div className="mt-12 flex flex-wrap items-center gap-6 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Sin permanencia
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Sin letra pequeña
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Precio fijo garantizado
              </div>
            </div>
            <a href="#condiciones" className="ml-2 text-orange-400 hover:text-orange-300 underline underline-offset-2 text-xs transition-colors">
              Ver condiciones
            </a>
          </div>
        </div>
      </section>

      {/* ===== PAIN POINTS / EMOTIONAL SECTION ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4">
              ¿Cansado de que tu operador<br className="hidden sm:block" /> <span className="text-orange-500">te deje tirado?</span>
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
              Sabemos lo que es. Por eso creamos algo diferente.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            {/* Pain 1 */}
            <div className="text-center group">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-2xl flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">&ldquo;No hay cobertura en tu zona&rdquo;</h3>
              <p className="text-gray-600 leading-relaxed">
                Los grandes operadores solo invierten donde hay millones de clientes. Si vives en una zona rural o semiurbana, te ignoran.
              </p>
            </div>

            {/* Pain 2 */}
            <div className="text-center group">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-2xl flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">&ldquo;Subidas de precio sorpresa&rdquo;</h3>
              <p className="text-gray-600 leading-relaxed">
                Contratas a un precio y a los 3 meses te suben la factura. Con nosotros, el precio que ves es el precio que pagas. Siempre.
              </p>
            </div>

            {/* Pain 3 */}
            <div className="text-center group">
              <div className="w-20 h-20 mx-auto mb-6 bg-red-50 rounded-2xl flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">&ldquo;Espere, le paso con otro departamento&rdquo;</h3>
              <p className="text-gray-600 leading-relaxed">
                Horas al teléfono para resolver un problema simple. Aquí te atiende una persona real que resuelve. En la primera llamada.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== UNIQUE VALUE PROPOSITION ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-gradient-to-br from-orange-50 via-white to-orange-50/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <span className="inline-block bg-orange-100 text-orange-700 text-sm font-bold uppercase tracking-wider px-4 py-2 rounded-full mb-6">
                Nuestro diferencial
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-6 leading-tight">
                Cobertura garantizada<br />
                <span className="text-orange-500">donde vivas</span>
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Somos un operador <strong>multioperador</strong>. Eso significa que no dependemos de una sola red. 
                Analizamos tu ubicación y te conectamos con la mejor tecnología disponible: fibra óptica, 4G o 5G.
              </p>

              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Fibra óptica hasta 1 Gbps</h4>
                    <p className="text-gray-600 text-sm">Donde haya despliegue de fibra, te la llevamos a casa.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">4G/5G de alta velocidad</h4>
                    <p className="text-gray-600 text-sm">Si la fibra no llega, te conectamos por radio con velocidades de hasta 300 Mbps.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">Siempre la mejor opción</h4>
                    <p className="text-gray-600 text-sm">Nuestro equipo analiza tu dirección y te recomienda la solución óptima. Sin ataduras a una sola tecnología.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual */}
            <div className="relative">
              <div className="bg-gradient-to-br from-orange-400 to-orange-600 rounded-3xl p-8 sm:p-12 text-white">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto mb-6 bg-white/20 rounded-full flex items-center justify-center">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-3xl font-black mb-3">99,2%</h3>
                  <p className="text-orange-100 text-lg mb-8">de la población española cubierta por nuestras redes</p>
                  
                  <div className="grid grid-cols-3 gap-4 pt-6 border-t border-white/20">
                    <div>
                      <p className="text-2xl font-bold">Fibra</p>
                      <p className="text-orange-200 text-xs">FTTH</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">4G</p>
                      <p className="text-orange-200 text-xs">LTE-A</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">5G</p>
                      <p className="text-orange-200 text-xs">NR</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-orange-200 rounded-full opacity-50 blur-xl" />
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-orange-300 rounded-full opacity-30 blur-xl" />
            </div>
          </div>
        </div>
      </section>

      {/* ===== TARIFAS SECTION ===== */}
      <section id="tarifas" className="py-16 sm:py-20 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4">
              Tarifas claras. <span className="text-orange-500">Sin sorpresas.</span>
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
              El precio que ves es el que pagas. Impuestos incluidos. Sin subidas a los 3 meses.
            </p>
          </div>

          {hasDynamicTarifas ? (
            <>
              <div className={`grid grid-cols-1 ${tarifasTop.length >= 3 ? 'md:grid-cols-3' : tarifasTop.length === 2 ? 'md:grid-cols-2 max-w-4xl mx-auto' : 'max-w-md mx-auto'} gap-6 lg:gap-8`}>
                {tarifasTop.map((tarifa, idx) => (
                  <DynamicTarifaCard
                    key={tarifa.id}
                    tarifa={tarifa}
                    featured={tarifa.esPopular || idx === 1}
                  />
                ))}
              </div>
              <div className="text-center mt-12">
                <Link
                  href="/tarifas/particular"
                  className="inline-flex items-center gap-2 px-8 py-4 bg-white border-2 border-gray-200 hover:border-orange-300 text-gray-900 rounded-xl font-semibold text-lg transition-all hover:shadow-lg"
                >
                  Ver todas las tarifas
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            </>
          ) : (
            <StaticTarifaCards />
          )}

          {/* Transparency note */}
          <div className="mt-12 text-center">
            <p className="text-sm text-gray-500">
              Todos los precios incluyen IVA. Sin costes ocultos. Sin permanencia. Cancela cuando quieras.
            </p>
          </div>
        </div>
      </section>

      {/* ===== WHY US / DIFFERENTIATORS ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-gray-900 mb-4">
              ¿Por qué <span className="text-orange-500">elegirnos?</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-5 bg-orange-50 rounded-2xl flex items-center justify-center">
                <WifiIcon />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Cobertura real</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Multioperador: fibra, 4G o 5G. Siempre conectado, vivas donde vivas.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-5 bg-orange-50 rounded-2xl flex items-center justify-center">
                <ShieldIcon />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Precio fijo</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Sin subidas sorpresa. Tu factura es la misma mes tras mes. Garantizado.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-5 bg-orange-50 rounded-2xl flex items-center justify-center">
                <NoContractIcon />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Sin permanencia</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Si no estás contento, te vas. Sin penalizaciones, sin dramas.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-16 h-16 mx-auto mb-5 bg-orange-50 rounded-2xl flex items-center justify-center">
                <HeartIcon />
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-2">Atención humana</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Personas reales que te atienden y resuelven. Sin robots, sin esperas eternas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ===== USE CASES / EMOTIONAL ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
              Internet que <span className="text-orange-500">funciona</span> para tu vida
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Use case 1: Kids studying */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
              <div className="h-48 overflow-hidden">
                <img
                  src="/hero-b2c-familia.png"
                  alt="Madre e hijo estudiando online"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Para que estudien sin cortes</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Clases online, deberes, videollamadas con profesores. Tu hijo necesita internet estable para no quedarse atrás.
                </p>
              </div>
            </div>

            {/* Use case 2: Remote work */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
              <div className="h-48 overflow-hidden">
                <img
                  src="/teletrabajo-home.jpg"
                  alt="Teletrabajo desde casa"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Para teletrabajar de verdad</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Videollamadas sin pixelar, archivos que suben rápido, VPN sin caídas. Internet profesional en tu casa.
                </p>
              </div>
            </div>

            {/* Use case 3: Family */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
              <div className="h-48 overflow-hidden">
                <img
                  src="/hero-familia-conectada.jpg"
                  alt="Familia disfrutando de internet"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-2">Para disfrutar en familia</h3>
                <p className="text-gray-600 text-sm leading-relaxed">
                  Streaming, gaming, redes sociales. Todos conectados a la vez sin que se ralentice nada.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SOCIAL PROOF / TESTIMONIALS ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-gray-900 mb-4">
              Lo que dicen <span className="text-orange-500">nuestros clientes</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-2xl p-8">
              <div className="flex items-center gap-1 mb-4">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-700 mb-6 leading-relaxed italic">
                &ldquo;Vivimos en un pueblo de Guadalajara donde ningún operador nos daba fibra. Internet Operadores nos puso 4G fijo y va como un tiro. Por fin podemos teletrabajar.&rdquo;
              </p>
              <div>
                <p className="font-bold text-gray-900">María G.</p>
                <p className="text-sm text-gray-500">Guadalajara, zona rural</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <div className="flex items-center gap-1 mb-4">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-700 mb-6 leading-relaxed italic">
                &ldquo;Llevaba 2 años con Movistar pagando 65€ por 300 Mbps. Me cambié a Internet Operadores, pago 35€ por 600 Mbps y sin permanencia. Ojalá lo hubiera hecho antes.&rdquo;
              </p>
              <div>
                <p className="font-bold text-gray-900">Carlos R.</p>
                <p className="text-sm text-gray-500">Madrid, Vallecas</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-8">
              <div className="flex items-center gap-1 mb-4">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-700 mb-6 leading-relaxed italic">
                &ldquo;Lo mejor es la atención. Llamé un domingo porque se me cayó la conexión y me lo resolvieron en 10 minutos. Con mi anterior operador tardaban días.&rdquo;
              </p>
              <div>
                <p className="font-bold text-gray-900">Ana P.</p>
                <p className="text-sm text-gray-500">Toledo</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4">
              Conectarte es <span className="text-orange-400">así de fácil</span>
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              En 3 pasos, sin complicaciones. Como debe ser.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-orange-500 rounded-full flex items-center justify-center text-2xl font-black">
                1
              </div>
              <h3 className="text-xl font-bold mb-3">Comprueba tu cobertura</h3>
              <p className="text-gray-400 leading-relaxed">
                Introduce tu dirección y te decimos qué tecnología llega a tu casa y a qué velocidad.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-orange-500 rounded-full flex items-center justify-center text-2xl font-black">
                2
              </div>
              <h3 className="text-xl font-bold mb-3">Elige tu tarifa</h3>
              <p className="text-gray-400 leading-relaxed">
                Escoge el plan que mejor se adapte a tu familia. Sin letra pequeña, sin sorpresas.
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-orange-500 rounded-full flex items-center justify-center text-2xl font-black">
                3
              </div>
              <h3 className="text-xl font-bold mb-3">Nosotros nos encargamos</h3>
              <p className="text-gray-400 leading-relaxed">
                Gestionamos todo: instalación, portabilidad y activación. Tú solo disfruta.
              </p>
            </div>
          </div>

          <div className="text-center mt-14">
            <Link
              href="/recursos/herramientas/cobertura-fibra"
              className="inline-flex items-center gap-2 px-10 py-5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-orange-500/25"
            >
              Comprobar mi cobertura ahora
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ===== FINAL CTA ===== */}
      <section className="py-16 sm:py-20 lg:py-24 bg-gradient-to-br from-orange-500 to-orange-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-6">
            ¿Listo para tener internet de verdad?
          </h2>
          <p className="text-xl text-orange-100 mb-10 max-w-2xl mx-auto">
            Llámanos gratis o comprueba tu cobertura online. Sin compromiso.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="tel:900730034"
              className="inline-flex items-center gap-3 px-8 py-4 bg-white text-orange-600 rounded-xl font-bold text-lg hover:bg-orange-50 transition-colors shadow-lg"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              900 730 034
            </a>
            <Link
              href="/recursos/herramientas/cobertura-fibra"
              className="inline-flex items-center gap-2 px-8 py-4 border-2 border-white text-white rounded-xl font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Comprobar cobertura
            </Link>
          </div>
          <p className="mt-8 text-orange-200 text-sm">
            Llamada gratuita. Lunes a viernes de 9:00 a 20:00.
          </p>
        </div>
      </section>


      {/* ===== FAQ / CONDICIONES ===== */}
      <section id="condiciones" className="py-16 sm:py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 mb-4">
            Preguntas frecuentes
          </h2>
          <p className="text-center text-gray-600 mb-12 max-w-2xl mx-auto">
            Transparencia total. Sin letra pequeña. Aquí tienes las respuestas a las dudas más comunes.
          </p>
          <div className="space-y-4">
            {/* FAQ 1 - Precio fijo */}
            <details className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                <span>¿Qué significa &ldquo;precio fijo garantizado&rdquo;?</span>
                <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-600 leading-relaxed">
                <p className="mb-3">
                  Significa que <strong>nunca subimos los precios de forma unilateral ni sin previo aviso</strong>. A diferencia de otros operadores que suben la factura &ldquo;porque sí&rdquo; a los pocos meses, nosotros mantenemos el precio que contratas.
                </p>
                <p className="mb-3">
                  Dicho esto, somos transparentes: como empresa tecnológica, circunstancias excepcionales como subidas del IPC, incrementos en el coste de materias primas o cambios regulatorios podrían afectar a nuestros costes operativos.
                </p>
                <p>
                  En ese caso, <strong>siempre te notificaremos con antelación</strong> y te ofreceremos alternativas. Nunca te encontrarás una sorpresa en la factura.
                </p>
              </div>
            </details>
            {/* FAQ 2 - Sin permanencia */}
            <details className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                <span>¿Qué significa &ldquo;sin permanencia&rdquo;?</span>
                <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-600 leading-relaxed">
                <p className="mb-3">
                  Puedes irte cuando quieras, sin penalizaciones por cancelar el servicio. No hay cláusulas de permanencia obligatoria como en otros operadores.
                </p>
                <p className="mb-3">
                  Los <strong>equipos y la instalación</strong> se pueden pagar inicialmente o financiar. Si decides marcharte antes de 12 meses, simplemente tendrás que devolver el equipo cedido y abonar los costes de instalación pendientes (si los financiaste).
                </p>
                <p>
                  Es justo: nosotros invertimos en llevarte el servicio, y si te quedas más de un año, esos costes quedan cubiertos. Sin ataduras, sin sorpresas.
                </p>
              </div>
            </details>
            {/* FAQ 3 - 15 días de prueba */}
            <details className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                <span>¿Y si el servicio no cumple mis expectativas?</span>
                <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-600 leading-relaxed">
                <p className="mb-3">
                  Tienes <strong>15 días de prueba</strong> desde la activación del servicio. Si la conexión no es la esperada o no estás satisfecho, podemos:
                </p>
                <ul className="list-disc list-inside mb-3 space-y-1">
                  <li>Proponerte una solución técnica alternativa (otra tecnología, otro equipo)</li>
                  <li>Cancelar el contrato sin coste alguno</li>
                </ul>
                <p>
                  Creemos en nuestro servicio, por eso te damos la oportunidad de probarlo sin riesgo.
                </p>
              </div>
            </details>
            {/* FAQ 4 - Cobertura */}
            <details className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                <span>¿Cómo sabéis qué tecnología llega a mi casa?</span>
                <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-600 leading-relaxed">
                <p className="mb-3">
                  Somos un operador <strong>multioperador</strong>. Trabajamos con múltiples redes y tecnologías (fibra FTTH, 4G, 5G, WiMAX, satélite). Cuando nos das tu dirección, nuestro equipo técnico analiza todas las opciones disponibles y te recomienda la mejor solución.
                </p>
                <p>
                  No dependemos de una sola infraestructura, por eso podemos garantizar cobertura donde otros no llegan.
                </p>
              </div>
            </details>
            {/* FAQ 5 - Diferencia con grandes operadores */}
            <details className="group bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <summary className="flex items-center justify-between cursor-pointer p-6 font-semibold text-gray-900 hover:bg-gray-50 transition-colors">
                <span>¿En qué os diferenciáis de Movistar, Vodafone o MásMóvil?</span>
                <svg className="w-5 h-5 text-gray-500 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="px-6 pb-6 text-gray-600 leading-relaxed">
                <p className="mb-3">
                  Los grandes operadores dependen de una sola red y solo invierten donde hay millones de clientes. Nosotros:
                </p>
                <ul className="list-disc list-inside mb-3 space-y-1">
                  <li><strong>Cobertura real:</strong> Si la fibra no llega, te conectamos por 4G/5G. Siempre hay solución.</li>
                  <li><strong>Atención personal:</strong> Te atiende una persona que conoce tu caso. Sin robots ni esperas.</li>
                  <li><strong>Precio honesto:</strong> Sin promociones trampa que suben a los 3 meses.</li>
                  <li><strong>Más de 25 años:</strong> No somos una startup que puede desaparecer mañana.</li>
                </ul>
              </div>
            </details>
          </div>
        </div>
      </section>

      <ParticularFooter />
    </div>
  );
}
