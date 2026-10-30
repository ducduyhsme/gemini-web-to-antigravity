// Gemini Web to API - Background Service Worker
// Manages auto-sync on cookie rotation and background tasks

const DEFAULT_PORT = 4981;
const DEFAULT_HOST = "http://127.0.0.1";
const DEFAULT_API_KEY = "gemini-cookie-sync";

let debounceTimer = null;

// Listen for cookie change events
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  const { cookie, removed } = changeInfo;
  if (removed) return;

  // Watch for __Secure-1PSIDTS updates on google.com or gemini.google.com
  if (cookie.name === "__Secure-1PSIDTS" && cookie.domain.includes("google.com")) {
    const config = await chrome.storage.local.get([
      "autoSync",
      "serverPort",
      "serverHost",
      "apiKey",
      "accountName"
    ]);

    if (!config.autoSync) return;

    console.log("[Gemini Cookie Sync] Detected __Secure-1PSIDTS rotation, scheduling auto-sync...");

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce 4 seconds to allow all related cookies (like SIDCC, PSIDCC) to settle
    debounceTimer = setTimeout(async () => {
      await performBackgroundSync(config);
    }, 4000);
  }
});

async function performBackgroundSync(config) {
  const host = config.serverHost || DEFAULT_HOST;
  const port = config.serverPort || DEFAULT_PORT;
  const apiKey = config.apiKey || DEFAULT_API_KEY;
  const accName = config.accountName || `Port ${port}`;

  try {
    const [urlCookies, geminiDomainCookies, googleDomainCookies] = await Promise.all([
      chrome.cookies.getAll({ url: "https://gemini.google.com" }),
      chrome.cookies.getAll({ domain: "gemini.google.com" }),
      chrome.cookies.getAll({ domain: "google.com" })
    ]);

    const cookieMap = new Map();
    for (const list of [googleDomainCookies, geminiDomainCookies, urlCookies]) {
      for (const c of list) {
        if (c && c.name) {
          cookieMap.set(c.name, c.value);
        }
      }
    }

    const psid = cookieMap.get("__Secure-1PSID");
    const psidts = cookieMap.get("__Secure-1PSIDTS");

    if (!psid || !psidts) {
      console.warn("[Gemini Cookie Sync] Missing essential cookies, skipping auto-sync.");
      return;
    }

    const pairs = [];
    for (const [name, val] of cookieMap.entries()) {
      pairs.push(`${name}=${val}`);
    }
    const cookieHeader = pairs.join("; ");

    const resp = await fetch(`${host}:${port}/admin/cookies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ cookies: cookieHeader })
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      console.log(`[Gemini Cookie Sync] Auto-sync success for ${accName} on Port ${port}:`, data.status);

      chrome.action.setBadgeText({ text: "OK" });
      chrome.action.setBadgeBackgroundColor({ color: "#34a853" });

      if (data.status === "updated") {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icons/icon48.png",
          title: "Gemini Cookie Sync",
          message: `Cookie cho tài khoản ${accName} (Port ${port}) đã được tự động đồng bộ thành công!`
        });
      }

      // Reset badge after 10s
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 10000);
    } else {
      console.warn(`[Gemini Cookie Sync] Auto-sync rejected (status ${resp.status})`);
      chrome.action.setBadgeText({ text: "ERR" });
      chrome.action.setBadgeBackgroundColor({ color: "#ea4335" });
    }
  } catch (err) {
    console.error("[Gemini Cookie Sync] Auto-sync failed (network/offline):", err);
  }
}
