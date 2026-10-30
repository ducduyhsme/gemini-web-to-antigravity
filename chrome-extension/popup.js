// Gemini Web to API - Cookie Sync Extension
// Popup controller script

const DEFAULT_PORT = 4981;
const DEFAULT_HOST = "http://127.0.0.1";
const DEFAULT_API_KEY = "gemini-cookie-sync";

// DOM Elements
const el = {
  accountName: document.getElementById("accountName"),
  serverPort: document.getElementById("serverPort"),
  serverHost: document.getElementById("serverHost"),
  apiKey: document.getElementById("apiKey"),
  autoSyncToggle: document.getElementById("autoSyncToggle"),
  btnToggleApiKey: document.getElementById("btnToggleApiKey"),
  
  serverStatusBadge: document.getElementById("serverStatusBadge"),
  serverStatusText: document.getElementById("serverStatusText"),
  connectionSummary: document.getElementById("connectionSummary"),
  
  btnScanPorts: document.getElementById("btnScanPorts"),
  scanResultBox: document.getElementById("scanResultBox"),
  scanList: document.getElementById("scanList"),
  
  btnRefreshCookies: document.getElementById("btnRefreshCookies"),
  valPsid: document.getElementById("valPsid"),
  valPsidts: document.getElementById("valPsidts"),
  cookieCount: document.getElementById("cookieCount"),
  cookieExpiry: document.getElementById("cookieExpiry"),
  cookieWarning: document.getElementById("cookieWarning"),
  btnOpenGemini: document.getElementById("btnOpenGemini"),
  
  liveServerCard: document.getElementById("liveServerCard"),
  infoPort: document.getElementById("infoPort"),
  serverFingerprint: document.getElementById("serverFingerprint"),
  serverLastUpdated: document.getElementById("serverLastUpdated"),
  
  btnSync: document.getElementById("btnSync"),
  btnSyncText: document.getElementById("btnSyncText"),
  btnCopyCookie: document.getElementById("btnCopyCookie"),
  btnOpenDocs: document.getElementById("btnOpenDocs"),
  toastMessage: document.getElementById("toastMessage")
};

// Current State
let cachedCookies = null;
let isCheckingServer = false;

// 1. Initialize
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  setupEventListeners();
  await refreshCookies();
  await checkServerStatus();
});

// 2. Load & Save Settings (Scoped per Chrome Profile via chrome.storage.local)
async function loadSettings() {
  const data = await chrome.storage.local.get([
    "accountName",
    "serverPort",
    "serverHost",
    "apiKey",
    "autoSync"
  ]);

  el.accountName.value = data.accountName || "";
  el.serverPort.value = data.serverPort || DEFAULT_PORT;
  el.serverHost.value = data.serverHost || DEFAULT_HOST;
  el.apiKey.value = data.apiKey || DEFAULT_API_KEY;
  el.autoSyncToggle.checked = Boolean(data.autoSync);
}

async function saveSettings() {
  await chrome.storage.local.set({
    accountName: el.accountName.value.trim(),
    serverPort: parseInt(el.serverPort.value, 10) || DEFAULT_PORT,
    serverHost: el.serverHost.value.trim() || DEFAULT_HOST,
    apiKey: el.apiKey.value.trim() || DEFAULT_API_KEY,
    autoSync: el.autoSyncToggle.checked
  });
}

