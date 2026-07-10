// popup.js for Fire Translate

// Language display name lookup table
const languageNames = {
  "auto": "自動偵測",
  "zh-TW": "繁體中文",
  "zh-CN": "簡體中文",
  "en": "English",
  "ja": "日本語",
  "ko": "한국어",
  "es": "Español",
  "fr": "Français",
  "de": "Deutsch",
  "ru": "Русский",
  "pt": "Português",
  "it": "Italiano"
};

// UI Element selections
const srcTextarea = document.getElementById("src-textarea");
const targetContent = document.getElementById("target-content");
const selectSource = document.getElementById("select-source");
const selectTarget = document.getElementById("select-target");
const charCounter = document.getElementById("char-counter");
const statusMessage = document.getElementById("status-message");
const loader = document.getElementById("loader");

const btnTranslate = document.getElementById("btn-translate");
const btnCopy = document.getElementById("btn-copy");
const btnTts = document.getElementById("btn-tts");
const btnSidepanel = document.getElementById("btn-sidepanel");
const btnTheme = document.getElementById("btn-theme");
const iconSun = document.getElementById("icon-sun");
const iconMoon = document.getElementById("icon-moon");

const drawers = {
  settings: document.getElementById("drawer-settings"),
  history: document.getElementById("drawer-history"),
  logs: document.getElementById("drawer-logs")
};
const backdrop = document.getElementById("drawer-backdrop");

// Debounce timer for auto-translate
let debounceTimer = null;
// SpeechSynthesis reference
let currentUtterance = null;
// Current primary translation text (for copying/TTS)
let currentTranslationText = "";

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

// Logger helper
async function addLog(type, message, details = null) {
  const result = await chrome.storage.local.get("logs");
  const logs = result.logs || [];
  const logItem = {
    timestamp: new Date().toLocaleTimeString(),
    type, // 'info' | 'request' | 'response' | 'error'
    message,
    details: details ? details : null
  };
  logs.unshift(logItem);
  if (logs.length > 100) logs.pop(); // Keep last 100 logs
  await chrome.storage.local.set({ logs });
  
  // Render logs if logs drawer is open
  if (drawers.logs.classList.contains("open")) {
    renderLogs();
  }
}

// History helper
async function addHistoryItem(srcText, targetText, srcLang, targetLang) {
  const result = await chrome.storage.local.get(["history", "maxHistory"]);
  const history = result.history || [];
  const maxHistory = parseInt(result.maxHistory || 100, 10);
  
  // Check if it's identical to the most recent translation to avoid duplicates
  if (history.length > 0 && 
      history[0].srcText.trim() === srcText.trim() && 
      history[0].targetLang === targetLang) {
    return;
  }

  const item = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    srcText,
    targetText,
    srcLang,
    targetLang
  };

  history.unshift(item);
  if (history.length > maxHistory) {
    history.splice(maxHistory);
  }

  await chrome.storage.local.set({ history });
  
  if (drawers.history.classList.contains("open")) {
    renderHistory();
  }
}

// Theme handling
async function initTheme() {
  const res = await chrome.storage.local.get("theme");
  const theme = res.theme || "dark";
  applyTheme(theme);
}

function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.remove("dark-theme");
    document.body.classList.add("light-theme");
    iconSun.classList.add("hidden");
    iconMoon.classList.remove("hidden");
  } else {
    document.body.classList.remove("light-theme");
    document.body.classList.add("dark-theme");
    iconMoon.classList.add("hidden");
    iconSun.classList.remove("hidden");
  }
}

btnTheme.addEventListener("click", async () => {
  const isDark = document.body.classList.contains("dark-theme");
  const newTheme = isDark ? "light" : "dark";
  await chrome.storage.local.set({ theme: newTheme });
  applyTheme(newTheme);
  await addLog("info", `Theme switched to ${newTheme}`);
});

