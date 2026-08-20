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

// Mobile Viewport & Touch Mode Handler
function checkViewportMode() {
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isMobileWidth = window.innerWidth <= 480;

  if (isTouchDevice && isMobileWidth) {
    document.body.classList.add("mobile-mode");
  } else {
    document.body.classList.remove("mobile-mode");
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("resize", checkViewportMode);
  checkViewportMode();
}

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
  logs: document.getElementById("drawer-logs"),
  exclusions: document.getElementById("drawer-exclusions")
};
const backdrop = document.getElementById("drawer-backdrop");

// Grammar & Typo Suggestion DOM Elements
const grammarSuggestionBox = document.getElementById("grammar-suggestion-box");
const grammarSuggestionText = document.getElementById("grammar-suggestion-text");
const btnGrammarApply = document.getElementById("btn-grammar-apply");
const btnGrammarDismiss = document.getElementById("btn-grammar-dismiss");
const checkGrammarCheck = document.getElementById("check-grammar-check");

// Debounce timers
let debounceTimer = null;
let grammarDebounceTimer = null;
let grammarAbortController = null;
const grammarCache = new Map();

// SpeechSynthesis reference
let currentUtterance = null;
// Current primary translation text (for copying/TTS)
let currentTranslationText = "";

function parseGrammarCorrectionResponse(reply) {
  if (!reply || typeof reply !== "string") {
    return { has_error: false, corrected: "", explanation: "" };
  }
  let cleaned = reply;
  if (cleaned.includes("<think>")) {
    const parsed = splitThinkingText(cleaned);
    cleaned = parsed.translation;
  }
  cleaned = cleaned.replace(/```json/gi, "").replace(/```/g, "").trim();

  let parsedObj = null;
  try {
    parsedObj = JSON.parse(cleaned);
  } catch (e) {
    const s = cleaned.indexOf("{");
    const eIdx = cleaned.lastIndexOf("}");
    if (s !== -1 && eIdx > s) {
      try {
        parsedObj = JSON.parse(cleaned.substring(s, eIdx + 1));
      } catch (_) {}
    }
  }

  if (parsedObj && typeof parsedObj === "object") {
    return {
      has_error: Boolean(parsedObj.has_error),
      corrected: typeof parsedObj.corrected === "string" ? parsedObj.corrected.trim() : "",
      explanation: typeof parsedObj.explanation === "string" ? parsedObj.explanation.trim() : ""
    };
  }

  return { has_error: false, corrected: "", explanation: "" };
}

function shouldShowGrammarSuggestion(originalText, result) {
  if (!result || !result.has_error || !result.corrected) return false;
  const orig = (originalText || "").trim();
  const corr = result.corrected.trim();
  if (!orig || !corr) return false;
  return orig.toLowerCase() !== corr.toLowerCase();
}

function hideGrammarSuggestion() {
  if (grammarSuggestionBox) {
    grammarSuggestionBox.classList.add("hidden");
  }
}

function showGrammarSuggestion(correctedText, explanation = "") {
  if (!grammarSuggestionBox || !grammarSuggestionText) return;
  grammarSuggestionText.textContent = correctedText;
  if (explanation) {
    grammarSuggestionText.title = `${explanation} (Click to apply)`;
  } else {
    grammarSuggestionText.title = "Click to apply correction";
  }
  grammarSuggestionBox.classList.remove("hidden");
}

function applyGrammarSuggestion() {
  if (!grammarSuggestionText) return;
  const corrected = grammarSuggestionText.textContent;
  if (corrected) {
    srcTextarea.value = corrected;
    charCounter.textContent = `${corrected.length} characters`;
    hideGrammarSuggestion();
    if (srcTextarea && typeof srcTextarea.focus === "function") {
      srcTextarea.focus();
    }
    translate();
  }
}

async function checkGrammarAndTypo(rawText) {
  const trimmed = rawText ? rawText.trim() : "";
  if (!trimmed || trimmed.length < 2 || !/\p{L}/u.test(trimmed) || isUrlLike(trimmed) || isApiKeyLike(trimmed)) {
    hideGrammarSuggestion();
    return;
  }

  if (grammarCache.has(trimmed)) {
    const cached = grammarCache.get(trimmed);
    if (shouldShowGrammarSuggestion(trimmed, cached)) {
      showGrammarSuggestion(cached.corrected, cached.explanation);
    } else {
      hideGrammarSuggestion();
    }
    return;
  }

  if (grammarAbortController) {
    grammarAbortController.abort();
  }
  grammarAbortController = new AbortController();

  try {
    const config = await chrome.storage.local.get([
      "apiEndpoint",
      "apiKey",
      "model",
      "modelType",
      "grammarCheck"
    ]);

    if (config.grammarCheck === false) {
      hideGrammarSuggestion();
      return;
    }

    const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
    const apiKey = config.apiKey || "";
    const model = config.model || "qwen";
    const endpointUrl = formatChatEndpointUrl(apiEndpoint);

    const systemPrompt = "You are a smart grammar and spell-checker assistant. Analyze the user's input text for typos, misspellings, or grammatical errors in whatever language it is written in.\\nIf there is any typo, misspelling, punctuation issue, or grammatical mistake, provide the corrected version.\\nRespond ONLY in the following JSON format without markdown code blocks:\\n{\\\"has_error\\\": true, \\\"corrected\\\": \\\"<the fully corrected sentence/text>\\\", \\\"explanation\\\": \\\"<brief reason, e.g. Fixed typo>\\\"}\\nIf the input is already correct, natural, or has no errors, respond ONLY in this JSON format:\\n{\\\"has_error\\\": false, \\\"corrected\\\": \\\"\\\", \\\"explanation\\\": \\\"\\\"}";

    const messagesPayload = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Please proofread and check the following text for typos or grammatical errors:\n\n${trimmed}` }
    ];

    const payload = {
      model: model,
      messages: messagesPayload,
      temperature: 0.1,
      stream: false
    };

    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: grammarAbortController.signal
    });

    if (!response.ok) return;

    const data = await response.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    if (!reply) return;

    const resultObj = parseGrammarCorrectionResponse(reply);

    grammarCache.set(trimmed, resultObj);
    if (grammarCache.size > 50) {
      const firstKey = grammarCache.keys().next().value;
      grammarCache.delete(firstKey);
    }

    if (srcTextarea.value.trim() !== trimmed) {
      return;
    }

    if (shouldShowGrammarSuggestion(trimmed, resultObj)) {
      showGrammarSuggestion(resultObj.corrected, resultObj.explanation);
    } else {
      hideGrammarSuggestion();
    }
  } catch (err) {
    if (err.name !== "AbortError") {
      console.warn("Grammar check error:", err);
    }
  }
}

function splitThinkingText(text) {
  let thinking = "";
  let translation = text;
  
  const thinkStart = text.indexOf("<think>");
  if (thinkStart !== -1) {
    const thinkEnd = text.indexOf("</think>", thinkStart + 7);
    if (thinkEnd !== -1) {
      thinking = text.substring(thinkStart + 7, thinkEnd).trim();
      translation = text.substring(thinkEnd + 8).trim();
    } else {
      thinking = text.substring(thinkStart + 7).trim();
      translation = "";
    }
  }
  return { thinking, translation };
}

function renderFormattedTranslation(text) {
  if (!text) return "";
  const lines = text.trim().split("\n");
  const hasBullets = lines.some(line => /^[•\-\*]\s+/.test(line.trim()) || /^\d+[\.\)]\s+/.test(line.trim()));
  
  if (hasBullets) {
    let html = "<ul class='translation-bullet-list' style='margin: 4px 0 4px 18px; padding: 0; list-style-type: disc; text-align: left;'>";
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed) {
        const cleaned = trimmed.replace(/^[•\-\*]\s+/, "").replace(/^\d+[\.\)]\s+/, "");
        html += `<li style='margin-bottom: 4px; line-height: 1.5;'>${escapeHTML(cleaned)}</li>`;
      }
    });
    html += "</ul>";
    return html;
  }
  
  return escapeHTML(text);
}

function renderThinkingAndTranslation(translationText, thinkingText) {
  let thinkBlock = document.getElementById("thinking-block");
  let thinkContent = document.getElementById("thinking-content");
  let transBlock = document.getElementById("translation-text");
  
  if (!thinkBlock) {
    targetContent.innerHTML = "";
    targetContent.classList.remove("empty");
    
    thinkBlock = document.createElement("div");
    thinkBlock.id = "thinking-block";
    thinkBlock.className = "thinking-block";
    
    const isCollapsed = localStorage.getItem("thinking-collapsed") === "true";
    if (isCollapsed) {
      thinkBlock.classList.add("collapsed");
    }
    
    const thinkHeader = document.createElement("div");
    thinkHeader.className = "thinking-header";
    thinkHeader.innerHTML = `
      <span style="display: flex; align-items: center; gap: 6px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Thinking Process
      </span>
      <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: ${isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'}; transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    
    thinkContent = document.createElement("div");
    thinkContent.id = "thinking-content";
    thinkContent.className = "thinking-content";
    
    thinkHeader.addEventListener("click", () => {
      const currentlyCollapsed = thinkBlock.classList.toggle("collapsed");
      localStorage.setItem("thinking-collapsed", currentlyCollapsed ? "true" : "false");
      const chevron = thinkHeader.querySelector(".chevron-icon");
      if (chevron) {
        chevron.style.transform = currentlyCollapsed ? "rotate(0deg)" : "rotate(180deg)";
      }
    });
    
    thinkBlock.appendChild(thinkHeader);
    thinkBlock.appendChild(thinkContent);
    targetContent.appendChild(thinkBlock);
  }
  
  if (!transBlock) {
    transBlock = document.createElement("div");
    transBlock.id = "translation-text";
    transBlock.style.cssText = "padding: 16px; font-size: 14.5px; line-height: 1.5; white-space: pre-wrap; color: var(--text-main);";
    targetContent.appendChild(transBlock);
  }
  
  if (thinkContent) {
    thinkContent.textContent = thinkingText;
  }
  if (transBlock) {
    if (translationText && (/^[•\-\*]\s+/m.test(translationText) || /^\d+[\.\)]\s+/m.test(translationText))) {
      transBlock.innerHTML = renderFormattedTranslation(translationText);
    } else {
      transBlock.textContent = translationText || "...";
    }
  }
}

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
  let cache = res.translationCache || {};
  
  cache[cacheKey] = {
    data: translationData,
    timestamp: Date.now()
  };
  
  // Evict oldest items if cache size gets too large (limit to 500 items)
  const keys = Object.keys(cache);
  if (keys.length > 500) {
    keys.sort((a, b) => cache[a].timestamp - cache[b].timestamp);
    const newCache = {};
    for (let i = 50; i < keys.length; i++) {
      newCache[keys[i]] = cache[keys[i]];
    }
    cache = newCache;
  }
  await chrome.storage.local.set({ translationCache: cache });
}

// Record monthly token usage in popup script
async function recordTokenUsage(promptTokens = 0, completionTokens = 0, totalTokens = 0, providerKey = "general") {
  try {
    const yearMonth = new Date().toISOString().substring(0, 7);
    const res = await chrome.storage.local.get("tokenUsageByMonth");
    const usageMap = res.tokenUsageByMonth || {};
    
    if (!usageMap[yearMonth]) {
      usageMap[yearMonth] = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        requestCount: 0,
        byProvider: {}
      };
    }

    const mData = usageMap[yearMonth];
    const pTokens = Math.max(0, Math.round(Number(promptTokens) || 0));
    const cTokens = Math.max(0, Math.round(Number(completionTokens) || 0));
    const tTokens = Math.max(0, Math.round(Number(totalTokens) || (pTokens + cTokens)));

    mData.promptTokens += pTokens;
    mData.completionTokens += cTokens;
    mData.totalTokens += tTokens;
    mData.requestCount += 1;

    if (providerKey) {
      if (!mData.byProvider[providerKey]) {
        mData.byProvider[providerKey] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
      }
      mData.byProvider[providerKey].promptTokens += pTokens;
      mData.byProvider[providerKey].completionTokens += cTokens;
      mData.byProvider[providerKey].totalTokens += tTokens;
      mData.byProvider[providerKey].requestCount += 1;
    }

    await chrome.storage.local.set({ tokenUsageByMonth: usageMap });
    renderMonthlyTokenUsageUI();
  } catch (e) {
    console.warn("Failed to record token usage in popup:", e);
  }
}

