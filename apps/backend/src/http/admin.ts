import type { EntitlementKind } from "@super-x/contracts"
import { Hono, type Context } from "hono"
import { csrf } from "hono/csrf"
import { createMiddleware } from "hono/factory"
import { html } from "hono/html"
import { secureHeaders } from "hono/secure-headers"

import type { AdminUserRow, ConfigVersion, ErrorCountRow } from "../application"
import type { AppDeps, AppEnv } from "./context"
import { layout, message } from "./pages"

const STATUS: Record<EntitlementKind, string> = { student: "Élève", trial: "Essai", paid: "Payé", none: "Aucun" }
const OVERRIDE = { grant: "accès accordé", revoke: "accès retiré" } as const

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" })
const formatDate = (ms: number | null) => (ms === null ? "—" : dateFormat.format(ms))

/** Admin pages (SPEC "Admin"): web cookie session, role admin, same-origin POST forms. */
export function adminRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const adminUrl = `${deps.baseUrl}/admin`

  app.use("*", secureHeaders())
  // Form POSTs must come from this origin (Origin or Sec-Fetch-Site).
  app.use("*", csrf({ origin: new URL(deps.baseUrl).origin }))

  app.get("/login", async (c) => {
    const { headers, response } = await deps.auth.api.signInSocial({
      body: { provider: "google", callbackURL: adminUrl, errorCallbackURL: `${adminUrl}/login/error`, disableRedirect: true },
      returnHeaders: true,
    })
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true })
    return c.redirect(response.url ?? adminUrl, 302)
  })

  app.get("/login/error", (c) => c.html(message("Connexion impossible", "La connexion Google a échoué. Réessaie."), 400))

  app.post("/logout", async (c) => {
    const { headers } = await deps.auth.api.signOut({ headers: c.req.raw.headers, returnHeaders: true })
    for (const cookie of headers.getSetCookie()) c.header("set-cookie", cookie, { append: true })
    return c.redirect("/admin", 303)
  })

  app.use(
    "*",
    createMiddleware<AppEnv>(async (c, next) => {
      const session = await deps.auth.api.getSession({ headers: c.req.raw.headers })
      if (!session || session.user.role !== "admin") {
        return c.html(
          layout(
            "Accès refusé",
            html`<div class="center">
              <h1>Accès réservé aux administrateurs</h1>
              ${session
                ? html`<p class="muted">Connecté en tant que ${session.user.email}.</p>
                    <form method="post" action="/admin/logout"><button>Se déconnecter</button></form>`
                : html`<p><a href="/admin/login">Se connecter avec Google</a></p>`}
            </div>`
          ),
          403
        )
      }
      c.set("admin", { id: session.user.id, email: session.user.email })
      await next()
    })
  )

  const page = (c: Context<AppEnv>, title: string, body: ReturnType<typeof html>, status: 200 | 400 = 200) =>
    c.html(
      layout(
        title,
        body,
        html`<nav>
          <a class="brand" href="/admin">Cash Boost · Admin</a>
          <a href="/admin">Utilisateurs</a><a href="/admin/config">Config distante</a><a href="/admin/errors">Erreurs</a>
          <form method="post" action="/admin/logout"><span class="muted">${c.get("admin").email}</span> <button class="small">Déconnexion</button></form>
        </nav>`
      ),
      status
    )

  app.get("/", async (c) => {
    const q = c.req.query("q")?.trim() ?? ""
    const users = await deps.admin.users(q || undefined)
    return page(c, "Utilisateurs", usersPage(users, q))
  })

  app.post("/users/:id/override", async (c) => {
    const form = await c.req.parseBody()
    const value = form.override
    const override = value === "grant" || value === "revoke" ? value : null
    await deps.admin.setOverride(c.req.param("id"), override)
    const q = typeof form.q === "string" && form.q ? `?q=${encodeURIComponent(form.q)}` : ""
    return c.redirect(`/admin${q}`, 303)
  })

  app.post("/users/:id/student/unlink", async (c) => {
    const form = await c.req.parseBody()
    await deps.admin.unlinkStudent(c.req.param("id"))
    const q = typeof form.q === "string" && form.q ? `?q=${encodeURIComponent(form.q)}` : ""
    return c.redirect(`/admin${q}`, 303)
  })

  app.get("/config", async (c) => {
    const [config, history] = await Promise.all([deps.config.current(), deps.config.history()])
    const saved = c.req.query("saved")
    return page(
      c,
      "Config distante",
      configPage({
        version: config.version,
        text: JSON.stringify(config, null, 2),
        history,
        notice: saved ? `Version ${saved} enregistrée.` : undefined,
      })
    )
  })

  app.post("/config", async (c) => {
    const form = await c.req.parseBody()
    const text = typeof form.config === "string" ? form.config : ""
    const [current, history] = await Promise.all([deps.config.current(), deps.config.history()])
    let input: unknown
    try {
      input = JSON.parse(text)
    } catch {
      return page(c, "Config distante", configPage({ version: current.version, text, history, errors: ["JSON invalide."] }), 400)
    }
    const result = await deps.config.save(input, c.get("admin").email)
    if (!result.ok) {
      return page(c, "Config distante", configPage({ version: current.version, text, history, errors: result.issues }), 400)
    }
    return c.redirect(`/admin/config?saved=${result.config.version}`, 303)
  })

  app.get("/errors", async (c) => page(c, "Erreurs", errorsPage(await deps.config.errorCounts())))

  return app
}

