'use client';

import { useState, useEffect } from 'react';

interface Bloque {
  bloque: string;
  preguntas: string[];
}

interface RespuestaGuardada {
  bloque: string;
  numeroPregunta: number;
  pregunta: string;
  respuesta: string;
}

interface CuestionarioData {
  id: string;
  nombreEmpresa: string;
  sector: string;
  titulo: string;
  descripcion: string;
  preguntas: Bloque[];
  estado: string;
  respuestas: RespuestaGuardada[];
}

export default function CuestionarioPublicoClient({ token }: { token: string }) {
  const [data, setData] = useState<CuestionarioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [bloqueActual, setBloqueActual] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [completado, setCompletado] = useState(false);

  useEffect(() => {
    fetchCuestionario();
  }, [token]);

  const fetchCuestionario = async () => {
    try {
      const res = await fetch(`/api/cuestionario/${token}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Este cuestionario no existe o el enlace no es válido.');
        } else {
          setError('Error al cargar el cuestionario.');
        }
        return;
      }
      const cuestionario = await res.json();
      setData(cuestionario);

      // Si ya está completado, mostrar las respuestas
      if (cuestionario.estado === 'COMPLETADO') {
        setCompletado(true);
        const respPrevias: Record<string, string> = {};
        cuestionario.respuestas.forEach((r: RespuestaGuardada) => {
          respPrevias[`${r.bloque}__${r.pregunta}`] = r.respuesta;
        });
        setRespuestas(respPrevias);
      }
    } catch (err) {
      setError('Error de conexión. Inténtelo de nuevo más tarde.');
    } finally {
      setLoading(false);
    }
  };

  const handleRespuesta = (bloque: string, pregunta: string, valor: string) => {
    setRespuestas(prev => ({
      ...prev,
      [`${bloque}__${pregunta}`]: valor,
    }));
  };

  const enviarRespuestas = async () => {
    if (!data) return;
    setEnviando(true);

    // Construir array de respuestas
    const respuestasArray: { bloque: string; pregunta: string; respuesta: string }[] = [];
    data.preguntas.forEach((bloque) => {
      bloque.preguntas.forEach((pregunta) => {
        respuestasArray.push({
          bloque: bloque.bloque,
          pregunta,
          respuesta: respuestas[`${bloque.bloque}__${pregunta}`] || '',
        });
      });
    });

    try {
      const res = await fetch(`/api/cuestionario/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ respuestas: respuestasArray }),
      });

      if (res.ok) {
        setCompletado(true);
      } else {
        const errData = await res.json();
        alert(errData.error || 'Error al enviar las respuestas');
      }
    } catch (err) {
      alert('Error de conexión. Inténtelo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  // Guardar en localStorage para no perder progreso
  useEffect(() => {
    if (Object.keys(respuestas).length > 0 && !completado) {
      localStorage.setItem(`cuestionario_${token}`, JSON.stringify(respuestas));
    }
  }, [respuestas, token, completado]);

  // Recuperar de localStorage
  useEffect(() => {
    if (!completado) {
      const saved = localStorage.getItem(`cuestionario_${token}`);
      if (saved) {
        try {
          setRespuestas(JSON.parse(saved));
        } catch {}
      }
    }
  }, [token, completado]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Cargando cuestionario...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (completado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Cuestionario completado</h1>
          <p className="text-gray-500 mb-4">
            Gracias por completar el cuestionario técnico. Nuestro equipo revisará sus respuestas y le contactará con una propuesta personalizada.
          </p>
          <p className="text-sm text-gray-400">Internet Operadores</p>
        </div>
      </div>
    );
  }

  const bloques = data.preguntas;
  const bloqueData = bloques[bloqueActual];
  const totalBloques = bloques.length;
  const progreso = ((bloqueActual + 1) / totalBloques) * 100;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-lg font-bold text-gray-900">{data.titulo}</h1>
              <p className="text-xs text-gray-500">{data.nombreEmpresa}</p>
            </div>
            <span className="text-sm text-gray-400">
              {bloqueActual + 1} / {totalBloques}
            </span>
          </div>
          {/* Barra de progreso */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-orange-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-6 md:p-8">
          {/* Título del bloque */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">{bloqueData.bloque}</h2>
            <p className="text-sm text-gray-500">
              Responda a las siguientes preguntas con el mayor detalle posible.
            </p>
          </div>

          {/* Preguntas */}
          <div className="space-y-6">
            {bloqueData.preguntas.map((pregunta, idx) => {
              const key = `${bloqueData.bloque}__${pregunta}`;
              return (
                <div key={idx}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {idx + 1}. {pregunta}
                  </label>
                  <textarea
                    value={respuestas[key] || ''}
                    onChange={(e) => handleRespuesta(bloqueData.bloque, pregunta, e.target.value)}
                    placeholder="Escriba su respuesta aquí..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 min-h-[80px] resize-y"
                  />
                </div>
              );
            })}
          </div>

          {/* Navegación */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <button
              onClick={() => setBloqueActual(prev => Math.max(0, prev - 1))}
              disabled={bloqueActual === 0}
              className="px-6 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Anterior
            </button>

            {bloqueActual < totalBloques - 1 ? (
              <button
                onClick={() => setBloqueActual(prev => Math.min(totalBloques - 1, prev + 1))}
                className="px-6 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                Siguiente →
              </button>
            ) : (
              <button
                onClick={enviarRespuestas}
                disabled={enviando}
                className="px-6 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : '✓ Enviar Cuestionario'}
              </button>
            )}
          </div>
        </div>

        {/* Indicador de guardado automático */}
        <p className="text-center text-xs text-gray-400 mt-4">
          Sus respuestas se guardan automáticamente en su navegador. Puede cerrar y continuar más tarde.
        </p>
      </div>
    </div>
  );
}
