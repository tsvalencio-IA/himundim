const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const C = require('../radio-core');
const source = fs.readFileSync(require.resolve('../radio-rtc.js'), 'utf8');
const drain = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };

function database() {
  let tree = {};
  const watchers = new Set(), writes = [], disconnects = [];
  const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
  const get = (path, data = tree) => path.split('/').reduce((obj, key) => obj?.[key], data) ?? null;
  const snap = (path, value = get(path)) => ({ key: path.split('/').pop(), val: () => copy(value) });
  function set(path, value) {
    assert.ok(path.startsWith(C.ROOT + '/'), 'all writes must stay inside Hi-Mundim');
    const before = copy(tree); writes.push(path);
    const parts = path.split('/'); let parent = tree;
    for (const part of parts.slice(0, -1)) parent = parent[part] ||= {};
    if (value == null) delete parent[parts.at(-1)]; else parent[parts.at(-1)] = copy(value);
    for (const w of watchers) {
      const a = get(w.path, before), b = get(w.path);
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (w.event === 'value') queueMicrotask(() => { if (watchers.has(w)) w.callback(snap(w.path, b)); });
      const keys = w.event === 'child_added' ? Object.keys(b || {}).filter(k => !(k in (a || {}))) : w.event === 'child_removed' ? Object.keys(a || {}).filter(k => !(k in (b || {}))) : [];
      keys.forEach(key => queueMicrotask(() => { if (watchers.has(w)) w.callback(snap(w.path + '/' + key, (w.event === 'child_added' ? b : a)[key])); }));
    }
    return Promise.resolve();
  }
  let next = 0;
  class Ref {
    constructor(path) { this.path = path; }
    child(path) { return new Ref(this.path + '/' + path); }
    set(value) { return set(this.path, value); }
    update(value) { return set(this.path, { ...get(this.path), ...value }); }
    remove() { return set(this.path, null); }
    push(value) { const ref = this.child('item_' + (++next)); return value === undefined ? ref : ref.set(value); }
    once() { return Promise.resolve(snap(this.path)); }
    on(event, callback) {
      const w = { path: this.path, event, callback }; watchers.add(w);
      queueMicrotask(() => {
        if (!watchers.has(w)) return;
        if (event === 'value') callback(snap(this.path));
        if (event === 'child_added') Object.entries(get(this.path) || {}).forEach(([key, value]) => callback(snap(this.path + '/' + key, value)));
      });
    }
    off(event, callback) { for (const w of watchers) if (w.path === this.path && w.event === event && w.callback === callback) watchers.delete(w); }
    onDisconnect() {
      return { update: async value => disconnects.push({ path: this.path, value }), remove: async () => disconnects.push({ path: this.path, remove: true }), cancel: async () => {} };
    }
  }
  return { ref: path => new Ref(path), writes, disconnects, watchers, get };
}

function runtime(firebaseExtras = {}) {
  const peers = [];
  class Peer {
    constructor() { this.id = peers.length; peers.push(this); this.connectionState = 'new'; this.remoteDescription = null; }
    addTransceiver() {}
    addTrack(track, stream) { this.track = track; this.stream = stream; }
    async createOffer() { return { type: 'offer', sdp: 'offer:' + this.id }; }
    async createAnswer() { return { type: 'answer', sdp: 'answer:' + this.id }; }
    async setLocalDescription(description) {
      this.localDescription = description;
      this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'candidate:' + this.id }) } });
    }
    async setRemoteDescription(description) {
      this.remoteDescription = description;
      if (description.type === 'answer') {
        const remote = peers[Number(description.sdp.split(':')[1])];
        this.ontrack?.({ streams: [remote.stream], track: remote.track });
        this.connectionState = remote.connectionState = 'connected';
        this.onconnectionstatechange?.(); remote.onconnectionstatechange?.();
      }
    }
    async addIceCandidate() { assert.ok(this.remoteDescription, 'ICE must wait for remote SDP'); }
    close() { this.connectionState = 'closed'; }
  }
  const window = { HimundimRadio: C, RTCPeerConnection: Peer };
  vm.runInNewContext(source, { window, RTCPeerConnection: Peer, crypto: webcrypto, Uint8Array,
    firebase: { database: { ServerValue: { TIMESTAMP: 1 } }, ...firebaseExtras }, MediaStream: class {}, console });
  return { rtc: window.HimundimRTC, peers };
}
const audio = () => ({ srcObject: null, paused: true, async play() { this.paused = false; }, pause() { this.paused = true; } });

