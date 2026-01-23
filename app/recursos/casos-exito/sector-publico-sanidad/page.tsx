"use client";
import Link from 'next/link';
import EmpresaNav from '../../../../components/EmpresaNav';
import EmpresaFooter from '../../../../components/EmpresaFooter';

export default function CasoExitoPage() {
  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      {/* Hero del caso de éxito */}
      <div className="pt-8 pb-12 bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <Link href="/recursos/casos-exito" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-6 group">
              <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Casos de Éxito
            </Link>
            
            <div className="flex flex-wrap gap-3 mb-6">
              <span className="inline-flex items-center bg-gray-800 text-white px-4 py-2 rounded-full text-sm font-semibold">
                Sector Público
              </span>
              <span className="inline-flex items-center bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                Sanidad
              </span>
              <span className="inline-flex items-center bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold">
                En implementación
              </span>
            </div>
            
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
              Protección de datos sanitarios con ExaGrid para una administración autonómica
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed">
              Cómo una administración pública del sector sanitario decidió implementar ExaGrid como solución 
              de backup empresarial tras sufrir un ciberataque con robo de datos en uno de sus hospitales.
            </p>
          </div>
        </div>
      </div>

      {/* Imagen destacada */}
      <div className="container mx-auto px-4 sm:px-6 -mt-4 mb-12">
        <div className="max-w-4xl mx-auto">
          <div className="relative w-full h-[300px] sm:h-[400px] rounded-2xl overflow-hidden shadow-xl">
            <img 
              src="/images/casos-exito/sector-publico-sanidad.jpg" 
              alt="Centro de datos sanitario" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
          </div>
        </div>
      </div>

      {/* Contenido del caso de éxito */}
      <div className="container mx-auto px-4 sm:px-6 pb-16">
        <div className="max-w-4xl mx-auto">
          
          {/* Aviso de proyecto en curso */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-12">
            <div className="flex items-start gap-4">
              <div className="bg-blue-100 rounded-full p-2 flex-shrink-0">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-blue-900 mb-1">Proyecto en fase de implementación</h3>
                <p className="text-blue-800 text-sm">
                  Este proyecto se encuentra actualmente en fase de despliegue tras un exhaustivo proceso de análisis 
                  y estudios previos. Los resultados finales se publicarán una vez completada la implementación.
                </p>
              </div>
            </div>
          </div>

          {/* Resumen ejecutivo */}
          <div className="bg-gray-50 border-l-4 border-gray-800 p-6 sm:p-8 rounded-r-xl mb-12">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Contexto del proyecto</h2>
            <p className="text-gray-700 leading-relaxed">
              Una administración pública autonómica responsable de la gestión sanitaria de su territorio 
              sufrió un grave incidente de ciberseguridad: un ataque de ransomware a uno de sus hospitales 
              que resultó en el robo y cifrado de datos sensibles de pacientes. Este incidente, que tuvo 
              repercusión mediática y obligó a activar protocolos de crisis, evidenció las carencias en 
              la estrategia de backup y recuperación de datos del sistema sanitario público.
            </p>
          </div>

          {/* El incidente */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">El incidente que cambió todo</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              El ataque de ransomware afectó a sistemas críticos del hospital, incluyendo historiales clínicos, 
              sistemas de gestión de citas y bases de datos administrativas. Aunque se disponía de copias de 
              seguridad, el proceso de recuperación fue lento y complejo, revelando vulnerabilidades estructurales 
              en la estrategia de protección de datos.
            </p>

            <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">Problemas identificados tras el incidente:</h3>
              <ul className="space-y-3 text-gray-700">
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Backups sin aislamiento:</strong> Las copias de seguridad estaban accesibles desde la misma red que fue comprometida, permitiendo que el ransomware las cifrara también.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Tiempos de recuperación inaceptables:</strong> La restauración de sistemas críticos tardó varios días, afectando a la atención sanitaria.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Sin inmutabilidad:</strong> No existía ningún mecanismo que impidiera la modificación o eliminación de los backups por parte de atacantes.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Falta de verificación:</strong> No se realizaban pruebas periódicas de restauración, por lo que no se conocía el estado real de las copias.</span>
                </li>
                <li className="flex items-start">
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                  <span><strong>Cumplimiento normativo en riesgo:</strong> El incidente puso en evidencia posibles incumplimientos del RGPD y la normativa sanitaria de protección de datos.</span>
                </li>
              </ul>
            </div>
          </section>

          {/* La decisión */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">La decisión estratégica</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              Tras el incidente, la administración inició un proceso de análisis exhaustivo para redefinir 
              su estrategia de protección de datos. Durante más de dos años, se evaluaron diferentes soluciones, 
              se realizaron pruebas de concepto y se consultó con expertos del sector. El objetivo era claro: 
              implementar una solución que garantizara la recuperación de datos ante cualquier escenario, 
              incluidos ataques de ransomware sofisticados.
            </p>

            <div className="bg-gray-800 text-white rounded-xl p-6 mb-6">
              <h3 className="font-bold text-lg mb-4">¿Por qué ExaGrid?</h3>
              <p className="text-gray-300 leading-relaxed">
                Tras evaluar múltiples alternativas, la administración seleccionó ExaGrid por su arquitectura 
                única que combina almacenamiento en disco con una capa de retención inmutable (Retention Time-Lock). 
                Esta tecnología crea una copia de los backups que no puede ser modificada, cifrada ni eliminada 
                durante un período configurable, garantizando siempre un punto de recuperación limpio.
              </p>
            </div>
          </section>

          {/* La solución */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">La solución ExaGrid</h2>
            
            <p className="text-gray-700 leading-relaxed mb-8">
              La implementación de ExaGrid en el sistema sanitario autonómico abarca múltiples centros 
              hospitalarios y centros de atención primaria, creando una infraestructura de backup resiliente 
              y preparada para los ciberataques más sofisticados.
            </p>

            {/* Características clave */}
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Retention Time-Lock</h3>
                <p className="text-gray-600 text-sm">
                  Capa de retención inmutable que protege los backups contra modificación, cifrado o eliminación 
                  por parte de ransomware o usuarios malintencionados.
                </p>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Recuperación ultrarrápida</h3>
                <p className="text-gray-600 text-sm">
                  Landing Zone en disco que permite restauraciones hasta 20 veces más rápidas que las soluciones 
                  tradicionales basadas en cinta o deduplicación inline.
                </p>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Air Gap virtual</h3>
                <p className="text-gray-600 text-sm">
                  Aislamiento lógico de los datos de retención que impide el acceso desde la red de producción, 
                  simulando un air gap físico sin su complejidad operativa.
                </p>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-xl p-6">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Cumplimiento normativo</h3>
                <p className="text-gray-600 text-sm">
                  Arquitectura diseñada para cumplir con RGPD, ENS (Esquema Nacional de Seguridad) y normativas 
                  específicas del sector sanitario.
                </p>
              </div>
            </div>
          </section>

          {/* Resultados esperados */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Resultados esperados</h2>
            
            <p className="text-gray-700 leading-relaxed mb-6">
              Aunque el proyecto está actualmente en fase de implementación, los objetivos definidos 
              y los resultados de las pruebas de concepto permiten anticipar mejoras significativas:
            </p>
            
            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-blue-700 mb-2">&lt;2h</p>
                <p className="text-blue-800 font-medium">Tiempo objetivo de recuperación (RTO)</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-blue-700 mb-2">100%</p>
                <p className="text-blue-800 font-medium">Protección contra ransomware</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-blue-700 mb-2">30 días</p>
                <p className="text-blue-800 font-medium">Retención inmutable mínima</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-center">
                <p className="text-4xl font-bold text-blue-700 mb-2">ENS Alto</p>
                <p className="text-blue-800 font-medium">Nivel de cumplimiento objetivo</p>
              </div>
            </div>

            <div className="bg-orange-50 border-l-4 border-orange-500 rounded-r-xl p-6 sm:p-8">
              <svg className="w-10 h-10 text-orange-300 mb-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/>
              </svg>
              <p className="text-lg leading-relaxed text-gray-700 italic mb-4">
                "El incidente nos enseñó que no basta con tener backups; hay que tener backups que sobrevivan 
                a un ataque. ExaGrid nos da esa garantía con su tecnología de retención inmutable. 
                Ahora sabemos que, pase lo que pase, siempre tendremos un punto de recuperación limpio."
              </p>
              <p className="text-gray-500 font-medium">— Responsable de Ciberseguridad</p>
            </div>
          </section>

          {/* Tecnologías utilizadas */}
          <section className="mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">Tecnologías implementadas</h2>
            
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">ExaGrid</p>
                <p className="text-sm text-gray-600">Backup con Time-Lock</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Veeam</p>
                <p className="text-sm text-gray-600">Software de backup</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center hover:shadow-md transition-shadow">
                <p className="font-bold text-gray-900 mb-1">Replicación</p>
                <p className="text-sm text-gray-600">Entre centros de datos</p>
              </div>
            </div>
          </section>

          {/* Nota de confidencialidad */}
          <section className="mb-12">
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <p className="text-gray-600 text-sm">
                Por motivos de confidencialidad y seguridad, no publicamos el nombre de la administración ni 
                detalles específicos de la infraestructura. Si desea conocer más detalles sobre este proyecto 
                o solicitar referencias, estaremos encantados de facilitárselas bajo petición y previa 
                autorización del cliente.
              </p>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-gradient-to-r from-orange-500 to-orange-600 rounded-2xl p-8 sm:p-10 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4">¿Preocupado por la protección de tus datos?</h2>
            <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
              Podemos ayudarte a implementar una estrategia de backup resiliente con ExaGrid. 
              Solicita una auditoría gratuita y descubre cómo proteger tu organización contra ransomware.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a 
                href="https://wa.me/34900123456?text=Hola,%20me%20interesa%20una%20auditoría%20de%20backup%20con%20ExaGrid"
                className="inline-flex items-center justify-center bg-white text-orange-600 px-8 py-4 rounded-xl font-bold hover:bg-gray-100 transition-colors"
              >
                Solicitar Auditoría Gratuita
              </a>
              <Link 
                href="/soluciones/exagrid"
                className="inline-flex items-center justify-center border-2 border-white text-white px-8 py-4 rounded-xl font-bold hover:bg-white/10 transition-colors"
              >
                Conocer más sobre ExaGrid
              </Link>
            </div>
          </section>

        </div>
      </div>

      <EmpresaFooter />
    </div>
  );
}
