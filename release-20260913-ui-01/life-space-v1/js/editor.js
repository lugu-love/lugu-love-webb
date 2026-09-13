(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(window.location.search);
  const editingId = params.get("id");
  const channels = Array.isArray(window.LifeSpaceDefaults && window.LifeSpaceDefaults.channels)
    ? window.LifeSpaceDefaults.channels
    : [];
  let currentChannelId = params.get("channel") || "life";
  let currentChannel = channels.find((channel) => channel.id === currentChannelId)
    || channels.find((channel) => channel.id === "life")
    || { id: "life", name: "我的生活" };
  currentChannelId = currentChannel.id;
  const MAX_IMAGES = 18;
  const layouts = [
    { id: "auto", name: "自动排版", hint: "系统会根据图片数量选择合适的组合。" },
    { id: "hero", name: "一张大图", hint: "列表突出第一张照片，其余照片进入详情后浏览。" },
    { id: "hero-2", name: "主图＋两张小图", hint: "适合 3 张及以上图片。" },
    { id: "hero-4", name: "主图＋四张小图", hint: "适合 5 张及以上图片。" },
    { id: "grid", name: "网格组合", hint: "图片会形成整齐的两图、四宫格或九宫格。" }
  ];
  const templates = [
    { id: "a", name: "A 沉浸大图", hint: "适合一张重点照片、旅行、风景和纪念。" },
    { id: "b", name: "B 左图右文", hint: "适合图片与短文字并重的生活记录。" },
    { id: "c", name: "C 一大两小", hint: "适合三张照片的日常、家庭和聚会。" },
    { id: "d", name: "D 杂志版", hint: "适合有标题和正文的完整故事。" },
    { id: "e", name: "E 日记版", hint: "适合成长、感悟、心情和纯文字记录。" },
    { id: "f", name: "F 拼贴版", hint: "适合五张以上图片的旅行相册。" }
  ];
  const textPapers = [
    { id: "plain", name: "暖白素纸", value: "linear-gradient(#fffdf8,#fffdf8)" },
    { id: "cream-lines", name: "米色横线", value: "repeating-linear-gradient(#f7efdd 0 22px,#dfcfb3 23px,#f7efdd 24px)" },
    { id: "blue-grid", name: "浅蓝方格", value: "linear-gradient(rgba(83,139,170,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(83,139,170,.14) 1px,transparent 1px),#eef7fa" },
    { id: "pink-dots", name: "粉色圆点", value: "radial-gradient(circle,rgba(183,92,120,.22) 1.5px,transparent 2px),#fff0f3" },
    { id: "leaf", name: "清新花叶", value: "radial-gradient(ellipse at 90% 12%,rgba(81,133,91,.2) 0 10%,transparent 10.5%),radial-gradient(ellipse at 78% 25%,rgba(81,133,91,.13) 0 8%,transparent 8.5%),#edf5e9" },
    { id: "sunshine", name: "阳光纸张", value: "radial-gradient(circle at 88% 14%,rgba(255,190,61,.38) 0 9%,transparent 9.5%),#fff7d6" },
    { id: "stars", name: "紫色星光", value: "radial-gradient(circle at 15% 18%,rgba(255,255,255,.7) 0 1px,transparent 2px),radial-gradient(circle at 82% 30%,rgba(255,255,255,.55) 0 1.5px,transparent 2.5px),linear-gradient(145deg,#ddd2f1,#bba9df)" },
    { id: "kraft", name: "牛皮纸", value: "repeating-linear-gradient(25deg,rgba(86,61,33,.035) 0 1px,transparent 1px 5px),#d8ba87" },
    { id: "ink-wash", name: "水墨留白", value: "radial-gradient(ellipse at 88% 20%,rgba(58,70,66,.22),transparent 28%),radial-gradient(ellipse at 12% 84%,rgba(70,82,76,.12),transparent 30%),#f0f1ed" },
    { id: "rainbow", name: "彩虹柔光", value: "radial-gradient(circle at 10% 15%,rgba(255,132,164,.28),transparent 28%),radial-gradient(circle at 90% 80%,rgba(91,196,222,.3),transparent 30%),#fff8e9" }
  ];
  let imageItems = [];
  let removedImageIds = [];
  let videoItem = null;
  let voiceItem = null;
  let removedMediaIds = [];
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingChunks = [];
  let originalCard = null;
  let selectedLayout = "auto";
  let selectedLayoutCount = 0;
  let selectedLayoutVariant = "";
  let selectedTemplate = "";
  let templateTouched = false;
  let activeTool = "images";
  let previewRenderTimer = 0;
  let dragState = null;
  let framingIndex = -1;
  let framingDrag = null;
  let draftCard = {
    id: editingId || `draft-${Date.now()}`,
    channelId: currentChannelId,
    title: "",
    subtitle: "",
    content: "",
    images: [],
    imageLayout: "auto",
    templateId: "",
    visualTemplate: "",
    titleColor: "#293a33",
    contentColor: "#626a63",
    cardStyle: "soft",
    borderStyle: "fine",
    textPaper: "plain",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    location: "",
    visibility: "private"
  };

  function toLocalInputValue(iso) {
    const date = iso ? new Date(iso) : new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
  }

  function currentVisibility() {
    const selected = document.querySelector('input[name="visibility"]:checked');
    return selected && ["private", "invite", "public"].includes(selected.value) ? selected.value : "private";
  }

  function setVisibility(value) {
    const safeValue = ["private", "invite", "public"].includes(value) ? value : "private";
    const input = document.querySelector(`input[name="visibility"][value="${safeValue}"]`);
    if (input) input.checked = true;
  }

  function channelUrl(extraParams) {
    const nextParams = new URLSearchParams({ channel: currentChannelId });
    if (extraParams) {
      Object.keys(extraParams).forEach((key) => {
        if (extraParams[key]) nextParams.set(key, extraParams[key]);
      });
    }
    return `channel.html?${nextParams.toString()}`;
  }

  function applyEditorChannelChrome() {
    document.querySelectorAll(".editor-nav a, .cancel-button").forEach((link) => {
      link.href = channelUrl();
    });
  }

  function recommendedTemplate() {
    if (imageItems.length >= 5) return "f";
    if (imageItems.length === 3 || imageItems.length === 4) return "c";
    if (imageItems.length === 2) return "b";
    if (imageItems.length === 1) return "a";
    return "e";
  }

  function activePreviewItems() {
    return dragState && dragState.previewItems ? dragState.previewItems : imageItems;
  }

  function previewImages() {
    return activePreviewItems().map((item, index) => ({
      src: item.previewUrl,
      index,
      editable: true,
      positionX: Number.isFinite(Number(item.positionX)) ? Number(item.positionX) : 50,
      positionY: Number.isFinite(Number(item.positionY)) ? Number(item.positionY) : 50
    }));
  }

  function fitPreviewCard() {
    const stage = $(".preview-stage");
    const frame = $("#lifeCardPreview");
    const card = frame && frame.firstElementChild;
    if (!stage || !frame || !card) return;
    frame.style.setProperty("--preview-scale", "1");
    const availableWidth = Math.max(1, stage.clientWidth - 12);
    const availableHeight = Math.max(1, stage.clientHeight - 12);
    const scale = activeTool === "text"
      ? Math.min(1, availableWidth / frame.offsetWidth)
      : Math.min(1, availableWidth / frame.offsetWidth, availableHeight / card.scrollHeight);
    frame.style.setProperty("--preview-scale", String(Math.max(.32, scale)));
  }

  function bindDirectTextEditing() {
    const fieldMap = {
      title: $("#titleInput"),
      subtitle: $("#subtitleInput"),
      content: $("#contentInput")
    };
    document.querySelectorAll("#lifeCardPreview [data-direct-field]").forEach((element) => {
      const field = element.dataset.directField;
      element.addEventListener("input", () => {
        const limit = Number(fieldMap[field].maxLength) || 5000;
        let value = element.innerText.replace(/\u00a0/g, " ");
        if (value.length > limit) {
          value = value.slice(0, limit);
          element.innerText = value;
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        fieldMap[field].value = value;
        draftCard[field] = value;
      });
      element.addEventListener("keydown", (event) => {
        if ((field === "title" || field === "subtitle") && event.key === "Enter") {
          event.preventDefault();
          element.blur();
        }
      });
    });
  }

  function renderLivePreview() {
    draftCard.updatedAt = new Date().toISOString();
    draftCard.images = activePreviewItems().map((item, index) => ({ id: item.id, order: index }));
    draftCard.imageLayout = selectedLayout;
    draftCard.templateId = selectedTemplate || recommendedTemplate();
    draftCard.visualTemplate = draftCard.templateId;
    const images = previewImages();
    const html = window.LifeCardRenderer.render(draftCard, images, {
      template: draftCard.templateId,
      interactive: false,
      mode: "editor",
      focus: activeTool === "images" || activeTool === "text" || activeTool === "manage" ? activeTool : ""
    });
    const fullHtml = window.LifeCardRenderer.render(draftCard, images, {
      template: draftCard.templateId,
      interactive: false,
      mode: "full"
    });
    $("#lifeCardPreview").innerHTML = html;
    $("#fullLifeCardPreview").innerHTML = fullHtml;
    bindDirectTextEditing();
    requestAnimationFrame(fitPreviewCard);
  }

  function scheduleLivePreview(delay) {
    window.clearTimeout(previewRenderTimer);
    previewRenderTimer = window.setTimeout(renderLivePreview, delay || 0);
  }

  function renderTemplates() {
    if (!selectedTemplate) selectedTemplate = recommendedTemplate();
    draftCard.templateId = selectedTemplate;
    draftCard.visualTemplate = selectedTemplate;
    const templateOptions = $("#templateOptions");
    const templateHint = $("#templateHint");
    if (templateOptions) {
      templateOptions.innerHTML = templates.map((template) => `
        <button class="template-option ${template.id === selectedTemplate ? "selected" : ""}" type="button" data-template="${template.id}">
          <span class="template-mini template-mini-${template.id}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
          <span>${template.name}</span>
        </button>
      `).join("");
    }
    if (templateHint) templateHint.textContent = templates.find((template) => template.id === selectedTemplate).hint;
    const countOptions = [
      { count: 0, name: "零图" }, { count: 1, name: "一张" },
      { count: 2, name: "两张" }, { count: 2, name: "两张横排", variant: "two-horizontal" },
      { count: 3, name: "三张" }, { count: 4, name: "四张" },
      { count: 5, name: "五张" }, { count: 6, name: "六张" },
      { count: 9, name: "九张" }
    ];
    $("#quickTemplateOptions").innerHTML = countOptions.map((option) => `
      <button class="${selectedLayoutCount === option.count && selectedLayoutVariant === (option.variant || "") ? "selected" : ""}" type="button"
        data-quick-layout-count="${option.count}" data-layout-variant="${option.variant || ""}">
        <span class="quick-template-icon count-${option.count}" aria-hidden="true">${option.count === 0 ? "<b>文</b>" : Array.from({ length: option.count }, () => "<i></i>").join("")}</span>
        <span>${option.name}</span>
      </button>
    `).join("");
    scheduleLivePreview();
  }

  function renderTextPapers() {
    $("#textPaperOptions").innerHTML = textPapers.map((paper) => `
      <label class="text-paper-option${draftCard.textPaper === paper.id ? " selected" : ""}">
        <input class="visually-hidden" type="radio" name="textPaper" value="${paper.id}"
          ${draftCard.textPaper === paper.id ? "checked" : ""}>
        <span class="text-paper-swatch" style="background:${paper.value}"></span>
        <small>${paper.name}</small>
      </label>
    `).join("");
  }

  function layoutPreviewClass() {
    if (selectedLayout === "auto") {
      if (imageItems.length === 3) return "hero-2";
      if (imageItems.length >= 5) return "hero-4";
      return "grid";
    }
    if (selectedLayout === "hero-2" && imageItems.length < 3) return "grid";
    if (selectedLayout === "hero-4" && imageItems.length < 5) return "grid";
    return selectedLayout;
  }

  function applyLayoutCount(count, variant) {
    selectedLayoutCount = count;
    selectedLayoutVariant = variant || "";
    selectedLayout = count === 1
      ? "hero"
      : count === 3 ? "hero-2"
      : count === 5 ? "hero-4" : "grid";
    selectedTemplate = count === 0
      ? "e"
      : count === 1
      ? "c"
      : count <= 4 ? "c" : "f";
    templateTouched = true;
    draftCard.imageLayoutCount = count;
    draftCard.imageLayoutVariant = selectedLayoutVariant;
  }

  function removeDraftItem(item) {
    if (item && item.id && item.isStored) removedImageIds.push(item.id);
    if (item && item.previewUrl && !item.isLegacy) URL.revokeObjectURL(item.previewUrl);
  }

  function createMediaItem(blob, fileName, kind) {
    return {
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      blob,
      fileName: fileName || `${kind}-${Date.now()}`,
      mimeType: blob.type || (kind === "video" ? "video/mp4" : "audio/webm"),
      previewUrl: URL.createObjectURL(blob),
      isStored: false
    };
  }

  function renderMediaItem(kind) {
    const item = kind === "video" ? videoItem : voiceItem;
    const preview = kind === "video" ? $("#videoPreview") : $("#audioPreview");
    const removeButton = kind === "video" ? $("#removeVideo") : $("#removeAudio");
    preview.hidden = !item;
    removeButton.hidden = !item;
    if (item) preview.src = item.previewUrl;
    else {
      preview.pause();
      preview.removeAttribute("src");
      preview.load();
    }
  }

  function replaceMediaItem(kind, nextItem) {
    const current = kind === "video" ? videoItem : voiceItem;
    if (current) {
      if (current.isStored && current.id) removedMediaIds.push(current.id);
      if (current.previewUrl) URL.revokeObjectURL(current.previewUrl);
    }
    if (kind === "video") videoItem = nextItem;
    else voiceItem = nextItem;
    renderMediaItem(kind);
  }

  async function loadStoredMedia(meta, kind) {
    if (!meta || !meta.id) return null;
    const record = await window.LifeSpaceImageStorage.get(meta.id);
    if (!record || !record.originalBlob) return null;
    return {
      id: meta.id,
      blob: record.originalBlob,
      fileName: meta.fileName || record.fileName || `${kind}文件`,
      mimeType: meta.mimeType || record.mimeType || record.originalBlob.type,
      previewUrl: URL.createObjectURL(record.originalBlob),
      isStored: true
    };
  }

  function mediaRecord(item, cardId, kind) {
    if (!item || item.isStored) return null;
    return {
      id: item.id,
      cardId,
      originalBlob: item.blob,
      fileName: item.fileName,
      mimeType: item.mimeType,
      mediaKind: kind,
      createdAt: new Date().toISOString()
    };
  }

  function renderImages() {
    const hasImages = imageItems.length > 0;
    $("#selectedHeading").hidden = !hasImages;
    $("#selectedCount").textContent = `已选择 ${imageItems.length} 张图片`;
    const panelImageCount = $("#panelImageCount");
    if (panelImageCount) {
      const targetCount = !editingId ? selectedLayoutCount : MAX_IMAGES;
      panelImageCount.textContent = `${imageItems.length} / ${targetCount}`;
    }
    $("#imageOrderList").innerHTML = imageItems.map((item, index) => `
      <div class="image-order-card" data-drag-index="${index}">
        <div class="order-thumbnail">
          <img src="${item.previewUrl}" alt="第 ${index + 1} 张图片顺序预览" draggable="false"
            style="object-position:${Number.isFinite(Number(item.positionX)) ? Number(item.positionX) : 50}% ${Number.isFinite(Number(item.positionY)) ? Number(item.positionY) : 50}%">
          <span>${index === 0 ? "主图" : `第 ${index + 1} 张`}</span>
        </div>
        <div class="order-actions">
          <button type="button" data-move-index="${index}" data-move-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="将第 ${index + 1} 张图片前移">← 前移</button>
          <button type="button" data-move-index="${index}" data-move-direction="1" ${index === imageItems.length - 1 ? "disabled" : ""} aria-label="将第 ${index + 1} 张图片后移">后移 →</button>
          <button class="order-remove" type="button" data-remove-index="${index}" aria-label="删除第 ${index + 1} 张图片">删除</button>
        </div>
      </div>
    `).join("");
    scheduleLivePreview();
  }

  function renderLayouts() {
    draftCard.imageLayout = selectedLayout;
    $("#layoutOptions").innerHTML = layouts.map((layout) => `
      <button class="layout-option ${layout.id === selectedLayout ? "selected" : ""}" type="button" data-layout="${layout.id}">
        <span class="layout-icon layout-icon-${layout.id}" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        <span>${layout.name}</span>
      </button>
    `).join("");
    $("#layoutHint").textContent = layouts.find((layout) => layout.id === selectedLayout).hint;
    scheduleLivePreview();
  }

  async function addFiles(files) {
    const countLimit = !editingId ? selectedLayoutCount : MAX_IMAGES;
    const available = countLimit - imageItems.length;
    const selected = Array.from(files).slice(0, available);
    if (!selected.length) {
      $("#formMessage").textContent = imageItems.length >= countLimit
        ? `当前选择的是“${countLimit}张”布局，只能添加 ${countLimit} 张图片。`
        : "";
      return;
    }
    $("#formMessage").textContent = files.length > available
      ? `当前布局只能添加 ${countLimit} 张图片，已忽略多出的 ${files.length - available} 张。`
      : "";
    for (let index = 0; index < selected.length; index += 1) {
      const file = selected[index];
      $("#uploadProgress").textContent = `正在处理 ${index + 1} / ${selected.length}：${file.name}`;
      await nextPaint();
      try {
        const id = window.LifeSpaceImageStorage.createId();
        const assets = await window.LifeSpaceImageStorage.createAssetsFromFile(file, {
          id,
          cardId: editingId || "",
          order: imageItems.length
        });
        imageItems.push({
          id,
          assets,
          previewUrl: URL.createObjectURL(assets.previewBlob),
          positionX: 50,
          positionY: 50,
          isNew: true
        });
        renderImages();
        if (!templateTouched) {
          selectedTemplate = recommendedTemplate();
          renderTemplates();
        }
      } catch (error) {
        $("#formMessage").textContent = `${file.name} 处理失败：${error.message} 其他图片仍可继续使用。`;
      }
    }
    $("#uploadProgress").textContent = `图片处理完成，共 ${imageItems.length} 张。`;
  }

  async function loadExistingImages(card) {
    const sourceImages = Array.isArray(card.images) ? card.images : [];
    for (let index = 0; index < sourceImages.length; index += 1) {
      const image = sourceImages[index];
      if (typeof image === "string" && image.startsWith("data:image/")) {
        imageItems.push({ id: "", legacyData: image, previewUrl: image, positionX: 50, positionY: 50, isLegacy: true });
        continue;
      }
      const id = typeof image === "string" ? image : image && image.id;
      if (!id) continue;
      const record = await window.LifeSpaceImageStorage.get(id);
      if (!record) continue;
      imageItems.push({
        id,
        previewUrl: URL.createObjectURL(record.previewBlob),
        positionX: typeof image === "object" && Number.isFinite(Number(image.positionX)) ? Number(image.positionX) : 50,
        positionY: typeof image === "object" && Number.isFinite(Number(image.positionY)) ? Number(image.positionY) : 50,
        isStored: true
      });
    }
    renderImages();
  }

  async function prepareRecords(cardId) {
    const records = [];
    for (let index = 0; index < imageItems.length; index += 1) {
      const item = imageItems[index];
      if (item.isStored) continue;
      if (item.isLegacy) {
        const id = window.LifeSpaceImageStorage.createId();
        $("#uploadProgress").textContent = `正在整理旧图片 ${index + 1} / ${imageItems.length}`;
        await nextPaint();
        item.id = id;
        item.assets = await window.LifeSpaceImageStorage.createAssetsFromLegacy(item.legacyData, {
          id, cardId, order: index, fileName: "legacy-image.jpg"
        });
      }
      item.assets.cardId = cardId;
      item.assets.order = index;
      records.push(item.assets);
    }
    return records;
  }

  $("#layoutOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-layout]");
    if (!button) return;
    selectedLayout = button.dataset.layout;
    renderLayouts();
    renderImages();
  });
  if ($("#templateOptions")) {
    $("#templateOptions").addEventListener("click", (event) => {
      const button = event.target.closest("[data-template]");
      if (!button) return;
      selectedTemplate = button.dataset.template;
      templateTouched = true;
      renderTemplates();
    });
  }
  $("#quickTemplateOptions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-layout-count]");
    if (!button) return;
    const nextCount = Number(button.dataset.quickLayoutCount);
    applyLayoutCount(nextCount, button.dataset.layoutVariant);
    if (!editingId && imageItems.length > nextCount) {
      const removedItems = imageItems.splice(nextCount);
      removedItems.forEach(removeDraftItem);
      $("#formMessage").textContent = `已切换为“${nextCount}张”布局，只保留前 ${nextCount} 张图片。`;
    }
    renderLayouts();
    renderImages();
    renderTemplates();
  });
  $("#textPaperOptions").addEventListener("change", (event) => {
    const input = event.target.closest('input[name="textPaper"]');
    if (!input || !textPapers.some((paper) => paper.id === input.value)) return;
    draftCard.textPaper = input.value;
    renderTextPapers();
    renderLivePreview();
  });
  $("#imageOrderList").addEventListener("click", (event) => {
    const moveButton = event.target.closest("[data-move-index]");
    if (moveButton) {
      const index = Number(moveButton.dataset.moveIndex);
      const targetIndex = index + Number(moveButton.dataset.moveDirection);
      if (targetIndex < 0 || targetIndex >= imageItems.length) return;
      [imageItems[index], imageItems[targetIndex]] = [imageItems[targetIndex], imageItems[index]];
      renderImages();
      $("#uploadProgress").textContent = `顺序已调整，第 1 张将作为主图。`;
      return;
    }
    const removeButton = event.target.closest("[data-remove-index]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.removeIndex);
    const removed = imageItems.splice(index, 1)[0];
    removeDraftItem(removed);
    if (editingId && imageItems.length >= 0 && imageItems.length <= 6) {
      applyLayoutCount(imageItems.length);
      $("#uploadProgress").textContent = imageItems.length
        ? `剩余 ${imageItems.length} 张图片，已自动切换为“${imageItems.length}张”布局。`
        : "图片已全部删除，已自动切换为“零图”纯文字布局。";
      renderLayouts();
      renderTemplates();
    }
    renderImages();
    if (!templateTouched) {
      selectedTemplate = recommendedTemplate();
      renderTemplates();
    }
  });

  function updateFramingPreview() {
    const item = imageItems[framingIndex];
    if (!item) return;
    item.positionX = Number.isFinite(Number(item.positionX)) ? Math.max(0, Math.min(100, Number(item.positionX))) : 50;
    item.positionY = Number.isFinite(Number(item.positionY)) ? Math.max(0, Math.min(100, Number(item.positionY))) : 50;
    const image = $("#framingImage");
    image.src = item.previewUrl;
    image.style.objectPosition = `${item.positionX}% ${item.positionY}%`;
    $("#framingX").value = item.positionX;
    $("#framingY").value = item.positionY;
    $("#framingPosition").textContent = `水平 ${Math.round(item.positionX)}% · 垂直 ${Math.round(item.positionY)}%`;
  }

  function setFramingPosition(x, y) {
    const item = imageItems[framingIndex];
    if (!item) return;
    item.positionX = Math.max(0, Math.min(100, Number(x)));
    item.positionY = Math.max(0, Math.min(100, Number(y)));
    updateFramingPreview();
    scheduleLivePreview();
  }

  function openFramingEditor(index) {
    if (!Number.isInteger(index) || !imageItems[index]) return;
    framingIndex = index;
    $("#framingTitle").textContent = `调整第 ${index + 1} 张照片`;
    updateFramingPreview();
    $("#framingBackdrop").classList.add("open");
    $("#framingBackdrop").setAttribute("aria-hidden", "false");
  }

  function closeFramingEditor() {
    $("#framingBackdrop").classList.remove("open");
    $("#framingBackdrop").setAttribute("aria-hidden", "true");
    framingIndex = -1;
  }

  document.addEventListener("click", (event) => {
    const frame = event.target.closest("[data-frame-edit]");
    if (frame) {
      openFramingEditor(Number(frame.dataset.frameEdit));
      return;
    }
    const move = event.target.closest("[data-frame-move]");
    if (move && framingIndex >= 0) {
      const item = imageItems[framingIndex];
      const step = 10;
      if (move.dataset.frameMove === "left") item.positionX -= step;
      if (move.dataset.frameMove === "right") item.positionX += step;
      if (move.dataset.frameMove === "up") item.positionY -= step;
      if (move.dataset.frameMove === "down") item.positionY += step;
      if (move.dataset.frameMove === "center") {
        item.positionX = 50;
        item.positionY = 50;
      }
      setFramingPosition(item.positionX, item.positionY);
      return;
    }
    if (event.target.closest("[data-frame-close]") || event.target === $("#framingBackdrop")) closeFramingEditor();
  });

  $("#framingX").addEventListener("input", (event) => {
    const item = imageItems[framingIndex];
    if (item) setFramingPosition(event.target.value, item.positionY);
  });
  $("#framingY").addEventListener("input", (event) => {
    const item = imageItems[framingIndex];
    if (item) setFramingPosition(item.positionX, event.target.value);
  });
  $("#framingImage").addEventListener("pointerdown", (event) => {
    const item = imageItems[framingIndex];
    if (!item) return;
    framingDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      positionX: item.positionX,
      positionY: item.positionY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add("dragging");
  });
  $("#framingImage").addEventListener("pointermove", (event) => {
    if (!framingDrag || framingDrag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const stage = event.currentTarget.parentElement.getBoundingClientRect();
    const deltaX = (event.clientX - framingDrag.startX) / Math.max(1, stage.width) * 100;
    const deltaY = (event.clientY - framingDrag.startY) / Math.max(1, stage.height) * 100;
    setFramingPosition(framingDrag.positionX - deltaX, framingDrag.positionY - deltaY);
  });
  function finishFramingDrag(event) {
    if (!framingDrag || framingDrag.pointerId !== event.pointerId) return;
    event.currentTarget.classList.remove("dragging");
    framingDrag = null;
    renderLivePreview();
  }
  $("#framingImage").addEventListener("pointerup", finishFramingDrag);
  $("#framingImage").addEventListener("pointercancel", finishFramingDrag);
  $("#imageInput").addEventListener("change", async (event) => {
    await addFiles(event.target.files);
    event.target.value = "";
  });

  $("#videoInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      $("#videoStatus").textContent = "请选择视频文件。";
      return;
    }
    replaceMediaItem("video", createMediaItem(file, file.name, "video"));
    $("#videoStatus").textContent = `已选择“${file.name}”，保存记录后生效。`;
  });

  $("#audioInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("audio/")) {
      $("#audioStatus").textContent = "请选择音频文件。";
      return;
    }
    replaceMediaItem("voice", createMediaItem(file, file.name, "voice"));
    $("#audioStatus").textContent = `已选择“${file.name}”，可以先试听。`;
  });

  $("#removeVideo").addEventListener("click", () => {
    replaceMediaItem("video", null);
    $("#videoStatus").textContent = "视频已移除，保存记录后生效。";
  });
  $("#removeAudio").addEventListener("click", () => {
    replaceMediaItem("voice", null);
    $("#audioStatus").textContent = "语音已移除，保存记录后生效。";
  });

  $("#startRecording").addEventListener("click", async () => {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      $("#audioStatus").textContent = "当前浏览器不支持直接录音，请使用“上传音频”。";
      return;
    }
    try {
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingChunks = [];
      mediaRecorder = new MediaRecorder(recordingStream);
      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size) recordingChunks.push(event.data);
      });
      mediaRecorder.addEventListener("stop", () => {
        const mimeType = mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(recordingChunks, { type: mimeType });
        replaceMediaItem("voice", createMediaItem(blob, `现场录音-${new Date().toLocaleString("zh-CN")}`, "voice"));
        recordingStream.getTracks().forEach((track) => track.stop());
        recordingStream = null;
        mediaRecorder = null;
        $("#startRecording").disabled = false;
        $("#stopRecording").disabled = true;
        $("#audioStatus").textContent = "录音完成，可以试听；保存记录后生效。";
      });
      mediaRecorder.start();
      $("#startRecording").disabled = true;
      $("#stopRecording").disabled = false;
      $("#audioStatus").textContent = "正在录音…完成后请点击“停止”。";
    } catch (error) {
      $("#audioStatus").textContent = "无法开始录音，请检查麦克风权限后重试。";
    }
  });

  $("#stopRecording").addEventListener("click", () => {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  });

  function syncDraftText() {
    draftCard.title = $("#titleInput").value;
    draftCard.subtitle = $("#subtitleInput").value;
    draftCard.content = $("#contentInput").value;
    draftCard.location = $("#locationInput").value.trim().slice(0, 60);
    draftCard.visibility = currentVisibility();
    const rawDate = $("#dateInput").value;
    if (rawDate && !Number.isNaN(new Date(rawDate).getTime())) draftCard.createdAt = new Date(rawDate).toISOString();
    scheduleLivePreview(55);
  }

  ["#titleInput", "#subtitleInput", "#contentInput", "#dateInput", "#locationInput"].forEach((selector) => {
    $(selector).addEventListener("input", syncDraftText);
  });
  document.querySelectorAll('input[name="visibility"]').forEach((input) => input.addEventListener("change", syncDraftText));

  $("#textFileInput").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const extension = file.name.split(".").pop().toLowerCase();
    if (!["txt", "text", "md", "markdown", "html", "htm"].includes(extension)) {
      $("#formMessage").textContent = "目前支持 TXT、Markdown 和 HTML 文字文件。";
      return;
    }
    try {
      let importedText = await file.text();
      if (extension === "html" || extension === "htm") {
        importedText = new DOMParser().parseFromString(importedText, "text/html").body.innerText;
      }
      importedText = importedText.replace(/\r\n?/g, "\n").trim().slice(0, 5000);
      if (!importedText) {
        $("#formMessage").textContent = "这个文件没有可导入的文字内容。";
        return;
      }
      $("#contentInput").value = importedText;
      $("#formMessage").textContent = importedText.length >= 5000
        ? "文件已导入正文，内容较长，已保留前 5000 个字。"
        : `已从“${file.name}”导入正文，可继续修改。`;
      syncDraftText();
      $("#contentInput").scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) {
      $("#formMessage").textContent = "文件读取失败，请换一个文字文件重试。";
    }
  });

  document.querySelectorAll("[data-style-field]").forEach((button) => {
    button.addEventListener("click", () => {
      const field = button.dataset.styleField;
      draftCard[field] = button.dataset.styleValue;
      if (field === "cardStyle" && button.dataset.styleValue === "dark") {
        if (draftCard.titleColor === "#293a33") draftCard.titleColor = "#f8f5ec";
        if (draftCard.contentColor === "#626a63") draftCard.contentColor = "#d9ded6";
      }
      document.querySelectorAll(`[data-style-field="${field}"]`).forEach((item) => {
        item.classList.toggle("selected", item === button);
      });
      syncStyleSelections();
      renderLivePreview();
    });
  });

  function syncStyleSelections() {
    document.querySelectorAll("[data-style-field]").forEach((button) => {
      const field = button.dataset.styleField;
      button.classList.toggle("selected", draftCard[field] === button.dataset.styleValue);
    });
  }

  function clearDragMarkers() {
    document.querySelectorAll(".drag-over-before, .drag-over-after").forEach((item) => {
      item.classList.remove("drag-over-before", "drag-over-after");
    });
  }

  function itemsInDropOrder(sourceIndex, targetIndex, insertAfter) {
    const next = imageItems.slice();
    const moved = next.splice(sourceIndex, 1)[0];
    let insertionIndex = targetIndex + (insertAfter ? 1 : 0);
    if (sourceIndex < insertionIndex) insertionIndex -= 1;
    next.splice(Math.max(0, Math.min(insertionIndex, next.length)), 0, moved);
    return next;
  }

  function activateDrag(event, card) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState.active = true;
    dragState.source = card;
    card.classList.add("drag-source");
    const clone = card.cloneNode(true);
    clone.className = "image-order-card dragging-clone";
    clone.removeAttribute("data-drag-index");
    clone.style.left = `${event.clientX - 64}px`;
    clone.style.top = `${event.clientY - 54}px`;
    document.body.appendChild(clone);
    dragState.clone = clone;
  }

  $("#imageOrderList").addEventListener("pointerdown", (event) => {
    if (event.target.closest("button, label")) return;
    const card = event.target.closest("[data-drag-index]");
    if (!card) return;
    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceIndex: Number(card.dataset.dragIndex),
      targetIndex: Number(card.dataset.dragIndex),
      insertAfter: false,
      active: false,
      timer: 0,
      clone: null,
      source: null,
      previewItems: null,
      previewKey: ""
    };
    dragState = state;
    card.setPointerCapture(event.pointerId);
    if (event.pointerType === "mouse") activateDrag(event, card);
    else state.timer = window.setTimeout(() => activateDrag(event, card), 220);
  });
  $("#imageOrderList").addEventListener("contextmenu", (event) => {
    if (event.target.closest("[data-drag-index]")) event.preventDefault();
  });
  $("#imageOrderList").addEventListener("dragstart", (event) => {
    if (event.target.closest("[data-drag-index]")) event.preventDefault();
  });
  $("#imageOrderList").addEventListener("selectstart", (event) => {
    if (event.target.closest("[data-drag-index]")) event.preventDefault();
  });

  $("#imageOrderList").addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (!dragState.active) {
      const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
      if (distance > 9) {
        window.clearTimeout(dragState.timer);
        dragState = null;
      }
      return;
    }
    event.preventDefault();
    dragState.clone.style.left = `${event.clientX - 64}px`;
    dragState.clone.style.top = `${event.clientY - 54}px`;
    clearDragMarkers();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-drag-index]");
    if (!target) return;
    if (target === dragState.source) {
      if (dragState.previewItems) {
        dragState.targetIndex = dragState.sourceIndex;
        dragState.previewItems = null;
        dragState.previewKey = "source";
        renderLivePreview();
      }
      return;
    }
    const rect = target.getBoundingClientRect();
    const after = event.clientX > rect.left + rect.width / 2;
    dragState.targetIndex = Number(target.dataset.dragIndex);
    dragState.insertAfter = after;
    target.classList.add(after ? "drag-over-after" : "drag-over-before");
    const previewKey = `${dragState.targetIndex}:${after}`;
    if (dragState.previewKey !== previewKey) {
      dragState.previewKey = previewKey;
      dragState.previewItems = itemsInDropOrder(dragState.sourceIndex, dragState.targetIndex, after);
      renderLivePreview();
    }
  });

  function finishDrag(event, cancelled) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    window.clearTimeout(dragState.timer);
    if (!dragState.active) {
      dragState = null;
      return;
    }
    const { sourceIndex, targetIndex, clone, source, previewItems } = dragState;
    clone.remove();
    source.classList.remove("drag-source");
    clearDragMarkers();
    if (!cancelled && targetIndex !== sourceIndex) {
      imageItems = previewItems || imageItems;
      renderImages();
      $("#uploadProgress").textContent = "图片顺序已更新，第 1 张为主图。";
    }
    dragState = null;
    if (cancelled || targetIndex === sourceIndex) renderLivePreview();
  }

  $("#imageOrderList").addEventListener("pointerup", (event) => finishDrag(event, false));
  $("#imageOrderList").addEventListener("pointercancel", (event) => finishDrag(event, true));

  function setDrawerState(state) {
    $(".editor-shell").dataset.drawerState = state;
    $("#drawerStateButton").setAttribute("aria-label", state === "expanded" ? "收起编辑抽屉" : "展开编辑抽屉");
  }

  function enableDirectManagement() {
    const shell = $(".editor-shell");
    const contentTab = $('[data-panel-target="images"]');
    const textTab = $('[data-panel-target="text"]');
    shell.classList.add("direct-content-mode");
    if (editingId) shell.classList.add("existing-manage-mode");
    shell.dataset.activeTool = "manage";
    activeTool = "manage";
    contentTab.dataset.panelTarget = "manage";
    contentTab.innerHTML = "<span>✎</span>内容";
    contentTab.classList.add("selected");
    contentTab.setAttribute("aria-selected", "true");
    textTab.hidden = true;
    textTab.classList.remove("selected");
    textTab.setAttribute("aria-selected", "false");
    $("#manageLayoutSlot").append($(".editor-quick-template"));
    $("#manageUploadSlot").append($("#uploadArea"), $("#imageInput"), $("#uploadProgress"));
    $("#manageVideoSlot").append($('[data-tool-panel="video"]'));
    $("#manageVoiceSlot").append($('[data-tool-panel="voice"]'));
    $('[data-tool-panel="video"]').hidden = false;
    $('[data-tool-panel="voice"]').hidden = false;
    $("#manageTextSlot").append($(".text-compose-fields"));
    $("#manageExistingImagesSlot").append($("#selectedHeading"), $("#imageOrderList"));
    document.querySelectorAll("[data-tool-panel]").forEach((panel) => {
      const embeddedMedia = panel.dataset.toolPanel === "video" || panel.dataset.toolPanel === "voice";
      const active = panel.dataset.toolPanel === "manage";
      if (embeddedMedia) {
        panel.hidden = false;
        panel.classList.add("active");
        return;
      }
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    setDrawerState("expanded");
  }

  document.querySelectorAll("[data-panel-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.panelTarget;
      activeTool = target;
      $(".editor-shell").dataset.activeTool = target;
      document.querySelectorAll("[data-panel-target]").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("selected", selected);
        item.setAttribute("aria-selected", String(selected));
      });
      document.querySelectorAll("[data-tool-panel]").forEach((panel) => {
        const active = panel.dataset.toolPanel === target;
        panel.hidden = !active;
        panel.classList.toggle("active", active);
      });
      renderLivePreview();
      if ($(".editor-shell").dataset.drawerState === "collapsed") setDrawerState("half");
    });
  });

  $("#drawerStateButton").addEventListener("click", () => {
    const current = $(".editor-shell").dataset.drawerState;
    setDrawerState(current === "collapsed" ? "half" : current === "half" ? "expanded" : "collapsed");
  });
  $("#returnToPreview").addEventListener("click", () => setDrawerState("collapsed"));

  function closeFullPreview() {
    $("#fullPreviewBackdrop").classList.remove("open");
    $("#fullPreviewBackdrop").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  $("#openFullPreview").addEventListener("click", () => {
    renderLivePreview();
    $("#fullPreviewBackdrop").classList.add("open");
    $("#fullPreviewBackdrop").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  });
  $("#closeFullPreview").addEventListener("click", closeFullPreview);
  $("#fullPreviewBackdrop").addEventListener("click", (event) => {
    if (event.target === $("#fullPreviewBackdrop")) closeFullPreview();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#framingBackdrop").classList.contains("open")) {
      closeFramingEditor();
      return;
    }
    if (event.key === "Escape" && $("#fullPreviewBackdrop").classList.contains("open")) closeFullPreview();
  });

  $("#cardForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = $("#titleInput").value.trim();
    const content = $("#contentInput").value.trim();
    if (!imageItems.length && !videoItem && !voiceItem && !title && !content) {
      $("#formMessage").textContent = "请至少添加图片、视频、语音、标题或文字中的一项。";
      return;
    }
    const rawDate = $("#dateInput").value;
    if (!rawDate || Number.isNaN(new Date(rawDate).getTime())) {
      $("#formMessage").textContent = "请选择有效日期。";
      return;
    }
    const visibility = currentVisibility();
    const location = $("#locationInput").value.trim().slice(0, 60);

    $("#saveButton").disabled = true;
    $("#saveButton").textContent = "正在保存…";
    $("#mobileTextSave").disabled = true;
    $("#mobileTextSave").textContent = "保存中";
    $("#formMessage").textContent = "";
    const cardId = editingId || `${currentChannelId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let records = [];
    let metadataSaved = false;
    try {
      records = await prepareRecords(cardId);
      const videoRecord = mediaRecord(videoItem, cardId, "video");
      const voiceRecord = mediaRecord(voiceItem, cardId, "voice");
      if (videoRecord) records.push(videoRecord);
      if (voiceRecord) records.push(voiceRecord);
      await window.LifeSpaceImageStorage.putMany(records);
      const saved = window.LifeSpaceStorage.saveCard({
        id: cardId,
        userId: "local-user",
        channelId: currentChannelId,
        title,
        subtitle: $("#subtitleInput").value.trim(),
        content,
        images: imageItems.map((item, index) => ({
          id: item.id,
          order: index,
          positionX: Number.isFinite(Number(item.positionX)) ? Number(item.positionX) : 50,
          positionY: Number.isFinite(Number(item.positionY)) ? Number(item.positionY) : 50
        })),
        imageLayout: selectedLayout,
        imageLayoutCount: selectedLayoutCount,
        imageLayoutVariant: selectedLayoutVariant,
        templateId: selectedTemplate || recommendedTemplate(),
        visualTemplate: selectedTemplate || recommendedTemplate(),
        titleColor: draftCard.titleColor,
        contentColor: draftCard.contentColor,
        cardStyle: draftCard.cardStyle,
        borderStyle: draftCard.borderStyle,
        textPaper: draftCard.textPaper,
        createdAt: new Date(rawDate).toISOString(),
        location,
        visibility,
        music: originalCard ? originalCard.music : null,
        video: videoItem ? {
          id: videoItem.id,
          fileName: videoItem.fileName,
          mimeType: videoItem.mimeType
        } : null,
        voice: voiceItem ? {
          id: voiceItem.id,
          fileName: voiceItem.fileName,
          mimeType: voiceItem.mimeType
        } : null,
        tags: originalCard ? originalCard.tags : [],
        status: "published"
      });
      metadataSaved = true;
      try {
        await window.LifeSpaceImageStorage.deleteMany(removedImageIds.concat(removedMediaIds));
      } catch (cleanupError) {
        console.warn("已保存记录，但旧图片清理失败", cleanupError);
      }
      window.location.href = channelUrl({ view: saved.id });
    } catch (error) {
      if (!metadataSaved && records.length) {
        await window.LifeSpaceImageStorage.deleteMany(records.map((record) => record.id)).catch(() => {});
      }
      $("#formMessage").textContent = error.message;
      $("#saveButton").disabled = false;
      $("#saveButton").textContent = "保存生命内容卡";
      $("#mobileTextSave").disabled = false;
      $("#mobileTextSave").textContent = "保存";
    }
  });

  async function initialize() {
    applyEditorChannelChrome();
    $("#dateInput").value = toLocalInputValue();
    draftCard.createdAt = new Date($("#dateInput").value).toISOString();
    if (!editingId) {
      enableDirectManagement();
      renderLayouts();
      renderTemplates();
      renderTextPapers();
      renderImages();
      syncDraftText();
      return;
    }
    originalCard = window.LifeSpaceStorage.getCard(editingId);
    if (!originalCard) {
      $("#formMessage").textContent = "没有找到这条记录，可能已被删除。";
      $("#saveButton").disabled = true;
      return;
    }
    currentChannelId = originalCard.channelId || currentChannelId;
    currentChannel = channels.find((channel) => channel.id === currentChannelId) || currentChannel;
    applyEditorChannelChrome();
    document.title = "编辑生命内容卡｜我的生命空间";
    $("#editorTitle").textContent = "编辑记录";
    $("#titleInput").value = originalCard.title || "";
    $("#subtitleInput").value = originalCard.subtitle || "";
    $("#contentInput").value = originalCard.content || "";
    $("#locationInput").value = originalCard.location || "";
    setVisibility(originalCard.visibility || "private");
    $("#dateInput").value = toLocalInputValue(originalCard.createdAt);
    draftCard = Object.assign({}, draftCard, originalCard, {
      images: Array.isArray(originalCard.images) ? originalCard.images.map((image) => typeof image === "object" ? Object.assign({}, image) : image) : [],
      templateId: originalCard.templateId || originalCard.visualTemplate || "",
      titleColor: originalCard.titleColor || "#293a33",
      contentColor: originalCard.contentColor || "#626a63",
      cardStyle: originalCard.cardStyle || "soft",
      borderStyle: originalCard.borderStyle || "fine"
    });
    if (!textPapers.some((paper) => paper.id === draftCard.textPaper)) draftCard.textPaper = "plain";
    syncStyleSelections();
    selectedLayout = originalCard.imageLayout || "auto";
    const storedLayoutCount = Number(originalCard.imageLayoutCount);
    selectedLayoutCount = Number.isFinite(storedLayoutCount) && storedLayoutCount >= 0
      ? storedLayoutCount
      : Math.min(9, (originalCard.images || []).length);
    selectedLayoutVariant = originalCard.imageLayoutVariant || "";
    selectedTemplate = originalCard.templateId || originalCard.visualTemplate || "";
    templateTouched = Boolean(originalCard.visualTemplate);
    enableDirectManagement();
    renderTextPapers();
    renderLayouts();
    try {
      await loadExistingImages(originalCard);
      videoItem = await loadStoredMedia(originalCard.video, "video");
      voiceItem = await loadStoredMedia(originalCard.voice, "voice");
      renderMediaItem("video");
      renderMediaItem("voice");
      if (!selectedTemplate) selectedTemplate = recommendedTemplate();
      renderTemplates();
      syncDraftText();
    } catch (error) {
      $("#formMessage").textContent = `部分图片读取失败：${error.message}`;
      renderLivePreview();
    }
  }

  window.addEventListener("beforeunload", () => {
    imageItems.forEach((item) => {
      if (item.previewUrl && !item.isLegacy) URL.revokeObjectURL(item.previewUrl);
    });
    [videoItem, voiceItem].forEach((item) => {
      if (item && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    if (recordingStream) recordingStream.getTracks().forEach((track) => track.stop());
  });
  window.addEventListener("resize", () => requestAnimationFrame(fitPreviewCard));

  initialize();
})();
