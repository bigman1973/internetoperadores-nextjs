'use client'

import Link from 'next/link'

export default function PagoCanceladoPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-lg w-full">
        <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago cancelado</h1>
        <p className="text-gray-600 mb-6">
          Has cancelado el proceso de pago. No se ha realizado ningún cargo.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          Si has tenido algún problema o necesitas ayuda, no dudes en contactar con nuestro equipo.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => window.history.back()}
            className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
          >
            Volver a intentar
          </button>
          <Link href="/" className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
