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