// Render Monthly Token Usage UI
async function renderMonthlyTokenUsageUI() {
  const selectUsageMonth = document.getElementById("select-usage-month");
  const txtTotalTokens = document.getElementById("usage-total-tokens");
  const txtPromptTokens = document.getElementById("usage-prompt-tokens");
  const txtCompletionTokens = document.getElementById("usage-completion-tokens");
  const containerBreakdown = document.getElementById("usage-provider-breakdown");

  if (!txtTotalTokens) return;

  const res = await chrome.storage.local.get("tokenUsageByMonth");
  const usageMap = res.tokenUsageByMonth || {};
  const currentMonth = new Date().toISOString().substring(0, 7);

  const availableMonths = Array.from(new Set([currentMonth, ...Object.keys(usageMap)])).sort().reverse();

  if (selectUsageMonth) {
    const activeSelectedMonth = selectUsageMonth.value || currentMonth;
    selectUsageMonth.innerHTML = "";
    availableMonths.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m === currentMonth ? `${m} (Current)` : m;
      if (m === activeSelectedMonth) opt.selected = true;
      selectUsageMonth.appendChild(opt);
    });
  }

  const selectedMonthKey = (selectUsageMonth && selectUsageMonth.value) || currentMonth;
  const monthData = usageMap[selectedMonthKey] || { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0, byProvider: {} };

  txtTotalTokens.textContent = Number(monthData.totalTokens || 0).toLocaleString();
  txtPromptTokens.textContent = Number(monthData.promptTokens || 0).toLocaleString();
  txtCompletionTokens.textContent = Number(monthData.completionTokens || 0).toLocaleString();

  if (containerBreakdown) {
    const byProv = monthData.byProvider || {};
    const provKeys = Object.keys(byProv);
    if (provKeys.length === 0) {
      containerBreakdown.innerHTML = `<span style="color:var(--text-muted); font-style:italic;">No AI requests recorded for ${escapeHTML(selectedMonthKey)}.</span>`;
    } else {
      let html = `<div style="display:flex; flex-direction:column; gap:4px; margin-top: 4px;">`;
      provKeys.forEach(pk => {
        const pData = byProv[pk];
        const provName = DEFAULT_RECIPES[pk]?.name || pk.toUpperCase();
        html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:4px 8px; border-radius:6px; font-size:11px;">
          <span><strong>${escapeHTML(provName)}</strong> (${Number(pData.requestCount || 0)} reqs)</span>
          <span style="font-weight:600; color:var(--accent-color-1);">${Number(pData.totalTokens || 0).toLocaleString()} tokens</span>
        </div>`;
      });
      html += `</div>`;
      containerBreakdown.innerHTML = html;
    }
  }
}

function sanitizeSensitiveCredentials(input) {
  if (!input) return input;
  if (typeof input === "string") {
    return input
      .replace(/gsk_[a-zA-Z0-9_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
      .replace(/sk-(proj-|or-|ant-)?[a-zA-Z0-9_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
      .replace(/AIza[0-9A-Za-z_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
      .replace(/ya29\.[0-9A-Za-z_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
      .replace(/\d{8,10}:[a-zA-Z0-9_-]{20,}/g, m => `${m.substring(0, 5)}:***`)
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, m => `Bearer ${m.substring(7, 13)}...***`);
  }
  if (typeof input === "object") {
    try {
      const jsonStr = JSON.stringify(input);
      const sanitizedStr = sanitizeSensitiveCredentials(jsonStr);
      return JSON.parse(sanitizedStr);
    } catch (e) {
      return input;
    }
  }
  return input;
}

// Logger helper
async function addLog(type, message, details = null) {
  const cleanMsg = sanitizeSensitiveCredentials(message);
  const cleanDetails = sanitizeSensitiveCredentials(details);
  const result = await chrome.storage.local.get("logs");
  const logs = result.logs || [];
  const logItem = {
    timestamp: new Date().toLocaleTimeString(),
    type, // 'info' | 'request' | 'response' | 'error'
    message: cleanMsg,
    details: cleanDetails ? cleanDetails : null
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
async function renderRichTranslation(data) {
  targetContent.innerHTML = "";
  targetContent.classList.remove("empty");

  const config = await chrome.storage.local.get("showThinking");
  const showThinking = config.showThinking !== false;

  let finalThinking = "";
  let finalTranslation = data.translation || "";
  
  if (data.translation && data.translation.includes("<think>")) {
    const parsed = splitThinkingText(data.translation);
    finalThinking = parsed.thinking;
    finalTranslation = parsed.translation;
  }

  if (showThinking && finalThinking) {
    const thinkBlock = document.createElement("div");
    thinkBlock.className = "thinking-block";
    
    const isCollapsed = localStorage.getItem("thinking-collapsed") === "true";
    if (isCollapsed) {
      thinkBlock.classList.add("collapsed");
    }
    
    const thinkHeader = document.createElement("div");
    thinkHeader.className = "thinking-header";
    thinkHeader.innerHTML = `
      <span style="display: flex; align-items: center; gap: 6px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
        Thinking Process
      </span>
      <svg class="chevron-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform: ${isCollapsed ? 'rotate(0deg)' : 'rotate(180deg)'}; transition: transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    
    const thinkContent = document.createElement("div");
    thinkContent.className = "thinking-content";
    thinkContent.textContent = finalThinking;
    
    thinkHeader.addEventListener("click", () => {
      const currentlyCollapsed = thinkBlock.classList.toggle("collapsed");
      localStorage.setItem("thinking-collapsed", currentlyCollapsed ? "true" : "false");
      const chevron = thinkHeader.querySelector(".chevron-icon");
      if (chevron) {
        chevron.style.transform = currentlyCollapsed ? "rotate(0deg)" : "rotate(180deg)";
      }
    });
    
    thinkBlock.appendChild(thinkHeader);
    thinkBlock.appendChild(thinkContent);
    targetContent.appendChild(thinkBlock);
  }

  // 1. Primary Translation Result
  const primaryCard = document.createElement("div");
  primaryCard.className = "translation-result-card";
  primaryCard.textContent = finalTranslation;
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

      // Similar Words List (Bullet List)
      if (vocab.synonyms && vocab.synonyms.length > 0) {
        const synContainer = document.createElement("div");
        synContainer.style.cssText = "margin-top: 6px; display: flex; flex-direction: column; gap: 4px;";
        
        const synLabel = document.createElement("div");
        synLabel.style.cssText = "font-size: 11px; color: var(--text-muted); font-weight: 600;";
        synLabel.textContent = "Similar words:";
        synContainer.appendChild(synLabel);

        const synUl = document.createElement("ul");
        synUl.className = "vocab-synonyms-ul";
        synUl.style.cssText = "margin: 0; padding-left: 18px; list-style-type: disc; font-size: 12.5px; color: var(--text-main); display: flex; flex-direction: column; gap: 3px;";
        
        vocab.synonyms.forEach(syn => {
          const li = document.createElement("li");
          li.style.cssText = "line-height: 1.4;";
          li.textContent = syn;
          synUl.appendChild(li);
        });
        synContainer.appendChild(synUl);
        vocabCard.appendChild(synContainer);
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
  let srcText = srcTextarea.value;
  srcText = cleanTranslateText(srcText);
  if (!srcText) return;
  srcTextarea.value = srcText;

  if (!/\p{L}/u.test(srcText) || isUrlLike(srcText) || isApiKeyLike(srcText)) {
    statusMessage.textContent = "Ignored (Symbols, Numbers, Link, or Key)";
    loader.classList.add("hidden");
    btnTranslate.disabled = false;
    return;
  }

  const config = await chrome.storage.local.get([
    "apiEndpoint",
    "apiKey",
    "model",
    "modelType",
    "temperature",
    "systemPrompt",
    "systemPromptLearning",
    "targetLang",
    "sourceLang",
    "richLearningMode",
    "streamTranslations",
    "showThinking"
  ]);

  const apiEndpoint = config.apiEndpoint || "http://192.168.3.202:4090";
  const apiKey = config.apiKey || "";
  const model = config.model || "qwen";
  const modelType = config.modelType || "qwen";
  const temp = parseFloat(config.temperature ?? 0.1);
  const srcLang = config.sourceLang || "auto";
  const targetLang = config.targetLang || "zh-TW";
  const richLearningMode = config.richLearningMode !== false;
  const streamTranslations = config.streamTranslations !== false;
  const showThinking = config.showThinking !== false;

function showLearningLoader() {
  const existing = document.getElementById("learning-loader");
  if (existing) existing.remove();

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
}

  // Check cache first
  const cached = await getCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode);
  if (cached) {
    await addLog("info", "Translation loaded from cache", { text: srcText });
    
    if (cached.rich) {
      await renderRichTranslation(cached.parsed);
      currentTranslationText = cached.parsed.translation;
      
      // If we need to strip thinking from currentTranslationText for copying/TTS
      if (currentTranslationText.includes("<think>")) {
        const parsed = splitThinkingText(currentTranslationText);
        currentTranslationText = parsed.translation;
      }
      
      btnCopy.disabled = false;
      btnTts.disabled = false;
      statusMessage.textContent = "Completed (Loaded from cache)";
      await addHistoryItem(srcText, JSON.stringify(cached.parsed), srcLang, targetLang);
      return;
    } else {
      let finalThinking = "";
      let finalTranslation = cached.text;
      if (cached.text.includes("<think>")) {
        const parsed = splitThinkingText(cached.text);
        finalThinking = parsed.thinking;
        finalTranslation = parsed.translation;
      }
      
      if (showThinking && finalThinking) {
        renderThinkingAndTranslation(finalTranslation.trim(), finalThinking.trim());
      } else {
        targetContent.textContent = finalTranslation.trim();
        targetContent.classList.remove("empty");
      }
      currentTranslationText = finalTranslation.trim();
      btnCopy.disabled = false;
      btnTts.disabled = false;
      statusMessage.textContent = "Translation loaded from cache";
      
      if (richLearningMode) {
        showLearningLoader();
        chrome.runtime.sendMessage({
          action: "fetchPhase2Background",
          srcText,
          translatedText: finalTranslation.trim(),
          targetLang,
          model,
          sourceLang: srcLang
        }).catch(() => {});
      } else {
        await addHistoryItem(srcText, cached.text, srcLang, targetLang);
      }
      return;
    }
  }

  // Phase 1: Translate (always simple translation prompt)
  const rawSystemPrompt = config.systemPrompt || "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  const targetLangName = languageNames[targetLang] || targetLang;
  const systemPrompt = rawSystemPrompt.replace(/{target_lang}/g, targetLangName);

  // UI state for loading
  loader.classList.remove("hidden");
  btnTranslate.disabled = true;
  statusMessage.textContent = "Translating...";
  
  const endpointUrl = formatChatEndpointUrl(apiEndpoint);

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
    const isWord = srcText.trim().split(/\s+/).length === 1;
    let userContent;
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
    messagesPayload = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent }
    ];
  }

  const payload = {
    model: model,
    messages: messagesPayload,
    temperature: targetTemp,
    stream: streamTranslations
  };

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const logHeaders = { "Content-Type": "application/json" };
  if (apiKey) {
    logHeaders["Authorization"] = `Bearer ${apiKey.substring(0, 8)}...`;
  }

  await addLog("request", `Phase 1 Translation (model: ${model}, stream: ${streamTranslations})`, {
    url: endpointUrl,
    headers: logHeaders,
    body: payload
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    let translatedText = "";
    let contentText = "";
    let reasoningText = "";

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
                const delta = parsedLine.choices[0].delta;
                if (delta.reasoning_content) {
                  reasoningText += delta.reasoning_content;
                }
                if (delta.content) {
                  contentText += delta.content;
                }

                translatedText = (reasoningText ? `<think>${reasoningText}</think>\n` : "") + contentText;

                let displayThinking = reasoningText;
                let displayTranslation = contentText;

                if (!displayThinking && contentText.includes("<think>")) {
                  const parsed = splitThinkingText(contentText);
                  displayThinking = parsed.thinking;
                  displayTranslation = parsed.translation;
                }

                if (showThinking && displayThinking) {
                  renderThinkingAndTranslation(displayTranslation, displayThinking);
                } else {
                  targetContent.textContent = displayTranslation;
                }
                currentTranslationText = displayTranslation;
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
        const msg = data.choices[0].message;
        const rawContent = msg.content || "";
        const reasoning = msg.reasoning_content || "";

        translatedText = (reasoning ? `<think>${reasoning}</think>\n` : "") + rawContent;

        let displayThinking = reasoning;
        let displayTranslation = rawContent;

        if (!displayThinking && rawContent.includes("<think>")) {
          const parsed = splitThinkingText(rawContent);
          displayThinking = parsed.thinking;
          displayTranslation = parsed.translation;
        }

        if (showThinking && displayThinking) {
          renderThinkingAndTranslation(displayTranslation.trim(), displayThinking.trim());
        } else {
          targetContent.textContent = displayTranslation.trim();
          targetContent.classList.remove("empty");
        }

        // Track token usage
        let pTokens = 0, cTokens = 0, tTokens = 0;
        if (data.usage) {
          pTokens = data.usage.prompt_tokens || data.usage.promptTokenCount || 0;
          cTokens = data.usage.completion_tokens || data.usage.candidatesTokenCount || 0;
          tTokens = data.usage.total_tokens || data.usage.totalTokenCount || (pTokens + cTokens);
        } else {
          pTokens = Math.ceil((srcText.length + systemPrompt.length) / 4);
          cTokens = Math.ceil(displayTranslation.length / 4);
          tTokens = pTokens + cTokens;
        }
        recordTokenUsage(pTokens, cTokens, tTokens, selectProvider.value);
      } else {
        throw new Error("Invalid API response JSON structure (choices[0].message.content not found)");
      }
    }

    await addLog("response", "Phase 1 Translation successful", { length: translatedText.length });

    btnCopy.disabled = false;
    btnTts.disabled = false;
    statusMessage.textContent = `Completed (${new Date().toLocaleTimeString()})`;

    // Save Phase 1 result to Cache and History first
    const cacheData = { rich: false, text: translatedText };
    await setCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, cacheData);
    await addHistoryItem(srcText, translatedText, srcLang, targetLang);

    // Send to Telegram (if enabled)
    chrome.runtime.sendMessage({
      action: "sendTelegram",
      srcText,
      translatedText
    }).catch(() => {});

    // Trigger Phase 2 in the background
    if (richLearningMode) {
      showLearningLoader();
      chrome.runtime.sendMessage({
        action: "fetchPhase2Background",
        srcText,
        translatedText,
        targetLang,
        model,
        sourceLang: srcLang
      }).catch(() => {});
    }

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
      renderDisabledSitesList();
    } else if (name === "exclusions") {
      renderDisabledSitesList();
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
  // Phase 1 translation prompt is always visible
  groupSimplePrompt.classList.remove("hidden");
  
  // Phase 2 learning prompt is visible only when Rich Learning Mode is enabled
  if (checkRichLearning.checked) {
    groupLearningPrompt.classList.remove("hidden");
  } else {
    groupLearningPrompt.classList.add("hidden");
  }
}
checkRichLearning.addEventListener("change", togglePromptVisibility);

