(() => {
  'use strict';
  const C = window.HimundimRadio, A = window.HimundimAudience, $ = id => document.getElementById(id);
  window.HimundimAudienceAdmin = { create({ db, auth }) {
    let presence = {}, inbox = {}, timer = null, refs = [], offset = 0;
    const counts = () => {
      const value = A.counts(presence, Date.now() + offset, C.ADMIN_UID);
      $('onlineCount').textContent = value.online;
      $('listeningCount').textContent = value.listening;
    };
    function render() {
      const rows = Object.entries(inbox).flatMap(([uid, value]) => Object.entries(value?.messages || {}).map(([id, row]) => ({ ...row, uid, id }))).sort((a,b) => Number(b.createdAt) - Number(a.createdAt)).slice(0,200);
      $('messageCount').textContent = rows.filter(row => row.status === 'new').length;
      const filter = $('messageFilter').value;
      const visible = rows.filter(row => !filter || row.status === filter);
      $('participationList').innerHTML = visible.length ? visible.map(row => '<article class="participation-item '+(row.status === 'new' ? 'unread' : '')+'"><div class="card-heading"><strong>'+C.escape(row.name || 'Ouvinte')+'</strong><small>'+C.escape(C.formatDate(row.createdAt))+'</small></div><small>'+C.escape(row.city || '')+' · '+({new:'Nova',read:'Lida',onair:'Lida no ar',archived:'Arquivada'}[row.status] || 'Recebida')+'</small><p class="listener-message">'+C.escape(row.text || '')+'</p>'+(row.reply ? '<p class="reply-copy">Resposta: '+C.escape(row.reply)+'</p>' : '')+'<div class="btn-row"><button type="button" class="btn secondary compact" data-message-action="read" data-uid="'+C.escape(row.uid)+'" data-id="'+C.escape(row.id)+'">Marcar lida</button><button type="button" class="btn secondary compact" data-message-action="onair" data-uid="'+C.escape(row.uid)+'" data-id="'+C.escape(row.id)+'">Lida no ar</button><button type="button" class="btn secondary compact" data-message-action="archived" data-uid="'+C.escape(row.uid)+'" data-id="'+C.escape(row.id)+'">Arquivar</button><button type="button" class="btn compact" data-message-action="reply" data-uid="'+C.escape(row.uid)+'" data-id="'+C.escape(row.id)+'">Responder</button></div></article>').join('') : '<p class="empty">Nenhuma participação neste filtro.</p>';
    }
    function subscribe(path, callback, error) { const ref = db.ref(path); ref.on('value',callback,error); refs.push(ref); }
    $('messageFilter').onchange = render;
    $('participationList').onclick = async event => {
      const button = event.target.closest('[data-message-action]'); if (!button || auth.currentUser?.uid !== C.ADMIN_UID) return;
      const {uid,id,messageAction:action} = button.dataset;
      if (!/^[\w-]+$/.test(uid) || !/^[\w-]+$/.test(id)) return;
      if (action === 'reply') {
        $('replyUid').value=uid; $('replyMessageId').value=id; $('replyForm').hidden=false;
        $('replyRecipient').textContent='Responder para '+(inbox[uid]?.messages?.[id]?.name || 'ouvinte');
        $('replyText').value=inbox[uid]?.messages?.[id]?.reply || ''; $('replyText').focus(); return;
      }
      button.disabled=true;
      try { await db.ref(A.INBOX+'/'+uid+'/messages/'+id).update({status:action}); }
      catch (_) { $('inboxStatus').textContent='Não foi possível atualizar a participação.'; button.disabled=false; }
    };
    $('replyCancel').onclick=()=>{ $('replyForm').hidden=true; };
    $('replyForm').onsubmit=async event=>{
      event.preventDefault(); if(auth.currentUser?.uid!==C.ADMIN_UID) return;
      const text=$('replyText').value.trim(); if(!text)return;
      $('replySend').disabled=true;
      try { await db.ref(A.INBOX+'/'+$('replyUid').value+'/messages/'+$('replyMessageId').value).update({reply:text,repliedAt:firebase.database.ServerValue.TIMESTAMP,status:'read'}); $('replyForm').hidden=true; $('inboxStatus').textContent='Resposta enviada ao ouvinte.'; }
      catch(_){$('inboxStatus').textContent='A resposta não foi enviada. Tente novamente.';}
      finally{$('replySend').disabled=false;}
    };
    return {
      start() {
        this.stop();
        subscribe('.info/serverTimeOffset',s=>{offset=Number(s.val())||0;});
        subscribe(C.ROOT+'/presence',s=>{presence=s.val()||{}; counts();},()=>{$('audienceStatus').textContent='Contagem indisponível: confira as regras da Hi-Mundim.';});
        const ref=db.ref(A.INBOX).orderByChild('lastSentAt').limitToLast(100); refs.push(ref);
        ref.on('value',s=>{inbox=s.val()||{}; render(); $('inboxStatus').textContent='Atualização em tempo real · últimas 200 mensagens de até 100 participantes.';},()=>{$('inboxStatus').textContent='Publique as regras de participação da Hi-Mundim para receber mensagens.';});
        timer=setInterval(counts,30000);
      },
      stop(){refs.splice(0).forEach(ref=>ref.off()); clearInterval(timer); presence={};inbox={};counts();render();$('replyForm').hidden=true;}
    };
  }};
})();
