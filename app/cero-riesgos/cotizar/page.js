'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getStripe } from '@/lib/stripe-client';

export default function CotizarCeroRiesgos() {
  const [formData, setFormData] = useState({
    customerName: '',
    customerEmail: '',
    customerCompany: '',
    customerPhone: '',
    numSedes: 1,
    sedes: [
      { pcs: 10, servidores: 1 }
    ],
    paymentType: 'one-time'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Calcular precio total
  const calculatePrice = () => {
    let total = 0;
    
    formData.sedes.forEach((sede, index) => {
      if (index === 0) {
        // Primera sede: €790 base (incluye 10 PCs y 1 servidor)
        total += 790;
        
        // PCs adicionales (a partir del PC 11)
        if (sede.pcs > 10) {
          total += (sede.pcs - 10) * 15;
        }
        
        // Servidores adicionales (a partir del servidor 2)
        if (sede.servidores > 1) {
          total += (sede.servidores - 1) * 50;
        }
      } else {
        // Sedes adicionales: €590 base (incluye 10 PCs y 1 servidor)
        total += 590;
        
        // PCs adicionales
        if (sede.pcs > 10) {
          total += (sede.pcs - 10) * 15;
        }
        
        // Servidores adicionales
        if (sede.servidores > 1) {
          total += (sede.servidores - 1) * 50;
        }
      }
    });
    
    return total;
  };

  const subtotal = calculatePrice();
  const iva = subtotal * 0.21;
  const total = subtotal + iva;

  // Generar desglose para Stripe
  const generateBreakdown = () => {
    let breakdown = [];
    
    formData.sedes.forEach((sede, index) => {
      const sedeNum = index + 1;
      if (index === 0) {
        breakdown.push(`Sede ${sedeNum}: €790 (hasta 10 PCs + 1 servidor)`);
        if (sede.pcs > 10) {
          breakdown.push(`  + ${sede.pcs - 10} PCs adicionales: €${(sede.pcs - 10) * 15}`);
        }
        if (sede.servidores > 1) {
          breakdown.push(`  + ${sede.servidores - 1} servidores adicionales: €${(sede.servidores - 1) * 50}`);
        }
      } else {
        breakdown.push(`Sede ${sedeNum}: €590 (hasta 10 PCs + 1 servidor)`);
        if (sede.pcs > 10) {
          breakdown.push(`  + ${sede.pcs - 10} PCs adicionales: €${(sede.pcs - 10) * 15}`);
        }
        if (sede.servidores > 1) {
          breakdown.push(`  + ${sede.servidores - 1} servidores adicionales: €${(sede.servidores - 1) * 50}`);
        }
      }
    });
    
    breakdown.push(`Subtotal: €${subtotal.toFixed(2)}`);
    breakdown.push(`IVA (21%): €${iva.toFixed(2)}`);
    breakdown.push(`Total: €${total.toFixed(2)}`);
    
    return breakdown.join(' | ');
  };

  const handleNumSedesChange = (num) => {
    const newSedes = [...formData.sedes];
    
    if (num > formData.numSedes) {
      // Agregar sedes
      for (let i = formData.numSedes; i < num; i++) {
        newSedes.push({ pcs: 10, servidores: 1 });
      }
    } else {
      // Quitar sedes
      newSedes.splice(num);
    }
    
    setFormData({
      ...formData,
      numSedes: num,
      sedes: newSedes
    });
  };

  const handleSedeChange = (index, field, value) => {
    const newSedes = [...formData.sedes];
    newSedes[index][field] = parseInt(value) || 0;
    setFormData({
      ...formData,
      sedes: newSedes
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Validar email
      if (!formData.customerEmail.includes('@')) {
        throw new Error('Email inválido');
      }

      // Crear sesión de checkout
      const response = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerCompany: formData.customerCompany,
          customerPhone: formData.customerPhone,
          totalAmount: total,
          paymentType: formData.paymentType,
          breakdown: generateBreakdown(),
        }),
      });

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      // Redirigir a Stripe Checkout
      const stripe = await getStripe();
      const { error: stripeError } = await stripe.redirectToCheckout({
        sessionId: data.sessionId,
      });

      if (stripeError) {
        throw new Error(stripeError.message);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white py-3 text-sm">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <Link href="/" className="text-white hover:text-orange-500">
            ← Volver al inicio
          </Link>
          <a 
            href="https://wa.me/34655100400?text=Hola,%20necesito%20ayuda%20con%20la%20cotización" 
            className="bg-green-500 px-4 py-2 rounded hover:bg-green-600 font-semibold"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp
          </a>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Cotización Informe Cero Riesgos
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Completa el formulario para calcular el precio de tu auditoría de ciberseguridad
          </p>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Formulario */}
            <div className="md:col-span-2">
              <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6 space-y-6">
                {/* Datos del cliente */}
                <div>
                  <h2 className="text-2xl font-bold mb-4">Datos de contacto</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.customerName}
                        onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                        placeholder="Juan Pérez"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.customerEmail}
                        onChange={(e) => setFormData({...formData, customerEmail: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                        placeholder="juan@empresa.com"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Empresa *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.customerCompany}
                        onChange={(e) => setFormData({...formData, customerCompany: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                        placeholder="Mi Empresa S.L."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={formData.customerPhone}
                        onChange={(e) => setFormData({...formData, customerPhone: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                        placeholder="+34 600 000 000"
                      />
                    </div>
                  </div>
                </div>

                {/* Configuración de sedes */}
                <div>
                  <h2 className="text-2xl font-bold mb-4">Configuración</h2>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Número de sedes
                    </label>
                    <select
                      value={formData.numSedes}
                      onChange={(e) => handleNumSedesChange(parseInt(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                    >
                      {[1, 2, 3, 4, 5].map(num => (
                        <option key={num} value={num}>{num} {num === 1 ? 'sede' : 'sedes'}</option>
                      ))}
                    </select>
                  </div>

                  {/* Detalles por sede */}
                  {formData.sedes.map((sede, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg mb-4">
                      <h3 className="font-bold mb-3">
                        {index === 0 ? 'Sede Principal' : `Sede ${index + 1}`}
                        <span className="text-sm font-normal text-gray-600 ml-2">
                          (Base: €{index === 0 ? '790' : '590'} - incluye 10 PCs + 1 servidor)
                        </span>
                      </h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Número de PCs
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={sede.pcs}
                            onChange={(e) => handleSedeChange(index, 'pcs', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                          />
                          {sede.pcs > 10 && (
                            <p className="text-xs text-gray-600 mt-1">
                              +€{(sede.pcs - 10) * 15} ({sede.pcs - 10} PCs adicionales)
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Número de Servidores
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={sede.servidores}
                            onChange={(e) => handleSedeChange(index, 'servidores', e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 font-medium"
                          />
                          {sede.servidores > 1 && (
                            <p className="text-xs text-gray-600 mt-1">
                              +€{(sede.servidores - 1) * 50} ({sede.servidores - 1} servidores adicionales)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tipo de pago */}
                <div>
                  <h2 className="text-2xl font-bold mb-4">Tipo de pago</h2>
                  
                  <div className="space-y-3">
                    <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 transition-colors">
                      <input
                        type="radio"
                        name="paymentType"
                        value="one-time"
                        checked={formData.paymentType === 'one-time'}
                        onChange={(e) => setFormData({...formData, paymentType: e.target.value})}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-bold">Pago único</div>
                        <div className="text-sm text-gray-600">Paga una sola vez</div>
                      </div>
                    </label>

                    <label className="flex items-center p-4 border-2 border-gray-300 rounded-lg cursor-pointer hover:border-orange-500 transition-colors">
                      <input
                        type="radio"
                        name="paymentType"
                        value="subscription"
                        checked={formData.paymentType === 'subscription'}
                        onChange={(e) => setFormData({...formData, paymentType: e.target.value})}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-bold">Suscripción anual</div>
                        <div className="text-sm text-gray-600">Renovación automática cada año</div>
                      </div>
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 text-white px-8 py-4 rounded-lg text-lg font-bold hover:bg-orange-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Procesando...' : 'Proceder al pago'}
                </button>
              </form>
            </div>

            {/* Resumen */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-lg shadow-lg p-6 sticky top-4">
                <h2 className="text-2xl font-bold mb-4">Resumen</h2>
                
                <div className="space-y-3 mb-6">
                  {formData.sedes.map((sede, index) => (
                    <div key={index} className="text-sm">
                      <div className="font-bold">
                        {index === 0 ? 'Sede Principal' : `Sede ${index + 1}`}
                      </div>
                      <div className="text-gray-600">
                        {sede.pcs} PCs • {sede.servidores} {sede.servidores === 1 ? 'Servidor' : 'Servidores'}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-gray-700">
                    <span>Subtotal:</span>
                    <span>€{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>IVA (21%):</span>
                    <span>€{iva.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-2xl font-bold text-orange-500 pt-2 border-t">
                    <span>Total:</span>
                    <span>€{total.toFixed(2)}</span>
                  </div>
                </div>

                <div className="mt-6 text-xs text-gray-600">
                  <p className="mb-2">✓ Pago seguro con Stripe</p>
                  <p className="mb-2">✓ Factura emitida por Internet Operadores</p>
                  <p>✓ Informe entregado en 48 horas</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

