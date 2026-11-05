// Separate, document-local coordination. No cookies, storage or identifiers.
// Runs before the unmodified literal snippet so its real callback, not a timer,
// determines the initial URL and subsequent de-duplication.
export const METRICOOL_COORDINATOR = `(function(w){
if(w.__ioMetricoolPublic)return;
var state={requested:true,last:null};w.__ioMetricoolPublic=state;
function publicPath(p){try{p=decodeURIComponent(p).toLowerCase()}catch(e){return false}if(p.indexOf("\\\\")!==-1||p.indexOf("//")!==-1)return false;return !["/admin","/cliente","/empleado","/login","/auth","/api","/registro","/recuperar-password","/reset-password"].some(function(r){return p===r||p.indexOf(r+"/")===0})}
var tracker=w.beTracker;
function wrap(t){if(!t||typeof t.t!=="function"||t.__ioPublicWrapped)return t;var original=t.t;t.t=function(a){if(!publicPath(w.location.pathname))return;var key=w.location.origin+w.location.pathname+w.location.search;if(state.last===key)return;state.last=key;return original.call(t,a)};t.__ioPublicWrapped=true;return t}
Object.defineProperty(w,"beTracker",{configurable:true,get:function(){return tracker},set:function(t){tracker=wrap(t)}});tracker=wrap(tracker);
})(window);`

export type MetricoolWindow = Window & {
  beTracker?: { t: (data: { hash: string }) => void }
  __ioMetricoolPublic?: { requested: boolean; last: string | null }
}
