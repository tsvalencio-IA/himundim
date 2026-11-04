(()=>{"use strict";
const firebaseApp=firebase.initializeApp(window.HIMUNDIM_FIREBASE_CONFIG);
const db=firebaseApp.database(); const ROOT=window.HIMUNDIM_DB_ROOT;
const $=id=>document.getElementById(id);
const els={audio:$("audio"),play:$("playBtn"),volume:$("volume"),badge:$("liveBadge"),conn:$("connectionText"),title:$("player-title"),desc:$("nowDescription"),state:$("audioState"),list:$("scheduleList"),sched:$("scheduleStatus")};
let live={},programs={},schedule={},currentSource="";
function fmt(ts){if(!ts)return"";return new Intl.DateTimeFormat("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(ts));}
function normalized(obj){return obj&&typeof obj==="object"?obj:{}}
function allSchedule(){return Object.entries(schedule).map(function(entry){return Object.assign({id:entry[0]},entry[1]||{});}).filter(function(x){return x&&x.published!==false&&x.startAt;}).sort(function(a,b){return a.startAt-b.startAt;});}
function currentScheduled(){const n=Date.now();return allSchedule().find(function(x){return Number(x.startAt)<=n&&(!x.endAt||Number(x.endAt)>n);});}
function programFor(item){return item&&programs[item.programId]?programs[item.programId]:null;}
function choose(){if(live.active&&live.audioUrl)return{id:"live",title:live.title||"Ao vivo",description:live.description||"Transmissão ao vivo do Hi-Mundim",audioUrl:live.audioUrl,live:true};const item=currentScheduled();const p=programFor(item);if(p&&p.published!==false&&p.audioUrl)return{id:item.id,title:p.title||"Programa",description:p.description||"",audioUrl:p.audioUrl,live:false};return null;}
function applyPlayer(){const selected=choose();els.badge.textContent=selected&&selected.live?"AO VIVO":selected?"NO AR":"FORA DO AR";els.badge.classList.toggle("on",!!selected);els.title.textContent=selected?selected.title:"Nenhuma programação no ar";els.desc.textContent=selected?selected.description:"Quando houver uma transmissão ou programa publicado, ele aparecerá aqui.";els.play.disabled=!selected;if(!selected){if(!els.audio.paused)els.audio.pause();els.audio.removeAttribute("src");currentSource="";els.state.textContent="Aguardando áudio";return;}if(selected.audioUrl!==currentSource){const wasPlaying=!els.audio.paused;currentSource=selected.audioUrl;els.audio.src=currentSource;els.audio.load();if(wasPlaying)els.audio.play().catch(function(){});}}
function escapeHtml(v){return String(v==null?"":v).replace(/[&<>"\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","\'":"&#039;"}[c];});}
function renderSchedule(){const rows=allSchedule().filter(function(x){return Number(x.endAt||x.startAt)>=Date.now();}).slice(0,8);els.sched.textContent=rows.length?String(rows.length)+" próximo(s)":"";if(!rows.length){els.list.innerHTML="<div class=\"empty\">Ainda não há programação publicada.</div>";return;}els.list.innerHTML=rows.map(function(x){const p=programFor(x)||{};return "<div class=\"schedule-item\"><span>"+fmt(x.startAt)+"</span><strong>"+escapeHtml(p.title||"Programa")+"</strong><span>"+escapeHtml(p.category||"")+"</span></div>";}).join("");}
els.play.addEventListener("click",async function(){if(!currentSource)return;if(els.audio.paused){try{await els.audio.play();}catch(e){els.state.textContent="Toque novamente para iniciar";}}else els.audio.pause();});
els.audio.addEventListener("play",function(){els.play.textContent="❚❚";els.state.textContent="Reproduzindo";});
els.audio.addEventListener("pause",function(){els.play.textContent="▶";els.state.textContent=currentSource?"Pausado":"Aguardando áudio";});
els.audio.addEventListener("error",function(){els.state.textContent="Não foi possível reproduzir esta fonte de áudio";});
els.volume.addEventListener("input",function(){els.audio.volume=Number(els.volume.value);});els.audio.volume=Number(els.volume.value);
db.ref(ROOT+"/live").on("value",function(s){live=normalized(s.val());applyPlayer();});
db.ref(ROOT+"/programs").on("value",function(s){programs=normalized(s.val());applyPlayer();renderSchedule();});
db.ref(ROOT+"/schedule").on("value",function(s){schedule=normalized(s.val());applyPlayer();renderSchedule();});
db.ref(".info/connected").on("value",function(s){els.conn.textContent=s.val()?"Conectado":"Sem conexão";});
setInterval(function(){applyPlayer();renderSchedule();},30000);
})();