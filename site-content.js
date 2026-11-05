(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.HimundimContent=api;})(typeof window!=='undefined'?window:this,function(){
'use strict';
const SOURCE=new Set(['hi-mundim.com.br','www.hi-mundim.com.br']);
function path(value){try{const u=new URL(value,'https://hi-mundim.com.br');if(!SOURCE.has(u.hostname)||/^\/wp-content\//.test(u.pathname))return '';const p=decodeURI(u.pathname).replace(/\/+/g,'/').replace(/\/embed\/?$/,'/');return p==='/'?'/':p.replace(/\/$/,'')+'/';}catch(_){return '';}}
function select(index,location){const u=new URL(location,'https://hi-mundim.com.br'),route=path(u.pathname),id=Number(u.searchParams.get('p')||u.searchParams.get('page_id'));
if(id){const item=[...index.posts,...index.pages].find(p=>p.id===id);if(item)return{type:'article',item};}
const query=(u.searchParams.get('s')||'').trim();if(query){const fold=v=>v.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/\p{Diacritic}/gu,'');return{type:'list',title:'Resultados para “'+query+'”',rows:index.posts.filter(p=>fold(p.title+' '+p.excerpt+' '+p.author).includes(fold(query)))};}
if(u.searchParams.get('arquivo')==='1')return{type:'list',title:'Todas as matérias',rows:index.posts};
if(route==='/')return{type:'home'};
const category=route.match(/^\/category\/([^/]+)(?:\/page\/\d+)?\/$/);if(category){const t=index.categories.find(v=>v.slug===category[1]);return t?{type:'list',title:t.name,description:t.description,rows:index.posts.filter(p=>p.categories.includes(t.id))}:{type:'missing'};}
const author=route.match(/^\/author\/([^/]+)(?:\/page\/\d+)?\/$/);if(author){const rows=index.posts.filter(p=>p.authorSlug===author[1]);return rows.length?{type:'list',title:rows[0].author,rows}:{type:'missing'};}
const tag=route.match(/^\/tag\/([^/]+)(?:\/page\/\d+)?\/$/);if(tag){const t=(index.tags||[]).find(v=>v.slug===tag[1]),rows=index.posts.filter(p=>(p.tags||[]).some(v=>typeof v==='object'?v.slug===tag[1]:v===t?.id));return rows.length?{type:'list',title:t?.name||tag[1].replace(/-/g,' '),rows}:{type:'missing'};}
const item=[...index.pages,...index.posts].find(p=>path(p.path)===route);if(item)return{type:'article',item};const slug=route.split('/').filter(Boolean).at(-1),legacy=[...index.pages,...index.posts].filter(p=>p.slug===slug);return legacy.length===1?{type:'article',item:legacy[0]}:{type:'missing'};}
return{SOURCE,path,select};});
