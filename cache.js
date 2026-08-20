// cache.js - Shared caching utilities for translations

async function getCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, contextSentence = "") {
  const normalizedText = srcText.trim().toLowerCase();
  const suffix = contextSentence ? `:${contextSentence.trim().toLowerCase()}` : "";
  const cacheKey = `${srcLang}:${targetLang}:${model}:${richLearningMode}:${normalizedText}${suffix}`;

  const res = await chrome.storage.local.get("translationCache");
  const cache = res.translationCache || {};

  if (cache[cacheKey]) {
    const cacheAge = Date.now() - cache[cacheKey].timestamp;
    const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days TTL
    if (cacheAge < TTL) {
      const cachedData = cache[cacheKey].data;
      if (cachedData) {
        const transText = cachedData.rich ? cachedData.parsed?.translation : cachedData.text;
        const isShortSrc = srcText.trim().split(/\s+/).length <= 3;
        // If source text is short, but cached translation is long conversational English, bypass it
        if (isShortSrc && transText && transText.length > 50 && /[a-zA-Z]{4,}/.test(transText)) {
          return null;
        }
      }
      return cachedData;
    }
  }
  return null;
}

async function setCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, translationData, contextSentence = "") {
  const normalizedText = srcText.trim().toLowerCase();
  const suffix = contextSentence ? `:${contextSentence.trim().toLowerCase()}` : "";
  const cacheKey = `${srcLang}:${targetLang}:${model}:${richLearningMode}:${normalizedText}${suffix}`;

  const res = await chrome.storage.local.get("translationCache");
  const cache = res.translationCache || {};

  cache[cacheKey] = {
    data: translationData,
    timestamp: Date.now()
  };

  // Evict oldest items if cache size gets too large (limit to 500 items)
  const keys = Object.keys(cache);
  if (keys.length > 500) {
    keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
    for (let i = 0; i < 50; i++) {
      delete cache[keys[i]];
    }
  }
  await chrome.storage.local.set({ translationCache: cache });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getCachedTranslation,
    setCachedTranslation
  };
}
