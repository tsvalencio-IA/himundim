const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const manifest=JSON.parse(fs.readFileSync(require.resolve('../manifest.webmanifest'),'utf8'));
test('installation identifies the radio, opens its own origin and supplies real Android and iPhone icon dimensions',()=>{
 assert.equal(manifest.name,'Rádio Hi-Mundim');assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.ok(manifest.start_url.includes('#radio'));assert.equal(manifest.id,'/?app=radio');assert.equal(manifest.prefer_related_applications,false);
 const sizes=new Set();for(const icon of manifest.icons){const png=fs.readFileSync(require.resolve('..'+icon.src));assert.equal(png.subarray(1,4).toString(),'PNG');const width=png.readUInt32BE(16),height=png.readUInt32BE(20);assert.equal(icon.sizes,width+'x'+height);sizes.add(width);}
 assert.ok(sizes.has(192)&&sizes.has(512));assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));const apple=fs.readFileSync(require.resolve('../icons/apple-touch-icon.png'));assert.equal(apple.readUInt32BE(16),180);
});
test('service worker caches only installation assets and never intercepts admin, API, Firebase or radio media',async()=>{
 const handlers=new Map(),calls=[],fallback={offline:true};
 vm.runInNewContext(fs.readFileSync(require.resolve('../sw'),'utf8'),{URL,self:{location:{origin:'https://himundim-radio.vercel.app'},addEventListener:(event,fn)=>handlers.set(event,fn),skipWaiting:async()=>{},clients:{claim:async()=>{}}},fetch:async()=>{throw new Error('offline');},caches:{open:async()=>({addAll:async files=>calls.push(...files)}),match:async path=>path==='/offline'?fallback:null,keys:async()=>[],delete:async()=>true}});
 let install;handlers.get('install')({waitUntil:p=>{install=p;}});await install;assert.ok(calls.includes('/offline'));assert.ok(calls.every(path=>path.startsWith('/icons/')||path==='/offline'));
 for(const url of ['https://himundim-radio.vercel.app/admin','https://himundim-radio.vercel.app/api/editorial','https://biblia-radio-default-rtdb.firebaseio.com/radio.json','https://res.cloudinary.com/example/audio.webm']){let intercepted=false;handlers.get('fetch')({request:{method:'GET',url,mode:'navigate'},respondWith(){intercepted=true;}});assert.equal(intercepted,false,url);}
 let result;handlers.get('fetch')({request:{method:'GET',url:'https://himundim-radio.vercel.app/?app=radio',mode:'navigate'},respondWith:p=>{result=p;}});assert.equal(await result,fallback);
});