const checkEnableTelegram = document.getElementById("check-enable-telegram");
const telegramFields = document.getElementById("telegram-fields");

function toggleTelegramVisibility() {
  if (checkEnableTelegram.checked) {
    telegramFields.classList.remove("hidden");
  } else {
    telegramFields.classList.add("hidden");
  }
}
checkEnableTelegram.addEventListener("change", toggleTelegramVisibility);

// URL formatting helpers
function formatChatEndpointUrl(apiEndpoint) {
  if (!apiEndpoint) return "http://192.168.3.202:4090/v1/chat/completions";
  let clean = apiEndpoint.trim().replace(/\/$/, "");
  if (clean.includes("googleapis.com") && !clean.includes("/openai")) {
    clean = `${clean}/openai`;
  }
  if (clean.endsWith("/chat/completions")) {
    return clean;
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/chat/completions`;
  }
  return `${clean}/v1/chat/completions`;
}

function formatModelsEndpointUrl(apiEndpoint) {
  if (!apiEndpoint) return "http://192.168.3.202:4090/v1/models";
  let clean = apiEndpoint.trim().replace(/\/$/, "");
  if (clean.endsWith("/chat/completions")) {
    clean = clean.replace(/\/chat\/completions$/, "");
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/models`;
  }
  return `${clean}/v1/models`;
}

// Preset Provider Recipes Definition
const DEFAULT_RECIPES = {
  groq: {
    id: "groq",
    name: "Groq Cloud",
    endpoint: "https://api.groq.com/openai",
    apiKey: "",
    model: "llama-3.3-70b-versatile",
    modelType: "groq",
    stdUrl: "https://api.groq.com/openai",
    recommendedModels: ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant", "qwen-2.5-32b", "deepseek-r1-distill-qwen-32b"],
    keyRequired: true,
    helpText: "Enter your Groq API Key (starts with gsk_)"
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com",
    apiKey: "",
    model: "gpt-4o-mini",
    modelType: "qwen",
    stdUrl: "https://api.openai.com",
    recommendedModels: ["gpt-4o", "gpt-4o-mini", "o3-mini", "gpt-4-turbo"],
    keyRequired: true,
    helpText: "Enter your OpenAI API Key (starts with sk-)"
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek API",
    endpoint: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-chat",
    modelType: "qwen",
    stdUrl: "https://api.deepseek.com",
    recommendedModels: ["deepseek-chat", "deepseek-reasoner"],
    keyRequired: true,
    helpText: "Enter your DeepSeek API Key (starts with sk-)"
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    endpoint: "https://openrouter.ai/api",
    apiKey: "",
    model: "meta-llama/llama-3.3-70b-instruct",
    modelType: "qwen",
    stdUrl: "https://openrouter.ai/api",
    recommendedModels: ["anthropic/claude-3.5-sonnet", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-r1", "google/gemini-3.6-flash"],
    keyRequired: true,
    helpText: "Enter your OpenRouter API Key (starts with sk-or-)"
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey: "",
    model: "gemini-3.6-flash",
    modelType: "qwen",
    stdUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    recommendedModels: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-flash-lite-latest"],
    keyRequired: true,
    helpText: "Enter your Gemini API Key (starts with AIza)"
  },
  ollama: {
    id: "ollama",
    name: "Ollama Local",
    endpoint: "http://localhost:11434",
    apiKey: "",
    model: "qwen2.5:7b",
    modelType: "qwen",
    stdUrl: "http://localhost:11434",
    recommendedModels: ["qwen2.5:7b", "llama3.2:3b", "gemma2:9b", "deepseek-r1:7b"],
    keyRequired: false,
    helpText: "Optional for local Ollama server"
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio Local",
    endpoint: "http://localhost:1234",
    apiKey: "",
    model: "qwen2.5-7b-instruct",
    modelType: "qwen",
    stdUrl: "http://localhost:1234",
    recommendedModels: ["qwen2.5-7b-instruct", "gemma-2-9b-it", "llama-3.1-8b-instruct"],
    keyRequired: false,
    helpText: "Optional for local LM Studio server"
  },
  vllm: {
    id: "vllm",
    name: "Local Gateway / vLLM",
    endpoint: "http://192.168.3.202:4090",
    apiKey: "",
    model: "qwen",
    modelType: "qwen",
    stdUrl: "http://192.168.3.202:4090",
    recommendedModels: ["qwen", "translategemma"],
    keyRequired: false,
    helpText: "Optional for custom local server"
  },
  custom: {
    id: "custom",
    name: "Custom Recipe",
    endpoint: "http://192.168.3.202:4090",
    apiKey: "",
    model: "qwen",
    modelType: "qwen",
    stdUrl: "",
    recommendedModels: ["qwen", "translategemma"],
    keyRequired: false,
    helpText: "Custom endpoint & API key"
  }
};

const selectProvider = document.getElementById("select-provider");
const selectModel = selectProvider; // Backwards compatibility alias
const inputApiEndpoint = document.getElementById("input-api-endpoint");
const inputApiKey = document.getElementById("input-api-key");
const apiKeyGroup = document.getElementById("api-key-group");
const btnToggleKeyVis = document.getElementById("btn-toggle-key-vis");
const btnFixUrl = document.getElementById("btn-fix-url");
const urlRecommendationHelp = document.getElementById("url-recommendation-help");
const apiKeyHelp = document.getElementById("api-key-help");

const btnSaveRecipe = document.getElementById("btn-save-recipe");
const btnTestConnection = document.getElementById("btn-test-connection");
const btnFetchModels = document.getElementById("btn-fetch-models");
const btnDetectModel = btnFetchModels; // Backwards compatibility alias
const btnCloseTestPanel = document.getElementById("btn-close-test-panel");

const testResultsPanel = document.getElementById("test-results-panel");
const testStatusPill = document.getElementById("test-status-pill");
const testLatencyBadge = document.getElementById("test-latency-badge");
const testStepsList = document.getElementById("test-steps-list");
const testDetailMsg = document.getElementById("test-detail-msg");

const inputModel = document.getElementById("input-model");
const selectModelType = document.getElementById("select-model-type");
const modelList = document.getElementById("model-list");
const quickModelsContainer = document.getElementById("quick-models-container");
const modelCountTag = document.getElementById("model-count-tag");


// Disabled Websites Manager Elements & Logic
function getBaseDomain(hostname) {
  if (!hostname || typeof hostname !== "string") return "";
  const host = hostname.toLowerCase().trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes(".")) {
    return host;
  }
  const parts = host.split(".");
  if (parts.length <= 2) {
    return host;
  }
  const multiPartTlds = [
    "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
    "com.tw", "org.tw", "net.tw", "edu.tw", "gov.tw",
    "co.jp", "ne.jp", "or.jp", "ac.jp",
    "com.au", "net.au", "org.au",
    "com.cn", "net.cn", "org.cn", "gov.cn",
    "com.br", "net.br", "org.br",
    "co.nz", "net.nz", "org.nz",
    "co.za", "web.za", "org.za"
  ];
  const lastTwo = parts.slice(-2).join(".");
  if (multiPartTlds.includes(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}

function isDomainDisabled(hostname, disabledDomains) {
  if (!hostname || !Array.isArray(disabledDomains) || disabledDomains.length === 0) {
    return false;
  }
  const host = hostname.toLowerCase().trim();
  const base = getBaseDomain(host);

  return disabledDomains.some(entry => {
    if (!entry) return false;
    let cleanEntry = entry.toLowerCase().trim();
    if (cleanEntry.startsWith("*.")) {
      cleanEntry = cleanEntry.slice(2);
    }
    return host === cleanEntry || host.endsWith("." + cleanEntry) || base === cleanEntry || base.endsWith("." + cleanEntry);
  });
}

const btnToggleCurrentSite = document.getElementById("btn-toggle-current-site");
const disabledSitesChips = document.getElementById("disabled-sites-chips");
const exclusionsCountText = document.getElementById("exclusions-count-text");
const exclusionsListContainer = document.getElementById("exclusions-list-container");
const btnOpenExclusions = document.getElementById("btn-open-exclusions");
const btnClearExclusions = document.getElementById("btn-clear-exclusions");
const btnAddExclusion = document.getElementById("btn-add-exclusion");
const inputAddExclusion = document.getElementById("input-add-exclusion");
const inputSearchExclusions = document.getElementById("input-search-exclusions");

async function removeExclusionDomain(domain) {
  const updateRes = await chrome.storage.local.get("disabledDomains");
  let list = updateRes.disabledDomains || [];
  const idx = list.indexOf(domain);
  if (idx !== -1) {
    list.splice(idx, 1);
  }
  await chrome.storage.local.set({ disabledDomains: list });
  await renderDisabledSitesList();
  await addLog("info", `Removed website exclusion for ${domain}`);
}

async function addExclusionDomain(rawDomain) {
  if (!rawDomain) return;
  let cleanDomain = rawDomain.toLowerCase().trim();
  cleanDomain = cleanDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleanDomain) return;

  const res = await chrome.storage.local.get("disabledDomains");
  let list = res.disabledDomains || [];
  if (!list.includes(cleanDomain)) {
    list.push(cleanDomain);
    await chrome.storage.local.set({ disabledDomains: list });
    await addLog("info", `Added manual website exclusion for ${cleanDomain}`);
  }
  if (inputAddExclusion) inputAddExclusion.value = "";
  await renderDisabledSitesList();
}

async function renderDisabledSitesList() {
  const res = await chrome.storage.local.get("disabledDomains");
  const disabledDomains = res.disabledDomains || [];

  let currentDomain = "";
  let baseDomain = "";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith("http")) {
      currentDomain = new URL(tabs[0].url).hostname;
      baseDomain = getBaseDomain(currentDomain);
    }
  } catch (e) {}

  if (btnToggleCurrentSite) {
    if (currentDomain) {
      const isDisabled = isDomainDisabled(currentDomain, disabledDomains);
      const targetName = (baseDomain && baseDomain !== currentDomain) ? `${baseDomain} (*.${baseDomain})` : currentDomain;
      btnToggleCurrentSite.textContent = isDisabled
        ? `✅ Enable on ${targetName}`
        : `🚫 Disable on ${targetName}`;
    } else {
      btnToggleCurrentSite.textContent = "Toggle Current Site";
    }
  }

  // Update Summary card count
  if (exclusionsCountText) {
    const count = disabledDomains.length;
    exclusionsCountText.textContent = count === 0
      ? "0 websites excluded"
      : count === 1
        ? "1 website excluded"
        : `${count} websites excluded`;
  }

  // Legacy fallback if chips container exists
  if (disabledSitesChips) {
    disabledSitesChips.innerHTML = "";
    if (disabledDomains.length === 0) {
      disabledSitesChips.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">No websites excluded (translating everywhere)</span>`;
    } else {
      disabledDomains.forEach(domain => {
        const chip = document.createElement("div");
        chip.className = "site-chip";
        chip.innerHTML = `
          <span>🚫 ${escapeHTML(domain)}</span>
          <span class="remove-site-btn" title="Remove exclusion">✕</span>
        `;
        chip.querySelector(".remove-site-btn").addEventListener("click", () => removeExclusionDomain(domain));
        disabledSitesChips.appendChild(chip);
      });
    }
  }

  // Render dedicated drawer list
  if (exclusionsListContainer) {
    exclusionsListContainer.innerHTML = "";
    const filterQuery = (inputSearchExclusions?.value || "").toLowerCase().trim();
    const filteredList = filterQuery
      ? disabledDomains.filter(d => d.toLowerCase().includes(filterQuery))
      : disabledDomains;

    if (disabledDomains.length === 0) {
      exclusionsListContainer.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 8px; opacity: 0.5;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
          <p style="font-size: 12px; margin: 0;">No websites excluded (translating everywhere).</p>
        </div>
      `;
      return;
    }

    if (filteredList.length === 0) {
      exclusionsListContainer.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 20px 10px; color: var(--text-muted);">
          <p style="font-size: 12px; margin: 0;">No domains match "${escapeHTML(filterQuery)}".</p>
        </div>
      `;
      return;
    }

    filteredList.forEach(domain => {
      const item = document.createElement("div");
      item.className = "exclusion-item";
      item.innerHTML = `
        <div class="exclusion-domain-info">
          <span class="exclusion-domain-icon">🌐</span>
          <span>${escapeHTML(domain)}</span>
        </div>
        <button class="btn-remove-exclusion" title="Remove website exclusion">✕ Remove</button>
      `;
      item.querySelector(".btn-remove-exclusion").addEventListener("click", () => removeExclusionDomain(domain));
      exclusionsListContainer.appendChild(item);
    });
  }
}

