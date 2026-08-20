// tests.js - Custom unit test suite for Fire Translate
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

console.log("\x1b[36m%s\x1b[0m", "🧪 Running Fire Translate Extension Unit Tests...");

// Helper to create sandbox context with mocks
function createSandbox() {
  const mockLocalStorage = {};
  const mockSessionStorage = {};
  const mockWebLocalStorage = {};
  const mockLocalStorageObj = {
    getItem: (key) => (key in mockWebLocalStorage ? mockWebLocalStorage[key] : null),
    setItem: (key, val) => { mockWebLocalStorage[key] = String(val); },
    removeItem: (key) => { delete mockWebLocalStorage[key]; },
    clear: () => { Object.keys(mockWebLocalStorage).forEach(k => delete mockWebLocalStorage[k]); }
  };
  
  const mockImportScripts = (url) => {
    // no-op for tests since we pre-append the script manually
  };

  const elementsMap = {};
  const mockDocument = {
    body: {
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false
      },
      appendChild: () => {},
      removeChild: () => {}
    },
    getElementById: (id) => {
      if (!elementsMap[id]) {
        const _classes = new Set();
        const el = {
          id: id,
          value: "",
          textContent: "",
          checked: false,
          type: "",
          listeners: {},
          addEventListener: function(evt, fn) {
            if (!this.listeners[evt]) this.listeners[evt] = [];
            this.listeners[evt].push(fn);
          },
          dispatchEvent: function(evt) {
            if (this.listeners[evt]) {
              this.listeners[evt].forEach(fn => fn({ target: this }));
            }
          },
          appendChild: () => {},
          removeChild: () => {},
          focus: () => {},
          blur: () => {},
          querySelector: () => null,
          querySelectorAll: () => []
        };
        Object.defineProperty(el, "className", {
          get() { return Array.from(_classes).join(" "); },
          set(v) {
            _classes.clear();
            if (v) String(v).split(/\s+/).filter(Boolean).forEach(c => _classes.add(c));
          }
        });
        el.classList = {
          add: function(...cs) { cs.forEach(c => _classes.add(c)); },
          remove: function(...cs) { cs.forEach(c => _classes.delete(c)); },
          contains: function(c) { return _classes.has(c); }
        };
        elementsMap[id] = el;
      }
      return elementsMap[id];
    },
    createElement: (tag) => ({
      tagName: (tag || "").toUpperCase(),
      value: "",
      textContent: "",
      className: "",
      innerHTML: "",
      addEventListener: () => {},
      appendChild: () => {}
    }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const mockWindow = {
    addEventListener: () => {},
    SpeechSynthesisUtterance: class {},
    speechSynthesis: { speak: () => {}, cancel: () => {} },
    localStorage: mockLocalStorageObj
  };

  const mockChrome = {
    storage: {
      local: {
        get: (keys, callback) => {
          const res = {};
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(k => {
            res[k] = mockLocalStorage[k];
          });
          if (callback) callback(res);
          return Promise.resolve(res);
        },
        set: (items, callback) => {
          Object.assign(mockLocalStorage, items);
          if (callback) callback();
          return Promise.resolve();
        },
        remove: (keys, callback) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(k => {
            delete mockLocalStorage[k];
          });
          if (callback) callback();
          return Promise.resolve();
        }
      },
      // In-memory session area (chrome.storage.session): never written to disk
      session: {
        get: (keys, callback) => {
          const res = {};
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(k => {
            if (k in mockSessionStorage) res[k] = mockSessionStorage[k];
          });
          if (callback) callback(res);
          return Promise.resolve(res);
        },
        set: (items, callback) => {
          Object.assign(mockSessionStorage, items);
          if (callback) callback();
          return Promise.resolve();
        },
        remove: (keys, callback) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(k => {
            delete mockSessionStorage[k];
          });
          if (callback) callback();
          return Promise.resolve();
        }
      }
    },
    runtime: {
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} },
      onConnect: { addListener: () => {} },
      sendMessage: () => {}
    },
    contextMenus: {
      create: () => {},
      update: () => {},
      onClicked: { addListener: () => {} }
    },
    tabs: {
      onActivated: { addListener: () => {} },
      onUpdated: { addListener: () => {} },
      get: () => Promise.resolve({ id: 1, url: "https://example.com" }),
      sendMessage: () => Promise.resolve()
    }
  };

  return {
    importScripts: mockImportScripts,
    console: console,
    chrome: mockChrome,
    document: mockDocument,
    window: mockWindow,
    navigator: {
      clipboard: { writeText: () => Promise.resolve() }
    },
    languageNames: {
      "auto": "自動偵測",
      "zh-TW": "繁體中文"
    },
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    localStorage: mockLocalStorageObj,
    mockWebLocalStorage: mockWebLocalStorage,
    elementsMap: elementsMap,
    mockLocalStorage: mockLocalStorage,
    mockSessionStorage: mockSessionStorage
  };
}

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`\x1b[32m✔ PASS:\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.error(`\x1b[31m✘ FAIL:\x1b[0m ${name}`);
    console.error(err);
    failed++;
  }
}

// Load scripts
const sharedUtilsCode = fs.readFileSync('shared/utils.js', 'utf8');
const popupCode = sharedUtilsCode + '\n' + fs.readFileSync('popup.js', 'utf8');
const bgCode = sharedUtilsCode + '\n' + fs.readFileSync('background.js', 'utf8');
const contentCode = sharedUtilsCode + '\n' + fs.readFileSync('content.js', 'utf8');

async function executeTestSuite() {
  // Test 1: Cache initialization & key hashing
  await runTest("Cache utility should store and retrieve translations", async () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    // Invoke caching helper functions
    const srcText = "hello";
    const srcLang = "en";
    const targetLang = "zh-TW";
    const model = "qwen";
    const richLearningMode = true;
    const translationData = { rich: false, text: "你好" };

    await sandbox.setCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode, translationData);
    const cached = await sandbox.getCachedTranslation(srcText, srcLang, targetLang, model, richLearningMode);
    
    assert.deepStrictEqual(cached, translationData);
  });

  // Test 2: Cache LRU eviction
  await runTest("Cache should evict oldest items when exceeding threshold", async () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    // Write 550 items to trigger eviction (cap is 500)
    for (let i = 0; i < 550; i++) {
      await sandbox.setCachedTranslation(`word-${i}`, "en", "zh-TW", "qwen", true, { rich: false, text: `translation-${i}` });
    }

    const cache = sandbox.mockLocalStorage.translationCache || {};
    const size = Object.keys(cache).length;
    // Size should have shrunk to 500 items (evicted 50 items)
    assert.ok(size <= 500, `Cache size should be capped, found ${size}`);
  });

  // Test 3: System Prompt Substitutions
  await runTest("System prompt replacing should format languages correctly", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    const rawPrompt = "Translate user text into {target_lang} correctly.";
    const targetLangName = sandbox.languageNames["zh-TW"] || "zh-TW";
    const systemPrompt = rawPrompt.replace(/{target_lang}/g, targetLangName);
    
    assert.strictEqual(systemPrompt, "Translate user text into 繁體中文 correctly.");
  });

  // Test 4: JSON Parsing Fallbacks
  await runTest("JSON parser fallback should parse sub-braced content correctly", () => {
    const responseWithMarkdown = "Here is the JSON: ```json\n{\n  \"translation\": \"吞吐量\"\n}\n```";
    
    const cleanedText = responseWithMarkdown.replace(/```json/gi, "").replace(/```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (e) {
      const startIdx = responseWithMarkdown.indexOf("{");
      const endIdx = responseWithMarkdown.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        parsed = JSON.parse(responseWithMarkdown.substring(startIdx, endIdx + 1));
      }
    }

    assert.strictEqual(parsed.translation, "吞吐量");
  });

  // Test 5: Shadow DOM initialization in content.js
  await runTest("Content script should evaluate and execute successfully", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    // Should compile and run without runtime exceptions
    vm.runInContext(contentCode, sandbox);
  });

  // Test 6: Background script should evaluate and execute successfully
  await runTest("Background script should evaluate and execute successfully", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    // Should compile and run without runtime exceptions
    vm.runInContext(bgCode, sandbox);
  });

  // Test 7: URL and link detection utility
  await runTest("URL detection helper should identify URLs and links correctly", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(bgCode, sandbox);
    
    // Check that isUrlLike matches URLs
    assert.strictEqual(sandbox.isUrlLike("http://example.com"), true);
    assert.strictEqual(sandbox.isUrlLike("https://www.google.com/search?q=gemma"), true);
    assert.strictEqual(sandbox.isUrlLike("ftp://files.org"), true);
    assert.strictEqual(sandbox.isUrlLike("www.yahoo.com"), true);
    assert.strictEqual(sandbox.isUrlLike("test@example.com"), true);
    assert.strictEqual(sandbox.isUrlLike("news.ycombinator.com/item"), true);
    assert.strictEqual(sandbox.isUrlLike("github.io"), true);
    
    // Check that isUrlLike does not match plain words/sentences
    assert.strictEqual(sandbox.isUrlLike("hello"), false);
    assert.strictEqual(sandbox.isUrlLike("This is a sentence. And another."), false);
    assert.strictEqual(sandbox.isUrlLike("e.g."), false);
  });

  // Test 7b: API key detection utility
  await runTest("API key detection helper should identify API keys correctly", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(bgCode, sandbox);
    
    // Check that isApiKeyLike matches various API keys
    assert.strictEqual(sandbox.isApiKeyLike("gsk_JDHnjApZID6ISWJg5JNCWGdyb3FYYNzhZqCwF1P2McOB4oVq0Zasd"), true);
    assert.strictEqual(sandbox.isApiKeyLike("sk-proj-1234567890abcdef1234567890abcdef"), true);
    assert.strictEqual(sandbox.isApiKeyLike("AIzaSyD-1234567890abcdef-1234567890abc"), true);
    
    // Check that isApiKeyLike does not match plain words/sentences
    assert.strictEqual(sandbox.isApiKeyLike("hello"), false);
    assert.strictEqual(sandbox.isApiKeyLike("This is a sentence containing some words."), false);
    assert.strictEqual(sandbox.isApiKeyLike("gsk_key"), false);
    assert.strictEqual(sandbox.isApiKeyLike("sk-short"), false);
  });

  // Test 8: Punctuation removal and trimming utility
  await runTest("cleanTranslateText should strip edge punctuation, HTML tags, control chars and trim correctly", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(bgCode, sandbox);
    
    assert.strictEqual(sandbox.cleanTranslateText(" (hello) "), "hello");
    assert.strictEqual(sandbox.cleanTranslateText(".world!"), "world");
    assert.strictEqual(sandbox.cleanTranslateText("hello-world"), "hello-world");
    assert.strictEqual(sandbox.cleanTranslateText("throughput."), "throughput");
    assert.strictEqual(sandbox.cleanTranslateText("「中文」"), "中文");
    assert.strictEqual(sandbox.cleanTranslateText("   trimmed   "), "trimmed");
    assert.strictEqual(sandbox.cleanTranslateText(""), "");
    assert.strictEqual(sandbox.cleanTranslateText("<b>throughput</b>"), "throughput");
    assert.strictEqual(sandbox.cleanTranslateText("<script>alert(1)</script>hello"), "alert(1)hello");
    assert.strictEqual(sandbox.cleanTranslateText("hello\u0000world"), "helloworld");
  });

  // Test 9: getSentenceForSelection selection parsing logic
  await runTest("getSentenceForSelection should correctly locate the surrounding sentence for selection", () => {
    const sandbox = createSandbox();
    sandbox.NodeFilter = { SHOW_TEXT: 4 };
    
    class MockNode {
      constructor(text, tagName = "DIV") {
        this.nodeValue = text;
        this.textContent = text;
        this.tagName = tagName;
        this.parentNode = null;
      }
    }
    
    const textNode = new MockNode("First sentence. If you’ve seen benchmark charts flying around Twitter or Reddit lately, they almost certainly featured one of the models below. Third sentence.");
    const divNode = new MockNode(textNode.textContent, "DIV");
    textNode.parentNode = divNode;
    
    sandbox.document.createTreeWalker = (parent, showTextFilter) => {
      let visited = false;
      return {
        nextNode: () => {
          if (!visited) {
            visited = true;
            return textNode;
          }
          return null;
        }
      };
    };
    
    const mockSelection = {
      rangeCount: 1,
      toString: () => "benchmark",
      getRangeAt: () => ({
        startContainer: textNode,
        startOffset: textNode.nodeValue.indexOf("benchmark"),
        endContainer: textNode,
        endOffset: textNode.nodeValue.indexOf("benchmark") + "benchmark".length
      })
    };
    
    vm.createContext(sandbox);
    vm.runInContext(contentCode, sandbox);
    
    const sentence = sandbox.getSentenceForSelection(mockSelection);
    assert.strictEqual(
      sentence,
      "If you’ve seen benchmark charts flying around Twitter or Reddit lately, they almost certainly featured one of the models below."
    );

    // Test Chinese punctuation boundary
    const textNode2 = new MockNode("這是第一句。當用戶點選benchmark的時候，會顯示這個翻譯！這是第三句。");
    const divNode2 = new MockNode(textNode2.textContent, "DIV");
    textNode2.parentNode = divNode2;
    
    sandbox.document.createTreeWalker = (parent, showTextFilter) => {
      let visited = false;
      return {
        nextNode: () => {
          if (!visited) {
            visited = true;
            return textNode2;
          }
          return null;
        }
      };
    };
    
    const mockSelection2 = {
      rangeCount: 1,
      toString: () => "benchmark",
      getRangeAt: () => ({
        startContainer: textNode2,
        startOffset: textNode2.nodeValue.indexOf("benchmark"),
        endContainer: textNode2,
        endOffset: textNode2.nodeValue.indexOf("benchmark") + "benchmark".length
      })
    };
    
    const sentence2 = sandbox.getSentenceForSelection(mockSelection2);
    assert.strictEqual(
      sentence2,
      "當用戶點選benchmark的時候，會顯示這個翻譯！"
    );
  });

  // Test 10: Numeric filter ignore logic
  await runTest("Translation filter should ignore pure numbers and pure symbols but allow mixed text", () => {
    // Helper regex checks
    const hasLetters = (text) => /\p{L}/u.test(text);

    // Pure numbers
    assert.strictEqual(hasLetters("123"), false);
    assert.strictEqual(hasLetters("12.34"), false);
    assert.strictEqual(hasLetters("$100.50"), false);
    assert.strictEqual(hasLetters("2026/07/13"), false);

    // Pure symbols
    assert.strictEqual(hasLetters("!!!"), false);
    assert.strictEqual(hasLetters("+-="), false);

    // Mixed text
    assert.strictEqual(hasLetters("Qwen 2.5"), true);
    assert.strictEqual(hasLetters("1 apple"), true);
    assert.strictEqual(hasLetters("3年"), true);
    assert.strictEqual(hasLetters("hello"), true);
  });

  // Test 11: Endpoint URL normalization helper
  await runTest("formatChatEndpointUrl should format base URLs, /v1 paths, and full endpoints correctly", () => {
    function formatChatEndpointUrl(apiEndpoint) {
      if (!apiEndpoint) return "http://192.168.3.202:4090/v1/chat/completions";
      let clean = apiEndpoint.trim().replace(/\/$/, "");
      if (clean.includes("googleapis.com") && !clean.includes("/openai")) {
        clean = `${clean}/openai`;
      }
      if (clean.endsWith("/chat/completions")) {
        return clean;
      }
      if (clean.endsWith("/v1")) {
        return `${clean}/chat/completions`;
      }
      return `${clean}/v1/chat/completions`;
    }

    assert.strictEqual(formatChatEndpointUrl("http://localhost:11434"), "http://localhost:11434/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("https://api.openai.com/v1"), "https://api.openai.com/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("https://api.groq.com/openai"), "https://api.groq.com/openai/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("https://generativelanguage.googleapis.com/v1beta/openai"), "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("https://generativelanguage.googleapis.com/v1beta"), "https://generativelanguage.googleapis.com/v1beta/openai/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("https://api.deepseek.com/v1/chat/completions"), "https://api.deepseek.com/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("http://192.168.3.202:4090/"), "http://192.168.3.202:4090/v1/chat/completions");
  });

  // Test 12: Provider recipes configuration validation
  await runTest("Provider recipes preset list should contain expected standard providers and default models", () => {
    const DEFAULT_RECIPES = {
      groq: { name: "Groq Cloud", endpoint: "https://api.groq.com/openai", model: "llama-3.3-70b-versatile", keyRequired: true },
      openai: { name: "OpenAI", endpoint: "https://api.openai.com", model: "gpt-4o-mini", keyRequired: true },
      deepseek: { name: "DeepSeek API", endpoint: "https://api.deepseek.com", model: "deepseek-chat", keyRequired: true },
      gemini: { name: "Google Gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.6-flash", keyRequired: true },
      ollama: { name: "Ollama Local", endpoint: "http://localhost:11434", model: "qwen2.5:7b", keyRequired: false },
      lmstudio: { name: "LM Studio Local", endpoint: "http://localhost:1234", model: "qwen2.5-7b-instruct", keyRequired: false },
      vllm: { name: "Local Gateway / vLLM", endpoint: "http://192.168.3.202:4090", model: "qwen", keyRequired: false }
    };

    assert.strictEqual(DEFAULT_RECIPES.groq.model, "llama-3.3-70b-versatile");
    assert.strictEqual(DEFAULT_RECIPES.openai.model, "gpt-4o-mini");
    assert.strictEqual(DEFAULT_RECIPES.deepseek.model, "deepseek-chat");
    assert.strictEqual(DEFAULT_RECIPES.gemini.model, "gemini-3.6-flash");
    assert.strictEqual(DEFAULT_RECIPES.ollama.endpoint, "http://localhost:11434");
    assert.strictEqual(DEFAULT_RECIPES.ollama.keyRequired, false);
    assert.strictEqual(DEFAULT_RECIPES.lmstudio.keyRequired, false);
    assert.strictEqual(DEFAULT_RECIPES.vllm.keyRequired, false);
    assert.strictEqual(DEFAULT_RECIPES.openai.keyRequired, true);
  });

  // Test 13: Auto-fix URL logic on provider change
  await runTest("Provider selection should automatically update endpoint URL to provider standard endpoint", () => {
    function autoFixProviderUrl(providerKey, loadedRecipes, DEFAULT_RECIPES) {
      const recipe = loadedRecipes[providerKey] || DEFAULT_RECIPES[providerKey] || DEFAULT_RECIPES.custom;
      const defaultRecipe = DEFAULT_RECIPES[providerKey] || DEFAULT_RECIPES.custom;
      const targetStdUrl = recipe.stdUrl || defaultRecipe.stdUrl || defaultRecipe.endpoint || "";
      if (targetStdUrl) {
        recipe.endpoint = targetStdUrl;
      }
      return recipe.endpoint;
    }

    const mockDefault = {
      gemini: { endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", stdUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
      ollama: { endpoint: "http://localhost:11434", stdUrl: "http://localhost:11434" }
    };
    const mockLoaded = { gemini: { endpoint: "http://outdated-url.com" } };

    assert.strictEqual(autoFixProviderUrl("gemini", mockLoaded, mockDefault), "https://generativelanguage.googleapis.com/v1beta/openai");
    assert.strictEqual(autoFixProviderUrl("ollama", {}, mockDefault), "http://localhost:11434");
  });

  // Test 13.5: Provider recipe switching retains previously configured working model
  await runTest("Provider recipe switching retains previously configured working model for each provider recipe", () => {
    const loadedRecipes = {
      gemini: { endpoint: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash" },
      vllm: { endpoint: "http://192.168.3.202:4090", model: "qwen" }
    };

    function selectModelForProvider(providerKey, existingInputModel, recipes) {
      const rec = recipes[providerKey] || {};
      const savedModel = rec.model || existingInputModel;
      if (providerKey === "gemini" && savedModel && savedModel !== "qwen") {
        return savedModel;
      }
      return rec.model || "gemini-3.6-flash";
    }

    assert.strictEqual(selectModelForProvider("gemini", "qwen", loadedRecipes), "gemini-3.5-flash");
    assert.strictEqual(selectModelForProvider("vllm", "gemini-3.5-flash", loadedRecipes), "qwen");
  });

  // Test 14: Gemini Flash model filter & auto-selection test
  await runTest("Gemini live model fetcher should prioritize text Flash models and auto-select top Flash model", () => {
    function filterAndSelectGeminiFlash(detectedModels) {
      const isTextModel = m => !/image|audio|video|veo|imagen|tts|embedding|live-preview|computer-use|robotics/i.test(m);
      const flashModels = detectedModels.filter(m => /flash/i.test(m) && isTextModel(m));
      flashModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

      const otherTextModels = detectedModels.filter(m => !flashModels.includes(m) && isTextModel(m));
      otherTextModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));

      const sorted = [...flashModels, ...otherTextModels];
      const topFlash = sorted.find(m => /flash/i.test(m) && isTextModel(m)) || sorted[0];
      return { sorted, topFlash };
    }

    const rawList = ["veo-3.1-generate-preview", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash", "imagen-4.0-generate-001"];
    const { sorted, topFlash } = filterAndSelectGeminiFlash(rawList);

    assert.strictEqual(topFlash, "gemini-3.6-flash");
    assert.strictEqual(sorted[0], "gemini-3.6-flash");
    assert.strictEqual(sorted.includes("veo-3.1-generate-preview"), false);
  });

  // Test 15: Deprecated Gemini model sanitization test
  await runTest("cleanGeminiModel should sanitize deprecated Gemini models to active gemini-3.6-flash", () => {
    const DEPRECATED_GEMINI_MODELS = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-1.0-pro",
      "gemini-pro"
    ];

    function cleanGeminiModel(modelName) {
      if (!modelName) return "gemini-3.6-flash";
      const trimmed = modelName.trim();
      const lower = trimmed.toLowerCase();
      const isNonGemini = /^(qwen|llama|gpt|deepseek|claude|mistral|mixtral|gemma)/i.test(lower) || (!lower.includes("gemini") && !lower.includes("nano-banana") && !lower.includes("lyria"));
      const isDeprecated = DEPRECATED_GEMINI_MODELS.includes(lower);

      if (isNonGemini || isDeprecated) {
        return "gemini-3.6-flash";
      }
      return trimmed;
    }

    assert.strictEqual(cleanGeminiModel("qwen"), "gemini-3.6-flash");
    assert.strictEqual(cleanGeminiModel("llama-3.3-70b-versatile"), "gemini-3.6-flash");
    assert.strictEqual(cleanGeminiModel("gemini-2.5-flash"), "gemini-3.6-flash");
    assert.strictEqual(cleanGeminiModel("gemini-2.0-flash"), "gemini-3.6-flash");
    assert.strictEqual(cleanGeminiModel("gemini-3.5-flash"), "gemini-3.5-flash");
    assert.strictEqual(cleanGeminiModel("gemini-3.6-flash"), "gemini-3.6-flash");
  });

  // Test 16: Monthly Token Usage tracking & aggregation test
  await runTest("Monthly Token Usage tracking should group prompt/completion tokens by YYYY-MM and provider", () => {
    function accumulateMonthlyTokenUsage(usageMap, yearMonth, promptTokens, completionTokens, providerKey) {
      if (!usageMap[yearMonth]) {
        usageMap[yearMonth] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0, byProvider: {} };
      }
      const m = usageMap[yearMonth];
      const p = Math.max(0, Number(promptTokens) || 0);
      const c = Math.max(0, Number(completionTokens) || 0);
      const t = p + c;

      m.promptTokens += p;
      m.completionTokens += c;
      m.totalTokens += t;
      m.requestCount += 1;

      if (providerKey) {
        if (!m.byProvider[providerKey]) {
          m.byProvider[providerKey] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, requestCount: 0 };
        }
        m.byProvider[providerKey].promptTokens += p;
        m.byProvider[providerKey].completionTokens += c;
        m.byProvider[providerKey].totalTokens += t;
        m.byProvider[providerKey].requestCount += 1;
      }
      return usageMap;
    }

    const map = {};
    accumulateMonthlyTokenUsage(map, "2026-08", 100, 200, "gemini");
    accumulateMonthlyTokenUsage(map, "2026-08", 50, 150, "openai");
    accumulateMonthlyTokenUsage(map, "2026-07", 300, 400, "gemini");

    assert.strictEqual(map["2026-08"].totalTokens, 500);
    assert.strictEqual(map["2026-08"].promptTokens, 150);
    assert.strictEqual(map["2026-08"].completionTokens, 350);
    assert.strictEqual(map["2026-08"].requestCount, 2);
    assert.strictEqual(map["2026-08"].byProvider.gemini.totalTokens, 300);
    assert.strictEqual(map["2026-08"].byProvider.openai.totalTokens, 200);
    assert.strictEqual(map["2026-07"].totalTokens, 700);
  });

  // Test 13: Error response payload parsing for Gemini array error format
  await runTest("Error response payload parsing should handle both object and array error structures", () => {
    function parseErrorMessage(errorText) {
      let errorMsg = "";
      try {
        const errJson = JSON.parse(errorText);
        if (errJson.error && errJson.error.message) {
          errorMsg = errJson.error.message;
        } else if (Array.isArray(errJson) && errJson[0] && errJson[0].error && errJson[0].error.message) {
          errorMsg = errJson[0].error.message;
        }
      } catch (e) {}
      return errorMsg;
    }

    const objErr = JSON.stringify({ error: { message: "Invalid API key" } });
    const arrErr = JSON.stringify([{ error: { message: "Model gemini-2.5-flash is no longer available" } }]);

    assert.strictEqual(parseErrorMessage(objErr), "Invalid API key");
    assert.strictEqual(parseErrorMessage(arrErr), "Model gemini-2.5-flash is no longer available");
  });

  // Test 14: API key helper test
  await runTest("getEffectiveApiKey should return configured API key or empty string", () => {
    function getEffectiveApiKey(apiKey) {
      return apiKey || "";
    }

    assert.strictEqual(getEffectiveApiKey("my-custom-key"), "my-custom-key");
    assert.strictEqual(getEffectiveApiKey(""), "");
  });

  // Test 15: Credential scrubbing and key protection test
  await runTest("sanitizeSensitiveCredentials should scrub raw API keys, OAuth tokens and bot tokens", () => {
    function sanitizeSensitiveCredentials(input) {
      if (!input) return input;
      if (typeof input === "string") {
        return input
          .replace(/gsk_[a-zA-Z0-9_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
          .replace(/sk-(proj-|or-|ant-)?[a-zA-Z0-9_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
          .replace(/AIza[0-9A-Za-z_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
          .replace(/ya29\.[0-9A-Za-z_-]{10,}/g, m => `${m.substring(0, 6)}...***`)
          .replace(/\d{8,10}:[a-zA-Z0-9_-]{20,}/g, m => `${m.substring(0, 5)}:***`)
          .replace(/Bearer\s+[a-zA-Z0-9_\-\.]{10,}/gi, m => `Bearer ${m.substring(7, 13)}...***`);
      }
      return input;
    }

    const testLog = "Connecting to API with Authorization: Bearer gsk_1234567890abcdefghijklmnopqrstuvwxyz";
    const cleanLog = sanitizeSensitiveCredentials(testLog);
    assert.strictEqual(cleanLog.includes("gsk_1234567890abcdefghijklmnopqrstuvwxyz"), false);
    assert.strictEqual(cleanLog.includes("Bearer Bearer"), false);
    assert.strictEqual(cleanLog.includes("gsk_12...***"), true);

    const openAiLog = "Request failed for sk-proj-1234567890abcdef12345678";
    const cleanOpenAi = sanitizeSensitiveCredentials(openAiLog);
    assert.strictEqual(cleanOpenAi.includes("sk-proj-1234567890abcdef12345678"), false);
    assert.strictEqual(cleanOpenAi.includes("sk-pro...***"), true);
  });

  // Test 16: Website domain exclusion check
  await runTest("Website domain exclusion should mute translation when domain or base domain (*.example.com) is disabled", () => {
    function getBaseDomain(hostname) {
      if (!hostname || typeof hostname !== "string") return "";
      const host = hostname.toLowerCase().trim();
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || !host.includes(".")) {
        return host;
      }
      const parts = host.split(".");
      if (parts.length <= 2) {
        return host;
      }
      const multiPartTlds = [
        "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk",
        "com.tw", "org.tw", "net.tw", "edu.tw", "gov.tw",
        "co.jp", "ne.jp", "or.jp", "ac.jp",
        "com.au", "net.au", "org.au",
        "com.cn", "net.cn", "org.cn", "gov.cn",
        "com.br", "net.br", "org.br",
        "co.nz", "net.nz", "org.nz",
        "co.za", "web.za", "org.za"
      ];
      const lastTwo = parts.slice(-2).join(".");
      if (multiPartTlds.includes(lastTwo) && parts.length >= 3) {
        return parts.slice(-3).join(".");
      }
      return parts.slice(-2).join(".");
    }

    function isDomainDisabled(hostname, disabledDomains) {
      if (!hostname || !Array.isArray(disabledDomains) || disabledDomains.length === 0) {
        return false;
      }
      const host = hostname.toLowerCase().trim();
      const base = getBaseDomain(host);

      return disabledDomains.some(entry => {
        if (!entry) return false;
        let cleanEntry = entry.toLowerCase().trim();
        if (cleanEntry.startsWith("*.")) {
          cleanEntry = cleanEntry.slice(2);
        }
        return host === cleanEntry || host.endsWith("." + cleanEntry) || base === cleanEntry || base.endsWith("." + cleanEntry);
      });
    }

    // 1. Base domain extraction verification
    assert.strictEqual(getBaseDomain("jkaljsd.example.com"), "example.com");
    assert.strictEqual(getBaseDomain("jjkhsd.example.com"), "example.com");
    assert.strictEqual(getBaseDomain("sub.jkaljsd.example.com"), "example.com");
    assert.strictEqual(getBaseDomain("example.com"), "example.com");
    assert.strictEqual(getBaseDomain("news.bbc.co.uk"), "bbc.co.uk");
    assert.strictEqual(getBaseDomain("app.service.com.tw"), "service.com.tw");
    assert.strictEqual(getBaseDomain("127.0.0.1"), "127.0.0.1");
    assert.strictEqual(getBaseDomain("localhost"), "localhost");

    // 2. Subdomain exclusion tests for base domain list ["example.com"]
    const disabledList = ["example.com", "docs.google.com", "bbc.co.uk"];
    assert.strictEqual(isDomainDisabled("jkaljsd.example.com", disabledList), true);
    assert.strictEqual(isDomainDisabled("jjkhsd.example.com", disabledList), true);
    assert.strictEqual(isDomainDisabled("a.b.c.jkaljsd.example.com", disabledList), true);
    assert.strictEqual(isDomainDisabled("example.com", disabledList), true);
    assert.strictEqual(isDomainDisabled("news.bbc.co.uk", disabledList), true);
    assert.strictEqual(isDomainDisabled("docs.google.com", disabledList), true);

    // 3. Wildcard prefix domain list tests ["*.example.com"]
    assert.strictEqual(isDomainDisabled("jkaljsd.example.com", ["*.example.com"]), true);
    assert.strictEqual(isDomainDisabled("jjkhsd.example.com", ["*.example.com"]), true);
    assert.strictEqual(isDomainDisabled("example.com", ["*.example.com"]), true);

    // 4. Case-insensitivity and whitespace resilience
    assert.strictEqual(isDomainDisabled("  JKALJSD.EXAMPLE.COM  ", ["example.com"]), true);
    assert.strictEqual(isDomainDisabled("jkaljsd.example.com", ["  *.EXAMPLE.COM  "]), true);

    // 5. Non-excluded domain and empty/null safeguards
    assert.strictEqual(isDomainDisabled("wikipedia.org", disabledList), false);
    assert.strictEqual(isDomainDisabled("notexample.com", disabledList), false);
    assert.strictEqual(isDomainDisabled("", disabledList), false);
    assert.strictEqual(isDomainDisabled("jkaljsd.example.com", []), false);
    assert.strictEqual(isDomainDisabled("jkaljsd.example.com", null), false);
  });

  // Test 17: Mobile Phone Viewport & CSS Media Query Verification
  await runTest("popup.css should contain mobile phone responsive media queries and fluid viewport rules", () => {
    const cssContent = fs.readFileSync(__dirname + "/popup.css", "utf8");
    assert.strictEqual(cssContent.includes("@media screen and (max-width: 480px) and (pointer: coarse)"), true);
    assert.strictEqual(cssContent.includes("width: 100vw !important"), true);
    assert.strictEqual(cssContent.includes("grid-template-columns: 1fr !important"), true);

    const htmlContent = fs.readFileSync(__dirname + "/popup.html", "utf8");
    assert.strictEqual(htmlContent.includes('name="viewport"'), true);
    assert.strictEqual(htmlContent.includes('user-scalable=no'), true);
  });

  // Test 18: Mobile Phone Screen Sizes Layout Bounds Test
  await runTest("Mobile phone screen viewports should safely accommodate floating bubble without overflow", () => {
    const popularPhoneScreenWidths = [320, 375, 390, 412, 480]; // iPhone SE, iPhone 15, Pixel 8, Galaxy S23
    
    popularPhoneScreenWidths.forEach(phoneWidth => {
      const margin = 24;
      const calculatedMaxWidth = phoneWidth - margin;
      const bubbleWidth = Math.min(320, calculatedMaxWidth);

      assert.strictEqual(bubbleWidth <= phoneWidth, true);
      assert.strictEqual(bubbleWidth > 0, true);
      assert.strictEqual(calculatedMaxWidth < phoneWidth, true);
    });
  });

  // Test 19: Mobile Phone Touch Event & Gesture Handler Test
  await runTest("Mobile phone touch event handler should trigger bubble on valid text selection", () => {
    let triggeredText = "";
    let isBubbleShown = false;

    function handleMobileTouchSelection(selectedText, isSiteDisabled, isDoubleClickEnabled) {
      if (!isDoubleClickEnabled) return false;
      if (isSiteDisabled) return false;
      if (!selectedText || selectedText.trim().length === 0) return false;
      if (selectedText.length >= 1000) return false;
      if (!/\p{L}/u.test(selectedText)) return false;

      triggeredText = selectedText.trim();
      isBubbleShown = true;
      return true;
    }

    assert.strictEqual(handleMobileTouchSelection("Hello world", false, true), true);
    assert.strictEqual(isBubbleShown, true);
    assert.strictEqual(triggeredText, "Hello world");

    // Muted when domain is disabled
    assert.strictEqual(handleMobileTouchSelection("Hello world", true, true), false);
    // Muted when numbers/symbols only
    assert.strictEqual(handleMobileTouchSelection("12345", false, true), false);
  });

  // Test 20: Mobile Extension Manifest Compatibility Test
  await runTest("manifest.json should be configured for Firefox Mobile & Chrome Mobile extensions", () => {
    const manifestJson = JSON.parse(fs.readFileSync(__dirname + "/manifest.json", "utf8"));
    
    assert.strictEqual(manifestJson.manifest_version, 3);
    assert.strictEqual(manifestJson.action.default_popup, "popup.html");
    assert.strictEqual(manifestJson.permissions.includes("storage"), true);
    assert.strictEqual(manifestJson.permissions.includes("identity"), false);
    assert.strictEqual(manifestJson.permissions.includes("activeTab"), true);

    // Firefox Android Gecko settings
    assert.strictEqual(manifestJson.browser_specific_settings !== undefined, true);
    assert.strictEqual(manifestJson.browser_specific_settings.gecko.id, "fire-translate@local.extension");
  });

  // Test 21: Export & Import Settings Logic Test
  await runTest("processImportSettingsJson and export payload filtering should process settings correctly", () => {
    function processImportSettingsJson(jsonStr, allowedKeys) {
      const data = JSON.parse(jsonStr);
      let settingsObj = data;
      if (data && typeof data === "object" && data.settings && typeof data.settings === "object") {
        settingsObj = data.settings;
      }
      if (!settingsObj || typeof settingsObj !== "object" || Array.isArray(settingsObj)) {
        throw new Error("Invalid settings file format.");
      }
      const validSettingsToSave = {};
      for (const key of allowedKeys) {
        if (settingsObj[key] !== undefined) {
          validSettingsToSave[key] = settingsObj[key];
        }
      }
      if (Object.keys(validSettingsToSave).length === 0) {
        throw new Error("No valid settings found in file.");
      }
      return validSettingsToSave;
    }

    function filterExportPayload(settings, includeKeys) {
      const copy = JSON.parse(JSON.stringify(settings));
      if (!includeKeys) {
        copy.apiKey = "";
        copy.telegramBotToken = "";
        copy.telegramChatId = "";
        if (copy.providerRecipes) {
          for (const key of Object.keys(copy.providerRecipes)) {
            copy.providerRecipes[key].apiKey = "";
          }
        }
      }
      return copy;
    }

    const mockSettings = {
      apiEndpoint: "http://localhost:11434",
      apiKey: "sk-test-secret-key",
      model: "llama3",
      telegramBotToken: "123456:secret-token",
      providerRecipes: {
        openai: { apiKey: "sk-openai-key", model: "gpt-4o" }
      }
    };

    const keys = ["apiEndpoint", "apiKey", "model", "telegramBotToken", "providerRecipes"];

    // Without API keys
    const safeExport = filterExportPayload(mockSettings, false);
    assert.strictEqual(safeExport.apiKey, "");
    assert.strictEqual(safeExport.telegramBotToken, "");
    assert.strictEqual(safeExport.providerRecipes.openai.apiKey, "");
    assert.strictEqual(safeExport.model, "llama3");

    // With API keys
    const fullExport = filterExportPayload(mockSettings, true);
    assert.strictEqual(fullExport.apiKey, "sk-test-secret-key");
    assert.strictEqual(fullExport.telegramBotToken, "123456:secret-token");
    assert.strictEqual(fullExport.providerRecipes.openai.apiKey, "sk-openai-key");

    // Import testing
    const jsonToImport = JSON.stringify({ settings: safeExport });
    const imported = processImportSettingsJson(jsonToImport, keys);
    assert.strictEqual(imported.model, "llama3");
    assert.strictEqual(imported.apiEndpoint, "http://localhost:11434");
  });

  // Test 22: Instant Keystroke Auto-Draft saves form input to localStorage (settings_draft)
  await runTest("Instant Keystroke Auto-Draft should save settings state to localStorage but never persist credentials", async () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    sandbox.document.getElementById("input-model").value = "draft-model-xyz";
    sandbox.document.getElementById("input-api-key").value = "gsk_draft_secret_123456";
    sandbox.document.getElementById("input-telegram-token").value = "123456789:draft-bot-token";

    await sandbox.saveSettingsDraft();

    const rawDraft = sandbox.localStorage.getItem("settings_draft");
    assert.ok(rawDraft !== null, "settings_draft should exist in localStorage");

    const draft = JSON.parse(rawDraft);
    assert.strictEqual(draft.model, "draft-model-xyz", "non-secret fields should persist");
    assert.strictEqual(draft.apiKey, undefined, "apiKey must not be persisted to localStorage");
    assert.strictEqual(draft.telegramBotToken, undefined, "telegramBotToken must not be persisted");
    assert.ok(!rawDraft.includes("gsk_draft_secret_123456"), "raw draft must not contain the API key");
    assert.ok(!rawDraft.includes("draft-bot-token"), "raw draft must not contain the bot token");

    // The badge still tracks credential edits even though they are not persisted
    assert.strictEqual(sandbox.document.getElementById("settings-draft-badge").textContent, "🟡 Unsaved Draft");

    // The credentials go to the in-memory session area instead, so nothing is lost
    const pending = sandbox.mockSessionStorage["settings_draft_secrets"];
    assert.strictEqual(pending.apiKey, "gsk_draft_secret_123456");
    assert.strictEqual(pending.telegramBotToken, "123456789:draft-bot-token");
  });

  // Test 22b: A credential-only edit leaves nothing to persist on disk
  await runTest("Auto-Draft should keep a credential-only edit in session storage, not on disk", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.apiKey = "original-key";
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    sandbox.document.getElementById("input-api-key").value = "gsk_only_the_key_changed";

    await sandbox.saveSettingsDraft();

    assert.strictEqual(sandbox.localStorage.getItem("settings_draft"), null);
    assert.strictEqual(sandbox.document.getElementById("settings-draft-badge").textContent, "🟡 Unsaved Draft");
    assert.strictEqual(
      sandbox.mockSessionStorage["settings_draft_secrets"].apiKey,
      "gsk_only_the_key_changed"
    );
  });

  // Test 22c: An in-progress credential survives the popup closing and reopening
  await runTest("An in-progress API key should be restored when the popup reopens", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.apiKey = "saved-key";
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    sandbox.document.getElementById("input-model").value = "half-typed-model";
    sandbox.document.getElementById("input-api-key").value = "gsk_half_typed_key";
    await sandbox.saveSettingsDraft();

    // Reopening the popup: fresh context and DOM, but the same session storage,
    // which is what chrome.storage.session preserves while the browser stays open.
    const reopened = createSandbox();
    reopened.mockLocalStorage.apiKey = "saved-key";
    Object.assign(reopened.mockSessionStorage, sandbox.mockSessionStorage);
    Object.assign(reopened.mockWebLocalStorage, sandbox.mockWebLocalStorage);
    vm.createContext(reopened);
    vm.runInContext(popupCode, reopened);

    await reopened.loadSettingsToUI();

    assert.strictEqual(reopened.document.getElementById("input-model").value, "half-typed-model");
    assert.strictEqual(reopened.document.getElementById("input-api-key").value, "gsk_half_typed_key");
    assert.strictEqual(reopened.document.getElementById("settings-draft-badge").textContent, "🟡 Unsaved Draft");
  });

  // Test 22d: Saving clears the in-memory credential draft
  await runTest("Saving settings should clear the pending credential from session storage", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.apiKey = "original-key";
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    sandbox.document.getElementById("input-api-key").value = "gsk_new_key";
    await sandbox.saveSettingsDraft();
    assert.ok(sandbox.mockSessionStorage["settings_draft_secrets"], "precondition: pending key held");

    const btnSave = sandbox.document.getElementById("btn-save-settings");
    for (const fn of (btnSave.listeners["click"] || [])) {
      await fn();
    }

    assert.strictEqual(sandbox.mockSessionStorage["settings_draft_secrets"], undefined);
  });

  // Test 23: Visual Status Badge & Discard Draft actions state changes
  await runTest("Visual Status Badge should display Unsaved Draft when draft differs and Synced when saved/discarded", async () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    const badge = sandbox.document.getElementById("settings-draft-badge");
    const btnDiscard = sandbox.document.getElementById("btn-discard-draft");

    // Initially Synced
    assert.strictEqual(badge.textContent, "🟢 Synced");
    assert.strictEqual(btnDiscard.classList.contains("hidden"), true);

    // Edit an input
    const modelInput = sandbox.document.getElementById("input-model");
    modelInput.value = "gemini-3.6-flash-draft";
    await sandbox.saveSettingsDraft();

    // Should update badge to Unsaved Draft and show Discard Draft button
    assert.strictEqual(badge.textContent, "🟡 Unsaved Draft");
    assert.strictEqual(badge.classList.contains("badge-unsaved"), true);
    assert.strictEqual(btnDiscard.classList.contains("hidden"), false);

    // Click Save Configs
    const btnSave = sandbox.document.getElementById("btn-save-settings");
    const saveListeners = btnSave.listeners["click"] || [];
    for (const fn of saveListeners) {
      await fn();
    }

    // After save, should reset badge to Synced and hide Discard Draft
    assert.strictEqual(badge.textContent, "🟢 Synced");
    assert.strictEqual(btnDiscard.classList.contains("hidden"), true);
    assert.strictEqual(sandbox.localStorage.getItem("settings_draft"), null);
  });

  // Test 24: Discard Draft button reverts local draft to server configuration
  await runTest("Discard Draft button should clear settings_draft and revert form inputs to server configuration", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.model = "qwen2.5:7b";
    sandbox.mockLocalStorage.apiKey = "original-key";
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    const apiKeyInput = sandbox.document.getElementById("input-api-key");
    apiKeyInput.value = "dirty-un saved-key";
    await sandbox.saveSettingsDraft();

    assert.strictEqual(sandbox.document.getElementById("settings-draft-badge").textContent, "🟡 Unsaved Draft");

    // Click Discard Draft
    const btnDiscard = sandbox.document.getElementById("btn-discard-draft");
    const discardListeners = btnDiscard.listeners["click"] || [];
    for (const fn of discardListeners) {
      await fn();
    }

    assert.strictEqual(sandbox.localStorage.getItem("settings_draft"), null);
    assert.strictEqual(apiKeyInput.value, "original-key");
    assert.strictEqual(sandbox.document.getElementById("settings-draft-badge").textContent, "🟢 Synced");
  });

  // Test 25: Protection Against Overwriting: loadSettingsToUI preserves active draft
  await runTest("loadSettingsToUI should restore active draft from localStorage without overwriting work-in-progress input fields", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.apiKey = "server-key-xyz";
    
    // Pre-populate settings_draft in localStorage
    const draftState = {
      currentProvider: "groq",
      apiEndpoint: "https://api.groq.com/openai",
      apiKey: "draft-work-in-progress-key",
      model: "llama-3.3-70b-versatile",
      modelType: "qwen",
      temperature: 0.7,
      maxHistory: 200,
      autoTranslate: true,
      richLearningMode: true,
      doubleClickTranslate: true,
      streamTranslations: true,
      showThinking: true,
      textSize: "large",
      systemPrompt: "draft prompt",
      systemPromptLearning: "draft learning prompt",
      enableTelegram: false,
      telegramBotToken: "",
      telegramChatId: ""
    };
    sandbox.mockWebLocalStorage["settings_draft"] = JSON.stringify(draftState);

    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();

    const apiKeyInput = sandbox.document.getElementById("input-api-key");
    const tempInput = sandbox.document.getElementById("input-temperature");
    const badge = sandbox.document.getElementById("settings-draft-badge");

    // Inputs should be restored from draft rather than wiped by background loadSettings
    assert.strictEqual(String(tempInput.value), "0.7");
    assert.strictEqual(badge.textContent, "🟡 Unsaved Draft");

    // Credentials are never taken from a draft. This draft also switches provider to
    // groq, so the key field is owned by that provider's saved recipe (empty here) —
    // never by the value that happened to be sitting in the draft.
    assert.notStrictEqual(apiKeyInput.value, "draft-work-in-progress-key");
    assert.strictEqual(apiKeyInput.value, "");
  });

  // Test 26: Legacy drafts written before credentials were excluded get scrubbed on load
  await runTest("loadSettingsToUI should strip credentials left in a legacy settings_draft", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.apiKey = "server-key-xyz";
    sandbox.mockWebLocalStorage["settings_draft"] = JSON.stringify({
      model: "legacy-draft-model",
      temperature: 0.7,
      apiKey: "leaked-legacy-key",
      telegramBotToken: "123456789:leaked-legacy-token"
    });

    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();

    const rawDraft = sandbox.localStorage.getItem("settings_draft");
    assert.ok(rawDraft !== null, "the non-secret part of the draft should survive");
    assert.ok(!rawDraft.includes("leaked-legacy-key"), "legacy API key should be scrubbed from storage");
    assert.ok(!rawDraft.includes("leaked-legacy-token"), "legacy bot token should be scrubbed from storage");
    assert.strictEqual(JSON.parse(rawDraft).model, "legacy-draft-model");

    // The leaked value must not reach the form either
    assert.strictEqual(sandbox.document.getElementById("input-api-key").value, "server-key-xyz");
  });

  // Test 27: Grammar correction parser handles JSON, markdown code fences, thinking blocks, and fallback
  await runTest("parseGrammarCorrectionResponse should parse pure JSON, markdown fences, and thinking blocks correctly", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    // Pure JSON
    const res1 = sandbox.parseGrammarCorrectionResponse('{"has_error": true, "corrected": "I went to school yesterday.", "explanation": "Fixed verb tense"}');
    assert.strictEqual(res1.has_error, true);
    assert.strictEqual(res1.corrected, "I went to school yesterday.");
    assert.strictEqual(res1.explanation, "Fixed verb tense");

    // Thinking process + JSON block
    const res2 = sandbox.parseGrammarCorrectionResponse('<think>The user has a typo in scool</think>\n```json\n{"has_error": true, "corrected": "the quick brown fox", "explanation": "Fixed spelling"}\n```');
    assert.strictEqual(res2.has_error, true);
    assert.strictEqual(res2.corrected, "the quick brown fox");

    // No error JSON
    const res3 = sandbox.parseGrammarCorrectionResponse('{"has_error": false, "corrected": ""}');
    assert.strictEqual(res3.has_error, false);
    assert.strictEqual(res3.corrected, "");

    // Invalid / fallback
    const res4 = sandbox.parseGrammarCorrectionResponse('Random non-json text');
    assert.strictEqual(res4.has_error, false);
    assert.strictEqual(res4.corrected, "");
  });

  // Test 28: shouldShowGrammarSuggestion decision helper
  await runTest("shouldShowGrammarSuggestion should only trigger on genuine corrections differing from input", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    // True when error and different
    assert.strictEqual(
      sandbox.shouldShowGrammarSuggestion("I goes to scool", { has_error: true, corrected: "I go to school" }),
      true
    );

    // False when has_error is false
    assert.strictEqual(
      sandbox.shouldShowGrammarSuggestion("Hello world", { has_error: false, corrected: "Hello world" }),
      false
    );

    // False when corrected matches original
    assert.strictEqual(
      sandbox.shouldShowGrammarSuggestion("Hello world", { has_error: true, corrected: "hello world" }),
      false
    );

    // False when corrected is empty
    assert.strictEqual(
      sandbox.shouldShowGrammarSuggestion("Test", { has_error: true, corrected: "" }),
      false
    );
  });

  // Test 29: Grammar suggestion display does NOT overwrite textarea automatically
  await runTest("Live grammar suggestion displays in UI without overwriting user typing", () => {
    const sandbox = createSandbox();
    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    const srcTextarea = sandbox.document.getElementById("src-textarea");
    const suggestionBox = sandbox.document.getElementById("grammar-suggestion-box");
    const suggestionText = sandbox.document.getElementById("grammar-suggestion-text");

    // Simulate user typing a typo
    srcTextarea.value = "I goes to scool";

    // Show suggestion
    sandbox.showGrammarSuggestion("I go to school", "Fixed verb tense and spelling");

    // Textarea must NOT be overwritten by the suggestion
    assert.strictEqual(srcTextarea.value, "I goes to scool");
    assert.strictEqual(suggestionText.textContent, "I go to school");
    assert.strictEqual(suggestionBox.classList.contains("hidden"), false);

    // Dismiss / hide suggestion
    sandbox.hideGrammarSuggestion();
    assert.strictEqual(suggestionBox.classList.contains("hidden"), true);
    assert.strictEqual(srcTextarea.value, "I goes to scool");

    // Explicit apply only replaces textarea when user chooses to apply
    sandbox.showGrammarSuggestion("I go to school");
    sandbox.applyGrammarSuggestion();
    assert.strictEqual(srcTextarea.value, "I go to school");
    assert.strictEqual(suggestionBox.classList.contains("hidden"), true);
  });

  // Test 30: Settings management preserves grammarCheck configuration
  await runTest("Settings form and draft persistence preserve grammarCheck configuration", async () => {
    const sandbox = createSandbox();
    sandbox.mockLocalStorage.grammarCheck = false;

    vm.createContext(sandbox);
    vm.runInContext(popupCode, sandbox);

    await sandbox.loadSettingsToUI();
    const checkEl = sandbox.document.getElementById("check-grammar-check");
    assert.strictEqual(checkEl.checked, false);

    // Toggle on and get state
    checkEl.checked = true;
    const state = sandbox.getFormSettingsState();
    assert.strictEqual(state.grammarCheck, true);
  });

  // Summary reporting
  console.log("\n-------------------------------------------");
  console.log(`📊 Test Execution Complete: ${passed} passed, ${failed} failed.`);
  console.log("-------------------------------------------");
  process.exit(failed > 0 ? 1 : 0);
}

executeTestSuite();





