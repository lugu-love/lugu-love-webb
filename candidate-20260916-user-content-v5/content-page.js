if (!window.LuguMusic) {
  const musicStops = new Map();
  const instanceId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let channel = null;
  try { if ("BroadcastChannel" in window) channel = new BroadcastChannel("lugu-exclusive-music-v1"); } catch (error) {}
  const stopOthers = (except = "") => musicStops.forEach((stop, owner) => { if (owner !== except) stop(); });
  window.LuguMusic = {
    register(owner, stop) { musicStops.set(owner, stop); },
    claim(owner) {
      stopOthers(owner);
      if (channel) channel.postMessage({ type: "claim", instanceId, owner });
      try { localStorage.setItem("lugu_music_claim", JSON.stringify({ instanceId, owner, time: Date.now() })); } catch (error) {}
    },
    release() {}
  };
  if (channel) channel.addEventListener("message", (event) => {
    if (event.data && event.data.type === "claim" && event.data.instanceId !== instanceId) stopOthers();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== "lugu_music_claim" || !event.newValue) return;
    try { if (JSON.parse(event.newValue).instanceId !== instanceId) stopOthers(); } catch (error) {}
  });
  window.LuguMusic.register("page-media", () => {
    document.querySelectorAll("audio, video").forEach((item) => { if (!item.paused) item.pause(); });
  });
  document.addEventListener("play", (event) => {
    if (!(event.target instanceof HTMLMediaElement)) return;
    window.LuguMusic.claim("page-media");
    document.querySelectorAll("audio, video").forEach((item) => {
      if (item !== event.target && !item.paused) item.pause();
    });
  }, true);
}

