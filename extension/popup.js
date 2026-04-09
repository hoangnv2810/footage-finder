const BACKEND_URLS = ["http://127.0.0.1:8000", "http://localhost:8000"];
const IMPORT_API_PATH = "/api/import-analysis";
const VIDEOS_API_PATH = "/api/videos";

const PROMPT_TEMPLATE = `Analyze the full video and split it into meaningful scenes in chronological order.

Return ONLY a valid JSON array.
Do not include markdown fences.
Do not include any explanation before or after the JSON.

Each item must use this exact shape with all fields present:
{"keyword":"short Vietnamese scene label","start":12.3,"end":18.7,"description":"Vietnamese description","context":"Vietnamese scene context","subjects":["item"],"actions":["item"],"mood":"Vietnamese mood","shot_type":"Vietnamese shot type","marketing_uses":["item"],"relevance_notes":"Vietnamese note"}

Rules:
- Write all text fields in Vietnamese except numbers.
- Keep scene order chronological from start to end.
- start and end must be numbers in seconds.
- end must be greater than or equal to start.
- keyword must be short and practical for footage search.
- description should describe what is visible in the scene.
- context should explain the situation or surrounding context of the scene.
- subjects should list the main people, objects, or entities appearing.
- actions should list the key visible actions in the scene.
- mood should describe the emotional tone.
- shot_type should describe the shot style, such as can canh, trung canh, toan canh, POV, overhead.
- marketing_uses should describe how the scene could be used in marketing, such as hook, problem, solution, benefit, lifestyle, testimonial, social proof, or cta support.
- relevance_notes should briefly explain why the scene is useful or distinctive.
- The scenes must cover the important content of the whole video.
- If no useful scenes can be identified, return [].`;

// ─── State ───
let latestExtraction = null;
let selectedResponseIndex = 0;
let expandedScenes = new Set();
let activeTab = "scenes"; // "scenes" | "json"
let activeBackendUrl = null;

// ─── DOM ───
const filenameEl = document.getElementById("filename");
const filenameInputRow = document.getElementById("filename-input-row");
const filenameManualInput = document.getElementById("filename-manual");
const videoListDatalist = document.getElementById("video-list");
const responseSelectorRow = document.getElementById("response-selector-row");
const responseSelector = document.getElementById("response-selector");
const sceneCountEl = document.getElementById("scene-count");
const statusPillEl = document.getElementById("status-pill");
const messageEl = document.getElementById("message");
const previewSection = document.getElementById("preview-section");
const sceneListEl = document.getElementById("scene-list");
const jsonRawEl = document.getElementById("json-raw");
const previewScenesPanel = document.getElementById("preview-scenes");
const previewJsonPanel = document.getElementById("preview-json");
const tabScenesBtn = document.getElementById("tab-scenes");
const tabJsonBtn = document.getElementById("tab-json");
const saveButton = document.getElementById("save");
const refreshButton = document.getElementById("refresh");
const copyPromptButton = document.getElementById("copy-prompt");
const copyLogButton = document.getElementById("copy-log");

// ─── Helpers ───
function setStatus(kind, msg) {
  statusPillEl.className = `pill ${kind}`;
  statusPillEl.textContent = kind === "success" ? "Ready" : kind === "error" ? "Error" : kind === "loading" ? "Working" : "Waiting";
  messageEl.textContent = msg;
}

const SCENE_KEY_ORDER = [
  "keyword", "start", "end", "description", "context",
  "subjects", "actions", "mood", "shot_type", 
  "marketing_uses", "relevance_notes"
];

function reorderSceneKeys(scene) {
  const ord = {};
  for (const k of SCENE_KEY_ORDER) {
    if (scene[k] !== undefined) ord[k] = scene[k];
  }
  for (const k in scene) {
    if (!SCENE_KEY_ORDER.includes(k)) ord[k] = scene[k];
  }
  return ord;
}

function setDetails(filename, sceneCount) {
  filenameEl.textContent = filename || "-";
  sceneCountEl.textContent = typeof sceneCount === "number" ? String(sceneCount) : "-";
}

function getManualFilename() {
  return (filenameManualInput.value || "").trim() || null;
}

function getSelectedResponse() {
  if (!latestExtraction || !latestExtraction.allResponses) return null;
  return latestExtraction.allResponses[selectedResponseIndex] || null;
}

function fmtTime(s) {
  if (typeof s !== "number" || isNaN(s)) return "?";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s % 1) * 10);
  return m > 0 ? `${m}:${String(sec).padStart(2, "0")}.${ms}` : `${sec}.${ms}s`;
}

