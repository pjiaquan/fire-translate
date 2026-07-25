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
    assert.strictEqual(formatChatEndpointUrl("https://api.deepseek.com/v1/chat/completions"), "https://api.deepseek.com/v1/chat/completions");
    assert.strictEqual(formatChatEndpointUrl("http://192.168.3.202:4090/"), "http://192.168.3.202:4090/v1/chat/completions");
  });

  // Test 12: Provider recipes configuration validation
  await runTest("Provider recipes preset list should contain expected standard providers and default models", () => {
    const DEFAULT_RECIPES = {
      groq: { name: "Groq Cloud", endpoint: "https://api.groq.com/openai", model: "llama-3.3-70b-versatile" },
      openai: { name: "OpenAI", endpoint: "https://api.openai.com", model: "gpt-4o-mini" },
      deepseek: { name: "DeepSeek API", endpoint: "https://api.deepseek.com", model: "deepseek-chat" },
      ollama: { name: "Ollama Local", endpoint: "http://localhost:11434", model: "qwen2.5:7b" }
    };

    assert.strictEqual(DEFAULT_RECIPES.groq.model, "llama-3.3-70b-versatile");
    assert.strictEqual(DEFAULT_RECIPES.openai.model, "gpt-4o-mini");
    assert.strictEqual(DEFAULT_RECIPES.deepseek.model, "deepseek-chat");
    assert.strictEqual(DEFAULT_RECIPES.ollama.endpoint, "http://localhost:11434");
  });

  // Test 14: Google OAuth fallback helper test
  await runTest("Google OAuth token should act as API key fallback when apiKey is empty", () => {
    function getEffectiveApiKey(apiKey, googleOAuthToken) {
      return apiKey || googleOAuthToken || "";
    }

    assert.strictEqual(getEffectiveApiKey("my-custom-key", "oauth-token-123"), "my-custom-key");
    assert.strictEqual(getEffectiveApiKey("", "oauth-token-123"), "oauth-token-123");
    assert.strictEqual(getEffectiveApiKey("", ""), "");
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
  await runTest("Website domain exclusion should mute translation when domain is disabled", () => {
    function isDomainDisabled(hostname, disabledDomains) {
      return (disabledDomains || []).includes(hostname);
    }

    const disabledList = ["github.com", "docs.google.com"];
    assert.strictEqual(isDomainDisabled("github.com", disabledList), true);
    assert.strictEqual(isDomainDisabled("docs.google.com", disabledList), true);
    assert.strictEqual(isDomainDisabled("wikipedia.org", disabledList), false);
  });

  // Summary reporting
  console.log("\n-------------------------------------------");
  console.log(`📊 Test Execution Complete: ${passed} passed, ${failed} failed.`);
  console.log("-------------------------------------------");
  process.exit(failed > 0 ? 1 : 0);
}

executeTestSuite();




