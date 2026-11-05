const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),A=require('../radio-audience');
test('online and listening deduplicate tabs, exclude the administrator and expire stale connections',()=>{
 const now=1000000;const data={a:{tab1:{updatedAt:now,listening:true},tab2:{updatedAt:now,listening:true}},b:{tab1:{updatedAt:now,listening:false}},c:{tab1:{updatedAt:now-160000,listening:true}},admin:{tab1:{updatedAt:now,listening:true}}};assert.deepEqual(A.counts(data,now,'admin'),{online:2,listening:1});
});
test('presence arms server disconnect cleanup before announcing online and republishes after reconnect',async()=>{
 const events=[],callbacks=new Map();let identity=null;const refs=new Map();
 const db={ref(path){if(!refs.has(path))refs.set(path,{on(type,fn){callbacks.set(path,fn);},off(){},onDisconnect(){return{async remove(){events.push('cleanup:'+path);},async cancel(){}};},async set(value){events.push('write:'+path);},async remove(){events.push('remove:'+path);}});return refs.get(path);}};
 let id=0;const window={firebase:{database:{ServerValue:{TIMESTAMP:1}}},HimundimRTC:{newId:()=>String(++id)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../radio-audience'),'utf8'),{window,module:undefined,Date,setInterval:()=>1,clearInterval(){}});
 const auth={get currentUser(){return identity;},async signInAnonymously(){identity={uid:'listener'};return{user:identity};}};
 const api=window.HimundimAudience.create({db,auth,rootPath:'radio/himundim',adminUid:'admin'});callbacks.get('.info/connected')({val:()=>true});await new Promise(setImmediate);assert.ok(events[0].startsWith('cleanup:'));assert.ok(events[1].startsWith('write:'));api.setListening(true);callbacks.get('.info/connected')({val:()=>false});callbacks.get('.info/connected')({val:()=>true});await new Promise(setImmediate);assert.equal(events.filter(v=>v.startsWith('cleanup:')).length,2);api.stop();
});

test('opening the listener page waits for persisted authentication and cannot replace an administrator with an anonymous account',async()=>{
 let identity=null,finishAuth,anonymousCalls=0;
 const auth={get currentUser(){return identity;},onAuthStateChanged(callback){finishAuth=callback;return()=>{};},async signInAnonymously(){anonymousCalls++;identity={uid:'anonymous'};return{user:identity};}};
 const window={firebase:{database:{ServerValue:{TIMESTAMP:1}}},HimundimRTC:{newId:()=> 'connection'}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../radio-audience'),'utf8'),{window,module:undefined,Date,setInterval:()=>1,clearInterval(){}});
 const api=window.HimundimAudience.create({db:{ref(){return{on(){},off(){}};}},auth,rootPath:'radio/himundim',adminUid:'admin'});
 const user=api.user();await new Promise(setImmediate);assert.equal(anonymousCalls,0);identity={uid:'admin'};finishAuth(identity);assert.equal((await user).uid,'admin');assert.equal(anonymousCalls,0);api.stop();
});
