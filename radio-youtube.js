(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HimundimYouTube = api;
})(typeof window !== "undefined" ? window : this, function (root) {
  "use strict";
  let apiPromise = null;
  const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
  function videoId(value) {
    const raw = String(value || "").trim();
    if (/^[\w-]{11}$/.test(raw)) return raw;
    try {
      const url = new URL(raw.startsWith("http") ? raw : "https://" + raw);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
      const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
      let id = "";
      if (host === "youtu.be") id = url.pathname.split("/").filter(Boolean)[0];
      else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1];
      }
      return /^[\w-]{11}$/.test(id || "") ? id : "";
    } catch (_) { return ""; }
  }
  function watchUrl(id) { const value = videoId(id); return value ? "https://www.youtube.com/watch?v=" + value : ""; }
  function position(item, now = Date.now()) {
    const saved = Math.max(0, Number(item?.positionSec) || 0);
    return saved + (item?.playing && Number(item.startedAt) > 0 ? Math.max(0, (now - Number(item.startedAt)) / 1000) : 0);
  }
  function normalize(value, sessionId) {
    if (!value || value.active !== true || sessionId && value.sessionId !== sessionId) return null;
    const id = videoId(value.videoId || value.youtubeId || value.url);
    if (!id) return null;
    return { ...value, videoId: id, volume: clamp(value.volume ?? 35), title: String(value.title || "YouTube"), positionSec: Math.max(0, Number(value.positionSec) || 0) };
  }
  function loadApi() {
    if (root.YT?.Player) return Promise.resolve(root.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      let timer;
      const previous = root.onYouTubeIframeAPIReady;
      root.onYouTubeIframeAPIReady = () => { clearTimeout(timer); try { previous?.(); } catch (_) {} resolve(root.YT); };
      const fail = () => { clearTimeout(timer); apiPromise = null; reject(new Error("O player do YouTube não carregou. Tente novamente.")); };
      let script = root.document.querySelector("script[data-himundim-youtube-api]");
      if (!script) {
        script = root.document.createElement("script"); script.src = "https://www.youtube.com/iframe_api";
        script.async = true; script.dataset.himundimYoutubeApi = "1"; script.onerror = () => { script.remove(); fail(); };
        root.document.head.appendChild(script);
      }
      timer = setTimeout(fail, 15000);
    });
    return apiPromise;
  }
  function playerError(code) {
    if ([101, 150].includes(Number(code))) return "Este vídeo não permite reprodução nesta página. Escolha outro vídeo.";
    if (Number(code) === 100) return "Este vídeo foi removido ou está indisponível.";
    if (Number(code) === 153) return "O YouTube não autorizou este player. Abra a rádio no navegador e tente novamente.";
    return "O YouTube não conseguiu reproduzir este vídeo. Tente outro vídeo.";
  }
  function createSurface({ container, mountId, title, notice, onState = () => {}, now = () => Date.now(), blockedText = "Toque em Ativar YouTube para ouvir o vídeo nesta página." }) {
    let player = null, ready = null, current = null, selectedId = "", lastCommand = null, generation = 0, enabled = false, playing = false, multiplier = 1;
    const report = (state, message = "") => { if (notice && message) notice.textContent = message; onState(state, message); };
    async function ensure() {
      if (ready) return ready;
      ready = (async () => {
        const YT = await loadApi();
        return new Promise((resolve, reject) => {
          const mount = root.document.getElementById(mountId);
          if (!mount) return reject(new Error("Não foi possível abrir o player do YouTube."));
          let timer = setTimeout(() => { ready = null; reject(new Error("O player do YouTube não respondeu. Tente novamente.")); }, 15000);
          player = new YT.Player(mount, { width: "100%", height: "230", playerVars: { playsinline: 1, controls: 1, autoplay: 0, origin: root.location.origin }, events: {
            onReady: () => { clearTimeout(timer); resolve(player); },
            onStateChange: event => {
              if (!current) return;
              playing = event.data === 1 && enabled && !!current;
              if (event.data === 1 && !playing) { try { player.pauseVideo(); } catch (_) {} return; }
              if (playing) report("playing", "YouTube reproduzindo");
              else if (event.data === 2) report("paused", "YouTube pausado");
              else if (event.data === 0) report("ended", "Vídeo encerrado");
              else if (event.data === 3 && enabled) report("loading", "Carregando YouTube…");
            },
            onAutoplayBlocked: () => { if (enabled && current) report("blocked", blockedText); },
            onError: event => { playing = false; if (current) report("error", playerError(event.data)); }
          } });
        });
      })();
      ready.catch(() => { ready = null; });
      return ready;
    }
    function applyVolume() { if (player) { const value = current?.muted ? 0 : clamp((current?.volume ?? 35) * multiplier); try { player.setVolume(value); if (value === 0) player.mute(); else player.unMute(); } catch (_) {} } }
    async function render(force = false) {
      const version = generation, item = current;
      if (!item || !enabled) return;
      const p = await ensure();
      if (version !== generation || !enabled || current !== item) return;
      const nextCommand = item.commandSeq ?? item.updatedAt ?? 0, fresh = nextCommand !== lastCommand;
      const seconds = position(item, now());
      if (selectedId !== item.videoId) {
        selectedId = item.videoId;
        if (item.playing !== false) p.loadVideoById({ videoId: item.videoId, startSeconds: seconds });
        else { p.cueVideoById({ videoId: item.videoId, startSeconds: seconds }); p.pauseVideo(); playing = false; report("paused", "YouTube pausado pela rádio."); }
      } else if (force || fresh && ["PLAY", "SEEK"].includes(item.command)) {
        p.seekTo(seconds, true); if (item.playing !== false) p.playVideo(); else p.pauseVideo();
      } else if (fresh && item.command === "PAUSE") { p.seekTo(seconds, true); p.pauseVideo(); playing = false; report("paused", "YouTube pausado pela rádio."); }
      else if (fresh && item.command === "STOP") p.stopVideo();
      lastCommand = nextCommand; applyVolume();
    }
    function stop() {
      generation++; current = null; enabled = false; playing = false; selectedId = ""; lastCommand = null;
      try { player?.stopVideo(); } catch (_) {}
      container.hidden = true;
    }
    return {
      get playing() { return playing; }, get active() { return !!current; },
      get state() { return current; },
      async update(value, sessionId, shouldPlay = enabled) {
        const item = normalize(value, sessionId);
        if (!item) { stop(); return; }
        generation++; current = item; container.hidden = false;
        if (title) title.textContent = item.title;
        const wasEnabled = enabled; enabled = shouldPlay;
        if (!enabled) { playing = false; try { player?.pauseVideo(); } catch (_) {} return; }
        await render(!wasEnabled);
      },
      async start() { enabled = true; await render(true); },
      pause() { enabled = false; playing = false; generation++; try { player?.pauseVideo(); } catch (_) {} },
      setVolume(value) { multiplier = Math.max(0, Math.min(1, Number(value) || 0)); applyVolume(); },
      stop
    };
  }
  return { videoId, watchUrl, position, normalize, createSurface };
});
