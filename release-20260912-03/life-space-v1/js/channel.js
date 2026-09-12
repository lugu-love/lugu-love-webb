(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const cardList = $("#cardList");
  const detailBackdrop = $("#detailBackdrop");
  const viewer = $("#imageViewer");
  const pageParams = new URLSearchParams(window.location.search);
  const visitorId = pageParams.get("id") || "";
  const visitorMode = pageParams.get("mode") === "visitor";
  const embeddedMode = pageParams.get("embedded") === "1";
  const channels = Array.isArray(window.LifeSpaceDefaults && window.LifeSpaceDefaults.channels)
    ? window.LifeSpaceDefaults.channels
    : [];
  const requestedChannelId = pageParams.get("channel") || "life";
  const currentChannel = channels.find((channel) => channel.id === requestedChannelId)
    || channels.find((channel) => channel.id === "life")
    || { id: "life", name: "我的生活", description: "记录生活中平凡却值得留下的时刻。" };
  const currentChannelId = currentChannel.id;
  const currentChannelLabel = currentChannel.name.replace(/^我的/, "") || currentChannel.name;
  const demoVisitor = visitorMode && window.LifeSpaceDemoVisitors
    ? window.LifeSpaceDemoVisitors[visitorId]
    : null;
  const channelMarks = {
    emotion: "情",
    life: "生",
    growth: "长",
    travel: "旅",
    creation: "创",
    collection: "藏",
    "life-tree": "树"
  };
  const channelIcons = Object.freeze({
    heart: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 39S8 30 8 18.5C8 12.7 12.1 9 17 9c3.1 0 5.6 1.5 7 4 1.4-2.5 3.9-4 7-4 4.9 0 9 3.7 9 9.5C40 30 24 39 24 39Z"/></svg>',
    sun: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="8"/><path d="M24 6v6m0 24v6M6 24h6m24 0h6M11.3 11.3l4.2 4.2m17 17 4.2 4.2m0-25.4-4.2 4.2m-17 17-4.2 4.2"/></svg>',
    sprout: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V22m0 5c-8 0-13-5-13-13 8 0 13 5 13 13Zm0-5c0-8 5-13 13-13 0 8-5 13-13 13Z"/><path d="M17 40h14"/></svg>',
    compass: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="m30.5 17.5-4 9-9 4 4-9 9-4Z"/><circle cx="24" cy="24" r="2"/></svg>',
    spark: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 7c1.8 9.4 7.6 15.2 17 17-9.4 1.8-15.2 7.6-17 17-1.8-9.4-7.6-15.2-17-17 9.4-1.8 15.2-7.6 17-17Z"/><path d="M38 7v7M34.5 10.5h7"/></svg>',
    gem: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m9 18 7-9h16l7 9-15 21L9 18Z"/><path d="m16 9 8 30L32 9M9 18h30"/></svg>',
    tree: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V22m0 4-8-7m8 2 8-8m-8 3-5-5"/><path d="M13 22a8 8 0 0 1 4-14 9 9 0 0 1 16 4 8 8 0 0 1 2 15 10 10 0 0 1-11 1 10 10 0 0 1-11-6Z"/><path d="M16 40h16"/></svg>'
  });
  const templateNames = {
    a: "沉浸大图", b: "左图右文", c: "一大两小",
    d: "杂志版", e: "日记版", f: "拼贴版"
  };
  let previewTemplate = "";
  let listUrls = [];
  let detailUrls = [];
  let viewerUrls = [];
  let viewerIndex = 0;
  const MUSIC_LIBRARY_KEY = "life-space-v1.music-library";
  const MUSIC_SETTINGS_KEY = "life-space-v1.music-settings";
  const backgroundMusic = $("#backgroundMusic");
  let musicUrl = "";
  let musicLibrary = [];
  let musicSettings = { trackId: "", enabled: false, volume: 45 };
  const PROMPT_IMAGE_ID = `${currentChannelId}-channel-prompt-image`;
  const PROMPT_IMAGE_DATA_KEY = `life-space-v1.${currentChannelId}-channel-prompt-data`;
  let promptImageUrl = "";
  let channelAvatarEditing = false;
  let channelCropState = null;

  function showNotice(message) {
    $("#notice").textContent = message;
    $("#notice").classList.add("show");
    setTimeout(() => $("#notice").classList.remove("show"), 2300);
  }

  async function loadPromptStyle() {
    const storedPromptImage = localStorage.getItem(PROMPT_IMAGE_DATA_KEY);
    if (storedPromptImage) {
      $("#promptCard").style.backgroundImage = `url("${storedPromptImage}")`;
      return;
    }
    try {
      const promptRecord = await window.LifeSpaceImageStorage.get(PROMPT_IMAGE_ID);
      if (promptRecord) {
        promptImageUrl = URL.createObjectURL(window.LifeSpaceImageStorage.variantBlob(promptRecord, "preview"));
        $("#promptCard").style.backgroundImage = `url("${promptImageUrl}")`;
      }
    } catch (error) {
      console.warn("频道个性图片读取失败", error);
    }
  }

  function prepareLocalImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("请选择一张图片"));
        return;
      }
      const fileUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const maxSide = 1200;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(fileUrl);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      image.onerror = () => {
        URL.revokeObjectURL(fileUrl);
        reject(new Error("无法读取这张照片，请换一张 JPG、PNG 或 WebP 图片"));
      };
      image.src = fileUrl;
    });
  }

  function loadAvatarCropImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith("image/")) {
        reject(new Error("请选择图片文件。"));
        return;
      }
      const image = new Image();
      const source = URL.createObjectURL(file);
      image.onload = () => {
        resolve({ image, source });
      };
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error("这张图片无法读取，请换一张重试。"));
      };
      image.src = source;
    });
  }

  async function openChannelCropper(file) {
    closeChannelCropper();
    const loaded = await loadAvatarCropImage(file);
    const viewportSize = 240;
    const fitScale = Math.max(viewportSize / loaded.image.naturalWidth, viewportSize / loaded.image.naturalHeight);
    channelCropState = {
      image: loaded.image,
      source: loaded.source,
      viewportSize,
      fitScale,
      zoom: 1,
      offsetX: (viewportSize - loaded.image.naturalWidth * fitScale) / 2,
      offsetY: (viewportSize - loaded.image.naturalHeight * fitScale) / 2,
      pointerId: null,
      startX: 0,
      startY: 0,
      originX: 0,
      originY: 0
    };
    $("#channelCropZoom").value = "1";
    $("#channelCropImage").src = loaded.source;
    $("#channelAvatarCropper").hidden = false;
    renderChannelCrop();
    $("#channelAvatarCropper").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function channelCropDimensions() {
    if (!channelCropState) return { width: 0, height: 0, scale: 1 };
    const scale = channelCropState.fitScale * channelCropState.zoom;
    return {
      scale,
      width: channelCropState.image.naturalWidth * scale,
      height: channelCropState.image.naturalHeight * scale
    };
  }

  function clampChannelCrop() {
    if (!channelCropState) return;
    const dimensions = channelCropDimensions();
    channelCropState.offsetX = Math.min(0, Math.max(channelCropState.viewportSize - dimensions.width, channelCropState.offsetX));
    channelCropState.offsetY = Math.min(0, Math.max(channelCropState.viewportSize - dimensions.height, channelCropState.offsetY));
  }

  function renderChannelCrop() {
    if (!channelCropState) return;
    clampChannelCrop();
    const dimensions = channelCropDimensions();
    const image = $("#channelCropImage");
    image.style.width = `${dimensions.width}px`;
    image.style.height = `${dimensions.height}px`;
    image.style.transform = `translate(${channelCropState.offsetX}px, ${channelCropState.offsetY}px)`;
  }

  function closeChannelCropper() {
    if (channelCropState && channelCropState.source) URL.revokeObjectURL(channelCropState.source);
    channelCropState = null;
    $("#channelAvatarCropper").hidden = true;
    $("#channelCropImage").removeAttribute("src");
  }

  function readMusicValue(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveMusicState() {
    localStorage.setItem(MUSIC_LIBRARY_KEY, JSON.stringify(musicLibrary));
    localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(musicSettings));
  }

  function renderMusicLibrary() {
    const select = $("#musicSelect");
    select.innerHTML = musicLibrary.length
      ? musicLibrary.map((track) => `<option value="${escapeHtml(track.id)}">${escapeHtml(track.name)}</option>`).join("")
      : '<option value="">尚未添加音乐</option>';
    if (!musicLibrary.some((track) => track.id === musicSettings.trackId)) {
      musicSettings.trackId = musicLibrary[0] ? musicLibrary[0].id : "";
    }
    select.value = musicSettings.trackId;
    select.disabled = !musicLibrary.length;
    $("#musicEnabled").checked = Boolean(musicSettings.enabled && musicSettings.trackId);
    $("#musicVolume").value = musicSettings.volume;
    $("#musicVolumeValue").value = `${musicSettings.volume}%`;
  }

  function setMusicStatus(message) {
    $("#musicStatus").textContent = message;
  }

  async function loadSelectedMusic(shouldPlay) {
    if (musicUrl) {
      URL.revokeObjectURL(musicUrl);
      musicUrl = "";
    }
    backgroundMusic.pause();
    backgroundMusic.removeAttribute("src");
    if (!musicSettings.trackId) {
      musicSettings.enabled = false;
      $("#musicEnabled").checked = false;
      setMusicStatus("请先添加一首音乐");
      return;
    }
    try {
      const record = await window.LifeSpaceImageStorage.get(musicSettings.trackId);
      if (!record || !record.originalBlob) throw new Error("音乐文件不存在");
      musicUrl = URL.createObjectURL(record.originalBlob);
      backgroundMusic.src = musicUrl;
      backgroundMusic.volume = musicSettings.volume / 100;
      if (shouldPlay && musicSettings.enabled) {
        await backgroundMusic.play();
        setMusicStatus(`正在播放：${record.fileName || "我的音乐"}`);
      } else {
        setMusicStatus(musicSettings.enabled ? "点击音乐开关开始播放" : "当前已关闭");
      }
    } catch (error) {
      musicSettings.enabled = false;
      $("#musicEnabled").checked = false;
      setMusicStatus(error.message || "音乐读取失败");
      saveMusicState();
    }
  }

  async function initializeMusic() {
    musicLibrary = readMusicValue(MUSIC_LIBRARY_KEY, []).filter((track) => track && track.id && track.name);
    const stored = readMusicValue(MUSIC_SETTINGS_KEY, {});
    musicSettings = {
      trackId: String(stored.trackId || ""),
      enabled: Boolean(stored.enabled),
      volume: Math.max(0, Math.min(100, Number(stored.volume) || 45))
    };
    renderMusicLibrary();
    await loadSelectedMusic(false);
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function formatDate(value, includeTime) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric", month: "long", day: "numeric",
      hour: includeTime ? "2-digit" : undefined,
      minute: includeTime ? "2-digit" : undefined
    }).format(date);
  }

  function visibilityLabel(value) {
    if (window.LifeCardRenderer && typeof window.LifeCardRenderer.visibilityLabel === "function") {
      return window.LifeCardRenderer.visibilityLabel(value);
    }
    if (value === "public") return "公开";
    if (value === "invite") return "邀请可见";
    return "私密";
  }

  function formatDotDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join(".");
  }

  function channelUrl(channelId, extraParams) {
    const params = new URLSearchParams({ channel: channelId, v: "20260728-6" });
    if (demoVisitor) {
      params.set("mode", "visitor");
      params.set("id", demoVisitor.id);
    }
    if (embeddedMode) params.set("embedded", "1");
    if (extraParams) {
      Object.keys(extraParams).forEach((key) => {
        if (extraParams[key]) params.set(key, extraParams[key]);
      });
    }
    return `channel.html?${params.toString()}`;
  }

  function renderAvatar(element, source) {
    if (!element) return;
    element.classList.toggle("has-image", Boolean(source));
    element.innerHTML = source ? `<img src="${source}" alt="">` : "<span>生</span>";
  }

  function renderChannelProfile() {
    const profile = demoVisitor || window.LifeSpaceStorage.getProfile();
    const channelAvatar = demoVisitor ? "" : window.LifeSpaceStorage.getChannelAvatar(currentChannelId);
    renderAvatar($("#channelAvatar"), channelAvatar || profile.avatar || "");
    $("#channelNickname").textContent = profile.nickname || "我的生命空间";
  }

  function setChannelAvatarEditing(isEditing) {
    channelAvatarEditing = Boolean(isEditing && !demoVisitor);
    $("#channelAvatarActions").hidden = !channelAvatarEditing;
    $("#channelAvatarTip").hidden = !channelAvatarEditing;
  }

  function setPromptEditing(isEditing) {
    if (demoVisitor) return;
    $("#promptCard").classList.toggle("is-editing", Boolean(isEditing));
    $("#changePromptBackground").hidden = !isEditing;
  }

  function renderChannelChrome() {
    document.body.dataset.channel = currentChannelId;
    document.title = `${currentChannel.name}｜我的生命空间`;
    renderChannelProfile();
    $(".channel-header .eyebrow").textContent = "Life Channel";
    $(".channel-header h1").textContent = currentChannel.name;
    $(".channel-header > p:last-child").textContent = currentChannel.description;
    $("#recordsTitle").textContent = `${currentChannel.name}记录`;
    $(".prompt-card p").textContent = `今天，有什么${currentChannelLabel}值得留下？`;
    $(".prompt-record-button").href = `editor.html?channel=${encodeURIComponent(currentChannelId)}`;
  }

  function renderChannelSwitcher() {
    const switcher = $("#channelSwitcherGrid");
    if (!switcher || !channels.length) return;
    switcher.innerHTML = channels
      .filter((channel) => channel.id !== currentChannelId)
      .map((channel) => `
        <a class="channel-switch-link" href="${channelUrl(channel.id)}" data-channel="${escapeHtml(channel.id)}">
          <span class="channel-switch-mark" aria-hidden="true">${channelIcons[channel.icon] || channelMarks[channel.id] || "频"}</span>
          <strong>${escapeHtml(channel.name)}</strong>
        </a>
      `).join("");
  }

  function activeCards() {
    if (demoVisitor) {
      return demoVisitor.cards
        .filter((card) => card.channelId === currentChannelId && card.visibility === "public")
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return window.LifeSpaceStorage.getCards(currentChannelId);
  }

  function activeCard(id) {
    if (demoVisitor) {
      return demoVisitor.cards.find((card) => card.id === id && card.channelId === currentChannelId && card.visibility === "public") || null;
    }
    const card = window.LifeSpaceStorage.getCard(id);
    return card && card.channelId === currentChannelId ? card : null;
  }

  function initializeVisitorView() {
    if (!demoVisitor) return;
    document.body.classList.add("visitor-channel");
    document.title = `${demoVisitor.nickname}的${currentChannelLabel}｜生命空间`;
    $(".channel-header .eyebrow").textContent = "Visiting Life Channel";
    $(".channel-header h1").textContent = `${demoVisitor.nickname}的${currentChannelLabel}`;
    $(".channel-header > p:last-child").textContent = `这里展示的是 TA 愿意与你分享的${currentChannelLabel}记录。`;
    $(".prompt-card").hidden = true;
    $("#openMusicPanel").hidden = true;
    $("#recordsTitle").textContent = `公开${currentChannelLabel}记录`;
    const backParams = new URLSearchParams({ mode: "visitor", id: demoVisitor.id });
    if (embeddedMode) backParams.set("embedded", "1");
    $(".back-link").href = `index.html?${backParams.toString()}`;
    $(".back-link").textContent = "← 返回 TA 的生命空间";
  }

  function revokeUrls(urls) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.length = 0;
  }

  async function resolveImages(card, variant, urlBucket) {
    const images = Array.isArray(card.images) ? card.images : [];
    const resolved = [];
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      if (typeof image === "string" && image.startsWith("data:image/")) {
        resolved.push({ src: image, index, positionX: 50, positionY: 50 });
        continue;
      }
      if (typeof image === "string" && !image.startsWith("data:")) {
        resolved.push({ src: image, index, positionX: 50, positionY: 50 });
        continue;
      }
      if (image && typeof image === "object" && image.src) {
        resolved.push({
          src: image.src,
          index,
          positionX: Number.isFinite(Number(image.positionX)) ? Number(image.positionX) : 50,
          positionY: Number.isFinite(Number(image.positionY)) ? Number(image.positionY) : 50
        });
        continue;
      }
      const id = typeof image === "string" ? image : image && image.id;
      if (!id) continue;
      try {
        const record = await window.LifeSpaceImageStorage.get(id);
        const blob = window.LifeSpaceImageStorage.variantBlob(record, variant);
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        urlBucket.push(url);
        resolved.push({
          src: url,
          index,
          positionX: typeof image === "object" && Number.isFinite(Number(image.positionX)) ? Number(image.positionX) : 50,
          positionY: typeof image === "object" && Number.isFinite(Number(image.positionY)) ? Number(image.positionY) : 50
        });
      } catch (error) {
        console.warn("生命卡图片读取失败", id, error);
      }
    }
    return resolved;
  }

  async function resolveMedia(meta, urlBucket) {
    if (!meta || !meta.id) return null;
    try {
      const record = await window.LifeSpaceImageStorage.get(meta.id);
      if (!record || !record.originalBlob) return null;
      const url = URL.createObjectURL(record.originalBlob);
      urlBucket.push(url);
      return { url, fileName: meta.fileName || record.fileName || "媒体文件" };
    } catch (error) {
      console.warn("媒体文件读取失败", meta.id, error);
      return null;
    }
  }

  function recommendedTemplate(card, imageCount) {
    if (card.visualTemplate && templateNames[card.visualTemplate]) return card.visualTemplate;
    if (imageCount >= 5) return "f";
    if (imageCount === 3 || imageCount === 4) return "c";
    if (imageCount === 2) return "b";
    if (imageCount === 1) return "a";
    return "e";
  }

  function textParts(card) {
    const title = String(card.title || "").trim();
    const subtitle = String(card.subtitle || "").trim();
    const content = String(card.content || "").trim();
    const tags = [visibilityLabel(card.visibility), String(card.location || "").trim(), currentChannelLabel]
      .concat((card.tags || []).filter(Boolean).slice(0, 2))
      .filter(Boolean);
    const tagHtml = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    return {
      title: title ? `<h3 class="visual-title">${escapeHtml(title)}</h3>` : "",
      subtitle: subtitle ? `<p class="visual-subtitle">${escapeHtml(subtitle)}</p>` : "",
      content: content ? `<p class="visual-copy">${escapeHtml(content)}</p>` : "",
      date: `<time class="visual-date">${formatDotDate(card.createdAt)}</time>`,
      tags: `<div class="visual-tags">${tagHtml}</div>`
    };
  }

  function imageButton(cardId, image, extraClass, remaining) {
    if (!image) return `<div class="visual-placeholder ${extraClass || ""}" aria-hidden="true"><span>LIFE</span></div>`;
    return `
      <button class="visual-photo ${extraClass || ""}" type="button" data-card-image="${escapeHtml(cardId)}" data-image-index="${image.index}" aria-label="查看第 ${image.index + 1} 张高清图片">
        <img src="${image.src}" alt="生命记录第 ${image.index + 1} 张图片">
        ${remaining > 0 ? `<span class="visual-more">+${remaining}</span>` : ""}
      </button>`;
  }

  function templateHtml(card, images, template) {
    const text = textParts(card);
    const first = images[0];
    const titleOrContent = text.title || text.content;

    if (template === "a") {
      return `
        <article class="life-card visual-card card-template-a" data-card-open="${escapeHtml(card.id)}" tabindex="0">
          <div class="a-hero">${imageButton(card.id, first, "", images.length - 1)}</div>
          <div class="a-caption">
            ${text.subtitle}
            ${titleOrContent}
            ${text.title ? text.content : ""}
            <div class="visual-meta">${text.date}${text.tags}</div>
          </div>
        </article>`;
    }
    if (template === "b") {
      return `
        <article class="life-card visual-card card-template-b" data-card-open="${escapeHtml(card.id)}" tabindex="0">
          <div class="b-photo">${imageButton(card.id, first, "", images.length - 1)}</div>
          <div class="b-body">
            ${text.subtitle}${text.title}${text.content}
            <div class="b-rule"></div>${text.date}${text.tags}
          </div>
        </article>`;
    }
    if (template === "c") {
      const visible = images.slice(0, 3);
      return `
        <article class="life-card visual-card card-template-c" data-card-open="${escapeHtml(card.id)}" tabindex="0">
          <div class="c-gallery">
            ${visible.length ? visible.map((image, index) => imageButton(card.id, image, `c-photo-${index + 1}`, index === visible.length - 1 ? images.length - visible.length : 0)).join("") : imageButton(card.id, null)}
          </div>
          <div class="c-body">${text.subtitle}${text.title}${text.content}<div class="visual-meta">${text.date}${text.tags}</div></div>
        </article>`;
    }
    if (template === "d") {
      return `
        <article class="life-card visual-card card-template-d" data-card-open="${escapeHtml(card.id)}" tabindex="0">
          <div class="d-issue"><span>LIFE SPACE · MEMORY</span><span>NO. ${String(new Date(card.createdAt).getDate()).padStart(3, "0")}</span></div>
          <div class="d-heading">${text.subtitle}${text.title}</div>
          <div class="d-photo">${imageButton(card.id, first, "", images.length - 1)}</div>
          <div class="d-story"><span class="d-dropcap">${escapeHtml((card.title || card.content || "生").trim().charAt(0) || "生")}</span>${text.content}</div>
          <div class="d-footer">${text.date}${text.tags}</div>
        </article>`;
    }
    if (template === "e") {
      return `
        <article class="life-card visual-card card-template-e" data-card-open="${escapeHtml(card.id)}" tabindex="0">
          <div class="e-top"><div class="e-calendar">${formatDate(card.createdAt, false)}</div>${first ? `<div class="e-photo">${imageButton(card.id, first, "", images.length - 1)}</div>` : ""}</div>
          ${text.subtitle}${text.title}${text.content}
          <div class="e-signature">—— 写给此刻的我</div>
          ${text.tags}
        </article>`;
    }

    const visible = images.slice(0, 5);
    return `
      <article class="life-card visual-card card-template-f" data-card-open="${escapeHtml(card.id)}" tabindex="0">
        <div class="f-stamp">LIFE<br>MEMORY</div>
        <div class="f-gallery">
          ${visible.length ? visible.map((image, index) => imageButton(card.id, image, `f-photo-${index + 1}`, index === visible.length - 1 ? images.length - visible.length : 0)).join("") : imageButton(card.id, null)}
        </div>
        <div class="f-caption">${text.subtitle}${text.title}${text.content}<div class="visual-meta">${text.date}${text.tags}</div></div>
      </article>`;
  }

  async function render() {
    revokeUrls(listUrls);
    const cards = activeCards();
    $("#recordCount").textContent = `${cards.length} 条`;
    if (!cards.length) {
      cardList.innerHTML = `
        <div class="empty-state">
          <div class="empty-mark" aria-hidden="true">✦</div>
          <h3>第一张生命内容卡，等待被写下</h3>
          <p>点击上方“开始记录”，留下第一段${escapeHtml(currentChannelLabel)}记忆。</p>
        </div>`;
      return;
    }
    const fragments = [];
    for (const card of cards) {
      const images = await resolveImages(card, "thumbnail", listUrls);
      const template = previewTemplate || recommendedTemplate(card, images.length);
      fragments.push(window.LifeCardRenderer.render(card, images, {
        template,
        interactive: true,
        mode: "list",
        readonly: Boolean(demoVisitor)
      }));
    }
    cardList.innerHTML = fragments.join("");
  }

  function effectiveLayout(layout, count) {
    if (layout === "hero") return "hero";
    if (layout === "hero-2" && count >= 3) return "hero-2";
    if (layout === "hero-4" && count >= 5) return "hero-4";
    if (layout === "grid") return "grid";
    if (count === 1) return "hero";
    if (count === 3) return "hero-2";
    if (count >= 5) return "hero-4";
    return "grid";
  }

  function galleryHtml(card, images) {
    if (!images.length) return "";
    const layout = effectiveLayout(card.imageLayout, images.length);
    return `
      <div class="photo-layout layout-${layout} detail-gallery">
        ${images.map((image) => `
          <div class="photo-cell detail-photo-cell">
            <button class="detail-photo-view" type="button" data-image-index="${image.index}" data-card-image="${escapeHtml(card.id)}" aria-label="查看第 ${image.index + 1} 张高清图片">
              <img src="${image.src}" alt="生命记录第 ${image.index + 1} 张图片" style="object-position:${image.positionX}% ${image.positionY}%">
            </button>
            ${demoVisitor ? "" : `<button class="detail-photo-delete" type="button" data-delete-image="${image.index}" data-card-id="${escapeHtml(card.id)}" aria-label="删除第 ${image.index + 1} 张照片">删除</button>`}
          </div>
        `).join("")}
      </div>`;
  }

  async function openDetail(id) {
    const card = activeCard(id);
    if (!card) return;
    revokeUrls(detailUrls);
    const images = await resolveImages(card, "preview", detailUrls);
    const video = await resolveMedia(card.video, detailUrls);
    const voice = await resolveMedia(card.voice, detailUrls);
    const title = String(card.title || "").trim();
    const subtitle = String(card.subtitle || "").trim();
    const content = String(card.content || "").trim();
    const detailMeta = [
      formatDate(card.createdAt, true),
      String(card.location || "").trim(),
      visibilityLabel(card.visibility)
    ].filter(Boolean).map(escapeHtml).join("<span></span>");
    $("#detailPanel").innerHTML = `
      <div class="detail-topbar">
        <button class="detail-back" type="button" data-detail-back>← 返回</button>
        <strong>查看完整记录</strong>
      </div>
      ${galleryHtml(card, images)}
      <div class="detail-body">
        ${video ? `<section class="detail-media"><h3>视频</h3><video controls playsinline preload="metadata" src="${video.url}"></video></section>` : ""}
        ${voice ? `<section class="detail-media detail-audio"><h3>语音</h3><audio controls preload="metadata" src="${voice.url}"></audio></section>` : ""}
        ${subtitle ? `<p class="detail-subtitle">${escapeHtml(subtitle)}</p>` : ""}
        ${title ? `<h2>${escapeHtml(title)}</h2>` : ""}
        <div class="detail-meta">${detailMeta}</div>
        ${content ? `<p class="detail-text">${escapeHtml(content)}</p>` : ""}
        ${demoVisitor
          ? '<div class="detail-actions visitor-detail-actions"><button class="detail-save-button" type="button" data-detail-back>返回公开记录</button></div>'
          : `<div class="detail-actions">
              <button class="detail-save-button" type="button" data-detail-save>保存</button>
              <a class="primary-button" href="editor.html?channel=${encodeURIComponent(currentChannelId)}&id=${encodeURIComponent(card.id)}">编辑</a>
              <button class="danger-button" type="button" data-detail-delete="${escapeHtml(card.id)}">删除</button>
            </div>`}
      </div>`;
    detailBackdrop.classList.add("open");
    detailBackdrop.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDetail() {
    detailBackdrop.classList.remove("open");
    detailBackdrop.setAttribute("aria-hidden", "true");
    if (!viewer.classList.contains("open")) document.body.style.overflow = "";
    revokeUrls(detailUrls);
  }

  function showViewerImage() {
    if (!viewerUrls.length) return;
    $("#viewerImage").src = viewerUrls[viewerIndex].src;
    $("#viewerImage").alt = `生命记录高清图片，第 ${viewerIndex + 1} 张`;
    $("#viewerCount").textContent = `${viewerIndex + 1} / ${viewerUrls.length}`;
    $("#viewerPrev").disabled = viewerUrls.length < 2;
    $("#viewerNext").disabled = viewerUrls.length < 2;
  }

  async function openViewer(cardId, initialIndex) {
    const card = activeCard(cardId);
    if (!card) return;
    if (viewer.classList.contains("open")) closeViewer();
    const tempUrls = [];
    const images = await resolveImages(card, "original", tempUrls);
    viewerUrls = images.map((image) => ({ src: image.src, sourceIndex: image.index, isObjectUrl: tempUrls.includes(image.src) }));
    const foundIndex = viewerUrls.findIndex((image) => image.sourceIndex === Number(initialIndex));
    viewerIndex = foundIndex >= 0 ? foundIndex : 0;
    viewer.classList.add("open");
    viewer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    showViewerImage();
  }

  function closeViewer() {
    viewer.classList.remove("open");
    viewer.setAttribute("aria-hidden", "true");
    $("#viewerImage").removeAttribute("src");
    revokeUrls(viewerUrls.filter((image) => image.isObjectUrl).map((image) => image.src));
    viewerUrls = [];
    if (!detailBackdrop.classList.contains("open")) document.body.style.overflow = "";
  }

  function moveViewer(direction) {
    if (viewerUrls.length < 2) return;
    viewerIndex = (viewerIndex + direction + viewerUrls.length) % viewerUrls.length;
    showViewerImage();
  }

  async function removeCard(id) {
    if (demoVisitor) return;
    const card = window.LifeSpaceStorage.getCard(id);
    if (!card) return;
    const label = String(card.title || "").trim() || "这条记录";
    if (!window.confirm(`确定删除“${label}”吗？删除后无法恢复。`)) return;
    try {
      await window.LifeSpaceImageStorage.deleteByCard(id);
      window.LifeSpaceStorage.deleteCard(id);
      closeViewer();
      closeDetail();
      await render();
    } catch (error) {
      $("#notice").textContent = error.message;
      $("#notice").classList.add("show");
      setTimeout(() => $("#notice").classList.remove("show"), 2600);
    }
  }

  async function removeCardImage(cardId, imageIndex) {
    if (demoVisitor) return;
    const card = window.LifeSpaceStorage.getCard(cardId);
    if (!card || !Array.isArray(card.images)) return;
    const index = Number(imageIndex);
    if (!Number.isInteger(index) || index < 0 || index >= card.images.length) return;
    if (!window.confirm(`确定删除第 ${index + 1} 张照片吗？其他照片和文字会保留。`)) return;
    const removed = card.images[index];
    const removedId = typeof removed === "string" ? removed : removed && removed.id;
    const nextImages = card.images
      .filter((_, itemIndex) => itemIndex !== index)
      .map((image, order) => typeof image === "object" && image !== null
        ? Object.assign({}, image, { order })
        : image);
    try {
      if (removedId && !String(removedId).startsWith("data:image/")) {
        await window.LifeSpaceImageStorage.deleteMany([removedId]);
      }
      window.LifeSpaceStorage.saveCard(Object.assign({}, card, { images: nextImages }));
      closeViewer();
      await render();
      await openDetail(cardId);
      $("#notice").textContent = "已删除这张照片";
      $("#notice").classList.add("show");
      setTimeout(() => $("#notice").classList.remove("show"), 2200);
    } catch (error) {
      $("#notice").textContent = error.message || "照片删除失败，请重试。";
      $("#notice").classList.add("show");
      setTimeout(() => $("#notice").classList.remove("show"), 2600);
    }
  }

  cardList.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-card-view]");
    if (viewButton) {
      await openDetail(viewButton.dataset.cardView);
      return;
    }
    const manageButton = event.target.closest("[data-card-manage]");
    if (manageButton) {
      window.location.href = `editor.html?id=${encodeURIComponent(manageButton.dataset.cardManage)}`;
      return;
    }
    const imageButton = event.target.closest("[data-card-image]");
    if (imageButton) {
      await openViewer(imageButton.dataset.cardImage, imageButton.dataset.imageIndex);
      return;
    }
    const card = event.target.closest("[data-card-open]");
    if (card) await openDetail(card.dataset.cardOpen);
  });
  cardList.addEventListener("keydown", async (event) => {
    if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-card-open]")) {
      event.preventDefault();
      await openDetail(event.target.dataset.cardOpen);
    }
  });
  detailBackdrop.addEventListener("click", async (event) => {
    if (event.target.closest("[data-detail-save]")) {
      closeDetail();
      $("#notice").textContent = "记录已保存";
      $("#notice").classList.add("show");
      setTimeout(() => $("#notice").classList.remove("show"), 2200);
      return;
    }
    if (event.target.closest("[data-detail-back]")) {
      closeDetail();
      return;
    }
    const deleteImageButton = event.target.closest("[data-delete-image]");
    if (deleteImageButton) {
      await removeCardImage(deleteImageButton.dataset.cardId, deleteImageButton.dataset.deleteImage);
      return;
    }
    const imageButton = event.target.closest("[data-card-image]");
    if (imageButton) {
      await openViewer(imageButton.dataset.cardImage, imageButton.dataset.imageIndex);
      return;
    }
    if (event.target === detailBackdrop || event.target.closest(".detail-close")) closeDetail();
    const deleteButton = event.target.closest("[data-detail-delete]");
    if (deleteButton) await removeCard(deleteButton.dataset.detailDelete);
  });
  $("#viewerClose").addEventListener("click", closeViewer);
  $("#viewerPrev").addEventListener("click", () => moveViewer(-1));
  $("#viewerNext").addEventListener("click", () => moveViewer(1));
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) closeViewer();
  });
  $("#channelAvatar").addEventListener("click", (event) => {
    event.stopPropagation();
    setChannelAvatarEditing(!channelAvatarEditing);
  });
  $("#changeChannelAvatar").addEventListener("click", (event) => {
    event.stopPropagation();
    $("#channelAvatarInput").click();
  });
  $("#resetChannelAvatar").addEventListener("click", (event) => {
    event.stopPropagation();
    window.LifeSpaceStorage.saveChannelAvatar(currentChannelId, "");
    renderChannelProfile();
    setChannelAvatarEditing(false);
    showNotice("已恢复为空间主页头像");
  });
  $("#channelAvatarInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      await openChannelCropper(file);
      setChannelAvatarEditing(true);
      $("#channelAvatarTip").hidden = false;
      $("#channelAvatarTip").textContent = "拖动照片调整位置，缩放后点击保存头像。";
    } catch (error) {
      showNotice(error.message || "头像读取失败");
    }
  });
  $("#channelCropZoom").addEventListener("input", (event) => {
    if (!channelCropState) return;
    const previous = channelCropDimensions();
    const centerX = (channelCropState.viewportSize / 2 - channelCropState.offsetX) / previous.width;
    const centerY = (channelCropState.viewportSize / 2 - channelCropState.offsetY) / previous.height;
    channelCropState.zoom = Number(event.target.value);
    const next = channelCropDimensions();
    channelCropState.offsetX = channelCropState.viewportSize / 2 - centerX * next.width;
    channelCropState.offsetY = channelCropState.viewportSize / 2 - centerY * next.height;
    renderChannelCrop();
  });
  $("#channelCropViewport").addEventListener("pointerdown", (event) => {
    if (!channelCropState) return;
    channelCropState.pointerId = event.pointerId;
    channelCropState.startX = event.clientX;
    channelCropState.startY = event.clientY;
    channelCropState.originX = channelCropState.offsetX;
    channelCropState.originY = channelCropState.offsetY;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  });
  $("#channelCropViewport").addEventListener("pointermove", (event) => {
    if (!channelCropState || channelCropState.pointerId !== event.pointerId) return;
    channelCropState.offsetX = channelCropState.originX + event.clientX - channelCropState.startX;
    channelCropState.offsetY = channelCropState.originY + event.clientY - channelCropState.startY;
    renderChannelCrop();
  });
  function endChannelCropDrag(event) {
    if (!channelCropState || channelCropState.pointerId !== event.pointerId) return;
    channelCropState.pointerId = null;
    event.currentTarget.classList.remove("dragging");
  }
  $("#channelCropViewport").addEventListener("pointerup", endChannelCropDrag);
  $("#channelCropViewport").addEventListener("pointercancel", endChannelCropDrag);
  $("#cancelChannelCrop").addEventListener("click", () => {
    closeChannelCropper();
    setChannelAvatarEditing(false);
    showNotice("已取消头像调整");
  });
  $("#applyChannelCrop").addEventListener("click", () => {
    if (!channelCropState) return;
    const dimensions = channelCropDimensions();
    const sourceSize = channelCropState.viewportSize / dimensions.scale;
    const sourceX = -channelCropState.offsetX / dimensions.scale;
    const sourceY = -channelCropState.offsetY / dimensions.scale;
    const outputSize = 800;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    canvas.getContext("2d").drawImage(
      channelCropState.image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      outputSize,
      outputSize
    );
    window.LifeSpaceStorage.saveChannelAvatar(currentChannelId, canvas.toDataURL("image/jpeg", .8));
    closeChannelCropper();
    renderChannelProfile();
    setChannelAvatarEditing(false);
    showNotice("当前频道头像已保存");
  });
  $("#promptCard").addEventListener("click", (event) => {
    if (event.target.closest(".prompt-record-button, #changePromptBackground")) return;
    setPromptEditing(true);
  });
  $("#changePromptBackground").addEventListener("click", () => $("#promptBackgroundInput").click());
  $("#promptBackgroundInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imageData = await prepareLocalImage(file);
      localStorage.setItem(PROMPT_IMAGE_DATA_KEY, imageData);
      if (promptImageUrl) URL.revokeObjectURL(promptImageUrl);
      promptImageUrl = "";
      $("#promptCard").style.backgroundImage = `url("${imageData}")`;
      setPromptEditing(false);
      showNotice("“开始记录”背景已更换");
    } catch (error) {
      showNotice(error.message || "背景图片更换失败");
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".channel-avatar-block")) {
      setChannelAvatarEditing(false);
      if (channelCropState) closeChannelCropper();
    }
    if (!event.target.closest("#promptCard")) setPromptEditing(false);
  });
  $("#openMusicPanel").addEventListener("click", () => {
    $("#musicBackdrop").classList.add("open");
    $("#musicBackdrop").setAttribute("aria-hidden", "false");
  });
  function closeMusicPanel() {
    $("#musicBackdrop").classList.remove("open");
    $("#musicBackdrop").setAttribute("aria-hidden", "true");
  }
  $("#closeMusicPanel").addEventListener("click", closeMusicPanel);
  $("#musicBackdrop").addEventListener("click", (event) => {
    if (event.target === $("#musicBackdrop")) closeMusicPanel();
  });
  $("#musicInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      setMusicStatus("请选择音乐或音频文件");
      return;
    }
    setMusicStatus("正在添加音乐…");
    try {
      const id = `music-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await window.LifeSpaceImageStorage.putMany([{
        id,
        cardId: "__music_library__",
        originalBlob: file,
        fileName: file.name,
        mimeType: file.type,
        mediaKind: "background-music",
        createdAt: new Date().toISOString()
      }]);
      musicLibrary.push({ id, name: file.name });
      musicSettings.trackId = id;
      musicSettings.enabled = true;
      saveMusicState();
      renderMusicLibrary();
      await loadSelectedMusic(true);
    } catch (error) {
      setMusicStatus(error.message || "音乐添加失败");
    }
  });
  $("#musicSelect").addEventListener("change", async (event) => {
    musicSettings.trackId = event.target.value;
    saveMusicState();
    await loadSelectedMusic(true);
  });
  $("#musicEnabled").addEventListener("change", async (event) => {
    if (!musicSettings.trackId) {
      event.target.checked = false;
      setMusicStatus("请先从设备添加音乐");
      return;
    }
    musicSettings.enabled = event.target.checked;
    saveMusicState();
    if (musicSettings.enabled) {
      if (!backgroundMusic.src) await loadSelectedMusic(false);
      try {
        await backgroundMusic.play();
        const track = musicLibrary.find((item) => item.id === musicSettings.trackId);
        setMusicStatus(`正在播放：${track ? track.name : "我的音乐"}`);
      } catch (error) {
        musicSettings.enabled = false;
        event.target.checked = false;
        saveMusicState();
        setMusicStatus("浏览器阻止了播放，请再次点击开关");
      }
    } else {
      backgroundMusic.pause();
      setMusicStatus("当前已关闭");
    }
  });
  $("#musicVolume").addEventListener("input", (event) => {
    musicSettings.volume = Number(event.target.value);
    backgroundMusic.volume = musicSettings.volume / 100;
    $("#musicVolumeValue").value = `${musicSettings.volume}%`;
    saveMusicState();
  });
  detailBackdrop.addEventListener("play", (event) => {
    if (event.target.matches("audio, video") && !backgroundMusic.paused) {
      backgroundMusic.pause();
      setMusicStatus("播放记录媒体时已暂停背景音乐");
    }
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#musicBackdrop").classList.contains("open")) {
      closeMusicPanel();
      return;
    }
    if (viewer.classList.contains("open")) {
      if (event.key === "Escape") closeViewer();
      if (event.key === "ArrowLeft") moveViewer(-1);
      if (event.key === "ArrowRight") moveViewer(1);
      return;
    }
    if (event.key === "Escape") closeDetail();
  });
  window.addEventListener("beforeunload", () => {
    if (musicUrl) URL.revokeObjectURL(musicUrl);
    if (promptImageUrl) URL.revokeObjectURL(promptImageUrl);
  });

  renderChannelChrome();
  renderChannelSwitcher();
  initializeVisitorView();
  initializeMusic();
  loadPromptStyle();
  render();
  const initialId = new URLSearchParams(window.location.search).get("view");
  if (initialId) openDetail(initialId);
})();
