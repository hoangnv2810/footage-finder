const VIDEO_FILENAME_RE = /\b[^\\/\s"'`<>]+\.(?:mp4|mov|avi|mkv|webm)\b/gi;

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function hasSceneMarkers(text) {
  return text.includes('"keyword"') && text.includes('"start"') && text.includes('"end"');
}

// ─── Text cleaning strategies ───

// Strip invisible characters that break JSON.parse
function sanitize(text) {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\uFEFF/g, "")
    .replace(/\u200B/g, "")
    .replace(/\u200C/g, "")
    .replace(/\u200D/g, "")
    .replace(/\u2028/g, "\n")
    .replace(/\u2029/g, "\n")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
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

function tryParse(text) {
  try {
    const p = JSON.parse(text);
    if (Array.isArray(p) && p.length > 0) return p;
  } catch {}
  const a = text.indexOf("["), b = text.lastIndexOf("]");
  if (a !== -1 && b > a) {
    try {
      const p = JSON.parse(text.slice(a, b + 1));
      if (Array.isArray(p) && p.length > 0) return p;
    } catch {}
  }
  return null;
}

function parseJsonArray(raw) {
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

  // Last resort: regex extract JSON objects
  const best = cleanLeading(raw);
  const om = best.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
  if (om && om.length > 0) {
    const result = tryParse("[" + om.join(",") + "]");
    if (result) return result;
  }

  return null;
}

// ─── DOM collection ───

function getNthParent(el, n) {
  let c = el;
  for (let i = 0; i < n; i++) {
    if (!c.parentElement) return null;
    c = c.parentElement;
  }
  return c;
}

/**
 * Drill DOWN into element to find smallest descendant with scene markers.
 * This separates code-content from line-number gutter.
 */
function findDeepestWithMarkers(el) {
  const text = (el.innerText || el.textContent || "").trim();
  if (text.length < 30 || !hasSceneMarkers(cleanLeading(text))) return null;

  let best = { text, len: text.length };
  for (const child of el.children) {
    const childText = (child.innerText || child.textContent || "").trim();
    if (childText.length > 30 && hasSceneMarkers(cleanLeading(childText)) && childText.length < best.len) {
      best = { text: childText, len: childText.length };
      const deeper = findDeepestWithMarkers(child);
      if (deeper && deeper.len < best.len) best = deeper;
    }
  }
  return best;
}

/**
 * Find individual code blocks by locating "json" header labels.
 * Each "json" header → drill into closest sibling to find code body.
 */
function collectIndividualCodeBlocks() {
  const blocks = [];

  document.querySelectorAll("*").forEach((el) => {
    const ownText = (el.innerText || el.textContent || "").trim().toLowerCase();
    if (ownText !== "json" || el.children.length > 2) return;

    for (let depth = 0; depth < 3; depth++) {
      const container = depth === 0 ? el : getNthParent(el, depth);
      if (!container) continue;

      const sibling = container.nextElementSibling;
      if (sibling) {
        const deep = findDeepestWithMarkers(sibling);
        if (deep) { blocks.push(deep.text); return; }
      }

      if (container.parentElement) {
        for (const child of container.parentElement.children) {
          if (child === container) continue;
          const deep = findDeepestWithMarkers(child);
          if (deep) { blocks.push(deep.text); return; }
        }
      }
    }
  });

  return blocks;
}

function collectFallbackCandidates() {
  const candidates = [];

  const chat =
    document.getElementById("chat-messages-scroll-container") ||
    document.querySelector("[class*='chat-messages']") ||
    document.querySelector("main");

  if (chat) {
    chat.querySelectorAll("div, section, pre, code").forEach((el) => {
      const text = (el.innerText || el.textContent || "").trim();
      if (text.length > 50 && hasSceneMarkers(cleanLeading(text))) {
        candidates.push(text);
      }
    });
  }

  if (candidates.length === 0) {
    document.querySelectorAll("pre, code, div").forEach((el) => {
      if (el.children.length > 30) return;
      const text = (el.innerText || el.textContent || "").trim();
      if (text.length > 50 && hasSceneMarkers(cleanLeading(text))) {
        candidates.push(text);
      }
    });
  }

  return unique(candidates).sort((a, b) => a.length - b.length);
}

function collectFilenames() {
  const bodyText = (document.body.innerText || document.body.textContent || "").trim();
  return unique(bodyText.match(VIDEO_FILENAME_RE) || []);
}

// ─── Main extraction ───

function extractAllAnalyses(manualFilename) {
  let rawCandidates = collectIndividualCodeBlocks();
  if (rawCandidates.length === 0) {
    rawCandidates = collectFallbackCandidates();
  }

  if (rawCandidates.length === 0) {
    throw new Error(
      "Không tìm thấy JSON array trong trang. " +
      "Hãy chắc rằng Qwen đã trả kết quả JSON và đang hiển thị trên màn hình."
    );
  }

  const seenSignatures = new Set();
  const allResponses = [];
  const debugSnippets = [];

  for (const raw of rawCandidates) {
    const scenes = parseJsonArray(raw);
    if (!scenes || scenes.length === 0) {
      debugSnippets.push(cleanLeading(raw).substring(0, 120));
      continue;
    }

    const sig = scenes.map(s => `${s.keyword || ""}:${s.start}:${s.end}`).join("|");
    if (seenSignatures.has(sig)) continue;
    seenSignatures.add(sig);

    allResponses.push({ scenes, sceneCount: scenes.length, rawText: raw });
  }

  if (allResponses.length === 0) {
    throw new Error(
      "Tìm thấy text có scene markers nhưng không parse được JSON.\n" +
      "Debug snippet: " + JSON.stringify(debugSnippets[0] || "(empty)")
    );
  }

  allResponses.sort((a, b) => b.sceneCount - a.sceneCount);
  const filenames = collectFilenames();

  return {
    filename: manualFilename || filenames[filenames.length - 1] || null,
    filenameAutoDetected: filenames.length > 0,
    allResponses,
    selectedIndex: 0,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "extract-analysis") {
    try {
      const data = extractAllAnalyses(message.manualFilename || null);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown extraction error.",
      });
    }
  }
  return true;
});