// Render rich educational cards for learning mode
function renderRichTranslation(data) {
  targetContent.innerHTML = "";
  targetContent.classList.remove("empty");

  // 1. Primary Translation Result
  const primaryCard = document.createElement("div");
  primaryCard.className = "translation-result-card";
  primaryCard.textContent = data.translation;
  targetContent.appendChild(primaryCard);

  // 2. Alternative Translations / Tones
  if (data.alternatives && data.alternatives.length > 0) {
    const altTitle = document.createElement("div");
    altTitle.className = "learning-section-title";
    altTitle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.82 2.82 0 1 1 4 4L7 21H3v-4L17 3z"></path></svg>
      Alternative Expressions
    `;
    targetContent.appendChild(altTitle);

    const altList = document.createElement("div");
    altList.className = "alt-list";
    
    data.alternatives.forEach(alt => {
      const altCard = document.createElement("div");
      altCard.className = "alt-card";
      
      const altHeader = document.createElement("div");
      altHeader.className = "alt-header";
      altHeader.innerHTML = `
        <span class="alt-text">${escapeHTML(alt.text)}</span>
        <span class="alt-tone">${escapeHTML(alt.tone)}</span>
      `;
      altCard.appendChild(altHeader);
      
      if (alt.explanation) {
        const altExpl = document.createElement("div");
        altExpl.className = "alt-explanation";
        altExpl.textContent = alt.explanation;
        altCard.appendChild(altExpl);
      }
      
      altList.appendChild(altCard);
    });
    targetContent.appendChild(altList);
  }

  // 3. Vocabulary Learning Cards
  if (data.vocabulary && data.vocabulary.length > 0) {
    const vocabTitle = document.createElement("div");
    vocabTitle.className = "learning-section-title";
    vocabTitle.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
      Key Vocabulary
    `;
    targetContent.appendChild(vocabTitle);

    const vocabList = document.createElement("div");
    vocabList.className = "vocab-list";

    data.vocabulary.forEach(vocab => {
      const vocabCard = document.createElement("div");
      vocabCard.className = "vocab-card";

      const vocabHeader = document.createElement("div");
      vocabHeader.className = "vocab-header";
      
      const posHtml = vocab.pos ? `<span class="vocab-pos">(${escapeHTML(vocab.pos)})</span>` : "";
      vocabHeader.innerHTML = `
        <span class="vocab-word">${escapeHTML(vocab.word)}</span>
        ${posHtml}
        <span class="vocab-translation">${escapeHTML(vocab.translation)}</span>
      `;
      vocabCard.appendChild(vocabHeader);

      // Synonyms List
      if (vocab.synonyms && vocab.synonyms.length > 0) {
        const synList = document.createElement("div");
        synList.className = "vocab-synonyms";
        vocab.synonyms.forEach(syn => {
          const badge = document.createElement("span");
          badge.className = "synonym-badge";
          badge.textContent = syn;
          synList.appendChild(badge);
        });
        vocabCard.appendChild(synList);
      }

      // Explanations / When to Use
      if (vocab.when_to_use) {
        const usage = document.createElement("div");
        usage.className = "vocab-usage";
        usage.textContent = vocab.when_to_use;
        vocabCard.appendChild(usage);
      }

      // Sentence Example Box
      if (vocab.example_sentence_source) {
        const example = document.createElement("div");
        example.className = "vocab-example";
        example.innerHTML = `
          <div class="vocab-example-src">${escapeHTML(vocab.example_sentence_source)}</div>
          <div class="vocab-example-target">${escapeHTML(vocab.example_sentence_target || "")}</div>
        `;
        vocabCard.appendChild(example);
      }

      vocabList.appendChild(vocabCard);
    });
    targetContent.appendChild(vocabList);
  }
}

