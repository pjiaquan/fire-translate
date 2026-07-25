# 🔒 Privacy Policy for Fire Translate Extension

**Last Updated:** July 25, 2026

Fire Translate ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how Fire Translate handles user data, local storage, and third-party AI service interactions.

---

### 1. Information Collection and Use

Fire Translate operates with a **privacy-first architecture**:
- **No Personal Data Collection**: We do not collect, track, store, or sell personal information such as your name, email address, IP address, browsing history, or location.
- **No Tracking or Analytics**: We do not include third-party tracking scripts, advertising trackers, or telemetry analytics in the extension.

---

### 2. Local Device Storage (`chrome.storage.local`)

All user preferences and operational data are saved **strictly locally on your device** using the browser's `chrome.storage.local` API. This data includes:
- **API Keys & Authentication Tokens**: User-entered API keys (e.g. Groq, OpenAI, DeepSeek) and Google OAuth tokens.
- **Provider Recipes & Settings**: Chosen AI model names, custom endpoint URLs, temperature parameters, and custom system prompts.
- **Preferences**: Target language selections, dark/light theme options, and text font size choices.
- **Website Exclusion List**: Domain names added to your website exclusion list.
- **Translation Cache**: Temporary cached translation responses saved locally to eliminate redundant network requests.

**None of your stored settings or API keys are ever transmitted to us or any central server managed by Fire Translate.**

---

### 3. Text Translation & Third-Party AI Services

When you select text on a webpage or type text into the Fire Translate popup/sidepanel:
- The selected text is sent directly via HTTPS fetch requests to the **AI translation service provider selected by you** (e.g., OpenAI API, Groq API, DeepSeek API, Google Gemini API, or your local LLM server at `http://localhost:8000`).
- The text is transmitted **solely for the purpose of generating real-time translations and vocabulary learning insights**.
- Requests are handled under the respective privacy policies of your chosen AI service providers:
  - [OpenAI Privacy Policy](https://openai.com/privacy/)
  - [Groq Privacy Policy](https://groq.com/privacy-policy/)
  - [DeepSeek Privacy Policy](https://www.deepseek.com/)
  - [Google Privacy Policy](https://policies.google.com/privacy)

---

### 4. Credential Security & Masking

Fire Translate includes built-in security features to safeguard your API credentials:
- **Automatic Log Scrubbing**: All internal debugging logs automatically mask sensitive key formats (such as `gsk_...`, `sk-proj-...`, `AIza...`, and OAuth tokens) before rendering.
- **Input Masking**: API keys are rendered inside password-type input fields in the user interface.

---

### 5. Data Retention and Control

You maintain full control over your data:
- You can clear your cached translations, reset provider recipes, or remove website exclusions at any time via the extension's Settings drawer.
- Uninstalling the Fire Translate extension immediately and permanently removes all locally stored configuration data and cached translations from your browser.

---

### 6. Updates to This Privacy Policy

We may update this Privacy Policy periodically to reflect new features or regulatory requirements. Any updates will be posted in this repository and included in future extension releases.

---

### 7. Contact Us

If you have any questions or privacy concerns regarding Fire Translate, please open an issue on our GitHub repository:
- **GitHub Repository**: [https://github.com/pjiaquan/fire-translate](https://github.com/pjiaquan/fire-translate)
