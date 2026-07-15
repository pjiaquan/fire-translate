// content.js for Fire Translate

// Store active translation bubble reference
let activeBubble = null;

function cleanTranslateText(text) {
  if (!text) return "";
  // 1. Strip HTML tags
  let cleaned = text.replace(/<\/?[^>]+(>|$)/g, "");
  // 2. Remove control characters and non-printable characters
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
  // 3. Strip edge non-alphanumeric punctuation and symbols
  cleaned = cleaned.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
  return cleaned.trim();
}

function isUrlLike(text) {
  const trimmed = text.trim();
  // 1. Protocol prefix (http://, https://, ftp://, file://, chrome://, etc.)
  if (/^[a-z]+:\/\//i.test(trimmed)) {
    return true;
  }
  // 2. Starts with www.
  if (/^www\./i.test(trimmed)) {
    return true;
  }
  // 3. Email addresses
  if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/.test(trimmed)) {
    return true;
  }
  // 4. Domain names (e.g. google.com, news.ycombinator.com/item)
  const urlPattern = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}(\/[-a-zA-Z0-9()@:%_\+.~#?&//=]*)?$/i;
  if (urlPattern.test(trimmed)) {
    return true;
  }
  return false;
}

function isApiKeyLike(text) {
  const trimmed = text.trim();
  // Groq API keys (gsk_...)
  if (/^gsk_[a-zA-Z0-9]{40,}/.test(trimmed)) return true;
  // OpenAI API keys (sk-...)
  if (/^sk-[a-zA-Z0-9]{20,}/.test(trimmed)) return true;
  // Anthropic/Claude API keys (sk-ant-...)
  if (/^sk-ant-[a-zA-Z0-9_-]{20,}/.test(trimmed)) return true;
  // Google/Gemini API keys (AIza...)
  if (/^AIza[0-9A-Za-z_-]{30,}/.test(trimmed)) return true;
  // HuggingFace API keys (hf_...)
  if (/^hf_[a-zA-Z0-9]{20,}/.test(trimmed)) return true;
  // Generic: long random-looking alphanumeric strings (30+ chars, has digits and letters)
  if (/^[a-zA-Z0-9_-]{30,}$/.test(trimmed) && /[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) return true;
  return false;
}

// Listen for messages from background context menus
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showContextBubble") {
    const selection = window.getSelection();
    const textRaw = request.text || selection.toString();
    const text = cleanTranslateText(textRaw);
    if (text && /\p{L}/u.test(text) && !isUrlLike(text) && !isApiKeyLike(text)) {
      removeBubble();
      if (selection.rangeCount > 0) {
        showBubble(text, selection);
      }
    }
    sendResponse({ success: true });
  }
});

// Double click event listener on the document
document.addEventListener("dblclick", async (e) => {
  // Check if double-click translation is enabled in storage
  const settings = await chrome.storage.local.get("doubleClickTranslate");
  if (settings.doubleClickTranslate === false) {
    return; // Switched off
  }

  const selection = window.getSelection();
  const textRaw = selection.toString();
  const text = cleanTranslateText(textRaw);
  
  // Translate if text selection is between 1 and 1000 characters, contains letters/numbers and not a URL
  if (text.length > 0 && text.length < 1000 && /\p{L}/u.test(text) && !isUrlLike(text) && !isApiKeyLike(text)) {
    removeBubble();
    showBubble(text, selection);
  }
});

// Remove bubble on click outside
document.addEventListener("mousedown", (e) => {
  if (activeBubble) {
    const host = document.getElementById("fire-translate-shadow-host");
    if (host && !e.composedPath().includes(host)) {
      removeBubble();
    }
  }
});

// Remove bubble on pressing Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    removeBubble();
  }
});

// Dismiss active bubble on window resize
window.addEventListener("resize", removeBubble);

function removeBubble() {
  const host = document.getElementById("fire-translate-shadow-host");
  if (host) {
    host.remove();
  }
  activeBubble = null;
}