// Translation Engine Core
async function translate() {
  const srcText = srcTextarea.value.trim();
  if (!srcText) return;

  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "model",
    "temperature",
    "systemPrompt",
    "systemPromptLearning",
    "targetLang",
    "sourceLang",
    "richLearningMode",
    "streamTranslations"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const model = config.model || "qwen";
  const temp = parseFloat(config.temperature ?? 0.1);
  const srcLang = config.sourceLang || "auto";
  const targetLang = config.targetLang || "zh-TW";
  const richLearningMode = config.richLearningMode !== false;
  const streamTranslations = config.streamTranslations !== false;

  // Check cache first
  const cached = await getCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode);
  if (cached) {
    await addLog("info", "Translation loaded from cache", { text: srcText });
    
    if (cached.rich) {
      renderRichTranslation(cached.parsed);
      currentTranslationText = cached.parsed.translation;
    } else {
      targetContent.textContent = cached.text;
      targetContent.classList.remove("empty");
      currentTranslationText = cached.text;
    }
    
    btnCopy.disabled = false;
    btnTts.disabled = false;
    statusMessage.textContent = "Completed (Loaded from cache)";
    await addHistoryItem(srcText, cached.rich ? JSON.stringify(cached.parsed) : cached.text, srcLang, targetLang);
    return;
  }

  // Phase 1: Translate
  const rawSystemPrompt = config.systemPrompt || "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  const targetLangName = languageNames[targetLang] || targetLang;
  const systemPrompt = rawSystemPrompt.replace(/{target_lang}/g, targetLangName);

  // UI state for loading
  loader.classList.remove("hidden");
  btnTranslate.disabled = true;
  statusMessage.textContent = "Translating...";
  
  const endpointUrl = `${apiEndpoint.replace(/\/$/, "")}/v1/chat/completions`;

  const payload = {
    model: model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: srcText }
    ],
    temperature: temp,
    stream: streamTranslations
  };

  await addLog("request", `Phase 1 Translation (model: ${model}, stream: ${streamTranslations})`, {
    url: endpointUrl,
    headers: { "Content-Type": "application/json" },
    body: payload
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    let translatedText = "";

    if (streamTranslations) {
      targetContent.classList.remove("empty");
      targetContent.textContent = "";

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep the last incomplete line

        for (const line of lines) {
          const cleanedLine = line.trim();
          if (!cleanedLine) continue;
          if (cleanedLine === "data: [DONE]") break;

          if (cleanedLine.startsWith("data: ")) {
            try {
              const parsedLine = JSON.parse(cleanedLine.substring(6));
              if (parsedLine.choices && parsedLine.choices[0] && parsedLine.choices[0].delta) {
                const deltaContent = parsedLine.choices[0].delta.content || "";
                translatedText += deltaContent;
                
                targetContent.textContent = translatedText;
                currentTranslationText = translatedText;
                targetContent.scrollTop = targetContent.scrollHeight;
              }
            } catch (err) {
              // Ignore chunk parse errors
            }
          }
        }
      }
    } else {
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        translatedText = data.choices[0].message.content.trim();
        targetContent.textContent = translatedText;
        targetContent.classList.remove("empty");
        currentTranslationText = translatedText;
      } else {
        throw new Error("Invalid API response JSON structure (choices[0].message.content not found)");
      }
    }

    await addLog("response", "Phase 1 Translation successful", { length: translatedText.length });

    btnCopy.disabled = false;
    btnTts.disabled = false;
    statusMessage.textContent = `Completed (${new Date().toLocaleTimeString()})`;

    // Phase 2: Learning Insights
    if (richLearningMode) {
      // Show mini learning loader
      const loaderContainer = document.createElement("div");
      loaderContainer.id = "learning-loader";
      loaderContainer.style.cssText = "margin-top: 16px; border-top: 1px dashed var(--border-color); padding-top: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 13px; color: var(--text-muted);";
      loaderContainer.innerHTML = `
        <svg class="spinner-svg" style="width: 16px; height: 16px;" viewBox="0 0 50 50">
          <circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
        </svg>
        <span>Loading vocabulary & suggestions...</span>
      `;
      targetContent.appendChild(loaderContainer);

      const systemPromptLearning = (config.systemPromptLearning || "你是一個專業的語言學習助手。").replace(/{target_lang}/g, targetLangName);

      await addLog("request", `Phase 2 Learning Insights (model: ${model})`, {
        url: endpointUrl,
        prompt: systemPromptLearning,
        user: `Original Text: "${srcText}"\nTranslation: "${translatedText}"`
      });

      try {
        const response2 = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            messages: [
              { role: "system", content: systemPromptLearning },
              { role: "user", content: `Original Text: "${srcText}"\nTranslation: "${translatedText}"` }
            ],
            temperature: temp,
            stream: false
          })
        });

        if (!response2.ok) {
          throw new Error("Phase 2 HTTP error " + response2.status);
        }

        const data2 = await response2.json();
        await addLog("response", "Phase 2 completed", data2);

        if (data2.choices && data2.choices[0] && data2.choices[0].message) {
          const resultText2 = data2.choices[0].message.content.trim();
          const cleanedText2 = resultText2.replace(/```json/gi, "").replace(/```/g, "").trim();
          let parsedData2;

          try {
            parsedData2 = JSON.parse(cleanedText2);
          } catch (e) {
            const startIdx = resultText2.indexOf("{");
            const endIdx = resultText2.lastIndexOf("}");
            if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
              parsedData2 = JSON.parse(resultText2.substring(startIdx, endIdx + 1));
            } else {
              throw e;
            }
          }

          // Clear learning loader
          const loader = document.getElementById("learning-loader");
          if (loader) loader.remove();

          if (parsedData2) {
            renderRichTranslation({
              translation: translatedText,
              alternatives: parsedData2.alternatives || [],
              vocabulary: parsedData2.vocabulary || []
            });

            // Cache consolidated rich result
            const cacheData = {
              rich: true,
              parsed: {
                translation: translatedText,
                alternatives: parsedData2.alternatives || [],
                vocabulary: parsedData2.vocabulary || []
              }
            };
            await setCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, cacheData);
            
            // Add consolidated result to History
            await addHistoryItem(srcText, JSON.stringify(cacheData.parsed), srcLang, targetLang);
            return;
          }
        }
      } catch (err2) {
        console.warn("Phase 2 loading failed:", err2);
        const loader = document.getElementById("learning-loader");
        if (loader) {
          loader.innerHTML = `<span style="color: var(--danger-color); font-size: 12px;">Could not load vocabulary suggestions: ${err2.message}</span>`;
        }
      }
    }

    // Save simple mode or fallback translation to History and Cache
    const cacheData = { rich: false, text: translatedText };
    await setCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, cacheData);
    await addHistoryItem(srcText, translatedText, srcLang, targetLang);

  } catch (err) {
    console.error("Translation Error:", err);
    let errorMsg = err.message;
    if (err.name === 'AbortError') {
      errorMsg = "API request timed out (20s limit)";
    }
    
    await addLog("error", `Translation failed: ${errorMsg}`, {
      errorMessage: err.toString(),
      stack: err.stack
    });
    
    targetContent.textContent = `Translation Failed!\n\nPossible Causes:\n1. Check if LLM API server is running at: ${apiEndpoint}\n2. Verify the model name "${model}" is loaded\n3. Check console or extension debug logs.\n\nRaw Error: ${errorMsg}`;
    targetContent.classList.remove("empty");
    
    btnCopy.disabled = true;
    btnTts.disabled = true;
    statusMessage.textContent = "Error occurred";
  } finally {
    loader.classList.add("hidden");
    btnTranslate.disabled = false;
  }
}

