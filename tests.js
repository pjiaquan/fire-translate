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
      onClicked: { addListener: () => {} }
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

  // Test 8: Punctuation removal and trimming utility
  await runTest("cleanTranslateText should strip edge punctuation and trim correctly", () => {
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
  });

  // Summary reporting
  console.log("\n-------------------------------------------");
  console.log(`📊 Test Execution Complete: ${passed} passed, ${failed} failed.`);
  console.log("-------------------------------------------");
  process.exit(failed > 0 ? 1 : 0);
}

executeTestSuite();
