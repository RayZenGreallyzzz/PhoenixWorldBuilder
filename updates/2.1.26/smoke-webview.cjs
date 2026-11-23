// Inspect the running Android WebView after an in-place upgrade.
const assert = require('node:assert/strict');
const {setTimeout: delay} = require('node:timers/promises');

async function inspect(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(Error('WebView timeout')); }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{
      expression:`(() => {
        const builder = window.PhoenixClean;
        return {
          ready: document.body.dataset.cleanReady,
          version: window.PhoenixBuildVersion?.version,
          objects: builder?.entries?.length,
          playing: builder?.audioEditor?.playing,
          loops: builder?.audioEditor?.loops.size,
          audioPlayers: builder?.audioEditor?.audioTemplates.size,
          hasContext: !!builder?.audioEditor?.audioContext
        };
      })()`, returnByValue:true
    }}));
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer); ws.close();
      if (message.error) reject(Error(message.error.message));
      else resolve(message.result.result.value);
    };
    ws.onerror = () => { clearTimeout(timer); reject(Error('WebView connection failed')); };
  });
}
(async () => {
  let last;
  for(let i=0; i<45; i++){
    try{
      const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
      const tab = tabs.find(v=>v.url?.includes('android_asset/index.html'));
      if(tab) {
        last = await inspect(tab.webSocketDebuggerUrl);
        if(last?.ready==='false') throw Error('3D editor failed to initialize');
        if(last?.ready==='true') break;
      }
    }catch(error){last=String(error);}
    await delay(1000);
  }
  assert.deepEqual(last,{ready:'true',version:'2.1.26',objects:0,playing:false,
                         loops:0,audioPlayers:0,hasContext:false});
  console.log('Android WebView cold canvas:',last);
})().catch(error=>{console.error(error);process.exitCode=1;});