// Drawer Drawer UI Mechanics
function openDrawer(name) {
  // Close all first
  Object.values(drawers).forEach(d => d.classList.remove("open"));
  backdrop.classList.add("hidden");
  
  if (drawers[name]) {
    drawers[name].classList.add("open");
    backdrop.classList.remove("hidden");
    
    if (name === "history") {
      renderHistory();
    } else if (name === "logs") {
      renderLogs();
    } else if (name === "settings") {
      loadSettingsToUI();
    }
  }
}

function closeAllDrawers() {
  Object.values(drawers).forEach(d => d.classList.remove("open"));
  backdrop.classList.add("hidden");
}

document.getElementById("btn-settings").addEventListener("click", () => openDrawer("settings"));
document.getElementById("btn-history").addEventListener("click", () => openDrawer("history"));
document.getElementById("btn-logs").addEventListener("click", () => openDrawer("logs"));
backdrop.addEventListener("click", closeAllDrawers);
document.querySelectorAll(".drawer-close").forEach(btn => btn.addEventListener("click", closeAllDrawers));

// Settings Form Handling
const btnSaveSettings = document.getElementById("btn-save-settings");
const btnResetSettings = document.getElementById("btn-reset-settings");
const btnClearCache = document.getElementById("btn-clear-cache");
const checkRichLearning = document.getElementById("check-rich-learning");
const groupSimplePrompt = document.getElementById("group-simple-prompt");
const groupLearningPrompt = document.getElementById("group-learning-prompt");

function togglePromptVisibility() {
  if (checkRichLearning.checked) {
    groupSimplePrompt.classList.add("hidden");
    groupLearningPrompt.classList.remove("hidden");
  } else {
    groupSimplePrompt.classList.remove("hidden");
    groupLearningPrompt.classList.add("hidden");
  }
}
checkRichLearning.addEventListener("change", togglePromptVisibility);

function updateTextSizeClass(size) {
  document.body.classList.remove("font-size-small", "font-size-medium", "font-size-large");
  document.body.classList.add(`font-size-${size}`);
}

