import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';

const src = fs.readFileSync('middleware.js', 'utf8');
const code = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const module = { exports: {} as any };
let authenticated = true;
let active = true;
let read = true;
let write = false;
vm.runInNewContext(code, { module, exports: module.exports, process: { env: {} }, console, require: (name: string) => {
  if (name === 'next/server') return { NextResponse };
  if (name === 'next-auth/jwt') return { getToken: async () => authenticated ? { id: '1', userType: 'admin' } : null };
  if (name === '@/lib/prisma') return { default: {
    usuarioAdmin: { findUnique: async () => ({ activo: active, rol: 'VISOR', roles: [], permisos: [{ lectura: read, escritura: write, area: { codigo: 'admin.finanzas.analitica_costes' } }, { lectura: true, escritura: false, area: { codigo: 'admin.personal' } }] }) },
    permisoArea: { findMany: async () => [] },
  } };
  throw new Error('Módulo inesperado');
}});
async function status(path: string, method = 'GET') {
  return (await module.exports.middleware(new NextRequest(`https://panel.test${path}`, { method }))).status;
}
async function main() {
  for (const path of ['/api/admin/finanzas/rentabilidad', '/api/admin/finanzas/rentabilidad/servicios']) {
    assert.equal(await status(path), 200);
    assert.equal(await status(path, 'POST'), 403);
    write = true;
    assert.equal(await status(path, 'POST'), 200);
    write = false;
    read = false;
    assert.equal(await status(path), 403);
    read = true;
    active = false;
    assert.equal(await status(path), 401);
    active = true;
    authenticated = false;
    assert.equal(await status(path), 401);
    authenticated = true;
  }
  assert.equal(await status('/api/admin/finanzas/desconocido'), 403);
  console.log('Middleware de rentabilidad: rutas registradas, lectura/escritura existentes respetadas, sesión y usuario activo requeridos; cero cambios de permisos.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
