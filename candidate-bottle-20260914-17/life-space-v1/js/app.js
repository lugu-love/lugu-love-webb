(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const pageParams = new URLSearchParams(window.location.search);
  const embeddedMode = pageParams.get("embedded") === "1";
  const visitorId = pageParams.get("id") || "";
  const visitorMode = pageParams.get("mode") === "visitor";
  const demoVisitor = visitorMode && window.LifeSpaceDemoVisitors
    ? window.LifeSpaceDemoVisitors[visitorId]
    : null;
  const notice = $("#notice");
  let noticeTimer;
  let avatarDraft = "";
  let profileThemeDraft = "quiet-green";
  let profileColorDraft = "auto";
  let cropState = null;
  let homeAvatarEditing = false;
  const earthLink = $(".earth-link");
  if (earthLink && embeddedMode) {
    earthLink.hidden = true;
  }
  const profileThemes = Object.freeze([
    { group: "童趣活泼", id: "candy", name: "彩虹糖果", value: "radial-gradient(circle at 12% 20%,#ffe066 0 7%,transparent 7.5%),radial-gradient(circle at 88% 78%,#7bdff2 0 9%,transparent 9.5%),radial-gradient(circle at 76% 14%,#f7aef8 0 6%,transparent 6.5%),linear-gradient(135deg,#ff8fab,#ffb86c)", ink: "#442d45" },
    { group: "童趣活泼", id: "sky", name: "蓝天白云", value: "radial-gradient(ellipse at 18% 25%,rgba(255,255,255,.86) 0 8%,transparent 8.5%),radial-gradient(ellipse at 25% 28%,rgba(255,255,255,.72) 0 11%,transparent 11.5%),radial-gradient(circle at 84% 18%,#ffe66d 0 8%,transparent 8.5%),linear-gradient(145deg,#76c9ff,#bde8ff)", ink: "#174d70" },
    { group: "童趣活泼", id: "doodle", name: "快乐涂鸦", value: "repeating-radial-gradient(circle at 10% 90%,transparent 0 13px,rgba(255,255,255,.22) 14px 16px),repeating-linear-gradient(45deg,transparent 0 18px,rgba(255,255,255,.14) 19px 21px),linear-gradient(135deg,#7c5cff,#ff5d8f)", ink: "#fff" },
    { group: "青春个性", id: "aurora", name: "极光霓彩", value: "radial-gradient(circle at 18% 18%,rgba(49,245,215,.7),transparent 34%),radial-gradient(circle at 82% 76%,rgba(255,73,192,.66),transparent 38%),linear-gradient(135deg,#3023ae,#6b45d8)", ink: "#fff" },
    { group: "青春个性", id: "ocean", name: "海浪蓝调", value: "radial-gradient(ellipse at 15% 110%,transparent 0 38%,rgba(255,255,255,.18) 39% 43%,transparent 44%),radial-gradient(ellipse at 72% 115%,transparent 0 42%,rgba(255,255,255,.2) 43% 47%,transparent 48%),linear-gradient(145deg,#087fbb,#22b8cf)", ink: "#fff" },
    { group: "青春个性", id: "sunset", name: "落日橘光", value: "radial-gradient(circle at 82% 22%,rgba(255,225,126,.9) 0 9%,transparent 9.5%),linear-gradient(160deg,transparent 0 62%,rgba(103,55,112,.28) 63%),linear-gradient(135deg,#ff8a5b,#df5f8f)", ink: "#fff" },
    { group: "温暖自然", id: "apricot", name: "暖杏花园", value: "radial-gradient(circle at 12% 16%,rgba(255,255,255,.48) 0 3%,transparent 3.5%),radial-gradient(circle at 18% 24%,rgba(255,255,255,.38) 0 4%,transparent 4.5%),radial-gradient(circle at 86% 78%,rgba(130,94,64,.14) 0 16%,transparent 16.5%),linear-gradient(145deg,#f3bd83,#df8f70)", ink: "#523629" },
    { group: "温暖自然", id: "quiet-green", name: "清新枝叶", value: "radial-gradient(ellipse at 92% 12%,rgba(255,255,255,.22) 0 13%,transparent 13.5%),radial-gradient(ellipse at 78% 28%,rgba(255,255,255,.14) 0 10%,transparent 10.5%),linear-gradient(145deg,#4f8f6b,#91b66f)", ink: "#fff" },
    { group: "温暖自然", id: "rose", name: "柔粉花语", value: "radial-gradient(circle at 12% 80%,rgba(255,255,255,.32) 0 5%,transparent 5.5%),radial-gradient(circle at 20% 72%,rgba(255,255,255,.2) 0 8%,transparent 8.5%),linear-gradient(145deg,#d9859c,#efb2a8)", ink: "#55343e" },
    { group: "沉稳雅致", id: "geometry", name: "米色几何", value: "linear-gradient(30deg,rgba(105,91,65,.09) 12%,transparent 12.5% 87%,rgba(105,91,65,.09) 87.5%),linear-gradient(150deg,rgba(105,91,65,.07) 12%,transparent 12.5% 87%,rgba(105,91,65,.07) 87.5%),linear-gradient(135deg,#f1e7d4,#d8c6a6)", ink: "#493f31" },
    { group: "沉稳雅致", id: "night", name: "星夜深蓝", value: "radial-gradient(circle at 15% 22%,rgba(255,255,255,.8) 0 1px,transparent 2px),radial-gradient(circle at 78% 32%,rgba(255,255,255,.7) 0 1.5px,transparent 2.5px),radial-gradient(circle at 64% 76%,rgba(255,255,255,.48) 0 1px,transparent 2px),linear-gradient(145deg,#182d46,#415a77)", ink: "#fff" },
    { group: "沉稳雅致", id: "ink", name: "水墨留白", value: "radial-gradient(ellipse at 85% 25%,rgba(54,66,64,.3),transparent 28%),radial-gradient(ellipse at 18% 82%,rgba(80,92,86,.16),transparent 30%),linear-gradient(145deg,#f3f1eb,#cfd5cf)", ink: "#303936" }
  ]);
  const profileColors = Object.freeze([
    { id: "auto", name: "自动适配", value: "", tone: "auto" },
    { id: "warm-white", name: "暖白", value: "#fffaf0", tone: "light" },
    { id: "sun-yellow", name: "阳光黄", value: "#ffe27a", tone: "light" },
    { id: "soft-pink", name: "柔粉", value: "#ffd1dc", tone: "light" },
    { id: "deep-ink", name: "墨黑", value: "#26302d", tone: "dark" },
    { id: "ocean-blue", name: "海洋蓝", value: "#174d70", tone: "dark" },
    { id: "forest-green", name: "森林绿", value: "#285943", tone: "dark" },
    { id: "wine-red", name: "暖酒红", value: "#743c48", tone: "dark" },
    { id: "cocoa", name: "可可棕", value: "#5b4035", tone: "dark" }
  ]);
  const quotePresets = Object.freeze([
    "今天，也值得被记住",
    "认真生活，就是最好的回答",
    "慢一点，也是在向前走",
    "愿每一次选择都更靠近自己",
    "把平凡的日子过成喜欢的样子",
    "生活的答案，藏在每一个当下",
    "允许一切发生，也相信一切会过去",
    "不必追赶时间，我正在成为自己",
    "保持热爱，奔赴属于我的山海",
    "愿我有勇气改变，也有耐心等待",
    "每一天，都是生命送来的新礼物",
    "走过的路，终会成为生命的光",
    "忠于内心，也温柔地面对世界",
    "我正在书写只属于自己的人生",
    "珍惜眼前，也期待下一次相遇",
    "向内生长，向外看见更大的世界"
  ]);
  const bioPresets = Object.freeze([
    "记录生活，也记录成为自己的过程。",
    "一个认真生活、慢慢认识自己的人。",
    "喜欢旅行、阅读，也喜欢收藏日常的小确幸。",
    "正在学习与世界相处，也学习更好地爱自己。",
    "用照片和文字，留住生命中值得纪念的时刻。",
    "平凡生活的观察者，也是自己故事的书写者。",
    "愿意对世界保持好奇，对生活保持热爱。",
    "在忙碌与安静之间，寻找属于自己的节奏。",
    "喜欢自然、真诚的人，以及一切温暖的事物。",
    "把走过的路、遇见的人和心里的感受收藏在这里。",
    "我不急着成为谁，只想踏实地成为更好的自己。",
    "相信时间的力量，也相信每一次微小的成长。",
    "偶尔迷茫，始终向前，认真感受生命的每一程。",
    "这是我的生命空间，存放回忆、思考和新的开始。",
    "用自己的方式生活，用温柔的眼睛看待世界。",
    "期待在记录中看见变化，也看见真实的自己。"
  ]);
  const channelIcons = Object.freeze({
    heart: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 39S8 30 8 18.5C8 12.7 12.1 9 17 9c3.1 0 5.6 1.5 7 4 1.4-2.5 3.9-4 7-4 4.9 0 9 3.7 9 9.5C40 30 24 39 24 39Z"/></svg>',
    sun: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="8"/><path d="M24 6v6m0 24v6M6 24h6m24 0h6M11.3 11.3l4.2 4.2m17 17 4.2 4.2m0-25.4-4.2 4.2m-17 17-4.2 4.2"/></svg>',
    sprout: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V22m0 5c-8 0-13-5-13-13 8 0 13 5 13 13Zm0-5c0-8 5-13 13-13 0 8-5 13-13 13Z"/><path d="M17 40h14"/></svg>',
    compass: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17"/><path d="m30.5 17.5-4 9-9 4 4-9 9-4Z"/><circle cx="24" cy="24" r="2"/></svg>',
    spark: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 7c1.8 9.4 7.6 15.2 17 17-9.4 1.8-15.2 7.6-17 17-1.8-9.4-7.6-15.2-17-17 9.4-1.8 15.2-7.6 17-17Z"/><path d="M38 7v7M34.5 10.5h7"/></svg>',
    gem: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m9 18 7-9h16l7 9-15 21L9 18Z"/><path d="m16 9 8 30L32 9M9 18h30"/></svg>',
    tree: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V22m0 4-8-7m8 2 8-8m-8 3-5-5"/><path d="M13 22a8 8 0 0 1 4-14 9 9 0 0 1 16 4 8 8 0 0 1 2 15 10 10 0 0 1-11 1 10 10 0 0 1-11-6Z"/><path d="M16 40h16"/></svg>'
  });

  function showNotice(message) {
    notice.textContent = message;
    notice.classList.add("show");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove("show"), 2300);
  }

  function renderProfile() {
    if (demoVisitor) {
      $("#profileName").textContent = demoVisitor.quote;
      $("#profileNickname").textContent = demoVisitor.nickname;
      $("#profileBio").textContent = demoVisitor.bio;
      renderAvatar($("#profileAvatar"), demoVisitor.avatar);
      profileThemeDraft = themeById(demoVisitor.theme).id;
      profileColorDraft = colorById(demoVisitor.textColor).id;
      applyProfileTheme(profileThemeDraft);
      document.body.classList.add("visitor-mode");
      $("#editProfile").hidden = true;
      $("#changeStyle").hidden = true;
      $(".welcome .eyebrow").textContent = "VISITING LIFE SPACE";
      $(".welcome h2").innerHTML = `正在访问<br>${demoVisitor.nickname}的生命空间`;
      const welcomeCopy = $(".welcome > p:last-child");
      if (welcomeCopy) welcomeCopy.textContent = `心星编号 ${demoVisitor.heartStarId} · 这里展示的是 TA 愿意公开的生命记录。`;
      return;
    }
    const profile = window.LifeSpaceStorage.getProfile();
    $("#profileName").textContent = profile.quote;
    $("#profileNickname").textContent = profile.nickname;
    $("#profileBio").textContent = profile.bio;
    $("#nicknameInput").value = profile.nickname;
    $("#quoteInput").value = profile.quote;
    $("#bioInput").value = profile.bio;
    avatarDraft = profile.avatar || "";
    profileThemeDraft = themeById(profile.theme).id;
    profileColorDraft = colorById(profile.textColor).id;
    renderAvatar($("#profileAvatar"), avatarDraft);
    renderAvatar($("#avatarPreview"), avatarDraft);
    applyProfileTheme(profileThemeDraft);
    renderProfileThemeOptions();
    renderProfileColorOptions();
    $("#removeAvatar").disabled = !avatarDraft;
  }

  function themeById(id) {
    return profileThemes.find((theme) => theme.id === id) || profileThemes[0];
  }

  function colorById(id) {
    return profileColors.find((color) => color.id === id) || profileColors[0];
  }

  function applyProfileTheme(id) {
    const theme = themeById(id);
    const color = colorById(profileColorDraft);
    const ink = color.id === "auto" ? theme.ink : color.value;
    const inkTone = color.id === "auto"
      ? (theme.ink === "#fff" ? "light" : "dark")
      : color.tone;
    const card = $(".identity-card");
    card.style.background = theme.value;
    card.style.color = ink;
    card.dataset.theme = theme.id;
    card.dataset.ink = inkTone;
    $(".avatar-editor").style.background = theme.value;
    $(".avatar-editor").style.color = ink;
  }

  function renderProfileThemeOptions() {
    $("#profileThemeOptions").innerHTML = profileThemes.map((theme) => `
      <button class="profile-theme-option${theme.id === profileThemeDraft ? " selected" : ""}" type="button"
        data-profile-theme="${theme.id}" aria-label="${theme.group}：${theme.name}" aria-pressed="${theme.id === profileThemeDraft}">
        <span style="background:${theme.value}"></span><small>${theme.name}</small>
      </button>
    `).join("");
  }

  function renderProfileColorOptions() {
    $("#profileColorOptions").innerHTML = profileColors.map((color) => `
      <button class="profile-color-option${color.id === profileColorDraft ? " selected" : ""}" type="button"
        data-profile-color="${color.id}" aria-pressed="${color.id === profileColorDraft}">
        <span class="${color.id === "auto" ? "auto-color" : ""}" style="${color.value ? `background:${color.value}` : ""}"></span>
        <small>${color.name}</small>
      </button>
    `).join("");
  }

  function renderAvatar(element, source) {
    element.classList.toggle("has-image", Boolean(source));
    element.innerHTML = source ? `<img src="${source}" alt="">` : "<span>生</span>";
  }

  function renderChannels() {
    $("#channelGrid").innerHTML = window.LifeSpaceDefaults.channels.map((channel) => `
      <button class="channel-card ${channel.enabled ? "enabled" : ""}" type="button" data-channel="${channel.id}">
        <span class="channel-icon" aria-hidden="true">${channelIcons[channel.icon] || ""}</span>
        <h3>${channel.name}</h3>
        <p>${channel.description}</p>
      </button>
    `).join("");
  }

  $("#channelGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-channel]");
    if (!button) return;
    const nextParams = new URLSearchParams({ channel: button.dataset.channel });
    nextParams.set("v", "20260728-6");
    if (demoVisitor) {
      nextParams.set("mode", "visitor");
      nextParams.set("id", demoVisitor.id);
    }
    if (embeddedMode) nextParams.set("embedded", "1");
    window.location.href = `channel.html?${nextParams.toString()}`;
  });

  $("#changeStyle").addEventListener("click", () => showNotice("空间风格系统将在后续版本开放。"));
  function setHomeAvatarEditing(isEditing) {
    homeAvatarEditing = Boolean(isEditing && !demoVisitor);
    $("#homeAvatarActions").hidden = !homeAvatarEditing;
    $("#homeAvatarTip").hidden = !homeAvatarEditing;
  }

  function openProfileDialog() {
    renderProfile();
    $("#profileDialog").classList.add("open");
    $("#profileDialog").setAttribute("aria-hidden", "false");
    $("#profileDialog").scrollTop = 0;
  }

  $("#editProfile").addEventListener("click", openProfileDialog);
  $("#profileAvatar").addEventListener("click", (event) => {
    event.stopPropagation();
    setHomeAvatarEditing(!homeAvatarEditing);
  });
  $("#editHomeProfile").addEventListener("click", (event) => {
    event.stopPropagation();
    openProfileDialog();
  });
  $("#changeHomeAvatar").addEventListener("click", (event) => {
    event.stopPropagation();
    openProfileDialog();
    $("#avatarInput").click();
  });
  $("#cancelProfile").addEventListener("click", closeDialog);
  $("#profileDialog").addEventListener("click", (event) => {
    if (event.target === $("#profileDialog")) closeDialog();
  });
  $("#profileForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const saveButton = $("#saveProfile");
    saveButton.disabled = true;
    saveButton.textContent = "正在保存…";
    try {
      window.LifeSpaceStorage.saveProfile({
        nickname: $("#nicknameInput").value,
        quote: $("#quoteInput").value,
        bio: $("#bioInput").value,
        avatar: avatarDraft,
        theme: profileThemeDraft,
        textColor: profileColorDraft
      });
      renderProfile();
      closeDialog();
      setHomeAvatarEditing(false);
      showNotice("头像和资料已保存");
    } catch (error) {
      $("#avatarStatus").textContent = error && error.message
        ? error.message
        : "保存失败，请稍后重试。";
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "保存资料";
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".home-avatar-hero")) setHomeAvatarEditing(false);
  });

  $("#profileThemeOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile-theme]");
    if (!button) return;
    profileThemeDraft = button.dataset.profileTheme;
    applyProfileTheme(profileThemeDraft);
    renderProfileThemeOptions();
  });

  $("#profileColorOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-profile-color]");
    if (!button) return;
    profileColorDraft = button.dataset.profileColor;
    applyProfileTheme(profileThemeDraft);
    renderProfileColorOptions();
  });

  function fillPresetLibrary(select, items, placeholder) {
    select.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) =>
      `<option value="${item}">${item}</option>`
    ).join("");
  }

  fillPresetLibrary($("#quotePreset"), quotePresets, "选择一句喜欢的话");
  fillPresetLibrary($("#bioPreset"), bioPresets, "选择一段自我介绍");
  $("#quotePreset").addEventListener("change", (event) => {
    if (event.target.value) $("#quoteInput").value = event.target.value;
  });
  $("#bioPreset").addEventListener("change", (event) => {
    if (event.target.value) $("#bioInput").value = event.target.value;
  });

  $("#avatarInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      $("#avatarStatus").textContent = "请选择图片文件。";
      return;
    }
    $("#avatarStatus").textContent = "正在打开裁剪工具…";
    try {
      await openCropper(file);
      $("#avatarStatus").textContent = "请拖动和缩放照片，然后确认裁剪。";
    } catch (error) {
      $("#avatarStatus").textContent = "这张图片无法读取，请换一张重试。";
    }
  });

  $("#removeAvatar").addEventListener("click", () => {
    closeCropper();
    avatarDraft = "";
    renderAvatar($("#avatarPreview"), "");
    $("#removeAvatar").disabled = true;
    $("#avatarStatus").textContent = "已恢复默认头像，保存资料后生效。";
  });

  function loadCropImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const source = URL.createObjectURL(file);
      image.onload = () => {
        resolve({ image, source });
      };
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error("invalid image"));
      };
      image.src = source;
    });
  }

  async function openCropper(file) {
    closeCropper();
    const loaded = await loadCropImage(file);
    const viewportSize = 240;
    const fitScale = Math.max(viewportSize / loaded.image.naturalWidth, viewportSize / loaded.image.naturalHeight);
    cropState = {
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
    $("#cropZoom").value = "1";
    $("#cropImage").src = loaded.source;
    $("#avatarCropper").hidden = false;
    renderCrop();
    $("#avatarCropper").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function cropDimensions() {
    if (!cropState) return { width: 0, height: 0, scale: 1 };
    const scale = cropState.fitScale * cropState.zoom;
    return {
      scale,
      width: cropState.image.naturalWidth * scale,
      height: cropState.image.naturalHeight * scale
    };
  }

  function clampCrop() {
    if (!cropState) return;
    const dimensions = cropDimensions();
    cropState.offsetX = Math.min(0, Math.max(cropState.viewportSize - dimensions.width, cropState.offsetX));
    cropState.offsetY = Math.min(0, Math.max(cropState.viewportSize - dimensions.height, cropState.offsetY));
  }

  function renderCrop() {
    if (!cropState) return;
    clampCrop();
    const dimensions = cropDimensions();
    const image = $("#cropImage");
    image.style.width = `${dimensions.width}px`;
    image.style.height = `${dimensions.height}px`;
    image.style.transform = `translate(${cropState.offsetX}px, ${cropState.offsetY}px)`;
  }

  $("#cropZoom").addEventListener("input", (event) => {
    if (!cropState) return;
    const previous = cropDimensions();
    const centerX = (cropState.viewportSize / 2 - cropState.offsetX) / previous.width;
    const centerY = (cropState.viewportSize / 2 - cropState.offsetY) / previous.height;
    cropState.zoom = Number(event.target.value);
    const next = cropDimensions();
    cropState.offsetX = cropState.viewportSize / 2 - centerX * next.width;
    cropState.offsetY = cropState.viewportSize / 2 - centerY * next.height;
    renderCrop();
  });

  $("#cropViewport").addEventListener("pointerdown", (event) => {
    if (!cropState) return;
    cropState.pointerId = event.pointerId;
    cropState.startX = event.clientX;
    cropState.startY = event.clientY;
    cropState.originX = cropState.offsetX;
    cropState.originY = cropState.offsetY;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  });
  $("#cropViewport").addEventListener("pointermove", (event) => {
    if (!cropState || cropState.pointerId !== event.pointerId) return;
    cropState.offsetX = cropState.originX + event.clientX - cropState.startX;
    cropState.offsetY = cropState.originY + event.clientY - cropState.startY;
    renderCrop();
  });
  function endCropDrag(event) {
    if (!cropState || cropState.pointerId !== event.pointerId) return;
    cropState.pointerId = null;
    event.currentTarget.classList.remove("dragging");
  }
  $("#cropViewport").addEventListener("pointerup", endCropDrag);
  $("#cropViewport").addEventListener("pointercancel", endCropDrag);

  $("#cancelCrop").addEventListener("click", () => {
    closeCropper();
    $("#avatarStatus").textContent = "已取消裁剪，可以重新选择照片。";
  });
  $("#applyCrop").addEventListener("click", () => {
    if (!cropState) return;
    const dimensions = cropDimensions();
    const sourceSize = cropState.viewportSize / dimensions.scale;
    const sourceX = -cropState.offsetX / dimensions.scale;
    const sourceY = -cropState.offsetY / dimensions.scale;
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    canvas.getContext("2d").drawImage(
      cropState.image,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, 320, 320
    );
    avatarDraft = canvas.toDataURL("image/jpeg", .8);
    renderAvatar($("#avatarPreview"), avatarDraft);
    $("#removeAvatar").disabled = false;
    closeCropper();
    $("#avatarStatus").textContent = "裁剪完成，点击“保存资料”后生效。";
    $("#saveProfile").scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  function closeCropper() {
    if (cropState && cropState.source) URL.revokeObjectURL(cropState.source);
    cropState = null;
    $("#avatarCropper").hidden = true;
    $("#cropImage").removeAttribute("src");
  }

  function closeDialog() {
    closeCropper();
    const savedProfile = window.LifeSpaceStorage.getProfile();
    profileColorDraft = colorById(savedProfile.textColor).id;
    applyProfileTheme(savedProfile.theme);
    $("#profileDialog").classList.remove("open");
    $("#profileDialog").setAttribute("aria-hidden", "true");
  }

  renderChannels();
  renderProfile();
})();