const KEY = "lugu_my_space_v11";
const MUSIC_ENABLED_KEY = "lugu_space_music_enabled";
const MUSIC_VOLUME_KEY = "lugu_world_music_volume";
const category = document.body.dataset.category;
const labels = {
  voice: ["我的心声", "把想告诉世界的话留在这里。"],
  story: ["我的故事", "用文字和照片记录生活。"],
  growth: ["我的成长", "收藏每一次变化与重要时刻。"],
  collection: ["我的收藏", "保存喜欢的内容与美好瞬间。"]
};
let state;
try { state = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (error) { state = null; }
if (!state) state = { contents: { home: [], voice: [], story: [], growth: [], collection: [] } };
state.contents ||= {};
state.contents[category] ||= [];
state.worldMusic ||= {};
state.customMusic ||= [];
const $ = (id) => document.getElementById(id);
document.querySelectorAll('a[href="index.html"]').forEach((link) => { link.target = "_top"; });
$("title").textContent = labels[category][0];
$("intro").textContent = labels[category][1];
document.title = `${labels[category][0]} · 我的空间`;
let type = "文字";
let media = "";
let editingIndex = -1;
let photoSource = "";
const photoPointers = new Map();
let photoDragPoint = null;
let photoPinchDistance = 0;
let photoPinchZoom = 1;
let musicAudio = null;
let worldMusicAudio = null;
let worldMusicEnabled = true;
let musicVolume = .62;
try {
  worldMusicEnabled = localStorage.getItem(MUSIC_ENABLED_KEY) !== "0";
  const savedVolumeRaw = localStorage.getItem(MUSIC_VOLUME_KEY);
  const savedVolume = Number(savedVolumeRaw);
  if (savedVolumeRaw !== null && Number.isFinite(savedVolume)) musicVolume = Math.max(0, Math.min(1, savedVolume));
} catch (error) {}
window.LuguMusic.register("content-preview", () => {
  if (musicAudio) musicAudio.pause();
  musicAudio = null;
  $("musicPreview").textContent = "试听";
});
window.LuguMusic.register("content-world-music", () => {
  if (worldMusicAudio) worldMusicAudio.pause();
  updateMusicToggle();
});
let mediaMigrationReady = Promise.resolve(false);
const isEmbeddedView = window.parent !== window;
const parentMessageOrigin = window.location.origin === "null" ? "*" : window.location.origin;
let embeddedPreviewPlaying = false;
const musicTracks = {
  "星河钢琴": "assets/music/p-aaa0536-54f92252.m4a",
  "温柔长笛": "assets/music/native-american-flute.m4a",
  "夜空冥想": "assets/music/p-mzpy00978-ccbf4fd7.m4a",
  "乐曲 1": "assets/music/1-web.m4a",
  "乐曲 2": "assets/music/2-web.m4a",
  "乐曲 3": "assets/music/3-web.m4a",
  "乐曲 6": "assets/music/6-web.m4a",
  "乐曲 7": "assets/music/7-web.m4a",
  "乐曲 8": "assets/music/8-web.m4a",
  "乐曲 9": "assets/music/9-web.m4a",
  "乐曲 10": "assets/music/10-web.m4a",
  "乐曲 11": "assets/music/11-web.m4a"
};

Object.keys(musicTracks).forEach((name) => {
  if (Array.from($("worldMusic").options).some((option) => option.value === name)) return;
  const option = document.createElement("option");
  option.value = name;
  option.textContent = name;
  $("worldMusic").appendChild(option);
});
state.customMusic.forEach((track) => {
  if (!track || !track.id || !track.name) return;
  const option = document.createElement("option");
  option.value = `custom:${track.id}`;
  option.textContent = `❤ ${track.name}`;
  $("worldMusic").appendChild(option);
});
const volumeControl = document.createElement("label");
volumeControl.className = "music-volume-control";
volumeControl.innerHTML = `<span>音量</span><input id="musicVolume" type="range" min="0" max="100" step="1" value="${Math.round(musicVolume * 100)}"><output id="musicVolumeValue" for="musicVolume">${Math.round(musicVolume * 100)}%</output>`;
$("worldMusic").insertAdjacentElement("afterend", volumeControl);
$("musicVolume").addEventListener("input", () => {
  musicVolume = Number($("musicVolume").value) / 100;
  $("musicVolumeValue").textContent = `${Math.round(musicVolume * 100)}%`;
  try { localStorage.setItem(MUSIC_VOLUME_KEY, String(musicVolume)); } catch (error) {}
  if (worldMusicAudio) worldMusicAudio.volume = musicVolume;
  if (musicAudio) musicAudio.volume = musicVolume;
  if (isEmbeddedView) window.parent.postMessage({ type: "lugu-set-space-music-volume", volume: musicVolume }, parentMessageOrigin);
});
const importMusicButton = document.createElement("button");
importMusicButton.id = "musicImport";
importMusicButton.type = "button";
importMusicButton.textContent = "录入音乐";
$("musicSave").insertAdjacentElement("beforebegin", importMusicButton);
document.body.insertAdjacentHTML("beforeend", `
  <div class="music-import-modal" id="musicImportModal" aria-hidden="true">
    <section class="music-import-card" role="dialog" aria-modal="true" aria-labelledby="musicImportTitle">
      <div class="music-import-head"><div><strong id="musicImportTitle">我的音乐库</strong><p>录入自己喜欢的音乐，保存后即可选择。</p></div><button id="musicImportClose" type="button" aria-label="关闭">×</button></div>
      <label class="music-import-file"><span>选择音乐文件</span><input id="musicImportFile" type="file" accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"></label>
      <label class="music-import-name"><span>音乐名称</span><input id="musicImportName" type="text" maxlength="40" placeholder="自动使用文件名，也可以修改"></label>
      <button class="music-import-save" id="musicImportSave" type="button">保存到我的音乐库</button>
      <p class="music-import-status" id="musicImportStatus">支持常见音频格式，单个文件不超过 30MB。</p>
      <div class="personal-music-library" id="personalMusicLibrary"></div>
    </section>
  </div>`);
const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

function mediaHtml(item) {
  if (item.mediaRef) {
    const tag = item.type === "照片" ? "img" : item.type === "语音" ? "audio" : "video";
    const controls = tag === "img" ? ' alt="照片"' : " controls playsinline";
    return `<${tag} class="media" data-media-ref="${esc(item.mediaRef)}"${controls}></${tag}>`;
  }
  if (!item.media || !item.media.startsWith("data:")) return "";
  if (item.type === "照片") return `<img class="media" src="${item.media}" alt="照片">`;
  if (item.type === "语音") return `<audio class="media" src="${item.media}" controls></audio>`;
  if (item.type === "视频") return `<video class="media" src="${item.media}" controls playsinline preload="metadata"></video>`;
  return "";
}

function render() {
  const items = state.contents[category];
  $("list").innerHTML = items.length ? items.map((item, index) => `<article class="item"><strong>${esc(item.type)}</strong>${item.text ? `<br>${esc(item.text)}` : ""}${mediaHtml(item)}<div class="item-actions"><button data-edit="${index}">修改</button><button class="danger" data-delete="${index}">删除</button></div></article>`).join("") : `<div class="item empty">这里还没有内容，点击下方添加内容</div>`;
  document.querySelectorAll("[data-media-ref]").forEach(async (node) => {
    try { const blob = await readMediaFile(node.dataset.mediaRef); if (blob) node.src = URL.createObjectURL(blob); } catch (error) {}
  });
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch (error) { return false; }
}

function showSaveNotice(message) {
  let notice = $("saveNotice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "saveNotice";
    notice.className = "save-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    document.body.appendChild(notice);
  }
  notice.textContent = message;
  notice.classList.add("show");
  clearTimeout(showSaveNotice.timer);
  showSaveNotice.timer = setTimeout(() => notice.classList.remove("show"), 4200);
}

function openMediaDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lugu_space_media", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveMusicFile(file) {
  const key = `music-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").put(file, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  return key;
}

async function saveMediaFile(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const binary = atob(parts[1] || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const blob = new Blob([bytes], { type: mime });
  const key = `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").put(blob, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("照片存储被中止"));
  });
  db.close();
  return key;
}

