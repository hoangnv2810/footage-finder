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
const filenameManualInput = document.getElementById("filename-manual");
const filenameClearBtn = document.getElementById("filename-clear");
const videoPreviewBtn = document.getElementById("video-preview-btn");
const autocompleteList = document.getElementById("autocomplete-list");
const videoPreviewContainer = document.getElementById("video-preview-container");
const videoPreview = document.getElementById("video-preview");
const responseSelectorRow = document.getElementById("response-selector-row");
const responseSelector = document.getElementById("response-selector");
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
const pinPopupBtn = document.getElementById("pin-popup");

// Mode selection refs
const modeAutoBtn = document.getElementById("mode-auto-btn");
const modeManualBtn = document.getElementById("mode-manual-btn");
const modeAutoContainer = document.getElementById("mode-auto-container");
const modeManualContainer = document.getElementById("mode-manual-container");
const manualTextarea = document.getElementById("manual-textarea");
const togglePreviewBtn = document.getElementById("toggle-preview-btn");

// ─── Helpers ───
function setStatus(kind, msg) {
  if (messageEl.textContent === "Open a chat.qwen.ai tab with a finished JSON response." || messageEl.textContent === "Waiting...") {
    messageEl.textContent = "";
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
  let prefix = 'ℹ️';
  if (kind === 'error') prefix = '❌';
  if (kind === 'success') prefix = '✅';
  if (kind === 'loading') prefix = '⏳';
  if (kind === 'neutral') prefix = '⚠️';
  
  const line = `[${timeStr}] ${prefix} ${msg}\n`;
  messageEl.textContent = line + messageEl.textContent;
  messageEl.scrollTop = 0;
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
  if (filename && filename !== "⚠ Manual entry needed" && filename !== "-") {
    if (!filenameManualInput.value) {
      filenameManualInput.value = filename;
    }
  }
}

function getManualFilename() {
  let val = (filenameManualInput.value || "").trim();
  if (!val) return null;
  // Auto-append .mp4 if no video extension
  if (!/\.(mp4|mov|avi|mkv|webm)$/i.test(val)) {
    val += ".mp4";
  }
  return val;
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
  // Remove hidden by default, unless overridden by caller later
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

let allVideoFiles = [];

async function populateVideoList() {
  allVideoFiles = await fetchAvailableVideos();
  updateFilenameButtons();
}

function renderAutocomplete(filterText = "") {
  autocompleteList.innerHTML = "";
  if (!allVideoFiles.length) { autocompleteList.classList.add("hidden"); return; }
  const match = filterText.toLowerCase();
  const filtered = match
    ? allVideoFiles.filter(fn => fn.toLowerCase().includes(match))
    : allVideoFiles;

  if (filtered.length === 0) {
    autocompleteList.classList.add("hidden");
    return;
  }

  autocompleteList.classList.remove("hidden");

  filtered.forEach(fn => {
    const d = document.createElement("div");
    d.className = "autocomplete-item";
    d.textContent = fn;
    d.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      filenameManualInput.value = fn;
      autocompleteList.classList.add("hidden");
      updateFilenameButtons();
      hideVideoPreview();
      checkSaveReady();
      if (latestExtraction) {
        const r = getSelectedResponse();
        if (r) setStatus("success", `${r.sceneCount} scene(s) ready. Save when ready.`);
      }
    });
    autocompleteList.appendChild(d);
  });
}

function updateFilenameButtons() {
  const val = filenameManualInput.value.trim();
  // Show/hide clear button
  if (val) {
    filenameClearBtn.classList.remove("hidden");
  } else {
    filenameClearBtn.classList.add("hidden");
  }
  // Show/hide preview button (only if exact match in library)
  if (val && allVideoFiles.includes(val) && activeBackendUrl) {
    videoPreviewBtn.classList.remove("hidden");
  } else {
    videoPreviewBtn.classList.add("hidden");
    hideVideoPreview();
  }
}

function showVideoPreview(filename) {
  if (!activeBackendUrl) return;
  videoPreview.src = `${activeBackendUrl}/api/videos/${encodeURIComponent(filename)}/stream`;
  videoPreviewContainer.classList.remove("hidden");
  videoPreviewBtn.textContent = "⏹";
  videoPreviewBtn.title = "Hide preview";
}

function hideVideoPreview() {
  videoPreview.pause();
  videoPreview.src = "";
  videoPreviewContainer.classList.add("hidden");
  videoPreviewBtn.textContent = "▶";
  videoPreviewBtn.title = "Preview video";
}

