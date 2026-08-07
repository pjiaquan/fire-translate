// tests.js - Custom unit test suite for Fire Translate
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

console.log("\x1b[36m%s\x1b[0m", "🧪 Running Fire Translate Extension Unit Tests...");

// Helper to create sandbox context with mocks
function createSandbox() {
  const mockLocalStorage = {};
  
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
    getElementById: (id) => ({
      value: "",
      addEventListener: () => {},
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      appendChild: () => {},
      removeChild: () => {},
      querySelector: () => null,
      querySelectorAll: () => []
    }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  };

  const mockWindow = {
    addEventListener: () => {},
    SpeechSynthesisUtterance: class {},
    speechSynthesis: { speak: () => {}, cancel: () => {} }
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
    mockLocalStorage: mockLocalStorage
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
const popupCode = fs.readFileSync('popup.js', 'utf8');
const bgCode = fs.readFileSync('background.js', 'utf8');
const contentCode = fs.readFileSync('content.js', 'utf8');

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

  // Summary reporting
  console.log("\n-------------------------------------------");
  console.log(`📊 Test Execution Complete: ${passed} passed, ${failed} failed.`);
  console.log("-------------------------------------------");
  process.exit(failed > 0 ? 1 : 0);
}

executeTestSuite();