async function migrateLegacyMedia() {
  let changed = false;
  for (const items of Object.values(state.contents || {})) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || item.mediaRef || !item.media || !item.media.startsWith("data:")) continue;
      try {
        item.mediaRef = await saveMediaFile(item.media);
        item.media = "";
        changed = true;
      } catch (error) {}
    }
  }
  if (changed) persist();
  return changed;
}

async function readMediaFile(key) {
  const db = await openMediaDb();
  const blob = await new Promise((resolve, reject) => {
    const request = db.transaction("files").objectStore("files").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function deleteMediaFile(key) {
  if (!key) return;
  const db = await openMediaDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("files", "readwrite");
    transaction.objectStore("files").delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("照片删除被中止"));
  });
  db.close();
}

function clearPreviews() {
  ["photo", "audio", "video"].forEach((id) => { $(id).classList.remove("show"); $(id).removeAttribute("src"); });
  $("photoEditor").classList.remove("open");
}

function resetComposer() {
  type = "文字"; media = ""; photoSource = ""; editingIndex = -1;
  $("text").value = ""; $("file").value = ""; $("upload").classList.remove("open");
  clearPreviews(); $("status").textContent = "请选择文件。"; $("save").textContent = "保存内容";
  document.querySelectorAll(".type").forEach((button) => button.classList.toggle("active", button.dataset.type === "文字"));
}

function selectType(nextType) {
  type = nextType; media = ""; photoSource = ""; clearPreviews();
  document.querySelectorAll(".type").forEach((button) => button.classList.toggle("active", button.dataset.type === type));
  $("upload").classList.toggle("open", type !== "文字");
  $("file").accept = type === "照片" ? "image/*" : type === "语音" ? "audio/*" : "video/*";
  $("pick").textContent = `选择${type}`;
}

function applyPhotoTransform() {
  const scale = Math.max(1, Number($("photoZoom").value));
  const x = Number($("photoX").value);
  const y = Number($("photoY").value);
  $("photoZoom").value = String(scale);
  $("photo").style.objectPosition = `${50 + x}% ${50 + y}%`;
  $("photo").style.transform = `scale(${scale})`;
}

let photoFrame = "portrait";
function setPhotoFrame(frame) {
  photoFrame = frame === "landscape" ? "landscape" : "portrait";
  $("photoStage").classList.toggle("frame-landscape", photoFrame === "landscape");
  document.querySelectorAll("[data-photo-frame]").forEach((button) => button.classList.toggle("active", button.dataset.photoFrame === photoFrame));
  applyPhotoTransform();
}

