(() => {
  'use strict';
  const C=window.HimundimRadio,R=window.HimundimReplay,Y=window.HimundimYouTube,$=id=>document.getElementById(id);
  function storage(){return new Promise((resolve,reject)=>{const request=indexedDB.open('himundim-recordings',1);request.onupgradeneeded=()=>{request.result.createObjectStore('records',{keyPath:'id'});request.result.createObjectStore('chunks',{keyPath:['recordId','index']});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function transact(store,mode,action){const db=await storage();return new Promise((resolve,reject)=>{const transaction=db.transaction(store,mode),request=action(transaction.objectStore(store));let result;request.onsuccess=()=>{result=request.result;};transaction.oncomplete=()=>{db.close();resolve(result);};transaction.onerror=()=>{db.close();reject(transaction.error);};});}
  window.HimundimRecorder={create({db,auth,studio,canWrite}){
    let recorder=null,record=null,blob=null,url='',recordStarted=0,latestMedia={},chunks=0,pending=Promise.resolve(),ticker=null,library={},loading=false,uploadedUrl='',seek=0;
    const audio=$('recordingAudio');
    const surface=Y.createSurface({container:$('recordingYoutube'),mountId:'recordingYoutubePlayer',title:$('recordingYoutubeTitle'),notice:$('recordingYoutubeStatus'),blockedText:'Toque em Ativar vídeo da prévia para acompanhar o trecho do YouTube.'});
    const status=(text,error=false)=>{$('recordingStatus').textContent=text;$('recordingStatus').dataset.tone=error?'error':'info';};
    const persist=()=>record?transact('records','readwrite',store=>store.put({...record})):Promise.resolve();
    function display(){
      $('recordStart').disabled=loading||!!recorder||!studio.active;
      $('recordStop').disabled=!recorder;
      $('recordingEditor').hidden=!blob;
      $('recordingTimer').textContent=R.time(recorder?(Date.now()-recordStarted)/1000:record?.durationSec);
      $('recordingList').innerHTML=C.entries(library).map(item=>'<button class="btn secondary compact" type="button" data-local-record="'+C.escape(item.id)+'">'+C.escape(item.title||'Gravação')+' · '+R.time(item.durationSec)+'</button>').join('')||'<p class="muted">As gravações deste aparelho aparecerão aqui.</p>';
      if(record){$('recordingCuts').innerHTML=R.cuts(record.editCuts,record.durationSec).map((cut,index)=>'<li>'+R.time(cut.start)+' → '+R.time(cut.end)+' <button class="text-button" type="button" data-remove-cut="'+index+'">Desfazer corte</button></li>').join('')||'<li>Nenhum corte.</li>'; $('editedDuration').textContent=R.time(R.duration(record.durationSec||0,record.editCuts));}
    }
    async function list(){const rows=await transact('records','readonly',store=>store.getAll());library=Object.fromEntries(rows.map(row=>[row.id,row]));display();}
    function captureMedia(value){
      latestMedia=value||{};
      if(!recorder||latestMedia.sessionId!==record.sessionId&&latestMedia.active)return;
      const at=Math.max(0,(Date.now()-recordStarted)/1000),m=Y.normalize(latestMedia,record.sessionId);
      const media=m?{...m,positionSec:Y.position(m),startedAt:0}:{active:false};
      const previous=record.youtubeCues.at(-1);
      if(previous&&JSON.stringify({...previous.media,positionSec:0})===JSON.stringify({...media,positionSec:0}))return;
      record.youtubeCues.push({at,media});pending=pending.then(persist).catch(error=>status('Não foi possível salvar a sequência do YouTube: '+error.message,true));
    }
    async function start(){
      if(recorder||loading)return;
      if(!studio.active||!studio.stream)throw new Error('Entre ao vivo antes de gravar.');
      if(!window.MediaRecorder)throw new Error('Este navegador não oferece gravação. Use Chrome ou Safari atualizado.');
      await storage().then(database=>database.close());
      if(url)URL.revokeObjectURL(url);audio.pause();surface.stop();blob=null;url='';uploadedUrl='';
      const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(type=>MediaRecorder.isTypeSupported(type));
      recorder=new MediaRecorder(studio.stream,mime?{mimeType:mime,audioBitsPerSecond:96000}:{});
      recordStarted=Date.now();chunks=0;
      record={id:window.HimundimRTC.newId('rec_'),sessionId:studio.sessionId,title:$('studioTitle').value.trim()||'Programa Hi-Mundim',createdAt:recordStarted,mimeType:recorder.mimeType,durationSec:0,editCuts:[],youtubeCues:[],complete:false};
      $('recordingTitle').value=record.title;
      await persist();
      recorder.ondataavailable=event=>{if(!event.data.size)return;const row={recordId:record.id,index:chunks++,data:event.data};pending=pending.then(()=>transact('chunks','readwrite',store=>store.put(row))).catch(error=>{status('O aparelho ficou sem espaço para gravar. Encerre e baixe o que foi salvo.',true);stop();});};
      recorder.onerror=()=>{status('A gravação foi interrompida pelo navegador. Confira o material salvo.',true);stop();};
      recorder.onstop=async()=>{
        record.durationSec=Math.max(0,(Date.now()-recordStarted)/1000);record.complete=true;recorder=null;loading=true;clearInterval(ticker);
        try{await pending;await persist();await load(record.id);await list();status('Gravação salva neste aparelho. Pré-ouça, marque os cortes e publique a reprise.');}
        catch(error){status('Não foi possível abrir a gravação salva: '+error.message,true);}finally{loading=false;}display();
      };
      recorder.start(5000);captureMedia(latestMedia);ticker=setInterval(display,1000);display();status('● Gravando voz, músicas e vinhetas. Os trechos do YouTube ficam sincronizados na reprise. Mantenha esta página aberta.');
    }
    function stop(){if(recorder&&recorder.state!=='inactive'){recorder.requestData();recorder.stop();}}
    async function load(id){
      if(recorder)throw new Error('Encerre a gravação atual antes de abrir outra.');
      const found=await transact('records','readonly',store=>store.get(id));if(!found)throw new Error('Gravação não encontrada neste aparelho.');
      const rows=await transact('chunks','readonly',store=>store.getAll(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER])));
      if(!rows.length)throw new Error('Esta gravação não possui áudio salvo.');
      audio.pause();surface.stop();if(url)URL.revokeObjectURL(url);
      record=found;record.durationSec=Number(found.durationSec)||rows.length*5;
      blob=new Blob(rows.sort((a,b)=>a.index-b.index).map(row=>row.data),{type:record.mimeType});url=URL.createObjectURL(blob);audio.src=url;audio.load();uploadedUrl=record.audioUrl||'';
      $('recordingTitle').value=record.title; $('recordingDescription').value=record.description||''; $('recordingCategory').value=record.category||'Especial';display();
    }
    function preview(force=false){if(!record)return;const next=R.nextTime(audio.currentTime,record.editCuts,record.durationSec);if(next!==audio.currentTime){audio.currentTime=next;seek++;}if(force)seek++;
      const cue=R.cueAt(record.youtubeCues,audio.currentTime,Date.now(),seek);if(cue)surface.update(cue,'replay',!audio.paused).catch(error=>status(error.message,true));else surface.stop();
      $('recordingSeek').value=record.durationSec?Math.min(1000,audio.currentTime/record.durationSec*1000):0;
      $('recordingPosition').textContent=R.time(audio.currentTime)+' original · '+R.time(R.editedTime(audio.currentTime,record.editCuts))+' na edição';
    }
    $('recordingSeek').oninput=()=>{if(record?.durationSec){audio.currentTime=Number($('recordingSeek').value)/1000*record.durationSec;preview(true);}};
    audio.addEventListener('loadedmetadata',()=>{if(record&&Number.isFinite(audio.duration)&&audio.duration>0){record.durationSec=audio.duration;persist().catch(()=>{});display();}});
    audio.addEventListener('timeupdate',()=>preview());audio.addEventListener('seeked',()=>preview(true));audio.addEventListener('play',()=>preview(true));audio.addEventListener('pause',()=>surface.pause());audio.addEventListener('ended',()=>surface.stop());
    $('recordingVideoActivate').onclick=()=>surface.start().catch(error=>status(error.message,true));
    $('recordStart').onclick=()=>start().catch(error=>status(error.message,true));$('recordStop').onclick=stop;
    $('markCutStart').onclick=()=>{$('cutStart').value=R.time(audio.currentTime);};$('markCutEnd').onclick=()=>{$('cutEnd').value=R.time(audio.currentTime);};
    $('cutForm').onsubmit=async event=>{event.preventDefault();if(!record)return;const start=R.parse($('cutStart').value),end=R.parse($('cutEnd').value);
      if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>record.durationSec+0.25)return status('Informe início e fim válidos dentro da gravação.',true);
      const next=R.cuts([...(record.editCuts||[]),{start,end}],record.durationSec);if(R.duration(record.durationSec,next)<0.5)return status('Mantenha pelo menos meio segundo no programa.',true);
      record.editCuts=next;await persist();display();preview(true);status('Corte aplicado à prévia. Publique para atualizar o acervo.');
    };
    $('recordingCuts').onclick=async event=>{const button=event.target.closest('[data-remove-cut]');if(!button||!record)return;record.editCuts=R.cuts(record.editCuts,record.durationSec).filter((_,i)=>i!==Number(button.dataset.removeCut));await persist();display();};
    $('recordingList').onclick=event=>{const button=event.target.closest('[data-local-record]');if(button)load(button.dataset.localRecord).catch(error=>status(error.message,true));};
    $('downloadRecording').onclick=()=>{if(!blob)return;const anchor=document.createElement('a');anchor.href=url;anchor.download='hi-mundim-'+record.id+(record.mimeType.includes('mp4')?'.m4a':record.mimeType.includes('ogg')?'.ogg':'.webm');anchor.click();status('Download do áudio original solicitado. Os cortes são usados na reprise publicada.');};
    $('downloadEditedRecording').onclick=async()=>{
      if(!blob||!record)return;const button=$('downloadEditedRecording');button.disabled=true;
      try{const cutList=R.cuts(record.editCuts,record.durationSec),file=cutList.length?await window.HimundimWebM.edit(blob,cutList,record.durationSec):blob,href=URL.createObjectURL(file),anchor=document.createElement('a');anchor.href=href;anchor.download='hi-mundim-edicao-'+record.id+(file.type.includes('mp4')?'.m4a':file.type.includes('ogg')?'.ogg':'.webm');anchor.click();setTimeout(()=>URL.revokeObjectURL(href),60000);status('Download da edição solicitado. Os cortes foram removidos do áudio. Os vídeos acompanham a reprise no site.');}
      catch(error){status(error.message,true);}finally{button.disabled=false;}
    };
    $('publishRecording').onclick=async()=>{
      if(loading||!record||!blob)return;if(!canWrite())return status('Entre como administrador e aguarde a conexão.',true);
      const title=$('recordingTitle').value.trim();if(!title)return status('Informe o título da reprise.',true);
      loading=true;$('publishRecording').disabled=true;
      try{audio.pause();surface.stop();status('Enviando a gravação… Aguarde a confirmação antes de fechar.');
        const cutList=R.cuts(record.editCuts,record.durationSec),signature=JSON.stringify(cutList);
        if(!uploadedUrl||record.uploadSignature!==signature){
          const exported=cutList.length?await window.HimundimWebM.edit(blob,cutList,record.durationSec):blob;
          const extension=exported.type.includes('mp4')?'m4a':exported.type.includes('ogg')?'ogg':'webm';
          const result=await window.HimundimMedia.uploadAudio(new File([exported],record.id+'.'+extension,{type:exported.type}));
          uploadedUrl=result.url;record.audioUrl=uploadedUrl;record.uploadSignature=signature;await persist();
        }
        const replayDuration=R.duration(record.durationSec,cutList),youtubeCues=R.trimCues(record.youtubeCues,cutList,record.durationSec);
        if(!canWrite())throw new Error('Entre novamente antes de publicar. O áudio enviado foi preservado.');
        const ref=record.programId?db.ref(C.ROOT+'/programs/'+record.programId):db.ref(C.ROOT+'/programs').push();
        const value={title,category:$('recordingCategory').value,description:$('recordingDescription').value.trim(),audioUrl:uploadedUrl,durationSec:replayDuration,editedDurationSec:replayDuration,editCuts:[],youtubeCues,published:true,recordingId:record.id,updatedAt:firebase.database.ServerValue.TIMESTAMP,updatedBy:auth.currentUser.uid};
        if(!record.programId){value.createdAt=firebase.database.ServerValue.TIMESTAMP;value.createdBy=auth.currentUser.uid;}
        await ref.update(value);Object.assign(record,{programId:ref.key,title,category:value.category,description:value.description});await persist();await list();status('Reprise publicada no acervo com os cortes e a sequência do YouTube. Você pode reabrir esta gravação para editar novamente.');
      }catch(error){status(error.message||'Não foi possível publicar a reprise.',true);}finally{loading=false;$('publishRecording').disabled=false;}
    };
    window.addEventListener('himundim:live-start',()=>{display();if($('autoRecord').checked)start().catch(error=>status(error.message,true));});
    window.addEventListener('himundim:live-stop',()=>{stop();display();});
    window.addEventListener('beforeunload',event=>{if(recorder||loading){event.preventDefault();event.returnValue='';}});
    db.ref(C.ROOT+'/liveMedia/youtube').on('value',snapshot=>captureMedia(snapshot.val()));
    try{$('autoRecord').checked=localStorage.getItem('himundim-auto-record')==='true';}catch(_){}
    $('autoRecord').onchange=()=>{try{localStorage.setItem('himundim-auto-record',String($('autoRecord').checked));}catch(_){}};
    list().catch(()=>status('O navegador bloqueou o armazenamento local. Ative-o para gravar programas.',true));display();
    return {stop,get active(){return !!recorder;},async openProgram(program){
      if(recorder||loading)throw new Error('Encerre a gravação atual antes de editar outro programa.');
      const local=program.recordingId&&await transact('records','readonly',store=>store.get(program.recordingId));
      if(local)await load(local.id);
      else {
        status('Carregando o áudio para edição…');
        const response=await fetch(C.requireAudio(program.audioUrl));if(!response.ok)throw new Error('Não foi possível carregar o áudio do programa.');
        const data=await response.blob(),id=window.HimundimRTC.newId('rec_');
        const imported={id,programId:program.id,title:program.title||'Programa',category:program.category||'Especial',description:program.description||'',createdAt:Date.now(),mimeType:data.type||'audio/webm',durationSec:Number(program.durationSec)||0,editCuts:program.editCuts||[],youtubeCues:program.youtubeCues||[],complete:true};
        await transact('chunks','readwrite',store=>store.put({recordId:id,index:0,data}));await transact('records','readwrite',store=>store.put(imported));await load(id);
      }
      $('recordingTools').open=true;$('recordingTools').scrollIntoView({block:'start'});await list();status('Programa aberto para cortes. Pré-ouça antes de publicar a nova edição.');
    }};
  }};
})();
