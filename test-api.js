// test-api.js - Direct local API translation verification script
const apiEndpoint = "http://192.168.3.202:4090";
const srcText = "example";
const targetLang = "zh-TW";

function getGemmaLangCode(lang) {
  if (!lang) return "en";
  if (lang === "auto") return "en";
  if (lang === "zh-TW" || lang === "繁體中文" || lang === "zh-Hant") return "zh_Hant";
  if (lang === "zh-CN" || lang === "簡體中文" || lang === "zh-Hans") return "zh_Hans";
  return lang;
}

async function runTest() {
  // Let's test the standard string prompt for TranslateGemma
  const gemmaPrompt = `Translate this to ${getGemmaLangCode(targetLang)}:\n${srcText}`;
  const payload = {
    model: "qwen",
    messages: [
      { role: "user", content: gemmaPrompt }
    ],
    temperature: 0.0
  };

  const url = `${apiEndpoint.replace(/\/$/, "")}/v1/chat/completions`;
  console.log(`Sending translation request to: ${url}`);
  console.log(`Prompt: "${gemmaPrompt}"`);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      const translatedText = data.choices[0].message.content.trim();
      console.log(`\nResponse received: "${translatedText}"`);
      
      const expected = "範例";
      if (translatedText.includes(expected) || translatedText.includes("例子")) {
        console.log(`\n\x1b[32m✔ SUCCESS: Translation matches expected value!\x1b[0m`);
      } else {
        console.log(`\n\x1b[31m✘ FAILURE: Expected "${expected}", but got "${translatedText}"\x1b[0m`);
      }
    } else {
      console.log("\n\x1b[31m✘ FAILURE: Invalid response format from server\x1b[0m", JSON.stringify(data));
    }
  } catch (err) {
    console.error("\n\x1b[31m✘ ERROR during fetch:\x1b[0m", err.message);
  }
}

runTest();
