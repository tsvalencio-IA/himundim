const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Y = require('../radio-youtube');
const id = 'M7lc1UVf-VE';

test('YouTube URLs accept official watch, short, mobile, live and embed links only', () => {
  for (const value of [id, 'https://youtu.be/'+id, 'https://www.youtube.com/watch?v='+id+'&t=2', 'https://m.youtube.com/watch?v='+id, 'https://www.youtube.com/shorts/'+id, 'https://www.youtube.com/live/'+id, 'https://www.youtube-nocookie.com/embed/'+id]) assert.equal(Y.videoId(value), id);
  for (const value of ['', 'bad', 'javascript:alert(1)', 'https://youtube.com.evil.test/watch?v='+id, 'https://evilyoutube.com/watch?v='+id, 'https://youtube.com@evil.test/watch?v='+id, 'https://example.test/?v='+id]) assert.equal(Y.videoId(value), '');
});
test('late listeners join the current position and paused commands keep their saved position', () => {
  assert.equal(Y.position({ positionSec: 12, playing: true, startedAt: 1000 }, 6000), 17);
  assert.equal(Y.position({ positionSec: 12, playing: false, startedAt: 1000 }, 6000), 12);
  assert.equal(Y.position({ positionSec: -10, playing: true, startedAt: 10000 }, 6000), 0);
});
test('YouTube commands from another studio or an ended broadcast cannot play', () => {
  const command = { active: true, videoId: id, sessionId: 'live_himundim', volume: 180 };
  assert.equal(Y.normalize(command, 'live_biblia'), null);
  assert.equal(Y.normalize({ ...command, active: false }, 'live_himundim'), null);
  assert.equal(Y.normalize({ ...command, videoId: 'bad' }, 'live_himundim'), null);
  assert.equal(Y.normalize(command, 'live_himundim').volume, 100);
});

function surface(hold = false) {
  const calls = [], players = [], events = [];
  class Player {
    constructor(_mount, options) { this.events = options.events; players.push(this); if (!hold) queueMicrotask(() => this.events.onReady()); }
    loadVideoById(value) { calls.push(['load', value]); this.events.onStateChange({ data: 1 }); }
    cueVideoById(value) { calls.push(['cue', value]); }
    playVideo() { calls.push(['play']); this.events.onStateChange({ data: 1 }); }
    pauseVideo() { calls.push(['pause']); this.events.onStateChange({ data: 2 }); }
    stopVideo() { calls.push(['stop']); this.events.onStateChange({ data: 0 }); }
    seekTo(value) { calls.push(['seek', value]); }
    setVolume(value) { calls.push(['volume', value]); }
    mute() { calls.push(['mute']); }
    unMute() { calls.push(['unmute']); }
  }
  const window = { location: { origin: 'https://radio.test' }, document: { getElementById: () => ({ id: 'player' }) }, YT: { Player } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../radio-youtube'), 'utf8'), { window, URL, setTimeout, clearTimeout });
  const container = { hidden: true }, title = {}, notice = {};
  const api = window.HimundimYouTube.createSurface({ container, title, notice, mountId: 'player', now: () => 11000, onState: state => events.push(state) });
  return { api, calls, players, events, container, notice };
}
const command = { active: true, playing: true, videoId: id, title: 'Vídeo', sessionId: 'live_himundim', positionSec: 3, startedAt: 1000, volume: 60, command: 'PLAY', commandSeq: 1 };

test('listener click starts the embedded player; local pause is preserved across volume commands', async () => {
  const { api, calls, players, container } = surface();
  await api.update(command, 'live_himundim', false);
  assert.equal(container.hidden, false);
  assert.equal(players.length, 0, 'no player or autoplay before the listener clicks');
  api.setVolume(.5); await api.start();
  assert.equal(calls.find(call => call[0] === 'load')[1].startSeconds, 13);
  assert.ok(calls.some(call => call[0] === 'volume' && call[1] === 30));
  assert.equal(api.playing, true);
  api.pause(); const played = calls.filter(call => call[0] === 'play').length;
  await api.update({ ...command, command: 'VOLUME', commandSeq: 2, volume: 20 }, 'live_himundim');
  assert.equal(api.playing, false);
  assert.equal(calls.filter(call => call[0] === 'play').length, played);
  await api.start(); assert.equal(api.playing, true);
});
test('stopping while the iframe loads prevents delayed playback', async () => {
  const { api, calls, players, container } = surface(true);
  const starting = api.update(command, 'live_himundim', true);
  await new Promise(resolve => setImmediate(resolve));
  api.stop(); players[0].events.onReady(); await starting;
  assert.equal(container.hidden, true);
  assert.equal(api.playing, false);
  assert.equal(calls.filter(call => call[0] === 'load' || call[0] === 'play').length, 0);
});
test('pause, volume, blocked autoplay and session changes are reflected without false playback', async () => {
  const { api, players, calls, events, container } = surface();
  await api.update(command, 'live_himundim', true);
  await api.update({ ...command, playing: false, positionSec: 15, startedAt: 0, command: 'PAUSE', commandSeq: 2 }, 'live_himundim', true);
  assert.equal(api.playing, false);
  assert.ok(calls.some(call => call[0] === 'seek' && call[1] === 15));
  players[0].events.onAutoplayBlocked(); assert.ok(events.includes('blocked'));
  await api.update(command, 'other_session', true);
  assert.equal(container.hidden, true); assert.equal(api.active, false);
});