async function confirmPhoto() {
  if (!photoSource) return;
  const image = await new Promise((resolve, reject) => { const node = new Image(); node.onload = () => resolve(node); node.onerror = reject; node.src = photoSource; });
  const outputWidth = photoFrame === "landscape" ? 560 : 420;
  const outputHeight = photoFrame === "landscape" ? 420 : 560;
  const canvas = document.createElement("canvas"); canvas.width = outputWidth; canvas.height = outputHeight;
  const context = canvas.getContext("2d"); context.fillStyle = "#0b1020"; context.fillRect(0, 0, outputWidth, outputHeight);
  const scale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight) * Math.max(1, Number($("photoZoom").value));
  const width = image.naturalWidth * scale; const height = image.naturalHeight * scale;
  const positionX = Math.max(0, Math.min(1, (50 + Number($("photoX").value)) / 100));
  const positionY = Math.max(0, Math.min(1, (50 + Number($("photoY").value)) / 100));
  const x = -(width - outputWidth) * positionX;
  const y = -(height - outputHeight) * positionY;
  context.drawImage(image, x, y, width, height);
  media = canvas.toDataURL("image/jpeg", .62);
  $("status").textContent = "照片调整已确认。";
  $("photoEditor").classList.remove("open");
}

$("add").onclick = () => {
  const opening = !$("composer").classList.contains("open");
  $("composer").classList.toggle("open", opening);
  resetComposer();
  if (opening) requestAnimationFrame(() => $("composer").scrollIntoView({ behavior: "smooth", block: "center" }));
};
document.querySelectorAll(".type").forEach((button) => button.onclick = () => selectType(button.dataset.type));
const read = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });

$("file").onchange = async (event) => {
  const file = event.target.files[0]; if (!file) return;
  const limit = type === "视频" ? 4 : 3;
  if ((type === "语音" || type === "视频") && file.size > limit * 1024 * 1024) { $("status").textContent = `${type}文件请控制在 ${limit}MB 内。`; return; }
  try {
    const source = await read(file); $("status").textContent = `已选择：${file.name}`;
    if (type === "照片") {
      photoSource = source; media = ""; $("photo").src = source; $("photo").classList.add("show");
      $("photoZoom").value = "1"; $("photoX").value = "0"; $("photoY").value = "0"; applyPhotoTransform(); $("photoEditor").classList.add("open");
    } else {
      media = source; const preview = type === "语音" ? $("audio") : $("video"); preview.src = media; preview.classList.add("show");
    }
  } catch (error) { $("status").textContent = "文件读取失败。"; }
};

$("photoZoom").min = "1";
const photoFrameOptions = document.createElement("div");
photoFrameOptions.className = "photo-frame-options";
photoFrameOptions.innerHTML = '<button class="active" type="button" data-photo-frame="portrait">▯ 竖屏 3:4</button><button type="button" data-photo-frame="landscape">▭ 横屏 4:3</button>';
$("photoStage").insertAdjacentElement("beforebegin", photoFrameOptions);
document.querySelectorAll("[data-photo-frame]").forEach((button) => button.onclick = () => setPhotoFrame(button.dataset.photoFrame));
setPhotoFrame("portrait");
["photoZoom", "photoX", "photoY"].forEach((id) => $(id).oninput = applyPhotoTransform);
$("photoStage").onpointerdown = (event) => {
  event.preventDefault(); $("photoStage").setPointerCapture(event.pointerId);
  photoPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (photoPointers.size === 1) photoDragPoint = { x: event.clientX, y: event.clientY };
  if (photoPointers.size === 2) { const points = [...photoPointers.values()]; photoPinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); photoPinchZoom = Number($("photoZoom").value); }
};
$("photoStage").onpointermove = (event) => {
  if (!photoPointers.has(event.pointerId)) return; event.preventDefault();
  photoPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (photoPointers.size >= 2) { const points = [...photoPointers.values()]; const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y); $("photoZoom").value = String(Math.max(1, Math.min(3, photoPinchZoom * distance / photoPinchDistance))); applyPhotoTransform(); return; }
  if (photoDragPoint) { $("photoX").value = String(Math.max(-50, Math.min(50, Number($("photoX").value) + (event.clientX - photoDragPoint.x) / 2))); $("photoY").value = String(Math.max(-50, Math.min(50, Number($("photoY").value) + (event.clientY - photoDragPoint.y) / 2))); photoDragPoint = { x: event.clientX, y: event.clientY }; applyPhotoTransform(); }
};
const endPhotoPointer = (event) => { photoPointers.delete(event.pointerId); photoDragPoint = photoPointers.size === 1 ? [...photoPointers.values()][0] : null; if (photoPointers.size < 2) photoPinchDistance = 0; };
$("photoStage").onpointerup = endPhotoPointer; $("photoStage").onpointercancel = endPhotoPointer;
$("photoConfirm").onclick = confirmPhoto;
$("photoRemove").onclick = () => { photoSource = ""; media = ""; $("file").value = ""; clearPreviews(); $("status").textContent = "照片已移除，请重新选择。"; };