function getSentenceForSelection(selection) {
  if (!selection || selection.rangeCount === 0) return "";
  const selectedWord = selection.toString().trim();
  if (!selectedWord) return "";
  
  const range = selection.getRangeAt(0);
  const container = range.startContainer;
  
  // 1. Traverse up to block container
  let parent = container.parentNode;
  while (parent && !/^(P|DIV|LI|H[1-6]|TD|BLOCKQUOTE|SECTION|ARTICLE|ASIDE|NAV|HEADER|FOOTER)$/i.test(parent.tagName) && parent.tagName !== "BODY") {
    parent = parent.parentNode;
  }
  
  if (!parent) return selectedWord;
  
  // Get all text content and map selection offsets within it
  let startOffset = -1;
  let endOffset = -1;
  let currentLen = 0;
  
  // Walk text nodes to find absolute character offsets
  const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while (node = walker.nextNode()) {
    if (node === range.startContainer) {
      startOffset = currentLen + range.startOffset;
    }
    if (node === range.endContainer) {
      endOffset = currentLen + range.endOffset;
    }
    currentLen += node.nodeValue.length;
  }
  
  const text = parent.textContent;
  if (startOffset === -1 || endOffset === -1 || !text) {
    const blockText = text ? text.trim() : "";
    if (!blockText) return selectedWord;
    const sentences = blockText.split(/(?<=[.!?。？！;；\n\r])\s+/u);
    for (const sentence of sentences) {
      if (sentence.includes(selectedWord)) {
        return sentence.trim();
      }
    }
    return selectedWord;
  }
  
  // Find sentence boundaries around [startOffset, endOffset]
  let sentenceStart = 0;
  for (let i = startOffset - 1; i >= 0; i--) {
    const char = text[i];
    if (/[.!?。？！;；\n\r]/.test(char)) {
      if (/[。？！；\n\r]/.test(char) || (i + 1 < text.length && /\s/.test(text[i + 1]))) {
        sentenceStart = i + 1;
        break;
      }
    }
  }
  
  let sentenceEnd = text.length;
  for (let i = endOffset; i < text.length; i++) {
    const char = text[i];
    if (/[.!?。？！;；\n\r]/.test(char)) {
      if (/[。？！；\n\r]/.test(char) || (i + 1 === text.length || /\s/.test(text[i + 1]))) {
        sentenceEnd = i + 1;
        break;
      }
    }
  }
  
  return text.substring(sentenceStart, sentenceEnd).trim();
}

