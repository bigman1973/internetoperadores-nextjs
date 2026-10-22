import assert from 'node:assert/strict'
import {archivoRecibidaControlado,bibliotecaFinancieraConfigurada} from '../lib/finanzas/archivo-fuente-controlada'
const originalPrimary=process.env.SHAREPOINT_DRIVE_ID,originalAlias=process.env.DRIVE_ID
try{
 process.env.SHAREPOINT_DRIVE_ID='b!biblioteca_sintetica';delete process.env.DRIVE_ID
 const path='2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/2026/4. Trimestre 1 2026/Factura sintetica.pdf'
 const row={oneDriveItemId:'01SYNTHETICITEM',archivoOneDrive:path}
 assert.deepEqual(archivoRecibidaControlado(row),{driveId:'b!biblioteca_sintetica',itemId:'01SYNTHETICITEM'})
 assert.equal(archivoRecibidaControlado({...row,archivoOneDrive:'https://externa.invalid/factura.pdf'}),null)
 assert.equal(archivoRecibidaControlado({...row,archivoOneDrive:path.replace('/2026/','/2026/../')}),null)
 assert.equal(archivoRecibidaControlado({...row,archivoOneDrive:'Otra biblioteca/2026/Factura.pdf'}),null)
 assert.equal(archivoRecibidaControlado({...row,oneDriveItemId:'../../item'}),null)
 assert.deepEqual(archivoRecibidaControlado({...row,oneDriveDriveId:'b!fuente_b1_explicita',archivoOneDrive:null}),{driveId:'b!fuente_b1_explicita',itemId:'01SYNTHETICITEM'})
 process.env.DRIVE_ID='b!biblioteca_diferente';assert.throws(()=>bibliotecaFinancieraConfigurada(),/CONFLICTIVA/)
 delete process.env.SHAREPOINT_DRIVE_ID;delete process.env.DRIVE_ID
 assert.equal(archivoRecibidaControlado(row),null)
 console.log('Fuentes de archivo: identidad explícita, ruta histórica verificada y rechazo de ambigüedad/URL/ruta ajena correctos')
}finally{
 if(originalPrimary===undefined)delete process.env.SHAREPOINT_DRIVE_ID;else process.env.SHAREPOINT_DRIVE_ID=originalPrimary
 if(originalAlias===undefined)delete process.env.DRIVE_ID;else process.env.DRIVE_ID=originalAlias
}
