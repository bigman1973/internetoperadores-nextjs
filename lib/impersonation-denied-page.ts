/**
 * Página mínima para navegaciones de documento denegadas durante una actuación.
 * Sustituye al JSON crudo para que la banda y la salida sigan visibles en todas
 * las pantallas. No concede nada: sólo ofrece volver atrás o la salida normal
 * (GET de estado + POST `salir` con el token CSRF del propio servidor).
 */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => HTML_ESCAPES[char])
}

/** Solo navegaciones de documento; las APIs y las peticiones RSC conservan JSON. */
export function isDocumentNavigation(path: string, method: string, headers: Headers): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  if (path === '/api' || path.startsWith('/api/')) return false
  if (headers.has('rsc') || headers.has('next-router-state-tree')) return false
  return (headers.get('accept') || '').includes('text/html')
}

const EXIT_SCRIPT = `(function(){
  var button=document.getElementById('io-exit');var message=document.getElementById('io-exit-message');
  if(!button)return;
  var key=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2)+'-exit';
  button.addEventListener('click',function(){
    button.disabled=true;message.textContent='Volviendo a tu usuario…';
    fetch('/api/admin/actuar-como',{headers:{Accept:'application/json'},cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('estado');return r.json();})
      .then(function(state){
        if(!state||typeof state.csrfToken!=='string')throw new Error('csrf');
        return fetch('/api/admin/actuar-como',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json','x-io-actuation-csrf':state.csrfToken},body:JSON.stringify({action:'salir',idempotencyKey:key})});
      })
      .then(function(r){return r.json().then(function(body){if(!r.ok||!body||body.ok!==true)throw new Error('salida');return body;});})
      .then(function(body){
        try{localStorage.setItem('io.actuation.changed',Date.now()+':'+Math.random());}catch(e){}
        var to=typeof body.redirectTo==='string'&&/^\\/(?![\\/\\\\])/.test(body.redirectTo)?body.redirectTo:'/admin';
        location.assign(to);
      })
      .catch(function(){button.disabled=false;message.textContent='No se pudo volver a tu usuario. Pulsa de nuevo para reintentar.';});
  });
})();`

export function renderActingDeniedPage(targetName: string): string {
  const name = escapeHtml(targetName.trim().slice(0, 120) || 'otra persona')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>No disponible durante la actuación</title>
<style>
  *{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#f9fafb;color:#0f172a}
  .band{position:sticky;top:0;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;padding:10px 24px;background:#c2410c;color:#fff;border-bottom:1px solid #9a3412;box-shadow:0 4px 12px rgba(0,0,0,.15)}
  .band p{margin:0;font-size:14px;font-weight:600}.band span{font-weight:400;color:#ffedd5}
  .band button{border:0;border-radius:8px;background:#fff;color:#9a3412;font-weight:700;font-size:14px;padding:9px 14px;cursor:pointer;min-height:40px}
  .band button:disabled{opacity:.6;cursor:wait}
  main{max-width:640px;margin:48px auto;padding:0 16px}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
  h1{margin:0 0 8px;font-size:22px}.card p{margin:0 0 16px;line-height:1.55;color:#475569}
  .back{display:inline-block;border:1px solid #cbd5e1;border-radius:8px;padding:9px 14px;color:#0f172a;text-decoration:none;font-weight:600;background:#fff;cursor:pointer;font-size:14px}
  #io-exit-message{min-height:20px;font-size:13px;color:#fff}
  @media (max-width:640px){.band{padding:10px 12px}.band span{display:none}main{margin-top:24px}}
</style>
</head>
<body>
<div class="band" role="status" aria-live="polite">
  <p>Estás actuando como ${name}<span> · Las acciones se realizan con los permisos de esta persona.</span></p>
  <div><button id="io-exit" type="button">Volver a mi usuario</button><div id="io-exit-message"></div></div>
</div>
<main>
  <section class="card" aria-labelledby="io-denied-title">
    <h1 id="io-denied-title">Esta pantalla no está disponible</h1>
    <p>Mientras actúas como otra persona sólo puedes usar las pantallas que esa persona tiene permitidas y que se pueden revisar con seguridad. Esta queda bloqueada y el intento se ha anotado en el registro.</p>
    <button class="back" type="button" onclick="history.length>1?history.back():location.assign('/admin/finanzas/modo-facil')">Volver a la pantalla anterior</button>
  </section>
</main>
<script>${EXIT_SCRIPT}</script>
</body>
</html>`
}
