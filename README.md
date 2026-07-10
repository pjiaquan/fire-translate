# Fire Translate 🌐🔥

A sleek, modern Chrome extension for instant, local-LLM-powered translations. Inspired by Gikken Mate, it features a responsive split-pane UI, robust API customizations, real-time debugging logs, and full-featured translation history.

## 🚀 Key Features

* **Sleek Split-Pane Layout**: Source text on the left, instant translation on the right (collapses to stacked layout in the Chrome Side Panel).
* **Local LLM Integration**: Connects to any OpenAI-compatible Chat Completion API (e.g. Ollama, LM Studio, vLLM, Llama.cpp, or custom local gateways).
* **Highly Customizable Settings**:
  * API Endpoint URL (default: `http://192.168.3.202:4090`)
  * Target Model Name (default: `qwen`)
  * Temperature Control slider (default: `0.1` for precise translation)
  * Dynamic System Prompt Template (with `{target_lang}` substitution)
* **Streaming Outputs**: Streams translation results in real-time (word-by-word) for both the popup/side-panel workspace and the webpage double-click translation bubble (features a user toggle in Settings).
* **Smart Auto-Translate**: Translates automatically as you type (with an optimized 800ms debounce), or manually by pressing the Translate button.
* **Persistent Translation Cache**: Caches translation outputs for up to 7 days in `chrome.storage.local`. Instant subsequent loads prevent duplicate API requests (supports a "Clear Cache" button inside Settings).
* **Seamless Language Swap**: Swaps the selected source and target languages. If you already have a translation result, it intelligently swaps the content of both text areas and re-translates.
* **Rich Utility Buttons**:
  * **Paste & Clear**: Quick click inputs.
  * **Clipboard Copy**: One-click translation copy with visual checkmark success feedback.
  * **Text-to-Speech (TTS)**: Built-in SpeechSynthesis lets you read translations aloud.
* **Translation History Panel**:
  * Saves past translations with language labels and relative timestamps (e.g. "5m ago").
  * Click any history item to restore its text and settings.
  * Delete individual history records or clear the entire history.
  * Customizable maximum history limit.
* **Developer Log Console**:
  * Displays real-time API requests and response structures.
  * Expandable JSON nodes help troubleshoot local LLM configurations.
* **Dual Themes**: Switch between dark (deep blue/gray) and light theme options.
* **Chrome Side Panel Support**: Run it docked to the side of your browser for continuous translation as you browse.
* **Context Menu Translation**: Highlight text on any page, right-click, and choose **Translate with Fire Translate** to send text directly to the extension.
* **Double-click Webpage Translate**: Double-click any text on a webpage to display a floating translation bubble instantly (features a user toggle in Settings to turn on/off).

---

## 🛠️ Installation Guide

Follow these steps to load the extension into Google Chrome:

1. **Download/Clone** this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. In the top-right corner, toggle the **Developer mode** switch on.
4. In the top-left corner, click **Load unpacked**.
5. Select the `fire-translate` directory (the folder containing `manifest.json`).
6. The extension is now loaded! Pin the **Fire Translate** icon to your toolbar for easy access.

---

## ⚙️ Backend API Setup

The extension is pre-configured to communicate with an OpenAI-compatible server at `http://192.168.3.202:4090`. 

If you are running your own local LLM engine, open the **Settings** drawer (cog icon) in the extension header and configure:
* **Server API Endpoint**: e.g. `http://localhost:11434` (Ollama), `http://localhost:1234` (LM Studio), or your specific network IP.
* **Model Name**: The exact name of the loaded model (e.g. `qwen`, `llama3`, `mistral`).
* **System Prompt Template**: You can customize how the LLM translates. The `{target_lang}` placeholder will automatically update based on your target language selection.

### Payload Structure Example
The extension posts requests to `${API_ENDPOINT}/v1/chat/completions` with the following body:
```json
{
  "model": "qwen",
  "messages": [
    {
      "role": "system",
      "content": "你是一個專業的翻譯引擎。請將使用者輸入的任何文字精準翻譯成流暢的繁體中文。請直接輸出翻譯後的結果，不要包含任何解釋、引號、前言或問候語。"
    },
    {
      "role": "user",
      "content": "The backend integration for the automated system was completed successfully."
    }
  ],
  "temperature": 0.1
}
```

---

## ⌨️ Shortcuts & UX

* **Ctrl + Enter** / **Cmd + Enter** (Mac): Press within the source text input area to trigger a translation instantly.
* **Escape**: Closes any active drawer panel (Settings, History, or Logs).
* **Right Click Extension Icon**: Select **Open Side Panel** to dock the translator to the side.

---

## 🧪 Testing the Extension

We have set up an isolated, zero-dependency unit test suite using Node's native `vm` module to mock the Chrome extension storage and browser DOM to execute scripts.

To run the unit tests, use:
```bash
npm test
```

This runs tests verifying:
* Caching utility saves and loads correctly.
* Cache LRU eviction limits storage to 500 items.
* System prompt substitutions for target languages.
* Fallback JSON regex string parsing.
* Content script loading and event registrations.
* Service worker loading and background listeners.

---

## 📂 File Structure

* `manifest.json`: Configuration for permissions, action popup, background service, and host permissions.
* `background.js`: Handles service-worker installation, default configurations, and context menu events.
* `popup.html`: The HTML layout featuring the split grid and sliding panel drawers.
* `popup.css`: The styling system containing dark/light variables, fluid layout wrappers, responsive styles, loading spinners, and log consoles.
* `popup.js`: Controller script coordinating translation HTTP requests, history managers, debug logging, audio synthesis, and event hooks.
* `tests.js`: Custom unit test runner mocking browser contexts to run isolated scripts.
* `package.json`: NPM package metadata and test scripts.
* `icons/`: Holds `icon16.png`, `icon48.png`, and `icon128.png` assets.