if (btnOpenExclusions) {
  btnOpenExclusions.addEventListener("click", () => openDrawer("exclusions"));
}

if (btnClearExclusions) {
  btnClearExclusions.addEventListener("click", async () => {
    if (confirm("Are you sure you want to clear all website exclusions?")) {
      await chrome.storage.local.set({ disabledDomains: [] });
      await renderDisabledSitesList();
      await addLog("info", "Cleared all website exclusions.");
    }
  });
}

if (btnAddExclusion) {
  btnAddExclusion.addEventListener("click", () => addExclusionDomain(inputAddExclusion?.value));
}

if (inputAddExclusion) {
  inputAddExclusion.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addExclusionDomain(inputAddExclusion.value);
    }
  });
}

if (inputSearchExclusions) {
  inputSearchExclusions.addEventListener("input", () => renderDisabledSitesList());
}

if (btnToggleCurrentSite) {
  btnToggleCurrentSite.addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0] && tabs[0].url && tabs[0].url.startsWith("http")) {
        const domain = new URL(tabs[0].url).hostname;
        const baseDomain = getBaseDomain(domain);
        const res = await chrome.storage.local.get("disabledDomains");
        let list = res.disabledDomains || [];
        
        const isDisabled = isDomainDisabled(domain, list);
        if (isDisabled) {
          list = list.filter(d => {
            if (!d) return false;
            let clean = d.toLowerCase().trim();
            if (clean.startsWith("*.")) clean = clean.slice(2);
            return clean !== domain && clean !== baseDomain;
          });
          await addLog("info", `Enabled translation on ${baseDomain}`);
        } else {
          list.push(baseDomain);
          await addLog("info", `Disabled translation on ${baseDomain}`);
        }

        await chrome.storage.local.set({ disabledDomains: list });
        renderDisabledSitesList();

        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "updateDisabledSiteState",
            domain: domain,
            baseDomain: baseDomain,
            isDisabled: !isDisabled
          }).catch(() => {});
        }
      } else {
        alert("Please open a valid webpage (HTTP/HTTPS) to toggle website translation.");
      }
    } catch (e) {}
  });
}

let loadedRecipes = JSON.parse(JSON.stringify(DEFAULT_RECIPES));
let activeProviderKey = "vllm";

// Toggle API Key password visibility
if (btnToggleKeyVis) {
  btnToggleKeyVis.addEventListener("click", () => {
    if (inputApiKey.type === "password") {
      inputApiKey.type = "text";
      btnToggleKeyVis.textContent = "Hide";
    } else {
      inputApiKey.type = "password";
      btnToggleKeyVis.textContent = "Show";
    }
  });
}

let autoSaveTimer = null;

// Auto save active form values to current provider's recipe and chrome storage
function autoSaveCurrentRecipe() {
  syncFormToCurrentRecipe();
  const currentProvider = selectProvider.value;

  if (recipeStatusTag) {
    recipeStatusTag.textContent = "Saving...";
    recipeStatusTag.className = "status-tag tag-saved";
  }

  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(async () => {
    await chrome.storage.local.set({
      currentProvider: currentProvider,
      providerRecipes: loadedRecipes,
      apiEndpoint: inputApiEndpoint.value.trim(),
      apiKey: inputApiKey.value.trim(),
      model: inputModel.value.trim(),
      modelType: selectModelType.value
    });

    if (recipeStatusTag) {
      recipeStatusTag.textContent = "Auto-saved ✓";
      setTimeout(() => { if (recipeStatusTag) recipeStatusTag.textContent = "Recipe Active"; }, 2000);
    }
  }, 400);
}

// Auto Fix URL listener
if (btnFixUrl) {
  btnFixUrl.addEventListener("click", () => {
    const currentRec = loadedRecipes[selectProvider.value] || DEFAULT_RECIPES[selectProvider.value];
    if (currentRec && currentRec.stdUrl) {
      inputApiEndpoint.value = currentRec.stdUrl;
      checkUrlFormat();
      autoSaveCurrentRecipe();
      addLog("info", `Updated endpoint URL to recommended base: ${currentRec.stdUrl}`);
    }
  });
}

// Check URL vs recommended URL for active provider
function checkUrlFormat() {
  const currentProvider = selectProvider.value;
  const currentRec = loadedRecipes[currentProvider] || DEFAULT_RECIPES[currentProvider];
  const urlVal = inputApiEndpoint.value.trim();
  const keyVal = inputApiKey ? inputApiKey.value.trim() : "";

  let httpWarning = "";
  if (urlVal.toLowerCase().startsWith("http://")) {
    const isLocalhost = urlVal.includes("localhost") || urlVal.includes("127.0.0.1");
    if (keyVal || !isLocalhost) {
      httpWarning = `<br><span style="color:var(--warning-color); font-weight:600;">⚠️ Insecure HTTP endpoint: API key and translation text will be transmitted unencrypted over cleartext HTTP.</span>`;
    }
  }

  if (!urlVal) {
    if (btnFixUrl) btnFixUrl.classList.add("hidden");
    if (urlRecommendationHelp) urlRecommendationHelp.innerHTML = "Base URL for OpenAI-compatible completions API." + httpWarning;
    return;
  }

  if (currentRec && currentRec.stdUrl) {
    const cleanInput = urlVal.replace(/\/$/, "");
    const cleanStd = currentRec.stdUrl.replace(/\/$/, "");
    if (cleanInput !== cleanStd && !cleanInput.startsWith(cleanStd)) {
      if (btnFixUrl) btnFixUrl.classList.remove("hidden");
      if (urlRecommendationHelp) {
        urlRecommendationHelp.innerHTML = `💡 Standard URL for ${escapeHTML(currentRec.name)}: <code style="color:var(--accent-color-1);">${escapeHTML(currentRec.stdUrl)}</code>` + httpWarning;
      }
    } else {
      if (btnFixUrl) btnFixUrl.classList.add("hidden");
      if (urlRecommendationHelp) {
        urlRecommendationHelp.innerHTML = `✓ Standard base URL for ${escapeHTML(currentRec.name)}.` + httpWarning;
      }
    }
  } else {
    if (btnFixUrl) btnFixUrl.classList.add("hidden");
    if (urlRecommendationHelp) urlRecommendationHelp.innerHTML = "OpenAI-compatible Chat Completion endpoint." + httpWarning;
  }
}

if (inputApiEndpoint) {
  inputApiEndpoint.addEventListener("input", () => {
    checkUrlFormat();
    autoSaveCurrentRecipe();
  });
}

if (inputApiKey) {
  inputApiKey.addEventListener("input", autoSaveCurrentRecipe);
}

if (inputModel) {
  inputModel.addEventListener("input", autoSaveCurrentRecipe);
}

if (selectModelType) {
  selectModelType.addEventListener("change", autoSaveCurrentRecipe);
}

// Render Quick Model Chips
function renderQuickModelChips(models) {
  if (!quickModelsContainer) return;
  quickModelsContainer.innerHTML = "";
  
  const currentVal = inputModel.value.trim();
  const currentRec = loadedRecipes[selectProvider.value] || DEFAULT_RECIPES[selectProvider.value];
  const recList = currentRec ? (currentRec.recommendedModels || []) : [];

  const combined = Array.from(new Set([...(models || []), ...recList])).filter(Boolean);

  if (modelCountTag) {
    modelCountTag.textContent = `${combined.length} models`;
  }

  combined.forEach(m => {
    const chip = document.createElement("div");
    const isActive = m === currentVal;
    chip.className = `model-chip ${isActive ? 'active' : ''}`;
    
    let tag = "";
    if (recList.includes(m)) tag = "Preset";
    if (m.includes("3.3") || m.includes("gpt-4o") || m.includes("reasoner") || m.includes("2.5")) tag = "Latest";
    
    chip.innerHTML = `${escapeHTML(m)}${tag ? ` <span class="chip-tag">${escapeHTML(tag)}</span>` : ''}`;
    
    chip.addEventListener("click", () => {
      inputModel.value = m;
      renderQuickModelChips(combined);
      autoSaveCurrentRecipe();
    });
    
    quickModelsContainer.appendChild(chip);
  });
}

const DEPRECATED_GROQ_MODELS = [
  "llama3-70b-8192",
  "llama3-8b-8192",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
  "gemma-7b-it",
  "gemma2-9b-it",
  "llama2-70b-4096"
];

function cleanGroqModel(modelName) {
  if (!modelName || DEPRECATED_GROQ_MODELS.includes(modelName.trim())) {
    return "llama-3.3-70b-versatile";
  }
  return modelName.trim();
}

const DEPRECATED_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-1.0-pro",
  "gemini-pro"
];

function cleanGeminiModel(modelName) {
  if (!modelName) return "gemini-3.6-flash";
  const trimmed = modelName.trim();
  const lower = trimmed.toLowerCase();

  const isNonGemini = /^(qwen|llama|gpt|deepseek|claude|mistral|mixtral|gemma)/i.test(lower) || (!lower.includes("gemini") && !lower.includes("nano-banana") && !lower.includes("lyria"));
  const isDeprecated = DEPRECATED_GEMINI_MODELS.includes(lower);

  if (isNonGemini || isDeprecated) {
    return "gemini-3.6-flash";
  }
  return trimmed;
}

// Load recipe for selected provider into form
function applyRecipeToForm(providerKey) {
  activeProviderKey = providerKey;
  const defaultRecipe = DEFAULT_RECIPES[providerKey] || DEFAULT_RECIPES.custom;
  const recipe = loadedRecipes[providerKey] || Object.assign({}, defaultRecipe);

  // Auto-fix URL to standard base URL for selected provider
  if (providerKey !== "custom" && defaultRecipe.stdUrl) {
    recipe.endpoint = defaultRecipe.stdUrl;
  } else if (!recipe.endpoint && defaultRecipe.stdUrl) {
    recipe.endpoint = defaultRecipe.stdUrl;
  }

  if (providerKey === "groq") {
    recipe.model = cleanGroqModel(recipe.model);
    recipe.recommendedModels = ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant", "qwen-2.5-32b", "deepseek-r1-distill-qwen-32b"];
  } else if (providerKey === "gemini") {
    recipe.model = cleanGeminiModel(recipe.model);
    recipe.recommendedModels = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-flash-lite-latest"];
  }

  inputApiEndpoint.value = recipe.endpoint || defaultRecipe.stdUrl || "";
  inputApiKey.value = recipe.apiKey || "";
  inputModel.value = recipe.model || "";
  selectModelType.value = recipe.modelType || "qwen";

  if (apiKeyHelp) {
    apiKeyHelp.textContent = recipe.helpText || "Required for cloud providers, optional for local endpoints.";
  }

  if (apiKeyGroup) {
    if (recipe.keyRequired === false) {
      apiKeyGroup.classList.add("hidden");
    } else {
      apiKeyGroup.classList.remove("hidden");
    }
  }

  checkUrlFormat();

  // Populate datalist
  if (modelList) {
    modelList.innerHTML = "";
    const recs = recipe.recommendedModels || [];
    recs.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m;
      modelList.appendChild(opt);
    });
  }

  renderQuickModelChips(recipe.recommendedModels || []);
}

