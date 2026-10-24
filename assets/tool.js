(function () {
  "use strict";

  var root = document.getElementById("vp-tool");
  if (!root || !window.fetch || !window.FormData) return;

  var API = (root.getAttribute("data-api") || "https://bot.voicepad.qupport.io").replace(/\/+$/, "");
  var LANG = root.getAttribute("data-lang") === "en" ? "en" : "ru";
  var BOT = root.getAttribute("data-bot") || "Voicepad_bot";
  var SOURCE = (root.getAttribute("data-source") || "site").replace(/[^a-z0-9_]/g, "");
  // Browser recordings are capped even for signed-in visitors: longer recordings belong in a file or the bot.
  var SIGNED_IN_RECORD_SECONDS = 30 * 60;
  var POLL_MS = 1500;
  var POLL_MAX_FAILURES = 40;

  var TEXTS = {
    ru: {
      tabRecord: "Записать голос", tabFile: "Загрузить файл", tabLink: "Ссылка на видео",
      recordStart: "Начать запись", recordStop: "Остановить и расшифровать", recording: "Идёт запись",
      recordHint: "Нажмите и говорите. Браузер спросит доступ к микрофону.",
      recordHintActive: "Говорите. Когда закончите, нажмите «Остановить и расшифровать».",
      recordUnsupported: "Этот браузер не умеет записывать звук. Загрузите файл или отправьте голосовое боту.",
      micDenied: "Нет доступа к микрофону. Разрешите его в настройках браузера или загрузите файл.",
      micUnavailable: "Микрофон недоступен: проверьте, что он подключён и не занят другой программой, или загрузите файл.",
      recordFailed: "Этот браузер не смог начать запись. Загрузите файл или отправьте голосовое боту.",
      recordFirst: "Сначала остановите запись: она расшифруется, потом можно загрузить файл.",
      tabsLabel: "Способ расшифровки",
      fileDrop: "Перетащите аудио или видео сюда или нажмите, чтобы выбрать",
      fileTap: "Нажмите, чтобы выбрать аудио или видео",
      fileFormats: "MP3, M4A, WAV, OGG, OPUS, MP4, MOV, WEBM и другие",
      linkPlaceholder: "https://youtu.be/…", linkButton: "Расшифровать",
      linkLogin: "Ссылки на YouTube, VK Видео, RuTube, TikTok, Vimeo, Дзен, OK и Twitch работают после входа через Telegram: минуты списываются с баланса бота.",
      trialInfo: function (left, maxSec, perDay) {
        return "Без входа: " + left + " из " + perDay + " расшифровок сегодня, у длинной записи первые " + limitText(maxSec) + ". Вход через Telegram открывает длинные файлы, ссылки и бесплатные минуты бота.";
      },
      trialOff: "Без входа расшифровка сейчас недоступна. Войдите через Telegram или отправьте запись боту.",
      trialBusy: "Бесплатные расшифровки без входа сейчас заняты. Войдите через Telegram или отправьте запись боту.",
      accountInfo: function (account) {
        if (account.unlimited) return "Вы вошли. Без ограничений по минутам.";
        return "Вы вошли. Бесплатно в этом месяце: " + duration(account.free_left_seconds) + ", оплачено: " + duration(account.paid_seconds) + ".";
      },
      loginTitle: "Войти через Telegram", loginLoading: "Загружаю кнопку Telegram", logout: "Выйти",
      uploading: "Загружаю", queued: "В очереди", downloading: "Скачиваю видео", converting: "Готовлю звук",
      recognizing: "Распознаю речь", recognizingParts: function (done, total) { return "Распознаю речь: " + done + " из " + total; },
      copy: "Копировать текст", copied: "Скопировано", copyFailed: "Выделите текст и скопируйте вручную", resultTitle: "Расшифровка готова",
      speaker: "Спикер", botCta: function (bot) { return "Нужен конспект и задачи? Пришлите голосовое или файл боту @" + bot; },
      botCtaSaved: "Открыть в боте: конспект, задачи, вопросы",
      truncated: function (maxSec) { return "Без входа расшифрованы первые " + limitText(maxSec) + ". Войдите через Telegram или отправьте запись боту, чтобы получить текст целиком."; },
      errors: {
        trial_too_long: function (p) { return "Без входа можно расшифровать запись до " + limitText(p.max_seconds) + ". Войдите через Telegram или отправьте запись боту."; },
        trial_disabled: function () { return "Без входа расшифровка сейчас недоступна. Войдите через Telegram или отправьте запись боту."; },
        session_expired: function () { return "Вход устарел. Войдите через Telegram ещё раз."; },
        upload_timeout: function () { return "Файл загружался слишком медленно, и загрузка прервалась. Проверьте интернет и попробуйте снова или отправьте запись боту."; },
        trial_daily_limit: function () { return "Бесплатные расшифровки без входа на сегодня закончились. Войдите через Telegram, чтобы продолжить с бесплатными минутами бота."; },
        trial_busy: function () { return "Общий бесплатный лимит без входа на сегодня исчерпан. Войдите через Telegram или отправьте запись боту."; },
        login_required: function () { return "Войдите через Telegram кнопкой ниже или отправьте ссылку боту @" + BOT + ": он принимает ссылки без входа."; },
        too_long: function (p) { return "Запись длиннее " + p.max_minutes + " минут, такую не расшифровать."; },
        insufficient_balance: function (p) {
          if (!p.needed_seconds) return "Минуты закончились. Пополнить можно в боте командой /buy.";
          return "Не хватает минут: нужно " + duration(p.needed_seconds) + ", осталось " + duration(p.left_seconds) + ". Пополнить можно в боте командой /buy.";
        },
        bad_link: function () { return "Не получилось открыть ссылку. Проверьте, что видео открыто для всех."; },
        live_stream: function () { return "Прямые трансляции не расшифровываются, дождитесь записи."; },
        no_audio: function () { return "В файле нет звука или формат не распознан."; },
        no_speech: function () { return "Речь не найдена: запись тихая или без слов."; },
        too_big: function (p) {
          if (p && p.max_upload_mb && !sessionToken()) return "Файл больше " + p.max_upload_mb + " МБ. Войдите через Telegram: после входа можно загрузить файл до 200 МБ.";
          return "Файл слишком большой" + (p && p.max_upload_mb ? " (до " + p.max_upload_mb + " МБ)" : "") + ". Сохраните из него только звук или пришлите ссылку на видео.";
        },
        busy: function () { return "Сейчас много задач. Попробуйте через минуту или отправьте запись боту."; },
        rate_limited: function () { return "Слишком много запросов. Подождите минуту."; },
        bad_login: function () { return "Вход не удался, попробуйте ещё раз."; },
        trial_pending: function () { return "Дождитесь окончания текущей расшифровки."; },
        already_running: function () { return "У вас уже идёт расшифровка в боте или на сайте. Дождитесь её окончания."; },
        unsupported_link: function () { return "Ссылки принимаются с YouTube, VK Видео, RuTube, TikTok, Vimeo, Дзена, OK и Twitch. Другой файл загрузите сюда напрямую."; },
        unknown_duration: function () { return "Не удалось узнать длину видео по ссылке. Скачайте файл и загрузите его сюда."; },
        network: function () { return "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз."; },
        failed: function () { return "Что-то пошло не так. Попробуйте ещё раз или отправьте запись боту."; }
      },
      min: "мин", sec: "сек"
    },
    en: {
      tabRecord: "Record voice", tabFile: "Upload a file", tabLink: "Video link",
      recordStart: "Start recording", recordStop: "Stop and transcribe", recording: "Recording",
      recordHint: "Press and speak. The browser will ask for microphone access.",
      recordHintActive: "Speak now. When you finish, press Stop and transcribe.",
      recordUnsupported: "This browser cannot record audio. Upload a file or send a voice message to the bot.",
      micDenied: "No microphone access. Allow it in the browser settings or upload a file.",
      micUnavailable: "The microphone is unavailable: check that it is connected and not used by another app, or upload a file.",
      recordFailed: "This browser could not start recording. Upload a file or send a voice message to the bot.",
      recordFirst: "Stop the recording first: it will be transcribed, then you can upload a file.",
      tabsLabel: "How to transcribe",
      fileDrop: "Drop audio or video here or click to choose",
      fileTap: "Tap to choose audio or video",
      fileFormats: "MP3, M4A, WAV, OGG, OPUS, MP4, MOV, WEBM and more",
      linkPlaceholder: "https://youtu.be/…", linkButton: "Transcribe",
      linkLogin: "Links from YouTube, VK Video, RuTube, TikTok, Vimeo, Dzen, OK and Twitch work after a Telegram login: minutes come from your bot balance.",
      trialInfo: function (left, maxSec, perDay) {
        return "Without a login: " + left + " of " + perDay + " transcriptions left today, the first " + limitText(maxSec) + " of a longer recording. A Telegram login unlocks long files, links and the bot's free minutes.";
      },
      trialOff: "Transcription without a login is unavailable right now. Log in with Telegram or send the recording to the bot.",
      trialBusy: "Free transcriptions without a login are busy right now. Log in with Telegram or send the recording to the bot.",
      accountInfo: function (account) {
        if (account.unlimited) return "You are signed in. No minute limits.";
        return "You are signed in. Free this month: " + duration(account.free_left_seconds) + ", paid: " + duration(account.paid_seconds) + ".";
      },
      loginTitle: "Log in with Telegram", loginLoading: "Loading the Telegram button", logout: "Log out",
      uploading: "Uploading", queued: "Queued", downloading: "Downloading the video", converting: "Preparing audio",
      recognizing: "Recognizing speech", recognizingParts: function (done, total) { return "Recognizing speech: " + done + " of " + total; },
      copy: "Copy text", copied: "Copied", copyFailed: "Select the text and copy it by hand", resultTitle: "Transcript is ready",
      speaker: "Speaker", botCta: function (bot) { return "Need a summary and tasks? Send a voice message or the file to @" + bot; },
      botCtaSaved: "Open in the bot: summary, tasks, questions",
      truncated: function (maxSec) { return "Without a login the first " + limitText(maxSec) + " were transcribed. Log in with Telegram or send the recording to the bot to get the whole text."; },
      errors: {
        trial_too_long: function (p) { return "Without a login recordings up to " + limitText(p.max_seconds) + " are transcribed. Log in with Telegram or send it to the bot."; },
        trial_disabled: function () { return "Transcription without a login is unavailable right now. Log in with Telegram or send the recording to the bot."; },
        session_expired: function () { return "Your login has expired. Log in with Telegram again."; },
        upload_timeout: function () { return "The upload was too slow and stopped. Check the connection and try again, or send the recording to the bot."; },
        trial_daily_limit: function () { return "Today's free transcriptions without a login are used up. Log in with Telegram to continue with the bot's free minutes."; },
        trial_busy: function () { return "The shared free quota without a login is used up for today. Log in with Telegram or send the recording to the bot."; },
        login_required: function () { return "Log in with the Telegram button below, or send the link to @" + BOT + ": the bot takes links without a login."; },
        too_long: function (p) { return "The recording is longer than " + p.max_minutes + " minutes."; },
        insufficient_balance: function (p) {
          if (!p.needed_seconds) return "You are out of minutes. Top up in the bot with /buy.";
          return "Not enough minutes: " + duration(p.needed_seconds) + " needed, " + duration(p.left_seconds) + " left. Top up in the bot with /buy.";
        },
        bad_link: function () { return "Could not open the link. Check that the video is public."; },
        live_stream: function () { return "Live streams are not transcribed, wait for the recording."; },
        no_audio: function () { return "The file has no sound or the format is not recognized."; },
        no_speech: function () { return "No speech found: the recording is silent or has no words."; },
        too_big: function (p) {
          if (p && p.max_upload_mb && !sessionToken()) return "The file is over " + p.max_upload_mb + " MB. Log in with Telegram to upload files up to 200 MB.";
          return "The file is too big" + (p && p.max_upload_mb ? " (up to " + p.max_upload_mb + " MB)" : "") + ". Keep only the audio track or share a link to the video.";
        },
        busy: function () { return "Too many jobs right now. Try again in a minute or send it to the bot."; },
        rate_limited: function () { return "Too many requests. Wait a minute."; },
        bad_login: function () { return "Login failed, please try again."; },
        trial_pending: function () { return "Wait for the current transcription to finish."; },
        already_running: function () { return "You already have a transcription running in the bot or on the site. Wait for it to finish."; },
        unsupported_link: function () { return "Links from YouTube, VK Video, RuTube, TikTok, Vimeo, Dzen, OK and Twitch are accepted. Upload any other file here directly."; },
        unknown_duration: function () { return "Could not find out the length of this video. Download the file and upload it here."; },
        network: function () { return "Cannot reach the server. Check the connection and try again."; },
        failed: function () { return "Something went wrong. Try again or send the recording to the bot."; }
      },
      min: "min", sec: "s"
    }
  };
  var t = TEXTS[LANG];

  function minutes(seconds) {
    var whole = Math.max(0, Math.round(seconds / 60));
    return whole + " " + t.min;
  }

  // Caps are whole minutes unless the shared trial budget is nearly spent, when the server cuts at what is left.
  function limitText(seconds) {
    return seconds % 60 === 0 ? minutes(seconds) : duration(seconds);
  }

  function duration(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    var mins = Math.floor(seconds / 60), secs = seconds % 60;
    return mins + " " + t.min + (secs ? " " + secs + " " + t.sec : "");
  }

  function clock(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    var hours = Math.floor(seconds / 3600), mins = Math.floor((seconds % 3600) / 60), secs = seconds % 60;
    var pad = function (value) { return (value < 10 ? "0" : "") + value; };
    return (hours ? hours + ":" + pad(mins) : pad(mins)) + ":" + pad(secs);
  }

  // Same rule as the page's inline script, which rewrites static bot links before this widget renders its own.
  function visitSource() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = (params.get("ref") || params.get("utm_source") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (raw && raw.length <= 24) return raw;
    } catch (err) { /* keep the page source */ }
    return SOURCE;
  }

  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
    } catch (err) { return null; }
    return null;
  }

  function deviceId() {
    var existing = store("vp_device");
    if (existing && /^[A-Za-z0-9-]{8,64}$/.test(existing)) return existing;
    var created = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID()
      : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
    store("vp_device", created);
    return created;
  }

  function sessionToken() {
    var raw = store("vp_session");
    if (!raw) return "";
    try {
      var saved = JSON.parse(raw);
      if (saved && saved.token && saved.expires_at * 1000 > Date.now()) return saved.token;
    } catch (err) { /* fall through to drop it */ }
    store("vp_session", null);
    return "";
  }

  function headers() {
    var result = { "X-Device-ID": deviceId() };
    var token = sessionToken();
    if (token) result.Authorization = "Bearer " + token;
    return result;
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // UI skeleton

  root.textContent = "";
  root.classList.add("vp-ready");
  root.setAttribute("data-state", "idle");
  var card = element("div", "vp-card");
  var tabs = element("div", "vp-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", t.tabsLabel);
  var panels = {};
  var tabButtons = {};
  var TAB_ORDER = ["record", "file", "link"];
  [["record", t.tabRecord], ["file", t.tabFile], ["link", t.tabLink]].forEach(function (entry) {
    var button = element("button", "vp-tab", entry[1]);
    button.type = "button";
    button.id = "vp-tab-" + entry[0];
    button.setAttribute("role", "tab");
    button.setAttribute("data-tab", entry[0]);
    button.setAttribute("aria-controls", "vp-panel-" + entry[0]);
    button.addEventListener("click", function () { selectTab(entry[0], true); });
    tabButtons[entry[0]] = button;
    tabs.appendChild(button);
    var panel = element("div", "vp-panel");
    panel.id = "vp-panel-" + entry[0];
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panels[entry[0]] = panel;
  });
  tabs.addEventListener("keydown", function (event) {
    var current = TAB_ORDER.indexOf(event.target.getAttribute("data-tab"));
    if (current < 0) return;
    var next = { ArrowRight: current + 1, ArrowLeft: current + TAB_ORDER.length + -1, Home: 0, End: TAB_ORDER.length + -1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    var name = TAB_ORDER[next % TAB_ORDER.length];
    selectTab(name, true);
    tabButtons[name].focus();
  });
  card.appendChild(tabs);
  Object.keys(panels).forEach(function (key) { card.appendChild(panels[key]); });

  var account = element("div", "vp-account");
  var accountText = element("p", "vp-account-text");
  var loginBox = element("div", "vp-login");
  account.appendChild(accountText);
  account.appendChild(loginBox);
  var progress = element("div", "vp-progress");
  var progressBar = element("div", "vp-progress-bar");
  var progressText = element("p", "vp-progress-text");
  progress.appendChild(progressBar);
  progress.appendChild(progressText);
  progress.hidden = true;
  var errorBox = element("p", "vp-error");
  errorBox.hidden = true;
  // One polite live region announces stages, errors and the finished result.
  var statusLine = element("p", "vp-status");
  statusLine.setAttribute("role", "status");
  statusLine.setAttribute("aria-live", "polite");
  statusLine.setAttribute("aria-atomic", "true");
  var resultBox = element("div", "vp-result");
  resultBox.hidden = true;
  card.appendChild(progress);
  card.appendChild(errorBox);
  card.appendChild(resultBox);
  card.appendChild(account);
  card.appendChild(statusLine);
  root.appendChild(card);

  var state = { status: null, busy: false, starting: false, recorder: null, stream: null, timer: null, label: "" };

  function setState(name) {
    root.setAttribute("data-state", name);
  }

  function announce(message) {
    statusLine.textContent = message;
  }

  // Record panel

  var recordButton = element("button", "vp-record", t.recordStart);
  recordButton.type = "button";
  var recordClock = element("p", "vp-clock");
  var clockNow = element("span", "vp-clock-now", clock(0));
  var clockLimit = element("span", "vp-clock-limit");
  recordClock.appendChild(clockNow);
  recordClock.appendChild(clockLimit);
  var recordHint = element("p", "vp-hint", t.recordHint);
  var meter = element("div", "vp-meter");
  meter.setAttribute("aria-hidden", "true");
  meter.appendChild(element("span", "vp-meter-fill"));
  panels.record.appendChild(recordButton);
  panels.record.appendChild(recordClock);
  panels.record.appendChild(meter);
  panels.record.appendChild(recordHint);
  var recordingSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (!recordingSupported) {
    recordButton.disabled = true;
    recordHint.textContent = t.recordUnsupported;
  }
  recordButton.addEventListener("click", function () {
    if (state.recorder) stopRecording(); else startRecording();
  });

  // MP4 and Ogg first: they state their length, so the server can check limits before decoding; WebM is measured by decoding.
  function recordingType() {
    var candidates = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
    for (var index = 0; index < candidates.length; index++) {
      if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(candidates[index])) return candidates[index];
    }
    return "";
  }

  function recordLimitSeconds() {
    var trial = state.status && state.status.trial;
    if (trial) return trial.enabled ? trial.max_seconds : 0;
    return SIGNED_IN_RECORD_SECONDS;
  }

  function showClock(elapsed) {
    clockNow.textContent = clock(elapsed);
    clockLimit.textContent = state.status && recordLimitSeconds() ? " / " + clock(recordLimitSeconds()) : "";
  }

  function recordingActive() {
    return !!(state.recorder || state.starting);
  }

  function releaseStream(stream) {
    stream.getTracks().forEach(function (track) { track.stop(); });
  }

  // Input level for the meter and the "vp-level" event. The AudioContext is created inside the click so iOS Safari lets it run.
  var AudioContextClass = window.AudioContext || window.webkitAudioContext;
  var level = { context: null, analyser: null, source: null, samples: null, frame: 0, shown: 0 };

  function prepareLevel() {
    if (!AudioContextClass) return;
    try {
      if (!level.context || level.context.state === "closed") level.context = new AudioContextClass();
      if (level.context.state === "suspended" && level.context.resume) level.context.resume();
    } catch (err) { level.context = null; }
  }

  function watchLevel(stream) {
    if (!level.context) return;
    try {
      level.analyser = level.context.createAnalyser();
      level.analyser.fftSize = 1024;
      level.source = level.context.createMediaStreamSource(stream);
      level.source.connect(level.analyser);
      level.samples = level.analyser.getFloatTimeDomainData ? new Float32Array(level.analyser.fftSize) : new Uint8Array(level.analyser.fftSize);
    } catch (err) { level.analyser = null; return; }
    level.shown = 0;
    var tick = function () {
      if (!level.analyser) return;
      var peak = 0, index;
      if (level.samples instanceof Float32Array) {
        level.analyser.getFloatTimeDomainData(level.samples);
        for (index = 0; index < level.samples.length; index++) peak = Math.max(peak, Math.abs(level.samples[index]));
      } else {
        level.analyser.getByteTimeDomainData(level.samples);
        for (index = 0; index < level.samples.length; index++) peak = Math.max(peak, Math.abs(level.samples[index] + -128) / 128);
      }
      var decibels = peak > 0 ? 20 * Math.log(peak) / Math.LN10 : -48;
      var target = Math.max(0, Math.min(1, (decibels + 48) / 48));
      level.shown = target > level.shown ? target : level.shown * 0.9;
      emitLevel(level.shown);
      level.frame = window.requestAnimationFrame(tick);
    };
    level.frame = window.requestAnimationFrame(tick);
  }

  function stopLevel() {
    window.cancelAnimationFrame(level.frame);
    if (level.source) { try { level.source.disconnect(); } catch (err) { /* already gone */ } }
    level.source = null;
    level.analyser = null;
    emitLevel(0);
    if (level.context && level.context.state === "running" && level.context.suspend) level.context.suspend();
  }

  function emitLevel(value) {
    var rounded = Math.round(value * 1000) / 1000;
    meter.style.setProperty("--vp-level", String(rounded));
    if (typeof window.CustomEvent === "function") root.dispatchEvent(new CustomEvent("vp-level", { bubbles: true, detail: { level: rounded } }));
  }

  function startRecording() {
    if (state.busy || recordingActive()) return;
    if (!recordLimitSeconds()) { showErrorCode({ code: "trial_disabled" }); return; }
    hideError();
    prepareLevel();
    state.starting = true;
    recordButton.disabled = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      state.starting = false;
      recordButton.disabled = false;
      var type = recordingType();
      var recorder;
      try {
        recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      } catch (err) {
        releaseStream(stream);
        stopLevel();
        showError(t.recordFailed);
        return;
      }
      var chunks = [];
      var startedAt = Date.now();
      recorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
      recorder.onstop = function () {
        stopLevel();
        releaseStream(stream);
        window.clearInterval(state.timer);
        state.recorder = null;
        state.stream = null;
        recordButton.textContent = t.recordStart;
        recordButton.classList.remove("vp-recording");
        recordHint.textContent = t.recordHint;
        showClock(0);
        var blobType = recorder.mimeType || type || "audio/webm";
        var blob = new Blob(chunks, { type: blobType });
        var extension = blobType.indexOf("mp4") >= 0 ? "m4a" : blobType.indexOf("ogg") >= 0 ? "ogg" : "webm";
        if (blob.size) submitFile(blob, "recording." + extension);
        else setState("idle");
      };
      try {
        recorder.start(1000);
      } catch (err) {
        releaseStream(stream);
        stopLevel();
        showError(t.recordFailed);
        return;
      }
      state.recorder = recorder;
      state.stream = stream;
      recordButton.textContent = t.recordStop;
      recordButton.classList.add("vp-recording");
      recordHint.textContent = t.recordHintActive;
      setState("recording");
      announce(t.recording);
      watchLevel(stream);
      var limit = recordLimitSeconds();
      state.timer = window.setInterval(function () {
        var elapsed = (Date.now()-startedAt) / 1000;
        showClock(Math.min(elapsed, limit));
        if (elapsed >= limit) stopRecording();
      }, 250);
    }, function (err) {
      state.starting = false;
      recordButton.disabled = false;
      stopLevel();
      var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      showError(denied ? t.micDenied : t.micUnavailable);
    });
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  }

  // File panel

  var dropZone = element("label", "vp-drop");
  var fileInput = element("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*,video/*,.opus,.oga,.m4a,.mkv";
  dropZone.appendChild(fileInput);
  var touchOnly = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  dropZone.appendChild(element("span", "vp-drop-title", touchOnly ? t.fileTap : t.fileDrop));
  dropZone.appendChild(element("span", "vp-hint", t.fileFormats));
  panels.file.appendChild(dropZone);
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) submitPicked(fileInput.files[0]);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach(function (name) {
    dropZone.addEventListener(name, function (event) { event.preventDefault(); dropZone.classList.add("vp-over"); });
  });
  ["dragleave", "drop"].forEach(function (name) {
    dropZone.addEventListener(name, function (event) { event.preventDefault(); dropZone.classList.remove("vp-over"); });
  });
  dropZone.addEventListener("drop", function (event) {
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) submitPicked(file);
  });

  function submitPicked(file) {
    if (recordingActive()) { showError(t.recordFirst); return; }
    submitFile(file, file.name);
  }

  // Link panel

  var linkForm = element("form", "vp-link");
  var linkInput = element("input");
  linkInput.type = "url";
  linkInput.required = true;
  linkInput.placeholder = t.linkPlaceholder;
  linkInput.setAttribute("aria-label", t.tabLink);
  var linkButton = element("button", "vp-button", t.linkButton);
  linkButton.type = "submit";
  linkForm.appendChild(linkInput);
  linkForm.appendChild(linkButton);
  var linkNote = element("p", "vp-hint", t.linkLogin);
  panels.link.appendChild(linkForm);
  panels.link.appendChild(linkNote);
  linkForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (state.busy) return;
    if (recordingActive()) { showError(t.recordFirst); return; }
    if (!sessionToken()) { showErrorCode({ code: "login_required" }); return; }
    hideError();
    startJob(function (request) {
      request.setRequestHeader("Content-Type", "application/json");
      request.send(JSON.stringify({ link: linkInput.value.trim() }));
    }, false);
  });

  function knownTab(name) {
    return TAB_ORDER.indexOf(name) >= 0 ? name : "";
  }

  function selectTab(name, remember) {
    Object.keys(panels).forEach(function (key) {
      var active = key === name;
      panels[key].hidden = !active;
      tabButtons[key].classList.toggle("vp-active", active);
      tabButtons[key].setAttribute("aria-selected", active ? "true" : "false");
      tabButtons[key].tabIndex = active ? 0 : -1;
    });
    if (remember) store("vp_tab", name);
  }
  selectTab(knownTab(root.getAttribute("data-tab")) || knownTab(store("vp_tab")) || (recordingSupported ? "record" : "file"), false);

  // Account and login

  window.voicepadOnTelegramAuth = function (user) {
    var request = new XMLHttpRequest();
    request.open("POST", API + "/api/web/auth/telegram?lang=" + LANG);
    request.setRequestHeader("Content-Type", "application/json");
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status === 200 && body && body.token) {
        store("vp_session", JSON.stringify({ token: body.token, expires_at: body.expires_at, name: body.user && body.user.name }));
        hideError();
        refreshStatus();
      } else {
        showErrorCode(body && body.error, "bad_login");
      }
    };
    request.onerror = function () { showErrorCode(null, "network"); };
    request.send(JSON.stringify(user));
  };

  // The Telegram widget (a script plus an iframe from telegram.org) loads on the first interaction with the tool, not with the page.
  var login = { mode: "", wanted: false, requested: false, failed: false };

  function renderLogin() {
    var mode = sessionToken() ? "in" : "out";
    if (mode === login.mode) return;
    login.mode = mode;
    login.requested = false;
    loginBox.textContent = "";
    loginBox.classList.remove("vp-login-ready");
    if (mode === "in") {
      var logout = element("button", "vp-link-button", t.logout);
      logout.type = "button";
      logout.addEventListener("click", function () { store("vp_session", null); refreshStatus(); });
      loginBox.appendChild(logout);
      return;
    }
    if (login.failed) return;
    var placeholder = element("button", "vp-tg", t.loginTitle);
    placeholder.type = "button";
    placeholder.addEventListener("click", function () {
      placeholder.disabled = true;
      placeholder.textContent = t.loginLoading;
      loadLoginWidget();
    });
    loginBox.appendChild(placeholder);
    if (login.wanted) loadLoginWidget();
  }

  function loadLoginWidget() {
    login.wanted = true;
    if (login.mode !== "out" || login.failed || login.requested) return;
    login.requested = true;
    var watcher = window.MutationObserver ? new MutationObserver(function () {
      var frame = loginBox.querySelector("iframe");
      if (!frame) return;
      watcher.disconnect();
      var markReady = function () { if (frame.isConnected) loginBox.classList.add("vp-login-ready"); };
      frame.addEventListener("load", markReady);
      // A load event can fire before this observer runs; never leave the placeholder up for good.
      window.setTimeout(markReady, 3000);
    }) : null;
    if (watcher) watcher.observe(loginBox, { childList: true });
    var widget = document.createElement("script");
    widget.async = true;
    widget.src = "https://telegram.org/js/telegram-widget.js?22";
    widget.setAttribute("data-telegram-login", BOT);
    widget.setAttribute("data-size", "large");
    widget.setAttribute("data-radius", "2");
    widget.setAttribute("data-lang", LANG);
    widget.setAttribute("data-request-access", "write");
    widget.setAttribute("data-onauth", "voicepadOnTelegramAuth(user)");
    widget.onerror = function () {
      login.failed = true;
      if (watcher) watcher.disconnect();
      var hadFocus = loginBox.contains(document.activeElement);
      loginBox.textContent = "";
      if (hadFocus) {
        accountText.tabIndex = -1;
        accountText.focus();
      }
    };
    if (!watcher) widget.onload = function () { loginBox.classList.add("vp-login-ready"); };
    loginBox.appendChild(widget);
  }

  ["pointerover", "focusin", "touchstart"].forEach(function (name) {
    root.addEventListener(name, function wake() {
      root.removeEventListener(name, wake);
      loadLoginWidget();
    }, { passive: true });
  });

  function refreshStatus() {
    var request = new XMLHttpRequest();
    request.open("GET", API + "/api/web/status");
    var current = headers();
    Object.keys(current).forEach(function (key) { request.setRequestHeader(key, current[key]); });
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status === 401 && sessionToken()) { forgetSession(); return; }
      if (request.status !== 200 || !body) return;
      if (!body.account && sessionToken()) store("vp_session", null);
      state.status = body;
      if (body.account) accountText.textContent = t.accountInfo(body.account);
      else if (body.trial) accountText.textContent = trialText(body.trial);
      linkNote.hidden = !!body.account;
      if (!recordingActive()) showClock(0);
      renderLogin();
    };
    request.onerror = function () { accountText.textContent = ""; renderLogin(); };
    request.send();
  }

  function trialText(trial) {
    if (!trial.enabled) return t.trialOff;
    if (trial.busy) return t.trialBusy;
    return t.trialInfo(trial.uses_left, trial.max_seconds, trial.per_day);
  }

  // A token the server no longer accepts is dropped, and the page falls back to the trial view.
  function forgetSession() {
    store("vp_session", null);
    login.wanted = true;
    refreshStatus();
  }

  // Jobs

  function submitFile(file, name) {
    if (state.busy) return;
    hideError();
    var limits = state.status && (state.status.account || state.status.trial);
    if (limits && limits.max_upload_mb && file.size > limits.max_upload_mb * 1024 * 1024) {
      showErrorCode({ code: "too_big", params: { max_upload_mb: limits.max_upload_mb } });
      return;
    }
    startJob(function (request) {
      var form = new FormData();
      form.append("file", file, name || "recording.webm");
      request.send(form);
    }, true);
  }

  function startJob(send, withUpload) {
    state.busy = true;
    state.label = "";
    resultBox.hidden = true;
    setState(withUpload ? "uploading" : "working");
    setProgress(withUpload ? t.uploading : t.queued, withUpload ? 0 : null);
    var request = new XMLHttpRequest();
    request.open("POST", API + "/api/web/jobs");
    var current = headers();
    Object.keys(current).forEach(function (key) { request.setRequestHeader(key, current[key]); });
    if (withUpload && request.upload) {
      request.upload.onprogress = function (event) {
        if (event.lengthComputable) setProgress(t.uploading, event.loaded / event.total);
      };
    }
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status === 202 && body && body.id) {
        setState("working");
        setProgress(t.queued, null);
        poll(body.id);
        return;
      }
      finishWithError(body && body.error, "failed");
    };
    request.onerror = function () { finishWithError(null, "network"); };
    send(request);
  }

  function poll(jobId, failures) {
    failures = failures || 0;
    var retry = function () {
      if (failures + 1 >= POLL_MAX_FAILURES) { finishWithError(null, "network"); return; }
      window.setTimeout(function () { poll(jobId, failures + 1); }, POLL_MS * 2);
    };
    var request = new XMLHttpRequest();
    request.open("GET", API + "/api/web/jobs/" + encodeURIComponent(jobId));
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status >= 502 && request.status <= 504) { retry(); return; }
      if (request.status !== 200 || !body) { finishWithError(body && body.error, "failed"); return; }
      if (body.stage === "done") { state.busy = false; progress.hidden = true; renderResult(jobId, body.result); refreshStatus(); return; }
      if (body.stage === "failed") { finishWithError(body.error, "failed"); refreshStatus(); return; }
      var label = t[body.stage] || t.queued;
      var fraction = null;
      if (body.stage === "recognizing" && body.progress && body.progress.total > 1) {
        label = t.recognizingParts(body.progress.done, body.progress.total);
        fraction = body.progress.done / body.progress.total;
      }
      setProgress(label, fraction);
      window.setTimeout(function () { poll(jobId); }, POLL_MS);
    };
    request.onerror = retry;
    request.send();
  }

  function renderResult(jobId, result) {
    resultBox.textContent = "";
    var heading = element("div", "vp-result-head");
    var title = element("h3", "", t.resultTitle);
    title.tabIndex = -1;
    heading.appendChild(title);
    heading.appendChild(element("span", "vp-hint", duration(result.duration_seconds) + (result.language ? " · " + languageLabel(result.language) : "")));
    resultBox.appendChild(heading);
    if (result.truncated) resultBox.appendChild(element("p", "vp-note", t.truncated(result.trial_max_seconds)));

    var actions = element("div", "vp-actions");
    var copyButton = element("button", "vp-button", t.copy);
    copyButton.type = "button";
    copyButton.addEventListener("click", function () {
      copyText(plainText(result), copyButton).then(function (copied) {
        if (!copied) selectText(body);
        copyButton.textContent = copied ? t.copied : t.copyFailed;
        announce(copyButton.textContent);
        window.setTimeout(function () { copyButton.textContent = t.copy; }, copied ? 2000 : 4000);
      });
    });
    actions.appendChild(copyButton);
    ["txt", "srt", "docx"].forEach(function (format) {
      var link = element("a", "vp-button vp-secondary", format.toUpperCase());
      link.href = API + "/api/web/jobs/" + encodeURIComponent(jobId) + "/export?format=" + format + "&lang=" + LANG;
      link.rel = "nofollow";
      actions.appendChild(link);
    });
    resultBox.appendChild(actions);

    var body = element("div", "vp-text");
    (result.paragraphs || []).forEach(function (paragraph) {
      var line = element("p");
      line.appendChild(element("span", "vp-time", clock(paragraph.start)));
      line.appendChild(document.createTextNode(" "));
      if (result.speakers > 1 && paragraph.speaker) {
        line.appendChild(element("span", "vp-speaker", t.speaker + " " + paragraph.speaker));
        line.appendChild(document.createTextNode(" "));
      }
      line.appendChild(document.createTextNode(paragraph.text));
      body.appendChild(line);
    });
    resultBox.appendChild(body);

    var botLink = element("a", "vp-cta", result.saved ? t.botCtaSaved : t.botCta(BOT));
    botLink.href = result.saved ? result.bot_link : "https://t.me/" + BOT + "?start=src_" + visitSource();
    botLink.rel = "noopener";
    resultBox.appendChild(botLink);
    resultBox.hidden = false;
    setState("done");
    announce(t.resultTitle + ". " + duration(result.duration_seconds) + (result.truncated ? ". " + t.truncated(result.trial_max_seconds) : ""));
    if (result.truncated) loadLoginWidget();
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultBox.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
    try { title.focus({ preventScroll: true }); } catch (err) { title.focus(); }
  }

  var LANGUAGE_CODES = { rus: "RU", eng: "EN", ukr: "UK", kaz: "KK", kir: "KY", uzb: "UZ", deu: "DE", fra: "FR", spa: "ES", ita: "IT", tur: "TR", por: "PT", pol: "PL" };

  function languageLabel(code) {
    var lower = String(code).toLowerCase();
    return LANGUAGE_CODES[lower] || lower.slice(0, 3).toUpperCase();
  }

  function copyText(text, returnFocus) {
    var fallback = function () {
      var area = element("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "0";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (err) { copied = false; }
      document.body.removeChild(area);
      if (returnFocus) returnFocus.focus();
      return copied;
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
  }

  function selectText(node) {
    if (!window.getSelection || !document.createRange) return;
    var range = document.createRange();
    range.selectNodeContents(node);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function plainText(result) {
    return (result.paragraphs || []).map(function (paragraph) {
      var prefix = result.speakers > 1 && paragraph.speaker ? t.speaker + " " + paragraph.speaker + ": " : "";
      return prefix + paragraph.text;
    }).join("\n\n");
  }

  // Status helpers

  function setProgress(label, fraction) {
    progress.hidden = false;
    progressText.textContent = label + "…";
    if (label !== state.label) { state.label = label; announce(label + "…"); }
    progress.classList.toggle("vp-indeterminate", fraction === null);
    progressBar.style.width = fraction === null ? "100%" : Math.round(Math.min(1, Math.max(0.03, fraction)) * 100) + "%";
  }

  function finishWithError(failure, fallback) {
    state.busy = false;
    progress.hidden = true;
    showErrorCode(failure, fallback);
  }

  var LOGIN_CODES = ["login_required", "trial_daily_limit", "trial_busy", "trial_too_long", "trial_disabled", "too_big"];

  function showErrorCode(failure, fallback) {
    var code = failure && failure.code;
    if (code === "session_expired") forgetSession();
    if (LOGIN_CODES.indexOf(code) >= 0) loadLoginWidget();
    var render = (code && t.errors[code]) || t.errors[fallback || "failed"] || t.errors.failed;
    showError(render((failure && failure.params) || {}));
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
    if (!state.recorder) setState("error");
    announce(message);
  }

  function hideError() {
    errorBox.hidden = true;
    if (root.getAttribute("data-state") === "error") setState(resultBox.hidden ? "idle" : "done");
  }

  function parse(textBody) {
    try { return JSON.parse(textBody); } catch (err) { return null; }
  }

  refreshStatus();
})();
