const DEFAULT_PROVIDER = "gemini";
const DEFAULT_API_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai";
const DEFAULT_MODEL = "gemini-3.6-flash";

// Construct UI with DOM APIs. Strings (including model output) are always text,
// never parsed as markup. SVG uses its own namespace to preserve existing icons.
function domElement(tag, attributes = {}, ...children) {
  const svgTags = new Set(["svg", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse", "g"]);
  const element = svgTags.has(tag)
    ? document.createElementNS("http://www.w3.org/2000/svg", tag)
    : document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  appendDomChildren(element, children);
  return element;
}

function appendDomChildren(element, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined) continue;
    element.appendChild(typeof child === "object" && child.nodeType
      ? child : document.createTextNode(String(child)));
  }
}

function setDomContent(element, ...children) {
  element.replaceChildren();
  appendDomChildren(element, children);
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
  text = text.substring(0, 5000);
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
  if (/^gsk_[a-zA-Z0-9_-]{15,}/.test(trimmed)) return true;
  if (/^sk-(proj-|or-|ant-)?[a-zA-Z0-9_-]{15,}/.test(trimmed)) return true;
  if (/^AIza[0-9A-Za-z_-]{25,}/.test(trimmed)) return true;
  if (/^ya29\.[0-9A-Za-z_-]{25,}/.test(trimmed)) return true;
  if (/^hf_[a-zA-Z0-9]{15,}/.test(trimmed)) return true;
  if (/^\d{8,10}:[a-zA-Z0-9_-]{30,}/.test(trimmed)) return true;
  if (/^(ghp_|github_pat_)[a-zA-Z0-9_-]{15,}/.test(trimmed)) return true;
  if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed) && /[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) return true;
  return false;
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

