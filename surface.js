// Tags <html> with the surface this page renders in, before first paint, so
// popup.css can give the action popup a fixed size and let the side panel fill
// its viewport. Loaded synchronously from <head>; CSP forbids inline scripts.
(function () {
  let surface = "panel";
  try {
    const popups = chrome.extension.getViews({ type: "popup" });
    if (popups.includes(window)) surface = "popup";
  } catch (err) {
    // Not running as an extension page; keep the fluid layout.
  }
  document.documentElement.dataset.surface = surface;
})();
