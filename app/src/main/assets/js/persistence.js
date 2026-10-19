/* Crash-safe project persistence: Android private files + legacy WebView IndexedDB. */
const PhoenixPersistence=(()=>{
 function valid(project) {
  return !!project&&typeof project==='object'&&
   Array.isArray(project.objects)&&Array.isArray(project.heights);
 }
 function parse(value) {
  if(!value)return null;
  try {const p=typeof value==='string'?JSON.parse(value):value;return valid(p)?p:null}
  catch(e){return null}
 }
 function native() {
  return typeof NativeBridge!=='undefined'&&NativeBridge!==null&&
   typeof NativeBridge.saveProject==='function';
 }
 function read(method='loadProject') {
  try {
   if(!native()||typeof NativeBridge[method]!=='function')return null;
   return parse(NativeBridge[method]());
  }catch(e){console.warn('Native project recovery read failed',method,e);return null}
 }
 function write(project,manual=false) {
  if(!valid(project)||!native())return false;
  try{
   const json=JSON.stringify(project);
   if(!NativeBridge.saveProject(json))return false;
   if(manual&&typeof NativeBridge.saveManualProject==='function')
    return !!NativeBridge.saveManualProject(json);
   return true;
  }catch(e){console.error('Native project save failed',e);return false}
 }
 function choose(nativeProject,webProject){
  const n=parse(nativeProject),w=parse(webProject);
  if(!n)return w?{project:w,source:'webview'}:null;
  if(!w)return {project:n,source:'android'};
  // An accidental empty WebView startup must not erase a previously populated scene.
  const cn=n.objects.length,cw=w.objects.length;
  if(cn&&!cw)return {project:n,source:'android'};
  if(cw&&!cn)return {project:w,source:'webview'};
  const tn=Date.parse(n.updated||'')||0,tw=Date.parse(w.updated||'')||0;
  return tw>tn?{project:w,source:'webview'}:{project:n,source:'android'};
 }
 return {valid,parse,native,read,write,choose,flushNow:()=>false};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=PhoenixPersistence;