function formatChatEndpointUrl(apiEndpoint) {
  if (!apiEndpoint) return `${DEFAULT_API_ENDPOINT}/v1/chat/completions`;
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
  if (!apiEndpoint) return `${DEFAULT_API_ENDPOINT}/v1/models`;
  let clean = apiEndpoint.trim().replace(/\/$/, "");
  if (clean.includes("googleapis.com") && !clean.includes("/openai")) {
    clean = `${clean}/openai`;
  }
  if (clean.endsWith("/models")) {
    return clean;
  }
  if (clean.endsWith("/chat/completions")) {
    return clean.replace(/\/chat\/completions$/, "/models");
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/models`;
  }
  return `${clean}/v1/models`;
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

// Translation history doubles as the review library. The popup and the
// background worker both write to it, so both go through these helpers.
const DEFAULT_MAX_HISTORY = 1000;
const MAX_HISTORY_LIMIT = 5000;
const MIN_HISTORY_LIMIT = 5;
// Days until the next review once a sentence reaches each level (1-5).
const REVIEW_INTERVAL_DAYS = [1, 3, 7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeMaxHistory(value) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return DEFAULT_MAX_HISTORY;
  return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, parsed));
}

// Raw stored translation: plain text, or the JSON of a rich (learning mode) result.
// Items written by older background code used `translatedText` instead of `targetText`.
function getHistoryTargetText(item) {
  if (!item) return "";
  const text = item.targetText ?? item.translatedText;
  return typeof text === "string" ? text : "";
}

// Translation as the reader should see it: no JSON wrapper, no <think> block.
function getHistoryTranslationText(item) {
  let text = getHistoryTargetText(item).trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(text.substring(jsonStart, jsonEnd + 1));
      if (parsed && typeof parsed.translation === "string") text = parsed.translation;
    } catch (e) {}
  }
  const thinkEnd = text.indexOf("</think>");
  if (text.includes("<think>")) text = thinkEnd === -1 ? "" : text.substring(thinkEnd + 8);
  return text.trim();
}

// Adds a lookup to the front of the history. Looking a sentence up again moves
// its existing entry to the front instead of duplicating it; needing to look it
// up again also means it was not remembered, so it is due for review again.
// Repeating the most recent lookup (pressing Translate twice) changes nothing
// and returns the same array, so callers can skip the storage write.
function addToHistory(history, entry, maxHistory, now = Date.now()) {
  const list = Array.isArray(history) ? history.slice() : [];
  const srcKey = (entry.srcText || "").trim();
  const existingIdx = list.findIndex(item =>
    item && (item.srcText || "").trim() === srcKey && item.targetLang === entry.targetLang);
  if (existingIdx === 0) return history;
  const existing = existingIdx !== -1 ? list.splice(existingIdx, 1)[0] : null;

  const item = {
    id: existing?.id || String(now),
    timestamp: new Date(now).toISOString(),
    srcText: entry.srcText,
    targetText: entry.targetText,
    srcLang: entry.srcLang,
    targetLang: entry.targetLang,
    lookupCount: (existing?.lookupCount || 1) + (existing ? 1 : 0)
  };
  if (existing?.reviewCount) {
    item.reviewCount = existing.reviewCount;
    item.reviewLevel = 0;
    item.lastReviewed = existing.lastReviewed;
  }

  list.unshift(item);
  return list.slice(0, normalizeMaxHistory(maxHistory));
}

function isReviewDue(item, now = Date.now()) {
  if (!item.nextReview) return true;
  const due = new Date(item.nextReview).getTime();
  return isNaN(due) || due <= now;
}

// Sentences that were forgotten come first, then the ones waiting the longest.
function getDueReviewItems(history, now = Date.now()) {
  const waitingSince = item => new Date(item.nextReview || item.timestamp).getTime() || 0;
  return (Array.isArray(history) ? history : [])
    .filter(item => item && item.srcText && isReviewDue(item, now))
    .sort((a, b) => (a.reviewLevel || 0) - (b.reviewLevel || 0) || waitingSince(a) - waitingSince(b));
}

function getNextReviewTime(history, now = Date.now()) {
  let next = null;
  for (const item of Array.isArray(history) ? history : []) {
    if (!item || isReviewDue(item, now)) continue;
    const due = new Date(item.nextReview).getTime();
    if (next === null || due < next) next = due;
  }
  return next;
}

// Leitner boxes: remembering moves a sentence up one level and spaces the next
// review further out; forgetting drops it back to level 0, due right away.
function gradeReviewItem(item, remembered, now = Date.now()) {
  const level = remembered ? Math.min((item.reviewLevel || 0) + 1, REVIEW_INTERVAL_DAYS.length) : 0;
  const waitMs = level === 0 ? 0 : REVIEW_INTERVAL_DAYS[level - 1] * DAY_MS;
  return {
    ...item,
    reviewLevel: level,
    reviewCount: (item.reviewCount || 0) + 1,
    lastReviewed: new Date(now).toISOString(),
    nextReview: new Date(now + waitMs).toISOString()
  };
}

function filterHistory(history, query) {
  const list = Array.isArray(history) ? history : [];
  const needle = (query || "").toLowerCase().trim();
  if (!needle) return list;
  return list.filter(item => item && (
    (item.srcText || "").toLowerCase().includes(needle) ||
    getHistoryTranslationText(item).toLowerCase().includes(needle)
  ));
}

function escapeCsvCell(value) {
  let text = String(value ?? "");
  // Spreadsheet apps run cells that start with these characters as formulas.
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function historyToCsv(history) {
  const rows = [["查詢時間", "原文語言", "譯文語言", "原文", "譯文", "熟練度", "複習次數", "查詢次數"]];
  for (const item of Array.isArray(history) ? history : []) {
    if (!item) continue;
    rows.push([
      item.timestamp || "", item.srcLang || "", item.targetLang || "",
      item.srcText || "", getHistoryTranslationText(item),
      item.reviewLevel || 0, item.reviewCount || 0, item.lookupCount || 1
    ]);
  }
  // The BOM lets Excel detect UTF-8 so Chinese text is not garbled.
  return "\uFEFF" + rows.map(row => row.map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getGemmaLangCode,
    cleanTranslateText,
    isUrlLike,
    isApiKeyLike,
    getBilingualLangName,
    formatChatEndpointUrl,
    formatModelsEndpointUrl,
    escapeHTML,
    getBaseDomain,
    isDomainDisabled,
    normalizeMaxHistory,
    getHistoryTargetText,
    getHistoryTranslationText,
    addToHistory,
    getDueReviewItems,
    getNextReviewTime,
    gradeReviewItem,
    filterHistory,
    historyToCsv
  };
}
