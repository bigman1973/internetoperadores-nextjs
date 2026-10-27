import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const source=readFileSync(new URL('../app/api/admin/finanzas/conciliar/confirming-inventario/route.ts',import.meta.url),'utf8')
const provider=readFileSync(new URL('../lib/finanzas/sync-jobs/providers/onedrive/provider.ts',import.meta.url),'utf8')
const legacy=readFileSync(new URL('../app/api/admin/finanzas/clientes/ggcc-draxton/sync-confirmings/route.ts',import.meta.url),'utf8')
test('revisión sólo staging, ACL viva y directorio fijo, sin importación ni DML',()=>{
 assert.match(source,/await assertPrototypeStaging\(\)/)
 assert.match(source,/requireB4FinanceAccess\('lectura', await getServerSession\(authOptions\)\)/)
 assert.match(source,/listFolderContents\(library\.driveId, root, true\)/)
 assert.match(source,/CARPETAS\.CONFIRMING_DRAXTON/)
 assert.match(source,/\.includes\('vola_finance'\)/)
 assert.doesNotMatch(source,/\$executeRaw|(?:prisma|tx)\.\w+\.(?:create|update|delete)\(|parseConfirmingFile|confirmarB4|fetch\([^)]*https?:\/\/(?!graph\.microsoft\.com)/)
 assert.match(source,/POST\(\).*405/)
})
test('descarga con clave de catálogo verificada y sin aceptar ruta, drive o item externo',()=>{
 assert.match(source,/key !== 'archivo'/)
 assert.match(source,/\^\[a-f0-9\]\{24\}\$/)
 assert.match(source,/catalog\.findIndex/)
 assert.match(source,/downloadFile\(library\.driveId, files\[index\]\.id\)/)
 assert.match(source,/20 \* 1024 \* 1024/)
 assert.match(source,/'Cache-Control': 'private, no-store, max-age=0'/)
 assert.match(source,/'X-Content-Type-Options': 'nosniff'/)
})
test('inventario general recursivo y bloqueo del POST antiguo se conservan',()=>{
 assert.match(provider,/listFolderContents\(driveId, pathFor\(key, this\.root\), key !== 'raiz'\)/)
 assert.match(legacy,/C9_CONFIRMING_REQUIERE_CLASIFICACION_Y_CONFIRMACION_HUMANA/)
 assert.match(legacy,/export async function POST\(_req: NextRequest\)/)
})
