(function () {
  "use strict";
  // Same file service used by Bíblia Rádio; records remain under radio/himundim.
  function isAudio(file) {
    return !!file && file.size > 0 && (String(file.type).startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|opus|flac|webm)$/i.test(file.name));
  }
  async function uploadAudio(file) {
    if (!isAudio(file)) throw new Error("Escolha um arquivo de áudio válido.");
    const form = new FormData();
    form.append("file", file);
    form.append("upload_preset", "biblia");
    form.append("folder", "himundim");
    const response = await fetch("https://api.cloudinary.com/v1_1/djtiaygrs/auto/upload", { method: "POST", body: form });
    let result;
    try { result = await response.json(); } catch (_) { throw new Error("O envio do áudio não foi concluído. Tente novamente."); }
    if (!response.ok || !window.HimundimRadio.audioUrl(result.secure_url)) throw new Error(result.error?.message || "Não foi possível enviar o áudio.");
    return { url: result.secure_url, durationSec: Number(result.duration) || 0, fileName: file.name };
  }
  window.HimundimMedia = { isAudio, uploadAudio };
})();