function renderTags(items) {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items.map((t) => `<span class="scene-tag">${escHtml(String(t))}</span>`).join("");
}

function escHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// ─── Preview ───
function renderPreview(scenes) {
  expandedScenes.clear();
  if (!scenes || scenes.length === 0) {
    previewSection.classList.add("hidden");
    return;
  }
  previewSection.classList.remove("hidden");

  // Scene list tab
  renderSceneList(scenes);

  // JSON tab
  jsonRawEl.textContent = JSON.stringify(scenes, null, 2);

  setActiveTab(activeTab);
}

function renderSceneList(scenes) {
  sceneListEl.innerHTML = "";
  scenes.forEach((scene, i) => {
    const card = document.createElement("div");
    card.className = "scene-card";
    card.dataset.index = String(i);
    card.innerHTML = buildSceneCardHtml(scene, i, expandedScenes.has(i));
    card.addEventListener("click", () => toggleScene(i, scenes));
    sceneListEl.appendChild(card);
  });
}

function buildSceneCardHtml(scene, index, expanded) {
  let html = `
    <div class="scene-header">
      <div class="scene-left">
        <span class="scene-index">${index + 1}</span>
        <span class="scene-keyword">${escHtml(scene.keyword || "(no keyword)")}</span>
      </div>
      <span class="scene-timing">${fmtTime(scene.start)} → ${fmtTime(scene.end)}</span>
    </div>`;

  if (expanded) {
    html += `<div class="scene-details">`;
    html += detailRow("Description", scene.description);
    html += detailRow("Context", scene.context);
    html += detailRow("Mood", scene.mood);
    html += detailRow("Shot type", scene.shot_type);
    html += detailRow("Relevance", scene.relevance_notes);
    if (scene.subjects?.length) html += detailRow("Subjects", null) + `<div class="scene-tags">${renderTags(scene.subjects)}</div>`;
    if (scene.actions?.length) html += detailRow("Actions", null) + `<div class="scene-tags">${renderTags(scene.actions)}</div>`;
    if (scene.marketing_uses?.length) html += detailRow("Marketing", null) + `<div class="scene-tags">${renderTags(scene.marketing_uses)}</div>`;
    html += `</div>`;
  }

  return html;
}

function detailRow(label, value) {
  if (value === null || value === undefined) {
    return `<div class="scene-detail-row"><span class="scene-detail-label">${escHtml(label)}</span><span class="scene-detail-value"></span></div>`;
  }
  return `<div class="scene-detail-row"><span class="scene-detail-label">${escHtml(label)}</span><span class="scene-detail-value">${escHtml(String(value))}</span></div>`;
}

function toggleScene(index, scenes) {
  if (expandedScenes.has(index)) expandedScenes.delete(index);
  else expandedScenes.add(index);
  renderSceneList(scenes);
}

function setActiveTab(tab) {
  activeTab = tab;
  tabScenesBtn.classList.toggle("active", tab === "scenes");
  tabJsonBtn.classList.toggle("active", tab === "json");
  previewScenesPanel.classList.toggle("hidden", tab !== "scenes");
  previewJsonPanel.classList.toggle("hidden", tab !== "json");
}