async function showBubble(text, selection) {
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  const contextSentence = getSentenceForSelection(selection);

  const settings = await chrome.storage.local.get("textSize");
  const textSize = settings.textSize || "medium";

  // Create Shadow Host element
  const host = document.createElement("div");
  host.id = "fire-translate-shadow-host";
  
  // Style the host container itself to allow absolute position layering
  host.style.position = "absolute";
  host.style.zIndex = "999999999";
  host.style.top = "0";
  host.style.left = "0";
  host.style.width = "100%";
  host.style.pointerEvents = "none";
  
  // Attach Shadow DOM for CSS isolation
  const shadow = host.attachShadow({ mode: "open" });
  document.body.appendChild(host);
  
  // Create Bubble wrapper
  const bubble = document.createElement("div");
  bubble.className = `translation-bubble size-${textSize}`;
  bubble.style.pointerEvents = "auto";
  
  // Shadow DOM Internal Styles
  const style = document.createElement("style");
  style.textContent = `
    .translation-bubble {
      position: absolute;
      width: 320px;
      background-color: #111827 !important; /* Slate 900 */
      color: #f3f4f6 !important; /* Gray 100 */
      border: 1px solid #374151 !important; /* Gray 700 */
      border-radius: 12px !important;
      padding: 12px 14px !important;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.4) !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box !important;
      animation: bubbleFadeIn 0.2s ease-out;
    }
    
    .translation-bubble.size-small {
      font-size: 11px !important;
      line-height: 1.35 !important;
    }
    
    .translation-bubble.size-medium {
      font-size: 13.5px !important;
      line-height: 1.5 !important;
    }
    
    .translation-bubble.size-large {
      font-size: 16px !important;
      line-height: 1.6 !important;
    }
    
    @keyframes bubbleFadeIn {
      from { opacity: 0; transform: scale(0.95) translateY(5px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    
    .bubble-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #374151;
      padding-bottom: 6px;
      margin-bottom: 4px;
    }
    
    .bubble-title {
      font-weight: 700;
      color: #f97316 !important; /* Fire Orange */
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .bubble-close {
      background: transparent;
      border: none;
      color: #9ca3af;
      cursor: pointer;
      font-size: 16px;
      padding: 2px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      width: 20px;
      height: 20px;
      line-height: 1;
    }
    
    .bubble-close:hover {
      background-color: #1f2937;
      color: #f3f4f6;
    }
    
    .bubble-content {
      max-height: 180px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 13px;
      color: #e5e7eb;
    }
    
    .bubble-loader {
      display: flex;
      align-items: center;
      gap: 10px;
      color: #9ca3af;
      font-style: italic;
    }
    
    .spinner {
      border: 2px solid #374151;
      border-top: 2px solid #f97316;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .bubble-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 4px;
      border-top: 1px solid #374151;
      padding-top: 6px;
    }
    
    .bubble-copy-btn {
      background: transparent;
      border: 1px solid #374151;
      color: #9ca3af;
      padding: 3px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.2s;
    }
    
    .bubble-copy-btn:hover {
      background-color: #1f2937;
      color: #f3f4f6;
      border-color: #4b5563;
    }
    
    .bubble-vocab-section {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      border-top: 1px dashed #374151;
      padding-top: 8px;
    }
    
    .bubble-vocab-title {
      font-size: 10px;
      font-weight: 700;
      color: #fbbf24; /* Amber */
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .bubble-vocab-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin: 0;
      padding-left: 14px;
      font-size: 11px;
      color: #d1d5db;
    }
    
    .bubble-vocab-item {
      line-height: 1.4;
      list-style-type: disc;
    }
    
    .vocab-hl {
      color: #f97316;
      font-weight: 600;
    }
  `;
  
  shadow.appendChild(style);
  
  // Set initial loader layout
  bubble.innerHTML = `
    <div class="bubble-header">
      <div class="bubble-title">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        Fire Translate
      </div>
      <button class="bubble-close" title="Close Popup">&times;</button>
    </div>
    <div class="bubble-content">
      <div class="bubble-loader">
        <div class="spinner"></div>
        Translating selection...
      </div>
    </div>
  `;
  
  shadow.appendChild(bubble);
  activeBubble = bubble;
  
  // Setup close action
  bubble.querySelector(".bubble-close").addEventListener("click", removeBubble);
  
  // Calculate relative placement to browser viewport scroll positions
  const pageScrollY = window.pageYOffset || document.documentElement.scrollTop;
  const pageScrollX = window.pageXOffset || document.documentElement.scrollLeft;
  
  const bubbleWidth = 320;
  let left = rect.left + pageScrollX + (rect.width / 2) - (bubbleWidth / 2);
  let top = rect.bottom + pageScrollY + 10;
  
  // Left/Right boundaries check
  if (left < 10) left = 10;
  const maxLeft = window.innerWidth - bubbleWidth - 10;
  if (left > maxLeft) left = maxLeft;
  
  // Position the bubble
  bubble.style.top = `${top}px`;
  bubble.style.left = `${left}px`;
  
  // Read stream setting to determine relay channel style
  chrome.storage.local.get(["streamTranslations", "richLearningMode"], (settings) => {
    const isStreamingEnabled = settings.streamTranslations !== false;
    const richLearningMode = settings.richLearningMode !== false;
    const content = bubble.querySelector(".bubble-content");

    if (isStreamingEnabled) {
      // Connect port channel for streaming SSE relay from service worker
      const port = chrome.runtime.connect({ name: "translate-stream" });
      
      port.postMessage({
        action: "translateStreamInline",
        text: text,
        contextSentence: contextSentence
      });
      
      let accumulatedText = "";
      
      port.onMessage.addListener((msg) => {
        if (!activeBubble || document.getElementById("fire-translate-shadow-host") === null) return;
        
        if (msg.type === "chunk") {
          if (msg.data.startsWith("{") && msg.data.endsWith("}")) {
            try {
              const data = JSON.parse(msg.data);
              if (data && data.translation) {
                content.innerHTML = `<div class="translation-text">${escapeHTML(data.translation)}</div>`;
                renderInlineVocab(content, data.vocabulary);
                setupFooter(bubble, data.translation);
                port.disconnect();
                return;
              }
            } catch (e) {}
          }
          
          accumulatedText += msg.data;
          content.innerHTML = `<div class="translation-text">${escapeHTML(accumulatedText)}</div>`;
        } else if (msg.type === "done-translation") {
          content.innerHTML = `<div class="translation-text">${escapeHTML(msg.text)}</div>`;
          
          if (richLearningMode) {
            const spinner = document.createElement("div");
            spinner.id = "bubble-vocab-loading";
            spinner.style.cssText = "margin-top: 8px; font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.1);";
            spinner.innerHTML = `
              <div class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></div>
              <span>Loading vocabulary...</span>
            `;
            content.appendChild(spinner);
          } else {
            setupFooter(bubble, msg.text);
          }
        } else if (msg.type === "done-learning") {
          const spinner = content.querySelector("#bubble-vocab-loading");
          if (spinner) spinner.remove();
          
          if (msg.parsed && msg.parsed.vocabulary) {
            renderInlineVocab(content, msg.parsed.vocabulary);
          }
          setupFooter(bubble, accumulatedText);
          port.disconnect();
        } else if (msg.type === "done") {
          const isJson = accumulatedText.startsWith("{") && accumulatedText.endsWith("}");
          if (isJson) {
            try {
              const data = JSON.parse(accumulatedText);
              if (data && data.translation) {
                content.innerHTML = `<div class="translation-text">${escapeHTML(data.translation)}</div>`;
                renderInlineVocab(content, data.vocabulary);
                setupFooter(bubble, data.translation);
                port.disconnect();
                return;
              }
            } catch (e) {}
          }
          
          content.innerHTML = `<div class="translation-text">${escapeHTML(accumulatedText)}</div>`;
          setupFooter(bubble, accumulatedText);
          port.disconnect();
        } else if (msg.type === "error") {
          content.innerHTML = `<span style="color: #ef4444; font-weight: 500;">Error: ${escapeHTML(msg.error)}</span>`;
          port.disconnect();
        }
      });
    } else {
      // Fallback: standard sendMessage for non-streaming fetches
      chrome.runtime.sendMessage({
        action: "translateInline",
        text: text,
        contextSentence: contextSentence
      }, (response) => {
        if (!activeBubble || document.getElementById("fire-translate-shadow-host") === null) return;
        
        if (chrome.runtime.lastError || !response || !response.success) {
          const errorMsg = response?.error || chrome.runtime.lastError?.message || "Server connection failed";
          content.innerHTML = `<span style="color: #ef4444; font-weight: 500;">Error: ${errorMsg}</span>`;
          return;
        }
        
        const translationResult = response.data;
        if (translationResult.rich) {
          const data = translationResult.parsed;
          content.innerHTML = `<div class="translation-text">${escapeHTML(data.translation)}</div>`;
          renderInlineVocab(content, data.vocabulary);
          setupFooter(bubble, data.translation);
        } else {
          content.innerHTML = `<div class="translation-text">${escapeHTML(translationResult.text)}</div>`;
          setupFooter(bubble, translationResult.text);
        }
      });
    }
  });
}