function toggleVideoPreview() {
  const fn = filenameManualInput.value.trim();
  if (!videoPreviewContainer.classList.contains("hidden")) {
    hideVideoPreview();
  } else if (fn && allVideoFiles.includes(fn)) {
    showVideoPreview(fn);
  }
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
      setDetails("⚠ Manual entry needed", resp.sceneCount);
    } else {
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
  if (!res.ok) { 
    const d = await res.json().catch(() => null); 
    const err = new Error(d?.detail || `Import failed (${res.status}).`); 
    err.isHttpError = true;
    throw err;
  }
  return res.json();
}

async function saveImport() {
  const resp = getSelectedResponse();
  if (!resp) { setStatus("error", 'Click "Check current result" first.'); return; }
  const fn = getManualFilename() || (latestExtraction && latestExtraction.filename);
  if (!fn) { setStatus("error", "Filename required."); return; }

  saveButton.disabled = true;
  saveButton.innerHTML = `<span class="spinner"></span> Saving...`;
  
  setStatus("loading", `Importing ${resp.sceneCount} scenes...`);

  let lastErr = null;
  let isSuccess = false;
  let finalMsg = "";
  let isDuplicate = false;

  for (const url of BACKEND_URLS) {
    try {
      const result = await postImport(url, { filename: fn, scenes: resp.scenes, source: "chat.qwen.ai" });
      activeBackendUrl = url;
      isDuplicate = result.is_duplicate === true;
      if (isDuplicate) {
        finalMsg = `No changes detected. Existing version ${result.version_id} kept for "${fn}".`;
      } else {
        finalMsg = `Import complete! Version ${result.version_id} for "${fn}".`;
      }
      isSuccess = true;
      break;
    } catch (e) { 
      lastErr = e; 
      if (e.isHttpError) break;
    }
  }

  if (isSuccess) {
    if (isDuplicate) {
      setStatus("neutral", finalMsg);
      saveButton.innerHTML = `⚠️ No changes`;
      saveButton.classList.add("btn-secondary");
      setTimeout(() => {
        saveButton.classList.remove("btn-secondary");
        saveButton.innerHTML = `Save`;
        checkSaveReady();
      }, 2500);
    } else {
      setStatus("success", finalMsg);
      saveButton.innerHTML = `<span class="checkmark">✓</span> Success`;
      saveButton.classList.add("btn-success");
      
      // Clear data on success
      manualTextarea.value = "";
      filenameManualInput.value = "";
      latestExtraction = null;
      hideVideoPreview();
      updateFilenameButtons();
      previewSection.classList.add("hidden");
      togglePreviewBtn.classList.add("hidden");
      
      setTimeout(() => {
        saveButton.classList.remove("btn-success");
        saveButton.innerHTML = `Save`;
        checkSaveReady();
      }, 2500);
    }
  } else {
    setStatus("error", lastErr instanceof Error ? lastErr.message : "Backend unreachable.");
    saveButton.innerHTML = `Save`;
    saveButton.disabled = false;
  }
}

function setMode(mode) {
  if (mode === "auto") {
    modeAutoBtn.classList.add("active");
    modeManualBtn.classList.remove("active");
    modeAutoContainer.classList.remove("hidden");
    modeManualContainer.classList.add("hidden");
    refreshExtraction();
  } else {
    modeManualBtn.classList.add("active");
    modeAutoBtn.classList.remove("active");
    modeManualContainer.classList.remove("hidden");
    modeAutoContainer.classList.add("hidden");
    previewSection.classList.add("hidden");
    saveButton.disabled = true;
    setStatus("Waiting", "Manual mode: Paste JSON into the box and click Load.");
    setDetails("-", null);
    populateVideoList();
  }
}

