# AMO submission text — Fire Translate 1.2.7

Upload `fire-translate-firefox-v1.2.7.zip` from the release assets. The GitHub source archive and Chrome package are different files.

## Version notes

Replaced HTML string rendering with DOM elements and text nodes throughout the translator, webpage bubbles, vocabulary and alternative translations, translation history, diagnostic logs, provider/model lists, connection diagnostics, and utility icons. AI responses, webpage text, imported/stored settings, and error messages are rendered as text rather than parsed as HTML. SVG icons, bullet formatting, streaming output, copy/read-aloud controls, and keyboard accessibility are preserved.

Added regression coverage for HTML/script payloads in translations, vocabulary, history, logs, model names, and webpage bubbles. CI rejects unsafe HTML assignment warnings in packaged Firefox and fallback manifests. Includes the Firefox background scripts fallback and declared data transmission permissions introduced in previous fixes. Requires Firefox Desktop 140+ or Firefox for Android 142+.

## Notes to Reviewer

Fire Translate supports user-configured cloud APIs and local OpenAI-compatible model servers. There is no Fire Translate account or login. Core translation, learning, grammar checking, and webpage translation can be tested with a local model without any website username, password, or cloud API key.

Local test path:

1. Start Ollama with an available text/chat model, for example `qwen2.5:7b`. If needed, install/download it with `ollama pull qwen2.5:7b` (this is a multi-gigabyte model download), then start the Ollama server with `ollama serve` if it is not already running.
2. Open the extension, select Settings → Translation Service → Ollama. Verify the endpoint is `http://localhost:11434` and set the model to the exact installed model name. No API key is needed for a default local Ollama server.
3. Test the connection, then click Save Settings. The connection test sends a short prompt to the selected local model.
4. Enter `Hello, how are you?`, select Traditional Chinese, and click Translate. Test copy/read-aloud controls and History. Toggle learning mode for vocabulary and alternative translations; output quality and structured responses depend on the chosen model.
5. On an ordinary webpage, enable double-click translation in Settings and double-click a word. Verify the translation bubble, copying, closing, and retry behavior. Site exclusions can disable these bubbles per website.
6. If requests fail, confirm the local server is running and permits requests from the extension. View Settings → Appearance and Diagnostics → Diagnostic Logs for connection details. Chromium side panel API calls are feature-guarded; Firefox uses the popup instead.

Data transmission: chosen text and, for contextual webpage translation, the surrounding sentence are sent to the configured AI endpoint. API credentials authenticate requests when configured. Grammar checking and learning mode can make additional requests. No developer-operated server, telemetry, or analytics is used. Firefox declares `websiteContent`, `authenticationInfo`, and `personalCommunications` and shows built-in installation consent.

Telegram forwarding is optional and disabled by default. Testing that optional integration requires a Telegram bot token and a chat ID supplied separately; none are bundled in the add-on or published here. Cloud providers likewise require a valid provider API key supplied separately. Do not enter production secrets into public version notes.

The packaged add-on contains readable JavaScript, CSS, HTML, SVG/PNG icons and documentation. There is no minification, remote executable code, runtime HTML parser, or third-party runtime dependency. To reproduce the packages, run `npm test`, `npm run build`, and `npm run build:firefox`. Validation is pinned to `web-ext 10.7.0` and runs on the extracted release ZIPs.