$("save").onclick = async () => {
  await mediaMigrationReady;
  try {
    if (type === "照片" && photoSource && !media) await confirmPhoto();
  } catch (error) {
    $("status").textContent = "照片处理失败，请重新选择照片。";
    return;
  }
  const text = $("text").value.trim();
  if (type === "文字" && !text) return $("text").focus();
  if (type !== "文字" && !media) return $("status").textContent = "请先选择并确认文件。";
  const item = { type, text, media, time: Date.now() };
  if (type === "照片" && media) {
    try {
      item.mediaRef = await saveMediaFile(media);
      item.media = "";
    } catch (error) {
      item.media = media;
      $("status").textContent = "正在使用兼容模式保存照片…";
    }
  }
  const previousItem = editingIndex >= 0 ? state.contents[category][editingIndex] : null;
  if (editingIndex >= 0) state.contents[category][editingIndex] = item; else state.contents[category].unshift(item);
  let saved = persist();
  if (!saved && type === "照片" && !item.mediaRef && item.media) {
    try {
      const image = await new Promise((resolve, reject) => { const node = new Image(); node.onload = () => resolve(node); node.onerror = reject; node.src = item.media; });
      const compact = document.createElement("canvas"); compact.width = 240; compact.height = 240;
      compact.getContext("2d").drawImage(image, 0, 0, 240, 240);
      item.media = compact.toDataURL("image/jpeg", .35);
      saved = persist();
    } catch (error) { saved = false; }
  }
  if (!saved) {
    if (item.mediaRef) await deleteMediaFile(item.mediaRef).catch(() => {});
    if (editingIndex >= 0) state.contents[category][editingIndex] = previousItem; else state.contents[category].shift();
    $("status").textContent = "保存空间不足，请删除旧媒体后再试。";
    return;
  }
  const savedType = type;
  if (previousItem && previousItem.mediaRef && previousItem.mediaRef !== item.mediaRef) {
    await deleteMediaFile(previousItem.mediaRef).catch(() => {});
  }
  $("composer").classList.remove("open"); resetComposer(); render();
  requestAnimationFrame(() => $("list").scrollIntoView({ behavior: "smooth", block: "start" }));
  showSaveNotice(savedType === "照片" ? "照片已保存，可在下方内容列表查看。" : "内容已保存，可在下方内容列表查看。");
};