async function loadSettingsToUI() {
  const res = await chrome.storage.local.get([
    "apiEndpoint",
    "model",
    "temperature",
    "systemPrompt",
    "systemPromptLearning",
    "maxHistory",
    "autoTranslate",
    "richLearningMode",
    "doubleClickTranslate",
    "streamTranslations",
    "textSize"
  ]);
  
  document.getElementById("input-api-endpoint").value = res.apiEndpoint ?? "http://192.168.3.202:4090";
  document.getElementById("input-model").value = res.model ?? "qwen";
  document.getElementById("input-temperature").value = res.temperature ?? 0.1;
  document.getElementById("val-temperature").textContent = res.temperature ?? 0.1;
  document.getElementById("input-max-history").value = res.maxHistory ?? 100;
  document.getElementById("check-auto-translate").checked = res.autoTranslate !== false;
  checkRichLearning.checked = res.richLearningMode !== false;
  document.getElementById("check-dblclick-translate").checked = res.doubleClickTranslate !== false;
  document.getElementById("check-stream-translations").checked = res.streamTranslations !== false;
  
  const textSize = res.textSize || "medium";
  document.getElementById("select-text-size").value = textSize;
  updateTextSizeClass(textSize);
  
  const defaultPrompt = "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  document.getElementById("input-system-prompt").value = res.systemPrompt ?? defaultPrompt;
  
  const defaultPromptLearning = "你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（同義詞、替換翻譯及關鍵字詞彙）。\n請務必只返回一個符合以下 JSON 格式的物件，不要包含任何 Markdown 標記（如 ```json）、前言、後記或解釋：\n\n{\n  \"alternatives\": [\n    {\n      \"text\": \"（另一種翻譯方式，例如更正式、更口語或不同語氣的翻譯）\",\n      \"tone\": \"（例如：正式商務、日常口語、書面文學）\",\n      \"explanation\": \"（說明這個翻譯的適用場景或細微差異）\"\n    }\n  ],\n  \"vocabulary\": [\n    {\n      \"word\": \"（從輸入文字中提取的關鍵字，原文字語言）\",\n      \"pos\": \"（詞性，例如 n. / v. / adj.）\",\n      \"translation\": \"（該關鍵詞在{target_lang}中的對應翻譯）\",\n      \"synonyms\": [\"（同義詞1）\", \"（同義詞2）\"],\n      \"when_to_use\": \"（說明此字詞的使用時機、搭配語境或使用習慣）\",\n      \"example_sentence_source\": \"（使用此關鍵字的英文/原語言例句）\",\n      \"example_sentence_target\": \"（該例句翻譯成{target_lang}的結果）\"\n    }\n  ]\n}";
  document.getElementById("input-system-prompt-learning").value = res.systemPromptLearning ?? defaultPromptLearning;

  togglePromptVisibility();
}

document.getElementById("input-temperature").addEventListener("input", (e) => {
  document.getElementById("val-temperature").textContent = e.target.value;
});

btnSaveSettings.addEventListener("click", async () => {
  const apiEndpoint = document.getElementById("input-api-endpoint").value.trim();
  const model = document.getElementById("input-model").value.trim();
  const temperature = parseFloat(document.getElementById("input-temperature").value);
  const maxHistory = parseInt(document.getElementById("input-max-history").value, 10);
  const autoTranslate = document.getElementById("check-auto-translate").checked;
  const richLearningMode = checkRichLearning.checked;
  const doubleClickTranslate = document.getElementById("check-dblclick-translate").checked;
  const streamTranslations = document.getElementById("check-stream-translations").checked;
  const systemPrompt = document.getElementById("input-system-prompt").value.trim();
  const systemPromptLearning = document.getElementById("input-system-prompt-learning").value.trim();
  const textSize = document.getElementById("select-text-size").value;

  await chrome.storage.local.set({
    apiEndpoint,
    model,
    temperature,
    maxHistory,
    autoTranslate,
    richLearningMode,
    doubleClickTranslate,
    streamTranslations,
    systemPrompt,
    systemPromptLearning,
    textSize
  });

  updateTextSizeClass(textSize);
  await addLog("info", "Settings saved successfully");
  closeAllDrawers();
  
  // Re-run translation with new settings if source has text
  if (srcTextarea.value.trim()) {
    translate();
  }
});

