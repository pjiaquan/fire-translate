# 🔒 Privacy Policy for Fire Translate Extension

**Last Updated:** August 10, 2026

Fire Translate ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how Fire Translate handles user data, local storage, third-party AI service interactions, and optional messaging services.

---

### 1. Information Collection and Use

Fire Translate operates with a **privacy-first architecture**:
- **No Personal Data Collection**: We do not collect, track, store, or sell personal information such as your name, email address, IP address, browsing history, or location.
- **No Tracking or Analytics**: We do not include third-party tracking scripts, advertising trackers, analytics, or remote CDN dependencies in the extension UI. All fonts and assets are packaged locally within the extension.

---

### 2. Local Device Storage (`chrome.storage.local` & `localStorage`)

All user preferences, operational data, and active drafts are saved **strictly locally on your device** using browser storage APIs (`chrome.storage.local` and `localStorage`). This data includes:
- **API Keys & Credentials**: Saved API keys (e.g. Groq, OpenAI, DeepSeek, Google Gemini) and optional Telegram Bot tokens are held in `chrome.storage.local`.
- **Provider Recipes & Settings**: Chosen AI model names, endpoint URLs, temperature parameters, and custom system prompts.
- **Auto-Draft System**: Work-in-progress form entries are saved locally so they are not lost if the popup closes. Credentials are deliberately **excluded** from this on-disk draft: an unsaved API key or Bot token is instead held in `chrome.storage.session`, which is kept in memory only, is never written to disk, and is discarded when the browser closes.
- **Preferences**: Target language selections, dark/light theme options, and text font size choices.
- **Website Exclusion List**: Domain names added to your website exclusion list.
- **Translation Cache**: Temporary cached translation responses saved locally to eliminate redundant network requests.

**None of your stored settings or credentials are ever transmitted to us or any central server managed by Fire Translate.**

---

### 3. Text Translation, Endpoint Network Traffic & Telegram Integration

When you select text on a webpage or type text into the Fire Translate popup/sidepanel:
- **Selected AI Endpoint**: The text is sent directly to the **AI translation service endpoint configured by you** (e.g., OpenAI API, Groq API, DeepSeek API, Google Gemini API, or your local LLM gateway at `http://localhost:11434` / `http://192.168.3.202:4090`).
- **Network Protocol Notice**: Secure HTTPS endpoints (`https://`) encrypt all transmitted text and API credentials in transit. If you configure a custom endpoint using unencrypted HTTP (`http://`), transmission travels in cleartext over your local or target network.
- **Optional Telegram Forwarding**: If you explicitly enable the optional Telegram integration in Settings, your translation source text and generated translation results will be sent to your configured Telegram Bot/Chat via `https://api.telegram.org`. This feature is disabled by default and runs strictly on user opt-in.
- **Third-Party AI Service Privacy Policies**:
  - [OpenAI Privacy Policy](https://openai.com/privacy/)
  - [Groq Privacy Policy](https://groq.com/privacy-policy/)
  - [DeepSeek Privacy Policy](https://www.deepseek.com/)
  - [Google Privacy Policy](https://policies.google.com/privacy)
  - [Telegram Privacy Policy](https://telegram.org/privacy)

---

### 4. Credential Security & Masking

Fire Translate includes built-in security features to safeguard your API credentials:
- **Automatic Log Scrubbing**: All internal debugging logs automatically mask sensitive key formats (such as `gsk_...`, `sk-proj-...`, `AIza...`, and Telegram bot tokens) before rendering.
- **Input Masking**: API keys are rendered inside password-type input fields in the user interface.
- **Settings Import Confirmation**: Importing settings requires explicit confirmation of sensitive endpoint and credential changes before applying updates.

---

### 5. Data Retention and Control

You maintain full control over your data:
- You can clear your cached translations, discard settings drafts, reset provider recipes, or remove website exclusions at any time via the extension's Settings drawer.
- Uninstalling the Fire Translate extension immediately and permanently removes all locally stored configuration data, settings drafts, and cached translations from your browser.

---

### 6. Updates to This Privacy Policy

We may update this Privacy Policy periodically to reflect new features or regulatory requirements. Any updates will be posted in this repository and included in future extension releases.

---

### 7. Contact Us

If you have any questions or privacy concerns regarding Fire Translate, please open an issue on our GitHub repository:
- **GitHub Repository**: [https://github.com/pjiaquan/fire-translate](https://github.com/pjiaquan/fire-translate)