$("list").onclick = async (event) => {
  const edit = event.target.closest("[data-edit]"); const remove = event.target.closest("[data-delete]");
  if (remove) { if (!confirm("确定删除这条内容吗？")) return; const removed = state.contents[category].splice(Number(remove.dataset.delete), 1)[0]; persist(); if (removed && removed.mediaRef) deleteMediaFile(removed.mediaRef).catch(() => {}); render(); return; }
  if (!edit) return;
  editingIndex = Number(edit.dataset.edit); const item = state.contents[category][editingIndex];
  $("composer").classList.add("open"); selectType(item.type); editingIndex = Number(edit.dataset.edit); $("text").value = item.text || ""; media = item.media || ""; $("save").textContent = "确认修改";
  if (item.mediaRef) {
    try {
      const blob = await readMediaFile(item.mediaRef);
      if (blob) media = await blobToDataUrl(blob);
    } catch (error) {
      $("status").textContent = "原照片读取失败，请重新选择照片。";
    }
  }
  if (media && item.type !== "文字") {
    const preview = item.type === "照片" ? $("photo") : item.type === "语音" ? $("audio") : $("video"); preview.src = media; preview.classList.add("show");
    if (item.type === "照片") { photoSource = media; $("photoZoom").value = "1"; $("photoX").value = "0"; $("photoY").value = "0"; applyPhotoTransform(); $("photoEditor").classList.add("open"); $("status").textContent = "原照片已载入，可以重新调整后保存。"; }
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
};
const duplicateMusicAliases = { "乐曲 4": "乐曲 2", "乐曲 5": "乐曲 3" };
const savedMusic = duplicateMusicAliases[state.worldMusic[category]] || state.worldMusic[category] || "星河钢琴";
if (state.worldMusic[category] !== savedMusic) {
  state.worldMusic[category] = savedMusic;
  persist();
}
$("worldMusic").value = savedMusic;
$("musicState").textContent = `当前：${savedMusic}`;
const customMusicUrls = new Map();

async function getMusicSource(value) {
  if (!String(value).startsWith("custom:")) return musicTracks[value] || "";
  const id = String(value).slice(7);
  if (customMusicUrls.has(id)) return customMusicUrls.get(id);
  const track = state.customMusic.find((item) => item.id === id);
  if (!track) return "";
  const blob = await readMediaFile(track.mediaRef);
  if (!blob) return "";
  const url = URL.createObjectURL(blob);
  customMusicUrls.set(id, url);
  return url;
}

function musicDisplayName(value) {
  if (!String(value).startsWith("custom:")) return value;
  const track = state.customMusic.find((item) => item.id === String(value).slice(7));
  return track ? track.name : "我的音乐";
}

function renderPersonalMusicLibrary() {
  $("personalMusicLibrary").innerHTML = state.customMusic.length ? state.customMusic.map((track) => `
    <div class="personal-music-item">
      <button class="personal-music-pick" type="button" data-custom-music-pick="${esc(track.id)}"><span>♫</span><strong>${esc(track.name)}</strong></button>
      <button class="personal-music-delete" type="button" data-custom-music-delete="${esc(track.id)}">删除</button>
    </div>`).join("") : `<p class="personal-music-empty">你的音乐库还是空的，录入第一首喜欢的音乐吧。</p>`;
}

function closeMusicImport() {
  $("musicImportModal").classList.remove("open");
  $("musicImportModal").setAttribute("aria-hidden", "true");
}

$("musicImport").onclick = () => {
  renderPersonalMusicLibrary();
  $("musicImportModal").classList.add("open");
  $("musicImportModal").setAttribute("aria-hidden", "false");
};
$("musicImportClose").onclick = closeMusicImport;
$("musicImportModal").onclick = (event) => { if (event.target === $("musicImportModal")) closeMusicImport(); };
$("musicImportFile").onchange = () => {
  const file = $("musicImportFile").files[0];
  if (!file) return;
  $("musicImportName").value = file.name.replace(/\.[^.]+$/, "").slice(0, 40);
  $("musicImportStatus").textContent = `已选择：${file.name}`;
};
$("musicImportSave").onclick = async () => {
  const file = $("musicImportFile").files[0];
  const name = $("musicImportName").value.trim();
  if (!file) { $("musicImportStatus").textContent = "请先选择一个音乐文件。"; return; }
  if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|wav|aac|ogg|flac)$/i.test(file.name)) { $("musicImportStatus").textContent = "请选择正确的音乐文件。"; return; }
  if (file.size > 30 * 1024 * 1024) { $("musicImportStatus").textContent = "音乐文件请控制在 30MB 以内。"; return; }
  if (!name) { $("musicImportName").focus(); return; }
  $("musicImportSave").disabled = true;
  $("musicImportStatus").textContent = "正在保存到你的音乐库…";
  let mediaRef = "";
  let track = null;
  try {
    mediaRef = await saveMusicFile(file);
    track = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name, mediaRef, size: file.size, time: Date.now() };
    state.customMusic.push(track);
    if (!persist()) throw new Error("metadata-save-failed");
    const option = document.createElement("option");
    option.value = `custom:${track.id}`;
    option.textContent = `❤ ${track.name}`;
    $("worldMusic").appendChild(option);
    $("worldMusic").value = option.value;
    $("musicImportFile").value = "";
    $("musicImportName").value = "";
    $("musicImportStatus").textContent = `已保存“${track.name}”，现在可以选择和试听。`;
    renderPersonalMusicLibrary();
  } catch (error) {
    if (track) state.customMusic = state.customMusic.filter((item) => item.id !== track.id);
    if (mediaRef) await deleteMediaFile(mediaRef).catch(() => {});
    $("musicImportStatus").textContent = "保存失败，请检查浏览器存储空间后重试。";
  } finally { $("musicImportSave").disabled = false; }
};
$("personalMusicLibrary").onclick = async (event) => {
  const pick = event.target.closest("[data-custom-music-pick]");
  const remove = event.target.closest("[data-custom-music-delete]");
  if (pick) {
    $("worldMusic").value = `custom:${pick.dataset.customMusicPick}`;
    $("musicState").textContent = `已选择：${musicDisplayName($("worldMusic").value)}`;
    closeMusicImport();
    return;
  }
  if (!remove || !confirm("确定从我的音乐库删除这首音乐吗？")) return;
  const index = state.customMusic.findIndex((item) => item.id === remove.dataset.customMusicDelete);
  if (index < 0) return;
  const [track] = state.customMusic.splice(index, 1);
  const value = `custom:${track.id}`;
  if (state.worldMusic[category] === value || $("worldMusic").value === value) stopWorldMusic();
  Object.keys(state.worldMusic).forEach((key) => { if (state.worldMusic[key] === value) state.worldMusic[key] = "星河钢琴"; });
  persist();
  await deleteMediaFile(track.mediaRef).catch(() => {});
  if (customMusicUrls.has(track.id)) { URL.revokeObjectURL(customMusicUrls.get(track.id)); customMusicUrls.delete(track.id); }
  const option = Array.from($("worldMusic").options).find((item) => item.value === value);
  if (option) option.remove();
  if ($("worldMusic").value === "") $("worldMusic").value = "星河钢琴";
  renderPersonalMusicLibrary();
  $("musicImportStatus").textContent = `已删除“${track.name}”。`;
};
renderPersonalMusicLibrary();

