## 2024-05-20 - [Token Input Exposure]
**Vulnerability:** Telegram Bot Token input was displayed in plaintext.
**Learning:** Third party tokens should be treated with the same security as primary passwords/API Keys.
**Prevention:** Always use type="password" for third party tokens and sensitive config values.

## 2024-05-18 - [Fix Stored XSS in Extension UI]
**Vulnerability:** Found Stored XSS vulnerabilities where `log.timestamp`, `log.type`, and string properties in translation history were dynamically injected into `.innerHTML` templates without HTML escaping in `popup.js`. Local extension storage was implicitly treated as trusted data.
**Learning:** Even when reading from ostensibly secure local storage (like `chrome.storage.local`), data might originate from potentially untrusted inputs (e.g. LLM API responses or web content logs).
**Prevention:** Always wrap dynamically interpolated variables in `escapeHTML()` before assigning them to `innerHTML`, regardless of the data source within the extension.