// Save active form values to current provider's recipe
function syncFormToCurrentRecipe() {
  const providerKey = selectProvider.value;
  if (!loadedRecipes[providerKey]) {
    loadedRecipes[providerKey] = Object.assign({}, DEFAULT_RECIPES[providerKey] || DEFAULT_RECIPES.custom);
  }
  
  loadedRecipes[providerKey].endpoint = inputApiEndpoint.value.trim();
  loadedRecipes[providerKey].apiKey = inputApiKey.value.trim();
  loadedRecipes[providerKey].model = inputModel.value.trim();
  loadedRecipes[providerKey].modelType = selectModelType.value;
}

// Provider Dropdown Change listener
if (selectProvider) {
  selectProvider.addEventListener("change", async () => {
    // Save current recipe state first
    syncFormToCurrentRecipe();
    
    // Switch to new provider recipe
    const newProvider = selectProvider.value;
    applyRecipeToForm(newProvider);
    
    // Save updated provider recipes in storage
    await chrome.storage.local.set({
      currentProvider: newProvider,
      providerRecipes: loadedRecipes,
      apiEndpoint: inputApiEndpoint.value.trim(),
      apiKey: inputApiKey.value.trim(),
      model: inputModel.value.trim(),
      modelType: selectModelType.value
    });

    // Automatically fetch latest models if Gemini or cloud provider is selected with an API key
    if (newProvider === "gemini" && inputApiKey.value.trim()) {
      fetchLatestModels(true);
    }

    if (recipeStatusTag) {
      recipeStatusTag.textContent = "Recipe Loaded";
      setTimeout(() => { if (recipeStatusTag) recipeStatusTag.textContent = "Recipe Active"; }, 1500);
    }
  });
}

// Save Recipe button listener
if (btnSaveRecipe) {
  btnSaveRecipe.addEventListener("click", async () => {
    syncFormToCurrentRecipe();
    const currentProvider = selectProvider.value;
    
    await chrome.storage.local.set({
      currentProvider: currentProvider,
      providerRecipes: loadedRecipes,
      apiEndpoint: inputApiEndpoint.value.trim(),
      apiKey: inputApiKey.value.trim(),
      model: inputModel.value.trim(),
      modelType: selectModelType.value
    });

    if (recipeStatusTag) {
      recipeStatusTag.textContent = "Saved! ✓";
      recipeStatusTag.className = "status-tag tag-saved";
      setTimeout(() => { if (recipeStatusTag) recipeStatusTag.textContent = "Recipe Active"; }, 2000);
    }
    
    await addLog("info", `Saved recipe for provider: ${currentProvider}`);
    alert(`Recipe saved successfully for ${loadedRecipes[currentProvider]?.name || currentProvider}!`);
  });
}

// Dismiss diagnostic panel
if (btnCloseTestPanel) {
  btnCloseTestPanel.addEventListener("click", () => {
    if (testResultsPanel) testResultsPanel.classList.add("hidden");
  });
}

// Diagnostic Connection Tester Engine
async function runDiagnosticTest() {
  const apiEndpoint = inputApiEndpoint.value.trim();
  const apiKey = inputApiKey.value.trim();
  let model = inputModel.value.trim() || "qwen";
  if (selectProvider.value === "gemini") {
    model = cleanGeminiModel(model);
    inputModel.value = model;
  }
  const modelType = selectModelType.value;

  if (!apiEndpoint) {
    alert("Please enter a Server API Endpoint URL first.");
    return;
  }

  if (testResultsPanel) testResultsPanel.classList.remove("hidden");
  if (testStatusPill) {
    testStatusPill.textContent = "Testing...";
    testStatusPill.className = "test-pill pill-pending";
  }
  if (testLatencyBadge) testLatencyBadge.classList.add("hidden");
  if (testDetailMsg) testDetailMsg.textContent = "Running 4-step connection diagnostic...";
  
  if (testStepsList) {
    testStepsList.innerHTML = `
      <div class="test-step-item" id="step-1">⏳ Step 1: Validating API Endpoint URL...</div>
      <div class="test-step-item" id="step-2">⏳ Step 2: Checking Server Reachability & Auth...</div>
      <div class="test-step-item" id="step-3">⏳ Step 3: Sending Chat Completion Test Request...</div>
      <div class="test-step-item" id="step-4">⏳ Step 4: Verifying LLM Response & Latency...</div>
    `;
  }

  const chatEndpointUrl = formatChatEndpointUrl(apiEndpoint);
  const startTime = Date.now();

  try {
    // Step 1: URL format validation
    const step1El = document.getElementById("step-1");
    if (step1El) step1El.innerHTML = `✓ Step 1: Endpoint URL formatted → <code style="color:var(--accent-color-1);">${escapeHTML(chatEndpointUrl)}</code>`;
    if (step1El) step1El.className = "test-step-item success";

    // Step 2: Prepare Auth headers
    const step2El = document.getElementById("step-2");
    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      if (step2El) step2El.innerHTML = `✓ Step 2: Authorization Header set (Bearer ${escapeHTML(apiKey.substring(0, 6))}...)`;
    } else {
      if (step2El) step2El.innerHTML = `✓ Step 2: No API key provided (Local Server / Anonymous mode)`;
    }
    if (step2El) step2El.className = "test-step-item success";

    // Step 3: Send Test Chat Probe Payload
    const step3El = document.getElementById("step-3");
    let testPayload;
    if (modelType === "translategemma") {
      testPayload = {
        model: model,
        messages: [{ role: "user", content: "Translate this to en:\nhello" }],
        temperature: 0
      };
    } else {
      testPayload = {
        model: model,
        messages: [{ role: "user", content: "Respond with single word: OK" }],
        max_tokens: 5,
        temperature: 0
      };
    }

    const response = await fetch(chatEndpointUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(testPayload)
    });

    const latency = Date.now() - startTime;
    const step4El = document.getElementById("step-4");

    if (response.ok) {
      const data = await response.json();
      let responseText = "";
      if (data.choices && data.choices[0] && data.choices[0].message) {
        responseText = data.choices[0].message.content.trim();
      }

      if (step3El) step3El.innerHTML = `✓ Step 3: Server responded HTTP ${response.status} OK!`;
      if (step3El) step3El.className = "test-step-item success";

      if (step4El) step4El.innerHTML = `✓ Step 4: Test response received: "${escapeHTML(responseText) || 'OK'}" (${latency}ms)`;
      if (step4El) step4El.className = "test-step-item success";

      if (testStatusPill) {
        testStatusPill.textContent = "🟢 Connection Success";
        testStatusPill.className = "test-pill pill-success";
      }
      if (testLatencyBadge) {
        testLatencyBadge.textContent = `⚡ ${latency}ms`;
        testLatencyBadge.classList.remove("hidden");
      }
      if (testDetailMsg) {
        testDetailMsg.innerHTML = `<strong>✔ Connection Test Passed!</strong><br>Provider server is responsive and model <code>${escapeHTML(model)}</code> answered correctly.`;
      }

      await addLog("info", `Connection test success for ${chatEndpointUrl} (${latency}ms)`);
      
      // Auto refresh models on success
      fetchLatestModels(true);
    } else {
      const errorText = await response.text().catch(() => "");
      let errorMsg = `HTTP Error ${response.status}: ${response.statusText}`;
      try {
        const errJson = JSON.parse(errorText);
        if (errJson.error && errJson.error.message) {
          errorMsg = errJson.error.message;
        } else if (Array.isArray(errJson) && errJson[0] && errJson[0].error && errJson[0].error.message) {
          errorMsg = errJson[0].error.message;
        }
      } catch (e) {}

      if (step3El) step3El.innerHTML = `✘ Step 3: Server returned HTTP ${response.status}`;
      if (step3El) step3El.className = "test-step-item failed";

      if (step4El) step4El.innerHTML = `✘ Step 4: Verification failed (${response.status})`;
      if (step4El) step4El.className = "test-step-item failed";

      if (testStatusPill) {
        testStatusPill.textContent = "🔴 Connection Failed";
        testStatusPill.className = "test-pill pill-failed";
      }
      
      let troubleshooting = "";
      const safeErrorMsg = escapeHTML(errorMsg);
      if (response.status === 401 || response.status === 403) {
        troubleshooting = `🔑 <strong>Authentication Error:</strong> ${safeErrorMsg || "Invalid or missing API Key. Please verify your API Key."}`;
      } else if (response.status === 404) {
        troubleshooting = `🔍 <strong>404 Not Found:</strong> ${safeErrorMsg || "Check if endpoint URL includes correct path or if model name exists."}`;
      } else {
        troubleshooting = `⚠️ <strong>Server Response:</strong> ${safeErrorMsg}`;
      }

      if (testDetailMsg) {
        testDetailMsg.innerHTML = `<strong>✘ Connection Failed (HTTP ${response.status})</strong><br>${troubleshooting}`;
      }

      await addLog("error", `Connection test failed for ${chatEndpointUrl}: ${errorMsg}`);
    }
  } catch (err) {
    const latency = Date.now() - startTime;
    const step3El = document.getElementById("step-3");
    const step4El = document.getElementById("step-4");

    if (step3El) step3El.innerHTML = `✘ Step 3: Request failed → ${escapeHTML(err.message)}`;
    if (step3El) step3El.className = "test-step-item failed";

    if (step4El) step4El.innerHTML = `✘ Step 4: Connection error (${latency}ms)`;
    if (step4El) step4El.className = "test-step-item failed";

    if (testStatusPill) {
      testStatusPill.textContent = "🔴 Network Error";
      testStatusPill.className = "test-pill pill-failed";
    }

    if (testDetailMsg) {
      testDetailMsg.innerHTML = `<strong>✘ Network Connection Error</strong><br>Could not connect to server at <code>${escapeHTML(apiEndpoint)}</code>.<br><small>Troubleshooting: Ensure server is running and CORS is enabled (e.g. for Ollama set <code>OLLAMA_ORIGINS=*</code>).</small>`;
    }

    await addLog("error", `Connection test error: ${err.message}`);
  }
}

if (btnTestConnection) {
  btnTestConnection.addEventListener("click", runDiagnosticTest);
}

