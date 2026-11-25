import re,sys
src=open(sys.argv[2] if len(sys.argv)>2 else 'maqueta_conciliar_aprobada.html').read()
css="\n".join(re.findall(r'<style>(.*?)</style>',src,re.S))
css=re.sub(r'/\*.*?\*/','',css,flags=re.S)
R='.io-ui.area3-conciliar'
def scope_sel(sel):
    out=[]
    for s in sel.split(','):
        s=s.strip()
        if not s: continue
        if s in(':root',':root[data-theme="dark"]','body'):
            out.append(R if s!=':root[data-theme="dark"]' else R+'[data-theme="dark"]'); continue
        if s.startswith('body::before'): return None
        if s.startswith('*'): out.append(f'{R} {s}, {R}'); continue  # *{box-sizing}
        if s.startswith(':focus-visible'): out.append(f'{R} {s}'); continue
        out.append(f'{R} {s}')
    return ', '.join(out)
def walk(block):
    res=[];i=0
    while i<len(block):
        j=block.find('{',i)
        if j<0: break
        head=block[i:j].strip()
        # find matching brace
        d=0;k=j
        while True:
            if block[k]=='{': d+=1
            elif block[k]=='}':
                d-=1
                if d==0: break
            k+=1
        body=block[j+1:k]
        if head.startswith('@media'):
            if 'prefers-color-scheme:dark' in head.replace(' ',''): i=k+1; continue  # el panel es claro: sin modo oscuro automático
            inner=walk(body)
            if inner: res.append(head+'{'+inner+'}')
        else:
            s=scope_sel(head)
            if s: res.append(s+'{'+body.strip()+'}')
        i=k+1
    return '\n'.join(res)
out=walk(css)

# Quitar lo que ya da components/io-ui/io-ui.css (misma regla con .io-ui en lugar de .io-ui.area3-conciliar).
import os
def norm(x): return re.sub(r'\s+','',x).replace('"',"'")
def reglas(block, media=''):
    res=[];i=0
    while i<len(block):
        j=block.find('{',i)
        if j<0: break
        head=block[i:j].strip();d=0;k=j
        while True:
            if block[k]=='{': d+=1
            elif block[k]=='}':
                d-=1
                if d==0: break
            k+=1
        body=block[j+1:k]
        if head.startswith('@media'): res+=reglas(body, norm(head))
        else: res.append((media, head, body))
        i=k+1
    return res
IOUI=os.path.join(os.path.dirname(__file__),'..','components','io-ui','io-ui.css')
quitadas=0
if os.path.exists(IOUI):
    base=re.sub(r'/\*.*?\*/','',open(IOUI).read(),flags=re.S)
    conocidas={(m,norm(h),norm(b)) for m,h,b in reglas(base)}
    def filtra(block):
        global quitadas
        res=[]
        for m,h,b in reglas(block):
            if (m,norm(h.replace(R,'.io-ui')),norm(b)) in conocidas: quitadas+=1; continue
            res.append((m,h,b))
        return res
    propias=filtra(out)
    top=[f'{h}{{{b}}}' for m,h,b in propias if not m]
    medias={}
    for m,h,b in propias:
        if m: medias.setdefault(m,[]).append(f'{h}{{{b}}}')
    out='\n'.join(top+[f'{m}{{{"".join(v)}}}' for m,v in medias.items()])
out+="\n.io-ui.area3-conciliar .kv{grid-template-columns:110px minmax(0,1fr)}\n.io-ui.area3-conciliar .kv .st{white-space:normal;overflow-wrap:anywhere}"  # 400 px: la columna 1fr no encogía con textos largos
hdr="""/* Área 3 · Conciliar. CSS copiado literal de maqueta_conciliar_aprobada.html (aprobada por Víctor),
   con todos los selectores bajo .io-ui.area3-conciliar. Generado con: python3 scripts/area3-conciliar-css.py app/admin/finanzas/conciliar/area3-conciliar.css <maqueta>; no editar a mano.
   Las reglas idénticas a components/io-ui/io-ui.css se quitan al generar: aquí quedan solo las propias de Conciliar
   (.steps, .step, .lay, .side, .mv, .st, .sug, .conf, .acts, .chain, .ex, .chips, .kv, .replaces, .btn.small, .kpi .v.g/.w/.b).
   Cambios respecto a la maqueta: sin modo oscuro automático, sin body::before y .kv con minmax(0,1fr) y chips largos con salto de línea para que no desborde a 400 px. */
"""
open(sys.argv[1],'w').write(hdr+out+"\n")
print(f"reglas quitadas por repetidas con io-ui.css: {quitadas}")
