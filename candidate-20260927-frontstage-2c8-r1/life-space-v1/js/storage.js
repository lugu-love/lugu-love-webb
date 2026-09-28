(function () {
  "use strict";

  const KEYS = Object.freeze({
    cards: "life-space-v1.cards",
    profile: "life-space-v1.profile",
    homeTheme: "life-space-v1.home-theme",
    channelAvatars: "life-space-v1.channel-avatars"
  });

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn("生命空间本地数据读取失败", error);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      if (error && error.name === "QuotaExceededError") {
        throw new Error("图片占用空间较大，请选择更小的照片后重试。");
      }
      throw new Error("保存失败，请确认浏览器允许本地存储。");
    }
  }

  function normalizeCard(card) {
    const textPapers = ["plain", "cream-lines", "blue-grid", "pink-dots", "leaf", "sunshine", "stars", "kraft", "ink-wash", "rainbow"];
    const visibilityOptions = ["private", "invite", "public"];
    return Object.assign({}, window.LifeSpaceDefaults.cardShape, card, {
      images: Array.isArray(card.images) ? card.images : [],
      imageLayout: ["auto", "hero", "hero-2", "hero-4", "grid"].includes(card.imageLayout) ? card.imageLayout : "auto",
      visualTemplate: ["a", "b", "c", "d", "e", "f"].includes(card.visualTemplate) ? card.visualTemplate : "",
      textPaper: textPapers.includes(card.textPaper) ? card.textPaper : "plain",
      location: String(card.location || "").trim().slice(0, 60),
      visibility: visibilityOptions.includes(card.visibility) ? card.visibility : "private",
      tags: Array.isArray(card.tags) ? card.tags : []
    });
  }

  const api = {
    getHomeTheme() {
      return Object.assign({}, window.LifeSpaceDefaults.homeTheme, read(KEYS.homeTheme, {}));
    },
    saveHomeTheme(theme) {
      const defaults = window.LifeSpaceDefaults.homeTheme;
      const clean = {
        backgroundType: theme.backgroundType === "custom" ? "custom" : "preset",
        backgroundValue: String(theme.backgroundValue || defaults.backgroundValue),
        title: String(theme.title || "").trim().slice(0, 20) || defaults.title,
        description: String(theme.description || "").trim().slice(0, 60) || defaults.description,
        textColor: String(theme.textColor || defaults.textColor)
      };
      write(KEYS.homeTheme, clean);
      return clean;
    },
    resetHomeTheme() {
      localStorage.removeItem(KEYS.homeTheme);
      return Object.assign({}, window.LifeSpaceDefaults.homeTheme);
    },
    getProfile() {
      return Object.assign({}, window.LifeSpaceDefaults.profile, read(KEYS.profile, {}));
    },
    saveProfile(profile) {
      const clean = {
        nickname: String(profile.nickname || "").trim() || window.LifeSpaceDefaults.profile.nickname,
        quote: String(profile.quote || "").trim().slice(0, 30) || window.LifeSpaceDefaults.profile.quote,
        bio: String(profile.bio || "").trim() || window.LifeSpaceDefaults.profile.bio,
        theme: String(profile.theme || window.LifeSpaceDefaults.profile.theme),
        textColor: String(profile.textColor || window.LifeSpaceDefaults.profile.textColor),
        avatar: typeof profile.avatar === "string" && profile.avatar.startsWith("data:image/")
          ? profile.avatar
          : ""
      };
      write(KEYS.profile, clean);
      return clean;
    },
    getChannelAvatar(channelId) {
      const avatars = read(KEYS.channelAvatars, {});
      const value = avatars && avatars[String(channelId || "")];
      return typeof value === "string" && value.startsWith("data:image/") ? value : "";
    },
    saveChannelAvatar(channelId, avatar) {
      const cleanId = String(channelId || "").trim();
      if (!cleanId) return "";
      const avatars = read(KEYS.channelAvatars, {});
      if (typeof avatar === "string" && avatar.startsWith("data:image/")) {
        avatars[cleanId] = avatar;
      } else {
        delete avatars[cleanId];
      }
      write(KEYS.channelAvatars, avatars);
      return avatars[cleanId] || "";
    },
    getCards(channelId) {
      const cards = read(KEYS.cards, []).map(normalizeCard);
      return cards
        .filter((card) => !channelId || card.channelId === channelId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    },
    getCard(id) {
      return this.getCards().find((card) => card.id === id) || null;
    },
    saveCard(input) {
      const cards = read(KEYS.cards, []).map(normalizeCard);
      const now = new Date().toISOString();
      const existingIndex = cards.findIndex((card) => card.id === input.id);
      const original = existingIndex >= 0 ? cards[existingIndex] : {};
      const card = normalizeCard(Object.assign({}, original, input, {
        id: input.id || `life-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: input.createdAt || original.createdAt || now,
        updatedAt: now
      }));

      if (existingIndex >= 0) cards[existingIndex] = card;
      else cards.push(card);
      write(KEYS.cards, cards);
      return card;
    },
    deleteCard(id) {
      const cards = read(KEYS.cards, []);
      const next = cards.filter((card) => card.id !== id);
      if (next.length === cards.length) return false;
      write(KEYS.cards, next);
      return true;
    }
  };

  window.LifeSpaceStorage = Object.freeze(api);
})();
