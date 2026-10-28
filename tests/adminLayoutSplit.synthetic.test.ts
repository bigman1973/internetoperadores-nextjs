import assert from 'node:assert/strict'
import fs from 'node:fs'
import { loadAdminUserPreviewSelector } from '../components/admin/AdminUserPreviewSelectorLoader'

async function main() {
  const selector = await loadAdminUserPreviewSelector()
  assert.equal(typeof selector.default, 'function', 'el selector se resuelve como módulo diferido')

  const header = fs.readFileSync('components/admin/AdminHeader.tsx', 'utf8')
  const sidebar = fs.readFileSync('components/admin/AdminSidebar.tsx', 'utf8')
  const selectorSource = fs.readFileSync('components/admin/AdminUserPreviewSelector.tsx', 'utf8')

  assert.match(header, /loadAdminUserPreviewSelector/, 'la cabecera conserva una frontera de importación para el selector')
  assert.match(header, /ssr:\s*false/, 'el panel inicialmente cerrado no se emite ni se precarga desde SSR')
  assert.doesNotMatch(header, /from '\.\/AdminSidebar'/, 'la cabecera no arrastra el módulo completo de navegación')
  assert.match(header, /from '\.\/AdminSidebarContext'/, 'la cabecera sólo obtiene el contexto pequeño de apertura')
  assert.match(sidebar, /from '\.\/AdminSidebarContext'/, 'la barra reutiliza el mismo contexto pequeño')
  assert.match(selectorSource, /cache:\s*'no-store'/, 'la lista bajo previsualización no reutiliza una foto de autorización en caché')

  console.log('admin layout split synthetic test: ok')
}

void main()
