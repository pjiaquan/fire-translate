export function createBrowserManifest(manifest, browser = "chrome") {
  const result = structuredClone(manifest);
  if (browser === "firefox") {
    result.background = { scripts: ["shared.js", "background.js"] };
    delete result.minimum_chrome_version;
    result.permissions = result.permissions.filter(permission => permission !== "sidePanel");
    delete result.side_panel;
  } else if (browser !== "chrome") {
    throw new Error(`Unsupported browser target: ${browser}`);
  }
  return result;
}
