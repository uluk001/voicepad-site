(function () {
  "use strict";

  var root = document.getElementById("vp-tool");
  if (!root || !window.fetch || !window.FormData) return;

  var API = (root.getAttribute("data-api") || "https://bot.voicepad.qupport.io").replace(/\/+$/, "");
  var LANG = root.getAttribute("data-lang") === "en" ? "en" : "ru";
  var BOT = root.getAttribute("data-bot") || "Voicepad_bot";
  var BOT_ID = parseInt(root.getAttribute("data-bot-id"), 10) || 8949252837;
  var SOURCE = (root.getAttribute("data-source") || "site").replace(/[^a-z0-9_]/g, "");
  var LINK_FIRST = root.getAttribute("data-tab") === "link";
  // Browser recordings are capped even for signed-in visitors: longer recordings belong in a file or the bot.
  var SIGNED_IN_RECORD_SECONDS = 30 * 60;
  var SIGNED_IN_UPLOAD_MB = 200;
  var TRIAL_UPLOAD_MB = 50;
  var TRIAL_SECONDS = 180;
  var FREE_MONTH_MINUTES = 15;
  var PACKS = [{ minutes: 60, rubles: 199 }, { minutes: 300, rubles: 690 }, { minutes: 1000, rubles: 1990 }];
  var BUY_LINK = "https://t.me/" + BOT + "?start=src_" + (LANG === "en" ? "en" : "site") + "_buy";
  var LOGIN_SCRIPT = "https://telegram.org/js/telegram-widget.js?22";
  // A login redirected back into a new tab counts only if this browser started one shortly before.
  var LOGIN_PENDING_MS = 10 * 60 * 1000;
  var POLL_MS = 1500;
  var POLL_MAX_FAILURES = 40;
  var REQUEST_TIMEOUT_MS = 15000;
  var METADATA_TIMEOUT_MS = 3000;
  // The server lets a recording run a moment past the cap before it counts as cut.
  var CAP_TOLERANCE_SECONDS = 1;
  var MB = 1024 * 1024;

  var TEXTS = {
    ru: {
      dropMouse: "Перетащите файл или нажмите, чтобы выбрать",
      dropTouch: "Выберите запись",
      linkLabel: "или вставьте ссылку на видео",
      linkLabelFirst: "Вставьте ссылку на видео",
      linkPlaceholder: "https://youtu.be/…",
      linkButton: "Расшифровать",
      linkNeedsLogin: "Ссылки расшифровываются после входа. 15 минут в месяц бесплатно.",
      linkInvalid: "Вставьте ссылку на видео целиком, как в адресной строке.",
      linkEmpty: "Сюда вставляется ссылка на видео. Запись с телефона или компьютера выберите выше.",
      linkKind: "Ссылка на видео",
      linkTooBig: "Видео по ссылке слишком большое. Скачайте из него звук и загрузите файлом.",
      micOpen: "Записать голос с микрофона",
      recordStart: "Начать запись", recordStop: "Остановить и расшифровать", recordCancel: "Отмена",
      recordHint: "Браузер спросит доступ к микрофону.",
      recordHintActive: "Говорите. Когда закончите, нажмите «Остановить и расшифровать».",
      recording: "Идёт запись",
      recordUnsupported: "Этот браузер не умеет записывать звук. Загрузите файл с записью.",
      micDenied: "Нет доступа к микрофону. Разрешите его в настройках браузера или загрузите файл.",
      micUnavailable: "Микрофон недоступен. Проверьте, что он подключён и не занят другой программой.",
      recordFailed: "Этот браузер не смог начать запись. Загрузите файл с записью.",
      recordingName: "Запись с микрофона",
      recordAgain: "Записать заново", another: "Выбрать другую", anotherLink: "Другая ссылка",
      checking: "Проверяю файл",
      firstPart: function (seconds) {
        // A live cap such as 137 s is promised in whole minutes: never more than the server delivers.
        if (seconds >= 60) seconds = Math.floor(seconds / 60) * 60;
        if (seconds % 60) return "первые " + duration(seconds);
        var mins = seconds / 60;
        return mins === 1 ? "первую минуту" : "первые " + mins + " " + plural(mins, ["минуту", "минуты", "минут"]);
      },
      limitsFresh: function (perDay, cap) {
        return "Без входа бесплатно: " + perDay + " " + plural(perDay, ["запись", "записи", "записей"]) + " в день, " + t.firstPart(cap) + " каждой.";
      },
      limitsLeft: function (left, perDay, cap) { return "Осталось бесплатно сегодня: " + left + " из " + perDay + ", " + t.firstPart(cap) + " каждой записи."; },
      limitsShort: function (left, perDay) { return "Осталось бесплатно сегодня: " + left + " из " + perDay + "."; },
      trialSpent: "На сегодня бесплатные закончились. После входа 15 минут в месяц бесплатно.",
      trialBusy: "Бесплатная расшифровка без входа сейчас перегружена. После входа 15 минут в месяц бесплатно.",
      trialOff: "Без входа расшифровка сейчас недоступна. После входа 15 минут в месяц бесплатно.",
      signedIn: function (account) {
        if (account.unlimited) return "Вы вошли: минуты без ограничений";
        var left = available(account);
        return left < 1 ? "Вы вошли: минуты закончились" : "Вы вошли: осталось " + roughDuration(left);
      },
      logout: "Выйти",
      login: "Войти через Telegram",
      loginTranscribe: "Войти через Telegram и расшифровать",
      loginNote: "Подтвердите вход в Telegram. Пароля нет, минуты общие с ботом.",
      loginLoading: "Подключаю Telegram",
      loginOpen: "Открыть окно Telegram",
      loginWaiting: "Открылось окно Telegram: подтвердите вход в нём.",
      loginClosed: "Окно Telegram закрыто, вход не завершён.",
      loginPopupBlocked: "Браузер не дал открыть окно Telegram. Разрешите всплывающие окна для этого сайта или откройте страницу в другом браузере.",
      loginBlocked: "Вход через Telegram не загрузился. Обновите страницу или отправьте запись боту @" + BOT + ".",
      loggedIn: "Вы вошли",
      loggedInElsewhere: "Вы вошли. Вернитесь на вкладку, где выбрали запись: расшифровка продолжится там.",
      overCap: function (seconds, cap) { return "Запись " + roughDuration(seconds) + ". Без входа расшифруем " + t.firstPart(cap) + " бесплатно."; },
      overCapButton: function (cap) { return "Расшифровать " + t.firstPart(cap); },
      overTrialSize: function (size, limit, seconds) {
        var text = "Файл " + size + " МБ, без входа можно до " + limit + " МБ. После входа до " + SIGNED_IN_UPLOAD_MB + " МБ и 15 минут в месяц бесплатно.";
        var pack = packBeyondFree(seconds);
        return pack ? text + " Если бесплатных не хватит, пакет на " + pack.minutes + " мин стоит " + price(pack) + "." : text;
      },
      overSize: function (limit) { return "Файл больше " + limit + " МБ, такой не загрузить. Если это видео, сохраните из него только звук."; },
      tooLong: function (seconds) {
        var hours = seconds / 3600, mins = Math.round(seconds / 60);
        var limit = hours % 1 ? mins + " " + plural(mins, ["минуты", "минут", "минут"]) : hours + " " + plural(hours, ["часа", "часов", "часов"]);
        return "Запись длиннее " + limit + ", такую не расшифровать.";
      },
      needMinutes: function (neededMin, freeMin, paidMin, restMin, pack) {
        var packLine = "Пакет на " + pack.minutes + " мин стоит " + price(pack) + ".";
        if (!neededMin) return "Минуты на балансе закончились. " + packLine;
        if (paidMin) return "Нужно " + neededMin + " мин, на балансе " + (freeMin + paidMin) + " мин. Не хватает " + restMin + " мин: пакет на " + pack.minutes + " мин стоит " + price(pack) + ".";
        if (freeMin) return "Нужно " + neededMin + " мин: " + freeMin + " " + plural(freeMin, ["бесплатная", "бесплатные", "бесплатных"]) + " + " + restMin + " из пакета. " + packLine;
        return "Нужно " + neededMin + " мин, а минут на балансе нет. " + packLine;
      },
      buy: "Купить минуты в боте",
      buyNote: "В боте отправьте /buy, потом вернитесь на эту страницу.",
      enoughNow: "Теперь минут хватает.", readyNow: "Теперь можно расшифровать.", start: "Расшифровать", retry: "Попробовать снова",
      uploading: function (percent) { return "Загружаю " + percent + "%"; },
      queued: "В очереди", downloading: "Скачиваю видео", converting: "Готовлю звук", recognizing: "Распознаю речь",
      recognizingParts: function (done, total) { return "Распознаю речь: часть " + done + " из " + total; },
      done: "Готово",
      transcript: "Текст расшифровки",
      copy: "Копировать текст", copied: "Скопировано", copyFailed: "Выделите текст и скопируйте вручную",
      download: "Скачать:", srt: "SRT (субтитры)",
      speaker: "Спикер",
      truncated: function (cap, full, signed) {
        var text = "Это первые " + shortDuration(cap) + (full ? " из " + roughDuration(full) : " записи") + ".";
        return signed ? text : text + " Чтобы расшифровать всю запись, войдите через Telegram. Загружать файл заново не нужно.";
      },
      truncatedLogin: "Войти и расшифровать целиком", truncatedSigned: "Расшифровать целиком",
      botText: "Конспект и задачи по этой записи сделает бот. Войдите через Telegram: запись расшифруется ещё раз и сохранится в боте.",
      botCost: function (seconds) { return "Это " + duration(Math.ceil(seconds)) + " из 15 бесплатных минут в месяц."; },
      botLogin: "Войти и сохранить в боте",
      botSaved: "Открыть в боте: конспект и задачи",
      botPlain: "Конспект и задачи по записи делает бот.", botOpen: "Открыть @" + BOT,
      errors: {
        trial_daily_limit: function () { return t.trialSpent; },
        trial_busy: function () { return t.trialBusy; },
        trial_disabled: function () { return t.trialOff; },
        trial_pending: function () { return "Дождитесь конца текущей расшифровки."; },
        login_required: function () { return t.linkNeedsLogin; },
        too_long: function (p) { return t.tooLong((p.max_minutes || 180) * 60); },
        no_audio: function () { return "В файле нет звука или формат не распознан."; },
        no_speech: function () { return "Речь не найдена: запись тихая или без слов."; },
        bad_link: function () { return "Не получилось открыть ссылку. Проверьте, что видео открыто для всех."; },
        unsupported_link: function () { return "Ссылки принимаются с YouTube, VK Видео, RuTube, TikTok, Vimeo, Дзена, OK и Twitch."; },
        unknown_duration: function () { return "Не удалось узнать длину видео. Скачайте его и загрузите файлом."; },
        live_stream: function () { return "Прямые трансляции не расшифровываются, дождитесь записи."; },
        busy: function () { return "Сейчас много задач. Попробуйте через минуту."; },
        rate_limited: function () { return "Слишком много запросов. Подождите минуту и попробуйте снова."; },
        already_running: function () { return "У вас уже идёт расшифровка в боте или на сайте. Дождитесь её конца."; },
        upload_timeout: function () { return "Файл загружался слишком медленно. Проверьте интернет и попробуйте снова."; },
        session_expired: function () { return "Вход устарел. Войдите через Telegram ещё раз."; },
        bad_login: function () { return "Вход не удался. Попробуйте ещё раз."; },
        not_found: function () { return "Расшифровка не найдена. Загрузите запись ещё раз."; },
        network: function () { return "Нет связи с сервером. Проверьте интернет и попробуйте снова."; },
        failed: function () { return "Что-то пошло не так. Попробуйте ещё раз."; }
      },
      decimal: ",", mb: "МБ", min: "мин", sec: "сек", hour: "ч", currency: " ₽"
    },
    en: {
      dropMouse: "Drag a file here or click to choose",
      dropTouch: "Choose a recording",
      linkLabel: "or paste a video link",
      linkLabelFirst: "Paste a video link",
      linkPlaceholder: "https://youtu.be/…",
      linkButton: "Transcribe",
      linkNeedsLogin: "Links need a Telegram login. 15 minutes a month are free.",
      linkInvalid: "Paste the whole video link, as in the address bar.",
      linkEmpty: "This field takes a video link. To transcribe a recording from your phone or computer, choose it above.",
      linkKind: "Video link",
      linkTooBig: "The video at this link is too large. Download its audio and upload it as a file.",
      micOpen: "Record your voice with the microphone",
      recordStart: "Start recording", recordStop: "Stop and transcribe", recordCancel: "Cancel",
      recordHint: "The browser will ask for microphone access.",
      recordHintActive: "Speak now. When you finish, press Stop and transcribe.",
      recording: "Recording",
      recordUnsupported: "This browser cannot record audio. Upload a file with the recording instead.",
      micDenied: "No microphone access. Allow it in the browser settings or upload a file.",
      micUnavailable: "The microphone is unavailable. Check that it is connected and not used by another app.",
      recordFailed: "This browser could not start recording. Upload a file with the recording instead.",
      recordingName: "Microphone recording",
      recordAgain: "Record again", another: "Choose another", anotherLink: "Another link",
      checking: "Checking the file",
      firstPart: function (seconds) {
        if (seconds >= 60) seconds = Math.floor(seconds / 60) * 60;
        if (seconds % 60) return "the first " + duration(seconds);
        var mins = seconds / 60;
        return mins === 1 ? "the first minute" : "the first " + mins + " minutes";
      },
      limitsFresh: function (perDay, cap) {
        return "Free without logging in: " + perDay + " " + plural(perDay, ["recording", "recordings"]) + " a day, " + t.firstPart(cap) + " of each.";
      },
      limitsLeft: function (left, perDay, cap) { return "Free recordings left today: " + left + " of " + perDay + ", " + t.firstPart(cap) + " of each."; },
      limitsShort: function (left, perDay) { return "Free recordings left today: " + left + " of " + perDay + "."; },
      trialSpent: "Today's free recordings are used up. After you log in, 15 minutes a month are free.",
      trialBusy: "Free transcription without logging in is overloaded right now. After you log in, 15 minutes a month are free.",
      trialOff: "Transcription without logging in is unavailable right now. After you log in, 15 minutes a month are free.",
      signedIn: function (account) {
        if (account.unlimited) return "Signed in: unlimited minutes";
        var left = available(account);
        return left < 1 ? "Signed in: no minutes left" : "Signed in: " + roughDuration(left) + " left";
      },
      logout: "Log out",
      login: "Log in with Telegram",
      loginTranscribe: "Log in with Telegram and transcribe",
      loginNote: "Confirm the login in Telegram. There is no password, and the minutes are shared with the bot.",
      loginLoading: "Connecting to Telegram",
      loginOpen: "Open the Telegram window",
      loginWaiting: "A Telegram window opened: confirm the login there.",
      loginClosed: "The Telegram window was closed before the login finished.",
      loginPopupBlocked: "The browser blocked the Telegram window. Allow pop-ups for this site or open the page in another browser.",
      loginBlocked: "The Telegram login did not load. Reload the page or send the recording to @" + BOT + ".",
      loggedIn: "You are signed in",
      loggedInElsewhere: "You are signed in. Go back to the tab where you chose the recording: the transcription continues there.",
      overCap: function (seconds, cap) { return "The recording is " + roughDuration(seconds) + ". Without logging in we transcribe " + t.firstPart(cap) + " for free."; },
      overCapButton: function (cap) { return "Transcribe " + t.firstPart(cap); },
      overTrialSize: function (size, limit, seconds) {
        var text = "The file is " + size + " MB, and without logging in the limit is " + limit + " MB. After you log in, files up to " + SIGNED_IN_UPLOAD_MB + " MB and 15 free minutes a month.";
        var pack = packBeyondFree(seconds);
        return pack ? text + " If the free minutes are not enough, a " + pack.minutes + " min pack costs " + price(pack) + "." : text;
      },
      overSize: function (limit) { return "The file is over " + limit + " MB and cannot be uploaded. If it is a video, save just the audio from it."; },
      tooLong: function (seconds) {
        var hours = seconds / 3600;
        return "The recording is longer than " + (hours % 1 ? Math.round(seconds / 60) + " minutes" : hours + " " + plural(hours, ["hour", "hours"])) + " and cannot be transcribed.";
      },
      needMinutes: function (neededMin, freeMin, paidMin, restMin, pack) {
        var packLine = "A " + pack.minutes + " min pack costs " + price(pack) + ".";
        if (!neededMin) return "Your minutes are used up. " + packLine;
        if (paidMin) return neededMin + " min needed, " + (freeMin + paidMin) + " min on your balance. " + restMin + " min short: a " + pack.minutes + " min pack costs " + price(pack) + ".";
        if (freeMin) return neededMin + " min needed: " + freeMin + " free + " + restMin + " from a pack. " + packLine;
        return neededMin + " min needed, and your balance is empty. " + packLine;
      },
      buy: "Buy minutes in the bot",
      buyNote: "Send /buy in the bot, then come back to this page.",
      enoughNow: "You have enough minutes now.", readyNow: "Ready to transcribe now.", start: "Transcribe", retry: "Try again",
      uploading: function (percent) { return "Uploading " + percent + "%"; },
      queued: "Queued", downloading: "Downloading the video", converting: "Preparing the audio", recognizing: "Recognizing speech",
      recognizingParts: function (done, total) { return "Recognizing speech: part " + done + " of " + total; },
      done: "Done",
      transcript: "Transcript text",
      copy: "Copy text", copied: "Copied", copyFailed: "Select the text and copy it by hand",
      download: "Download:", srt: "SRT (subtitles)",
      speaker: "Speaker",
      truncated: function (cap, full, signed) {
        var text = "These are the first " + shortDuration(cap) + (full ? " of " + roughDuration(full) : " of the recording") + ".";
        return signed ? text : text + " To transcribe the whole recording, log in with Telegram. No need to upload the file again.";
      },
      truncatedLogin: "Log in and transcribe it all", truncatedSigned: "Transcribe it all",
      botText: "The bot makes a summary and tasks from this recording. Log in with Telegram: the recording is transcribed once more and saved in the bot.",
      botCost: function (seconds) { return "That takes " + duration(Math.ceil(seconds)) + " of the 15 free minutes a month."; },
      botLogin: "Log in and save in the bot",
      botSaved: "Open in the bot: summary and tasks",
      botPlain: "The bot makes a summary and tasks from the recording.", botOpen: "Open @" + BOT,
      errors: {
        trial_daily_limit: function () { return t.trialSpent; },
        trial_busy: function () { return t.trialBusy; },
        trial_disabled: function () { return t.trialOff; },
        trial_pending: function () { return "Wait for the current transcription to finish."; },
        login_required: function () { return t.linkNeedsLogin; },
        too_long: function (p) { return t.tooLong((p.max_minutes || 180) * 60); },
        no_audio: function () { return "The file has no sound or its format is not recognized."; },
        no_speech: function () { return "No speech found: the recording is silent or has no words."; },
        bad_link: function () { return "Could not open the link. Check that the video is public."; },
        unsupported_link: function () { return "Links from YouTube, VK Video, RuTube, TikTok, Vimeo, Dzen, OK and Twitch are accepted."; },
        unknown_duration: function () { return "Could not find out the length of this video. Download it and upload the file."; },
        live_stream: function () { return "Live streams are not transcribed, wait for the recording."; },
        busy: function () { return "Too many jobs right now. Try again in a minute."; },
        rate_limited: function () { return "Too many requests. Wait a minute and try again."; },
        already_running: function () { return "You already have a transcription running in the bot or on the site. Wait for it to finish."; },
        upload_timeout: function () { return "The upload was too slow. Check the connection and try again."; },
        session_expired: function () { return "Your login has expired. Log in with Telegram again."; },
        bad_login: function () { return "The login failed. Please try again."; },
        not_found: function () { return "The transcript was not found. Upload the recording again."; },
        network: function () { return "Cannot reach the server. Check the connection and try again."; },
        failed: function () { return "Something went wrong. Please try again."; }
      },
      decimal: ".", mb: "MB", min: "min", sec: "sec", hour: "h", currency: " RUB"
    }
  };
  var t = TEXTS[LANG];

  var LOGIN_CODES = ["trial_daily_limit", "trial_busy", "trial_disabled", "login_required", "session_expired", "bad_login"];
  var RETRY_CODES = ["busy", "rate_limited", "already_running", "upload_timeout", "not_found", "network", "failed", "trial_pending"];
  // The recording or link itself is the problem, so the way on is another one.
  var CHANGE_CODES = ["no_audio", "no_speech", "bad_link", "unsupported_link", "unknown_duration", "live_stream", "too_long"];
  // Limits are not failures, so their notice stays neutral instead of red.
  var LIMIT_CODES = LOGIN_CODES.concat(["too_big", "insufficient_balance"]);

  function plural(count, forms) {
    if (forms.length === 2) return count === 1 ? forms[0] : forms[1];
    var lastDigit = count % 10, lastTwo = count % 100;
    if (lastDigit === 1 && lastTwo !== 11) return forms[0];
    if (lastDigit >= 2 && lastDigit <= 4 && (lastTwo < 10 || lastTwo >= 20)) return forms[1];
    return forms[2];
  }

  function duration(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    var mins = Math.floor(seconds / 60), secs = seconds % 60;
    if (!mins) return secs + " " + t.sec;
    return mins + " " + t.min + (secs ? " " + secs + " " + t.sec : "");
  }

  function shortDuration(seconds) {
    return seconds % 60 === 0 ? seconds / 60 + " " + t.min : duration(seconds);
  }

  // Long recordings read better in whole minutes than to the second.
  function roughDuration(seconds) {
    if (seconds < 600) return duration(seconds);
    var mins = Math.round(seconds / 60);
    if (mins < 60) return mins + " " + t.min;
    return Math.floor(mins / 60) + " " + t.hour + (mins % 60 ? " " + mins % 60 + " " + t.min : "");
  }

  function clock(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    var hours = Math.floor(seconds / 3600), mins = Math.floor((seconds % 3600) / 60), secs = seconds % 60;
    var pad = function (value) { return (value < 10 ? "0" : "") + value; };
    return (hours ? hours + ":" + pad(mins) : pad(mins)) + ":" + pad(secs);
  }

  // Next to a limit the size keeps a decimal, so a 50.3 MB file never reads as "50 MB" against a 50 MB limit.
  function sizeNumber(bytes, limit) {
    var megabytes = bytes / MB;
    if (limit && megabytes > limit && Math.round(megabytes) <= limit) return String(Math.ceil(megabytes * 10) / 10).replace(".", t.decimal);
    if (megabytes >= 10) return String(Math.round(megabytes));
    return String(Math.max(0.1, Math.round(megabytes * 10) / 10)).replace(".", t.decimal);
  }

  function available(account) {
    return (account.free_left_seconds || 0) + (account.paid_seconds || 0);
  }

  function packFor(minutes) {
    for (var index = 0; index < PACKS.length; index++) {
      if (PACKS[index].minutes >= minutes) return PACKS[index];
    }
    return PACKS[PACKS.length + -1];
  }

  function price(pack) {
    return pack.rubles + t.currency;
  }

  function packBeyondFree(seconds) {
    var neededMin = seconds ? Math.ceil(seconds / 60) : 0;
    return neededMin > FREE_MONTH_MINUTES ? packFor(neededMin + -FREE_MONTH_MINUTES) : null;
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

  // Values the browser refused to save live in memory for this tab, so a login still holds without localStorage.
  var memoryStore = {};

  function store(key, value) {
    var inMemory = Object.prototype.hasOwnProperty.call(memoryStore, key);
    try {
      if (value === undefined) {
        var saved = window.localStorage.getItem(key);
        return saved === null && inMemory ? memoryStore[key] : saved;
      }
      if (value === null) window.localStorage.removeItem(key); else window.localStorage.setItem(key, value);
      delete memoryStore[key];
    } catch (err) {
      if (value === undefined) return inMemory ? memoryStore[key] : null;
      if (value === null) delete memoryStore[key]; else memoryStore[key] = value;
    }
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

  function button(className, text, onClick) {
    var node = element("button", className, text);
    node.type = "button";
    if (onClick) node.addEventListener("click", onClick);
    return node;
  }

  function parse(textBody) {
    try { return JSON.parse(textBody); } catch (err) { return null; }
  }

  function looksLikeUrl(text) {
    return text.length < 2048 && /^https?:\/\/[^\s/]+\.[^\s]+$/i.test(text);
  }

  // Links copied without the scheme, such as www.youtube.com/watch?v=..., get https:// in front.
  function normalizeLink(text) {
    var link = String(text || "").trim();
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link) && /^[^\s/]+\.[^\s/]+\/\S/.test(link)) link = "https://" + link;
    return link;
  }

  function linkName(link) {
    var bare = link.replace(/^https?:\/\/(www\.)?/i, "");
    return bare.length > 64 ? bare.slice(0, 63) + "…" : bare;
  }

  function isTypingField(node) {
    if (!node || !node.tagName) return false;
    if (node.isContentEditable || node.tagName === "TEXTAREA" || node.tagName === "SELECT") return true;
    return node.tagName === "INPUT" && !/^(button|checkbox|radio|file|submit|reset|range|color|image)$/i.test(node.type);
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function reveal(node, block) {
    if (!node || node.hidden || !node.getBoundingClientRect) return;
    var box = node.getBoundingClientRect();
    var viewHeight = window.innerHeight || document.documentElement.clientHeight;
    if (!block && box.top >= 0 && box.bottom <= viewHeight) return;
    var align = block || (box.height > viewHeight ? "start" : "nearest");
    try { node.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: align }); } catch (err) { node.scrollIntoView(); }
  }

  // The visual viewport excludes an open on-screen keyboard; innerHeight does not.
  function revealAboveKeyboard(node) {
    var viewport = window.visualViewport;
    if (!viewport || node.hidden) return;
    var hiddenBy = node.getBoundingClientRect().bottom + -(viewport.offsetTop + viewport.height);
    if (hiddenBy > 0) window.scrollBy(0, hiddenBy + 16);
  }

  function focusQuietly(node) {
    try { node.focus({ preventScroll: true }); } catch (err) { node.focus(); }
  }

  // UI skeleton

  root.textContent = "";
  root.classList.add("vp-ready");
  if (LINK_FIRST) root.classList.add("vp-link-first");
  var card = element("div", "vp-card");

  var pick = element("div", "vp-pick");
  var dropZone = element("label", "vp-drop");
  var fileInput = element("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*,video/*,.opus,.oga,.m4a,.mkv";
  var touchOnly = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  dropZone.appendChild(fileInput);
  dropZone.appendChild(element("span", "vp-drop-title", touchOnly ? t.dropTouch : t.dropMouse));

  var linkForm = element("form", "vp-link");
  linkForm.noValidate = true;
  var linkInput = element("input");
  linkInput.type = "url";
  linkInput.id = "vp-link-input";
  linkInput.placeholder = t.linkPlaceholder;
  linkInput.autocomplete = "off";
  linkInput.spellcheck = false;
  var linkLabel = element("label", "vp-link-label", LINK_FIRST ? t.linkLabelFirst : t.linkLabel);
  linkLabel.htmlFor = linkInput.id;
  var linkRow = element("div", "vp-link-row");
  var linkButton = element("button", "vp-button", t.linkButton);
  linkButton.type = "submit";
  var linkNote = element("p", "vp-link-note");
  linkNote.id = "vp-link-note";
  linkNote.hidden = true;
  linkInput.setAttribute("aria-describedby", linkNote.id);
  var linkLoginNote = element("p", "vp-login-note", t.loginNote);
  linkLoginNote.hidden = true;
  linkRow.appendChild(linkInput);
  linkRow.appendChild(linkNote);
  linkRow.appendChild(linkButton);
  linkForm.appendChild(linkLabel);
  linkForm.appendChild(linkRow);
  linkForm.appendChild(linkLoginNote);

  var micButton = button("vp-text-button vp-mic", t.micOpen, function () { openRecorder(); });
  var recorderBox = element("div", "vp-recorder");
  recorderBox.hidden = true;
  var recordClock = element("p", "vp-clock");
  var clockNow = element("span", "vp-clock-now", clock(0));
  var clockLimit = element("span", "vp-clock-limit");
  recordClock.appendChild(clockNow);
  recordClock.appendChild(clockLimit);
  recordClock.hidden = true;
  var meter = element("div", "vp-meter");
  meter.setAttribute("aria-hidden", "true");
  meter.appendChild(element("span", "vp-meter-fill"));
  var recordButton = button("vp-record", t.recordStart, function () {
    if (state.recorder) stopRecording(); else startRecording();
  });
  var recordHint = element("p", "vp-hint", t.recordHint);
  var recordCancel = button("vp-text-button", t.recordCancel, function () {
    if (state.recorder) { state.discardRecording = true; stopRecording(); return; }
    // The microphone prompt may still be open: its answer now belongs to a cancelled attempt.
    if (state.starting) {
      state.recordAttempt++;
      state.starting = false;
      recordButton.disabled = false;
      stopLevel();
    }
    closeRecorder();
    setState("idle");
    focusQuietly(micButton);
  });
  recorderBox.appendChild(recordClock);
  recorderBox.appendChild(meter);
  recorderBox.appendChild(recordButton);
  recorderBox.appendChild(recordHint);
  recorderBox.appendChild(recordCancel);
  var pickNotice = element("div", "vp-notice");
  pickNotice.hidden = true;

  if (LINK_FIRST) { pick.appendChild(linkForm); pick.appendChild(dropZone); } else { pick.appendChild(dropZone); pick.appendChild(linkForm); }
  pick.appendChild(micButton);
  pick.appendChild(recorderBox);
  pick.appendChild(pickNotice);

  var job = element("div", "vp-job");
  job.hidden = true;
  var jobHead = element("div", "vp-job-head");
  var jobTitle = element("div", "vp-job-title");
  var jobName = element("p", "vp-job-name");
  jobName.tabIndex = -1;
  var jobMeta = element("p", "vp-job-meta");
  jobTitle.appendChild(jobName);
  jobTitle.appendChild(jobMeta);
  var changeButton = button("vp-text-button vp-change", t.another, function () { changeChoice(); });
  jobHead.appendChild(jobTitle);
  jobHead.appendChild(changeButton);
  var progress = element("div", "vp-progress");
  var progressBar = element("div", "vp-progress-bar");
  progress.appendChild(progressBar);
  progress.setAttribute("aria-hidden", "true");
  progress.hidden = true;
  var phrase = element("p", "vp-phrase");
  phrase.hidden = true;
  var cardNotice = element("div", "vp-notice");
  cardNotice.hidden = true;
  job.appendChild(jobHead);
  job.appendChild(progress);
  job.appendChild(phrase);
  job.appendChild(cardNotice);

  var resultBox = element("div", "vp-result");
  resultBox.hidden = true;

  var foot = element("div", "vp-foot");
  var limitsLine = element("p", "vp-limits", " ");
  var logoutButton = button("vp-text-button vp-logout", t.logout, function () { logout(); });
  logoutButton.hidden = true;
  var footLogin = element("div", "vp-foot-login");
  footLogin.hidden = true;
  foot.appendChild(limitsLine);
  foot.appendChild(logoutButton);
  foot.appendChild(footLogin);

  // One polite live region announces stages, situations, errors and the finished result.
  var statusLine = element("p", "vp-status");
  statusLine.setAttribute("role", "status");
  statusLine.setAttribute("aria-live", "polite");
  statusLine.setAttribute("aria-atomic", "true");

  card.appendChild(pick);
  card.appendChild(job);
  card.appendChild(resultBox);
  card.appendChild(foot);
  card.appendChild(statusLine);
  root.appendChild(card);

  var state = {
    status: null, statusSequence: 0, statusSeen: 0, countAfter: 0, statusWaiters: [],
    choice: null, busy: false, label: "", situationKey: "", situationKind: "", shown: null, login: null, linkProblem: false,
    pickLogin: false, footKey: "", lastReturn: 0,
    recorder: null, stream: null, timer: null, starting: false, recordAttempt: 0, discardRecording: false
  };

  function setState(name) {
    root.setAttribute("data-state", name);
    renderFoot();
  }

  // Emptied first and filled a moment later, so the same message is read again.
  var announceTimer = 0;
  function announce(message) {
    window.clearTimeout(announceTimer);
    statusLine.textContent = "";
    announceTimer = window.setTimeout(function () { statusLine.textContent = message; }, 100);
  }

  // Notices: one sentence and at most one action, used in the picker and in the file card

  function renderNotice(container, situation) {
    container.textContent = "";
    container.className = "vp-notice" + (situation.alert ? " vp-alert" : "");
    if (situation.text) container.appendChild(element("p", "vp-notice-text", situation.text));
    var loginUi = null;
    if (situation.login) {
      var block = loginBlock(situation.login.label, situation.login.then);
      container.appendChild(block.node);
      loginUi = block.ui;
    } else if (situation.buy) {
      container.appendChild(buyBlock());
    } else if (situation.action) {
      container.appendChild(button("vp-button", situation.action.label, situation.action.run));
    } else if (situation.change) {
      container.appendChild(button("vp-button", changeLabel(state.choice), function () { changeChoice(); }));
    }
    container.hidden = false;
    return loginUi;
  }

  function changeLabel(choice) {
    var kind = choice && choice.kind;
    return kind === "link" ? t.anotherLink : kind === "recording" ? t.recordAgain : t.another;
  }

  function showPickNotice(situation) {
    var loginUi = renderNotice(pickNotice, situation);
    state.pickLogin = !!situation.login;
    if (situation.alert) setState("error"); else renderFoot();
    announce(situation.text);
    reveal(pickNotice);
    return loginUi;
  }

  function hidePickNotice() {
    if (pickNotice.hidden) return;
    pickNotice.hidden = true;
    pickNotice.textContent = "";
    state.pickLogin = false;
    if (root.getAttribute("data-state") === "error" && job.hidden) setState("idle"); else renderFoot();
  }

  function buyBlock() {
    var wrap = element("div", "vp-login");
    var link = element("a", "vp-button", t.buy);
    link.href = BUY_LINK;
    link.target = "_blank";
    link.rel = "noopener";
    wrap.appendChild(link);
    wrap.appendChild(element("p", "vp-login-note", t.buyNote));
    return wrap;
  }

  // Telegram login: the site's own button opens Telegram's popup through Telegram.Login.auth

  var loginScript = { state: "", callbacks: [] };

  function telegramReady() {
    return !!(window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === "function");
  }

  function preloadLogin(callback) {
    if (telegramReady()) { loginScript.state = "ready"; if (callback) callback(true); return; }
    if (callback) loginScript.callbacks.push(callback);
    if (loginScript.state === "loading") return;
    if (loginScript.state === "failed" && !callback) return;
    loginScript.state = "loading";
    var script = document.createElement("script");
    script.async = true;
    script.src = LOGIN_SCRIPT;
    var settle = function (ready) {
      loginScript.state = ready ? "ready" : "failed";
      var waiting = loginScript.callbacks;
      loginScript.callbacks = [];
      waiting.forEach(function (waiter) { waiter(ready); });
    };
    script.onload = function () { settle(telegramReady()); };
    script.onerror = function () {
      if (script.parentNode) script.parentNode.removeChild(script);
      settle(false);
    };
    (document.head || document.documentElement).appendChild(script);
  }

  function loginBlock(label, then, secondary) {
    var wrap = element("div", "vp-login");
    var loginButton = element("button", "vp-button" + (secondary ? " vp-secondary" : ""), label);
    loginButton.type = "button";
    var note = element("p", "vp-login-note", t.loginNote);
    var problem = element("p", "vp-login-problem");
    problem.hidden = true;
    var ui = { button: loginButton, label: label, note: note, problem: problem };
    loginButton.addEventListener("click", function () { startLogin(then, ui); });
    wrap.appendChild(loginButton);
    wrap.appendChild(note);
    wrap.appendChild(problem);
    preloadLogin();
    return { node: wrap, ui: ui };
  }

  function startLogin(then, ui) {
    ui.problem.hidden = true;
    if (!telegramReady()) {
      ui.button.disabled = true;
      ui.button.textContent = t.loginLoading;
      preloadLogin(function (ready) {
        ui.button.disabled = false;
        ui.button.textContent = ready ? t.loginOpen : ui.label;
        if (!ready) { showLoginProblem(ui, t.loginBlocked); return; }
        // Browsers block a popup that opens outside a click, so the visitor presses once more.
        focusQuietly(ui.button);
      });
      return;
    }
    var attempt = { then: then, ui: ui, done: false };
    state.login = attempt;
    store("vp_login_started", String(Date.now()));
    // Telegram gives no sign when the popup is blocked, so the page watches window.open for that one call.
    var nativeOpen = window.open, openCalled = false, opened = null;
    try {
      window.open = function () { openCalled = true; opened = nativeOpen.apply(window, arguments); return opened; };
      window.Telegram.Login.auth({ bot_id: BOT_ID, request_access: "write", lang: LANG }, function (user) { finishLogin(user, attempt); });
    } catch (err) {
      endLogin(attempt);
      showLoginProblem(ui, t.loginBlocked);
      return;
    } finally {
      window.open = nativeOpen;
    }
    if (openCalled && !opened) {
      endLogin(attempt);
      showLoginProblem(ui, t.loginPopupBlocked);
      return;
    }
    ui.note.textContent = t.loginWaiting;
    announce(t.loginWaiting);
  }

  function endLogin(attempt) {
    attempt.done = true;
    if (state.login === attempt) state.login = null;
    store("vp_login_started", null);
  }

  // attempt is null for a login that Telegram redirected into this tab instead of a popup.
  function finishLogin(user, attempt) {
    // A second press reuses Telegram's window, and the answer can come through the first call's callback.
    if (attempt && state.login && !state.login.done) attempt = state.login;
    if (attempt) {
      if (attempt.done) return;
      endLogin(attempt);
    }
    var ui = attempt && attempt.ui;
    if (!user) {
      if (ui) ui.note.textContent = t.loginClosed;
      announce(t.loginClosed);
      return;
    }
    var request = new XMLHttpRequest();
    request.open("POST", API + "/api/web/auth/telegram?lang=" + LANG);
    request.setRequestHeader("Content-Type", "application/json");
    request.timeout = REQUEST_TIMEOUT_MS;
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status === 200 && body && body.token) {
        store("vp_session", JSON.stringify({ token: body.token, expires_at: body.expires_at, name: body.user && body.user.name }));
        announce(t.loggedIn);
        syncSession();
        // A redirect login lands in Telegram's window; the tab that asked continues through the storage event.
        if (!attempt) {
          try { window.close(); } catch (err) { /* not a script-opened window */ }
          showPickNotice({ text: t.loggedInElsewhere });
        }
        refreshStatus(function () { if (attempt && attempt.then) attempt.then(); });
        return;
      }
      showLoginProblem(ui, errorText((body && body.error && body.error.code) || "bad_login", {}));
    };
    request.onerror = request.ontimeout = function () { showLoginProblem(ui, t.errors.network()); };
    request.send(JSON.stringify(user));
  }

  function showLoginProblem(ui, message) {
    if (!ui) { showPickNotice({ text: message, alert: true }); return; }
    ui.note.textContent = t.loginNote;
    ui.problem.textContent = message;
    ui.problem.hidden = false;
    announce(message);
    reveal(ui.problem);
  }

  // Telegram sends the login back as #tgAuthResult=<base64 JSON> when its window had no opener to report to.
  function redirectedLogin() {
    var match = /[#&]tgAuthResult=([^&]+)/.exec(window.location.hash || "");
    if (!match) return;
    try { window.history.replaceState(null, "", window.location.pathname + window.location.search); } catch (err) { /* the hash stays */ }
    var startedAt = parseInt(store("vp_login_started"), 10) || 0;
    store("vp_login_started", null);
    if (!(Date.now() + -startedAt < LOGIN_PENDING_MS)) return;
    var user = null;
    try {
      var encoded = decodeURIComponent(match[1]).replace(/-/g, "+").replace(/_/g, "/");
      while (encoded.length % 4) encoded += "=";
      var binary = window.atob(encoded), escaped = "";
      for (var index = 0; index < binary.length; index++) escaped += "%" + ("0" + binary.charCodeAt(index).toString(16)).slice(-2);
      user = JSON.parse(decodeURIComponent(escaped));
    } catch (err) { return; }
    if (user && user.id && user.hash) finishLogin(user, null);
  }

  function logout() {
    store("vp_session", null);
    state.status = null;
    state.footKey = "";
    syncSession();
    renderFoot();
    refreshStatus(function () {
      if (!state.choice || state.busy || job.hidden || cardNotice.hidden) return;
      if (root.getAttribute("data-state") === "ready" || state.situationKind === "minutes") evaluate(state.choice, true);
    });
  }

  // Everything that depends on being signed in, redrawn when the session appears or goes away.
  function syncSession() {
    updateLinkForm();
    if (state.shown && state.shown.signed !== !!sessionToken()) renderFollowUp();
  }

  // Status: trial or account limits, refreshed on load, after jobs and when the tab comes back

  // Callbacks wait for the latest request, so an older answer never decides what happens after a login.
  function refreshStatus(callback) {
    var sequence = ++state.statusSequence;
    if (callback) state.statusWaiters.push(callback);
    var request = new XMLHttpRequest();
    request.open("GET", API + "/api/web/status");
    request.timeout = REQUEST_TIMEOUT_MS;
    var current = headers();
    Object.keys(current).forEach(function (key) { request.setRequestHeader(key, current[key]); });
    var settle = function (ok) {
      if (sequence !== state.statusSequence) return;
      var waiters = state.statusWaiters;
      state.statusWaiters = [];
      waiters.forEach(function (waiter) { waiter(ok); });
    };
    request.onload = function () {
      if (sequence !== state.statusSequence) return;
      var body = parse(request.responseText);
      if (request.status === 401 && current.Authorization) { forgetSession(current.Authorization); return; }
      var ok = request.status === 200 && !!body;
      if (ok) {
        state.status = body;
        state.statusSeen = sequence;
        syncSession();
        renderFoot();
        // The session came from another tab, where Telegram sent the login this tab started.
        if (body.account && state.login && !state.login.done) {
          var attempt = state.login;
          endLogin(attempt);
          announce(t.loggedIn);
          if (attempt.then) state.statusWaiters.push(attempt.then);
        }
      }
      settle(ok);
    };
    request.onerror = request.ontimeout = function () { settle(false); };
    request.send();
  }

  function withStatus(callback) {
    if (state.status) { callback(); return; }
    refreshStatus(function () { callback(); });
  }

  // A token the server no longer accepts is dropped, and the page carries on as an anonymous visitor.
  function forgetSession(rejectedAuthorization, callback) {
    if (!rejectedAuthorization || rejectedAuthorization === "Bearer " + sessionToken()) store("vp_session", null);
    state.status = null;
    state.footKey = "";
    syncSession();
    renderFoot();
    refreshStatus(callback);
  }

  function trialBlocked(trial) {
    if (!trial.enabled) return t.trialOff;
    if (trial.busy) return t.trialBusy;
    if (trial.uses_left <= 0) return t.trialSpent;
    return "";
  }

  function renderFoot() {
    var status = state.status;
    var text = " ", withLogout = false, withLogin = false;
    if (status && status.account) {
      text = t.signedIn(status.account);
      withLogout = true;
    } else if (status && status.trial) {
      var trial = status.trial;
      var blocked = trialBlocked(trial);
      var forLink = state.choice && state.choice.kind === "link";
      // The count changes when a job finishes, so until the status after it arrives no count is shown.
      var countKnown = state.statusSeen >= state.countAfter;
      if (!job.hidden) {
        var afterResult = root.getAttribute("data-state") === "done";
        text = trial.enabled && !forLink && afterResult && countKnown ? t.limitsShort(Math.max(0, trial.uses_left), trial.per_day) : "";
      } else if (blocked) { text = state.pickLogin ? "" : blocked; withLogin = !state.pickLogin; }
      else if (!countKnown) text = "";
      else text = trial.uses_left < trial.per_day ? t.limitsLeft(trial.uses_left, trial.per_day, trial.max_seconds) : t.limitsFresh(trial.per_day, trial.max_seconds);
    }
    var key = text + "|" + withLogout + "|" + withLogin;
    if (key === state.footKey) return;
    state.footKey = key;
    limitsLine.textContent = text;
    logoutButton.hidden = !withLogout;
    footLogin.textContent = "";
    footLogin.hidden = !withLogin;
    if (withLogin) footLogin.appendChild(loginBlock(t.login, null).node);
    foot.hidden = !text && !withLogin;
  }

  // Link field

  function updateLinkForm() {
    var hasLink = looksLikeUrl(normalizeLink(linkInput.value));
    var anonymous = !sessionToken();
    var loginMode = anonymous && hasLink;
    var wasLoginMode = linkButton.getAttribute("data-login") === "true";
    linkButton.textContent = loginMode ? t.loginTranscribe : t.linkButton;
    linkButton.setAttribute("data-login", loginMode ? "true" : "false");
    // Until a link is typed the file picker is the main action, so this button must not look like one.
    linkButton.classList.toggle("vp-secondary", !hasLink && !LINK_FIRST);
    linkLoginNote.hidden = !loginMode;
    if (loginMode) preloadLogin();
    // A validation message stays until the visitor edits the link, whatever refreshes meanwhile.
    if (state.linkProblem) return;
    linkNote.classList.remove("vp-link-error");
    linkInput.removeAttribute("aria-invalid");
    var showNote = anonymous && (hasLink || LINK_FIRST);
    linkNote.textContent = showNote ? t.linkNeedsLogin : "";
    linkNote.hidden = !showNote;
    if (loginMode && !wasLoginMode && touchOnly && document.activeElement === linkInput) revealAboveKeyboard(linkLoginNote);
  }

  function showLinkProblem(message) {
    state.linkProblem = true;
    linkNote.textContent = message;
    linkNote.classList.add("vp-link-error");
    linkNote.hidden = false;
    linkInput.setAttribute("aria-invalid", "true");
    announce(message);
    reveal(linkForm);
    focusQuietly(linkInput);
  }

  linkInput.addEventListener("input", function () {
    state.linkProblem = false;
    updateLinkForm();
  });

  var enterPressed = false;
  linkInput.addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    enterPressed = true;
    window.setTimeout(function () { enterPressed = false; }, 0);
  });

  linkForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var fromKeyboard = enterPressed;
    enterPressed = false;
    if (state.busy || recordingActive()) return;
    var link = normalizeLink(linkInput.value);
    if (!looksLikeUrl(link)) { showLinkProblem(link ? t.linkInvalid : t.linkEmpty); return; }
    if (link !== linkInput.value) linkInput.value = link;
    var loginMode = linkButton.getAttribute("data-login") === "true";
    // On a phone the keyboard covers the note about login, so Go only closes the keyboard and shows it.
    if (loginMode && fromKeyboard && touchOnly) {
      linkInput.blur();
      reveal(linkForm);
      return;
    }
    var choice = { kind: "link", link: link, name: linkName(link), size: 0, seconds: null, measured: true };
    presentChoice(choice);
    var situation = loginMode && !sessionToken() ? situationFor(choice) : null;
    if (!situation || !situation.login) { evaluate(choice); return; }
    // Still inside the click, so Telegram's popup is allowed to open right away.
    var loginUi = showSituation(situation);
    if (loginUi) startLogin(situation.login.then, loginUi);
  });

  // A link pasted anywhere on the page lands in the link field, unless the visitor is typing somewhere else.
  document.addEventListener("paste", function (event) {
    if (state.busy || recordingActive()) return;
    var active = document.activeElement;
    if (isTypingField(active)) return;
    var data = event.clipboardData;
    if (!data) return;
    var file = data.files && data.files[0];
    if (file && /^(audio|video)\//.test(file.type)) {
      event.preventDefault();
      pickFile(file);
      return;
    }
    var text = normalizeLink(data.getData("text/plain") || data.getData("text") || "");
    if (!looksLikeUrl(text)) return;
    event.preventDefault();
    if (!job.hidden) showPicker();
    if (!recorderBox.hidden) closeRecorder();
    linkInput.value = text;
    state.linkProblem = false;
    updateLinkForm();
    reveal(linkForm);
    focusQuietly(linkButton);
  });

  // Files: picker, drag and drop anywhere on the tool

  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) pickFile(fileInput.files[0]);
    fileInput.value = "";
  });

  function draggingFiles(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, "Files") >= 0;
  }

  var dragDepth = 0;
  root.addEventListener("dragenter", function (event) {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    dragDepth++;
    root.classList.add("vp-over");
  });
  root.addEventListener("dragover", function (event) { if (draggingFiles(event)) event.preventDefault(); });
  root.addEventListener("dragleave", function () {
    dragDepth = Math.max(0, dragDepth + -1);
    if (!dragDepth) root.classList.remove("vp-over");
  });
  root.addEventListener("drop", function (event) {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    dragDepth = 0;
    root.classList.remove("vp-over");
    var file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) pickFile(file);
  });

  // A file dropped beside the form would open in the tab and take the page with it.
  document.addEventListener("dragover", function (event) {
    if (!draggingFiles(event)) return;
    event.preventDefault();
    if (!root.contains(event.target)) event.dataTransfer.dropEffect = "none";
  });
  document.addEventListener("drop", function (event) { if (draggingFiles(event)) event.preventDefault(); });

  function pickFile(file) {
    if (state.busy || recordingActive()) return;
    chooseFile(file, file.name || t.recordingName, undefined, file.name);
  }

  // Reads the length without uploading; Infinity, an error or a slow file all mean the length is unknown.
  function measureDuration(file, done) {
    var finished = false, url = "", media = null, timer = 0;
    var finish = function (seconds) {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      if (media) {
        media.removeAttribute("src");
        try { media.load(); } catch (err) { /* already released */ }
      }
      if (url) URL.revokeObjectURL(url);
      done(seconds > 0 && isFinite(seconds) ? seconds : null);
    };
    if (!window.URL || !URL.createObjectURL) { finish(null); return; }
    try {
      media = document.createElement(/^audio\//.test(file.type) ? "audio" : "video");
      media.preload = "metadata";
      media.muted = true;
      media.onloadedmetadata = function () { finish(media.duration); };
      media.onerror = function () { finish(null); };
      url = URL.createObjectURL(file);
      media.src = url;
    } catch (err) {
      finish(null);
      return;
    }
    timer = window.setTimeout(function () { finish(null); }, METADATA_TIMEOUT_MS);
  }

  // The chosen recording: one card from the check before upload to the result

  function chooseFile(file, displayName, knownSeconds, uploadName) {
    var recorded = knownSeconds !== undefined;
    var choice = {
      kind: recorded ? "recording" : "file", file: file, name: displayName, uploadName: uploadName || "recording.webm",
      size: file.size, seconds: recorded ? knownSeconds : null, measured: recorded
    };
    presentChoice(choice);
    var account = state.status && state.status.account;
    var maxMb = account && account.max_upload_mb || SIGNED_IN_UPLOAD_MB;
    // Too big for anyone: the size alone decides, so there is no length to wait for.
    if (choice.measured || file.size / MB > maxMb) { evaluate(choice); return; }
    setPhrase(t.checking);
    measureDuration(file, function (seconds) {
      if (state.choice !== choice) return;
      choice.seconds = seconds;
      choice.measured = true;
      renderChoiceMeta(choice);
      evaluate(choice);
    });
  }

  function presentChoice(choice, keepResult) {
    state.choice = choice;
    state.situationKey = "";
    state.situationKind = "";
    hidePickNotice();
    if (!recorderBox.hidden) closeRecorder();
    if (!keepResult) clearResult();
    cardNotice.hidden = true;
    progress.hidden = true;
    phrase.hidden = true;
    jobName.textContent = choice.name;
    renderChoiceMeta(choice);
    changeButton.textContent = changeLabel(choice);
    changeButton.hidden = false;
    pick.hidden = true;
    job.hidden = false;
    setState("ready");
    focusQuietly(jobName);
    reveal(job);
  }

  function renderChoiceMeta(choice) {
    var parts = [];
    if (choice.kind === "link") parts.push(t.linkKind);
    else {
      parts.push(sizeNumber(choice.size) + " " + t.mb);
      if (choice.seconds) parts.push(duration(choice.seconds));
    }
    jobMeta.textContent = parts.join(" · ");
  }

  function clearResult() {
    resultBox.hidden = true;
    resultBox.textContent = "";
    state.shown = null;
  }

  // A shown transcript stays below the picker until another recording is chosen, so a cancelled file dialog loses nothing.
  function showPicker() {
    state.choice = null;
    state.situationKey = "";
    job.hidden = true;
    cardNotice.hidden = true;
    pick.hidden = false;
    setState("idle");
  }

  function changeChoice() {
    if (state.busy || recordingActive()) return;
    var kind = state.choice && state.choice.kind;
    showPicker();
    if (kind === "link") {
      reveal(linkForm);
      focusQuietly(linkInput);
      linkInput.select();
    } else if (kind === "recording") {
      openRecorder();
    } else {
      reveal(pick);
      fileInput.click();
    }
  }

  function situationFor(choice) {
    var status = state.status || {};
    var account = status.account;
    var then = function () { evaluate(choice); };
    var sizeMb = choice.size / MB;
    if (account) {
      var accountMb = account.max_upload_mb || SIGNED_IN_UPLOAD_MB;
      if (sizeMb > accountMb) return { text: t.overSize(accountMb), change: true };
      if (choice.seconds && account.max_seconds && choice.seconds > account.max_seconds + CAP_TOLERANCE_SECONDS) return { text: t.tooLong(account.max_seconds), change: true };
      if (!account.unlimited) {
        var needed = choice.seconds || choice.neededSeconds || 0;
        var left = available(account);
        if (left < 1 || (needed && Math.ceil(needed) > left)) return minutesSituation(needed, account.free_left_seconds || 0, account.paid_seconds || 0);
      }
      return null;
    }
    if (sizeMb > SIGNED_IN_UPLOAD_MB) return { text: t.overSize(SIGNED_IN_UPLOAD_MB), change: true };
    // Signed in but the status is unknown (offline, rate limited): the server decides rather than a login prompt.
    if (sessionToken()) return null;
    if (choice.kind === "link") return { text: t.linkNeedsLogin, login: { label: t.loginTranscribe, then: then } };
    var trial = status.trial;
    if (!trial) return null;
    var blocked = trialBlocked(trial);
    if (blocked) return { text: blocked, login: { label: t.loginTranscribe, then: then } };
    var trialMb = trial.max_upload_mb || TRIAL_UPLOAD_MB;
    if (sizeMb > trialMb) return { text: t.overTrialSize(sizeNumber(choice.size, trialMb), trialMb, choice.seconds), login: { label: t.loginTranscribe, then: then } };
    if (choice.seconds && choice.seconds > trial.max_seconds + CAP_TOLERANCE_SECONDS) {
      return { text: t.overCap(choice.seconds, trial.max_seconds), action: { label: t.overCapButton(trial.max_seconds), run: function () { startChoice(choice); } } };
    }
    return null;
  }

  function minutesSituation(neededSeconds, freeSeconds, paidSeconds) {
    var neededMin = neededSeconds ? Math.ceil(neededSeconds / 60) : 0;
    var freeMin = Math.floor(freeSeconds / 60), paidMin = Math.floor(paidSeconds / 60);
    var restMin = Math.max(1, neededMin-freeMin-paidMin);
    return { kind: "minutes", text: t.needMinutes(neededMin, freeMin, paidMin, restMin, packFor(restMin)), buy: true };
  }

  function evaluate(choice, returning) {
    withStatus(function () {
      if (state.choice !== choice || state.busy || recordingActive()) return;
      var situation = situationFor(choice);
      if (situation) { showSituation(situation); return; }
      if (returning) {
        showSituation({ text: state.situationKind === "minutes" ? t.enoughNow : t.readyNow, action: { label: t.start, run: function () { startChoice(choice); } } });
        return;
      }
      startChoice(choice);
    });
  }

  function showSituation(situation) {
    var key = situation.text + "|" + (situation.action ? situation.action.label : "");
    if (key === state.situationKey && !cardNotice.hidden) return null;
    state.situationKey = key;
    state.situationKind = situation.kind || "";
    progress.hidden = true;
    phrase.hidden = true;
    changeButton.hidden = !!situation.change;
    var loginUi = renderNotice(cardNotice, situation);
    setState(situation.failed ? "error" : "ready");
    announce(situation.text);
    reveal(job);
    var firstAction = situation.failed && cardNotice.querySelector("button, a");
    if (firstAction) focusQuietly(firstAction);
    return loginUi;
  }

  function errorText(code, params) {
    return (t.errors[code] || t.errors.failed)(params || {});
  }

  // jobId is set when the job reached the server, so a lost connection resumes it instead of uploading again.
  function errorSituation(choice, code, params, jobId) {
    var signed = !!sessionToken();
    var then = function () { evaluate(choice); };
    var situation = { text: errorText(code, params), failed: true, alert: LIMIT_CODES.indexOf(code) < 0 };
    if (code === "insufficient_balance") {
      if (params.needed_seconds) choice.neededSeconds = params.needed_seconds;
      var account = state.status && state.status.account;
      var left = params.left_seconds !== undefined ? params.left_seconds : account ? available(account) : 0;
      var free = Math.min(account ? account.free_left_seconds || 0 : 0, left);
      var minutes = minutesSituation(params.needed_seconds || choice.seconds || 0, free, left + -free);
      minutes.failed = true;
      return minutes;
    }
    if (code === "too_big") {
      if (choice.kind === "link") {
        situation.text = t.linkTooBig;
        situation.change = true;
      } else if (signed) {
        situation.text = t.overSize(params.max_upload_mb || SIGNED_IN_UPLOAD_MB);
        situation.change = true;
      } else {
        var limit = params.max_upload_mb || TRIAL_UPLOAD_MB;
        situation.text = t.overTrialSize(sizeNumber(choice.size, limit), limit, choice.seconds);
        situation.login = { label: t.loginTranscribe, then: then };
      }
      return situation;
    }
    if (code === "network" && jobId) {
      situation.action = { label: t.retry, run: function () { resumeJob(choice, jobId); } };
    } else if (LOGIN_CODES.indexOf(code) >= 0) {
      if (!signed) situation.login = { label: t.loginTranscribe, then: then };
    } else if (CHANGE_CODES.indexOf(code) >= 0) {
      situation.change = true;
    } else if (RETRY_CODES.indexOf(code) >= 0 || !t.errors[code]) {
      situation.action = { label: t.retry, run: function () { startChoice(choice); } };
    }
    return situation;
  }

  // Jobs

  function startChoice(choice) {
    if (state.busy || state.choice !== choice) return;
    if (choice.kind === "link") {
      startJob(choice, function (request) {
        request.setRequestHeader("Content-Type", "application/json");
        request.send(JSON.stringify({ link: choice.link }));
      }, false);
      return;
    }
    startJob(choice, function (request) {
      var form = new FormData();
      form.append("file", choice.file, choice.uploadName);
      request.send(form);
    }, true);
  }

  function showWorking(withUpload) {
    state.busy = true;
    state.label = "";
    state.situationKey = "";
    cardNotice.hidden = true;
    changeButton.hidden = true;
    pick.hidden = true;
    job.hidden = false;
    setState(withUpload ? "uploading" : "working");
    setProgress(withUpload ? "uploading" : "queued", withUpload ? t.uploading(0) : t.queued, withUpload ? 0 : null);
    // The button that started this is hidden now, so focus moves to the card instead of the page.
    focusQuietly(jobName);
    reveal(job);
  }

  function startJob(choice, send, withUpload) {
    clearResult();
    showWorking(withUpload);
    var request = new XMLHttpRequest();
    request.open("POST", API + "/api/web/jobs");
    var current = headers();
    Object.keys(current).forEach(function (key) { request.setRequestHeader(key, current[key]); });
    if (withUpload && request.upload) {
      request.upload.onprogress = function (event) {
        if (event.lengthComputable && event.total) setProgress("uploading", t.uploading(Math.floor(event.loaded / event.total * 100)), event.loaded / event.total);
      };
    }
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status === 202 && body && body.id) {
        setState("working");
        setProgress("queued", t.queued, null);
        refreshStatus();
        poll(choice, body.id);
        return;
      }
      var failure = body && body.error;
      // A proxy in front of the server answers an oversized upload with its own page, not JSON.
      if (!failure && request.status === 413) failure = { code: "too_big" };
      handleFailure(choice, failure, "failed");
    };
    request.onerror = function () { handleFailure(choice, null, "network"); };
    send(request);
  }

  function resumeJob(choice, jobId) {
    if (state.busy || state.choice !== choice) return;
    showWorking(false);
    poll(choice, jobId);
  }

  function refreshCount() {
    state.countAfter = state.statusSequence + 1;
    refreshStatus();
  }

  function poll(choice, jobId, failures) {
    failures = failures || 0;
    var retry = function () {
      if (failures + 1 >= POLL_MAX_FAILURES) { handleFailure(choice, null, "network", jobId); return; }
      window.setTimeout(function () { poll(choice, jobId, failures + 1); }, POLL_MS * 2);
    };
    var request = new XMLHttpRequest();
    request.open("GET", API + "/api/web/jobs/" + encodeURIComponent(jobId));
    request.timeout = REQUEST_TIMEOUT_MS;
    request.onload = function () {
      var body = parse(request.responseText);
      if (request.status === 429 || (request.status >= 502 && request.status <= 504)) { retry(); return; }
      if (request.status !== 200 || !body) { handleFailure(choice, body && body.error, "failed"); return; }
      if (body.stage === "done" && body.result) {
        state.busy = false;
        progress.hidden = true;
        phrase.hidden = true;
        changeButton.hidden = false;
        state.countAfter = state.statusSequence + 1;
        renderResult(choice, jobId, body.result);
        refreshStatus();
        return;
      }
      if (body.stage === "failed") { handleFailure(choice, body.error, "failed"); refreshCount(); return; }
      var stage = t[body.stage] && typeof t[body.stage] === "string" ? body.stage : "queued";
      var label = t[stage], fraction = null;
      if (stage === "recognizing" && body.progress && body.progress.total > 1) {
        label = t.recognizingParts(body.progress.done, body.progress.total);
        fraction = body.progress.done / body.progress.total;
      }
      setProgress(stage, label, fraction);
      window.setTimeout(function () { poll(choice, jobId); }, POLL_MS);
    };
    request.onerror = request.ontimeout = retry;
    request.send();
  }

  function handleFailure(choice, failure, fallback, jobId) {
    state.busy = false;
    progress.hidden = true;
    phrase.hidden = true;
    changeButton.hidden = false;
    var code = (failure && failure.code) || fallback;
    if (code === "session_expired" && !choice.sessionDropped) {
      choice.sessionDropped = true;
      forgetSession(null, function () { evaluate(choice); });
      return;
    }
    showSituation(errorSituation(choice, code, (failure && failure.params) || {}, jobId));
    // The answer may show the balance or the free count changed since the page last asked.
    if (LIMIT_CODES.indexOf(code) >= 0) refreshCount();
  }

  function setPhrase(text) {
    progress.hidden = true;
    phrase.textContent = text;
    phrase.hidden = false;
    announce(text);
  }

  function setProgress(stage, label, fraction) {
    progress.hidden = false;
    phrase.hidden = false;
    phrase.textContent = label;
    if (stage !== state.label) { state.label = stage; announce(label); }
    progress.classList.toggle("vp-indeterminate", fraction === null);
    progressBar.style.width = fraction === null ? "" : Math.round(Math.min(1, Math.max(0.03, fraction)) * 100) + "%";
  }

  // Result

  function renderResult(choice, jobId, result) {
    resultBox.textContent = "";
    var meta = duration(Math.ceil(result.duration_seconds)) + (result.language ? " · " + languageLabel(result.language) : "");
    var title = element("h3", "vp-result-title", t.done);
    title.tabIndex = -1;
    title.appendChild(element("span", "vp-result-meta", " · " + meta));
    resultBox.appendChild(title);

    var actions = element("div", "vp-actions");
    var copyButton = button("vp-button", t.copy);
    actions.appendChild(copyButton);
    var downloads = element("p", "vp-downloads", t.download + " ");
    [["txt", "TXT"], ["docx", "DOCX"], ["srt", t.srt]].forEach(function (entry, index) {
      if (index) downloads.appendChild(document.createTextNode(" · "));
      var link = element("a", "", entry[1]);
      link.href = API + "/api/web/jobs/" + encodeURIComponent(jobId) + "/export?format=" + entry[0] + "&lang=" + LANG;
      link.rel = "nofollow";
      downloads.appendChild(link);
    });
    actions.appendChild(downloads);
    resultBox.appendChild(actions);

    var body = element("div", "vp-text");
    // Focusable so the scrolling transcript can be read with the keyboard in every browser.
    body.tabIndex = 0;
    body.setAttribute("role", "region");
    body.setAttribute("aria-label", t.transcript);
    var paragraphs = result.paragraphs || [];
    if (!paragraphs.length && result.text) paragraphs = [{ start: 0, text: result.text }];
    paragraphs.forEach(function (paragraph) {
      var line = element("p");
      line.appendChild(element("span", "vp-time", clock(paragraph.start)));
      line.appendChild(document.createTextNode(" "));
      if (result.speakers > 1 && paragraph.speaker) {
        var speaker = element("span", "vp-speaker", t.speaker + " " + paragraph.speaker);
        speaker.appendChild(element("span", "vp-sr", ":"));
        line.appendChild(speaker);
        line.appendChild(document.createTextNode(" "));
      }
      line.appendChild(document.createTextNode(paragraph.text));
      body.appendChild(line);
    });
    resultBox.appendChild(body);
    copyButton.addEventListener("click", function () {
      copyText(plainText(result), copyButton).then(function (copied) {
        if (!copied) selectText(body);
        copyButton.textContent = copied ? t.copied : t.copyFailed;
        announce(copyButton.textContent);
        window.setTimeout(function () { copyButton.textContent = t.copy; }, copied ? 2000 : 4000);
      });
    });

    state.shown = { choice: choice, result: result, node: null, signed: false };
    renderFollowUp();
    var truncatedText = result.truncated ? state.shown.node.firstChild.textContent : "";
    resultBox.hidden = false;
    setState("done");
    announce(t.done + ". " + meta + (truncatedText ? ". " + truncatedText : ""));
    reveal(resultBox, "start");
    focusQuietly(title);
  }

  // The offer under the transcript depends on the session, so a login or logout redraws it.
  function renderFollowUp() {
    var shown = state.shown;
    var signed = !!sessionToken();
    var next = shown.result.truncated ? moreBlock(shown.choice, shown.result, signed) : botBlock(shown.choice, shown.result, signed);
    if (shown.node && shown.node.parentNode === resultBox) resultBox.replaceChild(next, shown.node); else resultBox.appendChild(next);
    shown.node = next;
    shown.signed = signed;
  }

  // From under a transcript the same recording goes again, with the card shown for it if the picker replaced it.
  function resubmit(choice) {
    if (state.busy || recordingActive()) return;
    // A login confirmed late must not replace a newer transcript that is on screen now.
    if (!state.shown || state.shown.choice !== choice) return;
    presentChoice(choice, true);
    evaluate(choice);
  }

  function moreBlock(choice, result, signed) {
    var box = element("div", "vp-more");
    box.appendChild(element("p", "", t.truncated(result.trial_max_seconds || TRIAL_SECONDS, choice.seconds, signed)));
    if (signed) box.appendChild(button("vp-button vp-secondary", t.truncatedSigned, function () { resubmit(choice); }));
    else box.appendChild(loginBlock(t.truncatedLogin, function () { resubmit(choice); }, true).node);
    return box;
  }

  function botBlock(choice, result, signed) {
    var box = element("div", "vp-bot");
    var link;
    if (result.saved && /^https:\/\/t\.me\/[A-Za-z0-9_]+(\?start=[A-Za-z0-9_]+)?$/.test(String(result.bot_link || ""))) {
      link = element("a", "vp-bot-link", t.botSaved);
      link.href = result.bot_link;
    } else if (signed) {
      box.appendChild(element("p", "", t.botPlain));
      link = element("a", "vp-bot-link", t.botOpen);
      link.href = "https://t.me/" + BOT + "?start=src_" + visitSource();
    } else {
      box.appendChild(element("p", "", t.botText));
      var seconds = result.duration_seconds || choice.seconds;
      if (seconds) box.appendChild(element("p", "vp-bot-cost", t.botCost(seconds)));
      box.appendChild(loginBlock(t.botLogin, function () { resubmit(choice); }, true).node);
      return box;
    }
    link.target = "_blank";
    link.rel = "noopener";
    box.appendChild(link);
    return box;
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
    var paragraphs = result.paragraphs || [];
    if (!paragraphs.length) return result.text || "";
    return paragraphs.map(function (paragraph) {
      var prefix = result.speakers > 1 && paragraph.speaker ? t.speaker + " " + paragraph.speaker + ": " : "";
      return prefix + paragraph.text;
    }).join("\n\n");
  }

  // Microphone

  var recordingSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  function recordingActive() {
    return !!(state.recorder || state.starting);
  }

  function recordLimitSeconds() {
    var status = state.status;
    if (status && status.account) {
      if (status.account.unlimited) return SIGNED_IN_RECORD_SECONDS;
      return Math.max(0, Math.min(SIGNED_IN_RECORD_SECONDS, Math.floor(available(status.account))));
    }
    if (status && status.trial) return status.trial.enabled ? status.trial.max_seconds : 0;
    return sessionToken() ? SIGNED_IN_RECORD_SECONDS : TRIAL_SECONDS;
  }

  function recorderBlocker() {
    var status = state.status;
    if (!status) return null;
    if (status.account) {
      if (!status.account.unlimited && available(status.account) < 1) return minutesSituation(0, 0, 0);
      return null;
    }
    var blocked = status.trial && trialBlocked(status.trial);
    return blocked ? { text: blocked, login: { label: t.login, then: function () { if (!state.choice && !state.busy) openRecorder(); } } } : null;
  }

  function openRecorder() {
    hidePickNotice();
    if (!recordingSupported) { showPickNotice({ text: t.recordUnsupported, alert: true }); return; }
    var blocker = recorderBlocker();
    if (blocker) { showPickNotice(blocker); return; }
    dropZone.hidden = true;
    linkForm.hidden = true;
    micButton.hidden = true;
    recorderBox.hidden = false;
    recordClock.hidden = true;
    recordHint.textContent = t.recordHint;
    recordHint.classList.remove("vp-hint-error");
    focusQuietly(recordButton);
    reveal(recorderBox);
  }

  function closeRecorder() {
    recorderBox.hidden = true;
    dropZone.hidden = false;
    linkForm.hidden = false;
    micButton.hidden = false;
  }

  // MP4 and Ogg first: they state their length, so the server can check limits before decoding; WebM is measured by decoding.
  function recordingType() {
    var candidates = ["audio/mp4", "audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"];
    for (var index = 0; index < candidates.length; index++) {
      if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(candidates[index])) return candidates[index];
    }
    return "";
  }

  function showClock(elapsed, limit) {
    clockNow.textContent = clock(elapsed);
    clockLimit.textContent = limit ? " / " + clock(limit) : "";
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

  function recordingProblem(message) {
    recordButton.disabled = false;
    recordHint.textContent = message;
    recordHint.classList.add("vp-hint-error");
    setState("error");
    announce(message);
    reveal(recorderBox);
  }

  function startRecording() {
    if (state.busy || recordingActive()) return;
    var limit = recordLimitSeconds();
    if (!limit) { closeRecorder(); openRecorder(); return; }
    recordHint.classList.remove("vp-hint-error");
    prepareLevel();
    var attempt = ++state.recordAttempt;
    state.starting = true;
    recordButton.disabled = true;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      if (attempt !== state.recordAttempt) { releaseStream(stream); return; }
      state.starting = false;
      recordButton.disabled = false;
      var type = recordingType();
      var mediaRecorder;
      try {
        mediaRecorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      } catch (err) {
        releaseStream(stream);
        stopLevel();
        recordingProblem(t.recordFailed);
        return;
      }
      var chunks = [];
      var startedAt = Date.now();
      mediaRecorder.ondataavailable = function (event) { if (event.data && event.data.size) chunks.push(event.data); };
      mediaRecorder.onstop = function () {
        stopLevel();
        releaseStream(stream);
        window.clearInterval(state.timer);
        state.recorder = null;
        state.stream = null;
        recordButton.textContent = t.recordStart;
        recordButton.classList.remove("vp-recording");
        recordHint.textContent = t.recordHint;
        recordClock.hidden = true;
        var discard = state.discardRecording;
        state.discardRecording = false;
        var seconds = Math.min((Date.now()-startedAt) / 1000, limit);
        closeRecorder();
        var blobType = mediaRecorder.mimeType || type || "audio/webm";
        var blob = new Blob(chunks, { type: blobType });
        var extension = blobType.indexOf("mp4") >= 0 ? "m4a" : blobType.indexOf("ogg") >= 0 ? "ogg" : "webm";
        if (discard || !blob.size) { setState("idle"); focusQuietly(micButton); return; }
        chooseFile(blob, t.recordingName, seconds, "recording." + extension);
      };
      try {
        mediaRecorder.start(1000);
      } catch (err) {
        releaseStream(stream);
        stopLevel();
        recordingProblem(t.recordFailed);
        return;
      }
      state.recorder = mediaRecorder;
      state.stream = stream;
      recordButton.textContent = t.recordStop;
      recordButton.classList.add("vp-recording");
      recordHint.textContent = t.recordHintActive;
      showClock(0, limit);
      recordClock.hidden = false;
      setState("recording");
      announce(t.recording);
      watchLevel(stream);
      state.timer = window.setInterval(function () {
        var elapsed = (Date.now()-startedAt) / 1000;
        showClock(Math.min(elapsed, limit), limit);
        if (elapsed >= limit) stopRecording();
      }, 250);
    }, function (err) {
      if (attempt !== state.recordAttempt) return;
      state.starting = false;
      stopLevel();
      var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError");
      recordingProblem(denied ? t.micDenied : t.micUnavailable);
    });
  }

  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  }

  // Coming back from the bot (after /buy) or another tab: fresh limits, and the chosen file stays chosen.
  function onReturn() {
    if (document.visibilityState === "hidden") return;
    var now = Date.now();
    if (now-state.lastReturn < 1500) return;
    state.lastReturn = now;
    if (state.busy || recordingActive()) return;
    refreshStatus(function (ok) {
      if (!ok || !state.choice || state.busy || !state.choice.measured || cardNotice.hidden) return;
      var phase = root.getAttribute("data-state");
      if (phase === "ready" || state.situationKind === "minutes") evaluate(state.choice, true);
    });
  }

  document.addEventListener("visibilitychange", onReturn);
  window.addEventListener("focus", onReturn);
  // A login or logout in another tab of the site.
  window.addEventListener("storage", function (event) {
    if (event.key === "vp_session" && !state.busy) refreshStatus();
  });

  // Older versions remembered the last tab here; the form no longer has tabs.
  store("vp_tab", null);
  setState("idle");
  updateLinkForm();
  redirectedLogin();
  refreshStatus();
})();
