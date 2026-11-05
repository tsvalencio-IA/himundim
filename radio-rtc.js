(function () {
  "use strict";
  // Audio transport adapted from the existing Bíblia Rádio studio and listener.
  // Firebase only exchanges signalling. The audio travels through WebRTC.
  const C = window.HimundimRadio;
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];
  const validId = id => typeof id === "string" && /^[\w-]{8,100}$/.test(id);
  const newId = prefix => prefix + Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
  const description = d => ({ type: d.type, sdp: d.sdp });
  function observe(ref, event, callback, error, cleanup) {
    ref.on(event, callback, error);
    cleanup.push(() => ref.off(event, callback));
  }
  function connectionError(error) {
    if (/permission.denied/i.test(error.code || error.message || "")) return new Error("A rádio não autorizou a conexão de áudio. Avise o administrador.");
    if (error.code === "auth/operation-not-allowed" || error.code === "auth/admin-restricted-operation") return new Error("A conexão dos ouvintes precisa ser habilitada pelo administrador da rádio.");
    return new Error("Não foi possível conectar à transmissão. Tente novamente.");
  }
  async function verifyListenerAccess(sessionId) {
    // Use a separate in-memory anonymous session; never replace the studio login.
    const app = firebase.initializeApp(window.HIMUNDIM_FIREBASE_CONFIG, newId("himundim-check-"));
    const auth = app.auth(); let node = null;
    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
      await auth.signInAnonymously();
      node = app.database().ref(C.ROOT + "/webrtc/" + sessionId + "/listeners/" + auth.currentUser.uid + "/connection_check");
      await node.set({ uid: auth.currentUser.uid, probe: true, createdAt: firebase.database.ServerValue.TIMESTAMP });
      await node.remove();
    } catch (_) {
      throw new Error("O Firebase ainda não liberou a conexão dos ouvintes da Hi-Mundim. É preciso conferir as permissões desta rádio antes de entrar ao vivo.");
    } finally {
      if (node) await node.remove().catch(() => {});
      if (auth.currentUser) await auth.currentUser.delete().catch(() => {});
      await app.delete().catch(() => {});
    }
  }
  function listen({ db, auth, sessionId, audio, onState = () => {} }) {
    if (!validId(sessionId)) throw new Error("Transmissão indisponível.");
    let stopped = false, pc = null, node = null, disconnect = null, remote = false, settingRemote = false, published = false;
    const cleanup = [], pending = [], outgoing = [];
    const report = (state, error) => { if (!stopped) onState(state, error); };
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cleanup.splice(0).forEach(fn => fn());
      if (pc) { pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.close(); }
      if (node) node.remove().then(() => published && disconnect?.cancel()).catch(() => {});
      audio.pause(); audio.srcObject = null;
    };
    const ready = (async () => {
      try {
        if (!window.RTCPeerConnection) throw new Error("WebRTC unavailable");
        report("connecting");
        if (!auth.currentUser) await auth.signInAnonymously();
        if (stopped) return;
        const id = newId("c_");
        node = db.ref(C.ROOT + "/webrtc/" + sessionId + "/listeners/" + auth.currentUser.uid + "/" + id);
        disconnect = node.onDisconnect();
        await disconnect.remove();
        if (stopped) { await disconnect.cancel(); return; }
        pc = new RTCPeerConnection({ iceServers });
        pc.addTransceiver("audio", { direction: "recvonly" });
        pc.ontrack = event => {
          if (stopped) return;
          audio.srcObject = event.streams[0] || new MediaStream([event.track]);
          audio.play().catch(() => report("tap"));
        };
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "connected") report("connected");
          if (pc.connectionState === "failed") report("failed");
          if (pc.connectionState === "disconnected") report("reconnecting");
        };
        pc.onicecandidate = event => {
          if (!event.candidate || stopped) return;
          const candidate = event.candidate.toJSON();
          if (!published) outgoing.push(candidate);
          else node.child("listenerCandidates").push(candidate).catch(error => report("error", connectionError(error)));
        };
        const offer = await pc.createOffer();
        if (stopped) return;
        await pc.setLocalDescription(offer);
        if (stopped) return;
        await node.set({ uid: auth.currentUser.uid, createdAt: firebase.database.ServerValue.TIMESTAMP, offer: description(pc.localDescription) });
        if (stopped) { await node.remove(); await disconnect.cancel(); return; }
        published = true;
        await Promise.all(outgoing.splice(0).map(candidate => node.child("listenerCandidates").push(candidate)));
        if (stopped) return;
        observe(node.child("answer"), "value", async snapshot => {
          const answer = snapshot.val();
          if (stopped || remote || settingRemote || !answer?.sdp) return;
          settingRemote = true;
          try {
            await pc.setRemoteDescription(answer);
            if (stopped) return;
            remote = true;
            for (const candidate of pending.splice(0)) if (!stopped) await pc.addIceCandidate(candidate);
          } catch (error) { if (!stopped) report("error", connectionError(error)); }
        }, error => report("error", connectionError(error)), cleanup);
        observe(node.child("hostCandidates"), "child_added", snapshot => {
          if (!remote) pending.push(snapshot.val());
          else pc.addIceCandidate(snapshot.val()).catch(() => {});
        }, error => report("error", connectionError(error)), cleanup);
      } catch (error) { if (!stopped) throw connectionError(error); }
    })();
    return { ready, stop };
  }
  async function host({ db, auth, sessionId, stream, onCount = () => {}, onError = () => {} }) {
    if (!validId(sessionId) || auth.currentUser?.uid !== C.ADMIN_UID) throw new Error("Entre com a conta administradora.");
    const session = db.ref(C.ROOT + "/webrtc/" + sessionId), meta = session.child("meta");
    const disconnect = meta.onDisconnect(), cleanup = [], users = new Map(), peers = new Map();
    let stopped = false;
    const count = () => onCount([...peers.values()].filter(peer => peer.pc.connectionState === "connected").length);
    function close(key) {
      const peer = peers.get(key);
      if (!peer) return;
      peers.delete(key); peer.cleanup.forEach(fn => fn());
      peer.pc.onicecandidate = null; peer.pc.onconnectionstatechange = null; peer.pc.close(); count();
    }
    async function accept(uid, snapshot) {
      const data = snapshot.val(), key = uid + "/" + snapshot.key;
      if (stopped || !data?.offer?.sdp || peers.has(key)) return;
      const node = session.child("listeners/" + key), pc = new RTCPeerConnection({ iceServers });
      const peer = { pc, cleanup: [] }; peers.set(key, peer);
      const alive = () => !stopped && peers.get(key) === peer;
      try {
        stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));
        pc.onicecandidate = event => { if (event.candidate && alive()) node.child("hostCandidates").push(event.candidate.toJSON()).catch(onError); };
        pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") close(key); else count(); };
        await pc.setRemoteDescription(data.offer);
        if (!alive()) return;
        observe(node.child("listenerCandidates"), "child_added", s => pc.addIceCandidate(s.val()).catch(() => {}), onError, peer.cleanup);
        const answer = await pc.createAnswer();
        if (!alive()) return;
        await pc.setLocalDescription(answer);
        if (alive()) await node.child("answer").set(description(pc.localDescription));
      } catch (error) { close(key); if (!stopped) onError(error); }
    }
    async function stop() {
      if (stopped) return;
      stopped = true;
      cleanup.splice(0).forEach(fn => fn());
      users.forEach(list => list.forEach(fn => fn())); users.clear();
      [...peers.keys()].forEach(close);
      await meta.update({ active: false }).catch(() => {});
      // Keep the disconnect fallback armed until the server acknowledges removal.
      await session.remove().then(() => disconnect.cancel()).catch(() => {});
    }
    try {
      await disconnect.update({ active: false });
      await meta.set({ active: true, ownerUid: auth.currentUser.uid, startedAt: firebase.database.ServerValue.TIMESTAMP });
      await session.child("listeners").once("value");
      observe(session.child("listeners"), "child_added", snapshot => {
        const uid = snapshot.key, list = [];
        users.set(uid, list);
        observe(session.child("listeners/" + uid), "child_added", snapshot => { accept(uid, snapshot); }, onError, list);
        observe(session.child("listeners/" + uid), "child_removed", snapshot => close(uid + "/" + snapshot.key), onError, list);
      }, onError, cleanup);
      observe(session.child("listeners"), "child_removed", snapshot => {
        const uid = snapshot.key;
        (users.get(uid) || []).forEach(fn => fn()); users.delete(uid);
        [...peers.keys()].filter(key => key.startsWith(uid + "/")).forEach(close);
      }, onError, cleanup);
      return { stop, sessionId };
    } catch (error) { await stop(); throw error; }
  }
  window.HimundimRTC = { listen, host, newId, verifyListenerAccess };
})();