btnResetSettings.addEventListener("click", async () => {
  if (confirm("Reset settings to default values?")) {
    await chrome.storage.local.set({
      apiEndpoint: "http://192.168.3.202:4090",
      model: "qwen",
      temperature: 0.1,
      maxHistory: 100,
      autoTranslate: true,
      richLearningMode: true,
      doubleClickTranslate: true,
      streamTranslations: true,
      textSize: "medium",
      systemPrompt: "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。",
      systemPromptLearning: "你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（同義詞、替換翻譯及關鍵字詞彙）。\n請務必只返回一個符合以下 JSON 格式的物件，不要包含 any Markdown 標記（如 ```json）、前言、後記或解釋：\n\n{\n  \"alternatives\": [\n    {\n      \"text\": \"（另一種翻譯方式，例如更正式、更口語或不同語氣的翻譯）\",\n      \"tone\": \"（例如：正式商務、日常口語、書面文學）\",\n      \"explanation\": \"（說明這個翻譯的適用場景或細微差異）\"\n    }\n  ],\n  \"vocabulary\": [\n    {\n      \"word\": \"（從輸入文字中提取的關鍵字，原文字語言）\",\n      \"pos\": \"（詞性，例如 n. / v. / adj.）\",\n      \"translation\": \"（該關鍵詞在{target_lang}中的對應翻譯）\",\n      \"synonyms\": [\"（同義詞1）\", \"（同義詞2）\"],\n      \"when_to_use\": \"（說明此字詞的使用時機、搭配語境或使用習慣）\",\n      \"example_sentence_source\": \"（使用此關鍵字的英文/原語言例句）\",\n      \"example_sentence_target\": \"（該例句翻譯成{target_lang}的結果）\"\n    }\n  ]\n}"
    });
    await loadSettingsToUI();
    await addLog("info", "Settings reset to defaults");
  }
});

btnClearCache.addEventListener("click", async () => {
  if (confirm("Are you sure you want to clear the translation cache?")) {
    await chrome.storage.local.remove("translationCache");
    await addLog("info", "Translation cache cleared");
    alert("Translation cache cleared successfully!");
  }
});

// Logs UI Renderer
async function renderLogs() {
  const res = await chrome.storage.local.get("logs");
  const logs = res.logs || [];
  const logsContainer = document.getElementById("logs-list");

  if (logs.length === 0) {
    logsContainer.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
        <p>System logs are empty.</p>
      </div>
    `;
    return;
  }

  logsContainer.innerHTML = "";
  logs.forEach(log => {
    const entry = document.createElement("div");
    entry.className = "log-entry";
    
    let tagClass = "log-tag-info";
    if (log.type === "request") tagClass = "log-tag-request";
    else if (log.type === "response") tagClass = "log-tag-response";
    else if (log.type === "error") tagClass = "log-tag-error";
    
    let detailsHtml = "";
    if (log.details) {
      const detailsStr = typeof log.details === "object" ? JSON.stringify(log.details, null, 2) : log.details;
      detailsHtml = `<pre class="log-details">${escapeHTML(detailsStr)}</pre>`;
    }
    
    entry.innerHTML = `
      <div>
        <span class="log-time">[${log.timestamp}]</span>
        <span class="log-tag ${tagClass}">${log.type.toUpperCase()}</span>
        <span class="log-msg">${escapeHTML(log.message)}</span>
      </div>
      ${detailsHtml}
    `;
    
    logsContainer.appendChild(entry);
  });
}

document.getElementById("btn-clear-logs").addEventListener("click", async () => {
  if (confirm("Are you sure you want to clear system logs?")) {
    await chrome.storage.local.set({ logs: [] });
    renderLogs();
    await addLog("info", "System debug logs cleared");
  }
});

// History UI Renderer
async function renderHistory() {
  const res = await chrome.storage.local.get("history");
  const history = res.history || [];
  const listContainer = document.getElementById("history-list");
  
  if (history.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <p>No translation history yet.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = "";
  history.forEach(item => {
    const card = document.createElement("div");
    card.className = "history-item";
    
    const srcLangText = languageNames[item.srcLang] || item.srcLang;
    const targetLangText = languageNames[item.targetLang] || item.targetLang;
    const timeText = formatRelativeTime(item.timestamp);
    
    card.innerHTML = `
      <div class="history-header">
        <span class="history-meta">${srcLangText} &rarr; ${targetLangText}</span>
        <span class="history-time" title="${new Date(item.timestamp).toLocaleString()}">${timeText}</span>
      </div>
      <div class="history-texts">
        <div class="history-src">${escapeHTML(item.srcText)}</div>
        <div class="history-target">${escapeHTML(item.targetText)}</div>
      </div>
      <button class="history-delete-btn" data-id="${item.id}" title="Delete item">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    
    card.addEventListener("click", (e) => {
      if (e.target.closest(".history-delete-btn")) return;
      loadHistoryItem(item);
    });
    
    listContainer.appendChild(card);
  });
  
  // Attach single item delete listeners
  listContainer.querySelectorAll(".history-delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      await deleteHistoryItem(id);
    });
  });
}

