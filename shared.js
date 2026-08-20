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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getGemmaLangCode,
    cleanTranslateText,
    isUrlLike,
    isApiKeyLike
  };
}
