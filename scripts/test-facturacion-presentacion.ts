/**
 * Presentación DOM real con DTOs B7/ISP validados y guardia de sólo lectura.
 * Ejecutar: pnpm exec tsx scripts/test-facturacion-presentacion.ts
 * No arranca la app ni necesita credenciales, red o BD. Requiere Chromium y
 * Python Playwright locales; CSS y fuentes se omiten deliberadamente.
 * Cubre ACL exacta por área AND superficie (negativos y positivo), preview,
 * total desconocido/cero conocido y exclusiones ISP de fecha/importe para
 * facturas y remesas, con columnas, subtotal, cuadre, alertas y SVG reales.
 */
import { runFacturacionDomTests } from './test-facturacion-interacciones'

runFacturacionDomTests('presentacion').catch(error => {
  console.error(error)
  process.exitCode = 1
})
