// Background: keyboard shortcut toggle + badge counts.

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== "toggle") return;
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  await chrome.storage.local.set({ enabled: !enabled });
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "aiw:counts" || !sender.tab?.id) return;
  const text = msg.active && msg.total > 0 ? String(msg.total > 999 ? "999+" : msg.total) : "";
  chrome.action.setBadgeText({ tabId: sender.tab.id, text });
  chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#8b3a0e" });
});

async function updateIcon() {
  const { enabled } = await chrome.storage.local.get({ enabled: true });
  chrome.action.setTitle({ title: enabled ? "AI Writing Signs (on)" : "AI Writing Signs (off)" });
}
chrome.storage.onChanged.addListener(updateIcon);
updateIcon();
