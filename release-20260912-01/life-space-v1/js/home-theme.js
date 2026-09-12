(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const presets = [
    { id: "default", name: "静谧绿意", value: "linear-gradient(135deg, #53684c, #85895e)" },
    { id: "morning", name: "清晨微光", value: "radial-gradient(circle at 22% 20%, rgba(255,246,205,.85), transparent 28%), linear-gradient(135deg, #6f8c7e, #c4a779)" },
    { id: "lake", name: "远山湖色", value: "radial-gradient(circle at 70% 18%, rgba(238,246,235,.46), transparent 30%), linear-gradient(160deg, #365867 0 48%, #739092 49% 67%, #4c6659 68%)" },
    { id: "earth", name: "大地暖意", value: "radial-gradient(circle at 18% 26%, rgba(239,209,159,.35), transparent 28%), linear-gradient(145deg, #785d4d, #a2876a)" },
    { id: "night", name: "深蓝夜色", value: "radial-gradient(circle at 78% 24%, rgba(235,226,186,.52) 0 2%, transparent 3%), linear-gradient(150deg, #263947, #485b68)" },
    { id: "apricot", name: "暖杏午后", value: "radial-gradient(circle at 22% 22%, rgba(255,245,211,.75), transparent 32%), linear-gradient(140deg, #c77f62, #d9ae7b)" },
    { id: "sunset", name: "落日晚霞", value: "radial-gradient(circle at 72% 20%, rgba(255,224,166,.68), transparent 28%), linear-gradient(150deg, #9d5f58, #d58c68 55%, #dcb27c)" },
    { id: "rose", name: "柔粉晨光", value: "radial-gradient(circle at 20% 18%, rgba(255,244,226,.72), transparent 30%), linear-gradient(145deg, #aa6f72, #d7a19a)" }
  ];
  const titlePresets = [
    "欢迎回到我的生命空间",
    "今天，也值得被记住",
    "记录生活，也记录成为自己的过程",
    "在这里，收藏属于我的时间",
    "我的故事，正在慢慢发生"
  ];
  const colors = [
    { id: "deep-green-gray", name: "深绿灰", value: "#263a32", shade: "light" },
    { id: "warm-white", name: "暖白", value: "#fffaf0", shade: "dark" },
    { id: "deep-brown-gray", name: "深棕灰", value: "#493c36", shade: "light" },
    { id: "deep-blue-gray", name: "深蓝灰", value: "#293b49", shade: "light" },
    { id: "terracotta", name: "陶土红", value: "#9b4f3f", shade: "light" },
    { id: "warm-orange", name: "暖橙", value: "#b56c2f", shade: "light" },
    { id: "soft-rose", name: "柔玫瑰", value: "#a65363", shade: "light" },
    { id: "golden-brown", name: "金棕", value: "#957329", shade: "light" }
  ];
  let savedTheme = null;
  let draftTheme = null;
  let backgroundCropState = null;

  function presetById(id) {
    return presets.find((item) => item.id === id) || presets[0];
  }

  function colorById(id) {
    return colors.find((item) => item.id === id) || colors[1];
  }

  function applyTheme(theme) {
    const welcome = $("#homeWelcome");
    const color = colorById(theme.textColor);
    const background = theme.backgroundType === "custom"
      ? `url("${theme.backgroundValue}")`
      : presetById(theme.backgroundValue).value;
    welcome.style.backgroundImage = background;
    welcome.style.color = color.value;
    welcome.dataset.shade = color.shade;
    $(".welcome-shade").style.background = "transparent";
    const textVeil = color.shade === "dark"
      ? "radial-gradient(ellipse at 28% 50%, rgba(22,31,25,.48) 0%, rgba(22,31,25,.32) 38%, rgba(22,31,25,.1) 64%, transparent 82%)"
      : "radial-gradient(ellipse at 28% 50%, rgba(255,250,240,.7) 0%, rgba(255,250,240,.48) 38%, rgba(255,250,240,.14) 64%, transparent 82%)";
    const textShadow = color.shade === "dark"
      ? "0 1px 3px rgba(10,18,12,.5)"
      : "0 1px 3px rgba(255,255,255,.65)";
    $(".welcome-copy").style.background = textVeil;
    $(".welcome-copy").style.setProperty("--welcome-text-shadow", textShadow);
    $("#homeTitle").textContent = theme.title;
    $("#homeDescription").textContent = theme.description;
    const livePreview = $("#themeLivePreview");
    livePreview.style.backgroundImage = background;
    livePreview.style.color = color.value;
    $(".theme-preview-shade").style.background = "transparent";
    $(".theme-preview-copy").style.background = textVeil;
    $(".theme-preview-copy").style.setProperty("--welcome-text-shadow", textShadow);
    $("#themePreviewTitle").textContent = theme.title;
    $("#themePreviewDescription").textContent = theme.description;
  }

  function updateControls() {
    $("#homeTitleInput").value = draftTheme.title;
    $("#homeDescriptionInput").value = draftTheme.description;
    $("#titleCount").textContent = `${draftTheme.title.length} / 20`;
    $("#descriptionCount").textContent = `${draftTheme.description.length} / 60`;
    document.querySelectorAll(".background-option").forEach((button) => {
      button.classList.toggle("selected", draftTheme.backgroundType === "preset" && button.dataset.background === draftTheme.backgroundValue);
    });
    document.querySelectorAll(".color-option").forEach((button) => {
      button.classList.toggle("selected", button.dataset.color === draftTheme.textColor);
    });
  }

  function previewFromInputs() {
    draftTheme.title = $("#homeTitleInput").value;
    draftTheme.description = $("#homeDescriptionInput").value;
    $("#titleCount").textContent = `${draftTheme.title.length} / 20`;
    $("#descriptionCount").textContent = `${draftTheme.description.length} / 60`;
    applyTheme(draftTheme);
  }

  function openDialog() {
    savedTheme = window.LifeSpaceStorage.getHomeTheme();
    draftTheme = Object.assign({}, savedTheme);
    updateControls();
    applyTheme(draftTheme);
    $("#homeThemeDialog").classList.add("open");
    $("#homeThemeDialog").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeDialog(keepPreview) {
    closeBackgroundCropper();
    if (!keepPreview) applyTheme(savedTheme);
    $("#homeThemeDialog").classList.remove("open");
    $("#homeThemeDialog").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    $("#homeBackgroundInput").value = "";
  }

  function loadBackgroundImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const source = URL.createObjectURL(file);
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error("无法识别这张图片，请选择 JPG、PNG 或 WEBP 图片。"));
      };
      image.onload = () => resolve({ image, source });
      image.src = source;
    });
  }

  async function openBackgroundCropper(file) {
    closeBackgroundCropper();
    const loaded = await loadBackgroundImage(file);
    $("#backgroundCropper").hidden = false;
    const viewportWidth = $("#backgroundCropViewport").clientWidth || 320;
    const viewportHeight = $("#backgroundCropViewport").clientHeight || Math.round(viewportWidth * .45);
    const fitScale = Math.max(viewportWidth / loaded.image.naturalWidth, viewportHeight / loaded.image.naturalHeight);
    backgroundCropState = {
      image: loaded.image, source: loaded.source, viewportWidth, viewportHeight,
      fitScale, zoom: 1,
      offsetX: (viewportWidth - loaded.image.naturalWidth * fitScale) / 2,
      offsetY: (viewportHeight - loaded.image.naturalHeight * fitScale) / 2,
      pointerId: null, startX: 0, startY: 0, originX: 0, originY: 0
    };
    $("#backgroundCropZoom").value = "1";
    $("#backgroundCropImage").src = loaded.source;
    renderBackgroundCrop();
    $("#themeLivePreview").classList.add("cropping");
  }

  function backgroundCropDimensions() {
    if (!backgroundCropState) return { width: 0, height: 0, scale: 1 };
    const scale = backgroundCropState.fitScale * backgroundCropState.zoom;
    return {
      scale,
      width: backgroundCropState.image.naturalWidth * scale,
      height: backgroundCropState.image.naturalHeight * scale
    };
  }

  function renderBackgroundCrop() {
    if (!backgroundCropState) return;
    const dimensions = backgroundCropDimensions();
    backgroundCropState.offsetX = Math.min(0, Math.max(backgroundCropState.viewportWidth - dimensions.width, backgroundCropState.offsetX));
    backgroundCropState.offsetY = Math.min(0, Math.max(backgroundCropState.viewportHeight - dimensions.height, backgroundCropState.offsetY));
    const image = $("#backgroundCropImage");
    image.style.width = `${dimensions.width}px`;
    image.style.height = `${dimensions.height}px`;
    image.style.transform = `translate(${backgroundCropState.offsetX}px, ${backgroundCropState.offsetY}px)`;
  }

  $("#backgroundCropZoom").addEventListener("input", (event) => {
    if (!backgroundCropState) return;
    const previous = backgroundCropDimensions();
    const centerX = (backgroundCropState.viewportWidth / 2 - backgroundCropState.offsetX) / previous.width;
    const centerY = (backgroundCropState.viewportHeight / 2 - backgroundCropState.offsetY) / previous.height;
    backgroundCropState.zoom = Number(event.target.value);
    const next = backgroundCropDimensions();
    backgroundCropState.offsetX = backgroundCropState.viewportWidth / 2 - centerX * next.width;
    backgroundCropState.offsetY = backgroundCropState.viewportHeight / 2 - centerY * next.height;
    renderBackgroundCrop();
  });

  $("#backgroundCropViewport").addEventListener("pointerdown", (event) => {
    if (!backgroundCropState) return;
    backgroundCropState.pointerId = event.pointerId;
    backgroundCropState.startX = event.clientX;
    backgroundCropState.startY = event.clientY;
    backgroundCropState.originX = backgroundCropState.offsetX;
    backgroundCropState.originY = backgroundCropState.offsetY;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  });
  $("#backgroundCropViewport").addEventListener("pointermove", (event) => {
    if (!backgroundCropState || backgroundCropState.pointerId !== event.pointerId) return;
    backgroundCropState.offsetX = backgroundCropState.originX + event.clientX - backgroundCropState.startX;
    backgroundCropState.offsetY = backgroundCropState.originY + event.clientY - backgroundCropState.startY;
    renderBackgroundCrop();
  });
  function endBackgroundDrag(event) {
    if (!backgroundCropState || backgroundCropState.pointerId !== event.pointerId) return;
    backgroundCropState.pointerId = null;
    event.currentTarget.classList.remove("dragging");
  }
  $("#backgroundCropViewport").addEventListener("pointerup", endBackgroundDrag);
  $("#backgroundCropViewport").addEventListener("pointercancel", endBackgroundDrag);

  $("#cancelBackgroundCrop").addEventListener("click", () => {
    closeBackgroundCropper();
    $("#uploadStatus").textContent = "已取消，可以重新选择图片。";
  });
  $("#applyBackgroundCrop").addEventListener("click", () => {
    if (!backgroundCropState) return;
    const dimensions = backgroundCropDimensions();
    const sourceWidth = backgroundCropState.viewportWidth / dimensions.scale;
    const sourceHeight = backgroundCropState.viewportHeight / dimensions.scale;
    const sourceX = -backgroundCropState.offsetX / dimensions.scale;
    const sourceY = -backgroundCropState.offsetY / dimensions.scale;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 540;
    canvas.getContext("2d").drawImage(
      backgroundCropState.image,
      sourceX, sourceY, sourceWidth, sourceHeight,
      0, 0, 1200, 540
    );
    draftTheme.backgroundType = "custom";
    draftTheme.backgroundValue = canvas.toDataURL("image/jpeg", .78);
    closeBackgroundCropper();
    updateControls();
    applyTheme(draftTheme);
    $("#uploadStatus").textContent = "裁剪效果已应用，点击底部“保存”后保留。";
  });

  function closeBackgroundCropper() {
    if (backgroundCropState && backgroundCropState.source) URL.revokeObjectURL(backgroundCropState.source);
    backgroundCropState = null;
    $("#backgroundCropper").hidden = true;
    $("#backgroundCropImage").removeAttribute("src");
    $("#themeLivePreview").classList.remove("cropping");
  }

  $("#backgroundOptions").innerHTML = presets.map((preset) => `
    <button class="background-option" type="button" data-background="${preset.id}" style="background-image:${preset.value}" aria-label="使用${preset.name}背景">
      <span>${preset.name}</span>
    </button>
  `).join("");
  $("#homeTitlePreset").innerHTML = `<option value="">选择预设文字</option>${titlePresets.map((title) => `<option value="${title}">${title}</option>`).join("")}`;
  $("#textColorOptions").innerHTML = colors.map((color) => `
    <button class="color-option" type="button" data-color="${color.id}">
      <span class="color-dot" style="background:${color.value}"></span>
      <span>${color.name}</span>
    </button>
  `).join("");

  $("#editHome").addEventListener("click", openDialog);
  $("#closeHomeTheme").addEventListener("click", () => closeDialog(false));
  $("#cancelHomeTheme").addEventListener("click", () => closeDialog(false));
  $("#homeThemeDialog").addEventListener("click", (event) => {
    if (event.target === $("#homeThemeDialog")) closeDialog(false);
  });
  $("#backgroundOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-background]");
    if (!button) return;
    draftTheme.backgroundType = "preset";
    draftTheme.backgroundValue = button.dataset.background;
    updateControls();
    applyTheme(draftTheme);
  });
  $("#textColorOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-color]");
    if (!button) return;
    draftTheme.textColor = button.dataset.color;
    updateControls();
    applyTheme(draftTheme);
  });
  $("#homeTitleInput").addEventListener("input", previewFromInputs);
  $("#homeDescriptionInput").addEventListener("input", previewFromInputs);
  $("#homeTitlePreset").addEventListener("change", (event) => {
    if (!event.target.value) return;
    draftTheme.title = event.target.value.slice(0, 20);
    updateControls();
    applyTheme(draftTheme);
  });
  $("#homeBackgroundInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    $("#uploadStatus").textContent = "正在打开图片调整工具…";
    try {
      await openBackgroundCropper(file);
      $("#uploadStatus").textContent = "请拖动图片并缩放，调整到满意位置。";
    } catch (error) {
      $("#uploadStatus").textContent = error.message;
    }
  });
  $("#resetHomeTheme").addEventListener("click", () => {
    if (!window.confirm("确定恢复首页的默认背景和文字吗？保存后当前设置将被替换。")) return;
    draftTheme = Object.assign({}, window.LifeSpaceDefaults.homeTheme);
    updateControls();
    applyTheme(draftTheme);
  });
  $("#homeThemeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    previewFromInputs();
    savedTheme = window.LifeSpaceStorage.saveHomeTheme(draftTheme);
    applyTheme(savedTheme);
    closeDialog(true);
    $("#notice").textContent = "首页已保存";
    $("#notice").classList.add("show");
    setTimeout(() => $("#notice").classList.remove("show"), 2300);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#homeThemeDialog").classList.contains("open")) closeDialog(false);
  });

  savedTheme = window.LifeSpaceStorage.getHomeTheme();
  applyTheme(savedTheme);
})();
