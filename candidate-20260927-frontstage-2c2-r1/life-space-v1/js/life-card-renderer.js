(function () {
  "use strict";

  const templateNames = {
    a: "沉浸大图", b: "左图右文", c: "一大两小",
    d: "杂志版", e: "日记版", f: "拼贴版"
  };

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

  function formatDotDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join(".");
  }

  function visibilityLabel(value) {
    if (value === "public") return "公开";
    if (value === "invite") return "邀请可见";
    return "私密";
  }

  function recommendedTemplate(card, imageCount) {
    const requested = card.templateId || card.visualTemplate;
    if (requested && templateNames[requested]) return requested;
    if (imageCount >= 5) return "f";
    if (imageCount === 3 || imageCount === 4) return "c";
    if (imageCount === 2) return "b";
    if (imageCount === 1) return "a";
    return "e";
  }

  function textParts(card, options) {
    const title = String(card.title || "").trim();
    const subtitle = String(card.subtitle || "").trim();
    const content = String(card.content || "").trim();
    const directEdit = options && options.mode === "editor" && (options.focus === "text" || options.focus === "manage");
    const editable = (field, placeholder) => directEdit
      ? ` contenteditable="true" spellcheck="true" data-direct-field="${field}" data-placeholder="${placeholder}"`
      : "";
    const tags = [visibilityLabel(card.visibility), String(card.location || "").trim()]
      .concat((card.tags || []).filter(Boolean).slice(0, 2))
      .filter(Boolean);
    const tagHtml = tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    const management = options && options.mode === "list"
      ? `${tagHtml}<button class="visual-view" type="button" data-card-view="${escapeHtml(card.id)}" aria-label="查看这条生活记录的全部内容">查看</button>
         ${options.readonly ? "" : `<button class="visual-manage" type="button" data-card-manage="${escapeHtml(card.id)}" aria-label="管理这条生活记录">管理</button>`}`
      : tagHtml;
    return {
      title: title || directEdit ? `<h3 class="visual-title"${editable("title", "点击填写标题")}>${escapeHtml(title)}</h3>` : "",
      subtitle: subtitle || directEdit ? `<p class="visual-subtitle"${editable("subtitle", "点击填写副标题")}>${escapeHtml(subtitle)}</p>` : "",
      content: content || directEdit ? `<p class="visual-copy"${editable("content", "点击这里填写正文内容")}>${escapeHtml(content)}</p>` : "",
      date: `<time class="visual-date">${formatDotDate(card.createdAt)}</time>`,
      tags: `<div class="visual-tags">${management}</div>`
    };
  }

  function imagePosition(image) {
    const x = Number.isFinite(Number(image && image.positionX)) ? Math.max(0, Math.min(100, Number(image.positionX))) : 50;
    const y = Number.isFinite(Number(image && image.positionY)) ? Math.max(0, Math.min(100, Number(image.positionY))) : 50;
    return `${x}% ${y}%`;
  }

  function imageHtml(cardId, image, extraClass, remaining, interactive) {
    if (!image) return `<div class="visual-placeholder ${extraClass || ""}" aria-hidden="true"><span>LIFE</span></div>`;
    const imageStyle = ` style="object-position:${imagePosition(image)}"`;
    const content = `
      <img src="${escapeHtml(image.src)}" alt="生命记录第 ${image.index + 1} 张图片"${imageStyle}>
      ${remaining > 0 ? `<span class="visual-more">+${remaining}</span>` : ""}`;
    if (!interactive) {
      return image.editable
        ? `<button class="visual-photo editor-frame-photo ${extraClass || ""}" type="button" data-frame-edit="${image.index}" aria-label="调整第 ${image.index + 1} 张照片取景">${content}<span class="frame-edit-hint">调整取景</span></button>`
        : `<div class="visual-photo ${extraClass || ""}">${content}</div>`;
    }
    return `
      <button class="visual-photo ${extraClass || ""}" type="button" data-card-image="${escapeHtml(cardId)}" data-image-index="${image.index}" aria-label="查看第 ${image.index + 1} 张高清图片">
        ${content}
      </button>`;
  }

  function effectiveLayout(card, imageCount) {
    const requested = ["auto", "hero", "hero-2", "hero-4", "grid"].includes(card.imageLayout) ? card.imageLayout : "auto";
    if (requested !== "auto") return requested;
    if (imageCount <= 1) return "hero";
    if (imageCount === 3) return "hero-2";
    if (imageCount === 5) return "hero-4";
    return "grid";
  }

  function cardAttributes(card, template, options, imageCount) {
    const interactive = options.interactive !== false;
    const layout = effectiveLayout(card, imageCount);
    const cardStyle = ["soft", "paper", "dark"].includes(card.cardStyle) ? card.cardStyle : "soft";
    const borderStyle = ["none", "fine", "double"].includes(card.borderStyle) ? card.borderStyle : "fine";
    const paperIds = ["plain", "cream-lines", "blue-grid", "pink-dots", "leaf", "sunshine", "stars", "kraft", "ink-wash", "rainbow"];
    const textPaper = paperIds.includes(card.textPaper) ? card.textPaper : "plain";
    const titleColor = /^#[0-9a-f]{6}$/i.test(card.titleColor || "") ? card.titleColor : "";
    const contentColor = /^#[0-9a-f]{6}$/i.test(card.contentColor || "") ? card.contentColor : "";
    const style = [
      titleColor ? `--visual-ink:${titleColor}` : "",
      contentColor ? `--visual-body:${contentColor}` : ""
    ].filter(Boolean).join(";");
    const modeClass = options.mode === "editor"
      ? " editor-preview-card"
      : options.mode === "list" ? " list-preview-card" : "";
    const focusClass = options.focus === "images"
      ? " editor-focus-images"
      : options.focus === "text" ? " editor-focus-text" : "";
    const requestedCount = Number(card.imageLayoutCount);
    const layoutCount = requestedCount >= 1 && requestedCount <= 9
      ? requestedCount
      : Math.min(9, Math.max(1, imageCount));
    const variantClass = card.imageLayoutVariant === "two-horizontal" ? " preview-variant-two-horizontal" : "";
    const zeroClass = requestedCount === 0 || imageCount === 0 ? " pure-text-card" : "";
    return `class="life-card visual-card card-template-${template} card-style-${cardStyle} card-border-${borderStyle} text-paper-${textPaper} preview-layout-${layout} preview-count-${layoutCount}${variantClass}${zeroClass}${modeClass}${focusClass}" data-image-layout="${layout}" data-image-count-layout="${layoutCount}"${interactive ? ` data-card-open="${escapeHtml(card.id)}" tabindex="0"` : ""}${style ? ` style="${style}"` : ""}`;
  }

  function render(card, images, options) {
    const settings = options || {};
    const safeImages = Array.isArray(images) ? images : [];
    const template = settings.template || recommendedTemplate(card, safeImages.length);
    const text = textParts(card, settings);
    const first = safeImages[0];
    const titleOrContent = text.title || text.content;
    const attrs = cardAttributes(card, template, settings, safeImages.length);
    const photo = (image, extraClass, remaining) => imageHtml(card.id, image, extraClass, remaining, settings.interactive !== false);
    const layout = effectiveLayout(card, safeImages.length);
    const requestedCount = Number(card.imageLayoutCount);
    const visibleLimit = requestedCount >= 1 && requestedCount <= 9
      ? requestedCount
      : layout === "hero" ? 1 : layout === "hero-2" ? 3 : layout === "hero-4" ? 5 : safeImages.length;
    const layoutImages = safeImages.slice(0, visibleLimit);
    if (settings.mode === "editor" && (settings.focus === "images" || settings.focus === "manage") && requestedCount >= 1 && requestedCount <= 9) {
      while (layoutImages.length < requestedCount) layoutImages.push(null);
    }
    const mediaImages = layoutImages;
    const media = (className) => `
      <div class="template-media media-layout-${layout} ${className || ""}">
        ${mediaImages.length ? mediaImages.map((image, index) => photo(image, "", index === mediaImages.length - 1 ? safeImages.length - mediaImages.length : 0)).join("") : photo(null)}
      </div>`;

    if (template === "a") {
      return `<article ${attrs}><div class="a-hero">${media("")}</div><div class="a-caption">${text.subtitle}${titleOrContent}${text.title ? text.content : ""}<div class="visual-meta">${text.date}${text.tags}</div></div></article>`;
    }
    if (template === "b") {
      return `<article ${attrs}><div class="b-photo">${media("")}</div><div class="b-body">${text.subtitle}${text.title}${text.content}<div class="b-rule"></div>${text.date}${text.tags}</div></article>`;
    }
    if (template === "c") {
      const visible = layoutImages;
      return `<article ${attrs}><div class="c-gallery">${visible.length ? visible.map((image, index) => photo(image, `c-photo-${index + 1}`, index === visible.length - 1 ? safeImages.length - visible.length : 0)).join("") : photo(null)}</div><div class="c-body">${text.subtitle}${text.title}${text.content}<div class="visual-meta">${text.date}${text.tags}</div></div></article>`;
    }
    if (template === "d") {
      const day = new Date(card.createdAt).getDate();
      return `<article ${attrs}><div class="d-issue"><span>LIFE SPACE · MEMORY</span><span>NO. ${String(Number.isNaN(day) ? 1 : day).padStart(3, "0")}</span></div><div class="d-heading">${text.subtitle}${text.title}</div><div class="d-photo">${media("")}</div><div class="d-story"><span class="d-dropcap">${escapeHtml((card.title || card.content || "生").trim().charAt(0) || "生")}</span>${text.content}</div><div class="d-footer">${text.date}${text.tags}</div></article>`;
    }
    if (template === "e") {
      if (requestedCount === 0 || !safeImages.length) {
        return `<article ${attrs}>${text.subtitle}${text.title}${text.content}<div class="e-signature">—— 写给此刻的我</div><div class="visual-meta">${text.date}${text.tags}</div></article>`;
      }
      const diaryMedia = safeImages.length > 1 ? media("e-multi-gallery") : first ? `<div class="e-photo">${photo(first, "", 0)}</div>` : "";
      return `<article ${attrs}><div class="e-top"><div class="e-calendar">${formatDate(card.createdAt, false)}</div>${safeImages.length <= 1 ? diaryMedia : ""}</div>${safeImages.length > 1 ? diaryMedia : ""}${text.subtitle}${text.title}${text.content}<div class="e-signature">—— 写给此刻的我</div>${text.tags}</article>`;
    }

    const visible = layoutImages;
    return `<article ${attrs}><div class="f-stamp">LIFE<br>MEMORY</div><div class="f-gallery">${visible.length ? visible.map((image, index) => photo(image, `f-photo-${index + 1}`, index === visible.length - 1 ? safeImages.length - visible.length : 0)).join("") : photo(null)}</div><div class="f-caption">${text.subtitle}${text.title}${text.content}<div class="visual-meta">${text.date}${text.tags}</div></div></article>`;
  }

  window.LifeCardRenderer = Object.freeze({
    escapeHtml,
    formatDate,
    formatDotDate,
    recommendedTemplate,
    render,
    visibilityLabel,
    templateNames: Object.freeze(templateNames)
  });
})();
