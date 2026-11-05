const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../radio-core');
const url = 'https://audio.example.test/live';
const programs = {
  public: { title: 'Publicado', published: true, audioUrl: url },
  hidden: { title: 'Oculto', published: false, audioUrl: url },
  broken: { title: 'Inválido', audioUrl: 'javascript:alert(1)' }
};

test('audio accepts HTTPS streams and rejects executable, insecure and page links', () => {
  assert.equal(C.audioUrl(url), url);
  for (const value of ['javascript:alert(1)', 'data:audio/wav;base64,AAAA', 'http://audio.example.test/live', 'https://user:secret@audio.example.test/live', 'https://www.youtube.com/watch?v=abc', 'https://open.spotify.com/track/abc']) assert.equal(C.audioUrl(value), '');
  assert.throws(() => C.requireAudio(''), /HTTPS/);
});
test('published programs exclude drafts, malformed records and unusable URLs', () => {
  assert.deepEqual(C.publishedPrograms({ ...programs, null: null, array: [] }).map(p => p.id), ['public']);
});
test('live source takes priority over schedule and continuous audio', () => {
  const source = C.selectSource({ live: { active: true, audioUrl: url }, programs, schedule: { s: { programId: 'public', startAt: 1000, endAt: 4000 } }, config: { continuousEnabled: true, continuousAudioUrl: url }, now: 2000 });
  assert.equal(source.kind, 'live');
});
test('microphone broadcast plays in the same public player without a public audio URL', () => {
  const live = { active: true, streamType: 'WEBRTC', webrtcSessionId: 'live_12345678', title: 'Microfone', studioAvailable: true };
  const source = C.selectSource({ live, config: { continuousEnabled: true, continuousAudioUrl: url } });
  assert.equal(source.kind, 'live');
  assert.equal(source.streamType, 'WEBRTC');
  assert.equal(source.audioUrl, '');
  assert.equal(source.id, 'live_12345678');
});
test('a disconnected studio falls back to the schedule and never replays a stale audio URL', () => {
  const live = { active: true, streamType: 'WEBRTC', webrtcSessionId: 'live_12345678', studioAvailable: false, audioUrl: url };
  assert.equal(C.selectSource({ live }), null);
  assert.equal(C.selectSource({ live, config: { continuousEnabled: true, continuousAudioUrl: url } }).kind, 'continuous');
  assert.equal(C.selectSource({ live: { ...live, studioAvailable: true, webrtcSessionId: '../outside' } }), null);
});
test('a draft or broken earlier schedule cannot mask an eligible program', () => {
  const schedule = { a: { programId: 'hidden', startAt: 1000, endAt: 4000 }, b: { programId: 'broken', startAt: 1000, endAt: 4000 }, c: { programId: 'public', startAt: 1000, endAt: 4000 } };
  assert.equal(C.selectSource({ schedule, programs, now: 2000 }).id, 'c');
});
test('schedule includes the start instant and excludes the end instant', () => {
  const schedule = { s: { programId: 'public', startAt: 1000, endAt: 4000 } };
  assert.equal(C.selectSource({ schedule, programs, now: 1000 }).kind, 'schedule');
  assert.equal(C.selectSource({ schedule, programs, now: 4000 }), null);
});
test('continuous audio must be explicitly enabled and valid', () => {
  assert.equal(C.selectSource({ config: { continuousAudioUrl: url } }), null);
  assert.equal(C.selectSource({ config: { continuousEnabled: true, continuousAudioUrl: 'http://bad.test' } }), null);
  assert.equal(C.selectSource({ config: { continuousEnabled: true, continuousAudioUrl: url } }).kind, 'continuous');
});
test('archive selection is explicit and cannot play a draft', () => {
  assert.equal(C.selectSource({ programs, manualId: 'public', live: { active: true, audioUrl: url } }).kind, 'library');
  assert.equal(C.selectSource({ programs, manualId: 'hidden' }), null);
});
test('overlaps are blocked while consecutive programs remain valid', () => {
  const schedule = { s: { startAt: 1000, endAt: 4000 } };
  assert.equal(C.hasOverlap({ startAt: 3999, endAt: 5000 }, schedule), true);
  assert.equal(C.hasOverlap({ startAt: 4000, endAt: 5000 }, schedule), false);
  assert.equal(C.hasOverlap({ startAt: 500, endAt: 1000 }, schedule), false);
  assert.equal(C.hasOverlap({ startAt: 1000, endAt: 4000 }, schedule, 's'), false);
});
test('legacy schedules without an end block new overlapping entries', () => {
  assert.equal(C.hasOverlap({ startAt: 3000, endAt: 4000 }, { s: { startAt: 1000 } }), true);
});
test('Brasilia inputs produce the same instant regardless of computer timezone', () => {
  const result = C.fromLocalInput('2026-11-05T09:30');
  assert.equal(result, Date.UTC(2026, 10, 5, 12, 30));
  assert.equal(C.toLocalInput(result), '2026-11-05T09:30');
});
test('impossible or incomplete calendar dates are rejected', () => {
  for (const value of ['', '2026-02-30T09:30', '2026-13-05T09:30', '2026-11-05T24:00', '2026-11-05', '2026-11-05T09:']) assert.equal(Number.isNaN(C.fromLocalInput(value)), true);
});
test('untrusted editorial content is escaped before HTML rendering', () => {
  const value = C.escape('<img src=x onerror="alert(1)"> & \'');
  assert.equal(value.includes('<'), false);
  assert.ok(value.includes('&lt;img'));
  assert.ok(value.includes('&quot;'));
});