// Dynamic Model List Fetcher Engine
async function fetchLatestModels(silent = false) {
  const apiEndpoint = inputApiEndpoint.value.trim();
  const apiKey = inputApiKey.value.trim();
  const currentProvider = selectProvider.value;

  if (!apiEndpoint) {
    if (!silent) alert("Please enter a Server API Endpoint first.");
    return;
  }

  if (btnFetchModels) {
    btnFetchModels.disabled = true;
    const labelSpan = btnFetchModels.querySelector("span:last-child");
    if (labelSpan) labelSpan.textContent = "Fetching...";
  }

  await addLog("info", `Fetching latest models from: ${apiEndpoint}`);

  try {
    const cleanEndpoint = apiEndpoint.replace(/\/$/, "");
    let detectedModels = [];

    const headers = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    // 1. Standard /v1/models
    try {
      const modelsUrl = formatModelsEndpointUrl(apiEndpoint);
      const res = await fetch(modelsUrl, { headers: headers });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.data)) {
          detectedModels = data.data.map(m => (m.id || "").replace(/^models\//, "")).filter(Boolean);
        }
      }
    } catch (e) {}

    // 2. Ollama /api/tags
    if (detectedModels.length === 0) {
      try {
        const res = await fetch(`${cleanEndpoint}/api/tags`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.models)) {
            detectedModels = data.models.map(m => m.name);
          }
        }
      } catch (e) {}
    }

    // 3. Llama.cpp /models
    if (detectedModels.length === 0) {
      try {
        const res = await fetch(`${cleanEndpoint}/models`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            detectedModels = data.map(m => m.id || m.name).filter(Boolean);
          } else if (data && Array.isArray(data.data)) {
            detectedModels = data.data.map(m => m.id || m.name).filter(Boolean);
          }
        }
      } catch (e) {}
    }

    // Filter and prioritize Flash models for Gemini
    if (currentProvider === "gemini" && detectedModels.length > 0) {
      const isTextModel = m => !/image|audio|video|veo|imagen|tts|embedding|live-preview|computer-use|robotics/i.test(m);
      const flashModels = detectedModels.filter(m => /flash/i.test(m) && isTextModel(m));
      flashModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

      const otherTextModels = detectedModels.filter(m => !flashModels.includes(m) && isTextModel(m));
      otherTextModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

      detectedModels = [...flashModels, ...otherTextModels];
    }

    const currentRec = loadedRecipes[currentProvider] || DEFAULT_RECIPES[currentProvider];
    const fallbackRecs = currentRec ? (currentRec.recommendedModels || []) : [];
    const allModels = Array.from(new Set([...detectedModels, ...fallbackRecs])).filter(Boolean);

    if (modelList) {
      modelList.innerHTML = "";
      allModels.forEach(m => {
        const opt = document.createElement("option");
        opt.value = m;
        modelList.appendChild(opt);
      });
    }

    if (detectedModels.length > 0) {
      let defaultSelected = detectedModels[0];
      if (currentProvider === "gemini") {
        const topFlash = detectedModels.find(m => /flash/i.test(m) && !/image|audio|video|veo|imagen|tts|embedding/i.test(m));
        if (topFlash) defaultSelected = topFlash;
      }

      let existingModel = inputModel.value.trim();
      if (currentProvider === "gemini") {
        existingModel = cleanGeminiModel(existingModel);
      } else if (currentProvider === "groq") {
        existingModel = cleanGroqModel(existingModel);
      }

      // Preserve previously worked/saved model if valid and present in models list
      if (existingModel && (allModels.includes(existingModel) || allModels.some(m => m.toLowerCase() === existingModel.toLowerCase()))) {
        inputModel.value = existingModel;
      } else {
        inputModel.value = defaultSelected;
      }
      renderQuickModelChips(allModels);
      await addLog("info", `Detected ${detectedModels.length} active models from server. Default Flash model: ${inputModel.value}`);
      if (!silent) alert(`Successfully fetched ${detectedModels.length} live model(s) from server!\nDefault Flash model "${inputModel.value}" selected.`);
    } else {
      renderQuickModelChips(fallbackRecs);
      await addLog("warn", `Could not fetch live models from ${apiEndpoint}. Using provider presets.`);
      if (!silent) alert(`Notice: Could not fetch live models from server. Preset provider models loaded.`);
    }
  } catch (err) {
    await addLog("error", `Model fetch error: ${err.message}`);
    if (!silent) alert(`Failed to fetch models: ${err.message}`);
  } finally {
    if (btnFetchModels) {
      btnFetchModels.disabled = false;
      const labelSpan = btnFetchModels.querySelector("span:last-child");
      if (labelSpan) labelSpan.textContent = "Fetch Models";
    }
  }
}

if (btnFetchModels) {
  btnFetchModels.addEventListener("click", () => fetchLatestModels(false));
}

function updateTextSizeClass(size) {
  document.body.classList.remove("font-size-small", "font-size-medium", "font-size-large");
  document.body.classList.add(`font-size-${size}`);
}

// Local Draft & Unsaved State System Constants & Helpers
const DRAFT_STORAGE_KEY = "settings_draft";
const DRAFT_SECRET_STORAGE_KEY = "settings_draft_secrets";

// Credentials never go into the localStorage draft, because that is written to disk and
// survives indefinitely. An in-progress key still has to survive the popup closing (which
// happens on any outside click), so it is held in chrome.storage.session instead: memory
// only, never written to disk, dropped on browser restart, and unreachable from content
// scripts. Where session storage is unavailable (Firefox < 115) the key simply is not
// restored, which is the safe direction to fail in.
const DRAFT_SECRET_KEYS = ["apiKey", "telegramBotToken"];

let lastServerSettings = null;
let settingsDraftListenersInitialized = false;

function redactDraftSecrets(state) {
  if (!state || typeof state !== "object") return state;
  const copy = { ...state };
  DRAFT_SECRET_KEYS.forEach(key => delete copy[key]);
  return copy;
}

function getSessionStorageAreaSafe() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
      return chrome.storage.session;
    }
  } catch (e) {}
  return null;
}

// Keeps only the credentials that actually differ from what is saved, so nothing is held
// in session storage during normal use.
async function saveDraftSecrets(state) {
  const session = getSessionStorageAreaSafe();
  if (!session) return;

  const pending = {};
  let hasPending = false;
  DRAFT_SECRET_KEYS.forEach(key => {
    const current = state && state[key] !== undefined ? state[key] : "";
    const saved = lastServerSettings && lastServerSettings[key] !== undefined ? lastServerSettings[key] : "";
    if (current !== saved) {
      pending[key] = current;
      hasPending = true;
    }
  });

  try {
    if (hasPending) {
      await session.set({ [DRAFT_SECRET_STORAGE_KEY]: pending });
    } else {
      await session.remove(DRAFT_SECRET_STORAGE_KEY);
    }
  } catch (e) {
    console.warn("Failed to sync draft credentials to session storage:", e);
  }
}

async function clearDraftSecrets() {
  const session = getSessionStorageAreaSafe();
  if (!session) return;
  try {
    await session.remove(DRAFT_SECRET_STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear draft credentials from session storage:", e);
  }
}

async function restoreDraftSecretsToForm() {
  const session = getSessionStorageAreaSafe();
  if (!session) return;
  try {
    const stored = await session.get(DRAFT_SECRET_STORAGE_KEY);
    const pending = stored ? stored[DRAFT_SECRET_STORAGE_KEY] : null;
    if (pending && typeof pending === "object") {
      // Only carries credential fields, so this cannot trigger a provider switch.
      applyStateToForm(pending);
    }
  } catch (e) {
    console.warn("Failed to restore draft credentials from session storage:", e);
  }
}

function getLocalStorageSafe() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch (e) {}
  return null;
}

function getFormSettingsState() {
  const tempInput = document.getElementById("input-temperature");
  const historyInput = document.getElementById("input-max-history");
  const autoInput = document.getElementById("check-auto-translate");
  const dblclickInput = document.getElementById("check-dblclick-translate");
  const streamInput = document.getElementById("check-stream-translations");
  const thinkingInput = document.getElementById("check-show-thinking");
  const sizeSelect = document.getElementById("select-text-size");
  const promptInput = document.getElementById("input-system-prompt");
  const promptLearningInput = document.getElementById("input-system-prompt-learning");
  const tgTokenInput = document.getElementById("input-telegram-token");
  const tgChatInput = document.getElementById("input-telegram-chatid");

  return {
    currentProvider: selectProvider ? selectProvider.value : "vllm",
    apiEndpoint: inputApiEndpoint ? inputApiEndpoint.value.trim() : "",
    apiKey: inputApiKey ? inputApiKey.value.trim() : "",
    model: inputModel ? inputModel.value.trim() : "",
    modelType: selectModelType ? selectModelType.value : "qwen",
    temperature: tempInput ? parseFloat(tempInput.value) : 0.1,
    maxHistory: historyInput ? parseInt(historyInput.value, 10) : 100,
    autoTranslate: autoInput ? autoInput.checked : true,
    grammarCheck: checkGrammarCheck ? checkGrammarCheck.checked : true,
    richLearningMode: checkRichLearning ? checkRichLearning.checked : true,
    doubleClickTranslate: dblclickInput ? dblclickInput.checked : true,
    streamTranslations: streamInput ? streamInput.checked : true,
    showThinking: thinkingInput ? thinkingInput.checked : true,
    textSize: sizeSelect ? sizeSelect.value : "medium",
    systemPrompt: promptInput ? promptInput.value.trim() : "",
    systemPromptLearning: promptLearningInput ? promptLearningInput.value.trim() : "",
    enableTelegram: checkEnableTelegram ? checkEnableTelegram.checked : false,
    telegramBotToken: tgTokenInput ? tgTokenInput.value.trim() : "",
    telegramChatId: tgChatInput ? tgChatInput.value.trim() : ""
  };
}

