'use strict';

// ─── State ───────────────────────────────────────────────────────────────────

let traces = [];
let currentIndex = 0;
let saveTimer = null;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function annotationKey(traceId) {
  return `trace-annotation:${traceId}`;
}

function loadAnnotation(traceId) {
  return localStorage.getItem(annotationKey(traceId)) || '';
}

function persistAnnotation(traceId, text) {
  if (text.trim()) {
    localStorage.setItem(annotationKey(traceId), text);
  } else {
    localStorage.removeItem(annotationKey(traceId));
  }
}

function countReviewed() {
  return traces.filter(t => loadAnnotation(t.id).trim() !== '').length;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function navigate(delta) {
  const next = currentIndex + delta;
  if (next < 0 || next >= traces.length) return;

  // Flush current annotation before leaving
  flushAnnotation();

  currentIndex = next;
  renderTrace();
  updateHeader();
  scrollColumnsToTop();
}

function flushAnnotation() {
  const trace = traces[currentIndex];
  if (!trace) return;
  persistAnnotation(trace.id, feedbackEl().value);
}

function scrollColumnsToTop() {
  document.getElementById('input-content').scrollTop = 0;
  document.getElementById('output-content').scrollTop = 0;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function updateHeader() {
  const trace = traces[currentIndex];
  const reviewed = countReviewed();
  const total = traces.length;

  // Trace counter
  document.getElementById('trace-counter').textContent =
    `Trace ${currentIndex + 1} of ${total}`;

  // Trace metadata (span id + model)
  const parts = [];
  if (trace.span_id) parts.push(trace.span_id);
  if (trace.metadata?.model) parts.push(trace.metadata.model);
  if (trace.metadata?.experiment) parts.push(trace.metadata.experiment);
  document.getElementById('trace-meta').textContent = parts.join('  ·  ');

  // Progress badge
  const badge = document.getElementById('progress-badge');
  badge.textContent = `${reviewed} / ${total} reviewed`;
  badge.classList.toggle('has-reviews', reviewed > 0);

  // Nav buttons
  document.getElementById('prev-btn').disabled = currentIndex === 0;
  document.getElementById('next-btn').disabled = currentIndex === total - 1;
}

function renderTrace() {
  const trace = traces[currentIndex];
  const messages = trace.messages || [];

  // Split messages into input vs output columns.
  // Input:  system, user, tool (tool results returned to model)
  // Output: assistant (responses + embedded tool calls)
  const inputMsgs = messages.filter(m =>
    m.role === 'system' || m.role === 'user' || m.role === 'tool'
  );
  const outputMsgs = messages.filter(m => m.role === 'assistant');

  document.getElementById('input-content').innerHTML =
    inputMsgs.length ? inputMsgs.map(renderMessage).join('') : emptyCol('No input messages');

  document.getElementById('output-content').innerHTML =
    outputMsgs.length ? outputMsgs.map(renderMessage).join('') : emptyCol('No output messages');

  // Load saved annotation
  feedbackEl().value = loadAnnotation(trace.id);
  setSaveIndicator('idle');
}

function emptyCol(label) {
  return `<div class="empty-col">${escHtml(label)}</div>`;
}

// ─── Message rendering ────────────────────────────────────────────────────────

const ROLE_LABELS = {
  system: 'System',
  user: 'User',
  assistant: 'Assistant',
  tool: 'Tool Result',
};

function renderMessage(msg) {
  const roleClass = `msg-${msg.role}`;
  const roleLabel = ROLE_LABELS[msg.role] || msg.role;

  let bodyHtml = '';

  // Text content
  if (msg.content != null && msg.content !== '') {
    bodyHtml += renderContent(msg.content);
  }

  // Tool calls embedded in assistant messages
  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    bodyHtml += msg.tool_calls.map(renderToolCall).join('');
  }

  // Per-turn metadata strip
  const metaHtml = renderMeta(msg.metadata);

  return `
    <div class="message ${roleClass}">
      <div class="message-role-tag">${escHtml(roleLabel)}</div>
      ${bodyHtml}
      ${metaHtml}
    </div>
  `;
}

// Render message text content, handling code blocks and pure-JSON blobs.
function renderContent(content) {
  if (typeof content !== 'string') {
    content = JSON.stringify(content, null, 2);
  }

  const trimmed = content.trim();

  // Entire content is a JSON blob → pretty-print in monospace
  if (looksLikeJson(trimmed)) {
    const pretty = tryPrettyJson(trimmed);
    return `<div class="message-body is-code">${escHtml(pretty)}</div>`;
  }

  // Content has fenced code blocks → split and render mixed
  if (trimmed.includes('```')) {
    return `<div class="message-body">${renderFencedBlocks(content)}</div>`;
  }

  // Plain prose
  return `<div class="message-body">${escHtml(content)}</div>`;
}

// Split on ```...``` fences and render code sections in monospace.
function renderFencedBlocks(text) {
  // Splits into alternating [prose, code, prose, code, ...] segments
  const parts = text.split(/(```[^\n]*\n[\s\S]*?```)/g);
  return parts.map(part => {
    if (part.startsWith('```')) {
      // Strip opening fence (with optional lang tag) and closing fence
      const code = part.replace(/^```[^\n]*\n?/, '').replace(/```$/, '');
      return `<code class="code-block">${escHtml(code)}</code>`;
    }
    // Plain prose segment — escape and preserve whitespace
    return escHtml(part);
  }).join('');
}

function renderToolCall(tc) {
  const name = tc.function?.name || 'unknown_tool';
  const rawArgs = tc.function?.arguments || '';
  const prettyArgs = tryPrettyJson(rawArgs);

  return `
    <div class="tool-call">
      <div class="tool-call-header">
        <span class="tool-call-arrow">&#8594;</span>
        <span class="tool-call-name">${escHtml(name)}</span>
      </div>
      <div class="tool-call-args">${escHtml(prettyArgs)}</div>
    </div>
  `;
}

function renderMeta(meta) {
  if (!meta || typeof meta !== 'object') return '';
  const entries = Object.entries(meta);
  if (entries.length === 0) return '';
  const text = entries.map(([k, v]) => `${k}: ${v}`).join('  ·  ');
  return `<div class="message-meta">${escHtml(text)}</div>`;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function looksLikeJson(str) {
  return (
    (str.startsWith('{') && str.endsWith('}')) ||
    (str.startsWith('[') && str.endsWith(']'))
  );
}

function tryPrettyJson(str) {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch (_) {
    return str;
  }
}

function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function feedbackEl() {
  return document.getElementById('feedback-text');
}

// ─── Save indicator ───────────────────────────────────────────────────────────

function setSaveIndicator(state) {
  const el = document.getElementById('save-indicator');
  el.classList.remove('saving', 'saved-ok');
  if (state === 'saving') {
    el.textContent = 'Saving…';
    el.classList.add('saving');
  } else if (state === 'saved') {
    el.textContent = '✓ Saved';
    el.classList.add('saved-ok');
  } else {
    el.textContent = loadAnnotation(traces[currentIndex]?.id || '').trim()
      ? '✓ Saved'
      : '';
    if (el.textContent) el.classList.add('saved-ok');
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Arrow key navigation — works even when the feedback textarea is focused.
// We intercept at the window level with capture so the textarea's own
// arrow-key handling fires second. Then we prevent default so the cursor
// doesn't also move within the text box.
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    navigate(-1);
  } else if (e.key === 'ArrowRight' && !e.altKey && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    navigate(1);
  }
}, true /* capture phase */);

document.getElementById('prev-btn').addEventListener('click', () => navigate(-1));
document.getElementById('next-btn').addEventListener('click', () => navigate(1));

// Auto-save annotation with debounce
feedbackEl().addEventListener('input', () => {
  setSaveIndicator('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const trace = traces[currentIndex];
    if (trace) {
      persistAnnotation(trace.id, feedbackEl().value);
      setSaveIndicator('saved');
      updateHeader(); // refresh "reviewed" count
    }
  }, 600);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const resp = await fetch('data/traces.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    traces = await resp.json();
  } catch (err) {
    document.getElementById('input-content').innerHTML =
      `<div class="empty-col" style="color:#ff3b30">
         Failed to load traces.json: ${escHtml(String(err))}<br><br>
         Run a local server, e.g.:<br>
         <code style="font-family:monospace">python3 -m http.server 8080</code>
       </div>`;
    return;
  }

  if (!traces.length) {
    document.getElementById('input-content').innerHTML =
      emptyCol('traces.json is empty');
    return;
  }

  currentIndex = 0;
  renderTrace();
  updateHeader();
}

init();
