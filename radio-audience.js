(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HimundimAudience = api;
})(typeof window !== 'undefined' ? window : this, function (root) {
  'use strict';
  const INBOX = 'himundimMessages', TTL = 150000;
  function counts(value, now = Date.now(), admin = '') {
    let online = 0, listening = 0;
    Object.entries(value || {}).forEach(([uid, connections]) => {
      if (uid === admin) return;
      const rows = Object.values(connections || {}).filter(row => row && Number(row.updatedAt) > now - TTL && Number(row.updatedAt) <= now + 60000);
      if (rows.length) online++;
      if (rows.some(row => row.listening === true)) listening++;
    });
    return { online, listening };
  }
  function create({ db, auth, rootPath, adminUid, onError = () => {} }) {
    let ref = null, connected = false, listening = false, timer = null, generation = 0, authPromise = null, offset = 0;
    let stopInitialAuth = null;
    const authReady = typeof auth.onAuthStateChanged === 'function' ? new Promise(resolve => {
      let completed = false;
      const finish = () => { completed = true; resolve(); stopInitialAuth?.(); };
      stopInitialAuth = auth.onAuthStateChanged(finish, finish);
      if (completed) stopInitialAuth?.();
    }) : Promise.resolve();
    async function user() {
      await authReady;
      if (auth.currentUser) return auth.currentUser;
      if (!authPromise) authPromise = auth.signInAnonymously().then(result => result.user).finally(() => { authPromise = null; });
      return authPromise;
    }
    async function write() {
      if (!ref || !connected) return;
      try { await ref.set({ listening, updatedAt: root.firebase.database.ServerValue.TIMESTAMP }); }
      catch (error) { onError(error); }
    }
    async function connect() {
      const version = ++generation;
      try {
        const identity = await user();
        if (version !== generation || !connected || identity.uid === adminUid) return;
        const id = root.HimundimRTC.newId('page_');
        const next = db.ref(rootPath + '/presence/' + identity.uid + '/' + id);
        await next.onDisconnect().remove();
        if (version !== generation || !connected) { await next.onDisconnect().cancel(); return; }
        ref = next; await write();
        clearInterval(timer); timer = setInterval(write, 60000);
      } catch (error) { onError(error); }
    }
    const connectedRef = db.ref('.info/connected');
    const callback = snapshot => { connected = snapshot.val() === true; if (connected) connect(); else { generation++; ref = null; clearInterval(timer); } };
    const offsetRef = db.ref('.info/serverTimeOffset');
    offsetRef.on('value', snapshot => { offset = Number(snapshot.val()) || 0; });
    connectedRef.on('value', callback);
    return {
      user, now: () => Date.now() + offset,
      setListening(value) { if (listening === !!value) return; listening = !!value; write(); },
      stop() { generation++; stopInitialAuth?.(); connectedRef.off('value', callback); offsetRef.off(); clearInterval(timer); const old = ref; ref = null; if (old) old.remove().then(() => old.onDisconnect().cancel()).catch(() => {}); }
    };
  }
  function bindMessages({ db, audience }) {
    const $ = id => root.document.getElementById(id), form = $('participationForm');
    if (!form) return;
    let sending = false, lastSent = 0, replyRef = null;
    const status = text => { $('participationStatus').textContent = text; };
    function watch(path) {
      if (replyRef) replyRef.off();
      replyRef = db.ref(path);
      replyRef.on('value', snapshot => {
        const value = snapshot.val(); if (!value) return;
        $('participationReply').hidden = !value.reply;
        $('participationReply').textContent = value.reply ? 'Resposta da rádio: ' + value.reply : '';
      }, () => status('Não foi possível consultar a resposta da rádio.'));
    }
    audience.user().then(identity => {
      try { const id = root.localStorage.getItem('himundim-last-message'); if (/^[\w-]+$/.test(id || '')) watch(INBOX + '/' + identity.uid + '/messages/' + id); } catch (_) {}
    }).catch(() => {});
    form.onsubmit = async event => {
      event.preventDefault(); if (sending) return;
      if (Date.now() - lastSent < 15000) return status('Aguarde alguns segundos antes de enviar outra mensagem.');
      const name = $('participantName').value.trim(), city = $('participantCity').value.trim(), text = $('participantMessage').value.trim();
      if (!name || !text) return;
      sending = true; $('participationSend').disabled = true; status('Enviando para o estúdio…');
      try {
        const identity = await audience.user(), base = db.ref(INBOX + '/' + identity.uid), message = base.child('messages').push();
        await base.update({ lastSentAt: root.firebase.database.ServerValue.TIMESTAMP, ['messages/' + message.key]: { uid: identity.uid, name, city, text, createdAt: root.firebase.database.ServerValue.TIMESTAMP, status: 'new' } });
        lastSent = Date.now(); $('participantMessage').value = ''; status('Mensagem recebida pelo estúdio. A equipe pode responder aqui.'); watch(INBOX + '/' + identity.uid + '/messages/' + message.key);
        try { root.localStorage.setItem('himundim-last-message', message.key); } catch (_) {}
      } catch (error) { status(/permission/i.test(error.code || error.message || '') ? 'O envio foi recusado. Aguarde 15 segundos e tente novamente. Se persistir, a rádio precisa publicar as permissões de participação.' : 'A mensagem não foi enviada. Confira sua conexão e tente novamente.'); }
      finally { sending = false; $('participationSend').disabled = false; }
    };
  }
  return { INBOX, TTL, counts, create, bindMessages };
});
