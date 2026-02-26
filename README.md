# Trace Annotator

A minimal web app for reviewing multi-turn conversational traces and recording structured feedback.

## Quick start

```bash
# From the project root, start a local server:
python3 -m http.server 8080

# Then open:
# http://localhost:8080
```

Any static file server works (Node's `npx serve`, Caddy, nginx, etc.).

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Trace Annotator   Trace 1 of 6  ·  span_…  │  3/6 reviewed │  ← Prev  Next →  │
├──────────────────┬──────────────────┬────────────────────────┤
│      INPUT       │      OUTPUT      │       FEEDBACK         │
│                  │                  │                        │
│  System prompt   │  Assistant msgs  │  [ multiline notes ]   │
│  User messages   │  Tool calls      │                        │
│  Tool results    │                  │                        │
│  (scrollable)    │  (scrollable)    │                        │
└──────────────────┴──────────────────┴────────────────────────┘
```

## Navigation

| Key / Action       | Effect                    |
|--------------------|---------------------------|
| `←` Left arrow     | Previous trace            |
| `→` Right arrow    | Next trace                |
| Prev / Next buttons | Navigate (mouse-friendly) |

Arrow keys work from anywhere — including while the cursor is inside the Feedback box.

## Trace format

Traces are loaded from `data/traces.json`. Each trace is an object with:

```jsonc
{
  "id": "trace-001",           // unique identifier (required)
  "span_id": "span_abc123",    // Braintrust span id (optional)
  "root_span_id": "root_xyz",  // Braintrust root span id (optional)
  "metadata": {
    "model": "claude-3-5-sonnet-20241022",
    "temperature": 0.7,
    "experiment": "my-eval-v1",
    "timestamp": "2024-11-15T10:22:04Z"
  },
  "messages": [
    // Roles: "system" | "user" | "assistant" | "tool"
    { "role": "system",    "content": "You are …" },
    { "role": "user",      "content": "Hello!",
      "metadata": { "turn": 1, "user_id": "u_42" } },
    { "role": "assistant", "content": "Hi there!",
      "tool_calls": [
        { "id": "call_1", "type": "function",
          "function": { "name": "search", "arguments": "{\"q\":\"…\"}" } }
      ],
      "metadata": { "latency_ms": 800 } },
    { "role": "tool", "tool_call_id": "call_1", "content": "{\"result\":\"…\"}" }
  ]
}
```

**Column mapping:**
- **Input** — `system`, `user`, and `tool` (tool result) messages
- **Output** — `assistant` messages (including embedded tool calls)

## Annotations

Feedback is auto-saved to `localStorage` as you type. No server-side persistence is required. A trace counts as "reviewed" once its feedback box contains any non-empty text.

To export annotations run the following in the browser console:

```js
const out = {};
for (let i = 0; i < localStorage.length; i++) {
  const k = localStorage.key(i);
  if (k.startsWith('trace-annotation:')) out[k] = localStorage.getItem(k);
}
console.log(JSON.stringify(out, null, 2));
```
