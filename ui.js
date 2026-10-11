// Localize interface copy only; never alter user text, model IDs or API data.
const interfaceCopy = {
  "Open in Side Panel": "在側欄開啟", "Translation History": "翻譯紀錄",
  "System Logs": "診斷日誌", "Settings": "設定",
  "Toggle Light/Dark Mode": "切換亮色／深色", "Source Language": "原文語言",
  "Target Language": "譯文語言", "Paste Clipboard": "貼上",
  "Clear text": "清除原文", "Source text to translate": "要翻譯的原文",
  "Type or paste text to translate...": "輸入或貼上要翻譯的文字…",
  "Did you mean:": "建議修正：", "Apply": "套用", "Apply correction": "套用修正",
  "Dismiss suggestion": "略過建議", "Click to apply correction": "點選套用修正",
  "0 characters": "0 字", "Translate": "翻譯",
  "Translate (Ctrl/Cmd + Enter)": "翻譯（Ctrl／Cmd + Enter）",
  "Swap languages": "交換語言", "Read Aloud": "朗讀", "Copy Translation": "複製譯文",
  "Translating via LLM...": "翻譯中…", "Translation will appear here...": "譯文會顯示在這裡…",
  "Ready": "準備就緒", "Close Settings": "關閉設定",
  "Auto Detect (自動偵測)": "自動偵測", "English (英文)": "英文",
  "Traditional Chinese (繁體中文)": "繁體中文", "Simplified Chinese (簡體中文)": "簡體中文",
  "Japanese (日本語)": "日文", "Korean (韓語)": "韓文", "Spanish (西班牙語)": "西班牙文",
  "French (法語)": "法文", "German (德語)": "德文", "Russian (俄語)": "俄文",
  "Portuguese (葡萄牙語)": "葡萄牙文", "Italian (義大利語)": "義大利文",
  "⚡ Groq Cloud (Ultra Fast)": "Groq", "🤖 OpenAI (GPT-4o / o3-mini)": "OpenAI",
  "🔮 DeepSeek API (Chat & Reasoner)": "DeepSeek", "🌐 OpenRouter (Multi-LLM Gateway)": "OpenRouter",
  "✨ Google Gemini (OpenAI Endpoint)": "Google Gemini", "🦙 Ollama (Local LLM)": "Ollama（本機）",
  "💻 LM Studio (Local Endpoint)": "LM Studio（本機）",
  "🖥️ Local Gateway / vLLM / Qwen Server": "自架服務／vLLM／Qwen",
  "🛠️ Custom Recipe...": "自訂服務…", "Temperature:": "翻譯變化程度：",
  "AI Provider Preset": "翻譯服務商", "Cloud Providers": "雲端服務",
  "Local Servers": "本機服務", "Custom & Saved Recipes": "自訂服務",
  "Server API Endpoint": "API 連線網址", "Auto Fix URL": "使用建議網址",
  "OpenAI-compatible Chat Completion endpoint.": "支援 OpenAI 相容格式的 API 網址。本機服務請填入伺服器位址。",
  "API Key": "API 金鑰", "Show": "顯示", "Hide": "隱藏",
  "Show API Key": "顯示 API 金鑰", "Hide API Key": "隱藏 API 金鑰",
  "Enter API Key (sk-...)": "貼上服務商提供的 API 金鑰",
  "Required for cloud providers, optional for local endpoints.": "雲端服務需要金鑰；本機服務通常不需要。",
  "Test Connection": "測試連線", "Fetch Models": "取得模型清單",
  "Fetch active & latest models from provider": "向服務商取得可用模型",
  "Testing...": "測試中…", "Dismiss diagnostic info": "關閉測試結果",
  "Active Model": "翻譯模型", "Type model ID or click chip to select.": "使用預設模型即可，也可取得清單後選擇或輸入模型名稱。",
  "Model Format / Prompt Mode": "模型請求格式（進階）", "Model Format": "模型請求格式",
  "Monthly Token Spending": "每月 Token 用量", "Total Spent": "總用量",
  "Prompt": "輸入", "Completion": "輸出", "Max History Items": "紀錄保留筆數",
  "Text Font Size": "文字大小",
  "Small": "小", "Medium": "中", "Large": "大",
  "Translate automatically while typing": "輸入後自動翻譯",
  "Enable Rich Learning Mode (Vocab & Alternatives)": "顯示學習內容（詞彙與其他譯法）",
  "Double-click on webpage text to translate": "雙擊網頁文字時顯示翻譯浮窗",
  "Enable streaming results (word-by-word)": "逐步顯示譯文",
  "Show Thinking Process (Reasoning/Thinking models)": "顯示模型思考內容（支援的模型適用）",
  "Check grammar & typos while typing (Live Suggestion)": "輸入時檢查文法與錯字（會額外呼叫 AI）",
  "Website Exclusions": "不啟用浮窗的網站", "Toggle Current Site": "切換此網站的浮窗功能",
  "Excluded websites bypass double-click & selection translations. Right-click toolbar icon or webpage anytime to toggle translation for any site.": "這些網站不會自動顯示翻譯浮窗。也可在網頁或擴充功能圖示上按右鍵，切換此網站的設定。",
  "View Exclusions": "管理網站清單", "0 websites excluded": "尚未停用任何網站",
  "Phase 1: Translation System Prompt": "翻譯提示詞（進階）",
  "Phase 2: Learning System Prompt": "學習提示詞（進階）",
  "Enter simple translation prompt...": "輸入翻譯提示詞…",
  "Enter learning translation prompt...": "輸入學習提示詞…",
  "Backup & Transfer Settings": "備份與移轉設定",
  "Export your configurations to a JSON file or import settings from another device.": "將設定備份成 JSON 檔案，或從其他裝置匯入設定。",
  "Include API Keys & Tokens in export": "備份包含 API 金鑰與 Token（請妥善保管檔案）",
  "Export Settings": "匯出設定", "Import Settings": "匯入設定",
  "Send translations to Telegram (Optional)": "將翻譯傳送到 Telegram",
  "Telegram Bot Token": "Telegram 機器人 Token", "Telegram Chat ID / Group ID": "Telegram 對話／群組 ID",
  "Clear Cache": "清除快取", "Reset Defaults": "還原預設", "Discard Draft": "放棄變更",
  "Save Configs": "儲存設定", "Clear All": "清除全部", "Close History": "關閉紀錄",
  "No translation history yet.": "還沒有翻譯紀錄。完成翻譯後會顯示在這裡。",
  "System Debug Logs": "診斷日誌", "Clear Logs": "清除日誌", "Close Logs": "關閉日誌",
  "Log is empty.": "目前沒有日誌。", "Close Exclusions": "關閉網站清單",
  "Add domain (e.g. github.com)": "輸入網域，例如 github.com",
  "Add excluded domain": "新增停用浮窗的網域", "+ Add": "+ 新增",
  "Search excluded domains...": "搜尋網域…", "Search excluded domains": "搜尋停用浮窗的網域",
  "🔍 Search excluded domains...": "搜尋網域…",
  "No websites excluded (translating everywhere).": "尚未停用任何網站的翻譯浮窗。"
};

