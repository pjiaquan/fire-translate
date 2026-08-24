## 2024-05-20 - [Token Input Exposure]
**Vulnerability:** Telegram Bot Token input was displayed in plaintext.
**Learning:** Third party tokens should be treated with the same security as primary passwords/API Keys.
**Prevention:** Always use type="password" for third party tokens and sensitive config values.