async function loadHistoryItem(item) {
  selectSource.value = item.srcLang;
  selectTarget.value = item.targetLang;
  srcTextarea.value = item.srcText;
  charCounter.textContent = `${item.srcText.length} characters`;
  
  let parsedSuccessfully = false;
  try {
    const cleanedText = item.targetText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanedText);
    if (parsedData && parsedData.translation) {
      renderRichTranslation(parsedData);
      currentTranslationText = parsedData.translation;
      parsedSuccessfully = true;
    }
  } catch (e) {
    const startIdx = item.targetText.indexOf("{");
    const endIdx = item.targetText.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      try {
        const jsonSub = item.targetText.substring(startIdx, endIdx + 1);
        const parsedData = JSON.parse(jsonSub);
        if (parsedData && parsedData.translation) {
          renderRichTranslation(parsedData);
          currentTranslationText = parsedData.translation;
          parsedSuccessfully = true;
        }
      } catch (e2) {
        // Ignored
      }
    }
  }

  if (!parsedSuccessfully) {
    targetContent.textContent = item.targetText;
    targetContent.classList.remove("empty");
    currentTranslationText = item.targetText;
  }

  btnCopy.disabled = false;
  btnTts.disabled = false;
  
  // Save selections
  await chrome.storage.local.set({
    sourceLang: item.srcLang,
    targetLang: item.targetLang
  });

  closeAllDrawers();
  await addLog("info", `Loaded item from history`);
}

async function deleteHistoryItem(id) {
  const res = await chrome.storage.local.get("history");
  const history = res.history || [];
  const updatedHistory = history.filter(item => item.id !== id);
  await chrome.storage.local.set({ history: updatedHistory });
  renderHistory();
  await addLog("info", "Deleted a single history item");
}

document.getElementById("btn-clear-history").addEventListener("click", async () => {
  if (confirm("Clear translation history?")) {
    await chrome.storage.local.set({ history: [] });
    renderHistory();
    await addLog("info", "Cleared all translation history");
  }
});

// Clipboard and text box helpers
document.getElementById("btn-clear-src").addEventListener("click", () => {
  srcTextarea.value = "";
  charCounter.textContent = "0 characters";
  targetContent.textContent = "";
  targetContent.classList.add("empty");
  btnCopy.disabled = true;
  btnTts.disabled = true;
  srcTextarea.focus();
});

document.getElementById("btn-paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    srcTextarea.value = text;
    charCounter.textContent = `${text.length} characters`;
    srcTextarea.focus();
    
    const res = await chrome.storage.local.get("autoTranslate");
    if (res.autoTranslate !== false && text.trim()) {
      translate();
    }
  } catch (err) {
    console.error("Paste failed:", err);
    await addLog("error", "Clipboard read error (ensure extension has focus/permissions)", err);
  }
});

btnCopy.addEventListener("click", () => {
  const text = currentTranslationText;
  if (!text) return;
  
  navigator.clipboard.writeText(text).then(() => {
    const originalHTML = btnCopy.innerHTML;
    // Show green check icon
    btnCopy.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(140, 100%, 40%)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    btnCopy.style.borderColor = "hsl(140, 100%, 40%)";
    setTimeout(() => {
      btnCopy.innerHTML = originalHTML;
      btnCopy.style.borderColor = "var(--border-color)";
    }, 1500);
  }).catch(err => {
    console.error("Copy failed:", err);
  });
});

// Text-to-Speech (TTS)
btnTts.addEventListener("click", () => {
  const text = currentTranslationText;
  if (!text) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    btnTts.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
    return;
  }

  currentUtterance = new SpeechSynthesisUtterance(text);
  const targetLang = selectTarget.value;
  // Handle language mappings for TTS
  currentUtterance.lang = targetLang === "zh-TW" ? "zh-HK" : targetLang === "zh-CN" ? "zh-CN" : targetLang;
  
  currentUtterance.onend = () => {
    btnTts.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
  };

  // Turn button into a Stop button (X icon)
  btnTts.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
  window.speechSynthesis.speak(currentUtterance);
});

