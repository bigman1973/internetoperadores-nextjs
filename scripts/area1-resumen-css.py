import re,sys
src=open(sys.argv[2] if len(sys.argv)>2 else 'maqueta_crm_resumen_aprobada.html').read()
css="\n".join(re.findall(r'<style>(.*?)</style>',src,re.S))
css=re.sub(r'/\*.*?\*/','',css,flags=re.S)
R='.io-ui.area1-resumen'
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
hdr="""/* Área 1 · Resumen del CRM. CSS copiado literal de maqueta_crm_resumen_aprobada.html (aprobada por Víctor),
   con todos los selectores bajo .io-ui.area1-resumen. Generado con: python3 scripts/area1-resumen-css.py app/admin/crm/area1-resumen.css (lee la maqueta); no editar a mano.
   Cuando la integradora publique components/io-ui (io-ui.css), se quitan de aquí las reglas repetidas
   y quedan solo las propias del Resumen (.g2, .g3, .item, .due, .pipe, .prow, .pbar, .stages, .q, .seg3, .ex, .searchbig, .subnav).
   Cambios respecto a la maqueta: sin modo oscuro automático (el panel es claro) y sin body::before. */
"""
open(sys.argv[1],'w').write(hdr+out+"\n")
