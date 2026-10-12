import { html } from "hono/html"
import type { HtmlEscapedString } from "hono/utils/html"

type Html = HtmlEscapedString | Promise<HtmlEscapedString>

const STYLE = `
:root{--bg:#fff;--fg:#0f1419;--muted:#536471;--border:#e5e7eb;--card:#f7f9f9;--primary:#1d9bf0;--danger:#dc2626;--ok:#16a34a}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#e7e9ea;--muted:#a1a1aa;--border:#27272a;--card:#18181b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}h1{font-size:20px;margin:0 0 16px}h2{font-size:16px;margin:24px 0 8px}
a{color:var(--primary);text-decoration:none}a:hover{text-decoration:underline}
nav{display:flex;gap:16px;align-items:center;border-bottom:1px solid var(--border);padding:12px 16px}nav .brand{font-weight:600;color:var(--fg)}nav form{margin-left:auto}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--border);vertical-align:top}th{color:var(--muted);font-weight:500}
code,textarea{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}textarea{width:100%;min-height:480px;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--fg)}
input[type=search]{padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--fg);min-width:260px}
button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg);cursor:pointer}
button.primary{background:var(--primary);border-color:var(--primary);color:#fff}button.small{padding:2px 8px;font-size:12px}
.inline{display:inline}.muted{color:var(--muted)}.badge{display:inline-block;padding:0 8px;border-radius:999px;border:1px solid var(--border);font-size:12px}
.badge.student,.badge.paid{border-color:var(--ok);color:var(--ok)}.badge.trial{border-color:var(--primary);color:var(--primary)}
.notice{padding:10px 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);margin:0 0 16px}.notice.error{border-color:var(--danger);color:var(--danger)}
.center{max-width:480px;margin:15vh auto;text-align:center;padding:0 16px}
`

export function layout(title: string, body: Html, nav?: Html) {
  return html`<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title} · Cash Boost</title><style>${STYLE}</style></head>
<body>${nav ?? ""}<main>${body}</main></body>
</html>`
}

export function message(title: string, text: string) {
  return layout(title, html`<div class="center"><h1>${title}</h1><p class="muted">${text}</p></div>`)
}