function updateResponseSelector() {
  if (!latestExtraction || latestExtraction.allResponses.length <= 1) {
    responseSelectorRow.classList.add("hidden");
    return;
  }
  responseSelectorRow.classList.remove("hidden");
  responseSelector.innerHTML = "";
  latestExtraction.allResponses.forEach((resp, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Response ${i + 1} — ${resp.sceneCount} scene(s)`;
    if (i === selectedResponseIndex) opt.selected = true;
    responseSelector.appendChild(opt);
  });
}

function onResponseChange() {
  selectedResponseIndex = parseInt(responseSelector.value, 10) || 0;
  const resp = getSelectedResponse();
  if (resp) {
    setDetails(getManualFilename() || latestExtraction.filename || "⚠ Not detected", resp.sceneCount);
    renderPreview(resp.scenes);
    setStatus("success", `Response ${selectedResponseIndex + 1}: ${resp.sceneCount} scene(s). Click a scene to expand. Save when ready.`);
    saveButton.disabled = false;
  }
}

// ─── Backend ───
async function resolveBackendUrl() {
  if (activeBackendUrl) return activeBackendUrl;
  for (const url of BACKEND_URLS) {
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) { activeBackendUrl = url; return url; }
    } catch { /* next */ }
  }
  throw new Error("Cannot reach local backend. Make sure the Footage Finder server is running.");
}

async function fetchAvailableVideos() {
  try {
    const url = await resolveBackendUrl();
    const res = await fetch(`${url}${VIDEOS_API_PATH}`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const videos = await res.json();
    return Array.isArray(videos) ? videos.map((v) => v.filename || v.fileName || "").filter(Boolean) : [];
  } catch { return []; }
}

async function populateVideoList() {
  const videos = await fetchAvailableVideos();
  videoListDatalist.innerHTML = "";
  videos.forEach((fn) => {
    const opt = document.createElement("option");
    opt.value = fn;
    videoListDatalist.appendChild(opt);
  });
  if (videos.length > 0) filenameManualInput.setAttribute("list", "video-list");
}

// ─── Tab & extraction ───
async function getActiveChatTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id || !tab.url || !tab.url.startsWith("https://chat.qwen.ai/")) {
    throw new Error("Open the extension from a chat.qwen.ai tab.");
  }
  return tab;
}

function extractAllInPageSafe(manualFilename) {
  try {
    const VFR = /\b[^\\/\s"'`<>]+\.(?:mp4|mov|avi|mkv|webm)\b/gi;
    function unique(a) { return [...new Set(a.filter(Boolean))]; }
    function hasM(t) { return t.includes('"keyword"') && t.includes('"start"') && t.includes('"end"'); }
    // Strip invisible characters that break JSON.parse
    function sanitize(text) {
      return text
        .replace(/\u00A0/g, " ")     // non-breaking space → space
        .replace(/\uFEFF/g, "")      // BOM
        .replace(/\u200B/g, "")      // zero-width space
        .replace(/\u200C/g, "")      // zero-width non-joiner
        .replace(/\u200D/g, "")      // zero-width joiner
        .replace(/\u2028/g, "\n")    // line separator
        .replace(/\u2029/g, "\n")    // paragraph separator
        .replace(/[\u201C\u201D]/g, '"')  // smart double quotes
        .replace(/[\u2018\u2019]/g, "'"); // smart single quotes
    }
    function clean(text) {
      return sanitize(text).split("\n").filter(l => !/^\s*\d+\s*$/.test(l)).join("\n").trim().replace(/^json\s*/i, "").trim();
    }
    function cleanLeading(text) {
      return sanitize(text).split("\n").map(l => l.replace(/^\s*\d+[\s\t]+/, "")).join("\n").trim().replace(/^json\s*/i, "").trim();
    }
    function cleanNuclear(text) {
      return sanitize(text).split("\n")
        .map(l => l.replace(/^\s*\d+\t/, ""))
        .map(l => l.replace(/^\s*\d{1,4}(?=\s*[\[{"\]},:])/, ""))
        .join("\n").trim().replace(/^json\s*/i, "").trim();
    }
    let lastParseError = "";
    function tryParse(text) {
      try { const p = JSON.parse(text); if (Array.isArray(p) && p.length > 0) return p; } catch (e) {
        lastParseError = e.message || String(e);
      }
      const a = text.indexOf("["), b = text.lastIndexOf("]");
      if (a !== -1 && b > a) {
        const slice = text.slice(a, b + 1);
        try { const p = JSON.parse(slice); if (Array.isArray(p) && p.length > 0) return p; } catch (e) {
          lastParseError = e.message || String(e);
          const posMatch = (e.message || "").match(/position\s+(\d+)/i);
          if (posMatch) {
            const pos = parseInt(posMatch[1], 10);
            lastParseError += " | near: " + JSON.stringify(slice.substring(Math.max(0, pos - 30), pos + 30));
          }
        }
      }
      return null;
    }
    function pj(raw) {
      lastParseError = "";
      const variants = [
        clean(raw),
        cleanLeading(raw),
        cleanNuclear(raw),
      ];
      const ra = raw.indexOf("["), rb = raw.lastIndexOf("]");
      if (ra !== -1 && rb > ra) {
        const slice = raw.slice(ra, rb + 1);
        variants.push(slice, clean(slice), cleanLeading(slice), cleanNuclear(slice));
      }
      const fm = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fm && fm[1]) {
        variants.push(fm[1].trim(), clean(fm[1]), cleanLeading(fm[1]));
      }
      for (const v of variants) {
        const result = tryParse(v);
        if (result) return result;
      }
      const bestCleaned = cleanLeading(raw);
      const om = bestCleaned.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
      if (om && om.length > 0) {
        const result = tryParse("[" + om.join(",") + "]");
        if (result) return result;
      }
      return null;
    }
    function getNP(el, n) { let c = el; for (let i = 0; i < n; i++) { if (!c.parentElement) return null; c = c.parentElement; } return c; }

    // Drill DOWN into an element to find the smallest descendant with markers
    function findDeepestWithMarkers(el) {
      const text = (el.innerText || el.textContent || "").trim();
      if (text.length < 30 || !hasM(cleanLeading(text))) return null;

      // Try children first (smaller = more specific = less noise)
      let best = { el, text, len: text.length };
      for (const child of el.children) {
        const childText = (child.innerText || child.textContent || "").trim();
        if (childText.length > 30 && hasM(cleanLeading(childText)) && childText.length < best.len) {
          best = { el: child, text: childText, len: childText.length };
          // Recurse deeper
          const deeper = findDeepestWithMarkers(child);
          if (deeper && deeper.len < best.len) best = deeper;
        }
      }
      return best;
    }

    // Strategy 1: find each "json" header → extract closest sibling code body
    function collectCodeBlocks() {
      const blocks = [];
      document.querySelectorAll("*").forEach(el => {
        const own = (el.innerText || el.textContent || "").trim().toLowerCase();
        if (own !== "json" || el.children.length > 2) return;
        for (let d = 0; d < 3; d++) {
          const cont = d === 0 ? el : getNP(el, d);
          if (!cont) continue;
          const sib = cont.nextElementSibling;
          if (sib) {
            // Drill down to find smallest element with markers
            const deep = findDeepestWithMarkers(sib);
            if (deep) { blocks.push(deep.text); return; }
          }
          if (cont.parentElement) {
            for (const ch of cont.parentElement.children) {
              if (ch === cont) continue;
              const deep = findDeepestWithMarkers(ch);
              if (deep) { blocks.push(deep.text); return; }
            }
          }
        }
      });
      return blocks;
    }

    // Strategy 2: Fallback scan
    function collectFallback() {
      const out = [];
      const chat = document.getElementById("chat-messages-scroll-container") || document.querySelector("[class*='chat-messages']") || document.querySelector("main");
      if (chat) chat.querySelectorAll("div,section,pre,code").forEach(el => {
        const t = (el.innerText || el.textContent || "").trim();
        if (t.length > 50 && hasM(cleanLeading(t))) out.push(t);
      });
      if (out.length === 0) document.querySelectorAll("pre,code,div").forEach(el => {
        if (el.children.length > 30) return;
        const t = (el.innerText || el.textContent || "").trim();
        if (t.length > 50 && hasM(cleanLeading(t))) out.push(t);
      });
      return unique(out).sort((a, b) => a.length - b.length);
    }

    let rawCandidates = collectCodeBlocks();
    if (rawCandidates.length === 0) rawCandidates = collectFallback();
    if (rawCandidates.length === 0) return { ok: false, error: "Không tìm thấy JSON array trong trang." };

    const seen = new Set();
    const allResponses = [];
    const debugSnippets = [];
    for (const raw of rawCandidates) {
      const scenes = pj(raw);
      if (!scenes || scenes.length === 0) {
        debugSnippets.push(clean(raw).substring(0, 200));
        continue;
      }
      const sig = scenes.map(s => `${s.keyword||""}:${s.start}:${s.end}`).join("|");
      if (seen.has(sig)) continue;
      seen.add(sig);
      allResponses.push({ scenes, sceneCount: scenes.length, rawText: raw });
    }
    if (allResponses.length === 0) {
      const debugText = clean(rawCandidates[0] || "");
      return { ok: false, error: "Could not parse JSON.\n\nParse error: " + lastParseError + "\n\nCleaned text (first 1000 chars):\n" + debugText.substring(0, 1000) };
    }
    allResponses.sort((a, b) => b.sceneCount - a.sceneCount);

    const body = (document.body.innerText || document.body.textContent || "").trim();
    const fns = unique(body.match(VFR) || []);
    return { ok: true, data: { filename: manualFilename || fns[fns.length - 1] || null, filenameAutoDetected: fns.length > 0, allResponses, selectedIndex: 0 } };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

async function extractWithInjectedScript(tabId, manual) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func: extractAllInPageSafe, args: [manual || null] });
  const r = results && results[0] ? results[0].result : null;
  if (!r) throw new Error("Script injection returned no result.");
  if (!r.ok) throw new Error(r.error || "Extraction failed.");
  return r.data;
}

async function extractFromCurrentTab(manual) {
  const tab = await getActiveChatTab();
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id, { type: "extract-analysis", manualFilename: manual || null }, (response) => {
      if (chrome.runtime.lastError) {
        extractWithInjectedScript(tab.id, manual).then(resolve).catch(e => reject(e instanceof Error ? e : new Error(chrome.runtime.lastError.message)));
        return;
      }
      if (!response || !response.ok) {
        extractWithInjectedScript(tab.id, manual).then(resolve).catch(e => reject(e instanceof Error ? e : new Error(response?.error || "Extraction failed.")));
        return;
      }
      resolve(response.data);
    });
  });
}

// ─── Main actions ───
async function refreshExtraction() {
  saveButton.disabled = true;
  latestExtraction = null;
  selectedResponseIndex = 0;
  expandedScenes.clear();
  setStatus("loading", "Reading JSON responses from chat.qwen.ai...");
  setDetails("-", null);
  previewSection.classList.add("hidden");
  responseSelectorRow.classList.add("hidden");

  populateVideoList();

  try {
    latestExtraction = await extractFromCurrentTab(getManualFilename());
    if (latestExtraction && latestExtraction.allResponses) {
      latestExtraction.allResponses.forEach(r => {
        if (Array.isArray(r.scenes)) {
          r.scenes = r.scenes.map(reorderSceneKeys);
        }
      });
    }
    selectedResponseIndex = 0;
    const resp = getSelectedResponse();
    if (!resp) { setStatus("error", "No parseable JSON found."); return; }

    const resolvedName = getManualFilename() || latestExtraction.filename;
    updateResponseSelector();

    if (!resolvedName) {
      filenameInputRow.classList.remove("hidden");
      setDetails("⚠ Not detected", resp.sceneCount);
    } else {
      filenameInputRow.classList.add("hidden");
      setDetails(resolvedName, resp.sceneCount);
    }

    renderPreview(resp.scenes);

    const multiMsg = latestExtraction.allResponses.length > 1
      ? `\n${latestExtraction.allResponses.length} responses found — use dropdown to switch.`
      : "";
    const fnMsg = !resolvedName ? "\nEnter filename manually above." : "";

    setStatus(resolvedName ? "success" : "error",
      `${resp.sceneCount} scene(s). Click a scene to see all fields.${multiMsg}${fnMsg}`
    );
    if (resolvedName) saveButton.disabled = false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error.";
    if (msg.includes("filename") || msg.includes("Không tìm")) {
      filenameInputRow.classList.remove("hidden");
      populateVideoList();
    }
    setStatus("error", msg);
  }
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(PROMPT_TEMPLATE);
    setStatus("success", "Prompt copied. Paste it into chat.qwen.ai.");
  } catch (e) {
    setStatus("error", e instanceof Error ? e.message : "Could not copy.");
  }
}

