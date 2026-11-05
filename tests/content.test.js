const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib'),C=require('../site-content');
const index=JSON.parse(fs.readFileSync(require.resolve('../content/index.json'),'utf8'));
test('the full original archive is present, internally consistent and every article route resolves',()=>{
 assert.equal(index.posts.length,2256);assert.equal(index.pages.length,10);const ids=new Set(),tags=new Set(index.tags.map(t=>t.id));let count=0;
 for(const pack of new Set(index.posts.map(p=>p.pack))){const body=JSON.parse(zlib.gunzipSync(fs.readFileSync(require.resolve('../content/'+pack))));for(const row of body.posts){assert.ok(!ids.has(row.id));ids.add(row.id);const meta=index.posts.find(p=>p.id===row.id);assert.equal(meta.path,row.path);assert.equal(C.select(index,row.path).item.id,row.id);assert.equal(typeof row.content,'string');for(const tag of row.tags)assert.ok(tags.has(typeof tag==='object'?tag.id:tag));count++;}}assert.equal(count,2256);
});
test('categories, authors, tags, pagination, accented searches and legacy WordPress IDs select real content',()=>{
 const post=index.posts[0];assert.equal(C.select(index,'/?p='+post.id).item.id,post.id);assert.equal(C.select(index,'/category/sabores/page/2/').type,'list');assert.ok(C.select(index,'/author/'+post.authorSlug+'/').rows.some(p=>p.id===post.id));const tag=index.tags.find(t=>post.tags.includes(t.id));assert.ok(C.select(index,'/tag/'+tag.slug+'/').rows.some(p=>p.id===post.id));assert.ok(C.select(index,'/?s=gastronomico').rows.length);assert.equal(C.select(index,'/pagina-inexistente/').type,'missing');
});
test('source URL normalization rewrites only editorial paths and preserves uploaded assets on their real origin',()=>{
 assert.equal(C.path('https://www.hi-mundim.com.br/quem-somos-hi-mundim/'),'/quem-somos-hi-mundim/');assert.equal(C.path('https://evil.example/a'), '');assert.equal(C.path('https://hi-mundim.com.br/wp-content/uploads/a.jpg'),'');
});
