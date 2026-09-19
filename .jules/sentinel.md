## 2024-05-20 - [Token Input Exposure]
**Vulnerability:** Telegram Bot Token input was displayed in plaintext.
**Learning:** Third party tokens should be treated with the same security as primary passwords/API Keys.
**Prevention:** Always use type="password" for third party tokens and sensitive config values.

## 2024-05-18 - [Fix Stored XSS in Extension UI]
**Vulnerability:** Found Stored XSS vulnerabilities where `log.timestamp`, `log.type`, and string properties in translation history were dynamically injected into `.innerHTML` templates without HTML escaping in `popup.js`. Local extension storage was implicitly treated as trusted data.
**Learning:** Even when reading from ostensibly secure local storage (like `chrome.storage.local`), data might originate from potentially untrusted inputs (e.g. LLM API responses or web content logs).
**Prevention:** Always wrap dynamically interpolated variables in `escapeHTML()` before assigning them to `innerHTML`, regardless of the data source within the extension.

## 2024-05-22 - [Add Timeouts to Hanging Fetches]
**Vulnerability:** External fetch calls in extension UI (e.g., `testConnection`, `fetchLatestModels`) lacked explicit timeouts, which could cause the UI to hang indefinitely on unreachable endpoints, leading to resource exhaustion (DoS).
**Learning:** Browser environments might let fetches hang indefinitely or for very long default timeouts on unreachable local network addresses.
**Prevention:** Always implement explicit timeouts using `AbortController` for external `fetch` calls. Ensure proper cleanup with `clearTimeout` in a `finally` block to prevent dangling timers. Share the same signal across sequential fallback fetches to enforce a total time bound.

## 2024-05-24 - [Telegram Chat ID Input Exposure]
**Vulnerability:** Telegram Chat ID input was displayed in plaintext and leaked into localStorage during auto-drafting.
**Learning:** Third party IDs or configurations, even if seemingly less sensitive than tokens, can still be considered sensitive configuration data and should be protected.
**Prevention:** Treat sensitive configuration values (like Chat IDs) with `type="password"` in the UI and ensure they are added to `DRAFT_SECRET_KEYS` to avoid insecure local storage persistence.

## 2024-05-26 - [Resource Exhaustion via Dangling Timers]
**Vulnerability:** External fetch calls used AbortController for timeouts, but `clearTimeout` was placed sequentially after the fetch without a `try...finally` block. If the fetch threw an error (e.g., network failure, or the abort itself), the error would bubble up, skipping the `clearTimeout` execution and leaving a dangling timer.
**Learning:** In asynchronous JavaScript, cleanup tasks for external resources or timers must be guaranteed to run regardless of success or failure of the awaited promise. Unhandled rejections skip subsequent lines in the same block.
**Prevention:** Always wrap external fetch calls (or any async operation with a paired cleanup action) in a `try...finally` block and execute the cleanup (e.g., `clearTimeout`) inside the `finally` block to ensure execution under all conditions.
