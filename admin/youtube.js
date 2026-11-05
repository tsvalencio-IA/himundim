(() => {
  "use strict";
  const C = window.HimundimRadio, Y = window.HimundimYouTube, $ = id => document.getElementById(id);
  window.HimundimYoutubeStudio = { create({ db, auth, canWrite, studio }) {
    let live = {}, media = {}, selected = null, library = {}, results = {}, writing = false, queue = Promise.resolve(), volumeTimer = null;
    const notice = (text, error = false) => { $("youtubeStatus").textContent = text; $("youtubeStatus").dataset.tone = error ? "error" : "info"; };
    const preview = Y.createSurface({ container: $("youtubePreview"), mountId: "youtubePreviewPlayer", title: $("youtubePreviewTitle"), notice: $("youtubePreviewStatus"), blockedText: "Toque no botão de reprodução do vídeo para iniciar a pré-escuta." });
    const ownsLive = () => studio.active && C.isRtcLive(live) && live.webrtcSessionId === studio.sessionId;
    const current = () => Y.normalize(media, studio.sessionId);
    const stamp = () => ({ updatedBy: auth.currentUser.uid, updatedAt: firebase.database.ServerValue.TIMESTAMP });
    const effectiveVolume = () => Math.round(Math.min(100, Number($("youtubeAirVolume").value) * Number($("masterVolume").value) / 100));
    function controls() {
      const item = current(), on = ownsLive(), paused = item && item.playing === false;
      const hasSelection = !!selected || !!Y.videoId($("youtubeUrl").value);
      $("youtubePreviewBtn").disabled = !hasSelection;
      $("youtubeSaveBtn").disabled = writing || !hasSelection;
      $("youtubeSendBtn").disabled = writing || !on || !hasSelection;
      $("youtubeAirPlayBtn").disabled = writing || !on || !paused;
      $("youtubeAirPauseBtn").disabled = writing || !on || !item || paused;
      $("youtubeAirStopBtn").disabled = writing || !on || !item;
      $("youtubeAirMuteBtn").disabled = writing || !on || !item;
      $("youtubeAirMuteBtn").textContent = item?.muted ? "Reativar YouTube" : "Silenciar YouTube";
      $("youtubeAirMuteBtn").setAttribute("aria-pressed", String(!!item?.muted));
      $("youtubeAirNow").textContent = item ? item.title + (item.playing === false ? " · pausado" : " · enviado aos ouvintes") : "Nenhum YouTube na transmissão.";
      $("youtubeLiveHint").textContent = on ? "Escolha um vídeo e toque em Tocar para ouvintes." : "Ative o microfone e entre ao vivo para enviar o YouTube aos ouvintes. A pré-escuta já pode ser usada.";
    }
    function publish(change) {
      const operation = queue.catch(() => {}).then(async () => {
        if (!canWrite() || !ownsLive()) throw new Error("Entre ao vivo neste aparelho antes de enviar o YouTube para os ouvintes.");
        writing = true; controls();
        try {
          const payload = { ...change(current()), sessionId: studio.sessionId, volume: effectiveVolume(), ...stamp(), commandSeq: Math.max(Date.now(), Number(media.commandSeq || 0) + 1) };
          const ref = db.ref(C.ROOT + "/liveMedia/youtube");
          await ref.set(payload);
          media = C.record((await ref.once("value")).val());
        } finally { writing = false; controls(); }
      });
      queue = operation; return operation;
    }
    async function metadata(raw) {
      const id = Y.videoId(raw);
      if (!id) throw new Error("Informe um link válido do YouTube.");
      if (selected?.videoId === id) return selected;
      selected = { videoId: id, title: "YouTube · " + id, url: Y.watchUrl(id), thumbnail: "https://i.ytimg.com/vi/" + id + "/mqdefault.jpg" };
      const item = selected;
      (async () => { try {
        const url = new URL("https://www.youtube.com/oembed"); url.searchParams.set("url", Y.watchUrl(id)); url.searchParams.set("format", "json");
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (response.ok) { const value = await response.json(); if (value.title) item.title = value.title; if (selected === item) $("youtubeSelectedTitle").textContent = item.title; }
      } catch (_) {} })();
      return item;
    }
    async function pickLink() { const item = selected || await metadata($("youtubeUrl").value); $("youtubeSelectedTitle").textContent = item.title; controls(); return item; }
    function attempt(action) { Promise.resolve().then(action).catch(error => notice(error.message || "Não foi possível concluir a ação do YouTube.", true)); }
    async function previewItem(item) {
      selected = item; $("youtubeUrl").value = item.url; $("youtubeSelectedTitle").textContent = item.title;
      controls();
      await preview.update({ ...item, active: true, playing: true, positionSec: 0, startedAt: Date.now(), volume: 70, command: "PLAY", commandSeq: Date.now() }, null, true);
      notice("Pré-escuta aberta neste aparelho.");
    }
    async function sendItem(item) {
      selected = item; $("youtubeUrl").value = item.url; $("youtubeSelectedTitle").textContent = item.title;
      controls();
      preview.stop();
      await publish(() => ({ active: true, playing: true, videoId: item.videoId, title: item.title, positionSec: 0, startedAt: firebase.database.ServerValue.TIMESTAMP, muted: false, command: "PLAY" }));
      notice("YouTube enviado ao player da página do ouvinte.");
    }
    async function saveItem(item) {
      if (!canWrite()) throw new Error("Aguarde a conexão da rádio para salvar na biblioteca.");
      const existing = C.entries(library).find(row => row.kind === "YOUTUBE" && Y.videoId(row.youtubeId || row.url) === item.videoId);
      const ref = existing ? db.ref(C.ROOT + "/library/" + existing.id) : db.ref(C.ROOT + "/library").push();
      await ref.update({ name: item.title, kind: "YOUTUBE", sourceType: "YOUTUBE", youtubeId: item.videoId, url: item.url, thumbnail: item.thumbnail, ...(!existing ? { createdAt: firebase.database.ServerValue.TIMESTAMP } : {}), ...stamp() });
      notice("YouTube salvo na biblioteca da Hi-Mundim.");
    }
    function card(item, key, saved = false) {
      return '<article class="youtube-card"><img src="' + C.escape(item.thumbnail || "https://i.ytimg.com/vi/" + item.videoId + "/mqdefault.jpg") + '" alt="" loading="lazy"><div><h3>' + C.escape(item.title) + '</h3><div class="btn-row"><button class="btn secondary compact" type="button" data-youtube-preview="' + C.escape(key) + '">Pré-ouvir (só eu)</button><button class="btn compact" type="button" data-youtube-send="' + C.escape(key) + '">Tocar para ouvintes</button>' + (saved ? "" : '<button class="btn secondary compact" type="button" data-youtube-save="' + C.escape(key) + '">Salvar na biblioteca</button>') + '</div></div></article>';
    }
    function renderLibrary() {
      const query = $("youtubeLibrarySearch").value.trim().toLocaleLowerCase("pt-BR");
      const rows = C.entries(library).filter(row => row.kind === "YOUTUBE" && Y.videoId(row.youtubeId || row.url) && String(row.name || "").toLocaleLowerCase("pt-BR").includes(query));
      $("youtubeLibraryList").innerHTML = rows.length ? rows.map(row => card({ videoId: Y.videoId(row.youtubeId || row.url), title: row.name || "YouTube", thumbnail: row.thumbnail }, "library_" + row.id, true)).join("") : '<p class="empty">' + (query ? "Nenhum YouTube encontrado." : "Os vídeos salvos ficam aqui para usar em outros programas.") + '</p>';
    }
    $("youtubeUrl").oninput = () => { selected = null; $("youtubeSelectedTitle").textContent = Y.videoId($("youtubeUrl").value) ? "Link de vídeo informado." : "Nenhum vídeo selecionado."; controls(); };
    $("youtubePreviewBtn").onclick = () => attempt(async () => previewItem(await pickLink()));
    $("youtubeSendBtn").onclick = () => attempt(async () => sendItem(await pickLink()));
    $("youtubeSaveBtn").onclick = () => attempt(async () => saveItem(await pickLink()));
    $("youtubeClosePreviewBtn").onclick = preview.stop;
    $("youtubeAirPauseBtn").onclick = () => attempt(async () => {
      await publish(item => ({ ...item, playing: false, positionSec: Y.position(item), startedAt: 0, command: "PAUSE" })); notice("YouTube pausado para os ouvintes.");
    });
    $("youtubeAirPlayBtn").onclick = () => attempt(async () => {
      await publish(item => ({ ...item, playing: true, startedAt: firebase.database.ServerValue.TIMESTAMP, command: "PLAY" })); notice("Retomada do YouTube enviada aos ouvintes.");
    });
    $("youtubeAirStopBtn").onclick = () => attempt(async () => { await publish(item => ({ ...item, active: false, playing: false, command: "STOP" })); notice("YouTube retirado da transmissão."); });
    $("youtubeAirMuteBtn").onclick = () => attempt(() => publish(item => ({ ...item, muted: !item.muted, command: "VOLUME" })));
    $("youtubeAirVolume").oninput = () => {
      $("youtubeAirVolumeLabel").textContent = $("youtubeAirVolume").value + "%";
      clearTimeout(volumeTimer); if (ownsLive() && current()) volumeTimer = setTimeout(() => attempt(() => publish(item => ({ ...item, command: "VOLUME" }))), 160);
    };
    $("masterVolume").addEventListener("input", () => { clearTimeout(volumeTimer); if (ownsLive() && current()) volumeTimer = setTimeout(() => attempt(() => publish(item => ({ ...item, command: "VOLUME" }))), 160); });
    $("youtubeLibrarySearch").oninput = renderLibrary;
    try { $("youtubeApiKey").value = localStorage.getItem("himundim-youtube-api-key") || ""; } catch (_) {}
    $("youtubeKeySaveBtn").onclick = () => { try { localStorage.setItem("himundim-youtube-api-key", $("youtubeApiKey").value.trim()); notice("Chave de pesquisa salva neste aparelho."); } catch (_) { notice("O navegador não permitiu salvar a chave neste aparelho.", true); } };
    $("youtubeSearchForm").onsubmit = event => {
      event.preventDefault(); attempt(async () => {
        const query = $("youtubeSearch").value.trim();
        if (!query) throw new Error("Digite o que deseja pesquisar.");
        if (/^(https?:\/\/|(?:www\.|m\.)?youtube\.com\/|youtu\.be\/)/i.test(query) && Y.videoId(query)) { const item = await metadata(query); results = { [item.videoId]: item }; $("youtubeSearchResults").innerHTML = card(item, item.videoId); return; }
        const key = $("youtubeApiKey").value.trim();
        if (!key) { notice("A pesquisa interna precisa da chave YouTube Data API já usada no Bíblia. Informe a chave na configuração desta tela para carregar os resultados aqui.", true); $("youtubeSearchSettings").open = true; $("youtubeApiKey").focus(); return; }
        $("youtubeSearchBtn").disabled = true; notice("Pesquisando no YouTube…");
        try {
          const url = new URL("https://www.googleapis.com/youtube/v3/search");
          for (const [name, value] of Object.entries({ part: "snippet", type: "video", videoEmbeddable: "true", videoSyndicated: "true", maxResults: "8", q: query, key })) url.searchParams.set(name, value);
          const response = await fetch(url, { signal: AbortSignal.timeout(15000) }), body = await response.json();
          if (!response.ok) throw new Error(body.error?.message || "Não foi possível pesquisar no YouTube.");
          results = {};
          for (const item of body.items || []) {
            const id = Y.videoId(item.id?.videoId);
            if (id) results[id] = { videoId: id, title: item.snippet?.title || "YouTube", url: Y.watchUrl(id), thumbnail: item.snippet?.thumbnails?.medium?.url || "" };
          }
          $("youtubeSearchResults").innerHTML = Object.values(results).map(item => card(item, item.videoId)).join("") || '<p class="empty">Nenhum vídeo encontrado.</p>';
          notice("Escolha um resultado para pré-ouvir, enviar aos ouvintes ou salvar.");
        } finally { $("youtubeSearchBtn").disabled = false; }
      });
    };
    $("youtubeSection").addEventListener("click", event => {
      const button = event.target.closest("[data-youtube-preview], [data-youtube-send], [data-youtube-save]");
      if (!button) return;
      const key = button.dataset.youtubePreview || button.dataset.youtubeSend || button.dataset.youtubeSave;
      const row = key.startsWith("library_") ? library[key.slice(8)] : results[key];
      if (!row) return;
      const item = { videoId: Y.videoId(row.videoId || row.youtubeId || row.url), title: row.title || row.name || "YouTube", url: Y.watchUrl(row.videoId || row.youtubeId || row.url), thumbnail: row.thumbnail || "" };
      attempt(() => button.dataset.youtubePreview ? previewItem(item) : button.dataset.youtubeSend ? sendItem(item) : saveItem(item));
    });
    controls();
    return { setLive(value) { live = value; controls(); }, setMedia(value) { media = value; controls(); }, setLibrary(value) { library = value; renderLibrary(); }, closePreview: preview.stop };
  } };
})();
