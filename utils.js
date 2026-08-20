function getGemmaLangCode(lang) {
  if (!lang) return "en";
  if (lang === "auto") return "en";
  if (lang === "zh-TW" || lang === "繁體中文" || lang === "zh-Hant") return "zh_Hant";
  if (lang === "zh-CN" || lang === "簡體中文" || lang === "zh-Hans") return "zh_Hans";
  return lang;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getGemmaLangCode };
}
