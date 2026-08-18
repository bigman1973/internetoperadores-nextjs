'use client';
export default function HaciendaPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">AAPP - Hacienda</h1>
      <p className="text-gray-500 mb-8">Gestion de obligaciones fiscales con la Agencia Tributaria</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center">
        <p className="text-amber-800 font-medium text-lg mb-2">Proximamente</p>
        <p className="text-amber-600 text-sm">Esta seccion se habilitara para gestionar declaraciones trimestrales (IVA, IRPF, IS), calendario fiscal y notificaciones de Hacienda.</p>
      </div>
    </div>
  );
}