function localizeInterface(root) {
  for (const node of root.childNodes) {
    if (node.nodeType === 3) {
      const original = node.textContent.trim();
      const prefix = original.match(/^[💾📥📤📋📊🌐↩🔍]\s*/u)?.[0] || "";
      const translated = interfaceCopy[original] || interfaceCopy[original.slice(prefix.length)];
      if (translated) node.textContent = node.textContent.replace(original, translated);
    } else if (node.nodeType === 1 && !["SCRIPT", "STYLE", "TEXTAREA"].includes(node.tagName) && !node.classList.contains("logo-area")) {
      for (const name of ["title", "aria-label", "placeholder", "label"]) {
        const value = node.getAttribute(name);
        if (interfaceCopy[value]) node.setAttribute(name, interfaceCopy[value]);
      }
      localizeInterface(node);
    } else if (node.nodeType === 1 && node.tagName === "TEXTAREA") {
      for (const name of ["placeholder", "aria-label"]) {
        const value = node.getAttribute(name);
        if (interfaceCopy[value]) node.setAttribute(name, interfaceCopy[value]);
      }
    }
  }
}
localizeInterface(document.body);
// Keep occasional actions available in settings without crowding the translator.
const appearanceActions = document.getElementById("appearance-actions");
for (const [id, label] of [["btn-theme", "切換主題"], ["btn-logs", "診斷日誌"]]) {
  const button = document.getElementById(id);
  const text = document.createElement("span");
  text.textContent = label;
  button.appendChild(text);
  appearanceActions.appendChild(button);
}
document.querySelector(".action-divider").classList.add("hidden");