test('studio and listener negotiate under the isolated namespace and release every peer and subscription', async () => {
  const db = database(), { rtc, peers } = runtime(), counts = [], states = [], failures = [];
  const stream = { getAudioTracks: () => [{ kind: 'audio' }] };
  const host = await rtc.host({ db, auth: { currentUser: { uid: C.ADMIN_UID } }, sessionId: 'live_test1234', stream, onCount: n => counts.push(n), onError: error => failures.push(error) });
  const auth = { currentUser: null, async signInAnonymously() { this.currentUser = { uid: 'anonymous-test' }; } };
  const output = audio();
  const listener = rtc.listen({ db, auth, sessionId: host.sessionId, audio: output, onState: state => states.push(state) });
  await listener.ready; await drain();
  assert.equal(output.srcObject, stream);
  assert.equal(output.paused, false);
  assert.ok(states.includes('connected'));
  assert.ok(counts.includes(1));
  assert.deepEqual(failures, []);
  assert.ok(db.writes.some(path => path.includes('/listenerCandidates/')), 'early listener ICE must survive publishing the offer');
  assert.ok(db.writes.some(path => path.includes('/hostCandidates/')));
  assert.equal(db.disconnects.length, 2, 'both broadcaster and listener arm disconnect cleanup');
  listener.stop(); await drain();
  assert.equal(output.srcObject, null);
  assert.equal(counts.at(-1), 0);
  await host.stop(); await drain();
  assert.equal(db.get(C.ROOT + '/webrtc/live_test1234'), null);
  assert.equal(db.watchers.size, 0);
  assert.ok(peers.every(peer => peer.connectionState === 'closed'));
});

test('cancelling while anonymous authentication is pending cannot create a hidden listener', async () => {
  const db = database(), { rtc, peers } = runtime();
  let finish;
  const auth = { currentUser: null, signInAnonymously() { return new Promise(resolve => { finish = () => { this.currentUser = { uid: 'late-user' }; resolve(); }; }); } };
  const output = audio(), listener = rtc.listen({ db, auth, sessionId: 'live_test1234', audio: output });
  listener.stop(); finish(); await listener.ready; await drain();
  assert.equal(db.writes.length, 0);
  assert.equal(peers.length, 0);
  assert.equal(output.paused, true);
});

test('invalid sessions and non-admin broadcasters cannot write signalling records', async () => {
  const db = database(), { rtc } = runtime();
  assert.throws(() => rtc.listen({ db, auth: {}, sessionId: '../biblia', audio: audio() }), /indisponível/);
  await assert.rejects(rtc.host({ db, auth: { currentUser: { uid: 'other-user' } }, sessionId: 'live_test1234', stream: {} }), /administradora/);
  assert.equal(db.writes.length, 0);
});

test('listener permission preflight uses a separate session and deletes its probe account', async () => {
  const db = database(); let deletedUser = false, deletedApp = false, persistence = '';
  const probeAuth = { currentUser: null, async setPersistence(value) { persistence = value; }, async signInAnonymously() { this.currentUser = { uid: 'probe-user', async delete() { deletedUser = true; } }; } };
  const { rtc } = runtime({ auth: { Auth: { Persistence: { NONE: 'none' } } }, initializeApp: (_config, name) => {
    assert.ok(name.startsWith('himundim-check-'));
    return { auth: () => probeAuth, database: () => db, async delete() { deletedApp = true; } };
  } });
  await rtc.verifyListenerAccess('live_test1234');
  assert.equal(persistence, 'none');
  assert.equal(deletedUser, true);
  assert.equal(deletedApp, true);
  assert.equal(db.get(C.ROOT + '/webrtc/live_test1234/listeners/probe-user/connection_check'), null);
});

test('blocked listener preflight returns an actionable failure and still clears its anonymous session', async () => {
  let deletedUser = false, deletedApp = false;
  const probeAuth = { currentUser: null, async setPersistence() {}, async signInAnonymously() { this.currentUser = { uid: 'probe-user', async delete() { deletedUser = true; } }; } };
  const { rtc } = runtime({ auth: { Auth: { Persistence: { NONE: 'none' } } }, initializeApp: () => ({ auth: () => probeAuth, database: () => ({ ref: () => ({ async set() { throw new Error('PERMISSION_DENIED'); }, async remove() {} }) }), async delete() { deletedApp = true; } }) });
  await assert.rejects(rtc.verifyListenerAccess('live_test1234'), /Firebase.*conexão dos ouvintes/);
  assert.equal(deletedUser, true);
  assert.equal(deletedApp, true);
});
