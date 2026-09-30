import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const sourceDir = path.join(root, "candidate-20260927-frontstage-2c10-r1");
const output = path.join(root, "candidate-20260930-frontstage-player-v1-r1/frontstage-items.json");

const mediaManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "seven-stars-assets-manifest.json"), "utf8"));
const assetManifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "asset-manifest.json"), "utf8"));
const avconvertMap = JSON.parse(fs.readFileSync(path.join(sourceDir, "iphone-hevc-avconvert-map.json"), "utf8"));
const avconvertByItem = new Map(avconvertMap.rows.map((row) => [row.itemId, row.newHevcUrl]));

const items = {};
for (const [itemId, media] of Object.entries(mediaManifest.items)) {
  const asset = assetManifest.items[itemId] || {};
  const vp9 = media.vp9Alpha;
  const avconvertHevc = avconvertByItem.get(itemId) || null;
  const fallback = media.h264Fallback;
  const candidates = [];
  if (vp9) {
    candidates.push({
      url: vp9,
      type: 'video/webm; codecs="vp9"',
      alpha: true,
      order: ["chromium", "firefox", "safari"]
    });
  }
  if (avconvertHevc) {
    candidates.push({
      url: avconvertHevc,
      type: 'video/mp4; codecs="hvc1"',
      alpha: true,
      order: ["safari", "chromium", "firefox"]
    });
  }
  if (fallback) {
    candidates.push({
      url: fallback,
      type: "video/mp4",
      alpha: false,
      order: ["chromium", "firefox", "safari"]
    });
  }
  items[itemId] = {
    itemId,
    characterId: media.characterId,
    label: asset.label || "",
    poster: media.poster,
    posterFallback: media.posterFallback,
    aspectRatio: media.sourceWidth && media.sourceHeight ? media.sourceWidth / media.sourceHeight : 0.75,
    duration: Number(asset.webVp9?.duration || 0) || null,
    requireAlpha: true,
    media: candidates
  };
}

const registry = {
  version: 1,
  sourceCandidate: "candidate-20260927-frontstage-2c10-r1",
  generatedAt: new Date().toISOString(),
  itemCount: Object.keys(items).length,
  items
};

fs.writeFileSync(output, JSON.stringify(registry, null, 2) + "\n");
console.log(`wrote ${output}: ${registry.itemCount} items`);