// 3. Event Listeners
function setupEventListeners() {
  // Auto save on inputs change
  el.accountName.addEventListener("input", saveSettings);
  el.serverHost.addEventListener("change", async () => {
    await saveSettings();
    await checkServerStatus();
  });
  el.apiKey.addEventListener("change", async () => {
    await saveSettings();
    await checkServerStatus();
  });
  el.serverPort.addEventListener("change", async () => {
    await saveSettings();
    await checkServerStatus();
  });
  el.autoSyncToggle.addEventListener("change", async () => {
    await saveSettings();
    showToast(
      el.autoSyncToggle.checked
        ? "✅ Đã bật tự động đồng bộ ngầm khi Google cấp cookie mới!"
        : "ℹ️ Đã tắt tự động đồng bộ ngầm.",
      "info"
    );
  });

  // Toggle API Key view
  el.btnToggleApiKey.addEventListener("click", () => {
    const isPassword = el.apiKey.type === "password";
    el.apiKey.type = isPassword ? "text" : "password";
    el.btnToggleApiKey.textContent = isPassword ? "🙈" : "👁️";
  });

  // Buttons
  el.btnRefreshCookies.addEventListener("click", async () => {
    await refreshCookies();
    showToast("🔄 Đã quét lại cookie trình duyệt!", "info");
  });

  el.btnOpenGemini.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://gemini.google.com" });
  });

  el.btnOpenDocs.addEventListener("click", () => {
    const host = el.serverHost.value.trim() || DEFAULT_HOST;
    const port = el.serverPort.value || DEFAULT_PORT;
    chrome.tabs.create({ url: `${host}:${port}/docs` });
  });

  el.btnCopyCookie.addEventListener("click", copyCookieHeader);
  el.btnSync.addEventListener("click", syncCookiesNow);
  el.btnScanPorts.addEventListener("click", scanActivePorts);
}

// 4. Extract Gemini Cookies
async function getGeminiCookies() {
  try {
    const [urlCookies, geminiDomainCookies, googleDomainCookies] = await Promise.all([
      chrome.cookies.getAll({ url: "https://gemini.google.com" }),
      chrome.cookies.getAll({ domain: "gemini.google.com" }),
      chrome.cookies.getAll({ domain: "google.com" })
    ]);

    const cookieMap = new Map();
    // Prioritize domain-wide first, then host-specific, then exact url matches
    for (const list of [googleDomainCookies, geminiDomainCookies, urlCookies]) {
      for (const c of list) {
        if (c && c.name) {
          cookieMap.set(c.name, c.value);
        }
      }
    }

    const psid = cookieMap.get("__Secure-1PSID") || "";
    const psidts = cookieMap.get("__Secure-1PSIDTS") || "";
    const hasEssential = Boolean(psid && psidts);

    // Format full Cookie Header string: "key1=val1; key2=val2"
    const pairs = [];
    for (const [name, val] of cookieMap.entries()) {
      pairs.push(`${name}=${val}`);
    }
    const cookieHeader = pairs.join("; ");

    return {
      cookieHeader,
      psid,
      psidts,
      count: cookieMap.size,
      hasEssential
    };
  } catch (err) {
    console.error("Failed to get cookies:", err);
    return {
      cookieHeader: "",
      psid: "",
      psidts: "",
      count: 0,
      hasEssential: false,
      error: err.message
    };
  }
}

// 5. Update Cookie UI
async function refreshCookies() {
  cachedCookies = await getGeminiCookies();

  if (cachedCookies.hasEssential) {
    el.valPsid.textContent = `...${cachedCookies.psid.slice(-10)}`;
    el.valPsid.className = "cookie-val val-detected";

    el.valPsidts.textContent = `...${cachedCookies.psidts.slice(-10)}`;
    el.valPsidts.className = "cookie-val val-detected";

    el.cookieCount.textContent = `${cachedCookies.count} cookie Google tìm thấy`;
    el.cookieExpiry.textContent = "Trạng thái: Đã đăng nhập ✅";
    el.cookieWarning.classList.add("hidden");
    el.btnSync.disabled = false;
  } else {
    el.valPsid.textContent = cachedCookies.psid ? `...${cachedCookies.psid.slice(-8)}` : "❌ Thiếu";
    el.valPsid.className = cachedCookies.psid ? "cookie-val val-detected" : "cookie-val val-missing";

    el.valPsidts.textContent = cachedCookies.psidts ? `...${cachedCookies.psidts.slice(-8)}` : "❌ Thiếu";
    el.valPsidts.className = cachedCookies.psidts ? "cookie-val val-detected" : "cookie-val val-missing";

    el.cookieCount.textContent = `${cachedCookies.count} cookie tìm thấy`;
    el.cookieExpiry.textContent = "Trạng thái: Chưa đủ thông tin ⚠️";
    el.cookieWarning.classList.remove("hidden");
  }
}

