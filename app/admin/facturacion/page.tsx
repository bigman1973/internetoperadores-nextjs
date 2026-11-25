import FacturacionClient from './FacturacionClient'

export const dynamic = 'force-dynamic'

/**
 * Facturación (maqueta aprobada). El cálculo de cobro sigue siendo el de B7 y el resumen ISP;
 * esta pantalla solo los presenta. Los componentes anteriores se conservan por si hubiera que volver atrás.
 */
export default function FacturacionPage() {
  return <FacturacionClient />
}