// Swap languages button
document.getElementById("btn-swap-lang").addEventListener("click", async () => {
  const currentSrc = selectSource.value;
  const currentTarget = selectTarget.value;
  
  if (currentSrc === "auto") {
    // If source is auto, set source to current target, target to English (or zh-TW if target is English)
    const newSrc = currentTarget;
    const newTarget = currentTarget === "en" ? "zh-TW" : "en";
    selectSource.value = newSrc;
    selectTarget.value = newTarget;
  } else {
    selectSource.value = currentTarget;
    selectTarget.value = currentSrc;
  }
  
  // Save selections
  await chrome.storage.local.set({
    sourceLang: selectSource.value,
    targetLang: selectTarget.value
  });
  
  await addLog("info", `Swapped languages to: ${selectSource.value} -> ${selectTarget.value}`);

  // Swap text if both boxes are loaded and valid
  const currentSrcText = srcTextarea.value;
  const currentTargetText = targetContent.textContent;
  const isTargetEmpty = targetContent.classList.contains("empty") || !currentTargetText.trim();
  
  if (currentSrcText.trim() && !isTargetEmpty && loader.classList.contains("hidden")) {
    srcTextarea.value = currentTargetText;
    targetContent.textContent = currentSrcText;
    charCounter.textContent = `${srcTextarea.value.length} characters`;
    translate();
  } else if (currentSrcText.trim()) {
    translate();
  }
});

// Dropdown change listeners
selectSource.addEventListener("change", async () => {
  await chrome.storage.local.set({ sourceLang: selectSource.value });
  await addLog("info", `Source language configured to ${selectSource.value}`);
  
  if (srcTextarea.value.trim()) {
    const res = await chrome.storage.local.get("autoTranslate");
    if (res.autoTranslate !== false) translate();
  }
});

selectTarget.addEventListener("change", async () => {
  await chrome.storage.local.set({ targetLang: selectTarget.value });
  await addLog("info", `Target language configured to ${selectTarget.value}`);
  
  if (srcTextarea.value.trim()) {
    const res = await chrome.storage.local.get("autoTranslate");
    if (res.autoTranslate !== false) translate();
  }
});

// Keypress translate / typing auto-translate
srcTextarea.addEventListener("input", () => {
  const text = srcTextarea.value;
  charCounter.textContent = `${text.length} characters`;
  
  if (text.trim() === "") {
    targetContent.textContent = "";
    targetContent.classList.add("empty");
    btnCopy.disabled = true;
    btnTts.disabled = true;
    return;
  }
  
  chrome.storage.local.get("autoTranslate", (result) => {
    if (result.autoTranslate !== false) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        translate();
      }, 800);
    }
  });
});

srcTextarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    translate();
  }
});

btnTranslate.addEventListener("click", translate);

// Open sidepanel button click handler
btnSidepanel.addEventListener("click", async () => {
  if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
        window.close(); // Close active action popup
      }
    } catch (err) {
      console.error("Sidepanel open error:", err);
      alert("Error: could not open Side Panel. Try right-clicking the extension icon in the toolbar and choosing Open Side Panel.");
    }
  } else {
    alert("Chrome Side Panel is not supported or enabled in this browser.");
  }
});

// Setup ESC handler to close drawers
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeAllDrawers();
  }
});

// Helper formatting utilities
function formatRelativeTime(isoStr) {
  try {
    const diff = Date.now() - new Date(isoStr).getTime();
    if (isNaN(diff)) return "unknown time";
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch (e) {
    return "unknown";
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Application startup initializer
async function initApp() {
  await initTheme();
  
  // Hide sidepanel button if we are in side panel or if the API doesn't exist
  if (!chrome.sidePanel || window.innerWidth < 500) {
    btnSidepanel.classList.add("hidden");
  }

  // Load language settings
  const res = await chrome.storage.local.get([
    "sourceLang",
    "targetLang",
    "pendingTranslationText"
  ]);

  if (res.sourceLang) selectSource.value = res.sourceLang;
  if (res.targetLang) selectTarget.value = res.targetLang;

  // Handle selection texts sent from contextMenus
  if (res.pendingTranslationText) {
    srcTextarea.value = res.pendingTranslationText;
    charCounter.textContent = `${res.pendingTranslationText.length} characters`;
    await chrome.storage.local.remove("pendingTranslationText");
    translate();
  } else {
    srcTextarea.focus();
  }

  await loadSettingsToUI();
  await addLog("info", "App loaded and ready");
}

// Listen to contextMenu events in real-time
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "translateText" && message.text) {
    srcTextarea.value = message.text;
    charCounter.textContent = `${message.text.length} characters`;
    translate();
  }
});

// Run app init
initApp();
