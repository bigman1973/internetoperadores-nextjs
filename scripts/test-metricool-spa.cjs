'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path'),ts=require('typescript'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function compile(file,req=require){const js=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;const module={exports:{}};vm.runInNewContext(js,{module,exports:module.exports,require:req});return module.exports;}
const policy=compile('components/public/metricool-policy.ts'),coordinator=compile('components/public/metricool-coordinator.ts');
const {observeMetricoolSpa}=compile('components/public/metricool-spa-observer.ts',n=>n==='./metricool-policy'?policy:n==='./metricool-coordinator'?coordinator:require(n));
function browser(initial='/',ssr=true){
 let loc=new URL(initial,'https://test.invalid'),signals=[],tasks=[],events=new Map(),scripts=[],ctx;
 const win={get location(){return loc},innerWidth:1200,innerHeight:800,history:{pushState:function(a,b,u){if(u!=null)loc=new URL(u,loc)},replaceState:function(a,b,u){if(u!=null)loc=new URL(u,loc)}},queueMicrotask:f=>tasks.push(f),addEventListener:(k,f)=>events.set(k,f),removeEventListener:(k,f)=>{if(events.get(k)===f)events.delete(k)},document:{get location(){return loc},referrer:'',createElement:()=>({setAttribute(){},remove(){scripts=scripts.filter(x=>x!==this)}}),getElementById:id=>scripts.find(s=>s.id===id),querySelectorAll:()=>scripts.filter(s=>s.src==='https://tracker.metricool.com/resources/be.js'),getElementsByTagName:()=>[win.document.head]}};
 win.document.head={appendChild(s){scripts.push(s);if(s.text)vm.runInContext(s.text,ctx);return s}};
 ctx=vm.createContext({window:win,document:win.document,Image:class{set src(v){signals.push(new URL(v).searchParams.get('u'))}},get beTracker(){return win.beTracker},set beTracker(t){win.beTracker=t}});
 function execute(s){const el=win.document.createElement('script');el.text=s;win.document.head.appendChild(el)}
 if(ssr){execute(coordinator.METRICOOL_COORDINATOR);execute(policy.METRICOOL_INITIAL_SNIPPET)}
 function load(){vm.runInContext(fs.readFileSync('/home/ubuntu/metricool-20261105-be.js','utf8'),ctx);for(const s of [...scripts])if(s.src){s.onload?.();s.onreadystatechange?.()}}
 return {win,signals,events,get scripts(){return scripts},load,flush(){while(tasks.length)tasks.shift()()},move(p){win.history.pushState({},'',p);this.flush()},back(p){loc=new URL(p,loc);events.get('popstate')?.()}};
}
const b=browser();b.load();assert.equal(b.signals.length,1);const orig=b.win.history.pushState,off=observeMetricoolSpa(b.win);assert.equal(b.signals.length,1);b.move('/tarifas/empresa');assert.equal(b.signals.length,2);b.move('/tarifas/empresa');b.move('/tarifas/empresa#seccion');assert.equal(b.signals.length,2);b.move('/tarifas/empresa?tipo=fibra');assert.equal(b.signals.length,3);b.back('/');assert.equal(b.signals.length,4);off();const off2=observeMetricoolSpa(b.win);assert.equal(b.signals.length,4);off2();assert.equal(b.win.history.pushState,orig);
const late=browser();observeMetricoolSpa(late.win);late.move('/politica-cookies');assert.equal(late.signals.length,0);late.load();assert.equal(late.signals.length,1);late.move('/');assert.equal(late.signals.length,2,'First route after literal callback is not lost');
const early=browser();early.move('/admin');early.load();assert.equal(early.signals.length,0,'Initial callback refuses private path even before React effect');
const reentry=browser('/login',false);observeMetricoolSpa(reentry.win);assert.equal(reentry.scripts.length,0);reentry.move('/');const out=observeMetricoolSpa(reentry.win);reentry.load();assert.equal(reentry.signals.length,1);reentry.move('/login');assert.equal(reentry.signals.length,1);out();reentry.move('/politica-privacidad');observeMetricoolSpa(reentry.win);assert.equal(reentry.signals.length,2);assert.equal(reentry.scripts.filter(s=>s.src).length,1,'One external tracker per loaded document');
const pending=browser();observeMetricoolSpa(pending.win);pending.move('/admin');assert.equal(pending.scripts.filter(s=>s.src).length,0);assert.equal(pending.signals.length,0);
for(const p of ['/admin','/%61dmin','/ADMIN/usuarios','/cliente','/empleado','/login','/api/test','/%ff','/\\admin','//admin'])assert.equal(policy.isMetricoolPublicPath(p),false);
console.log('Metricool SPA passed: literal initial once; public path/query/back once; hash/same URL 0; delayed initial/first next route; double callback; StrictMode; private initial/reentry/cancellation/encoded exclusions. 0 network, 0 DB.');
