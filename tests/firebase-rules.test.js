const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const current = JSON.parse(fs.readFileSync(require.resolve('../docs/firebase-database.rules.json'), 'utf8'));
const original = JSON.parse(fs.readFileSync(require.resolve('./fixtures/firebase-original.rules.json'), 'utf8'));
const admin = 'C19UZ7R1OSRaAGZ3XSXfBFaUzMD2';
const expression = current.rules.radio.himundim.webrtc.$sessionId.listeners.$uid.$connectionId;
function snapshot(value) { return { val: () => value ?? null, exists: () => value != null, child: path => snapshot(path.split('/').reduce((node, key) => node?.[key], value)) }; }
function allowed({ authUid = 'listener', pathUid = 'listener', active = true, type = 'WEBRTC', session = 'live_himundim', requestedSession = 'live_himundim', newValue = { uid: 'listener', offer: { type: 'offer', sdp: 'test' } }, onlyBible = false } = {}) {
  const live = { active, streamType: type, webrtcSessionId: session };
  const root = snapshot({ radio: onlyBible ? { live } : { himundim: { live } } });
  const args = [authUid ? { uid: authUid } : null, root, snapshot(newValue), pathUid, requestedSession];
  // Execute the exact rule conditions, including the inherited administrative grant.
  const evaluate = value => new Function('auth', 'root', 'newData', '$uid', '$sessionId', 'return (' + value + ');')(...args);
  return (!!evaluate(current.rules.radio['.write']) || !!evaluate(expression['.write'])) && (newValue === null || !!evaluate(expression['.validate']));
}
test('the supplied Bible rules are preserved exactly, with only the Hi-Mundim subtree added', () => {
  const copy = structuredClone(current); delete copy.rules.radio.himundim;
  assert.deepEqual(copy, original);
});
test('Hi-Mundim listeners can join their own active session and cannot write another listener', () => {
  assert.equal(allowed(), true);
  assert.equal(allowed({ pathUid: 'other' }), false);
  assert.equal(allowed({ newValue: { uid: 'other' } }), false);
  assert.equal(allowed({ authUid: null }), false);
});
test('Bible activity never unlocks Hi-Mundim; inactive, wrong-type and foreign sessions are rejected', () => {
  assert.equal(allowed({ onlyBible: true }), false);
  assert.equal(allowed({ active: false }), false);
  assert.equal(allowed({ type: 'URL' }), false);
  assert.equal(allowed({ requestedSession: 'live_other' }), false);
});
test('the owner keeps administrative access and listeners can clean only their own connection', () => {
  assert.equal(allowed({ authUid: admin, active: false }), true);
  assert.equal(allowed({ active: false, newValue: null }), true);
  assert.equal(allowed({ active: false, pathUid: 'other', newValue: null }), false);
});
