/* ============================================================================
 * 用户内容系统 V1 · 统一内容存储层（Content Store）
 * ----------------------------------------------------------------------------
 * 目标：
 *   1) 页面组件只调用本接口，不在按钮事件里直接读写 localStorage；
 *   2) 以后可以整体替换为 IndexedDB / 账号数据库 / 云端同步，页面不用重写；
 *   3) localStorage 不可用、容量不足、数据损坏、旧版本数据都能安全降级，
 *      绝不因为内容系统本身导致页面打不开；
 *   4) 数据结构为「账号 / 跨设备同步 / 春节批量个性祝福」预留字段。
 *
 * 存储键名（全部带 schemaVersion）：
 *   lugu_content_v1    用户内容系统根节点（工作草稿 / 草稿 / 收藏 / 最近使用 / 偏好）
 *   lugu_recent_undo_v1 最近一次「清空」的可撤销内容（让刷新前也能撤销）
 *   lugu_master_v1     祝福母版（未来批量个性化，V1 只预留）
 *   lugu_recipient_v1  接收人记录（未来批量个性化，V1 只预留）
 *
 * 隐私：本层只在本设备写入；不联网、不采集通讯录、不向第三方上传。
 *       错误日志只记录 id / schemaVersion / 错误类型，不记录正文。
 * ============================================================================ */
