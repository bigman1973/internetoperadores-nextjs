'use client';

import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function ExitoPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id');
  
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    cif: '',
    razonSocial: '',
    direccion: '',
    codigoPostal: '',
    ciudad: '',
    pais: 'ES'
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      router.push('/');
      return;
    }

    const fetchSessionData = async () => {
      try {
        const url = '/api/get-session?session_id=' + sessionId;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setCustomerEmail(data.email || '');
        }
      } catch (error) {
        console.log('No se pudo obtener el email, pero el pago fue exitoso');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();
  }, [sessionId, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/enviar-datos-fiscales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId,
          ...formData
        }),
      });

      if (response.ok) {
        setSubmitSuccess(true);
      } else {
        alert('Error al enviar los datos. Por favor, inténtalo de nuevo.');
      }
    } catch (error) {
      alert('Error al enviar los datos. Por favor, inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (!sessionId) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
        <div className="bg-white p-10 rounded-lg shadow-lg max-w-2xl mx-auto">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold text-gray-800">
            Procesando tu pago...
          </h1>
        </div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
        <div className="bg-white p-10 rounded-lg shadow-lg max-w-2xl mx-auto">
          <svg
            className="w-16 h-16 text-green-500 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            ¡Todo listo!
          </h1>
          <p className="text-gray-600 mb-6">
            Hemos recibido tus datos fiscales correctamente.
            <br />
            Recibirás tu factura por correo electrónico en breve.
          </p>
          <Link
            href="/"
            className="inline-block bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-center p-4">
      <div className="bg-white p-10 rounded-lg shadow-lg max-w-2xl mx-auto">
        <svg
          className="w-16 h-16 text-green-500 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          ></path>
        </svg>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          ¡Pago completado con éxito!
        </h1>
        <p className="text-gray-600 mb-6">
          Hemos recibido tu pago correctamente.
          {customerEmail && (
            <>
              <br />
              En breve recibirás un correo de confirmación en{" "}
              <strong className="text-gray-900">{customerEmail}</strong>.
            </>
          )}
          {!customerEmail && (
            <>
              <br />
              En breve recibirás un correo de confirmación.
            </>
          )}
        </p>
        <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">
            Siguientes Pasos: Datos Fiscales
          </h2>
          <p className="text-gray-700 mb-4">
            Para poder generar tu factura, necesitamos que completes tus datos
            fiscales.
          </p>
          
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">
                CIF/NIF *
              </label>
              <input
                type="text"
                name="cif"
                required
                value={formData.cif}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                placeholder="B12345678"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">
                Razón Social / Nombre Completo *
              </label>
              <input
                type="text"
                name="razonSocial"
                required
                value={formData.razonSocial}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                placeholder="Mi Empresa S.L."
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">
                Dirección Fiscal *
              </label>
              <input
                type="text"
                name="direccion"
                required
                value={formData.direccion}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                placeholder="Calle Principal, 123"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Código Postal *
                </label>
                <input
                  type="text"
                  name="codigoPostal"
                  required
                  value={formData.codigoPostal}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                  placeholder="28001"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-900 mb-1">
                  Ciudad *
                </label>
                <input
                  type="text"
                  name="ciudad"
                  required
                  value={formData.ciudad}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
                  placeholder="Madrid"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1">
                País *
              </label>
              <select
                name="pais"
                required
                value={formData.pais}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900"
              >
                <option value="ES">España</option>
                <option value="PT">Portugal</option>
                <option value="FR">Francia</option>
                <option value="IT">Italia</option>
                <option value="DE">Alemania</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? 'Enviando...' : 'Enviar Datos Fiscales'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