function updateMusicToggle() {
  const isPlaying = Boolean(worldMusicAudio && !worldMusicAudio.paused);
  $("musicToggle").textContent = worldMusicEnabled ? (isPlaying ? "音乐开启" : "开启音乐") : "音乐关闭";
  $("musicToggle").setAttribute("aria-pressed", worldMusicEnabled ? "true" : "false");
}

function stopWorldMusic() {
  if (!worldMusicAudio) return updateMusicToggle();
  worldMusicAudio.pause();
  worldMusicAudio.src = "";
  worldMusicAudio.load();
  worldMusicAudio = null;
  updateMusicToggle();
}

async function playWorldMusic(options = {}) {
  if (!worldMusicEnabled) return Promise.resolve(false);
  const name = state.worldMusic[category] || $("worldMusic").value || "星河钢琴";
  const src = await getMusicSource(name);
  const displayName = musicDisplayName(name);
  if (!src) return Promise.resolve(false);
  if (musicAudio) { musicAudio.pause(); musicAudio = null; $("musicPreview").textContent = "试听"; }
  window.LuguMusic.claim("content-world-music");
  stopWorldMusic();
  worldMusicAudio = new Audio(src);
  worldMusicAudio.loop = true;
  worldMusicAudio.volume = musicVolume;
  worldMusicAudio.preload = "auto";
  worldMusicAudio.addEventListener("play", updateMusicToggle);
  worldMusicAudio.addEventListener("pause", updateMusicToggle);
  return worldMusicAudio.play().then(() => {
    $("musicState").textContent = `正在播放：${displayName}`;
    updateMusicToggle();
    return true;
  }).catch(() => {
    stopWorldMusic();
    if (!options.silent) $("musicState").textContent = "浏览器已阻止自动播放，请点击“开启音乐”。";
    else $("musicState").textContent = "点击“开启音乐”即可播放。";
    return false;
  });
}