function usersPage(users: AdminUserRow[], q: string) {
  const action = (user: AdminUserRow, value: "grant" | "revoke" | "clear", label: string) =>
    html`<form class="inline" method="post" action="/admin/users/${encodeURIComponent(user.id)}/override">
      <input type="hidden" name="override" value="${value}"><input type="hidden" name="q" value="${q}">
      <button class="small">${label}</button>
    </form>`
  return html`<h1>Utilisateurs</h1>
    <form method="get" action="/admin"><input type="search" name="q" value="${q}" placeholder="Rechercher un email"> <button>Rechercher</button></form>
    <h2>${users.length} compte${users.length > 1 ? "s" : ""}</h2>
    <table>
      <thead><tr><th>Email</th><th>Statut</th><th>Navigateur actif</th><th>Dernière vérif. élève</th><th>Inscrit le</th><th>Accès manuel</th></tr></thead>
      <tbody>
        ${users.map(
          (user) => html`<tr>
            <td>${user.email}${user.role === "admin" ? html` <span class="badge">admin</span>` : ""}
              ${user.studentEmail
                ? html`<div class="muted">achat Growth Boost : ${user.studentEmail}
                    <form class="inline" method="post" action="/admin/users/${encodeURIComponent(user.id)}/student/unlink">
                      <input type="hidden" name="q" value="${q}"><button class="small">Délier</button>
                    </form></div>`
                : ""}</td>
            <td><span class="badge ${user.status}">${STATUS[user.status]}</span>
              ${user.override ? html`<div class="muted">${OVERRIDE[user.override]}</div>` : ""}</td>
            <td><code>${user.activeBrowserId ?? "—"}</code></td>
            <td>${formatDate(user.studentCheckedAt)}</td>
            <td>${formatDate(user.createdAt)}</td>
            <td>${action(user, "grant", "Accorder")} ${action(user, "revoke", "Retirer")}
              ${user.override ? action(user, "clear", "Réinitialiser") : ""}</td>
          </tr>`
        )}
      </tbody>
    </table>`
}

function configPage(props: { version: number; text: string; history: ConfigVersion[]; notice?: string | undefined; errors?: string[] }) {
  return html`<h1>Config distante <span class="muted">· version ${props.version}</span></h1>
    ${props.notice ? html`<p class="notice">${props.notice}</p>` : ""}
    ${props.errors
      ? html`<div class="notice error"><strong>Config refusée :</strong><ul>${props.errors.map((e) => html`<li>${e}</li>`)}</ul></div>`
      : ""}
    <form method="post" action="/admin/config">
      <textarea name="config" spellcheck="false">${props.text}</textarea>
      <p class="muted">Le champ <code>version</code> est ignoré : chaque enregistrement crée une nouvelle version.</p>
      <button class="primary">Enregistrer une nouvelle version</button>
    </form>
    <h2>Historique</h2>
    ${props.history.length === 0
      ? html`<p class="muted">Aucune version enregistrée : la config par défaut (version 0) est servie.</p>`
      : html`<table>
          <thead><tr><th>Version</th><th>Date</th><th>Par</th></tr></thead>
          <tbody>${props.history.map((v) => html`<tr><td>${v.version}</td><td>${formatDate(v.createdAt)}</td><td>${v.createdBy}</td></tr>`)}</tbody>
        </table>`}`
}

function errorsPage(rows: ErrorCountRow[]) {
  const versions = [...new Set(rows.map((row) => row.configVersion))]
  return html`<h1>Erreurs X remontées</h1>
    <p class="muted">Codes d'erreur sans contenu, comptés par version de config distante et version de l'extension.</p>
    ${versions.length === 0
      ? html`<p class="muted">Aucune erreur remontée.</p>`
      : versions.map((version) => {
          const group = rows.filter((row) => row.configVersion === version)
          const total = group.reduce((sum, row) => sum + row.count, 0)
          return html`<h2>Config v${version} <span class="muted">· ${total}</span></h2>
            <table>
              <thead><tr><th>Code</th><th>Extension</th><th>Nombre</th></tr></thead>
              <tbody>${group.map((row) => html`<tr><td><code>${row.code}</code></td><td>${row.extensionVersion}</td><td>${row.count}</td></tr>`)}</tbody>
            </table>`
        })}`
}
