(function () {
  var state = { manifest: null, ready: null };
  function detectBranch() {
    var ua = navigator.userAgent || "";
    var isIOS = /iP(hone|ad|od)/.test(ua) || (/Mac/.test(navigator.platform || "") && navigator.maxTouchPoints > 1);
    var isSafari = /safari/i.test(ua) && !/chrome|chromium|crios|android|edg|opr/i.test(ua);
    var isMobile = /iPhone|iPad|iPod|Android/i.test(ua) || (/Mac/.test(navigator.platform || "") && navigator.maxTouchPoints > 1);
    return isIOS || isSafari ? "iphone-safari" : (isMobile ? "android-mobile" : "desktop-chrome");
  }
  function load(url) {
    if (state.manifest) return Promise.resolve(state.manifest);
    if (state.ready) return state.ready;
    state.ready = fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("seven-stars-assets-manifest.json " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        if (!manifest || !manifest.items) throw new Error("invalid seven-stars media manifest");
        state.manifest = manifest;
        return manifest;
      })
      .catch(function (error) {
        console.warn("[seven-stars-media] manifest load failed", error);
        return null;
      });
    return state.ready;
  }
  function getItem(itemId) {
    return state.manifest && state.manifest.items ? state.manifest.items[itemId] || null : null;
  }
  function resolve(input) {
    var branch = detectBranch();
    var item = input && input.itemId ? getItem(input.itemId) : null;
    var media = item || input || {};
    var candidates = [];
    function push(kind, url, type) {
      if (url) candidates.push({ kind: kind, url: url, type: type || "" });
    }
    if (branch === "iphone-safari") {
      if (media.alphaVerified && media.hevcAlpha) {
        push("hevc", media.hevcAlpha, 'video/mp4; codecs="hvc1"');
        push("h264", media.h264Fallback, "video/mp4");
        push("vp9", media.vp9Alpha, 'video/webm; codecs="vp9"');
      } else {
        push("h264", media.h264Fallback, "video/mp4");
        push("vp9", media.vp9Alpha, 'video/webm; codecs="vp9"');
      }
    } else {
      push("vp9", media.vp9Alpha, 'video/webm; codecs="vp9"');
      push("h264", media.h264Fallback, "video/mp4");
    }
    return {
      branch: branch,
      itemId: media.itemId || "",
      characterId: media.characterId || "",
      alphaVerified: !!media.alphaVerified,
      status: media.status || "pending-alpha",
      assetVersion: media.assetVersion || "",
      fallbackReason: media.alphaVerified ? "none" : "alpha-not-yet-verified",
      candidates: candidates
    };
  }
  function report(payload) {
    try { console.info("[seven-stars-media]", payload); } catch (e) {}
    var enabled = /(?:\?|&)(?:debugMedia|debug)=1(?:&|$)/.test(location.search);
    if (!enabled || !document.body) return;
    var panel = document.getElementById("sevenStarsMediaDebug");
    if (!panel) {
      panel = document.createElement("pre");
      panel.id = "sevenStarsMediaDebug";
      panel.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;max-height:38vh;overflow:auto;margin:0;padding:8px 10px;border:1px solid rgba(125,139,255,.5);border-radius:10px;background:rgba(5,7,18,.94);color:#dce2ff;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;pointer-events:none";
      document.body.appendChild(panel);
    }
    panel.textContent = JSON.stringify(payload, null, 2);
  }
  window.LuguSevenStarsMediaResolver = {
    load: load,
    getItem: getItem,
    resolve: resolve,
    detectBranch: detectBranch,
    report: report,
    version: "20260918-unified-resolver-r1"
  };
})();
