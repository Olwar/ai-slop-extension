// AI Writing Signs — content script.
// Highlights AI-writing telltale phrases in page text. Toggle via popup or Alt+Shift+A.

(function () {
  const RULES = globalThis.AIW_RULES;
  const CATS = globalThis.AIW_CATS;
  const MARK_CLASS = "aiw-mark";
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "BUTTON",
    "CODE", "PRE", "KBD", "SAMP", "SVG", "CANVAS", "VIDEO", "AUDIO", "IFRAME", "OBJECT",
    "MATH", "TITLE", "HEAD", "TEMPLATE",
  ]);
  const MIN_TEXT_LEN = 12;

  let enabled = true;
  let siteDisabled = false;
  let showWeak = true;
  let active = false;
  let observer = null;
  let scheduled = null;
  const pending = new Set();
  const counts = {}; // cat -> number

  // ---------- helpers ----------
  function isSkippable(el) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (SKIP_TAGS.has(n.tagName)) return true;
      if (n.classList && n.classList.contains(MARK_CLASS)) return true;
      if (n.isContentEditable) return true;
      if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return true;
    }
    return false;
  }

  function findMatches(text) {
    const found = [];
    for (const rule of RULES) {
      if (!showWeak && rule.weight === "weak") continue;
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(text)) !== null) {
        if (m[0].length === 0) { rule.re.lastIndex++; continue; }
        if (rule.filter && !rule.filter(m)) continue;
        let start = m.index, end = m.index + m[0].length;
        // trim leading/trailing whitespace from the match
        while (start < end && /\s/.test(text[start])) start++;
        while (end > start && /\s/.test(text[end - 1])) end--;
        if (end <= start) continue;
        let count = 0;
        if (rule.chain && rule.count) {
          rule.count.lastIndex = 0;
          count = (m[0].match(rule.count) || []).length;
          if (count < 2) continue;
        }
        found.push({ start, end, rule, count });
      }
    }
    if (found.length === 0) return found;
    // Prefer strong > weak, then longer, then earlier; drop overlaps.
    found.sort((a, b) => {
      const wa = a.rule.weight === "strong" ? 0 : 1, wb = b.rule.weight === "strong" ? 0 : 1;
      if (wa !== wb) return wa - wb;
      const la = a.end - a.start, lb = b.end - b.start;
      if (la !== lb) return lb - la;
      return a.start - b.start;
    });
    const kept = [];
    for (const f of found) {
      if (kept.some((k) => f.start < k.end && k.start < f.end)) continue;
      kept.push(f);
    }
    kept.sort((a, b) => a.start - b.start);
    return kept;
  }

  function makeMark(f, text) {
    const mark = document.createElement("mark");
    mark.className = MARK_CLASS + " aiw-" + f.rule.weight + " aiw-cat-" + f.rule.cat;
    const label = f.count ? `${f.rule.label} · ${f.count} items` : `${f.rule.label} · ${CATS[f.rule.cat]}`;
    mark.setAttribute("data-aiw-label", label);
    mark.appendChild(document.createTextNode(text));
    if (f.count) {
      const badge = document.createElement("span");
      badge.className = "aiw-count";
      badge.textContent = String(f.count);
      badge.setAttribute("aria-hidden", "true");
      mark.appendChild(badge);
    }
    return mark;
  }

  function processTextNode(node) {
    const text = node.nodeValue;
    if (!text || text.length < MIN_TEXT_LEN || !/\S/.test(text)) return 0;
    if (!node.parentElement || isSkippable(node.parentElement)) return 0;
    const matches = findMatches(text);
    if (matches.length === 0) return 0;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const f of matches) {
      if (f.start > pos) frag.appendChild(document.createTextNode(text.slice(pos, f.start)));
      frag.appendChild(makeMark(f, text.slice(f.start, f.end)));
      counts[f.rule.cat] = (counts[f.rule.cat] || 0) + 1;
      pos = f.end;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    node.parentNode.replaceChild(frag, node);
    return matches.length;
  }

  function collectTextNodes(root) {
    const out = [];
    if (root.nodeType === 3) { out.push(root); return out; }
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return out;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || n.nodeValue.length < MIN_TEXT_LEN) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function scan(root) {
    const nodes = collectTextNodes(root);
    let n = 0;
    pauseObserver();
    for (const node of nodes) {
      if (!node.isConnected) continue;
      n += processTextNode(node);
    }
    resumeObserver();
    return n;
  }

  function clearAll() {
    pauseObserver();
    const marks = document.querySelectorAll("mark." + MARK_CLASS);
    const parents = new Set();
    for (const mark of marks) {
      const badge = mark.querySelector(".aiw-count");
      if (badge) badge.remove();
      const parent = mark.parentNode;
      if (!parent) continue;
      parents.add(parent);
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    }
    for (const p of parents) p.normalize();
    for (const k of Object.keys(counts)) delete counts[k];
    resumeObserver();
  }

  // ---------- observer ----------
  function pauseObserver() { if (observer) observer.disconnect(); }
  function resumeObserver() {
    if (!active || !observer) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function onMutations(records) {
    for (const r of records) {
      if (r.type === "characterData") {
        if (r.target.parentElement && !isSkippable(r.target.parentElement)) pending.add(r.target);
      } else {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.classList && n.classList.contains(MARK_CLASS)) continue;
          if (n.nodeType === 1 && isSkippable(n)) continue;
          pending.add(n);
        }
      }
    }
    if (pending.size && !scheduled) {
      scheduled = setTimeout(flushPending, 400);
    }
  }

  function flushPending() {
    scheduled = null;
    if (!active) { pending.clear(); return; }
    const nodes = [...pending];
    pending.clear();
    let n = 0;
    for (const node of nodes) {
      if (!node.isConnected) continue;
      n += scan(node);
    }
    if (n) reportCounts();
  }

  // ---------- lifecycle ----------
  function start() {
    if (active || !document.body) return;
    active = true;
    observer = new MutationObserver(onMutations);
    scan(document.body);
    resumeObserver();
    reportCounts();
  }

  function stop() {
    if (!active) return;
    active = false;
    if (scheduled) { clearTimeout(scheduled); scheduled = null; }
    pending.clear();
    if (observer) { observer.disconnect(); observer = null; }
    clearAll();
    reportCounts();
  }

  function apply() {
    const shouldRun = enabled && !siteDisabled;
    if (shouldRun && !active) start();
    else if (!shouldRun && active) stop();
    else if (shouldRun && active) { clearAll(); scan(document.body); reportCounts(); }
  }

  function total() { return Object.values(counts).reduce((a, b) => a + b, 0); }

  function reportCounts() {
    try {
      chrome.runtime.sendMessage({ type: "aiw:counts", total: active ? total() : 0, active }).catch?.(() => {});
    } catch (_) {}
  }

  function readSettings(items) {
    enabled = items.enabled !== false;
    showWeak = items.showWeak !== false;
    const hosts = items.disabledHosts || [];
    siteDisabled = hosts.includes(location.hostname);
  }

  chrome.storage.local.get({ enabled: true, showWeak: true, disabledHosts: [] }).then((items) => {
    readSettings(items);
    if (document.body) apply();
    else document.addEventListener("DOMContentLoaded", apply, { once: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    chrome.storage.local.get({ enabled: true, showWeak: true, disabledHosts: [] }).then((items) => {
      readSettings(items);
      apply();
    });
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "aiw:getCounts") {
      sendResponse({ active, total: total(), counts: { ...counts }, host: location.hostname });
    }
    return false;
  });
})();
