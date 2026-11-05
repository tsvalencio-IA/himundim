const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const C = require('../radio-core');
const Y = require('../radio-youtube');
const videoId = 'M7lc1UVf-VE';
const drain = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

function setup(key = 'isolated-test-key') {
  const nodes = new Map(), requests = [], writes = [], stored = new Map(), previews = [];
  let previewStops = 0;
  const element = id => {
    if (!nodes.has(id)) nodes.set(id, { id, value: '', textContent: '', innerHTML: '', disabled: false, hidden: false, open: false, handlers: {}, dataset: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this[name] = value; }, focus() { this.focused = true; }
    });
    return nodes.get(id);
  };
  element('masterVolume').value = '100'; element('youtubeAirVolume').value = '35';
  const db = { ref(path) { return { async set(value) { writes.push({ path, value }); stored.set(path, value); }, async update(value) { writes.push({ path, value }); stored.set(path, { ...stored.get(path), ...value }); }, async once() { return { val: () => stored.get(path) || null }; }, push() { return db.ref(path + '/asset_test'); } }; } };
  const studio = { active: false, sessionId: '' };
  const window = { HimundimRadio: C, HimundimYouTube: { ...Y, createSurface: () => ({ async update(value) { previews.push(value); }, stop() { previewStops++; } }) } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../admin/youtube'), 'utf8'), {
    window, document: { getElementById: element }, URL, AbortSignal, setTimeout, clearTimeout,
    localStorage: { getItem: () => key, setItem() {} }, firebase: { database: { ServerValue: { TIMESTAMP: 1000 } } },
    fetch: async input => {
      const url = new URL(input); requests.push(url);
      return { ok: true, async json() { return url.pathname.endsWith('/search') ? { items: [{ id: { videoId }, snippet: { title: 'Resultado <de teste>', thumbnails: { medium: { url: 'https://i.ytimg.com/vi/'+videoId+'/mqdefault.jpg' } } } }] } : { title: 'Vídeo de teste' }; } };
    }
  });
  const api = window.HimundimYoutubeStudio.create({ db, auth: { currentUser: { uid: C.ADMIN_UID } }, canWrite: () => true, studio });
  const submit = async value => { element('youtubeSearch').value = value; element('youtubeSearchForm').onsubmit({ preventDefault() {} }); await drain(); };
  const clickResult = async action => { element('youtubeSection').handlers.click({ target: { closest: () => ({ dataset: { [action]: videoId } }) } }); await drain(); };
  return { element, nodes, requests, writes, previews, studio, api, submit, clickResult, get previewStops() { return previewStops; } };
}

test('a normal 11-letter music query searches inside the studio and renders the three original actions', async () => {
  const app = setup(); await app.submit('louvorpiano');
  assert.equal(app.requests.length, 1);
  assert.equal(app.requests[0].origin, 'https://www.googleapis.com');
  assert.equal(app.requests[0].searchParams.get('q'), 'louvorpiano');
  const html = app.element('youtubeSearchResults').innerHTML;
  for (const action of ['Pré-ouvir (só eu)', 'Tocar para ouvintes', 'Salvar na biblioteca']) assert.ok(html.includes(action));
  assert.ok(html.includes('&lt;de teste&gt;'));
  assert.equal(app.element('youtubeUrl').value, '', 'search results do not require copying a URL');
  assert.equal(app.nodes.has('youtubeExternalSearch'), false);
});
test('choosing a result previews only locally; sending it writes only the Hi-Mundim broadcast command', async () => {
  const app = setup(); await app.submit('piano'); await app.clickResult('youtubePreview');
  assert.equal(app.previews[0].videoId, videoId);
  assert.equal(app.writes.length, 0, 'private preview cannot change the radio');
  assert.equal(app.element('youtubeSendBtn').disabled, true);
  app.studio.active = true; app.studio.sessionId = 'live_himundim';
  app.api.setLive({ active: true, streamType: 'WEBRTC', webrtcSessionId: 'live_himundim' });
  await app.clickResult('youtubeSend');
  assert.equal(app.writes.length, 1);
  assert.equal(app.writes[0].path, 'radio/himundim/liveMedia/youtube');
  assert.equal(app.writes[0].value.videoId, videoId);
  assert.equal(app.writes[0].value.sessionId, 'live_himundim');
  assert.equal(app.previewStops, 1);
});
test('missing search configuration stays in the studio and never substitutes an external search', async () => {
  const app = setup(''); await app.submit('piano');
  assert.equal(app.requests.length, 0);
  assert.equal(app.element('youtubeSearchSettings').open, true);
  assert.equal(app.element('youtubeApiKey').focused, true);
  assert.equal(app.nodes.has('youtubeExternalSearch'), false);
  assert.ok(app.element('youtubeStatus').textContent.includes('chave YouTube Data API'));
});
