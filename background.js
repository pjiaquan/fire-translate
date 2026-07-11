// background.js for Fire Translate

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "translate-selection",
    title: "Translate with Fire Translate",
    contexts: ["selection"]
  });
  
  // Set default settings if not already present
  chrome.storage.local.get([
    "apiEndpoint",
    "model",
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
    "textSize"
  ], (result) => {
    const defaults = {};
    if (result.apiEndpoint === undefined) defaults.apiEndpoint = "http://192.168.3.202:4090";
    if (result.model === undefined) defaults.model = "qwen";
    if (result.temperature === undefined) defaults.temperature = 0.1;
    if (result.systemPrompt === undefined) {
      defaults.systemPrompt = "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
    }
    if (result.richLearningMode === undefined) defaults.richLearningMode = true;
    if (result.systemPromptLearning === undefined) {
      defaults.systemPromptLearning = `你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（同義詞、替換翻譯及關鍵字詞彙）。
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
      "synonyms": ["（同義詞1）", "（同義詞2）"],
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
    
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

// Translation caching utilities
async function getCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode) {
  const normalizedText = srcText.trim().toLowerCase();
  const cacheKey = `${srcLang}:${targetLang}:${model}:${richLearningMode}:${normalizedText}`;
  
  const res = await chrome.storage.local.get("translationCache");
  const cache = res.translationCache || {};
  
  if (cache[cacheKey]) {
    const cacheAge = Date.now() - cache[cacheKey].timestamp;
    const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days TTL
    if (cacheAge < TTL) {
      return cache[cacheKey].data;
    }
  }
  return null;
}

async function setCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, translationData) {
  const normalizedText = srcText.trim().toLowerCase();
  const cacheKey = `${srcLang}:${targetLang}:${model}:${richLearningMode}:${normalizedText}`;
  
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

// Perform fetch translation for inline content scripts (non-streaming)
async function translateInlineText(srcText) {
  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "model",
    "temperature",
    "systemPrompt",
    "systemPromptLearning",
    "targetLang",
    "richLearningMode",
    "sourceLang"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const model = config.model || "qwen";
  const temp = parseFloat(config.temperature ?? 0.1);
  const targetLang = config.targetLang || "zh-TW";
  const sourceLang = config.sourceLang || "auto";
  const richLearningMode = config.richLearningMode !== false;

  // Check cache first
  const cached = await getCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode);
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
  const endpointUrl = `${apiEndpoint.replace(/\/$/, "")}/v1/chat/completions`;

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: srcText }
      ],
      temperature: temp
    })
  });

  if (!response.ok) {
    throw new Error(`Phase 1 HTTP error ${response.status}`);
  }

  const data = await response.json();
  if (data.choices && data.choices[0] && data.choices[0].message) {
    const translatedText = data.choices[0].message.content.trim();
    
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
        await setCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, resultData);
        return resultData;
      } catch (err2) {
        console.warn("Inline non-stream Phase 2 failed", err2);
        const resultData = { rich: false, text: translatedText };
        await setCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, resultData);
        return resultData;
      }
    } else {
      const resultData = { rich: false, text: translatedText };
      await setCachedTranslation(srcText, sourceLang, targetLang, model, richLearningMode, resultData);
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
    translateInlineText(message.text)
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
  }
});

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
async function runStreamTranslationPhase1(srcText, onChunk) {
  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "model",
    "temperature",
    "systemPrompt",
    "targetLang"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const model = config.model || "qwen";
  const temp = parseFloat(config.temperature ?? 0.1);
  const targetLang = config.targetLang || "zh-TW";

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
  const endpointUrl = `${apiEndpoint.replace(/\/$/, "")}/v1/chat/completions`;

  const payload = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: srcText }
    ],
    temperature: temp,
    stream: true
  };

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    "temperature",
    "systemPromptLearning"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
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
  const endpointUrl = `${apiEndpoint.replace(/\/$/, "")}/v1/chat/completions`;

  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
        try {
          // Check cache first in streaming listener
          const config = await chrome.storage.local.get(["targetLang", "richLearningMode", "model", "sourceLang"]);
          const targetLang = config.targetLang || "zh-TW";
          const sourceLang = config.sourceLang || "auto";
          const richLearningMode = config.richLearningMode !== false;
          const model = config.model || "qwen";
          
          const cached = await getCachedTranslation(msg.text, sourceLang, targetLang, model, richLearningMode);
          if (cached) {
            const rawText = cached.rich ? JSON.stringify(cached.parsed) : cached.text;
            port.postMessage({ type: "chunk", data: rawText });
            port.postMessage({ type: "done" });
            return;
          }

          // Phase 1: Translate & Stream
          let translationText = "";
          await runStreamTranslationPhase1(msg.text, (type, data) => {
            if (type === "chunk") {
              translationText += data;
              try {
                port.postMessage({ type: "chunk", data: data });
              } catch (e) {}
            }
          });

          // Send done translation signal
          try {
            port.postMessage({ type: "done-translation", text: translationText });
          } catch (e) {
            return; // Port was closed, abort Phase 2
          }

          // Phase 2: Learning Insights
          if (richLearningMode) {
            try {
              const insights = await fetchLearningInsights(msg.text, translationText, targetLang, model);
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
              await setCachedTranslation(msg.text, sourceLang, targetLang, model, richLearningMode, cacheData);
            } catch (err2) {
              console.warn("Inline Phase 2 insights failed", err2);
              try {
                port.postMessage({ type: "done" });
              } catch (e) {}
              
              const cacheData = { rich: false, text: translationText };
              await setCachedTranslation(msg.text, sourceLang, targetLang, model, richLearningMode, cacheData);
            }
          } else {
            try {
              port.postMessage({ type: "done" });
            } catch (e) {}
            
            const cacheData = { rich: false, text: translationText };
            await setCachedTranslation(msg.text, sourceLang, targetLang, model, richLearningMode, cacheData);
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