function areSettingsDifferent(stateA, stateB, ignoreKeys = []) {
  if (!stateA || !stateB) return true;
  const keys = [
    "currentProvider",
    "apiEndpoint",
    "apiKey",
    "model",
    "modelType",
    "temperature",
    "maxHistory",
    "autoTranslate",
    "grammarCheck",
    "richLearningMode",
    "doubleClickTranslate",
    "streamTranslations",
    "showThinking",
    "textSize",
    "systemPrompt",
    "systemPromptLearning",
    "enableTelegram",
    "telegramBotToken",
    "telegramChatId"
  ];
  const defaultPrompt = "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  const defaultPromptLearning = "你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（與原文字同語言的相似詞/同義字、替換翻譯及關鍵字詞彙）。\n請務必只返回一個符合以下 JSON 格式的物件，不要包含任何 Markdown 標記（如 ```json）、前言、後記或解釋：\n\n{\n  \"alternatives\": [\n    {\n      \"text\": \"（另一種翻譯方式，例如更正式、更口語或不同語氣的翻譯）\",\n      \"tone\": \"（例如：正式商務、日常口語、書面文學）\",\n      \"explanation\": \"（說明這個翻譯的適用場景或細微差異）\"\n    }\n  ],\n  \"vocabulary\": [\n    {\n      \"word\": \"（從輸入文字中提取的關鍵字，原文字語言）\",\n      \"pos\": \"（詞性，例如 n. / v. / adj.）\",\n      \"translation\": \"（該關鍵詞在{target_lang}中的對應翻譯）\",\n      \"synonyms\": [\"（與原文字同語言的相似詞/同義字，並且在括號內附帶對應翻譯，例如若原文字為英文，請提供如 distraction (分心)、clutter (雜亂) 等格式的英文同義字與翻譯）\"],\n      \"when_to_use\": \"（說明此字詞的使用時機、搭配語境或使用習慣）\",\n      \"example_sentence_source\": \"（使用此關鍵字的英文/原語言例句）\",\n      \"example_sentence_target\": \"（該例句翻譯成{target_lang}的結果）\"\n    }\n  ]\n}";

  for (const k of keys) {
    if (ignoreKeys.includes(k)) continue;

    let valA = stateA[k];
    let valB = stateB[k];

    if (k === "systemPrompt" && (valB === undefined || valB === null)) valB = defaultPrompt;
    if (k === "systemPromptLearning" && (valB === undefined || valB === null)) valB = defaultPromptLearning;
    if (k === "systemPrompt" && (valA === undefined || valA === null)) valA = defaultPrompt;
    if (k === "systemPromptLearning" && (valA === undefined || valA === null)) valA = defaultPromptLearning;

    if (typeof valA === "string") valA = valA.trim();
    if (typeof valB === "string") valB = valB.trim();

    if (valA !== valB) return true;
  }
  return false;
}

function updateSettingsDraftUI() {
  const badge = document.getElementById("settings-draft-badge");
  const btnDiscard = document.getElementById("btn-discard-draft");
  const currentState = getFormSettingsState();
  const isDiff = areSettingsDifferent(currentState, lastServerSettings);

  const storage = getLocalStorageSafe();
  if (isDiff) {
    if (badge) {
      badge.textContent = "🟡 Unsaved Draft";
      badge.className = "settings-draft-badge badge-unsaved";
    }
    if (btnDiscard) {
      btnDiscard.classList.remove("hidden");
    }
  } else {
    if (badge) {
      badge.textContent = "🟢 Synced";
      badge.className = "settings-draft-badge badge-synced";
    }
    if (btnDiscard) {
      btnDiscard.classList.add("hidden");
    }
    if (storage) {
      storage.removeItem(DRAFT_STORAGE_KEY);
    }
  }
}

async function saveSettingsDraft() {
  const currentState = getFormSettingsState();
  const storage = getLocalStorageSafe();
  // Persist only when a non-credential field differs: an edit confined to the API key
  // or bot token has nothing left to store once the secrets are stripped out.
  if (areSettingsDifferent(currentState, lastServerSettings, DRAFT_SECRET_KEYS)) {
    if (storage) {
      storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(redactDraftSecrets(currentState)));
    }
  } else {
    if (storage) {
      storage.removeItem(DRAFT_STORAGE_KEY);
    }
  }
  updateSettingsDraftUI();
  await saveDraftSecrets(currentState);
}

function applyStateToForm(state) {
  if (!state) return;
  if (state.currentProvider !== undefined && selectProvider) {
    selectProvider.value = state.currentProvider;
    applyRecipeToForm(state.currentProvider);
  }
  if (state.apiEndpoint !== undefined && inputApiEndpoint) inputApiEndpoint.value = state.apiEndpoint;
  if (state.apiKey !== undefined && inputApiKey) inputApiKey.value = state.apiKey;
  if (state.model !== undefined && inputModel) inputModel.value = state.model;
  if (state.modelType !== undefined && selectModelType) selectModelType.value = state.modelType;
  
  if (state.temperature !== undefined && document.getElementById("input-temperature")) {
    document.getElementById("input-temperature").value = state.temperature;
    if (document.getElementById("val-temperature")) {
      document.getElementById("val-temperature").textContent = state.temperature;
    }
  }
  if (state.maxHistory !== undefined && document.getElementById("input-max-history")) {
    document.getElementById("input-max-history").value = state.maxHistory;
  }
  if (state.autoTranslate !== undefined && document.getElementById("check-auto-translate")) {
    document.getElementById("check-auto-translate").checked = !!state.autoTranslate;
  }
  if (state.grammarCheck !== undefined && checkGrammarCheck) {
    checkGrammarCheck.checked = !!state.grammarCheck;
  }
  if (state.richLearningMode !== undefined && checkRichLearning) {
    checkRichLearning.checked = !!state.richLearningMode;
  }
  if (state.doubleClickTranslate !== undefined && document.getElementById("check-dblclick-translate")) {
    document.getElementById("check-dblclick-translate").checked = !!state.doubleClickTranslate;
  }
  if (state.streamTranslations !== undefined && document.getElementById("check-stream-translations")) {
    document.getElementById("check-stream-translations").checked = !!state.streamTranslations;
  }
  if (state.showThinking !== undefined && document.getElementById("check-show-thinking")) {
    document.getElementById("check-show-thinking").checked = !!state.showThinking;
  }
  if (state.textSize !== undefined && document.getElementById("select-text-size")) {
    document.getElementById("select-text-size").value = state.textSize;
    updateTextSizeClass(state.textSize);
  }
  if (state.systemPrompt !== undefined && document.getElementById("input-system-prompt")) {
    document.getElementById("input-system-prompt").value = state.systemPrompt;
  }
  if (state.systemPromptLearning !== undefined && document.getElementById("input-system-prompt-learning")) {
    document.getElementById("input-system-prompt-learning").value = state.systemPromptLearning;
  }
  if (state.enableTelegram !== undefined && checkEnableTelegram) {
    checkEnableTelegram.checked = !!state.enableTelegram;
    if (typeof telegramFields !== "undefined" && telegramFields) {
      if (state.enableTelegram) telegramFields.classList.remove("hidden");
      else telegramFields.classList.add("hidden");
    }
  }
  if (state.telegramBotToken !== undefined && document.getElementById("input-telegram-token")) {
    document.getElementById("input-telegram-token").value = state.telegramBotToken;
  }
  if (state.telegramChatId !== undefined && document.getElementById("input-telegram-chatid")) {
    document.getElementById("input-telegram-chatid").value = state.telegramChatId;
  }
  checkUrlFormat();
}

function setupSettingsDraftListeners() {
  if (settingsDraftListenersInitialized) return;
  settingsDraftListenersInitialized = true;

  const fields = [
    { id: "select-provider", evts: ["change"] },
    { id: "input-api-endpoint", evts: ["input", "change"] },
    { id: "input-api-key", evts: ["input", "change"] },
    { id: "input-model", evts: ["input", "change"] },
    { id: "select-model-type", evts: ["change"] },
    { id: "input-temperature", evts: ["input", "change"] },
    { id: "input-max-history", evts: ["input", "change"] },
    { id: "select-text-size", evts: ["change"] },
    { id: "check-auto-translate", evts: ["change"] },
    { id: "check-grammar-check", evts: ["change"] },
    { id: "check-rich-learning", evts: ["change"] },
    { id: "check-dblclick-translate", evts: ["change"] },
    { id: "check-stream-translations", evts: ["change"] },
    { id: "check-show-thinking", evts: ["change"] },
    { id: "input-system-prompt", evts: ["input", "change"] },
    { id: "input-system-prompt-learning", evts: ["input", "change"] },
    { id: "check-enable-telegram", evts: ["change"] },
    { id: "input-telegram-token", evts: ["input", "change"] },
    { id: "input-telegram-chatid", evts: ["input", "change"] }
  ];

  fields.forEach(f => {
    const el = document.getElementById(f.id);
    if (el) {
      f.evts.forEach(evt => {
        el.addEventListener(evt, saveSettingsDraft);
      });
    }
  });

  const btnDiscard = document.getElementById("btn-discard-draft");
  if (btnDiscard) {
    btnDiscard.addEventListener("click", async () => {
      const storage = getLocalStorageSafe();
      if (storage) {
        storage.removeItem(DRAFT_STORAGE_KEY);
      }
      await clearDraftSecrets();
      if (lastServerSettings) {
        applyStateToForm(lastServerSettings);
      } else {
        await loadSettingsToUI();
      }
      updateSettingsDraftUI();
      if (typeof addLog === "function") {
        await addLog("info", "Discarded local draft, reverted to server configuration");
      }
    });
  }
}

async function loadSettingsToUI() {
  const res = await chrome.storage.local.get([
    "apiEndpoint",
    "apiKey",
    "model",
    "modelType",
    "currentProvider",
    "providerRecipes",
    "temperature",
    "systemPrompt",
    "systemPromptLearning",
    "maxHistory",
    "autoTranslate",
    "grammarCheck",
    "richLearningMode",
    "doubleClickTranslate",
    "streamTranslations",
    "showThinking",
    "textSize",
    "enableTelegram",
    "telegramBotToken",
    "telegramChatId"
  ]);

  if (res.providerRecipes) {
    loadedRecipes = Object.assign({}, DEFAULT_RECIPES, res.providerRecipes);
  }

  let activeProv = res.currentProvider;
  if (!activeProv) {
    const ep = (res.apiEndpoint || "").toLowerCase();
    if (res.modelType === "groq" || ep.includes("groq.com")) activeProv = "groq";
    else if (ep.includes("openai.com")) activeProv = "openai";
    else if (ep.includes("deepseek.com")) activeProv = "deepseek";
    else if (ep.includes("openrouter.ai")) activeProv = "openrouter";
    else if (ep.includes("googleapis.com")) activeProv = "gemini";
    else if (ep.includes("11434")) activeProv = "ollama";
    else if (ep.includes("1234")) activeProv = "lmstudio";
    else if (ep.includes("4090")) activeProv = "vllm";
    else activeProv = "vllm";
  }

  const defaultPrompt = "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。";
  const defaultPromptLearning = "你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（與原文字同語言的相似詞/同義字、替換翻譯及關鍵字詞彙）。\n請務必只返回一個符合以下 JSON 格式的物件，不要包含任何 Markdown 標記（如 ```json）、前言、後記或解釋：\n\n{\n  \"alternatives\": [\n    {\n      \"text\": \"（另一種翻譯方式，例如更正式、更口語或不同語氣的翻譯）\",\n      \"tone\": \"（例如：正式商務、日常口語、書面文學）\",\n      \"explanation\": \"（說明這個翻譯的適用場景或細微差異）\"\n    }\n  ],\n  \"vocabulary\": [\n    {\n      \"word\": \"（從輸入文字中提取的關鍵字，原文字語言）\",\n      \"pos\": \"（詞性，例如 n. / v. / adj.）\",\n      \"translation\": \"（該關鍵詞在{target_lang}中的對應翻譯）\",\n      \"synonyms\": [\"（與原文字同語言的相似詞/同義字，並且在括號內附帶對應翻譯，例如若原文字為英文，請提供如 distraction (分心)、clutter (雜亂) 等格式的英文同義字與翻譯）\"],\n      \"when_to_use\": \"（說明此字詞的使用時機、搭配語境或使用習慣）\",\n      \"example_sentence_source\": \"（使用此關鍵字的英文/原語言例句）\",\n      \"example_sentence_target\": \"（該例句翻譯成{target_lang}的結果）\"\n    }\n  ]\n}";

  let cleanedModel = res.model;
  if (activeProv === "gemini") {
    cleanedModel = cleanGeminiModel(res.model);
  } else if (activeProv === "groq") {
    cleanedModel = cleanGroqModel(res.model);
  }

  const currentRec = loadedRecipes[activeProv] || DEFAULT_RECIPES[activeProv] || DEFAULT_RECIPES.custom;

  lastServerSettings = {
    currentProvider: activeProv,
    apiEndpoint: res.apiEndpoint !== undefined ? res.apiEndpoint : (currentRec.endpoint || currentRec.stdUrl || ""),
    apiKey: res.apiKey !== undefined ? res.apiKey : (currentRec.apiKey || ""),
    model: cleanedModel !== undefined ? cleanedModel : (currentRec.model || ""),
    modelType: res.modelType !== undefined ? res.modelType : (currentRec.modelType || "qwen"),
    temperature: res.temperature ?? 0.1,
    maxHistory: res.maxHistory ?? 100,
    autoTranslate: res.autoTranslate !== false,
    grammarCheck: res.grammarCheck !== false,
    richLearningMode: res.richLearningMode !== false,
    doubleClickTranslate: res.doubleClickTranslate !== false,
    streamTranslations: res.streamTranslations !== false,
    showThinking: res.showThinking !== false,
    textSize: res.textSize || "medium",
    systemPrompt: res.systemPrompt ?? defaultPrompt,
    systemPromptLearning: res.systemPromptLearning ?? defaultPromptLearning,
    enableTelegram: res.enableTelegram ?? false,
    telegramBotToken: res.telegramBotToken ?? "",
    telegramChatId: res.telegramChatId ?? ""
  };

  applyStateToForm(lastServerSettings);

  renderMonthlyTokenUsageUI();

  const selectUsageMonth = document.getElementById("select-usage-month");
  if (selectUsageMonth) {
    selectUsageMonth.addEventListener("change", renderMonthlyTokenUsageUI);
  }

  renderDisabledSitesList();
  togglePromptVisibility();

  setupSettingsDraftListeners();

  const storage = getLocalStorageSafe();
  const rawDraft = storage ? storage.getItem(DRAFT_STORAGE_KEY) : null;
  if (rawDraft) {
    try {
      const draftObj = JSON.parse(rawDraft);
      if (draftObj && typeof draftObj === "object") {
        const carriesSecrets = DRAFT_SECRET_KEYS.some(key => draftObj[key] !== undefined);
        const safeDraft = redactDraftSecrets(draftObj);
        // Credentials in the draft are ignored, so the fields keep the values already
        // loaded from chrome.storage rather than being overwritten by the draft.
        applyStateToForm(safeDraft);
        // Drafts written before credentials were excluded still hold them: rewrite in place.
        if (carriesSecrets && storage) {
          storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(safeDraft));
        }
      }
    } catch (e) {
      console.warn("Failed to parse settings_draft:", e);
    }
  }

  // Must come after the draft above: restoring a draft that switched provider reapplies
  // that recipe's credentials, which would otherwise clobber the in-progress ones.
  await restoreDraftSecretsToForm();

  updateSettingsDraftUI();
}

document.getElementById("input-temperature").addEventListener("input", (e) => {
  document.getElementById("val-temperature").textContent = e.target.value;
});

btnSaveSettings.addEventListener("click", async () => {
  syncFormToCurrentRecipe();
  const currentProvider = selectProvider.value;

  const apiEndpoint = inputApiEndpoint.value.trim();
  const apiKey = inputApiKey.value.trim();
  const model = inputModel.value.trim();
  const modelType = selectModelType.value;

  const temperature = parseFloat(document.getElementById("input-temperature").value);
  const maxHistory = parseInt(document.getElementById("input-max-history").value, 10);
  const autoTranslate = document.getElementById("check-auto-translate").checked;
  const grammarCheck = checkGrammarCheck ? checkGrammarCheck.checked : true;
  const richLearningMode = checkRichLearning.checked;
  const doubleClickTranslate = document.getElementById("check-dblclick-translate").checked;
  const streamTranslations = document.getElementById("check-stream-translations").checked;
  const showThinking = document.getElementById("check-show-thinking").checked;
  const systemPrompt = document.getElementById("input-system-prompt").value.trim();
  const systemPromptLearning = document.getElementById("input-system-prompt-learning").value.trim();
  const textSize = document.getElementById("select-text-size").value;
  const enableTelegram = checkEnableTelegram.checked;
  const telegramBotToken = document.getElementById("input-telegram-token").value.trim();
  const telegramChatId = document.getElementById("input-telegram-chatid").value.trim();

  await chrome.storage.local.set({
    currentProvider,
    providerRecipes: loadedRecipes,
    apiEndpoint,
    apiKey,
    model,
    modelType,
    temperature,
    maxHistory,
    autoTranslate,
    grammarCheck,
    richLearningMode,
    doubleClickTranslate,
    streamTranslations,
    showThinking,
    systemPrompt,
    systemPromptLearning,
    textSize,
    enableTelegram,
    telegramBotToken,
    telegramChatId
  });

  lastServerSettings = {
    currentProvider,
    apiEndpoint,
    apiKey,
    model,
    modelType,
    temperature,
    maxHistory,
    autoTranslate,
    grammarCheck,
    richLearningMode,
    doubleClickTranslate,
    streamTranslations,
    showThinking,
    systemPrompt,
    systemPromptLearning,
    textSize,
    enableTelegram,
    telegramBotToken,
    telegramChatId
  };

  const storage = getLocalStorageSafe();
  if (storage) {
    storage.removeItem(DRAFT_STORAGE_KEY);
  }
  await clearDraftSecrets();

  updateSettingsDraftUI();
  updateTextSizeClass(textSize);
  await addLog("info", "Settings saved successfully");
  closeAllDrawers();
  
  if (srcTextarea.value.trim()) {
    translate();
  }
});

