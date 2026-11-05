(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const C = window.HimundimRadio;
  if (!C || !window.firebase || !window.HIMUNDIM_FIREBASE_CONFIG || window.HIMUNDIM_DB_ROOT !== C.ROOT) {
    $("loginStatus").textContent = "Não foi possível carregar o acesso. Verifique a conexão e recarregue a página.";
    return;
  }
  const app = firebase.initializeApp(window.HIMUNDIM_FIREBASE_CONFIG);
  const auth = app.auth(), db = app.database();
  auth.languageCode = "pt-BR";
  let programs = {}, schedule = {}, live = {}, config = {}, connected = false, busy = false, denied = false;
  let liveMeta = null, previewUrl = "";
  const subscriptions = [], dirtyForms = new Set();
  const studio = window.HimundimStudio.create({ db, auth,
    canWrite: () => auth.currentUser?.uid === C.ADMIN_UID && connected && !busy
  });
  const youtube = window.HimundimYoutubeStudio.create({ db, auth, studio,
    canWrite: () => auth.currentUser?.uid === C.ADMIN_UID && connected && !busy
  });
  const recorder = window.HimundimRecorder.create({ db, auth, studio, canWrite: () => auth.currentUser?.uid === C.ADMIN_UID && connected && !busy });
  const audience = window.HimundimAudienceAdmin.create({ db, auth });
  $("copyFirebaseRules").onclick = async () => {
    try { const response = await fetch("/docs/firebase-database.rules.json"); if (!response.ok) throw new Error(); await navigator.clipboard.writeText(await response.text()); $("rulesCopyStatus").textContent = "Regras copiadas. Agora cole no Realtime Database e clique em Publicar."; }
    catch (_) { $("rulesCopyStatus").textContent = "Use Baixar regras e copie o conteúdo do arquivo."; }
  };
  const stamp = () => ({ updatedAt: firebase.database.ServerValue.TIMESTAMP, updatedBy: auth.currentUser.uid });
  function message(text, error = false, login = false) {
    const target = $(login ? "loginStatus" : "adminStatus");
    target.textContent = text;
    target.dataset.tone = error ? "error" : "info";
  }
  function authError(error) {
    const messages = {
      "auth/invalid-email": "Confira o e-mail informado.",
      "auth/invalid-credential": "E-mail ou senha não conferem. Confira o cadastro ou use a recuperação de senha.",
      "auth/wrong-password": "E-mail ou senha não conferem. Use a recuperação de senha se necessário.",
      "auth/user-not-found": "Não foi possível entrar com esses dados. Confira o e-mail cadastrado.",
      "auth/too-many-requests": "Houve muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
      "auth/network-request-failed": "Sem comunicação com o serviço de acesso. Verifique a conexão.",
      "auth/user-disabled": "Esta conta está desativada. Confira o cadastro no Firebase.",
      "auth/operation-not-allowed": "O acesso por e-mail e senha precisa estar habilitado no Firebase.",
      "auth/web-storage-unsupported": "O navegador bloqueou o armazenamento necessário para entrar.",
      "auth/internal-error": "O serviço de acesso não respondeu corretamente. Tente novamente mais tarde."
    };
    return messages[error.code] || "Não foi possível concluir o acesso. Verifique a conexão e tente novamente.";
  }
  function dataError(error) {
    return /permission.denied/i.test(error.code || error.message || "") ?
      "O Firebase recusou esta operação. Confira as permissões da conta para a Rádio Hi-Mundim." :
      (error.message || "Não foi possível salvar. Verifique a conexão e tente novamente.");
  }
  async function run(control, action, success) {
    if (busy) return message("Aguarde a operação em andamento.");
    if (!auth.currentUser || auth.currentUser.uid !== C.ADMIN_UID) return message("Entre com a conta de administrador.", true);
    if (!connected) return message("Sem conexão com o banco. Aguarde reconectar antes de salvar.", true);
    busy = true;
    const buttons = control.matches("button") ? [control] : [...control.querySelectorAll("button")];
    const previous = buttons.map(b => b.disabled);
    buttons.forEach(b => { b.disabled = true; });
    control.setAttribute("aria-busy", "true");
    message("Salvando…");
    try { await action(); message(success); }
    catch (error) { message(dataError(error), true); }
    finally {
      busy = false;
      buttons.forEach((b, i) => { b.disabled = previous[i]; });
      $("liveOffBtn").disabled = !live.active;
      control.removeAttribute("aria-busy");
    }
  }
  ["configForm", "liveForm"].forEach(id => $(id).addEventListener("input", () => dirtyForms.add(id)));
  $("showPassword").onclick = () => {
    const show = $("password").type === "password";
    $("password").type = show ? "text" : "password";
    $("showPassword").textContent = show ? "Ocultar" : "Mostrar";
    $("showPassword").setAttribute("aria-pressed", String(show));
  };
  $("loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if ($("loginBtn").disabled) return;
    $("loginBtn").disabled = true;
    $("resetPasswordBtn").disabled = true;
    message("Entrando…", false, true);
    denied = false;
    try {
      await auth.setPersistence($("rememberSession").checked ? firebase.auth.Auth.Persistence.LOCAL : firebase.auth.Auth.Persistence.SESSION);
      await auth.signInWithEmailAndPassword($("email").value.trim(), $("password").value);
      $("password").value = "";
    } catch (error) { message(authError(error), true, true); }
    finally { $("loginBtn").disabled = false; $("resetPasswordBtn").disabled = false; }
  });
  $("resetPasswordBtn").onclick = async () => {
    if (!$("email").value.trim() || !$("email").checkValidity()) {
      $("email").reportValidity();
      message("Informe primeiro o e-mail cadastrado. Se não souber, abra a orientação abaixo.", true, true);
      $("email").focus();
      return;
    }
    $("resetPasswordBtn").disabled = true;
    $("loginBtn").disabled = true;
    try {
      await auth.sendPasswordResetEmail($("email").value.trim());
      message("Solicitação enviada. Se esse e-mail estiver cadastrado, confira a caixa de entrada e o spam para redefinir a senha.", false, true);
    } catch (error) {
      message(error.code === "auth/user-not-found" ? "Se esse e-mail estiver cadastrado, você receberá as instruções de recuperação." : authError(error), error.code !== "auth/user-not-found", true);
    } finally { $("resetPasswordBtn").disabled = false; $("loginBtn").disabled = false; }
  };
  function unsubscribe() {
    subscriptions.splice(0).forEach(([ref, callback]) => ref.off("value", callback));
    if (liveMeta) { liveMeta.ref.off("value", liveMeta.callback); liveMeta = null; }
  }
  function subscribe(path, callback) {
    const ref = db.ref(path);
    ref.on("value", callback, error => message(dataError(error), true));
    subscriptions.push([ref, callback]);
  }
  function closePreview() {
    $("previewAudio").pause();
    $("previewAudio").removeAttribute("src");
    $("previewAudio").load();
    $("previewPanel").classList.add("hidden");
    if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ""; }
  }
  $("logoutBtn").onclick = async () => {
    if (busy) return message("Aguarde terminar o salvamento antes de sair.");
    $("logoutBtn").disabled = true;
    try { await studio.stop(); await auth.signOut(); }
    catch (_) { message("Não foi possível sair. Tente novamente.", true); }
    finally { $("logoutBtn").disabled = false; }
  };
  auth.onAuthStateChanged(async user => {
    unsubscribe();
    audience.stop();
    const allowed = !!user && user.uid === C.ADMIN_UID;
    $("loginCard").classList.toggle("hidden", allowed);
    $("studio").classList.toggle("hidden", !allowed);
    $("logoutBtn").classList.toggle("hidden", !allowed);
    if (user && !allowed) {
      denied = true;
      message("Esta conta não é a administradora da rádio. Confira o e-mail do UID indicado abaixo.", true, true);
      try { await auth.signOut(); } catch (_) {}
      return;
    }
    if (!allowed) {
      studio.stop().catch(() => {});
      youtube.closePreview();
      closePreview();
      programs = {}; schedule = {}; live = {}; config = {}; connected = false;
      dirtyForms.clear();
      resetProgram(); resetSchedule();
      $("configForm").reset(); $("liveForm").reset();
      $("sessionEmail").textContent = "";
      $("password").value = "";
      if (!denied) message("Entre com o e-mail e a senha da conta cadastrada. Se precisar, use as opções de recuperação abaixo.", false, true);
      return;
    }
    audience.start();
    $("sessionEmail").textContent = user.email || "Administrador autenticado";
    message("Administrador autenticado. Carregando a rádio…");
    subscribe(".info/connected", snapshot => {
      connected = snapshot.val() === true;
      $("connectionState").textContent = connected ? "● Conectado" : "Sem conexão";
      $("connectionState").dataset.connected = String(connected);
    });
    subscribe(C.ROOT + "/config", snapshot => {
      config = C.record(snapshot.val());
      if (!dirtyForms.has("configForm")) {
        $("stationName").value = config.stationName || "Rádio Hi-Mundim";
        $("stationTagline").value = config.tagline || "";
        $("continuousTitle").value = config.continuousTitle || "";
        $("continuousAudioUrl").value = config.continuousAudioUrl || "";
        $("continuousEnabled").checked = config.continuousEnabled === true;
      }
      updateMetrics();
    });
    subscribe(C.ROOT + "/live", snapshot => {
      live = C.record(snapshot.val());
      if (liveMeta) { liveMeta.ref.off("value", liveMeta.callback); liveMeta = null; }
      if (C.isRtcLive(live)) {
        live.studioAvailable = false;
        const ref = db.ref(C.ROOT + "/webrtc/" + live.webrtcSessionId + "/meta");
        const callback = snapshot => { live.studioAvailable = snapshot.val()?.active === true; updateLiveState(); };
        liveMeta = { ref, callback }; ref.on("value", callback, error => message(dataError(error), true));
      }
      if (!dirtyForms.has("liveForm")) {
        $("liveTitle").value = live.title || "";
        $("liveAudioUrl").value = live.audioUrl || "";
        $("liveDescription").value = live.description || "";
      }
      updateLiveState();
    });
    subscribe(C.ROOT + "/programs", snapshot => {
      programs = C.record(snapshot.val());
      renderPrograms(); renderSchedule(); updateMetrics();
    });
    subscribe(C.ROOT + "/schedule", snapshot => {
      schedule = C.record(snapshot.val());
      renderSchedule(); updateMetrics();
    });
    subscribe(C.ROOT + "/library", snapshot => { const value = C.record(snapshot.val()); studio.setLibrary(value); youtube.setLibrary(value); });
    subscribe(C.ROOT + "/liveMedia/youtube", snapshot => youtube.setMedia(C.record(snapshot.val())));
    message("Estúdio pronto. Ative o microfone para transmitir ou abra Programas gravados para enviar um áudio.");
  }, () => message("Não foi possível verificar a sessão. Recarregue a página.", true, true));
  function updateLiveState() {
    $("liveState").textContent = C.isRtcLive(live) ? (live.studioAvailable ? "Estúdio ao vivo: " : "Estúdio desconectado: ") + (live.title || "Hi-Mundim") : live.active ? "Fonte externa: " + (live.title || "Ao vivo") : "Nenhuma transmissão imediata ativa.";
    $("liveOffBtn").disabled = !live.active;
    studio.setLive(live);
    youtube.setLive(live);
    updateMetrics();
  }
  function updateMetrics() {
    const source = C.selectSource({ live, config, programs, schedule });
    $("metricAir").textContent = source ? (source.kind === "live" ? "Ao vivo" : source.kind === "schedule" ? "Programa no ar" : "Áudio contínuo") : "Fora do ar";
    $("metricPrograms").textContent = C.publishedPrograms(programs).length;
    $("metricSchedule").textContent = C.playableSchedule(schedule, programs).filter(s => !s.endAt || Number(s.endAt) > Date.now()).length;
  }
  $("configForm").addEventListener("submit", event => {
    event.preventDefault();
    run(event.currentTarget, async () => {
      const enabled = $("continuousEnabled").checked, rawUrl = $("continuousAudioUrl").value.trim();
      const stationName = $("stationName").value.trim();
      if (!stationName) throw new Error("Informe o nome da rádio.");
      const url = (rawUrl || enabled) ? C.requireAudio(rawUrl) : "";
      await db.ref(C.ROOT + "/config").update({ stationName, tagline: $("stationTagline").value.trim(), continuousTitle: $("continuousTitle").value.trim(), continuousAudioUrl: url, continuousEnabled: enabled, ...stamp() });
      dirtyForms.delete("configForm");
    }, "Configuração salva.");
  });
  $("liveForm").addEventListener("submit", event => {
    event.preventDefault();
    run(event.currentTarget, async () => {
      const title = $("liveTitle").value.trim();
      if (!title) throw new Error("Informe o título da transmissão.");
      const audioUrl = C.requireAudio($("liveAudioUrl").value);
      if (studio.active) await studio.stop();
      await db.ref(C.ROOT + "/live").update({ active: true, streamType: "URL", webrtcSessionId: "", title, description: $("liveDescription").value.trim(), audioUrl, startedAt: firebase.database.ServerValue.TIMESTAMP, ...stamp() });
      dirtyForms.delete("liveForm");
    }, "Fonte imediata publicada. Abra a rádio para ouvir.");
  });
  $("liveOffBtn").onclick = () => {
    if (!live.active || !confirm("Encerrar a fonte imediata? A rádio voltará para a agenda ou para o áudio contínuo configurado.")) return;
    run($("liveOffBtn"), () => C.isRtcLive(live) ? studio.stop() : db.ref(C.ROOT + "/live").update({ active: false, endedAt: firebase.database.ServerValue.TIMESTAMP, ...stamp() }), "Transmissão encerrada.");
  };
  function resetProgram() {
    $("programForm").reset(); $("programId").value = "";
    $("programFormTitle").textContent = "Cadastrar programa";
    $("cancelProgramEdit").classList.add("hidden");
    $("programFileNote").textContent = "Escolha o áudio para enviar.";
  }
  function resetSchedule() {
    $("scheduleForm").reset(); $("scheduleId").value = "";
    $("scheduleFormTitle").textContent = "Agendar programa";
    $("cancelScheduleEdit").classList.add("hidden");
  }
  $("cancelProgramEdit").onclick = resetProgram;
  $("cancelScheduleEdit").onclick = resetSchedule;
  $("programForm").addEventListener("submit", event => {
    event.preventDefault();
    run(event.currentTarget, async () => {
      const id = $("programId").value, title = $("programTitle").value.trim();
      if (!title) throw new Error("Informe o título do programa.");
      if (id && !programs[id]) throw new Error("Este programa foi removido. Cancele a edição e atualize a biblioteca.");
      const ref = id ? db.ref(C.ROOT + "/programs/" + id) : db.ref(C.ROOT + "/programs").push();
      const file = $("programAudioFile").files[0];
      let uploaded = {};
      if (file) { message("Enviando áudio do programa… Aguarde a confirmação."); uploaded = await window.HimundimMedia.uploadAudio(file); }
      if (!uploaded.url && !$("programAudioUrl").value.trim()) throw new Error("Escolha o arquivo de áudio do programa.");
      const audioUrl = uploaded.url || C.requireAudio($("programAudioUrl").value);
      if (auth.currentUser?.uid !== C.ADMIN_UID) throw new Error("Entre novamente antes de salvar o programa.");
      const values = { title, category: $("programCategory").value, description: $("programDescription").value.trim(), audioUrl, published: $("programPublished").value === "true", ...(file ? { fileName: uploaded.fileName, durationSec: uploaded.durationSec } : {}), ...stamp() };
      if (!id) { values.createdAt = firebase.database.ServerValue.TIMESTAMP; values.createdBy = auth.currentUser.uid; }
      await ref.update(values);
      resetProgram();
    }, "Programa salvo.");
  });
  $("scheduleForm").addEventListener("submit", event => {
    event.preventDefault();
    run(event.currentTarget, async () => {
      const programId = $("scheduleProgram").value, id = $("scheduleId").value;
      const startAt = C.fromLocalInput($("scheduleStart").value), endAt = C.fromLocalInput($("scheduleEnd").value);
      if (!programs[programId] || programs[programId].published === false) throw new Error("Selecione um programa publicado.");
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt) throw new Error("Informe início e fim válidos. O fim precisa ser depois do início.");
      if (endAt <= Date.now()) throw new Error("O horário informado já terminou.");
      const key = id || db.ref(C.ROOT + "/schedule").push().key;
      const candidate = { programId, startAt, endAt, published: true, ...stamp() };
      const result = await db.ref(C.ROOT + "/schedule").transaction(current => {
        const rows = C.record(current);
        if (id && !rows[id]) return;
        if (C.hasOverlap(candidate, rows, id)) return;
        return { ...rows, [key]: { ...C.record(rows[key]), ...candidate, ...(!id ? { createdAt: firebase.database.ServerValue.TIMESTAMP, createdBy: auth.currentUser.uid } : {}) } };
      }, undefined, false);
      if (!result.committed) throw new Error("O horário conflita com outro programa ou foi alterado em outra sessão. Confira a agenda antes de salvar.");
      resetSchedule();
    }, "Horário salvo na programação.");
  });
  function renderPrograms() {
    const selected = $("scheduleProgram").value;
    $("scheduleProgram").innerHTML = '<option value="">Selecione…</option>' + C.publishedPrograms(programs).map(p => '<option value="' + C.escape(p.id) + '">' + C.escape(p.title) + '</option>').join("");
    $("scheduleProgram").value = selected;
    const query = C.searchText($("adminSearch").value.trim());
    const rows = C.entries(programs).sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).filter(p => C.searchText(String(p.title || "") + " " + String(p.category || "") + " " + String(p.description || "")).includes(query));
    $("programAdminList").innerHTML = rows.length ? rows.map(p => '<article class="admin-list-item"><div class="item-copy"><span class="tag">' + C.escape(p.category || "Especial") + '</span><h3>' + C.escape(p.title || "Sem título") + '</h3><p>' + C.escape(p.description || "Sem descrição.") + '</p><small>' + (p.published === false ? "Rascunho" : "Publicado") + '</small></div><div class="item-actions"><button class="btn secondary compact" data-action="edit-program" data-id="' + C.escape(p.id) + '">Editar</button><button class="btn secondary compact" data-action="preview-program" data-id="' + C.escape(p.id) + '">Ouvir teste</button><button class="btn secondary compact" data-action="edit-audio" data-id="' + C.escape(p.id) + '">Cortar áudio</button><button class="btn secondary compact" data-action="toggle-program" data-id="' + C.escape(p.id) + '">' + (p.published === false ? "Publicar" : "Ocultar") + '</button><button class="btn danger compact" data-action="delete-program" data-id="' + C.escape(p.id) + '">Excluir</button></div></article>').join("") : '<p class="empty">' + (query ? "Nenhum programa encontrado." : "Sua biblioteca está vazia. Cadastre o primeiro programa acima.") + '</p>';
  }
  function renderSchedule() {
    const all = C.entries(schedule).sort((a, b) => Number(a.startAt || 0) - Number(b.startAt || 0));
    const rows = all.filter(s => $("showPastSchedule").checked || !s.endAt || Number(s.endAt) > Date.now());
    $("scheduleAdminList").innerHTML = rows.length ? rows.map(s => {
      const p = programs[s.programId], past = s.endAt && Number(s.endAt) <= Date.now();
      return '<article class="admin-list-item"><div class="item-copy"><h3>' + C.escape(p && p.title || "Programa indisponível") + '</h3><p>' + C.escape(C.formatDate(s.startAt)) + '<br>Até ' + C.escape(s.endAt ? C.formatDate(s.endAt) : "sem fim definido") + '</p><small>' + (past ? "Encerrado" : !p || p.published === false ? "Não será reproduzido: programa indisponível" : "Programado") + '</small></div><div class="item-actions"><button class="btn secondary compact" data-action="edit-schedule" data-id="' + C.escape(s.id) + '">Editar</button><button class="btn danger compact" data-action="delete-schedule" data-id="' + C.escape(s.id) + '">Remover</button></div></article>';
    }).join("") : '<p class="empty">Nenhum horário ' + ($("showPastSchedule").checked ? "cadastrado." : "pendente. Monte sua agenda ao lado.") + '</p>';
  }
  $("adminSearch").addEventListener("input", renderPrograms);
  $("showPastSchedule").addEventListener("change", renderSchedule);
  function preview(url, localFile = false) {
    try {
      $("previewAudio").src = localFile ? url : C.requireAudio(url);
      $("previewPanel").classList.remove("hidden");
      $("previewStatus").textContent = "O teste é ouvido apenas neste dispositivo.";
      $("previewAudio").play().catch(() => { $("previewStatus").textContent = "Use o controle de áudio para iniciar. Se não tocar, confira se o link é de áudio direto."; });
    } catch (error) { message(error.message, true); }
  }
  document.querySelectorAll("[data-preview]").forEach(button => button.onclick = () => {
    if (button.dataset.preview === "programAudioUrl" && $("programAudioFile").files[0]) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL($("programAudioFile").files[0]); preview(previewUrl, true);
    } else preview($(button.dataset.preview).value);
  });
  $("programAudioFile").onchange = () => { $("programFileNote").textContent = $("programAudioFile").files[0]?.name || (programs[$("programId").value]?.audioUrl ? "O áudio salvo será mantido." : "Escolha o áudio para enviar."); };
  $("closePreview").onclick = closePreview;
  $("previewAudio").addEventListener("error", () => { $("previewStatus").textContent = "O áudio não pôde ser carregado. Confira o link, o formato e o servidor."; });
  $("studio").addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const id = button.dataset.id, action = button.dataset.action;
    if (!/^[\w-]+$/.test(id || "")) return;
    const p = programs[id], s = schedule[id];
    if (action === "edit-program" && p) {
      $("programId").value = id; $("programTitle").value = p.title || "";
      $("programCategory").value = C.CATEGORIES.includes(p.category) ? p.category : "Especial";
      $("programAudioUrl").value = p.audioUrl || ""; $("programDescription").value = p.description || "";
      $("programAudioFile").value = ""; $("programFileNote").textContent = "Áudio salvo: " + (p.fileName || "arquivo disponível") + ". Escolha outro arquivo somente para substituí-lo.";
      $("programPublished").value = String(p.published !== false);
      $("programFormTitle").textContent = "Editar programa"; $("cancelProgramEdit").classList.remove("hidden");
      $("recordedTools").open = true;
      $("programEditor").scrollIntoView({ block: "start" }); $("programTitle").focus({ preventScroll: true });
    }
    if (action === "preview-program" && p) preview(p.audioUrl);
    if (action === "edit-audio" && p) recorder.openProgram({ ...p, id }).catch(error => message(error.message, true));
    if (action === "toggle-program" && p) {
      if (p.published !== false && !confirm("Ocultar este programa? Ele deixará de tocar na agenda e de aparecer na biblioteca pública.")) return;
      run(button, () => db.ref(C.ROOT + "/programs/" + id).update({ published: p.published === false, ...stamp() }), p.published === false ? "Programa publicado." : "Programa oculto.");
    }
    if (action === "delete-program" && p) {
      if (C.entries(schedule).some(item => item.programId === id)) return message("Este programa está vinculado à agenda. Remova os horários vinculados antes de excluí-lo, ou use Ocultar.", true);
      if (!confirm('Excluir definitivamente o programa "' + (p.title || "Sem título") + '"?')) return;
      run(button, () => db.ref(C.ROOT + "/programs/" + id).remove(), "Programa excluído.");
    }
    if (action === "edit-schedule" && s) {
      $("scheduleId").value = id; $("scheduleProgram").value = s.programId || "";
      $("scheduleStart").value = C.toLocalInput(s.startAt); $("scheduleEnd").value = C.toLocalInput(s.endAt);
      $("scheduleFormTitle").textContent = "Editar horário"; $("cancelScheduleEdit").classList.remove("hidden");
      $("agenda").scrollIntoView({ block: "start" });
    }
    if (action === "delete-schedule" && s) {
      if (!confirm("Remover este horário da programação? O programa continuará na biblioteca.")) return;
      run(button, () => db.ref(C.ROOT + "/schedule/" + id).remove(), "Horário removido.");
    }
  });
})();