function loadManualJson() {
  saveButton.disabled = true;
  latestExtraction = null;
  selectedResponseIndex = 0;
  expandedScenes.clear();
  setStatus("loading", "Processing text...");
  setDetails("-", null);
  previewSection.classList.add("hidden");
  responseSelectorRow.classList.add("hidden");

  let text = manualTextarea.value.trim();
  if (!text) {
    setStatus("error", "Please paste JSON text first.");
    return;
  }

  // Handle Markdown code block fences
  const fm = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fm && fm[1]) {
    text = fm[1].trim();
  } else {
    // Attempt standard array slicing just in case
    const a = text.indexOf("[");
    const b = text.lastIndexOf("]");
    if (a !== -1 && b > a) {
      text = text.slice(a, b + 1);
    }
  }

  let scenes = null;
  try {
    scenes = JSON.parse(text);
  } catch (err) {
    manualTextarea.value = "";
    setStatus("error", "Could not parse JSON. Paste must be valid JSON array.");
    return;
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    manualTextarea.value = "";
    setStatus("error", "Parsed JSON is not a valid scenes array.");
    return;
  }

  const reorderedScenes = scenes.map(reorderSceneKeys);
  
  // Mock extraction result for the manual JSON
  latestExtraction = {
    filename: null,
    filenameAutoDetected: false,
    allResponses: [{
      scenes: reorderedScenes,
      sceneCount: reorderedScenes.length,
      rawText: text
    }],
    selectedIndex: 0
  };
  
  selectedResponseIndex = 0;
  const resp = getSelectedResponse();
  const resolvedName = getManualFilename();
  updateResponseSelector(); // will hide since only 1 response
  
  if (!resolvedName) {
    setDetails("⚠ Manual entry needed", resp.sceneCount);
  } else {
    setDetails(resolvedName, resp.sceneCount);
  }
  
  renderPreview(resp.scenes);
  // Manual mode user preference: keep preview hidden
  previewSection.classList.add("hidden");
  togglePreviewBtn.classList.remove("hidden");
  togglePreviewBtn.textContent = "Show Preview";

  setStatus("success", `${resp.sceneCount} scene(s) loaded. Enter filename to save.`);
  checkSaveReady();
}

// ─── Events ───

function checkSaveReady() {
  // Enable save only when we have parsed JSON data AND a filename
  if (latestExtraction && filenameManualInput.value.trim()) {
    saveButton.disabled = false;
  } else {
    saveButton.disabled = true;
  }
}

responseSelector.addEventListener("change", onResponseChange);
tabScenesBtn.addEventListener("click", () => setActiveTab("scenes"));
tabJsonBtn.addEventListener("click", () => setActiveTab("json"));
copyPromptButton.addEventListener("click", copyPrompt);
refreshButton.addEventListener("click", refreshExtraction);
modeAutoBtn.addEventListener("click", () => {
  togglePreviewBtn.classList.add("hidden");
  setMode("auto");
});
modeManualBtn.addEventListener("click", () => {
  togglePreviewBtn.classList.add("hidden");
  setMode("manual");
});

togglePreviewBtn.addEventListener("click", () => {
  if (previewSection.classList.contains("hidden")) {
    previewSection.classList.remove("hidden");
    togglePreviewBtn.textContent = "Hide Preview";
  } else {
    previewSection.classList.add("hidden");
    togglePreviewBtn.textContent = "Show Preview";
  }
});

pinPopupBtn.addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 480,
    height: 600
  });
  window.close();
});

manualTextarea.addEventListener("input", () => {
  if (manualTextarea.value.trim().length > 0) {
    loadManualJson();
  }
});
saveButton.addEventListener("click", saveImport);
copyLogButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(messageEl.textContent);
    copyLogButton.textContent = "Copied!";
    setTimeout(() => { copyLogButton.textContent = "Copy log"; }, 1500);
  } catch { copyLogButton.textContent = "Failed"; }
});

manualTextarea.addEventListener("contextmenu", async (e) => {
  e.preventDefault();
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      manualTextarea.value = text;
      loadManualJson();
    }
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus("error", "Clipboard access denied. Please allow it or paste using Ctrl+V.");
    } else {
      setStatus("error", "Could not read clipboard. Please paste manually (Ctrl+V) and click Load.");
    }
  }
});

// Filename Input & Autocomplete Events (single merged handler)
filenameManualInput.addEventListener("input", () => {
  renderAutocomplete(filenameManualInput.value);
  updateFilenameButtons();
  checkSaveReady();
  if (latestExtraction && filenameManualInput.value.trim()) {
    const r = getSelectedResponse();
    if (r) setStatus("success", `${r.sceneCount} scene(s) ready. Save when ready.`);
  }
});

filenameManualInput.addEventListener("focus", () => {
  renderAutocomplete(filenameManualInput.value);
});

// Hide dropdown when clicking ANYWHERE outside the input+dropdown+buttons zone
document.addEventListener("mousedown", (e) => {
  const wrapper = document.querySelector(".filename-wrapper");
  if (wrapper && !wrapper.contains(e.target) && e.target !== filenameClearBtn && e.target !== videoPreviewBtn) {
    autocompleteList.classList.add("hidden");
  }
});

filenameClearBtn.addEventListener("mousedown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  filenameManualInput.value = "";
  hideVideoPreview();
  updateFilenameButtons();
  checkSaveReady();
  // Re-show dropdown after clearing
  filenameManualInput.focus();
  renderAutocomplete("");
});

videoPreviewBtn.addEventListener("mousedown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  toggleVideoPreview();
});

// Initialize extension with manual mode selected
setMode("manual");
