export const DEFAULT_ITEM_ID = "rabbit-happy";

let registryPromise = null;

export async function loadRegistry() {
  if (registryPromise) return registryPromise;
  registryPromise = fetch("./frontstage-items.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`registry HTTP ${response.status}`);
      return response.json();
    })
    .then((registry) => {
      if (!registry || !registry.items) throw new Error("invalid frontstage registry");
      return registry.items;
    });
  return registryPromise;
}

export async function getRegisteredItem(itemId = DEFAULT_ITEM_ID) {
  const items = await loadRegistry();
  const item = items[itemId];
  if (!item) throw new Error(`Unknown frontstage item: ${itemId}`);
  return item;
}
