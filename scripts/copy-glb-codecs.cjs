#!/usr/bin/env node
/* Copy pinned Three.js r140 WASM transcoder assets into Android's offline assets.
 * Run after installing three@0.140.0. No runtime CDN/network dependency.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const base=process.argv[2];
if(!base)throw Error('Usage: node scripts/copy-glb-codecs.cjs <three-package-root>');
const assets=path.resolve(__dirname,'../app/src/main/assets/js');
const copies={
 'examples/js/libs/draco/gltf/draco_wasm_wrapper.js':'draco/draco_wasm_wrapper.js',
 'examples/js/libs/draco/gltf/draco_decoder.wasm':'draco/draco_decoder.wasm',
 'examples/js/libs/draco/gltf/draco_decoder.js':'draco/draco_decoder.js',
 'examples/js/libs/basis/basis_transcoder.js':'basis/basis_transcoder.js',
 'examples/js/libs/basis/basis_transcoder.wasm':'basis/basis_transcoder.wasm'
};
let total=0;
for(const [src,rel] of Object.entries(copies)){
 const input=path.join(base,src),out=path.join(assets,rel);
 if(!fs.existsSync(input))throw Error('Three.js v0.140.0 decoder file missing: '+input);
 const stat=fs.statSync(input);
 if(stat.size<1000||stat.size>1000000)throw Error('Unexpected codec asset size: '+input);
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.copyFileSync(input,out);total+=stat.size;
 console.log('Offline decoder:',rel,stat.size+' bytes');
}
console.log('Decoder assets installed, total '+total+' bytes. APK is network-independent.');
