export function createBrowserManifest(manifest, browser = "chrome") {
  const result = structuredClone(manifest);
  if (browser === "firefox") {
    result.browser_specific_settings.gecko.data_collection_permissions = {
      required: ["websiteContent", "authenticationInfo", "personalCommunications"]
    };
    // These versions show Firefox's built-in data transmission consent prompt.
    result.browser_specific_settings.gecko.strict_min_version = "140.0";
    result.browser_specific_settings.gecko_android = { strict_min_version: "142.0" };
    result.background = { scripts: ["shared.js", "background.js"] };
    result.permissions = result.permissions.filter(permission => permission !== "sidePanel");
    delete result.side_panel;
  } else if (browser !== "chrome") {
    throw new Error(`Unsupported browser target: ${browser}`);
  }
  return result;
}
