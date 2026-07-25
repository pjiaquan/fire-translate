// background.js for Fire Translate

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate with Fire Translate",
    contexts: ["selection"]
  });
  
  // Clear translation cache on install/update to ensure new prompts take effect immediately
  chrome.storage.local.remove("translationCache");
  
  // Set default settings if not already present
  chrome.storage.local.get([
    "apiEndpoint",
    "apiKey",
    "model",
    "modelType",
    "temperature",
    "systemPrompt",
    "maxHistory",
    "history",
    "logs",
    "theme",
    "sourceLang",
    "targetLang",
    "richLearningMode",
    "systemPromptLearning",
    "streamTranslations",
    "textSize",
    "enableTelegram",
    "telegramBotToken",
    "telegramChatId"
  ], (result) => {
    const defaults = {};
    if (result.apiEndpoint === undefined) defaults.apiEndpoint = "http://192.168.3.202:4090";
    if (result.apiKey === undefined) defaults.apiKey = "";
    if (result.model === undefined) defaults.model = "qwen";
    if (result.temperature === undefined) defaults.temperature = 0.1;
    if (result.systemPrompt === undefined) {
      defaults.systemPrompt = "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
    }
    if (result.richLearningMode === undefined) defaults.richLearningMode = true;
    const isOldPrompt = result.systemPromptLearning && !result.systemPromptLearning.includes("並且在括號內附帶對應翻譯");
    if (result.systemPromptLearning === undefined || isOldPrompt) {
      defaults.systemPromptLearning = `你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（與原文字同語言的相似詞/同義字、替換翻譯及關鍵字詞彙）。
請務必只返回一個符合以下 JSON 格式的物件，不要包含 any Markdown 標記（如 \`\`\`json）、前言、後記或解釋：

{
  "alternatives": [
    {
      "text": "（另一種翻譯方式，例如更正式、更口語或不同語氣的翻譯）",
      "tone": "（例如：正式商務、日常口語、書面文學）",
      "explanation": "（說明這個翻譯的適用場景或細微差異）"
    }
  ],
  "vocabulary": [
    {
      "word": "（從輸入文字中提取的關鍵字，原文字語言）",
      "pos": "（詞性，例如 n. / v. / adj.）",
      "translation": "（該關鍵詞在{target_lang}中的對應翻譯）",
      "synonyms": ["（與原文字同語言的相似詞/同義字，並且在括號內附帶對應翻譯，例如若原文字為英文，請提供如 distraction (分心)、clutter (雜亂) 等格式的英文同義字與翻譯）"],
      "when_to_use": "（說明此字詞的使用時機、搭配語境或使用習慣）",
      "example_sentence_source": "（使用此關鍵字的英文/原語言例句）",
      "example_sentence_target": "（該例句翻譯成{target_lang}的結果）"
    }
  ]
}`;
    }
    if (result.maxHistory === undefined) defaults.maxHistory = 100;
    if (result.history === undefined) defaults.history = [];
    if (result.logs === undefined) defaults.logs = [];
    if (result.theme === undefined) defaults.theme = "dark";
    if (result.sourceLang === undefined) defaults.sourceLang = "auto";
    if (result.targetLang === undefined) defaults.targetLang = "繁體中文";
    if (result.doubleClickTranslate === undefined) defaults.doubleClickTranslate = true;
    if (result.streamTranslations === undefined) defaults.streamTranslations = true;
    if (result.textSize === undefined) defaults.textSize = "medium";
    if (result.enableTelegram === undefined) defaults.enableTelegram = false;
    if (result.telegramBotToken === undefined) defaults.telegramBotToken = "";
    if (result.telegramChatId === undefined) defaults.telegramChatId = "";
    if (result.modelType === undefined) defaults.modelType = "qwen";
    
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

// Translation caching utilities
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

function getBilingualLangName(lang) {
  const mapping = {
    "auto": "自動偵測 / Auto Detect",
    "zh-TW": "繁體中文 / Traditional Chinese",
    "zh-CN": "簡體中文 / Simplified Chinese",
    "en": "English",
    "ja": "日本語 / Japanese",
    "ko": "韓國語 / Korean",
    "es": "Español / Spanish",
    "fr": "Français / French",
    "de": "Deutsch / German",
    "ru": "Русский / Russian",
    "pt": "Português / Portuguese",
    "it": "Italiano / Italian"
  };
  if (lang === "繁體中文" || lang === "zh-TW" || lang === "zh-Hant") return "繁體中文 / Traditional Chinese";
  if (lang === "簡體中文" || lang === "zh-CN" || lang === "zh-Hans") return "簡體中文 / Simplified Chinese";
  return mapping[lang] || lang;
}

function getGemmaLangCode(lang) {
  if (!lang) return "en";
  if (lang === "auto") return "en";
  if (lang === "zh-TW" || lang === "繁體中文" || lang === "zh-Hant") return "zh_Hant";
  if (lang === "zh-CN" || lang === "簡體中文" || lang === "zh-Hans") return "zh_Hans";
  return lang;
}

function cleanTranslateText(text) {
  if (!text) return "";
  // 1. Strip HTML tags
  let cleaned = text.replace(/<\/?[^>]+(>|$)/g, "");
  // 2. Remove control characters and non-printable characters
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  // 3. Strip edge non-alphanumeric punctuation and symbols
  cleaned = cleaned.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  return cleaned.trim();
}

function isUrlLike(text) {
  const trimmed = text.trim();
  // 1. Protocol prefix (http://, https://, ftp://, file://, chrome://, etc.)
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return true;
  }
  // 2. Starts with www.
  if (/^www\./i.test(trimmed)) {
    return true;
  }
  // 3. Email addresses
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(trimmed)) {
    return true;
  }
  // 4. Domain names (e.g. google.com, news.ycombinator.com/item)
  const urlPattern = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(\/[-a-zA-Z0-9()@:%_\+.~#?&//=]*)?$/i;
  if (urlPattern.test(trimmed)) {
    return true;
  }
  return false;
}

function isApiKeyLike(text) {
  const trimmed = text.trim();
  // Groq API keys (gsk_...)
  if (/^gsk_[a-zA-Z0-9]{40,}/.test(trimmed)) return true;
  // OpenAI API keys (sk-...)
  if (/^sk-[a-zA-Z0-9]{20,}/.test(trimmed)) return true;
  // Anthropic/Claude API keys (sk-ant-...)
  if (/^sk-ant-[a-zA-Z0-9_-]{20,}/.test(trimmed)) return true;
  // Google/Gemini API keys (AIza...)
  if (/^AIza[0-9A-Za-z_-]{30,}/.test(trimmed)) return true;
  // HuggingFace API keys (hf_...)
  if (/^hf_[a-zA-Z0-9]{20,}/.test(trimmed)) return true;
  // Generic: long random-looking alphanumeric strings (30+ chars, has digits and letters)
  if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed) && /[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) return true;
  return false;
}

function formatChatEndpointUrl(apiEndpoint) {
  if (!apiEndpoint) return "http://192.168.3.202:4090/v1/chat/completions";
  let clean = apiEndpoint.trim().replace(/\/$/, "");
  if (clean.endsWith("/chat/completions")) {
    return clean;
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

// Perform fetch translation for inline content scripts (non-streaming)
async function translateInlineText(srcText, contextSentence = "") {
  srcText = cleanTranslateText(srcText);
  if (!srcText || !/\p{L}/u.test(srcText) || isUrlLike(srcText) || isApiKeyLike(srcText)) {
    return { rich: false, text: "" };
  }

  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "apiKey",
    "googleOAuthToken",
    "model",
    "modelType",
    "temperature",
    "systemPrompt",
    "systemPromptLearning",
    "targetLang",
    "richLearningMode",
    "sourceLang"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const apiKey = config.apiKey || config.googleOAuthToken || "";
  const model = config.model || "qwen";
  const modelType = config.modelType || "qwen";
  const temp = parseFloat(config.temperature ?? 0.1);
  const targetLang = config.targetLang || "zh-TW";
  const sourceLang = config.sourceLang || "auto";
  const richLearningMode = config.richLearningMode !== false;

  // Check cache first
  const cached = await getCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, contextSentence);
  if (cached) {
    return cached;
  }

  // Phase 1: Translate (always simple translation prompt)
  const languageNames = {
    "auto": "自動偵測",
    "zh-TW": "繁體中文",
    "zh-CN": "簡體中文",
    "en": "English",
    "ja": "日本語",
    "ko": "韓國語",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "ru": "Русский",
    "pt": "Português",
    "it": "Italiano"
  };

  const rawSystemPrompt = config.systemPrompt || "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  const targetLangName = languageNames[targetLang] || targetLang;
  const systemPrompt = rawSystemPrompt.replace(/{target_lang}/g, targetLangName);
  const endpointUrl = formatChatEndpointUrl(apiEndpoint);

  let userContent = srcText;
  let systemPromptAdjusted = systemPrompt;
  if (modelType !== "translategemma") {
    if (contextSentence && contextSentence.trim() !== srcText.trim()) {
      userContent = `請將單字/片語「${srcText}」翻譯成${targetLangName}。
（該單字/片語在原文中的上下文句子為：「${contextSentence}」，請依據此上下文來理解意思並進行翻譯。你只需翻譯「${srcText}」本身，絕對不要翻譯整個句子，也不要輸出引號、任何解釋、說明或英文原文。）`;
      systemPromptAdjusted = `${systemPrompt}
目前該單字/片語所屬的上下文句子為：「${contextSentence}」。
請特別注意：你必須只翻譯使用者輸入的單字/片語本身（即「${srcText}」），並使其符合上下文句子的語境與詞性。
請直接輸出翻譯後的結果，絕對不要包含上下文句子、原文單字、引號、任何解釋、前言、後記、選項或問候語。`;
    } else {
      const isWord = srcText.trim().split(/\s+/).length === 1;
      if (isWord) {
        userContent = `請將單字「${srcText}」翻譯成${targetLangName}。
如果該單字有多個常用翻譯，請「僅」以無前言後記的 Markdown 無序列表（bullet list）形式輸出這些翻譯，例如：
* 渲染
* 呈現
* 描繪
絕對不要包含原文字、任何解釋、例句、引言、問候語、前言或後續說明。`;
      } else {
        userContent = `請將以下文字直接翻譯成${targetLangName}。只輸出翻譯後的結果，絕對不要包含任何解釋、說明、引號、前言、後記、選項或問候語：\n\n${srcText}`;
      }
    }
  }

  let messagesPayload;
  let targetTemp = temp;
  if (modelType === "translategemma") {
    targetTemp = 0;
    messagesPayload = [
      {
        role: "user",
        content: `Translate this to ${getGemmaLangCode(targetLang)}:\n${srcText}`
      }
    ];
  } else {
    messagesPayload = [
      { role: "system", content: systemPromptAdjusted },
      { role: "user", content: userContent }
    ];
  }

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: model,
      messages: messagesPayload,
      temperature: targetTemp
    })
  });

  if (!response.ok) {
    throw new Error(`Phase 1 HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const translatedText = data.choices[0].message.content.trim();
    
    // Save to history log
    await addHistoryItemBg(srcText, translatedText, sourceLang, targetLang);

    // Dispatch to Telegram (if enabled)
    sendToTelegram(srcText, translatedText).catch(() => {});
    
    if (richLearningMode) {
      try {
        const insights = await fetchLearningInsights(srcText, translatedText, targetLang, model);
        const resultData = {
          rich: true,
          parsed: {
            translation: translatedText,
            alternatives: insights.alternatives || [],
            vocabulary: insights.vocabulary || []
          }
        };
        await setCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, resultData, contextSentence);
        return resultData;
      } catch (err2) {
        console.warn("Inline non-stream Phase 2 failed", err2);
        const resultData = { rich: false, text: translatedText };
        await setCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, resultData, contextSentence);
        return resultData;
      }
    } else {
      const resultData = { rich: false, text: translatedText };
      await setCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, resultData, contextSentence);
      return resultData;
    }
  } else {
    throw new Error("Invalid response format from translation server");
  }
}

const activePhase2Fetches = new Map();

async function updateHistoryItemWithRich(srcText, parsedData, srcLang, targetLang) {
  const res = await chrome.storage.local.get("history");
  let history = res.history || [];
  const idx = history.findIndex(item => item.srcText === srcText && item.targetLang === targetLang);
  if (idx !== -1) {
    history[idx].translatedText = JSON.stringify(parsedData);
    await chrome.storage.local.set({ history: history });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "translateInline") {
    translateInlineText(message.text, message.contextSentence)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  } else if (message.action === "fetchPhase2Background") {
    const { srcText, translatedText, targetLang, model, sourceLang } = message;
    if (!srcText) return;

    if (activePhase2Fetches.has(srcText)) {
      return; // Already running
    }

    const promise = (async () => {
      try {
        const insights = await fetchLearningInsights(srcText, translatedText, targetLang, model);
        const cacheData = {
          rich: true,
          parsed: {
            translation: translatedText,
            alternatives: insights.alternatives || [],
            vocabulary: insights.vocabulary || []
          }
        };
        await setCachedTranslation(srcText, sourceLang, targetLang, model, true, cacheData);
        await updateHistoryItemWithRich(srcText, cacheData.parsed, sourceLang, targetLang);
        
        // Broadcast completion to any active popup/sidepanel UI
        chrome.runtime.sendMessage({
          action: "phase2Completed",
          srcText: srcText,
          parsed: cacheData.parsed
        }).catch(() => {});
      } catch (err) {
        console.warn("Background Phase 2 insights failed:", err);
        const cacheData = { rich: false, text: translatedText };
        await setCachedTranslation(srcText, sourceLang, targetLang, model, true, cacheData);
      } finally {
        activePhase2Fetches.delete(srcText);
      }
    })();

    activePhase2Fetches.set(srcText, promise);
  } else if (message.action === "sendTelegram") {
    sendToTelegram(message.srcText, message.translatedText);
  }
});

function isToday(isoString) {
  if (!isoString) return false;
  const date = new Date(isoString);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
         date.getMonth() === today.getMonth() &&
         date.getDate() === today.getDate();
}

function escapeTelegramHTML(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function addHistoryItemBg(src, target, srcLang, targetLang) {
  const res = await chrome.storage.local.get("history");
  let history = res.history || [];
  
  if (history.length > 0 && history[0].srcText === src && history[0].targetLang === targetLang) {
    return;
  }
  
  const newItem = {
    id: Date.now().toString(),
    srcText: src,
    translatedText: target,
    srcLang,
    targetLang,
    timestamp: new Date().toISOString()
  };
  
  history.unshift(newItem);
  
  const config = await chrome.storage.local.get("maxHistory");
  const maxHistory = config.maxHistory || 100;
  if (history.length > maxHistory) {
    history = history.slice(0, maxHistory);
  }
  
  await chrome.storage.local.set({ history });
}

async function addLogBg(type, message, details = null) {
  try {
    const res = await chrome.storage.local.get("logs");
    let logs = res.logs || [];
    logs.unshift({
      timestamp: new Date().toISOString(),
      type,
      message,
      details
    });
    if (logs.length > 200) logs = logs.slice(0, 200);
    await chrome.storage.local.set({ logs });
  } catch (e) {
    console.error("Failed to write background log:", e);
  }
}

async function sendToTelegram(srcText, translatedText) {
  const cleanSrc = cleanTranslateText(srcText);
  const cleanTarget = (translatedText || "").trim();
  if (!cleanSrc || !cleanTarget) return;

  const config = await chrome.storage.local.get([
    "enableTelegram",
    "telegramBotToken",
    "telegramChatId",
    "history"
  ]);

  if (!config.enableTelegram || !config.telegramBotToken || !config.telegramChatId) {
    return;
  }

  const botToken = config.telegramBotToken.trim();
  const chatId = config.telegramChatId.trim();
  if (!botToken || !chatId) return;

  let history = config.history || [];
  let todayItems = history.filter(item => isToday(item.timestamp));

  const currentInHistory = todayItems.some(item => cleanTranslateText(item.srcText) === cleanSrc);
  if (!currentInHistory) {
    todayItems.unshift({
      srcText: cleanSrc,
      translatedText: cleanTarget,
      timestamp: new Date().toISOString()
    });
  }

  let htmlMessage = `<b>🔥 Fire Translate - Daily Review (${new Date().toLocaleDateString()})</b>\n\n`;
  todayItems.forEach((item, idx) => {
    const srcTextSafe = String(item.srcText || "");
    let cleanTranslation = item.translatedText || "";
    if (typeof cleanTranslation === "string" && cleanTranslation.startsWith("{") && cleanTranslation.endsWith("}")) {
      try {
        const parsed = JSON.parse(cleanTranslation);
        cleanTranslation = parsed.translation || "";
      } catch (e) {}
    }
    const transTextSafe = String(cleanTranslation);
    htmlMessage += `${idx + 1}. <b>${escapeTelegramHTML(srcTextSafe)}</b> → ${escapeTelegramHTML(transTextSafe)}\n`;
  });

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: htmlMessage,
        parse_mode: "HTML"
      })
    });
    if (!response.ok) {
      const responseText = await response.text();
      console.warn("Telegram send failed:", response.status, responseText);
      await addLogBg("error", `Telegram send failed (HTTP ${response.status})`, { responseText, chatId });
    } else {
      await addLogBg("info", `Daily review list sent to Telegram (${todayItems.length} items)`, { chatId });
    }
  } catch (err) {
    console.warn("Error sending to Telegram:", err);
    await addLogBg("error", `Error sending to Telegram: ${err.message}`, { stack: err.stack, chatId });
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "translate-selection" && info.selectionText) {
    const text = info.selectionText;
    
    // Save selection to storage so the popup or sidepanel can load it on launch
    await chrome.storage.local.set({ pendingTranslationText: text });

    // Open the side panel if supported
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.warn("Could not open side panel via API:", err);
      }
    }

    // Broadcast the selection immediately in case popup/sidepanel is already open
    chrome.runtime.sendMessage({
      action: "translateText",
      text: text
    }).catch(() => {
      // Ignore error if no listeners are open
    });

    // Pop up the inline translation bubble on the webpage
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "showContextBubble",
        text: text
      }).catch((err) => {
        console.warn("Could not send context message to webpage:", err);
      });
    }
  }
});

// Run Phase 1 translation fetch stream
async function runStreamTranslationPhase1(srcText, onChunk, contextSentence = "") {
  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "apiKey",
    "googleOAuthToken",
    "model",
    "modelType",
    "temperature",
    "systemPrompt",
    "targetLang",
    "sourceLang"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const apiKey = config.apiKey || config.googleOAuthToken || "";
  const model = config.model || "qwen";
  const modelType = config.modelType || "qwen";
  const temp = parseFloat(config.temperature ?? 0.1);
  const targetLang = config.targetLang || "zh-TW";
  const sourceLang = config.sourceLang || "auto";

  const languageNames = {
    "auto": "自動偵測",
    "zh-TW": "繁體中文",
    "zh-CN": "簡體中文",
    "en": "English",
    "ja": "日本語",
    "ko": "韓國語",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "ru": "Русский",
    "pt": "Português",
    "it": "Italiano"
  };

  const rawSystemPrompt = config.systemPrompt || "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  const targetLangName = languageNames[targetLang] || targetLang;
  const systemPrompt = rawSystemPrompt.replace(/{target_lang}/g, targetLangName);
  const endpointUrl = formatChatEndpointUrl(apiEndpoint);

  let userContent = srcText;
  let systemPromptAdjusted = systemPrompt;
  if (modelType !== "translategemma") {
    if (contextSentence && contextSentence.trim() !== srcText.trim()) {
      userContent = `請將單字/片語「${srcText}」翻譯成${targetLangName}。
（該單字/片語在原文中的上下文句子為：「${contextSentence}」，請依據此上下文來理解意思並進行翻譯。你只需翻譯「${srcText}」本身，絕對不要翻譯整個句子，也不要輸出引號、任何解釋、說明或英文原文。）`;
      systemPromptAdjusted = `${systemPrompt}
目前該單字/片語所屬的上下文句子為：「${contextSentence}」。
請特別注意：你必須只翻譯使用者輸入的單字/片語本身（即「${srcText}」），並使其符合上下文句子的語境與詞性。
請直接輸出翻譯後的結果，絕對不要包含上下文句子、原文單字、引號、任何解釋、前言、後記、選項或問候語。`;
    } else {
      const isWord = srcText.trim().split(/\s+/).length === 1;
      if (isWord) {
        userContent = `請將單字「${srcText}」翻譯成${targetLangName}。
如果該單字有多個常用翻譯，請「僅」以無前言後記的 Markdown 無序列表（bullet list）形式輸出這些翻譯，例如：
* 渲染
* 呈現
* 描繪
絕對不要包含原文字、任何解釋、例句、引言、問候語、前言或後續說明。`;
      } else {
        userContent = `請將以下文字直接翻譯成${targetLangName}。只輸出翻譯後的結果，絕對不要包含任何解釋、說明、引號、前言、後記、選項或問候語：\n\n${srcText}`;
      }
    }
  }

  let messagesPayload;
  let targetTemp = temp;
  if (modelType === "translategemma") {
    targetTemp = 0;
    messagesPayload = [
      {
        role: "user",
        content: `Translate this to ${getGemmaLangCode(targetLang)}:\n${srcText}`
      }
    ];
  } else {
    messagesPayload = [
      { role: "system", content: systemPromptAdjusted },
      { role: "user", content: userContent }
    ];
  }

  const payload = {
    model: model,
    messages: messagesPayload,
    temperature: targetTemp,
    stream: true
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Phase 1 HTTP error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      const cleanedLine = line.trim();
      if (!cleanedLine) continue;
      if (cleanedLine === "data: [DONE]") break;

      if (cleanedLine.startsWith("data: ")) {
        try {
          const parsedLine = JSON.parse(cleanedLine.substring(6));
          if (parsedLine.choices && parsedLine.choices[0] && parsedLine.choices[0].delta) {
            const content = parsedLine.choices[0].delta.content || "";
            if (content) {
              onChunk("chunk", content);
            }
          }
        } catch (e) {}
      }
    }
  }
}

// Run Phase 2 learning insights fetch
async function fetchLearningInsights(srcText, translationText, targetLang, model) {
  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "apiKey",
    "googleOAuthToken",
    "temperature",
    "systemPromptLearning"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const apiKey = config.apiKey || config.googleOAuthToken || "";
  const temp = parseFloat(config.temperature ?? 0.1);
  const rawSystemPrompt = config.systemPromptLearning || "你是一個專業的語言學習助手。";
  
  const languageNames = {
    "auto": "自動偵測",
    "zh-TW": "繁體中文",
    "zh-CN": "簡體中文",
    "en": "English",
    "ja": "日本語",
    "ko": "韓國語",
    "es": "Español",
    "fr": "Français",
    "de": "Deutsch",
    "ru": "Русский",
    "pt": "Português",
    "it": "Italiano"
  };

  const targetLangName = languageNames[targetLang] || targetLang;
  const systemPrompt = rawSystemPrompt.replace(/{target_lang}/g, targetLangName);
  const endpointUrl = formatChatEndpointUrl(apiEndpoint);

  const headers = { "Content-Type": "application/json" };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Original Text: "${srcText}"\nTranslation: "${translationText}"` }
      ],
      temperature: temp,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Phase 2 HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const resultText = data.choices[0].message.content.trim();
    const cleanedText = resultText.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    try {
      return JSON.parse(cleanedText);
    } catch (e) {
      const startIdx = resultText.indexOf("{");
      const endIdx = resultText.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        return JSON.parse(resultText.substring(startIdx, endIdx + 1));
      }
      throw e;
    }
  }
  throw new Error("Invalid response JSON structure for insights");
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "translate-stream") {
    port.onMessage.addListener(async (msg) => {
      if (msg.action === "translateStreamInline" && msg.text) {
        const cleanedText = cleanTranslateText(msg.text);
        if (!/\p{L}/u.test(cleanedText) || isUrlLike(cleanedText) || isApiKeyLike(cleanedText)) {
          try {
            port.postMessage({ type: "chunk", data: "" });
            port.postMessage({ type: "done" });
          } catch (e) {}
          return;
        }
        try {
          // Check cache first in streaming listener
          const config = await chrome.storage.local.get(["targetLang", "richLearningMode", "model", "sourceLang"]);
          const targetLang = config.targetLang || "zh-TW";
          const sourceLang = config.sourceLang || "auto";
          const richLearningMode = config.richLearningMode !== false;
          const model = config.model || "qwen";
          
          const cached = await getCachedTranslation(cleanedText, sourceLang, targetLang, model, richLearningMode, msg.contextSentence);
          if (cached) {
            const rawText = cached.rich ? JSON.stringify(cached.parsed) : cached.text;
            port.postMessage({ type: "chunk", data: rawText });
            port.postMessage({ type: "done" });
            return;
          }

          // Phase 1: Translate & Stream
          let translationText = "";
          await runStreamTranslationPhase1(cleanedText, (type, data) => {
            if (type === "chunk") {
              translationText += data;
              try {
                port.postMessage({ type: "chunk", data: data });
              } catch (e) {}
            }
          }, msg.contextSentence);

          // Send done translation signal
          try {
            port.postMessage({ type: "done-translation", text: translationText });
          } catch (e) {
            return; // Port was closed, abort Phase 2
          }

          // Save to history log
          await addHistoryItemBg(cleanedText, translationText, sourceLang, targetLang);

          // Send to Telegram (if enabled)
          sendToTelegram(cleanedText, translationText).catch(() => {});

          // Phase 2: Learning Insights
          if (richLearningMode) {
            try {
              const insights = await fetchLearningInsights(cleanedText, translationText, targetLang, model);
              try {
                port.postMessage({ type: "done-learning", parsed: insights });
              } catch (e) {
                return;
              }
              
              // Cache consolidated results
              const cacheData = {
                rich: true,
                parsed: {
                  translation: translationText,
                  alternatives: insights.alternatives || [],
                  vocabulary: insights.vocabulary || []
                }
              };
              await setCachedTranslation(cleanedText, sourceLang, targetLang, model, richLearningMode, cacheData, msg.contextSentence);
            } catch (err2) {
              console.warn("Inline Phase 2 insights failed", err2);
              try {
                port.postMessage({ type: "done" });
              } catch (e) {}
              
              const cacheData = { rich: false, text: translationText };
              await setCachedTranslation(cleanedText, sourceLang, targetLang, model, richLearningMode, cacheData, msg.contextSentence);
            }
          } else {
            try {
              port.postMessage({ type: "done" });
            } catch (e) {}
            
            const cacheData = { rich: false, text: translationText };
            await setCachedTranslation(cleanedText, sourceLang, targetLang, model, richLearningMode, cacheData, msg.contextSentence);
          }
        } catch (err) {
          try {
            port.postMessage({ type: "error", error: err.message });
          } catch (e) {}
        }
      }
    });
  }
});
