(() => {
  "use strict";
  const C = window.HimundimRadio, $ = id => document.getElementById(id);
  window.HimundimStudio = { create({ db, auth, canWrite }) {
    let microphone = null, context = null, output = null, master = null, micGain = null, musicGain = null, jingleGain = null, analyser = null, micAnalyser = null;
    let host = null, sessionId = "", lastLive = {}, working = false, muted = false, meter = 0, clock = 0, startedAt = 0, localUrl = "", library = {};
    let micSource = null, musicSource = null, wakeLock = null;
    const music = new Audio(), effects = new Set();
    music.crossOrigin = "anonymous"; music.preload = "none";
    const status = (text, error = false) => { $("studioStatus").textContent = text; $("studioStatus").dataset.tone = error ? "error" : "info"; };
    const volume = id => Number($(id).value) / 100;
    const stamp = () => ({ updatedAt: firebase.database.ServerValue.TIMESTAMP, updatedBy: auth.currentUser.uid });
    const remoteActive = () => C.isRtcLive(lastLive) && lastLive.studioAvailable !== false && lastLive.webrtcSessionId !== sessionId;
    function buttons() {
      $("prepareMicBtn").disabled = working || !!host;
      $("studioAssetForm").querySelector('button[type="submit"]').disabled = working;
      $("releaseMicBtn").hidden = !microphone || !!host;
      $("goLiveBtn").disabled = working || !microphone || !!host || remoteActive();
      $("stopLiveBtn").disabled = working || !(host || C.isRtcLive(lastLive));
      $("muteMicBtn").disabled = !microphone;
      $("studioTitle").disabled = !!host;
      $("prepareMicBtn").textContent = microphone ? "Trocar / reativar microfone" : "1. Ativar microfone";
    }
    async function ensureMixer() {
      if (!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error("Este navegador não oferece a mesa de áudio. Use um navegador atualizado.");
        context = new AudioContext(); output = context.createMediaStreamDestination();
        master = context.createGain(); master.gain.value = volume("masterVolume"); master.connect(output);
        analyser = context.createAnalyser(); analyser.fftSize = 256; master.connect(analyser);
        musicGain = context.createGain(); musicGain.gain.value = volume("musicVolume"); musicGain.connect(master);
        jingleGain = context.createGain(); jingleGain.gain.value = volume("jingleVolume"); jingleGain.connect(master);
        musicSource = context.createMediaElementSource(music); musicSource.connect(musicGain);
      }
      if (context.state === "suspended") await context.resume();
      drawMeter();
    }
    function drawMeter() {
      clearTimeout(meter);
      const values = new Uint8Array(256);
      const draw = () => {
        if (!context || context.state === "closed") return;
        analyser.getByteTimeDomainData(values);
        const level = Math.sqrt(values.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / values.length);
        $("masterLevel").style.width = Math.min(100, level * 240) + "%";
        if (micAnalyser && musicGain) {
          micAnalyser.getByteTimeDomainData(values);
          const voice = Math.sqrt(values.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) / values.length);
          const duck = !muted && $("duckMusic").checked && voice > 0.035;
          musicGain.gain.setTargetAtTime(volume("musicVolume") * (duck ? 0.28 : 1), context.currentTime, duck ? 0.06 : 0.25);
        }
        meter = setTimeout(draw, document.hidden ? 250 : 80);
      };
      draw();
    }
    async function prepare() {
      if (!canWrite()) throw new Error("Entre como administrador e aguarde a conexão da rádio.");
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este navegador não permite ativar o microfone.");
      await ensureMixer();
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      if (auth.currentUser?.uid !== C.ADMIN_UID) { stream.getTracks().forEach(track => track.stop()); return; }
      microphone?.getTracks().forEach(track => track.stop());
      micSource?.disconnect(); micGain?.disconnect(); micAnalyser?.disconnect();
      microphone = stream; muted = false;
      micSource = context.createMediaStreamSource(stream); micGain = context.createGain();
      micGain.gain.value = volume("micVolume"); micSource.connect(micGain); micGain.connect(master);
      micAnalyser = context.createAnalyser(); micAnalyser.fftSize = 256; micSource.connect(micAnalyser);
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => { stop().catch(() => {}); status("O microfone foi desconectado. Ative-o novamente.", true); }));
      $("muteMicBtn").textContent = "Silenciar microfone"; $("muteMicBtn").setAttribute("aria-pressed", "false");
      status("Microfone pronto. Toque em Entrar ao vivo para transmitir na página do ouvinte.");
    }
    async function wake() { try { if (navigator.wakeLock && !document.hidden) wakeLock = await navigator.wakeLock.request("screen"); } catch (_) {} }
    function tick() {
      clearInterval(clock);
      const update = () => {
        const n = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        $("elapsedLive").textContent = [Math.floor(n / 3600), Math.floor(n % 3600 / 60), n % 60].map(n => String(n).padStart(2, "0")).join(":");
      };
      update(); clock = setInterval(update, 1000);
    }
    async function start() {
      if (!canWrite() || !microphone) throw new Error("Ative o microfone e aguarde a conexão da rádio.");
      if (remoteActive()) throw new Error("Há outro estúdio transmitindo. Encerre a transmissão anterior antes de iniciar neste aparelho.");
      await ensureMixer();
      sessionId = window.HimundimRTC.newId("live_");
      const expectedSession = lastLive.webrtcSessionId || "";
      const newHost = await window.HimundimRTC.host({ db, auth, sessionId, stream: output.stream,
        onCount: count => { $("listenerCount").textContent = count + (count === 1 ? " ouvinte conectado" : " ouvintes conectados"); },
        onError: () => status("Não foi possível atender uma conexão. Confira a conexão e as permissões dos ouvintes.", true)
      });
      host = newHost;
      try {
        status("Conferindo a conexão dos ouvintes…");
        await window.HimundimRTC.verifyListenerAccess(sessionId);
        const live = { active: true, streamType: "WEBRTC", webrtcSessionId: sessionId, audioUrl: "", title: $("studioTitle").value.trim() || "Rádio Hi-Mundim ao vivo", description: "Transmissão ao vivo da Rádio Hi-Mundim.", startedAt: firebase.database.ServerValue.TIMESTAMP, ...stamp() };
        const result = await db.ref(C.ROOT + "/live").transaction(current => {
          if (current?.active && current.streamType === "WEBRTC" && current.webrtcSessionId !== expectedSession) return;
          return { ...C.record(current), ...live };
        }, undefined, false);
        if (!result.committed) throw new Error("Outro estúdio iniciou uma transmissão. Atualize a página antes de continuar.");
        startedAt = Number(result.snapshot.val()?.startedAt) || Date.now(); tick(); await wake();
        status("● NO AR — microfone, música e vinhetas chegam ao player da página do ouvinte. Mantenha o estúdio aberto.");
      } catch (error) { await newHost.stop(); host = null; sessionId = ""; throw error; }
    }
    function releaseAudio() {
      music.pause(); effects.forEach(effect => effect.stop()); effects.clear();
      microphone?.getTracks().forEach(track => track.stop()); microphone = null;
      micSource?.disconnect(); micGain?.disconnect(); micAnalyser?.disconnect();
      micSource = null; micGain = null; micAnalyser = null;
      clearTimeout(meter); clearInterval(clock);
      $("masterLevel").style.width = "0%"; $("elapsedLive").textContent = "00:00:00";
      $("listenerCount").textContent = "0 ouvintes conectados";
      wakeLock?.release().catch(() => {}); wakeLock = null;
      // Keep the reusable media-element graph, but suspend its audio processing.
      context?.suspend().catch(() => {});
      buttons();
    }
    async function stop() {
      const stopping = host, id = sessionId || (C.isRtcLive(lastLive) ? lastLive.webrtcSessionId : "");
      host = null;
      releaseAudio();
      try {
        if (id && auth.currentUser?.uid === C.ADMIN_UID) {
          await db.ref(C.ROOT + "/live").transaction(current => {
            if (current?.webrtcSessionId !== id) return;
            return { ...current, active: false, endedAt: firebase.database.ServerValue.TIMESTAMP, ...stamp() };
          }, undefined, false);
          if (stopping) await stopping.stop();
          else await db.ref(C.ROOT + "/webrtc/" + id + "/meta").update({ active: false });
        }
        status("Transmissão encerrada. O microfone está desligado.");
      } finally { if (stopping) await stopping.stop(); sessionId = ""; buttons(); }
    }
    async function action(fn) {
      if (working) return;
      working = true; buttons();
      try { await fn(); }
      catch (error) { status(error.message || "Não foi possível concluir a operação.", true); }
      finally { working = false; buttons(); }
    }
    $("prepareMicBtn").onclick = () => action(prepare);
    $("releaseMicBtn").onclick = () => { releaseAudio(); status("Microfone desligado."); };
    $("goLiveBtn").onclick = () => action(start);
    $("stopLiveBtn").onclick = () => action(stop);
    $("muteMicBtn").onclick = () => {
      muted = !muted;
      micGain?.gain.setTargetAtTime(muted ? 0 : volume("micVolume"), context.currentTime, 0.04);
      $("muteMicBtn").textContent = muted ? "Reativar microfone" : "Silenciar microfone";
      $("muteMicBtn").setAttribute("aria-pressed", String(muted));
    };
    for (const id of ["micVolume", "musicVolume", "jingleVolume", "masterVolume"]) $(id).oninput = () => {
      $(id + "Label").textContent = $(id).value + "%";
      const gain = { micVolume: micGain, musicVolume: musicGain, jingleVolume: jingleGain, masterVolume: master }[id];
      if (gain) gain.gain.setTargetAtTime(id === "micVolume" && muted ? 0 : volume(id), context.currentTime, 0.04);
    };
    async function loadMusic(url, name) {
      await ensureMixer(); music.pause(); music.src = url; music.loop = $("musicLoop").checked;
      $("musicNow").textContent = name || "Áudio selecionado";
      status("Música carregada na mesa. Use Tocar música para enviá-la à transmissão.");
    }
    $("studioAudioFile").onchange = () => action(async () => {
      const file = $("studioAudioFile").files[0];
      if (!window.HimundimMedia.isAudio(file)) throw new Error("Escolha um arquivo de áudio.");
      if (localUrl) URL.revokeObjectURL(localUrl);
      localUrl = URL.createObjectURL(file); await loadMusic(localUrl, file.name);
    });
    $("musicPlayBtn").onclick = () => action(async () => {
      if (!music.getAttribute("src")) throw new Error("Escolha um áudio do aparelho ou da biblioteca.");
      await ensureMixer(); await music.play(); status(host ? "Música tocando na transmissão." : "Música preparada na mesa. Entre ao vivo para o público ouvir.");
    });
    $("musicPauseBtn").onclick = () => music.pause();
    $("musicStopBtn").onclick = () => { music.pause(); music.currentTime = 0; };
    $("musicLoop").onchange = () => { music.loop = $("musicLoop").checked; };
    music.onerror = () => status("Não foi possível carregar esta música. Confira o arquivo ou tente novamente.", true);
    async function playEffect(item) {
      await ensureMixer();
      const audio = new Audio(); audio.crossOrigin = "anonymous"; audio.src = C.requireAudio(item.url);
      const source = context.createMediaElementSource(audio); source.connect(jingleGain);
      const effect = { stop() { audio.pause(); source.disconnect(); effects.delete(effect); } };
      audio.onended = effect.stop; audio.onerror = effect.stop; effects.add(effect);
      try { await audio.play(); } catch (error) { effect.stop(); throw error; }
    }
    $("stopJinglesBtn").onclick = () => { [...effects].forEach(effect => effect.stop()); };
    function renderLibrary() {
      const query = $("studioLibrarySearch").value.trim().toLocaleLowerCase("pt-BR");
      const rows = C.entries(library).filter(item => C.audioUrl(item.url) && (item.name || "").toLocaleLowerCase("pt-BR").includes(query));
      $("studioLibraryList").innerHTML = rows.length ? rows.map(item => '<article class="studio-asset"><div><strong>' + C.escape(item.name || "Áudio") + '</strong><small>' + (item.kind === "MUSIC" ? "Música" : "Vinheta / efeito") + '</small></div><button class="btn secondary compact" type="button" data-studio-asset="' + C.escape(item.id) + '">' + (item.kind === "MUSIC" ? "Carregar na mesa" : "Tocar vinheta") + '</button></article>').join("") : '<p class="empty">' + (query ? "Nenhum áudio encontrado." : "Envie músicas e vinhetas para reutilizar na rádio.") + '</p>';
    }
    $("studioLibrarySearch").oninput = renderLibrary;
    $("studioLibraryList").onclick = event => {
      const button = event.target.closest("[data-studio-asset]"), item = button && library[button.dataset.studioAsset];
      if (item) action(() => item.kind === "MUSIC" ? loadMusic(C.requireAudio(item.url), item.name) : playEffect(item));
    };
    $("studioAssetForm").onsubmit = event => {
      event.preventDefault(); action(async () => {
        if (!canWrite()) throw new Error("Aguarde a conexão da rádio antes de enviar o áudio.");
        status("Enviando áudio… Aguarde a confirmação.");
        const uploaded = await window.HimundimMedia.uploadAudio($("studioAssetFile").files[0]);
        if (!canWrite()) throw new Error("O áudio foi enviado, mas a biblioteca não foi salva. Entre novamente e repita o cadastro.");
        await db.ref(C.ROOT + "/library").push({ name: $("studioAssetName").value.trim() || uploaded.fileName, kind: $("studioAssetKind").value, ...uploaded, createdAt: firebase.database.ServerValue.TIMESTAMP, ...stamp() });
        $("studioAssetForm").reset(); status("Áudio salvo na biblioteca da Hi-Mundim.");
      });
    };
    window.addEventListener("beforeunload", event => { if (host) { event.preventDefault(); event.returnValue = ""; } });
    window.addEventListener("pagehide", () => { if (host) stop().catch(() => {}); else releaseAudio(); });
    document.addEventListener("visibilitychange", () => { if (host && !document.hidden) wake(); });
    buttons();
    return { stop, releaseAudio, get active() { return !!host; },
      setLive(value) {
        lastLive = value;
        if (host && (!value.active || value.webrtcSessionId !== sessionId)) { const old = host; host = null; old.stop().catch(() => {}); sessionId = ""; releaseAudio(); }
        if (remoteActive()) status("Há um estúdio ativo em outro aparelho. Os ouvintes usam a página principal.");
        buttons();
      },
      setLibrary(value) { library = value; renderLibrary(); }
    };
  } };
})();