$("musicToggle").onclick = () => {
  if (worldMusicEnabled && worldMusicAudio && !worldMusicAudio.paused) {
    worldMusicEnabled = false;
    try { localStorage.setItem(MUSIC_ENABLED_KEY, "0"); } catch (error) {}
    stopWorldMusic();
    $("musicState").textContent = "世界音乐已关闭。";
    return;
  }
  worldMusicEnabled = true;
  try { localStorage.setItem(MUSIC_ENABLED_KEY, "1"); } catch (error) {}
  updateMusicToggle();
  playWorldMusic();
};
updateMusicToggle();
$("musicPreview").onclick = async () => {
  const name = $("worldMusic").value;
  const src = await getMusicSource(name);
  const displayName = musicDisplayName(name);
  if (!src) { $("musicState").textContent = "音乐文件读取失败，请重新录入。"; return; }
  if (isEmbeddedView) {
    if (embeddedPreviewPlaying) {
      window.parent.postMessage({ type: "lugu-stop-preview-music" }, parentMessageOrigin);
      embeddedPreviewPlaying = false;
      $("musicPreview").textContent = "试听";
      $("musicState").textContent = `已停止：${displayName}`;
    } else {
      window.parent.postMessage({ type: "lugu-preview-space-music", src, trackId: `content-${category}-${name}`, volume: musicVolume }, parentMessageOrigin);
      embeddedPreviewPlaying = true;
      $("musicPreview").textContent = "停止";
      $("musicState").textContent = `正在试听：${displayName}`;
    }
    return;
  }
  if (musicAudio && !musicAudio.paused) { musicAudio.pause(); musicAudio = null; $("musicPreview").textContent = "试听"; $("musicState").textContent = `已停止：${name}`; return; }
  stopWorldMusic();
  window.LuguMusic.claim("content-preview");
  musicAudio = new Audio(src); musicAudio.volume = musicVolume;
  musicAudio.onended = () => { musicAudio = null; $("musicPreview").textContent = "试听"; $("musicState").textContent = `试听结束：${displayName}`; if (worldMusicEnabled) playWorldMusic({ silent: true }); };
  musicAudio.play().then(() => { $("musicPreview").textContent = "停止"; $("musicState").textContent = `正在试听：${displayName}`; }).catch(() => { $("musicState").textContent = "请再次点击试听。"; });
};
window.addEventListener("message", (event) => {
  if (!isEmbeddedView || event.source !== window.parent || !event.data) return;
  if (window.location.origin !== "null" && event.origin !== window.location.origin) return;
  if (event.data.type !== "lugu-preview-music-state") return;
  embeddedPreviewPlaying = Boolean(event.data.playing);
  $("musicPreview").textContent = embeddedPreviewPlaying ? "停止" : "试听";
  if (event.data.ended) $("musicState").textContent = "试听结束，已恢复空间音乐。";
});
window.addEventListener("pagehide", () => {
  if (isEmbeddedView && embeddedPreviewPlaying) window.parent.postMessage({ type: "lugu-stop-preview-music" }, parentMessageOrigin);
});
$("musicSave").onclick = () => {
  const name = $("worldMusic").value; state.worldMusic[category] = name;
  if (persist()) {
    $("musicState").textContent = `已保存：${name}`;
    if (worldMusicEnabled) playWorldMusic();
  } else $("musicState").textContent = "保存失败，空间不足。";
};
setTimeout(() => {
  if (worldMusicEnabled) playWorldMusic({ silent: true });
}, 3000);
render();
mediaMigrationReady = migrateLegacyMedia().then((changed) => { if (changed) render(); return changed; });