btnResetSettings.addEventListener("click", async () => {
  if (confirm("Reset settings to default values?")) {
    const storage = getLocalStorageSafe();
    if (storage) {
      storage.removeItem(DRAFT_STORAGE_KEY);
    }
    await clearDraftSecrets();

    const defaultState = {
      apiEndpoint: "http://192.168.3.202:4090",
      apiKey: "",
      model: "qwen",
      modelType: "qwen",
      temperature: 0.1,
      maxHistory: 100,
      autoTranslate: true,
      grammarCheck: true,
      richLearningMode: true,
      doubleClickTranslate: true,
      streamTranslations: true,
      showThinking: true,
      textSize: "medium",
      enableTelegram: false,
      telegramBotToken: "",
      telegramChatId: "",
      systemPrompt: "你是一個專業的翻譯引擎。請將使用者輸入的 any 文字精準翻譯成流暢的{target_lang}。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。",
      systemPromptLearning: "你是一個專業的語言學習助手。請針對使用者輸入的原文字以及對應的{target_lang}翻譯結果，提供相關的學習資訊（與原文字同語言的相似詞/同義字、替換翻譯及關鍵字詞彙）。\n請務必只返回一個符合以下 JSON 格式的物件，不要包含 any Markdown 標記（如 ```json）、前言、後記或解釋：\n\n{\n  \"alternatives\": [\n    {\n      \"text\": \"（另一種翻譯方式，例如更正式、更口語或不同語氣的翻譯）\",\n      \"tone\": \"（例如：正式商務、日常口語、書面文學）\",\n      \"explanation\": \"（說明這個翻譯的適用場景或細微差異）\"\n    }\n  ],\n  \"vocabulary\": [\n    {\n      \"word\": \"（從輸入文字中提取的關鍵字，原文字語言）\",\n      \"pos\": \"（詞性，例如 n. / v. / adj.）\",\n      \"translation\": \"（該關鍵詞在{target_lang}中的對應翻譯）\",\n      \"synonyms\": [\"（與原文字同語言的相似詞/同義字，並且在括號內附帶對應翻譯，例如若原文字為英文，請提供如 distraction (分心)、clutter (雜亂) 等格式的英文同義字與翻譯）\"],\n      \"when_to_use\": \"（說明此字詞的使用時機、搭配語境或使用習慣）\",\n      \"example_sentence_source\": \"（使用此關鍵字的英文/原語言例句）\",\n      \"example_sentence_target\": \"（該例句翻譯成{target_lang}的結果）\"\n    }\n  ]\n}"
    };

    await chrome.storage.local.set(defaultState);
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

// Export & Import Settings Logic
const btnExportSettings = document.getElementById("btn-export-settings");
const btnImportSettings = document.getElementById("btn-import-settings");
const inputFileImport = document.getElementById("input-file-import");
const checkExportIncludeKeys = document.getElementById("check-export-include-keys");

const EXPORTABLE_SETTING_KEYS = [
  "apiEndpoint",
  "apiKey",
  "model",
  "modelType",
  "currentProvider",
  "providerRecipes",
  "temperature",
  "systemPrompt",
  "systemPromptLearning",
  "maxHistory",
  "autoTranslate",
  "grammarCheck",
  "richLearningMode",
  "doubleClickTranslate",
  "streamTranslations",
  "showThinking",
  "textSize",
  "enableTelegram",
  "telegramBotToken",
  "telegramChatId",
  "disabledDomains"
];

async function generateExportSettingsPayload(includeKeys = false) {
  const currentSettings = await chrome.storage.local.get(EXPORTABLE_SETTING_KEYS);
  const payload = {
    appName: "Fire Translate",
    exportVersion: "1.0.2",
    exportedAt: new Date().toISOString(),
    settings: { ...currentSettings }
  };

  if (!includeKeys) {
    payload.settings.apiKey = "";
    payload.settings.telegramBotToken = "";
    payload.settings.telegramChatId = "";
    if (payload.settings.providerRecipes) {
      const sanitizedRecipes = {};
      for (const [key, recipe] of Object.entries(payload.settings.providerRecipes)) {
        sanitizedRecipes[key] = { ...recipe, apiKey: "" };
      }
      payload.settings.providerRecipes = sanitizedRecipes;
    }
  }

  return payload;
}

async function exportSettingsToFile() {
  const includeKeys = checkExportIncludeKeys ? checkExportIncludeKeys.checked : false;
  const payload = await generateExportSettingsPayload(includeKeys);
  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fire-translate-settings-${includeKeys ? "with-keys" : "safe"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  await addLog("info", `Exported settings (include keys: ${includeKeys})`);
}

function processImportSettingsJson(jsonStr) {
  const data = JSON.parse(jsonStr);
  let settingsObj = data;
  if (data && typeof data === "object" && data.settings && typeof data.settings === "object") {
    settingsObj = data.settings;
  }
  
  if (!settingsObj || typeof settingsObj !== "object" || Array.isArray(settingsObj)) {
    throw new Error("Invalid settings file format.");
  }

  const validSettingsToSave = {};
  for (const key of EXPORTABLE_SETTING_KEYS) {
    if (settingsObj[key] !== undefined) {
      validSettingsToSave[key] = settingsObj[key];
    }
  }

  if (Object.keys(validSettingsToSave).length === 0) {
    throw new Error("No valid settings found in file.");
  }

  return validSettingsToSave;
}

async function importSettingsFromFile(file) {
  try {
    const text = await file.text();
    const settingsToSave = processImportSettingsJson(text, EXPORTABLE_SETTING_KEYS);

    const changes = [];
    if (settingsToSave.apiEndpoint) changes.push(`• Server Endpoint: ${settingsToSave.apiEndpoint}`);
    if (settingsToSave.apiKey !== undefined) changes.push(`• API Key: ${settingsToSave.apiKey ? "[Updated Key]" : "[Cleared Key]"}`);
    if (settingsToSave.currentProvider) changes.push(`• AI Provider: ${settingsToSave.currentProvider}`);
    if (settingsToSave.enableTelegram !== undefined) changes.push(`• Telegram Integration: ${settingsToSave.enableTelegram ? "Enabled" : "Disabled"}`);
    if (settingsToSave.telegramBotToken !== undefined) changes.push(`• Telegram Token: ${settingsToSave.telegramBotToken ? "[Updated Token]" : "[Cleared Token]"}`);
    if (settingsToSave.providerRecipes) changes.push(`• Provider Recipes: ${Object.keys(settingsToSave.providerRecipes).length} recipes`);

    const summaryMsg = `Confirm Settings Import\n\nImporting this configuration file will update the following settings:\n\n${changes.join("\n")}\n\nDo you want to proceed and overwrite your current settings?`;

    if (!confirm(summaryMsg)) {
      await addLog("info", "Settings import cancelled by user.");
      return;
    }

    await chrome.storage.local.set(settingsToSave);
    await loadSettingsToUI();
    await addLog("info", `Imported ${Object.keys(settingsToSave).length} settings successfully.`);
    alert("Settings imported successfully!");
  } catch (err) {
    await addLog("error", `Import settings failed: ${err.message}`);
    alert(`Failed to import settings:\n${err.message}`);
  }
}

if (btnExportSettings) btnExportSettings.addEventListener("click", exportSettingsToFile);
if (btnImportSettings && inputFileImport) {
  btnImportSettings.addEventListener("click", () => inputFileImport.click());
  inputFileImport.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      importSettingsFromFile(e.target.files[0]);
      inputFileImport.value = "";
    }
  });
}

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
  
  const config = await chrome.storage.local.get("showThinking");
  const showThinking = config.showThinking !== false;

  let parsedSuccessfully = false;
  try {
    const cleanedText = item.targetText.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanedText);
    if (parsedData && parsedData.translation) {
      await renderRichTranslation(parsedData);
      
      let currentTrans = parsedData.translation;
      if (currentTrans.includes("<think>")) {
        const parsed = splitThinkingText(currentTrans);
        currentTrans = parsed.translation;
      }
      currentTranslationText = currentTrans;
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
          await renderRichTranslation(parsedData);
          
          let currentTrans = parsedData.translation;
          if (currentTrans.includes("<think>")) {
            const parsed = splitThinkingText(currentTrans);
            currentTrans = parsed.translation;
          }
          currentTranslationText = currentTrans;
          parsedSuccessfully = true;
        }
      } catch (e2) {
        // Ignored
      }
    }
  }

  if (!parsedSuccessfully) {
    let finalThinking = "";
    let finalTranslation = item.targetText;
    if (item.targetText.includes("<think>")) {
      const parsed = splitThinkingText(item.targetText);
      finalThinking = parsed.thinking;
      finalTranslation = parsed.translation;
    }
    
    if (showThinking && finalThinking) {
      renderThinkingAndTranslation(finalTranslation.trim(), finalThinking.trim());
    } else {
      targetContent.textContent = finalTranslation.trim();
      targetContent.classList.remove("empty");
    }
    currentTranslationText = finalTranslation.trim();
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
  const index = history.findIndex(item => item.id === id);
  if (index !== -1) {
    history.splice(index, 1);
  }
  await chrome.storage.local.set({ history });
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
  hideGrammarSuggestion();
  if (grammarAbortController) grammarAbortController.abort();
  srcTextarea.focus();
});

document.getElementById("btn-paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    srcTextarea.value = text;
    charCounter.textContent = `${text.length} characters`;
    srcTextarea.focus();
    
    // Check grammar on paste
    if (text.trim()) {
      checkGrammarAndTypo(text);
    }
    
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

// Keypress translate / typing auto-translate & live grammar check
srcTextarea.addEventListener("input", () => {
  const text = srcTextarea.value;
  charCounter.textContent = `${text.length} characters`;
  
  if (text.trim() === "") {
    targetContent.textContent = "";
    targetContent.classList.add("empty");
    btnCopy.disabled = true;
    btnTts.disabled = true;
    hideGrammarSuggestion();
    if (grammarAbortController) grammarAbortController.abort();
    return;
  }

  // Live grammar / typo check after 750ms debounce (500ms~1s)
  clearTimeout(grammarDebounceTimer);
  grammarDebounceTimer = setTimeout(() => {
    checkGrammarAndTypo(srcTextarea.value);
  }, 750);
  
  chrome.storage.local.get("autoTranslate", (result) => {
    if (result.autoTranslate !== false) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        translate();
      }, 800);
    }
  });
});

// Grammar suggestion UI actions
if (btnGrammarApply) {
  btnGrammarApply.addEventListener("click", applyGrammarSuggestion);
}
if (grammarSuggestionText) {
  grammarSuggestionText.addEventListener("click", applyGrammarSuggestion);
}
if (btnGrammarDismiss) {
  btnGrammarDismiss.addEventListener("click", () => {
    hideGrammarSuggestion();
  });
}

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
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>'"]/g, 
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

// Listen to background updates and contextMenu events in real-time
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === "translateText" && message.text) {
    srcTextarea.value = message.text;
    charCounter.textContent = `${message.text.length} characters`;
    translate();
  } else if (message.action === "phase2Completed") {
    const currentSrc = srcTextarea.value.trim();
    if (message.srcText === currentSrc) {
      const loader = document.getElementById("learning-loader");
      if (loader) loader.remove();
      await renderRichTranslation(message.parsed);
      
      let currentTrans = message.parsed.translation || "";
      if (currentTrans.includes("<think>")) {
        const parsed = splitThinkingText(currentTrans);
        currentTrans = parsed.translation;
      }
      currentTranslationText = currentTrans;
    }
  }
});

// Run app init
initApp();
