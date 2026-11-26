import { spawn } from 'node:child_process'
import { MAX_FILE_BYTES } from './documentos-panel-core'
// pdf-parse 1.1.1 can emit asynchronous PDFJS errors after rejecting a malformed
// PDF. A finite subprocess contains them; no OCR, network or provider involved.
const worker = `
let chunks=[], size=0;
process.on('unhandledRejection',()=>process.exit(2));
process.on('uncaughtException',()=>process.exit(2));
process.stdin.on('data',chunk=>{size+=chunk.length;if(size>4194304)process.exit(3);chunks.push(chunk)});
process.stdin.on('end',async()=>{
 try {
  const parse=require(process.argv[1]);
  const result=await parse(Uint8Array.from(Buffer.concat(chunks,size)),{max:40});
  const text=String(result.text||'').replace(/\\u0000/g,'').slice(0,12000);
  process.stdout.write(JSON.stringify({text}));
 } catch { process.exitCode=2 }
});
`
export async function readDocumentosPanelPdfText(bytes: Buffer): Promise<string> {
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('PDF_LIMIT')
  const parserPath = require.resolve('pdf-parse/lib/pdf-parse.js')
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--max-old-space-size=192', '-e', worker, parserPath], { stdio: ['pipe','pipe','pipe'], env: { PATH: process.env.PATH, NODE_ENV: 'production' } })
    const chunks: Buffer[] = []; let size = 0; let settled = false
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error('PDF_TIMEOUT')) }, 10000)
    const finish = (error?: Error, text = '') => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(text) }
    child.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 128 * 1024) { child.kill('SIGKILL'); finish(new Error('PDF_OUTPUT_LIMIT')) } else chunks.push(chunk) })
    // Never expose provider/document/parser diagnostics to the HTTP response.
    child.stderr.on('data', () => undefined)
    child.on('error', error => finish(error))
    child.stdin.on('error', () => undefined)
    child.on('close', code => {
      if (code !== 0) return finish(new Error('PDF_MANUAL_REQUIRED'))
      try {
        // Old PDFJS can print a warning before JSON. Require a complete final JSON
        // object and only accept bounded text from our own local worker.
        const output = Buffer.concat(chunks).toString('utf8'); const at = output.lastIndexOf('{"text":')
        const value = JSON.parse(output.slice(at))
        if (at < 0 || typeof value.text !== 'string' || value.text.length > 12000) throw new Error('PDF_RESULT_INVALID')
        finish(undefined, value.text)
      } catch { finish(new Error('PDF_MANUAL_REQUIRED')) }
    })
    child.stdin.end(bytes)
  })
}
