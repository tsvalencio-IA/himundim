const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),C=require('../site-content');
let indexPromise;const packs=new Map();
module.exports=async function(req,res){
if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');return res.status(405).json({error:'method_not_allowed'});}
try{indexPromise=indexPromise||fs.readFile(path.join(process.cwd(),'content/index.json'),'utf8').then(JSON.parse);const index=await indexPromise,selected=C.select(index,String(req.query.path||'/'));if(selected.type!=='article')return res.status(404).json({error:'not_found'});let item=selected.item;
if(item.pack){if(!/^posts-\d{2}\.json\.gz$/.test(item.pack))throw new Error();if(!packs.has(item.pack))packs.set(item.pack,fs.readFile(path.join(process.cwd(),'content',item.pack)).then(raw=>JSON.parse(zlib.gunzipSync(raw))));const pack=await packs.get(item.pack);item=pack.posts.find(p=>p.id===item.id);}
res.setHeader('Cache-Control','public, s-maxage=86400, stale-while-revalidate=604800');return res.status(200).json(item);
}catch(_){return res.status(503).json({error:'content_unavailable'});}};
