const $ = (id) => document.getElementById(id);
const CATS = globalThis.AIW_CATS || {};

async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ""; }
}

async function load() {
  const settings = await chrome.storage.local.get({ enabled: true, showWeak: true, disabledHosts: [] });
  const tab = await currentTab();
  const host = hostOf(tab?.url || "");
  $("enabled").checked = settings.enabled;
  $("weak").checked = settings.showWeak;
  $("site").checked = !settings.disabledHosts.includes(host);
  $("site").disabled = !host;
  $("host").textContent = host || "not a web page";
  await refreshCounts(tab);
}

async function refreshCounts(tab) {
  if (!tab?.id) return;
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "aiw:getCounts" });
    $("total").textContent = res?.active ? res.total : 0;
    const ul = $("cats");
    ul.innerHTML = "";
    if (res?.active) {
      const entries = Object.entries(res.counts || {}).sort((a, b) => b[1] - a[1]);
      for (const [cat, n] of entries) {
        const li = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = CATS[cat] || cat;
        const num = document.createElement("b");
        num.textContent = String(n);
        li.append(name, num);
        ul.appendChild(li);
      }
    }
  } catch {
    $("total").textContent = "–";
  }
}

$("enabled").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked });
  setTimeout(async () => refreshCounts(await currentTab()), 300);
});

$("weak").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ showWeak: e.target.checked });
  setTimeout(async () => refreshCounts(await currentTab()), 300);
});

$("site").addEventListener("change", async (e) => {
  const tab = await currentTab();
  const host = hostOf(tab?.url || "");
  if (!host) return;
  const { disabledHosts } = await chrome.storage.local.get({ disabledHosts: [] });
  const set = new Set(disabledHosts);
  if (e.target.checked) set.delete(host); else set.add(host);
  await chrome.storage.local.set({ disabledHosts: [...set] });
  setTimeout(() => refreshCounts(tab), 300);
});

load();
