export const DEFAULT_ITEM_ID = "rabbit-happy";

export const ASSET_REGISTRY = Object.freeze({
  "rabbit-happy": Object.freeze({
    itemId: "rabbit-happy",
    characterId: "fengxin-rabbit",
    label: "开心",
    poster: "assets/characters/fengxin-rabbit/rabbit-happy.webp",
    posterFallback: "assets/characters/fengxin-rabbit/portrait.png",
    aspectRatio: 834 / 1112,
    duration: 5.041667,
    media: Object.freeze([
      Object.freeze({
        url: "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/fengxin-rabbit/01-rabbit-happy/delivery/rabbit_01_happy_alpha_vp9.webm",
        type: "video/webm",
        order: Object.freeze(["chromium", "firefox", "safari"])
      }),
      Object.freeze({
        url: "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/fengxin-rabbit/01-rabbit-happy/delivery/rabbit_01_happy_alpha_hevc.mov",
        type: "video/quicktime",
        order: Object.freeze(["safari", "chromium", "firefox"])
      }),
      Object.freeze({
        url: "https://pub-baeb836de8654e238577516dce76dea3.r2.dev/seven-stars/fengxin-rabbit/01-rabbit-happy/mobile-v2/rabbit_01_happy_mobile_black_v2.mp4",
        type: "video/mp4",
        order: Object.freeze(["chromium", "firefox", "safari"])
      })
    ])
  })
});

export function getRegisteredItem(itemId = DEFAULT_ITEM_ID) {
  const item = ASSET_REGISTRY[itemId];
  if (!item) throw new Error(`Unknown frontstage item: ${itemId}`);
  return item;
}