function setupFooter(bubble, textToCopy) {
  const footer = document.createElement("div");
  footer.className = "bubble-footer";
  footer.innerHTML = `
    <button class="bubble-copy-btn" title="Copy Translation">
      <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
      Copy
    </button>
  `;
  
  bubble.appendChild(footer);
  
  const copyBtn = footer.querySelector(".bubble-copy-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        Copied
      `;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy
        `;
      }, 1500);
    });
  });
}

function finalizeInlineTranslation(bubble, translatedText, richLearningMode) {
  const content = bubble.querySelector(".bubble-content");
  let parsedSuccessfully = false;
  
  if (richLearningMode) {
    try {
      const cleanedText = translatedText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const data = JSON.parse(cleanedText);
      if (data && data.translation) {
        content.innerHTML = `<div class="translation-text">${escapeHTML(data.translation)}</div>`;
        renderInlineVocab(content, data.vocabulary);
        setupFooter(bubble, data.translation);
        parsedSuccessfully = true;
      }
    } catch (e) {
      const startIdx = translatedText.indexOf("{");
      const endIdx = translatedText.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        try {
          const jsonSub = translatedText.substring(startIdx, endIdx + 1);
          const data = JSON.parse(jsonSub);
          if (data && data.translation) {
            content.innerHTML = `<div class="translation-text">${escapeHTML(data.translation)}</div>`;
            renderInlineVocab(content, data.vocabulary);
            setupFooter(bubble, data.translation);
            parsedSuccessfully = true;
          }
        } catch (e2) {}
      }
    }
  }
  
  if (!parsedSuccessfully) {
    content.innerHTML = `<div class="translation-text">${escapeHTML(translatedText)}</div>`;
    setupFooter(bubble, translatedText);
  }
}

function renderInlineVocab(content, vocabulary) {
  if (!vocabulary || vocabulary.length === 0) return;
  
  // Collect all unique synonyms across vocabulary items
  let allSynonyms = [];
  vocabulary.forEach(vocab => {
    if (vocab.synonyms && vocab.synonyms.length > 0) {
      vocab.synonyms.forEach(syn => {
        if (!allSynonyms.includes(syn)) {
          allSynonyms.push(syn);
        }
      });
    }
  });

  if (allSynonyms.length > 0) {
    const synContainer = document.createElement("div");
    synContainer.className = "bubble-vocab-section";
    synContainer.style.cssText = "margin-top: 8px; border-top: 1px dashed #374151; padding-top: 8px;";
    
    synContainer.innerHTML = `
      <div style="font-size: 10px; color: #fbbf24; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Similar Words</div>
      <div style="font-size: 11px; color: #d1d5db; line-height: 1.4;">${escapeHTML(allSynonyms.join(", "))}</div>
    `;
    content.appendChild(synContainer);
  }
}

function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
