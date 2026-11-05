(() => {
  "use strict";
  const $ = id => document.getElementById(id), C = window.HimundimRadio, Y = window.HimundimYouTube;
  const audio = $("audio"), play = $("playBtn"), miniPlay = $("miniPlayBtn");
  const state = $("audioState");
  if (!C || !window.firebase || !window.HIMUNDIM_FIREBASE_CONFIG || window.HIMUNDIM_DB_ROOT !== C.ROOT) {
    state.textContent = "Não foi possível carregar a rádio. Verifique a conexão e recarregue.";
    $("connectionText").textContent = "Rádio indisponível";
    $("programLibrary").textContent = "Não foi possível consultar os programas.";
    return;
  }
  const app = firebase.initializeApp(window.HIMUNDIM_FIREBASE_CONFIG), db = app.database(), auth = app.auth();
  let live = {}, programs = {}, schedule = {}, config = {}, current = null, currentKey = "", youtubeState = {}, rtcFailure = "";
  let manualId = "", wantsPlayback = false, boundaryTimer = null, connected = false;
  let rtc = null, rtcAttempt = 0, rtcTimer = null, connectingLive = false, rtcConnected = false, liveMeta = null;
  const loaded = new Set(), failures = new Set();
  const youtube = Y.createSurface({ container: $("radioYoutube"), mountId: "radioYoutubePlayer", title: $("radioYoutubeTitle"), notice: $("radioYoutubeStatus"),
    onState: status => {
      if (!current || current.streamType !== "WEBRTC") return;
      $("activateYoutubeBtn").hidden = status !== "blocked" && status !== "error";
      if (status === "playing" && wantsPlayback) state.textContent = rtcFailure ? "YouTube reproduzindo. A voz do estúdio não conectou." : "Reproduzindo";
      controls();
    }
  });
  try {
    const saved = localStorage.getItem("himundim-volume");
    if (saved !== null && Number.isFinite(Number(saved))) $("volume").value = Math.max(0, Math.min(1, Number(saved)));
  } catch (_) {}
  audio.volume = Number($("volume").value);
  youtube.setVolume(audio.volume);
  function source() { return C.selectSource({ live, programs, schedule, config, manualId }); }
  function youtubeAvailable() { return current?.streamType === "WEBRTC" && !!Y.normalize(youtubeState, current.webrtcSessionId); }
  function syncYoutube(shouldPlay = wantsPlayback) {
    if (!youtubeAvailable()) { youtube.stop(); return Promise.resolve(); }
    return youtube.update(youtubeState, current.webrtcSessionId, shouldPlay).catch(error => { $("radioYoutubeStatus").textContent = error.message; $("activateYoutubeBtn").hidden = false; });
  }
  function controls() {
    const playing = youtube.playing || !audio.paused && !audio.ended && (current?.streamType !== "WEBRTC" || rtcConnected);
    play.querySelector(".play-symbol").textContent = playing ? "❚❚" : "▶";
    play.querySelector(".play-copy").textContent = playing ? "PAUSAR" : connectingLive ? "CONECTANDO…" : "OUVIR AGORA";
    play.setAttribute("aria-busy", String(connectingLive));
    play.setAttribute("aria-label", playing ? "Pausar áudio" : "Ouvir áudio");
    play.setAttribute("aria-pressed", String(playing));
    miniPlay.textContent = playing ? "❚❚" : "▶";
    miniPlay.setAttribute("aria-label", playing ? "Pausar áudio" : "Ouvir áudio");
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = playing ? "playing" : current ? "paused" : "none"; } catch (_) {}
    }
  }
  function stopRtc() {
    rtcAttempt++; clearTimeout(rtcTimer); rtcTimer = null;
    connectingLive = false; rtcConnected = false;
    if (rtc) { const old = rtc; rtc = null; old.stop(); }
  }
  async function startPlayback() {
    if (!current) return;
    wantsPlayback = true;
    rtcFailure = "";
    const expectedKey = currentKey;
    state.textContent = "Carregando áudio…";
    $("retryAudioBtn").hidden = true;
    syncYoutube(true);
    try {
      if (current.streamType === "WEBRTC" && !audio.srcObject) {
        stopRtc(); connectingLive = true; controls();
        const attempt = rtcAttempt;
        const fail = text => {
          if (attempt !== rtcAttempt || expectedKey !== currentKey) return;
          rtcFailure = text;
          if (!youtubeAvailable()) wantsPlayback = false;
          stopRtc();
          state.textContent = youtube.playing ? "YouTube reproduzindo. A voz do estúdio não conectou." : text;
          $("retryAudioBtn").hidden = false; controls();
        };
        rtc = window.HimundimRTC.listen({ db, auth, sessionId: current.webrtcSessionId, audio,
          onState: (status, error) => {
            if (attempt !== rtcAttempt || expectedKey !== currentKey || !wantsPlayback) return;
            if (status === "failed" || status === "error") return fail(error?.message || "A transmissão não conectou. Toque em Tentar áudio novamente.");
            if (status === "connected") { rtcConnected = true; connectingLive = false; clearTimeout(rtcTimer); state.textContent = audio.paused ? "Toque em Ouvir agora para iniciar o áudio." : "Reproduzindo"; controls(); }
            if (status === "tap") { connectingLive = false; state.textContent = "Toque em Ouvir agora para iniciar o áudio."; controls(); }
            if (status === "connecting") state.textContent = "Conectando à rádio…";
            if (status === "reconnecting") { rtcConnected = false; connectingLive = true; state.textContent = "Reconectando à transmissão…"; clearTimeout(rtcTimer); rtcTimer = setTimeout(() => fail("A conexão com o estúdio foi interrompida. Tente novamente."), 15000); controls(); }
          }
        });
        rtcTimer = setTimeout(() => fail("Não foi possível conectar ao estúdio. Tente novamente."), 30000);
        await rtc.ready;
        return;
      }
      await audio.play();
    }
    catch (error) {
      if (expectedKey !== currentKey || error.name === "AbortError") return;
      rtcFailure = current?.streamType === "WEBRTC" ? error.message : "";
      if (!youtubeAvailable()) wantsPlayback = false;
      if (current?.streamType === "WEBRTC") stopRtc();
      state.textContent = error.name === "NotAllowedError" ? "Toque em Ouvir agora para iniciar." : current?.streamType === "WEBRTC" ? error.message : "O áudio não pôde ser iniciado. Confira sua conexão ou tente novamente.";
      $("retryAudioBtn").hidden = false;
      controls();
    }
  }
  function pausePlayback() {
    wantsPlayback = false;
    youtube.pause();
    stopRtc();
    audio.pause();
    controls();
  }
  function togglePlayback() { if (youtube.playing || connectingLive || !audio.paused && !audio.ended) pausePlayback(); else startPlayback(); }
  function updateMetadata() {
    if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) return;
    try {
      navigator.mediaSession.metadata = current ? new MediaMetadata({
        title: current.title || "Rádio Hi-Mundim", artist: config.stationName || "Rádio Hi-Mundim", album: current.kind === "library" ? "Programas da rádio" : "No ar"
      }) : null;
    } catch (_) {}
  }
  function applyPlayer() {
    current = source();
    const badge = current ? ({ live: "AO VIVO", schedule: "NO AR", continuous: "RÁDIO", library: "ACERVO" }[current.kind]) : "FORA DO AR";
    $("liveBadge").textContent = badge;
    $("liveBadge").classList.toggle("on", !!current);
    $("miniBadge").textContent = badge;
    $("player-title").textContent = current ? (current.title || "Programa Hi-Mundim") : (config.tagline || "O guia do tempo livre, agora também para ouvir.");
    $("nowDescription").textContent = current ? (current.description || "Acompanhe a Rádio Hi-Mundim.") : "A rádio está fora do ar. Ouça os programas publicados no acervo ou confira os próximos horários.";
    $("miniTitle").textContent = current ? (current.title || "Programa Hi-Mundim") : "Fora do ar";
    play.disabled = !current; miniPlay.disabled = !current;
    $("returnRadioBtn").hidden = !manualId;
    $("audioProgress").hidden = !current || current.kind !== "library";
    document.querySelectorAll("[data-station-name]").forEach(el => { el.textContent = config.stationName || "Rádio Hi-Mundim"; });
    const nextKey = current ? [current.kind, current.id, current.audioUrl].join("|") : "";
    if (nextKey !== currentKey) {
      currentKey = nextKey;
      youtube.stop(); rtcFailure = "";
      stopRtc(); audio.srcObject = null;
      $("retryAudioBtn").hidden = true;
      if (!current) {
        wantsPlayback = false;
        audio.pause(); audio.removeAttribute("src"); audio.load();
        state.textContent = loaded.has("live") && loaded.has("schedule") && loaded.has("config") ? "Aguardando transmissão" : "Consultando a rádio…";
      } else {
        audio.pause(); audio.removeAttribute("src");
        if (current.streamType !== "WEBRTC") audio.src = current.audioUrl;
        audio.load();
        state.textContent = "Pronto para ouvir";
        if (wantsPlayback) startPlayback();
      }
      updateMetadata();
      controls();
    } else updateMetadata();
    if (!current && failures.size === 0) state.textContent = loaded.has("live") && loaded.has("schedule") && loaded.has("config") ? "Aguardando transmissão" : "Consultando a rádio…";
    syncYoutube(); planBoundary();
  }
  function planBoundary() {
    clearTimeout(boundaryTimer);
    const now = Date.now();
    const boundaries = C.playableSchedule(schedule, programs).flatMap(s => [Number(s.startAt), Number(s.endAt)]).filter(t => Number.isFinite(t) && t > now);
    if (boundaries.length) boundaryTimer = setTimeout(() => { applyPlayer(); renderSchedule(); }, Math.min(2147483000, Math.max(100, Math.min(...boundaries) - now + 50)));
  }
  function renderSchedule() {
    if (failures.has("programs") || failures.has("schedule")) {
      $("scheduleStatus").textContent = "Consulta indisponível";
      $("scheduleList").innerHTML = '<p class="schedule-empty">Não foi possível consultar a programação. Recarregue a página após verificar a conexão.</p>';
      return;
    }
    const now = Date.now();
    const rows = C.playableSchedule(schedule, programs).filter(s => !s.endAt || Number(s.endAt) > now).slice(0, 12);
    $("scheduleStatus").textContent = rows.length ? "Horário de Brasília" : "";
    $("scheduleList").innerHTML = rows.length ? rows.map(s => {
      const p = programs[s.programId], active = Number(s.startAt) <= now && (!s.endAt || Number(s.endAt) > now);
      return '<article class="schedule-item"><span>' + C.escape(C.formatDate(s.startAt)) + (s.endAt ? '<small>Até ' + C.escape(C.formatDate(s.endAt)) + '</small>' : "") + '</span><strong>' + C.escape(p.title || "Programa") + '</strong><span>' + C.escape(p.category || "Especial") + (active ? ' <b class="schedule-on">NO AR</b>' : "") + '</span></article>';
    }).join("") : '<p class="schedule-empty">' + (loaded.has("schedule") && loaded.has("programs") ? "Ainda não há próximos horários publicados. Os programas disponíveis estão no acervo." : "Consultando programação…") + '</p>';
  }
  function renderLibrary() {
    if (failures.has("programs")) { $("programLibrary").innerHTML = '<p class="library-empty">Não foi possível consultar os programas. Verifique a conexão e recarregue.</p>'; return; }
    const all = C.publishedPrograms(programs).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const query = $("programSearch").value.trim().toLocaleLowerCase("pt-BR"), category = $("categoryFilter").value;
    const rows = all.filter(p => (!category || p.category === category) && (String(p.title || "") + " " + String(p.description || "")).toLocaleLowerCase("pt-BR").includes(query));
    $("libraryCount").textContent = all.length ? all.length + (all.length === 1 ? " programa" : " programas") : "";
    $("programLibrary").innerHTML = rows.length ? rows.map(p => '<article class="program-card"><span class="category">' + C.escape(p.category || "Especial") + '</span><h3>' + C.escape(p.title || "Programa") + '</h3><p>' + C.escape(p.description || "Ouça este programa da Rádio Hi-Mundim.") + '</p><button type="button" data-listen="' + C.escape(p.id) + '" aria-label="Ouvir ' + C.escape(p.title || "programa") + '" aria-pressed="' + String(manualId === p.id) + '">' + (manualId === p.id ? "▶ Programa selecionado" : "▶ Ouvir programa") + '</button></article>').join("") : '<p class="library-empty">' + (!loaded.has("programs") ? "Carregando programas…" : all.length ? "Nenhum programa encontrado para esse filtro." : "Os programas publicados pela rádio aparecerão aqui.") + '</p>';
  }
  function connectionStatus() {
    $("connectionText").textContent = failures.size ? "Falha ao consultar rádio" : connected ? "Conectado" : "Sem conexão";
  }
  function subscribe(node, assign) {
    db.ref(C.ROOT + "/" + node).on("value", snapshot => {
      loaded.add(node); failures.delete(node);
      assign(C.record(snapshot.val()));
      if (manualId && loaded.has("programs") && !C.publishedPrograms(programs).some(p => p.id === manualId)) manualId = "";
      connectionStatus(); applyPlayer(); renderSchedule(); renderLibrary();
    }, () => {
      failures.add(node); loaded.add(node); connectionStatus(); renderSchedule(); renderLibrary();
      if (!current) state.textContent = "Não foi possível consultar a rádio. Verifique a conexão e recarregue.";
    });
  }
  subscribe("live", value => {
    live = value;
    if (liveMeta) { liveMeta.ref.off("value", liveMeta.callback); liveMeta = null; }
    if (C.isRtcLive(live)) {
      live.studioAvailable = false;
      const sessionId = live.webrtcSessionId, ref = db.ref(C.ROOT + "/webrtc/" + sessionId + "/meta");
      const callback = snapshot => {
        if (live.webrtcSessionId !== sessionId) return;
        live.studioAvailable = snapshot.val()?.active === true;
        applyPlayer();
      };
      liveMeta = { ref, callback };
      ref.on("value", callback, () => {
        if (live.webrtcSessionId !== sessionId) return;
        live.studioAvailable = false; applyPlayer();
        state.textContent = "A transmissão está indisponível. Tente novamente mais tarde.";
      });
    }
  });
  subscribe("programs", value => { programs = value; });
  subscribe("schedule", value => { schedule = value; });
  subscribe("config", value => { config = value; });
  db.ref(C.ROOT + "/liveMedia/youtube").on("value", snapshot => { youtubeState = C.record(snapshot.val()); syncYoutube(); }, () => { youtube.stop(); $("radioYoutubeStatus").textContent = "Não foi possível consultar o YouTube da programação."; });
  db.ref(".info/connected").on("value", snapshot => { connected = snapshot.val() === true; connectionStatus(); });
  play.addEventListener("click", togglePlayback); miniPlay.addEventListener("click", togglePlayback);
  $("returnRadioBtn").onclick = () => { manualId = ""; applyPlayer(); renderLibrary(); };
  $("programLibrary").addEventListener("click", event => {
    const button = event.target.closest("button[data-listen]");
    if (!button) return;
    manualId = button.dataset.listen;
    applyPlayer(); renderLibrary(); startPlayback();
    $("radio").scrollIntoView({ block: "start" });
  });
  $("programSearch").addEventListener("input", renderLibrary);
  $("categoryFilter").addEventListener("change", renderLibrary);
  $("retryAudioBtn").onclick = () => { if (current) { stopRtc(); audio.load(); startPlayback(); } };
  $("volume").addEventListener("input", () => {
    audio.volume = Number($("volume").value);
    youtube.setVolume(audio.volume);
    try { localStorage.setItem("himundim-volume", $("volume").value); } catch (_) {}
  });
  audio.addEventListener("play", () => { state.textContent = current?.streamType === "WEBRTC" && !rtcConnected ? "Conectando à transmissão…" : "Reproduzindo"; controls(); });
  audio.addEventListener("pause", () => { if (current && !audio.ended) state.textContent = youtube.playing ? "YouTube reproduzindo" : "Pausado"; controls(); });
  audio.addEventListener("playing", () => {
    if (current?.streamType === "WEBRTC" && !rtcConnected) { state.textContent = "Conectando à transmissão…"; controls(); return; }
    connectingLive = false; clearTimeout(rtcTimer); state.textContent = "Reproduzindo"; $("retryAudioBtn").hidden = true; controls();
  });
  audio.addEventListener("waiting", () => { if (wantsPlayback) state.textContent = "Carregando áudio…"; });
  audio.addEventListener("ended", () => { wantsPlayback = false; state.textContent = "Programa encerrado"; controls(); });
  audio.addEventListener("error", () => {
    if (!current) return;
    wantsPlayback = false;
    state.textContent = "Esta fonte de áudio está indisponível ou usa um formato incompatível.";
    $("retryAudioBtn").hidden = false;
    controls();
  });
  audio.addEventListener("loadedmetadata", () => {
    if (current && current.kind === "schedule" && Number.isFinite(audio.duration)) {
      const elapsed = Math.max(0, (Date.now() - current.startAt) / 1000);
      if (elapsed < audio.duration) { try { audio.currentTime = elapsed; } catch (_) {} }
    }
  });
  function time(seconds) { const n = Math.max(0, Math.floor(Number(seconds) || 0)); return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0"); }
  audio.addEventListener("timeupdate", () => {
    if (!current || current.kind !== "library" || !Number.isFinite(audio.duration) || !audio.duration) return;
    $("audioSeek").value = (audio.currentTime / audio.duration) * 100;
    $("audioTime").textContent = time(audio.currentTime) + " / " + time(audio.duration);
  });
  $("audioSeek").addEventListener("input", () => {
    if (current && current.kind === "library" && Number.isFinite(audio.duration)) audio.currentTime = (Number($("audioSeek").value) / 100) * audio.duration;
  });
  $("shareRadioBtn").onclick = async () => {
    const share = { title: config.stationName || "Rádio Hi-Mundim", text: "Ouça a Rádio Hi-Mundim", url: location.origin + "/#radio" };
    try {
      if (navigator.share) await navigator.share(share);
      else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(share.url); state.textContent = "Link da rádio copiado.";
      } else state.textContent = "Copie o endereço desta página para compartilhar a rádio.";
    } catch (error) { if (error.name !== "AbortError") state.textContent = "Não foi possível compartilhar. Copie o endereço desta página."; }
  };
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.setActionHandler("play", startPlayback); navigator.mediaSession.setActionHandler("pause", pausePlayback); navigator.mediaSession.setActionHandler("stop", pausePlayback); } catch (_) {}
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { applyPlayer(); renderSchedule(); } });
  $("activateYoutubeBtn").onclick = () => { if (!wantsPlayback) startPlayback(); else youtube.start().catch(error => { $("radioYoutubeStatus").textContent = error.message; }); };
  window.addEventListener("pagehide", () => { stopRtc(); youtube.stop(); });
  controls();
})();
