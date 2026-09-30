(function () {
  "use strict";

  const DB_NAME = "life-space-v1.images";
  const DB_VERSION = 1;
  const STORE_NAME = "images";

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("当前浏览器不支持本地图片存储，请更换新版浏览器。"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(new Error("无法打开本地图片库。"));
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("cardId", "cardId", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
    });
  }

  function requestResult(request, message) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error(message));
    });
  }

  async function withStore(mode, callback) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = callback(store);
      } catch (error) {
        database.close();
        reject(error);
        return;
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(new Error("图片存储操作失败，请确认浏览器仍有可用空间。"));
      };
      transaction.onabort = transaction.onerror;
    });
  }

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("无法识别这张图片。"));
      };
      image.src = url;
    });
  }

  function canvasBlob(image, maxSide, quality) {
    return new Promise((resolve, reject) => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("图片处理失败。"));
      }, "image/jpeg", quality);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = dataUrl.split(",");
    const mimeMatch = parts[0].match(/data:([^;]+)/);
    const binary = atob(parts[1] || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mimeMatch ? mimeMatch[1] : "image/jpeg" });
  }

  async function createAssets(blob, options) {
    const image = await loadImage(blob);
    const previewBlob = await canvasBlob(image, 1800, 0.9);
    const thumbnailBlob = await canvasBlob(image, 520, 0.78);
    return {
      id: options.id,
      cardId: options.cardId,
      originalBlob: blob,
      previewBlob,
      thumbnailBlob,
      fileName: options.fileName || "legacy-image.jpg",
      mimeType: blob.type || "image/jpeg",
      width: image.naturalWidth,
      height: image.naturalHeight,
      createdAt: options.createdAt || new Date().toISOString(),
      order: options.order || 0
    };
  }

  const api = {
    createId() {
      return `image-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    },
    createAssetsFromFile(file, options) {
      return createAssets(file, Object.assign({ fileName: file.name }, options));
    },
    createAssetsFromLegacy(dataUrl, options) {
      return createAssets(dataUrlToBlob(dataUrl), options);
    },
    async putMany(records) {
      if (!records.length) return;
      await withStore("readwrite", (store) => records.forEach((record) => store.put(record)));
    },
    async get(id) {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readonly");
      const result = await requestResult(transaction.objectStore(STORE_NAME).get(id), "无法读取图片。");
      database.close();
      return result || null;
    },
    async deleteMany(ids) {
      const cleanIds = ids.filter(Boolean);
      if (!cleanIds.length) return;
      await withStore("readwrite", (store) => cleanIds.forEach((id) => store.delete(id)));
    },
    async deleteByCard(cardId) {
      const database = await openDatabase();
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const index = transaction.objectStore(STORE_NAME).index("cardId");
      const request = index.openCursor(IDBKeyRange.only(cardId));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(new Error("清理图片失败，请稍后重试。"));
        transaction.onabort = transaction.onerror;
      });
      database.close();
    },
    variantBlob(record, variant) {
      if (!record) return null;
      if (variant === "thumbnail") return record.thumbnailBlob;
      if (variant === "original") return record.originalBlob;
      return record.previewBlob;
    }
  };

  window.LifeSpaceImageStorage = Object.freeze(api);
})();