// 6. Check Server Connection and Cookie Status
async function checkServerStatus() {
  if (isCheckingServer) return;
  isCheckingServer = true;

  const host = el.serverHost.value.trim() || DEFAULT_HOST;
  const port = parseInt(el.serverPort.value, 10) || DEFAULT_PORT;
  const apiKey = el.apiKey.value.trim() || DEFAULT_API_KEY;

  updateServerBadge("checking", "Đang kiểm tra...");
  el.connectionSummary.textContent = `Đang kết nối Port ${port}...`;

  try {
    // 1. Health check
    const healthController = new AbortController();
    const timeoutId = setTimeout(() => healthController.abort(), 2000);
    const healthResp = await fetch(`${host}:${port}/health`, {
      method: "GET",
      signal: healthController.signal
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (!healthResp || !healthResp.ok) {
      updateServerBadge("offline", `Offline (${port})`);
      el.connectionSummary.textContent = `🔴 Offline trên cổng ${port}`;
      el.liveServerCard.classList.add("hidden");
      isCheckingServer = false;
      return;
    }

    // 2. Cookie admin status check
    const adminController = new AbortController();
    const adminTimeout = setTimeout(() => adminController.abort(), 2000);
    const adminResp = await fetch(`${host}:${port}/admin/cookies`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      signal: adminController.signal
    }).catch(() => null);
    clearTimeout(adminTimeout);

    if (adminResp && adminResp.ok) {
      const data = await adminResp.json();
      updateServerBadge("online", `Online (${port})`);
      el.connectionSummary.textContent = `🟢 Đang chạy (Port ${port})`;

      el.infoPort.textContent = port;
      el.serverFingerprint.textContent = data.psid_fingerprint || "Active";
      
      if (data.updated_at) {
        const d = new Date(data.updated_at);
        el.serverLastUpdated.textContent = d.toLocaleTimeString() + " " + d.toLocaleDateString();
      } else {
        el.serverLastUpdated.textContent = "Từ file cấu hình .env";
      }

      el.liveServerCard.classList.remove("hidden");
    } else if (adminResp && adminResp.status === 401) {
      updateServerBadge("checking", `Sai Key (${port})`);
      el.connectionSummary.textContent = `⚠️ Sai API Key (401)`;
      el.liveServerCard.classList.add("hidden");
    } else {
      updateServerBadge("online", `Online (${port})`);
      el.connectionSummary.textContent = `🟢 Online (Port ${port})`;
      el.liveServerCard.classList.add("hidden");
    }
  } catch (err) {
    updateServerBadge("offline", `Offline (${port})`);
    el.connectionSummary.textContent = `🔴 Không kết nối được`;
    el.liveServerCard.classList.add("hidden");
  } finally {
    isCheckingServer = false;
  }
}

function updateServerBadge(status, text) {
  el.serverStatusBadge.className = `badge badge-${status}`;
  el.serverStatusText.textContent = text;
}

// 7. Sync Cookies to Server
async function syncCookiesNow() {
  if (!cachedCookies || !cachedCookies.hasEssential) {
    await refreshCookies();
    if (!cachedCookies.hasEssential) {
      showToast("⚠️ Profile này chưa đăng nhập Google Gemini! Vui lòng mở Gemini Web và đăng nhập.", "error");
      return;
    }
  }

  const host = el.serverHost.value.trim() || DEFAULT_HOST;
  const port = parseInt(el.serverPort.value, 10) || DEFAULT_PORT;
  const apiKey = el.apiKey.value.trim() || DEFAULT_API_KEY;

  // Set loading UI
  el.btnSync.disabled = true;
  el.btnSyncText.textContent = "ĐANG ĐỒNG BỘ...";

  try {
    const response = await fetch(`${host}:${port}/admin/cookies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        cookies: cachedCookies.cookieHeader
      })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      if (data.status === "updated") {
        showToast(`🎉 Đồng bộ thành công! Session Google Gemini mới đã có hiệu lực trên Port ${port} (Không cần restart server).`, "success");
      } else if (data.status === "noop") {
        showToast(`⚡ Cookie trên Port ${port} đã là mới nhất (__Secure-1PSIDTS trùng khớp), không cần cập nhật.`, "info");
      } else {
        showToast(`✅ Server phản hồi: ${data.status || "OK"}`, "success");
      }
      await checkServerStatus();
    } else {
      if (response.status === 401) {
        showToast(`🔒 Lỗi 401: Sai Cookie API Key! Vui lòng kiểm tra lại GEMINI_COOKIE_API_KEY trong cấu hình.`, "error");
      } else if (response.status === 400) {
        showToast(`❌ Lỗi 400: ${data.error || "Cookie bị Google từ chối hoặc thiếu trường bắt buộc."}`, "error");
      } else if (response.status === 502) {
        showToast(`⚠️ Lỗi 502: Không thể xác thực cookie với Google. Kiểm tra lại mạng hoặc mở Gemini Web xác thực lại.`, "error");
      } else {
        showToast(`❌ Lỗi (${response.status}): ${data.error || "Đồng bộ thất bại."}`, "error");
      }
    }
  } catch (err) {
    console.error("Sync error:", err);
    showToast(
      `🔌 Không thể kết nối tới server tại ${host}:${port}. Hãy chạy start.bat (mục [1] hoặc [2]) để khởi động tài khoản này!`,
      "error"
    );
  } finally {
    el.btnSync.disabled = false;
    el.btnSyncText.textContent = "ĐỒNG BỘ COOKIE NGAY";
  }
}

// 8. Copy Cookie Header to Clipboard
async function copyCookieHeader() {
  if (!cachedCookies || !cachedCookies.cookieHeader) {
    await refreshCookies();
  }

  if (!cachedCookies || !cachedCookies.cookieHeader) {
    showToast("⚠️ Không có cookie nào để sao chép!", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(cachedCookies.cookieHeader);
    showToast("📋 Đã sao chép toàn bộ Cookie Header vào bộ nhớ tạm! Bạn có thể dán vào manager.ps1 (mục [4]) hoặc file .env.", "success");
  } catch (err) {
    showToast("❌ Không thể ghi vào clipboard: " + err.message, "error");
  }
}

// 9. Scan Active Ports (4981 - 4990)
async function scanActivePorts() {
  const host = el.serverHost.value.trim() || DEFAULT_HOST;
  el.btnScanPorts.disabled = true;
  el.btnScanPorts.textContent = "Đang dò...";
  el.scanResultBox.classList.remove("hidden");
  el.scanList.innerHTML = "<div class='scan-title'>Đang quét từ cổng 4981 đến 4990...</div>";

  const foundPorts = [];
  const startPort = 4981;
  const endPort = 4990;

  for (let p = startPort; p <= endPort; p++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 400);
      const res = await fetch(`${host}:${p}/health`, { method: "GET", signal: controller.signal });
      clearTimeout(t);
      if (res && res.ok) {
        foundPorts.push(p);
      }
    } catch (_) {}
  }

  el.scanList.innerHTML = "";
  if (foundPorts.length === 0) {
    el.scanList.innerHTML = `<div class="scan-title" style="color:var(--text-muted)">Không tìm thấy server nào đang chạy từ cổng ${startPort} đến ${endPort}. Hãy khởi chạy qua start.bat!</div>`;
  } else {
    for (const p of foundPorts) {
      const item = document.createElement("div");
      item.className = "scan-item";
      item.innerHTML = `
        <span><strong class="scan-item-port">Port ${p}</strong>: 🟢 Đang chạy</span>
        <button class="btn btn-small btn-secondary select-port-btn" data-port="${p}">Chọn Port này</button>
      `;
      item.querySelector(".select-port-btn").addEventListener("click", async (e) => {
        const selected = parseInt(e.target.getAttribute("data-port"), 10);
        el.serverPort.value = selected;
        await saveSettings();
        await checkServerStatus();
        el.scanResultBox.classList.add("hidden");
        showToast(`✅ Đã chọn Port ${selected}!`, "success");
      });
      el.scanList.appendChild(item);
    }
  }

  el.btnScanPorts.disabled = false;
  el.btnScanPorts.textContent = "🔍 Dò Port";
}

// 10. Toast Helper
let toastTimer = null;
function showToast(message, type = "info") {
  if (toastTimer) clearTimeout(toastTimer);

  el.toastMessage.className = `toast toast-${type}`;
  el.toastMessage.textContent = message;
  el.toastMessage.classList.remove("hidden");

  toastTimer = setTimeout(() => {
    el.toastMessage.classList.add("hidden");
  }, 6000);
}