async function postImport(baseUrl, payload) {
  const res = await fetch(`${baseUrl}${IMPORT_API_PATH}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) { const d = await res.json().catch(() => null); throw new Error(d?.detail || `Import failed (${res.status}).`); }
  return res.json();
}

async function saveImport() {
  const resp = getSelectedResponse();
  if (!resp) { setStatus("error", 'Click "Check current result" first.'); return; }
  const fn = getManualFilename() || (latestExtraction && latestExtraction.filename);
  if (!fn) { filenameInputRow.classList.remove("hidden"); setStatus("error", "Filename required."); return; }

  saveButton.disabled = true;
  setStatus("loading", `Importing ${resp.sceneCount} scenes for "${fn}"...`);

  let lastErr = null;
  for (const url of BACKEND_URLS) {
    try {
      const result = await postImport(url, { filename: fn, scenes: resp.scenes, source: "chat.qwen.ai" });
      activeBackendUrl = url;
      setStatus("success", `Import complete! Version ${result.version_id} for "${fn}".\nRefresh the app to see it.`);
      saveButton.disabled = false;
      return;
    } catch (e) { lastErr = e; }
  }
  setStatus("error", lastErr instanceof Error ? lastErr.message : "Backend unreachable.");
  saveButton.disabled = false;
}

// ─── Events ───
filenameManualInput.addEventListener("input", () => {
  if (latestExtraction && filenameManualInput.value.trim()) {
    saveButton.disabled = false;
    filenameEl.textContent = filenameManualInput.value.trim();
    const r = getSelectedResponse();
    if (r) setStatus("success", `${r.sceneCount} scene(s) ready. Save when ready.`);
  }
});

responseSelector.addEventListener("change", onResponseChange);
tabScenesBtn.addEventListener("click", () => setActiveTab("scenes"));
tabJsonBtn.addEventListener("click", () => setActiveTab("json"));
copyPromptButton.addEventListener("click", copyPrompt);
refreshButton.addEventListener("click", refreshExtraction);
saveButton.addEventListener("click", saveImport);
copyLogButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(messageEl.textContent);
    copyLogButton.textContent = "Copied!";
    setTimeout(() => { copyLogButton.textContent = "Copy log"; }, 1500);
  } catch { copyLogButton.textContent = "Failed"; }
});

refreshExtraction();
