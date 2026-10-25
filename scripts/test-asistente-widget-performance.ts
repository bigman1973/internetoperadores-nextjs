import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const launcherPath = resolve(process.cwd(), 'components/asistente/AssistantLauncher.tsx')
const panelPath = resolve(process.cwd(), 'components/asistente/AssistantPanel.tsx')
const launcher = readFileSync(launcherPath, 'utf8')
const panel = readFileSync(panelPath, 'utf8')

const indexOf = (source: string, value: string) => {
  const index = source.indexOf(value)
  assert.notEqual(index, -1, `No se encontró: ${value}`)
  return index
}

assert.match(launcher, /disabled=\{!hydrated\}/, 'El botón permanece deshabilitado hasta la hidratación.')
assert.match(launcher, /role="dialog" aria-modal="true" aria-labelledby="asistente-titulo"/, 'La carcasa inmediata conserva el diálogo modal etiquetado.')
assert.match(launcher, /aria-live="polite">Preparando el asistente…<\//, 'La carcasa inmediata comunica su estado sin ocultarlo.')
assert.match(launcher, /if \(event\.key === 'Escape'\)[\s\S]*?close\(\)/, 'La carcasa inmediata permite cerrar con Escape.')
assert.match(launcher, /document\.addEventListener\('keydown', onKeyDown\)/, 'La carcasa inmediata instala la trampa de foco.')
assert.match(launcher, /launcherRef\.current\?\.focus\(\)/, 'El cierre devuelve el foco al lanzador.')
assert.match(launcher, /const firstFrame = window\.requestAnimationFrame\([\s\S]*?secondFrame = window\.requestAnimationFrame\(/, 'La importación espera dos frames para dejar pintar el primer feedback.')
assert.match(launcher, /secondFrame = window\.requestAnimationFrame\([\s\S]*?void loadPanel\(\)/, 'La importación del panel ocurre después de los frames de paint.')
const openingEffect = launcher.slice(indexOf(launcher, 'const firstFrame = window.requestAnimationFrame('), indexOf(launcher, '  useEffect(() => {\n    if (!open || panelVisible) return\n    const focusCloseButton'))
assert.ok(indexOf(openingEffect, 'void loadPanel()') > indexOf(openingEffect, 'secondFrame = window.requestAnimationFrame('), 'El import no se solicita antes del segundo frame.')
assert.ok(indexOf(openingEffect, 'setPanelVisible(true)') > indexOf(openingEffect, 'void loadPanel()'), 'El panel pesado se monta sólo tras completar la importación.')
assert.match(launcher, /\{Panel && open && panelVisible \? \(/, 'El panel pesado queda fuera de la primera confirmación de apertura.')

const clickStart = indexOf(launcher, 'onClick={() => {')
const clickEnd = launcher.indexOf('        className=', clickStart)
assert.notEqual(clickEnd, -1, 'No se encontró el final del controlador de clic.')
const clickHandler = launcher.slice(clickStart, clickEnd)
assert.doesNotMatch(clickHandler, /loadPanel\(|import\('\.\/AssistantPanel'\)/, 'El clic urgente sólo abre la carcasa; no importa ni monta el panel.')
assert.doesNotMatch(launcher, /\/api\/asistente\//, 'El lanzador no inicia cargas API.')
assert.match(launcher, /onPointerEnter=\{scheduleIdleLoad\}/, 'La precarga queda limitada a una intención del usuario.')
assert.match(launcher, /window\.setTimeout\([\s\S]*?, 4500\)/, 'La intención mantiene el retardo de protección de LCP/TBT.')

assert.match(panel, /if \(event\.key === 'Escape'\)[\s\S]*?onClose\(\)/, 'El panel completo conserva Escape.')
assert.match(panel, /document\.addEventListener\('keydown', onKeyDown\)/, 'El panel completo conserva su trampa de foco.')
assert.match(panel, /void loadConfig\(\)/, 'La configuración sigue iniciándose al montar el panel, no desde el lanzador.')

console.log(JSON.stringify({
  ok: true,
  fixture: 'synthetic-static-contract',
  firstFeedbackBeforePanelImport: true,
  shellDialogAndFocusSafety: true,
  launcherApiCalls: 0,
  protectedBehaviours: ['hydration-disabled', 'Escape', 'focus-trap', 'focus-return'],
}))
