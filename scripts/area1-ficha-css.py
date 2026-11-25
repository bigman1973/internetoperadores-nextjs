import re,sys
src=open(sys.argv[2] if len(sys.argv)>2 else 'maqueta_crm_ficha_cliente_aprobada.html').read()
css="\n".join(re.findall(r'<style>(.*?)</style>',src,re.S))
css=re.sub(r'/\*.*?\*/','',css,flags=re.S)
R='.io-ui.area1-ficha'
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

# Quitar lo que ya da components/io-ui/io-ui.css (misma regla con .io-ui en lugar de .io-ui.area1-ficha).
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
hdr="""/* Área 1 · Ficha de cliente del CRM. CSS copiado literal de maqueta_crm_ficha_cliente_aprobada.html (aprobada por Víctor),
   con todos los selectores bajo .io-ui.area1-ficha. Generado con: python3 scripts/area1-ficha-css.py 'app/admin/crm/empresas/[id]/area1-ficha.css' <maqueta> (lee la maqueta); no editar a mano.
   Las reglas idénticas a components/io-ui/io-ui.css se quitan al generar: aquí quedan solo las propias
   de la ficha o las que la maqueta define distinto.
   Cambios respecto a la maqueta: sin modo oscuro automático (el panel es claro) y sin body::before. */
"""
open(sys.argv[1],'w').write(hdr+out+"\n")
print(f"reglas quitadas por repetidas con io-ui.css: {quitadas}")
