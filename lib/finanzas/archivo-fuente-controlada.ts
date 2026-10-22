const ID=/^[A-Za-z0-9!_.~-]{4,220}$/
/** Biblioteca explicitada y verificada B1; ninguna búsqueda ni escritura Graph. */
export function bibliotecaFinancieraConfigurada():string|null{
 const primary=process.env.SHAREPOINT_DRIVE_ID?.trim(),alias=process.env.DRIVE_ID?.trim()
 if(primary&&alias&&primary!==alias)throw new Error('BIBLIOTECA_FINANCIERA_CONFLICTIVA')
 const value=primary||alias
 return value&&ID.test(value)?value:null
}
export function archivoRecibidaControlado(row:{oneDriveDriveId?:string|null;oneDriveItemId?:string|null;archivoOneDrive?:string|null}|null|undefined):{driveId:string;itemId:string}|null{
 if(!row||!ID.test(row.oneDriveItemId||''))return null
 if(ID.test(row.oneDriveDriveId||''))return{driveId:row.oneDriveDriveId!,itemId:row.oneDriveItemId!}
 // El escritor histórico conserva la ruta completa dentro de esta biblioteca.
 // Sin esa prueba exacta no inferimos drive ni un archivo descargable.
 const prefix='2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/'
 const path=row.archivoOneDrive
 if(typeof path!=='string'||!path.startsWith(prefix)||path.includes('..')||path.includes('://')||!/^\d{4}\//.test(path.slice(prefix.length)))return null
 const driveId=bibliotecaFinancieraConfigurada()
 return driveId?{driveId,itemId:row.oneDriveItemId!}:null
}
