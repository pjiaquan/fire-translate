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
    isDomainDisabled
  };
}
