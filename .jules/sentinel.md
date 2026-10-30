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

## 2024-05-28 - [Reflected XSS in Local Dev Server]
**Vulnerability:** The local Chrome Web Store OAuth script (`cws-oauth.mjs`) reflected the `error` query parameter directly into its HTML response without sanitization.
**Learning:** Local developer scripts and utility web servers (like OAuth loopback servers) are also susceptible to web vulnerabilities and must treat user input as untrusted.
**Prevention:** Always HTML-escape untrusted input (such as URL parameters) before rendering it in HTTP responses, even in local-only development servers.

## 2024-05-30 - [Input Length Missing Limit]
**Vulnerability:** The application lacked input length limits on the text intended for translation (`src-textarea`, clipboard paste, context menu selections). A maliciously crafted large text payload could cause a Denial of Service (DoS) by freezing the UI, crashing the browser tab, or exhausting the LLM API tokens and rate limits.
**Learning:** Even seemingly benign text inputs used for language processing can be vectors for resource exhaustion (DoS) or ReDoS if not bounded.
**Prevention:** To prevent resource exhaustion (DoS) via ReDoS or excessive API token usage from massive inputs, proactively enforce input length boundaries (e.g., truncating text to 5000 characters). Apply limits defensively both in UI elements (via the `maxlength` attribute) and programmatically within JavaScript event listeners, message handlers, and text-processing utilities.

## 2024-05-31 - [Configuration Input Length Missing Limit]
**Vulnerability:** Configuration inputs like API endpoints, models, API keys, and system prompts lacked length validation in `popup.html`.
**Learning:** Text inputs that are synced to storage or processed by the application can be vectors for resource exhaustion (DoS), storage bloat, or UI freezes if they don't have constraints.
**Prevention:** Always apply length bounds on all text input elements, especially configuration parameters, using HTML `maxlength` properties (e.g. `maxlength="500"` for simple fields and `maxlength="5000"` for long prompts) to proactively prevent resource abuse.

## 2024-06-01 - [Input Type Number Missing Boundary Validation]
**Vulnerability:** Configuration inputs like `maxHistory` lacked programmatic boundary validation on their values retrieved from the `<input type="number">` or from storage, potentially allowing a malicious setting to crash the extension due to slicing arrays with invalid negative bounds or consuming large amounts of memory if unbounded arrays are stored.
**Learning:** HTML validation attributes like min and max on `<input type="number">` can be easily bypassed.
**Prevention:** Always explicitly enforce numeric boundaries in JavaScript (e.g., using `Math.max` and `Math.min` coupled with `isNaN` checking) before storing or using the values to prevent resource exhaustion, out of bound array access, or unexpected behavior.
