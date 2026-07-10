// content.js for Fire Translate

// Store active translation bubble reference
let activeBubble = null;

// Listen for messages from background context menus
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showContextBubble") {
    const selection = window.getSelection();
    const text = request.text || selection.toString().trim();
    if (text) {
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
  const text = selection.toString().trim();
  
  // Translate if text selection is between 1 and 1000 characters
  if (text.length > 0 && text.length < 1000) {
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

function showBubble(text, selection) {
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

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
  bubble.className = "translation-bubble";
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
      font-size: 13px !important;
      line-height: 1.5 !important;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-sizing: border-box !important;
      animation: bubbleFadeIn 0.2s ease-out;
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
        text: text
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
        text: text
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
  if (vocabulary && vocabulary.length > 0) {
    const vocabContainer = document.createElement("div");
    vocabContainer.className = "bubble-vocab-section";
    vocabContainer.innerHTML = `<div class="bubble-vocab-title">Key Vocabulary & Examples</div>`;
    
    const vocabList = document.createElement("ul");
    vocabList.className = "bubble-vocab-list";
    vocabList.style.paddingLeft = "10px";
    
    vocabulary.slice(0, 3).forEach(vocab => {
      const item = document.createElement("li");
      item.className = "bubble-vocab-item";
      item.style.marginBottom = "8px";
      item.style.listStyleType = "none"; // Hide default disc for custom layout spacing
      
      let html = `<div><span class="vocab-hl">${escapeHTML(vocab.word)}</span> (${escapeHTML(vocab.pos || "n.")}): <strong>${escapeHTML(vocab.translation)}</strong></div>`;
      
      if (vocab.synonyms && vocab.synonyms.length > 0) {
        html += `<div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">Synonyms: ${escapeHTML(vocab.synonyms.join(", "))}</div>`;
      }
      if (vocab.when_to_use) {
        html += `<div style="font-size: 10px; color: #9ca3af; margin-top: 1px;">Usage: ${escapeHTML(vocab.when_to_use)}</div>`;
      }
      if (vocab.example_sentence_source) {
        html += `<div style="font-size: 10.5px; color: #fbbf24; margin-top: 2px; font-style: italic;">“${escapeHTML(vocab.example_sentence_source)}”</div>`;
        if (vocab.example_sentence_target) {
          html += `<div style="font-size: 10.5px; color: #a7f3d0; margin-left: 4px;">→ ${escapeHTML(vocab.example_sentence_target)}</div>`;
        }
      }
      
      item.innerHTML = html;
      vocabList.appendChild(item);
    });
    
    vocabContainer.appendChild(vocabList);
    content.appendChild(vocabContainer);
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
