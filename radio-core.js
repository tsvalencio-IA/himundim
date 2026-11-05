(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.HimundimRadio = core;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  const ROOT = "radio/himundim";
  const ADMIN_UID = "C19UZ7R1OSRaAGZ3XSXfBFaUzMD2";
  const TIME_ZONE = "America/Sao_Paulo";
  const CATEGORIES = ["Caminhos", "Sabores", "Balaio", "Especial"];
  const partsFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });
  function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function entries(value) {
    return Object.entries(record(value)).filter(([id, item]) =>
      /^[\w-]+$/.test(id) && item && typeof item === "object" && !Array.isArray(item)
    ).map(([id, item]) => ({ ...item, id }));
  }
  function audioUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (url.protocol !== "https:" || url.username || url.password) return "";
      if (/(^|\.)(youtube\.com|youtu\.be|spotify\.com|instagram\.com)$/.test(url.hostname)) return "";
      return url.href;
    } catch (_) { return ""; }
  }
  function requireAudio(value) {
    const url = audioUrl(value);
    if (!url) throw new Error("Informe um link HTTPS direto de áudio ou de stream. Links de páginas do YouTube, Spotify e Instagram não funcionam como áudio direto.");
    return url;
  }
  function publishedPrograms(programs) {
    return entries(programs).filter(p => p.published !== false && audioUrl(p.audioUrl));
  }
  function scheduleRows(schedule) {
    return entries(schedule).filter(s =>
      s.published !== false && Number.isFinite(Number(s.startAt)) && Number(s.startAt) > 0 &&
      (s.endAt == null || (Number.isFinite(Number(s.endAt)) && Number(s.endAt) > Number(s.startAt)))
    ).sort((a, b) => Number(a.startAt) - Number(b.startAt) || a.id.localeCompare(b.id));
  }
  function playableSchedule(schedule, programs) {
    return scheduleRows(schedule).filter(s => {
      const p = record(programs)[s.programId];
      return p && p.published !== false && audioUrl(p.audioUrl);
    });
  }
  function isRtcLive(live) {
    return live.active === true && live.streamType === "WEBRTC" && typeof live.webrtcSessionId === "string" && /^[\w-]{8,100}$/.test(live.webrtcSessionId);
  }
  function selectSource({ live = {}, programs = {}, schedule = {}, config = {}, manualId = "", now = Date.now() }) {
    const manual = record(programs)[manualId];
    if (manualId && manual && manual.published !== false && audioUrl(manual.audioUrl))
      return { ...manual, audioUrl: audioUrl(manual.audioUrl), id: manualId, kind: "library" };
    if (isRtcLive(live) && live.studioAvailable !== false)
      return { ...live, id: live.webrtcSessionId, kind: "live", title: live.title || "Hi-Mundim ao vivo", audioUrl: "" };
    if (live.active === true && live.streamType !== "WEBRTC" && audioUrl(live.audioUrl))
      return { ...live, id: "live", kind: "live", title: live.title || "Hi-Mundim ao vivo", audioUrl: audioUrl(live.audioUrl) };
    const item = playableSchedule(schedule, programs).find(s =>
      Number(s.startAt) <= now && (s.endAt == null || Number(s.endAt) > now)
    );
    if (item) return { ...programs[item.programId], id: item.id, kind: "schedule", startAt: Number(item.startAt), endAt: item.endAt, audioUrl: audioUrl(programs[item.programId].audioUrl) };
    if (config.continuousEnabled === true && audioUrl(config.continuousAudioUrl))
      return { id: "continuous", kind: "continuous", title: config.continuousTitle || config.stationName || "Rádio Hi-Mundim", description: config.tagline || "O guia do tempo livre, agora também para ouvir.", audioUrl: audioUrl(config.continuousAudioUrl) };
    return null;
  }
  function hasOverlap(candidate, schedule, ignoreId = "") {
    return scheduleRows(schedule).some(s => s.id !== ignoreId &&
      Number(candidate.startAt) < (s.endAt == null ? Infinity : Number(s.endAt)) &&
      Number(s.startAt) < Number(candidate.endAt)
    );
  }
  function zonedParts(timestamp) {
    return Object.fromEntries(partsFormatter.formatToParts(new Date(timestamp)).filter(p => p.type !== "literal").map(p => [p.type, p.value]));
  }
  function toLocalInput(timestamp) {
    if (!Number.isFinite(Number(timestamp)) || !timestamp) return "";
    const p = zonedParts(Number(timestamp));
    return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
  }
  function fromLocalInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value))) return NaN;
    const [year, month, day, hour, minute] = value.split(/[-T:]/).map(Number);
    if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return NaN;
    const desired = Date.UTC(year, month - 1, day, hour, minute);
    let result = desired;
    for (let i = 0; i < 3; i++) {
      const p = zonedParts(result);
      const localAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      result += desired - localAsUtc;
    }
    return toLocalInput(result) === value ? result : NaN;
  }
  function formatDate(timestamp) {
    if (!Number.isFinite(Number(timestamp)) || !timestamp) return "Data não informada";
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(Number(timestamp)));
  }
  function escape(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  return { ROOT, ADMIN_UID, TIME_ZONE, CATEGORIES, record, entries, audioUrl, requireAudio, publishedPrograms, scheduleRows, playableSchedule, isRtcLive, selectSource, hasOverlap, toLocalInput, fromLocalInput, formatDate, escape };
});
