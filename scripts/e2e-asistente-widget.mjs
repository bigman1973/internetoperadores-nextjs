#!/usr/bin/env node
/**
 * Comprobación E2E manual/automatizable del widget público.
 *
 * Requiere Playwright disponible en el entorno que lo ejecute; no instala
 * dependencias. Uso previsto para el padre tras integrar en staging/local:
 *   ASSISTANT_E2E_BASE_URL=http://127.0.0.1:3000 node scripts/e2e-asistente-widget.mjs
 *
 * No usa identidades, cookies ni datos reales. Todos los textos son sintéticos.
 */
const baseUrl = process.env.ASSISTANT_E2E_BASE_URL
if (!baseUrl) {
  console.error('ASSISTANT_E2E_BASE_URL es obligatoria (por ejemplo, http://127.0.0.1:3000).')
  process.exit(2)
}

let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  console.error('Playwright no está disponible. Ejecuta este guion sólo en el entorno del padre que ya lo tenga; no instales dependencias en este worktree.')
  process.exit(2)
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 320, height: 740 } })
try {
  await page.goto(new URL('/', baseUrl).toString(), { waitUntil: 'networkidle' })
  const launcher = page.getByRole('button', { name: /abrir asistente virtual/i })
  await launcher.waitFor()
  await launcher.click()

  const dialog = page.getByRole('dialog', { name: /asistente de ia/i })
  await dialog.waitFor()
  await dialog.getByText(/asistente de ia/i).waitFor()
  await dialog.getByRole('link', { name: /política de privacidad/i }).first().waitFor()
  await dialog.getByRole('button', { name: /hablar con una persona/i }).first().waitFor()

  const firstFocus = await page.evaluate(() => document.activeElement?.id)
  if (firstFocus !== 'asistente-mensaje') throw new Error(`Foco inicial inesperado: ${firstFocus}`)
  await page.keyboard.press('Shift+Tab')
  const afterReverseTab = await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.id)
  if (afterReverseTab !== 'Cerrar asistente') throw new Error(`El foco no queda atrapado al retroceder: ${afterReverseTab}`)
  await page.keyboard.press('Tab')
  const afterForwardTab = await page.evaluate(() => document.activeElement?.id)
  if (afterForwardTab !== 'asistente-mensaje') throw new Error(`El foco no vuelve al primer control: ${afterForwardTab}`)

  const overflowsAt320 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (overflowsAt320) throw new Error('Existe scroll horizontal a 320 px')
  await page.setViewportSize({ width: 430, height: 860 })
  const overflowsAt430 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  if (overflowsAt430) throw new Error('Existe scroll horizontal a 430 px')

  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /abrir asistente virtual/i }).waitFor()
  console.log('E2E_WIDGET_OK: transparencia IA, privacidad, humano visible, foco, Escape y 320–430 px.')
} finally {
  await browser.close()
}