(function (global) {
  "use strict";

  var SCHEMA_VERSION = 3;
  var ROOT_KEY = "lugu_content_v1";
  var UNDO_KEY = "lugu_recent_undo_v1";
  var MASTER_KEY = "lugu_master_v1";
  var RECIPIENT_KEY = "lugu_recipient_v1";

  var DRAFT_MAX = 20;
  var RECENT_MAX = 20;
  var RETENTION_DAYS = 30;
  var RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var RECENT_DEDUPE_MS = 10 * 60 * 1000;   // 短时间内重复生成同一条内容：只更新最后使用时间
  var TEXT_LIMIT = 4000;                   // 单条正文上限（防御异常数据）
  var BATCH_BLESSING_ENABLED = false;      // 春节批量个性祝福：本轮关闭，只预留结构

  var STATE_UNTOUCHED = "untouched";
  var STATE_SELECTED = "selectedSuggestion";
  var STATE_EDITED = "userEdited";

  /* 原文 / 方言口语稿 —— 同一段内容的两个版本（V2 起统一编辑框使用） */
  var VIEW_ORIGINAL = "original";
  var VIEW_DIALECT = "dialect";
  var DIALECT_STATUS = {
    unconverted: "unconverted",             // 还没有方言稿（默认：朗读原文）
    converted: "converted",                 // 已转换成方言口语
    userEdited: "userEdited",               // 转换后用户又手改过
    needReconvert: "needReconvert"          // 原文改过，方言稿已过期
  };

  /* ---------------------------------------------------------------- 安全读写 */
  function probeStorage() {
    try {
      if (!global.localStorage) return null;
      var k = "__lugu_store_probe__";
      global.localStorage.setItem(k, "1");
      global.localStorage.removeItem(k);
      return global.localStorage;
    } catch (e) {
      return null;
    }
  }

  var storage = probeStorage();
  var available = !!storage;
  var lastError = available ? null : "storage-unavailable";
  var memory = {};              // localStorage 不可用时的内存兜底（当前会话仍可用）
  var warnedQuota = false;

  function nowMs() { return Date.now(); }

  function uid(prefix) {
    var rand = Math.random().toString(36).slice(2, 10);
    return (prefix || "rec") + "_" + nowMs().toString(36) + "_" + rand;
  }

  function readRaw(key) {
    if (storage) {
      try { return storage.getItem(key); }
      catch (e) { lastError = "read-failed"; return null; }
    }
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  }

  // 返回 true=写入成功；false=写入失败（容量不足等）
  function writeRaw(key, value) {
    if (storage) {
      try { storage.setItem(key, value); return true; }
      catch (e) {
        var quota = e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014);
        lastError = quota ? "quota-exceeded" : "write-failed";
        return false;
      }
    }
    memory[key] = value;
    return true;
  }

  function readJson(key, fallback) {
    var raw = readRaw(key);
    if (!raw) return fallback;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") { lastError = "data-corrupt"; return fallback; }
      return parsed;
    } catch (e) {
      lastError = "data-corrupt";
      quarantine(key, raw);
      return fallback;
    }
  }

  // 损坏数据隔离：移到备份键，绝不直接清空用户全部内容
  function quarantine(key, raw) {
    try {
      if (!storage) return;
      var backup = key + ".corrupt." + nowMs().toString(36);
      storage.setItem(backup, String(raw).slice(0, 200000));
      storage.removeItem(key);
    } catch (e) { /* 隔离失败也不能影响页面 */ }
  }

  function safeLog(scope, info) {
    try {
      if (!global.console || !console.warn) return;
      console.warn("[content-store] " + scope, {
        id: info && info.id ? String(info.id).slice(0, 64) : undefined,
        schemaVersion: info && info.schemaVersion,
        errorType: info && info.errorType
      });
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ 数据规范化 */
  function str(v, max) {
    if (v === null || v === undefined) return "";
    var s = String(v);
    if (max && s.length > max) s = s.slice(0, max);
    return s;
  }

  function num(v, fallback) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) ? n : (fallback || 0);
  }

  function bool(v) { return v === true; }

  var CONTENT_TYPES = { emotion: "emotion", blessing: "blessing", greeting: "greeting" };
  var TEXT_STATES = { untouched: "untouched", selectedSuggestion: "selectedSuggestion", userEdited: "userEdited" };
  var SOURCES = { newContent: "new", suggestion: "suggestion", restoredDraft: "restoredDraft", recent: "recent", favorite: "favorite" };

  function normContentType(v) {
    return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, v) ? v : "emotion";
  }
  function normTextState(v) {
    return Object.prototype.hasOwnProperty.call(TEXT_STATES, v) ? v : "untouched";
  }
  function normTextView(v) {
    return v === VIEW_DIALECT ? VIEW_DIALECT : VIEW_ORIGINAL;
  }
  function normDialectStatus(v) {
    return Object.prototype.hasOwnProperty.call(DIALECT_STATUS, v) ? v : DIALECT_STATUS.unconverted;
  }
  /* 表达模式：accent=原文配方言（字幕/朗读都用原文，只改口音）；local=地方口语（字幕/朗读都用地方口语稿） */
  var EXPRESSION_MODES = { accent: "accent", local: "local" };
  function normExpressionMode(v) {
    return Object.prototype.hasOwnProperty.call(EXPRESSION_MODES, v) ? v : "accent";
  }
  function normSource(v) {
    var allowed = ["new", "suggestion", "restoredDraft", "recent", "favorite"];
    return allowed.indexOf(v) >= 0 ? v : "new";
  }

  function normFavoriteMode(v) {
    return v === "fullExpression" ? "fullExpression" : "textOnly";
  }

  // 接收人记录（未来批量个性化）——本轮不出现在任何前台界面
  function normRecipient(r) {
    if (!r || typeof r !== "object") return null;
    return {
      id: str(r.id) || uid("rcpt"),
      name: str(r.name, 60),
      salutation: str(r.salutation, 60),
      note: str(r.note, 300),
      personalizedText: str(r.personalizedText, TEXT_LIMIT),
      generated: bool(r.generated),
      shared: bool(r.shared),
      generateResultId: str(r.generateResultId, 120),
      shareUrl: str(r.shareUrl, 600),
      error: str(r.error, 200),
      createdAt: num(r.createdAt, nowMs()),
      updatedAt: num(r.updatedAt, nowMs())
    };
  }

  // 祝福母版（未来批量个性化）——本轮不出现在任何前台界面
  function normMaster(m) {
    if (!m || typeof m !== "object") return null;
    return {
      id: str(m.id) || uid("mst"),
      name: str(m.name, 80),
      body: str(m.body, TEXT_LIMIT),
      variables: Array.isArray(m.variables) ? m.variables.map(function (v) { return str(v, 30); }).slice(0, 20) : ["称呼"],
      contentType: normContentType(m.contentType),
      emotionId: str(m.emotionId, 40),
      sceneId: str(m.sceneId, 60),
      actionId: str(m.actionId, 60),
      characterId: str(m.characterId, 60),
      voiceId: str(m.voiceId, 80),
      musicId: str(m.musicId, 80),
      recipients: Array.isArray(m.recipients) ? m.recipients.map(normRecipient).filter(Boolean).slice(0, 500) : [],
      createdAt: num(m.createdAt, nowMs()),
      updatedAt: num(m.updatedAt, nowMs())
    };
  }

  /* ------------------------------------------------------------ 记录结构 */
  /* 草稿 / 收藏 / 最近使用的公共结构（V1 起就是同一套，便于以后同步与批量）：
   *   id, schemaVersion, contentType, text, textState,
   *   emotionId, sceneId, actionId, characterId, voiceId, musicId,
   *   createdAt, updatedAt, lastUsedAt, generated, generateResultId, resultStale,
   *   favorite, favoriteMode, source, userId
   */
  function normEntry(e) {
    if (!e || typeof e !== "object") return null;
    var created = num(e.createdAt, nowMs());
    // V2：text 始终等于 originalText（对外保持向后兼容），方言口语稿单独占 dialectText
    var originalText = str(e.originalText !== undefined && e.originalText !== null ? e.originalText : e.text, TEXT_LIMIT);
    var dialectText = str(e.dialectText, TEXT_LIMIT);
    return {
      id: str(e.id) || uid("rec"),
      schemaVersion: SCHEMA_VERSION,
      contentType: normContentType(e.contentType),
      text: originalText,
      originalText: originalText,
      dialectText: dialectText,
      textState: normTextState(e.textState),
      dialectStatus: normDialectStatus(e.dialectStatus),
      dialectDirty: bool(e.dialectDirty),
      activeTextView: normTextView(e.activeTextView),
      expressionMode: normExpressionMode(e.expressionMode),
      dialectTextState: normTextState(e.dialectTextState),
      originalRev: Math.max(0, Math.round(num(e.originalRev, 0))),
      dialectRev: Math.max(0, Math.round(num(e.dialectRev, 0))),
      dialectConvertedFromRev: Math.max(0, Math.round(num(e.dialectConvertedFromRev, 0))),
      dialectUpdatedAt: num(e.dialectUpdatedAt, 0),
      emotionId: str(e.emotionId, 40),
      sceneId: str(e.sceneId, 60),
      actionId: str(e.actionId, 60),
      characterId: str(e.characterId, 60),
      voiceId: str(e.voiceId, 80),
      musicId: str(e.musicId, 80),
      voiceScope: str(e.voiceScope, 20),
      dialectId: str(e.dialectId, 40),
      createdAt: created,
      updatedAt: num(e.updatedAt, created),
      lastUsedAt: num(e.lastUsedAt, 0),
      generated: bool(e.generated),
      generateResultId: str(e.generateResultId, 120),
      resultStale: bool(e.resultStale),
      favorite: bool(e.favorite),
      favoriteMode: normFavoriteMode(e.favoriteMode),
      source: normSource(e.source),
      userId: str(e.userId, 80),          // 兼容未来账号 / 跨设备同步，V1 为空
      contentVersion: Math.max(0, Math.round(num(e.contentVersion, 0))),
      savedContentVersion: Math.max(0, Math.round(num(e.savedContentVersion, 0)))
    };
  }

  function normList(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var n = normEntry(list[i]);
      if (n) out.push(n);
    }
    return out;
  }

  function defaultRoot() {
    return {
      schemaVersion: SCHEMA_VERSION,
      userId: "",
      updatedAt: nowMs(),
      workingDraftId: "",
      workingDraft: null,
      drafts: [],
      favorites: [],
      recent: [],
      prefs: {
        characterId: "",
        voiceScope: "standard",
        dialectId: "sichuan",
        voiceId: "",
        musicId: ""
      },
      migrations: []
    };
  }

  function normRoot(raw) {
    var base = defaultRoot();
    if (!raw || typeof raw !== "object") return base;
    base.schemaVersion = Math.max(0, Math.round(num(raw.schemaVersion, 0)));
    base.userId = str(raw.userId, 80);
    base.updatedAt = num(raw.updatedAt, nowMs());
    base.drafts = normList(raw.drafts);
    base.favorites = normList(raw.favorites);
    base.recent = normList(raw.recent);
    var w = normEntry(raw.workingDraft);
    base.workingDraft = w;
    base.workingDraftId = w ? w.id : "";
    if (raw.prefs && typeof raw.prefs === "object") {
      base.prefs = {
        characterId: str(raw.prefs.characterId, 60),
        voiceScope: str(raw.prefs.voiceScope, 20) || "standard",
        dialectId: str(raw.prefs.dialectId, 40) || "sichuan",
        voiceId: str(raw.prefs.voiceId, 80),
        musicId: str(raw.prefs.musicId, 80)
      };
    }
    base.migrations = Array.isArray(raw.migrations) ? raw.migrations.slice(0, 20) : [];
    return base;
  }

  /* -------------------------------------------------------------- 迁移逻辑 */
  var MIGRATIONS = {
    // 0 → 1：把「V1 之前」可能存在的裸数据（例如只有正文的数组）升级为正式结构。
    // 旧格式示例：["写好的句子A", "写好的句子B"] 或 { text:"..." }
    0: function (raw) {
      var out = defaultRoot();
      var list = [];
      if (Array.isArray(raw)) list = raw;
      else if (raw && Array.isArray(raw.items)) list = raw.items;
      else if (raw && typeof raw.text === "string") list = [{ text: raw.text }];
      for (var i = 0; i < list.length; i++) {
        var item = typeof list[i] === "string" ? { text: list[i] } : list[i];
        var entry = normEntry(item);
        if (!entry || !entry.text) continue;
        entry.textState = STATE_EDITED;
        entry.source = "restoredDraft";
        out.drafts.push(entry);
      }
      out.schemaVersion = 1;
      out.migrations.push({ from: 0, to: 1, at: nowMs(), count: out.drafts.length });
      return out;
    }
    ,
    // 1 → 2：V1 只有一份 text（等于原文）。升级后：
    //   原文 → originalText，方言稿为空、状态 unconverted、当前视图 original。
    // 绝不把老记录误判成「已转换过方言」，也绝不清空老草稿 / 老收藏。
    1: function (raw) {
      var out = normRoot(raw);
      out.schemaVersion = 2;
      var lists = [out.drafts, out.favorites, out.recent];
      for (var i = 0; i < lists.length; i++) {
        for (var j = 0; j < lists[i].length; j++) {
          var e = lists[i][j];
          e.originalText = e.originalText || e.text || "";
          e.text = e.originalText;
          e.dialectText = "";                       // 老记录没有方言稿
          e.dialectStatus = DIALECT_STATUS.unconverted;
          e.dialectDirty = false;
          e.activeTextView = VIEW_ORIGINAL;
          e.schemaVersion = 2;
        }
      }
      if (out.workingDraft) {
        out.workingDraft.originalText = out.workingDraft.originalText || out.workingDraft.text || "";
        out.workingDraft.text = out.workingDraft.originalText;
        out.workingDraft.dialectText = "";
        out.workingDraft.dialectStatus = DIALECT_STATUS.unconverted;
        out.workingDraft.dialectDirty = false;
        out.workingDraft.activeTextView = VIEW_ORIGINAL;
        out.workingDraft.schemaVersion = 2;
      }
      out.migrations.push({ from: 1, to: 2, at: nowMs(), drafts: out.drafts.length, favorites: out.favorites.length });
      return out;
    }
    ,
    // 2 → 3：新增「表达模式」字段（accent=原文配方言 / local=地方口语）。
    // 老记录的默认值按最保守的 accent 处理：字幕与朗读都用原文，只改口音。
    2: function (raw) {
      var out = normRoot(raw);
      out.schemaVersion = 3;
      var lists = [out.drafts, out.favorites, out.recent];
      for (var i = 0; i < lists.length; i++) {
        for (var j = 0; j < lists[i].length; j++) {
          lists[i][j].expressionMode = normExpressionMode(lists[i][j].expressionMode);
          lists[i][j].schemaVersion = 3;
        }
      }
      if (out.workingDraft) {
        out.workingDraft.expressionMode = normExpressionMode(out.workingDraft.expressionMode);
        out.workingDraft.schemaVersion = 3;
      }
      out.migrations.push({ from: 2, to: 3, at: nowMs(), drafts: out.drafts.length, favorites: out.favorites.length });
      return out;
    }
  };

  function migrate(raw) {
    var data = raw;
    var guard = 0;
    var version = raw && typeof raw === "object" ? Math.round(num(raw.schemaVersion, 0)) : 0;
    if (!raw) return defaultRoot();
    while (version < SCHEMA_VERSION && guard++ < 10) {
      var fn = MIGRATIONS[version];
      if (!fn) { version = SCHEMA_VERSION; break; }
      try {
        data = fn(data);
        version = Math.round(num(data.schemaVersion, SCHEMA_VERSION));
      } catch (e) {
        safeLog("migrate", { schemaVersion: version, errorType: (e && e.name) || "migration-failed" });
        return defaultRoot();
      }
    }
    return normRoot(data);
  }

  function loadRoot() {
    var raw = readJson(ROOT_KEY, null);
    var migrated = migrate(raw);
    // 只在确有必要时回写（首次创建 / 完成迁移），避免每次读取都写盘
    if (!raw || num(raw.schemaVersion, -1) !== migrated.schemaVersion) saveRoot(migrated);
    return migrated;
  }

  function saveRoot(root) {
    root = normRoot(root);
    root.schemaVersion = SCHEMA_VERSION;
    root.updatedAt = nowMs();
    var d = root;
    var payload = JSON.stringify(root);
    var ok = writeRaw(ROOT_KEY, payload);
    if (!ok) {
      // 容量不足：严格按「收藏 > 当前工作草稿 > 最近未收藏草稿 > 最近使用」的优先级收缩。
      // 收藏与当前工作草稿永不主动丢弃；实在写不进才如实报告失败（绝不谎报成功）。
      var trimmed = false;
      var guard = 0;
      while (!ok && (d.recent.length || d.drafts.length) && guard++ < 400) {
        if (d.recent.length) { d.recent.pop(); trimmed = true; }
        else { d.drafts.pop(); trimmed = true; }   // drafts 已按 updatedAt 倒序（最早的在末尾）
        ok = writeRaw(ROOT_KEY, JSON.stringify(d));
      }
      if (ok && trimmed && !warnedQuota) {
        warnedQuota = true;
        emit("quota-trimmed", { trimmed: true });
      }
      if (!ok) {
        safeLog("save", { errorType: lastError || "write-failed" });
        emit("storage-error", { errorType: lastError || "write-failed" });
      }
    }
    return ok;
  }

  /* -------------------------------------------------------- 轻量事件（提示） */
  var listeners = [];
  function on(fn) { if (typeof fn === "function") listeners.push(fn); }
  function emit(type, detail) {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](type, detail || {}); } catch (e) { /* ignore */ }
    }
  }

  /* -------------------------------------------------------------- 清理规则 */
  function textKeyOf(entry) {
    return [entry.contentType, entry.text.replace(/\s+/g, " ").trim(),
            entry.emotionId, entry.sceneId, entry.actionId, entry.characterId,
            entry.voiceId, entry.dialectId, entry.musicId].join("\u0001");
  }

  // 与数据集合比较用（区别于公开的 isFavoriteText(text)：这里传入的是记录集合）
  function hasFavoriteText(data, entry) {
    var t = String(entry.text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    for (var i = 0; i < data.favorites.length; i++) {
      if (data.favorites[i].text.replace(/\s+/g, " ").trim() === t) return true;
    }
    return false;
  }

  // 清理过期记录：草稿/最近使用 30 天；收藏永久保留（不被 30 天清理误删）
  function cleanup(data, at) {
    var t = at || nowMs();
    var removed = { drafts: 0, recent: 0 };

    // 分两桶：受保护（已收藏 / 就是当前工作草稿）永不因上限或过期被丢；
    // 其余按「继续使用时间 → 最近编辑时间」排序，从最旧的开始清理。
    var protectedDrafts = [];
    var normalDrafts = [];
    for (var i = 0; i < data.drafts.length; i++) {
      var d = data.drafts[i];
      var isWorking = !!(data.workingDraft && data.workingDraft.id === d.id);
      var isProtected = d.favorite || isWorking || hasFavoriteText(data, d);
      var expired = (t - d.updatedAt) > RETENTION_MS;
      if (expired && !isProtected) { removed.drafts++; continue; }
      var rank = d.lastUsedAt || d.updatedAt || 0;
      if (isProtected) protectedDrafts.push({ e: d, rank: rank });
      else normalDrafts.push({ e: d, rank: rank });
    }
    normalDrafts.sort(function (a, b) { return b.rank - a.rank; });   // 新的在前
    var room = Math.max(0, DRAFT_MAX - protectedDrafts.length);
    if (normalDrafts.length > room) {
      removed.drafts += normalDrafts.length - room;
      normalDrafts = normalDrafts.slice(0, room);
    }
    var kept = protectedDrafts.concat(normalDrafts).sort(function (a, b) { return b.rank - a.rank; });
    data.drafts = kept.map(function (x) { return x.e; });

    var recent = [];
    for (var m = 0; m < data.recent.length; m++) {
      var r = data.recent[m];
      if ((t - (r.lastUsedAt || r.updatedAt)) > RETENTION_MS) { removed.recent++; continue; }
      recent.push(r);
    }
    recent.sort(function (a, b) { return (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt); });
    if (recent.length > RECENT_MAX) { removed.recent += recent.length - RECENT_MAX; recent = recent.slice(0, RECENT_MAX); }
    data.recent = recent;

    return removed;
  }

  /* ------------------------------------------------------------ 缓存与持久 */
  var cache = null;
  function data() {
    if (!cache) cache = loadRoot();
    return cache;
  }
  function commit() {
    cleanup(cache);
    saveRoot(cache);
  }

  /* ================================ 公开接口 ================================ */

  // —— 当前工作草稿 ——
  function saveWorkingDraft(entry) {
    var d = data();
    var e = normEntry(entry);
    if (!e) return null;
    if (!e.text && e.textState === STATE_UNTOUCHED) {
      // 完全不碰：不建立空草稿
    }
    if (d.workingDraft && d.workingDraft.id === e.id) {
      e.createdAt = d.workingDraft.createdAt;
      e.source = d.workingDraft.source;
    }
    if (!e.createdAt) e.createdAt = nowMs();
    e.updatedAt = nowMs();
    d.workingDraft = e;
    d.workingDraftId = e.id;
    commit();
    return e;
  }

  function getWorkingDraft() {
    var w = data().workingDraft;
    return w ? normEntry(w) : null;
  }

  function clearWorkingDraft() {
    var d = data();
    d.workingDraft = null;
    d.workingDraftId = "";
    commit();
  }

  // 把当前工作草稿「定稿」为一条最近草稿；同一 id 只更新同一条，不新增记录
  function commitWorkingDraftToList() {
    var d = data();
    var w = d.workingDraft;
    if (!w || !w.text) return null;
    var list = d.drafts;
    var found = -1;
    for (var i = 0; i < list.length; i++) { if (list[i].id === w.id) { found = i; break; } }
    var record = normEntry(w);
    record.updatedAt = nowMs();
    record.source = record.source || SOURCES.newContent;
    if (found >= 0) list[found] = record; else list.unshift(record);
    d.drafts = list;
    commit();
    return record;
  }

  // 「再做一条」：建立新草稿，可复制正文与偏好
  function startNewDraft(options) {
    var o = options || {};
    var d = data();
    var e = normEntry({
      contentType: o.contentType || "emotion",
      text: o.keepText ? str(o.originalText !== undefined ? o.originalText : o.text, TEXT_LIMIT) : "",
      originalText: o.keepText ? str(o.originalText !== undefined ? o.originalText : o.text, TEXT_LIMIT) : "",
      dialectText: o.keepText ? str(o.dialectText, TEXT_LIMIT) : "",
      textState: o.keepText && o.text ? STATE_EDITED : STATE_UNTOUCHED,
      dialectStatus: o.dialectStatus, dialectDirty: bool(o.dialectDirty),
      activeTextView: o.activeTextView,
      originalRev: o.originalRev, dialectRev: o.dialectRev,
      dialectConvertedFromRev: o.dialectConvertedFromRev,
      emotionId: o.emotionId, sceneId: o.sceneId, actionId: o.actionId,
      characterId: o.characterId, voiceId: o.voiceId, musicId: o.musicId,
      voiceScope: o.voiceScope, dialectId: o.dialectId,
      source: SOURCES.newContent
    });
    e.createdAt = nowMs();
    e.updatedAt = e.createdAt;
    d.workingDraft = e;
    d.workingDraftId = e.id;
    commit();
    return e;
  }

  function listDrafts(filter) {
    var d = data();
    var list = d.drafts.slice();
    if (d.workingDraft && d.workingDraft.text) {
      var dup = false;
      for (var i = 0; i < list.length; i++) { if (list[i].id === d.workingDraft.id) { dup = true; break; } }
      if (!dup) list.unshift(d.workingDraft);
    }
    list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return applyFilter(list, filter);
  }

  function getDraft(id) {
    var d = data();
    if (d.workingDraft && d.workingDraft.id === id) return normEntry(d.workingDraft);
    for (var i = 0; i < d.drafts.length; i++) { if (d.drafts[i].id === id) return normEntry(d.drafts[i]); }
    return null;
  }

  function deleteDraft(id) {
    var d = data();
    var removed = null;
    var out = [];
    for (var i = 0; i < d.drafts.length; i++) {
      if (d.drafts[i].id === id) { removed = d.drafts[i]; continue; }
      out.push(d.drafts[i]);
    }
    d.drafts = out;
    if (d.workingDraft && d.workingDraft.id === id) { removed = removed || d.workingDraft; d.workingDraft = null; d.workingDraftId = ""; }
    commit();
    return removed;   // 收藏记录完全独立，不受影响
  }

  // —— 收藏 ——
  function saveFavorite(entry) {
    var d = data();
    var e = normEntry(entry);
    if (!e || !e.text.replace(/\s+/g, " ").trim()) return null;   // 空内容不能收藏
    var key = textKeyOf(e);
    for (var i = 0; i < d.favorites.length; i++) {
      if (d.favorites[i].id === e.id || textKeyOf(d.favorites[i]) === key) {
        d.favorites[i].updatedAt = nowMs();
        d.favorites[i].text = e.text;
        d.favorites[i].favoriteMode = e.favoriteMode;
        d.favorites[i].favorite = true;
        d.favorites[i].lastUsedAt = d.favorites[i].lastUsedAt || 0;
        commit();
        return d.favorites[i];
      }
    }
    e.favorite = true;
    e.createdAt = nowMs();
    e.updatedAt = e.createdAt;
    d.favorites.unshift(e);
    commit();
    return e;
  }

  function listFavorites(filter) {
    var list = data().favorites.slice();
    list.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    return applyFilter(list, filter);
  }

  function removeFavorite(id) {
    var d = data();
    var removed = null;
    var out = [];
    for (var i = 0; i < d.favorites.length; i++) {
      if (d.favorites[i].id === id) { removed = d.favorites[i]; continue; }
      out.push(d.favorites[i]);
    }
    d.favorites = out;
    commit();
    return removed;
  }

  function isFavoriteText(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return false;
    var list = data().favorites;
    for (var i = 0; i < list.length; i++) {
      if (list[i].text.replace(/\s+/g, " ").trim() === t) return true;
    }
    return false;
  }

  function findFavoriteByText(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return null;
    var list = data().favorites;
    for (var i = 0; i < list.length; i++) {
      if (list[i].text.replace(/\s+/g, " ").trim() === t) return normEntry(list[i]);
    }
    return null;
  }

  function toggleFavorite(entry) {
    var e = normEntry(entry);
    if (!e || !e.text.trim()) return { favorited: false, reason: "empty" };
    if (isFavoriteText(e.text)) {
      var existing = findFavoriteByText(e.text);
      if (existing) removeFavorite(existing.id);
      emit("favorite-changed", { favorited: false, text: "" });
      return { favorited: false, id: existing ? existing.id : "" };
    }
    var saved = saveFavorite(e);
    emit("favorite-changed", { favorited: true, text: "" });
    return { favorited: true, id: saved ? saved.id : "" };
  }

  // —— 最近使用 ——
  function addRecent(entry) {
    var d = data();
    var e = normEntry(entry);
    if (!e || !e.text.replace(/\s+/g, " ").trim()) return null;
    var key = textKeyOf(e);
    var t = nowMs();
    for (var i = 0; i < d.recent.length; i++) {
      var r = d.recent[i];
      if (textKeyOf(r) === key && (t - (r.lastUsedAt || r.updatedAt)) < RECENT_DEDUPE_MS) {
        r.lastUsedAt = t;
        r.updatedAt = t;
        r.generateResultId = e.generateResultId;
        r.generated = true;
        r.resultStale = false;
        commit();
        return r;
      }
    }
    var out = [];
    for (var j = 0; j < d.recent.length; j++) { if (textKeyOf(d.recent[j]) !== key) out.push(d.recent[j]); }
    e.generated = true;
    e.resultStale = false;
    e.lastUsedAt = t;
    e.createdAt = t;
    e.updatedAt = t;
    out.unshift(e);
    d.recent = out;
    commit();
    return e;
  }

  function listRecent(filter) {
    var list = data().recent.slice();
    list.sort(function (a, b) { return (b.lastUsedAt || b.updatedAt) - (a.lastUsedAt || a.updatedAt); });
    return applyFilter(list, filter);
  }

  function removeRecent(id) {
    var d = data();
    var removed = null;
    var out = [];
    for (var i = 0; i < d.recent.length; i++) {
      if (d.recent[i].id === id) { removed = d.recent[i]; continue; }
      out.push(d.recent[i]);
    }
    d.recent = out;
    commit();
    return removed;
  }

  function applyFilter(list, filter) {
    var f = filter && filter.contentType;
    if (!f || f === "all") return list;
    var out = [];
    for (var i = 0; i < list.length; i++) { if (list[i].contentType === f) out.push(list[i]); }
    return out;
  }

  /* —— 最近一次可撤销操作（刷新前也保留）——
   * kind:"clear"      用户点了「清空」→ 撤销恢复正文
   * kind:"unfavorite" 用户取消了收藏 / 删除了草稿 → 撤销恢复这条记录
   * 一次只保留最近一次，避免弹层里堆叠多个撤销项。 */
  function setRecentUndo(payload) {
    if (!payload) { clearRecentUndo(); return; }
    if (payload.kind === "unfavorite") {
      var e = normEntry(payload.entry);
      if (!e) { clearRecentUndo(); return; }
      writeRaw(UNDO_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, kind: "unfavorite", entry: e, at: nowMs() }));
      return;
    }
    if (!payload.text) { clearRecentUndo(); return; }
    writeRaw(UNDO_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      kind: "clear",
      text: str(payload.text, TEXT_LIMIT),
      textState: normTextState(payload.textState),
      at: nowMs()
    }));
  }
  function getRecentUndo() {
    var raw = readJson(UNDO_KEY, null);
    if (!raw) return null;
    if (nowMs() - num(raw.at, 0) > 24 * 60 * 60 * 1000) { clearRecentUndo(); return null; }
    if (raw.kind === "unfavorite") {
      var e = normEntry(raw.entry);
      if (!e) { clearRecentUndo(); return null; }
      return { kind: "unfavorite", entry: e, at: num(raw.at, 0) };
    }
    if (!raw.text) return null;
    return { kind: "clear", text: str(raw.text, TEXT_LIMIT), textState: normTextState(raw.textState), at: num(raw.at, 0) };
  }
  function clearRecentUndo() {
    if (storage) { try { storage.removeItem(UNDO_KEY); return; } catch (e) {} }
    delete memory[UNDO_KEY];
  }

  // —— 偏好（使者 / 声音 / 音乐）——
  function getPrefs() { return data().prefs; }
  function setPrefs(patch) {
    var d = data();
    if (!patch) return d.prefs;
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k) && k in d.prefs) d.prefs[k] = str(patch[k], 120);
    }
    commit();
    return d.prefs;
  }

  // —— 维护 / 诊断 ——
  function runCleanup(at) {
    var d = data();
    var removed = cleanup(d, at);
    saveRoot(d);
    return removed;
  }

  function stats() {
    var d = data();
    return {
      schemaVersion: SCHEMA_VERSION,
      storage: storage ? "localStorage" : (available ? "memory" : "unavailable"),
      rootKey: ROOT_KEY,
      undoKey: UNDO_KEY,
      masterKey: MASTER_KEY,
      recipientKey: RECIPIENT_KEY,
      storageAvailable: !!storage,
      lastError: lastError,
      limits: { draftMax: DRAFT_MAX, recentMax: RECENT_MAX, retentionDays: RETENTION_DAYS },
      counts: {
        drafts: d.drafts.length,
        favorites: d.favorites.length,
        recent: d.recent.length,
        working: d.workingDraft ? 1 : 0
      },
      userId: d.userId,
      updatedAt: d.updatedAt
    };
  }

  // 清空用户内容系统（仅供维护 / 测试调用，页面不暴露入口）
  function resetAll() {
    if (storage) {
      try {
        var keys = [ROOT_KEY, UNDO_KEY, MASTER_KEY, RECIPIENT_KEY];
        for (var i = 0; i < keys.length; i++) storage.removeItem(keys[i]);
      } catch (e) { /* ignore */ }
    }
    memory = {};
    cache = defaultRoot();
    saveRoot(cache);
    return true;
  }

  // —— 破坏性安全：正文一律纯文本，绝不作为 HTML 执行 ——
  function escapeHtml(text) {
    return String(text === null || text === undefined ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function plainText(text, maxLen) {
    var t = String(text === null || text === undefined ? "" : text)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
    if (maxLen && t.length > maxLen) t = t.slice(0, maxLen);
    return t;
  }

  /* ------------------- 春节批量个性祝福：结构预留（默认关闭） ------------------- */
  function batchBlessing() {
    return {
      enabled: BATCH_BLESSING_ENABLED,            // 本轮恒为 false，前台不显示任何入口
      schemaVersion: SCHEMA_VERSION,
      masterKey: MASTER_KEY,
      recipientKey: RECIPIENT_KEY,
      listMasters: function () {
        var raw = readJson(MASTER_KEY, { schemaVersion: SCHEMA_VERSION, masters: [] });
        var list = raw && Array.isArray(raw.masters) ? raw.masters : [];
        return list.map(normMaster).filter(Boolean);
      },
      saveMaster: function (master) {
        var m = normMaster(master);
        if (!m) return null;
        var raw = readJson(MASTER_KEY, { schemaVersion: SCHEMA_VERSION, masters: [] });
        var list = raw && Array.isArray(raw.masters) ? raw.masters.map(normMaster).filter(Boolean) : [];
        var found = false;
        for (var i = 0; i < list.length; i++) { if (list[i].id === m.id) { list[i] = m; found = true; break; } }
        if (!found) list.unshift(m);
        writeRaw(MASTER_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, masters: list }));
        return m;
      },
      variablePattern: /\u3010([^\u3011]{1,20})\u3011/g,   // 【称呼】
      // 一条母版 + 多人称呼 → 逐条个性化文字（未来批量生成用）
      renderFor: function (master, recipient) {
        var m = normMaster(master);
        var r = normRecipient(recipient);
        if (!m || !r) return "";
        var body = m.body;
        var values = { "称呼": r.salutation || r.name, "姓名": r.name, "备注": r.note };
        return plainText(body.replace(batchBlessing().variablePattern, function (all, key) {
          return Object.prototype.hasOwnProperty.call(values, key) ? (values[key] || "") : all;
        }), TEXT_LIMIT);
      }
    };
  }

  /* 页面只依赖这个对象；以后换成 IndexedDB / 云端实现，只要保持同名方法即可 */
  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    KEYS: { root: ROOT_KEY, undo: UNDO_KEY, master: MASTER_KEY, recipient: RECIPIENT_KEY },
    LIMITS: { draftMax: DRAFT_MAX, recentMax: RECENT_MAX, retentionDays: RETENTION_DAYS, recentDedupeMs: RECENT_DEDUPE_MS },

    // 工作草稿
    saveWorkingDraft: saveWorkingDraft,
    getWorkingDraft: getWorkingDraft,
    clearWorkingDraft: clearWorkingDraft,
    commitWorkingDraftToList: commitWorkingDraftToList,
    startNewDraft: startNewDraft,
    listDrafts: listDrafts,
    getDraft: getDraft,
    deleteDraft: deleteDraft,
    // 收藏
    saveFavorite: saveFavorite,
    listFavorites: listFavorites,
    removeFavorite: removeFavorite,
    isFavoriteText: isFavoriteText,
    findFavoriteByText: findFavoriteByText,
    toggleFavorite: toggleFavorite,
    // 最近使用
    addRecent: addRecent,
    listRecent: listRecent,
    removeRecent: removeRecent,
    // 撤销
    setRecentUndo: setRecentUndo,
    getRecentUndo: getRecentUndo,
    clearRecentUndo: clearRecentUndo,
    // 偏好与维护
    getPrefs: getPrefs,
    setPrefs: setPrefs,
    runCleanup: runCleanup,
    stats: stats,
    resetAll: resetAll,
    on: on,
    // 原文 / 方言口语稿（V2）
    VIEW: { original: VIEW_ORIGINAL, dialect: VIEW_DIALECT },
    DIALECT_STATUS: DIALECT_STATUS,
    // 安全文本工具
    escapeHtml: escapeHtml,
    plainText: plainText,
    normEntry: normEntry,
    // 预留：春节批量个性祝福
    batchBlessing: batchBlessing
  };

  global.LuguContentStore = api;
})(window);
