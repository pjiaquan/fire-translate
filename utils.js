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

function formatModelsEndpointUrl(apiEndpoint) {
  if (!apiEndpoint) return "http://192.168.3.202:4090/v1/models";
  let clean = apiEndpoint.trim().replace(/\/$/, "");
  if (clean.endsWith("/chat/completions")) {
    clean = clean.replace(/\/chat\/completions$/, "");
  }
  if (clean.endsWith("/v1")) {
    return `${clean}/models`;
  }
  return `${clean}/v1/models`;
}
