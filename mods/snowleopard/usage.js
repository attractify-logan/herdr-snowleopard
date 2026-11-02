// Subscription usage: how much of Claude's and Codex's plan limits is used, for
// the menu bar's usage extra (menubar.js) and its menu. Every 5 minutes (and
// when the menu opens) a small shell script runs on the machine with the most
// agents (then the others, then this Mac) and asks each service's own usage
// endpoint, with the login its CLI already keeps there:
//   Claude  ~/.claude/.credentials.json, or the Mac Keychain's "Claude Code-credentials"
//   Codex   ~/.codex/auth.json, or Pi's ~/.pi/agent/auth.json ("openai-codex")
// The tokens never leave that machine (curl reads its headers from stdin, so
// they aren't in the process list); only the usage JSON comes back. The result
// is shared "sl.usage" = { claude, codex, from }, each service { name, plan,
// windows: [{ label, pct, resets }], extra }, written only when it changes.

import { exec, machines, spaces, agents, shared, setShared, knownAgents } from "herdr";

const EVERY = 5 * 60 * 1000;

// A file of ready-made lines (`claude max {...}`, `codex - {...}`) in Herdr's
// folder stands in for both services: demo data for screenshots.
const SCRIPT = `
d="$HOME/.config/herdr-app/usage-demo.txt"
if [ -f "$d" ]; then cat "$d"; exit 0; fi
j=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null || cat "$HOME/.claude/.credentials.json" 2>/dev/null)
t=$(printf %s "$j" | grep -o '"accessToken" *: *"[^"]*"' | head -1 | sed 's/.*"\\([^"]*\\)"$/\\1/')
p=$(printf %s "$j" | grep -o '"subscriptionType" *: *"[^"]*"' | head -1 | sed 's/.*"\\([^"]*\\)"$/\\1/')
if [ -n "$t" ]; then
  r=$(printf 'Authorization: Bearer %s\\n' "$t" | curl -fsS -m 10 -H @- -H 'anthropic-beta: oauth-2025-04-20' https://api.anthropic.com/api/oauth/usage 2>/dev/null | tr -d '\\n')
  [ -n "$r" ] && printf 'claude %s %s\\n' "\${p:-?}" "$r"
fi
a=""; id=""
if [ -f "$HOME/.codex/auth.json" ]; then
  j=$(tr -d '\\n' < "$HOME/.codex/auth.json")
  a=$(printf %s "$j" | grep -o '"access_token" *: *"[^"]*"' | head -1 | sed 's/.*"\\([^"]*\\)"$/\\1/')
  id=$(printf %s "$j" | grep -o '"account_id" *: *"[^"]*"' | head -1 | sed 's/.*"\\([^"]*\\)"$/\\1/')
fi
if [ -z "$a" ] && [ -f "$HOME/.pi/agent/auth.json" ]; then
  c=$(tr -d '\\n' < "$HOME/.pi/agent/auth.json" | sed -n 's/.*"openai-codex" *: *{\\([^}]*\\)}.*/\\1/p')
  a=$(printf %s "$c" | grep -o '"access" *: *"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')
  id=$(printf %s "$c" | grep -o '"accountId" *: *"[^"]*"' | sed 's/.*"\\([^"]*\\)"$/\\1/')
fi
if [ -n "$a" ]; then
  r=$(printf 'Authorization: Bearer %s\\nChatGPT-Account-Id: %s\\n' "$a" "$id" | curl -fsS -m 10 -H @- -H 'User-Agent: codex_cli_rs' https://chatgpt.com/backend-api/wham/usage 2>/dev/null | tr -d '\\n')
  [ -n "$r" ] && printf 'codex - %s\\n' "$r"
fi
true
`;

// Kept across the mod's copies and reloads (tasks aren't, so busy times out).
const U = (globalThis.__snowleopardUsage ??= { at: 0, busy: 0, icons: null });

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

const WINDOW_NAMES = { 18000: "5-hour limit", 604800: "Weekly limit", 2592000: "30-day limit" };

function claude(plan, j) {
  const windows = [];
  const add = (key, label) => {
    const w = j?.[key];
    if (w && Number.isFinite(w.utilization)) windows.push({ label, pct: w.utilization, resets: w.resets_at ?? null });
  };
  add("five_hour", "5-hour limit");
  add("seven_day", "Weekly limit");
  add("seven_day_opus", "Weekly Opus limit");
  add("seven_day_sonnet", "Weekly Sonnet limit");
  // Extra usage, when it's on, comes as a dollar budget under a code name.
  let extra = null;
  for (const v of Object.values(j ?? {}))
    if (v && Number.isFinite(v.limit_dollars) && Number.isFinite(v.used_dollars)) extra = { used: v.used_dollars, limit: v.limit_dollars, resets: v.resets_at ?? null };
  return { name: "Claude", plan: plan && plan !== "?" ? cap(plan) : "", windows, extra };
}

function codex(j) {
  const windows = [];
  for (const w of [j?.rate_limit?.primary_window, j?.rate_limit?.secondary_window])
    if (w && Number.isFinite(w.used_percent))
      windows.push({
        label: WINDOW_NAMES[w.limit_window_seconds] ?? `${Math.round(w.limit_window_seconds / 3600)}-hour limit`,
        pct: w.used_percent,
        resets: w.reset_at ? new Date(w.reset_at * 1000).toISOString() : null,
      });
  return { name: "Codex", plan: j?.plan_type ? cap(j.plan_type) : "", windows, extra: null };
}

/** Machines to ask, the one running the most agents first, This Mac last on a tie. */
function order() {
  const all = spaces();
  const load = (name) => agents().filter((a) => (all.find((s) => s.id === a.space)?.machine ?? null) === name).length;
  return machines()
    .filter((m) => !m.name || m.layout === "ready")
    .map((m) => m.name ?? null)
    .sort((a, b) => load(b) - load(a) || (a ? -1 : 0) - (b ? -1 : 0));
}

/** Asks again (at most every 5 minutes unless now). */
export async function refreshUsage(now = false) {
  const t = Date.now();
  if (U.busy && t - U.busy < 60000) return;
  if (!now && t - U.at < EVERY) return;
  U.busy = t;
  try {
    const out = { claude: null, codex: null, from: null };
    let asked = 0;
    for (const on of order()) {
      if (out.claude && out.codex) break;
      const r = await exec("sh", ["-c", SCRIPT], on ? { on } : {}).catch(() => null);
      if (r) asked++;
      for (const line of (r?.stdout ?? "").split("\n")) {
        const m = line.match(/^(claude|codex) (\S+) (\{.*\})$/);
        if (!m || out[m[1]]) continue;
        let j = null;
        try {
          j = JSON.parse(m[3]);
        } catch {
          continue;
        }
        const s = m[1] === "claude" ? claude(m[2], j) : codex(j);
        if (s.windows.length || s.extra) {
          out[m[1]] = s;
          out.from ??= on ?? "This Mac";
        }
      }
    }
    // No machine answered (at launch Herdr may not know them yet): keep the last numbers
    // and ask again on the next minute's tick.
    if (!asked) return;
    U.at = Date.now();
    if (JSON.stringify(out) !== JSON.stringify(shared("sl.usage") ?? null)) setShared("sl.usage", out);
  } finally {
    U.busy = 0;
  }
}

/** The program icons for Claude and Codex: from a running agent's program, else
 *  Herdr's known agents (asked once). */
export function usageIcons() {
  if (!U.icons) {
    U.icons = {};
    knownAgents()
      .then((list) => {
        for (const a of list) {
          if (/claude/i.test(a.name) && a.icon) U.icons.claude ??= a;
          if (/codex/i.test(a.name) && a.icon) U.icons.codex ??= a;
        }
      })
      .catch(() => {});
  }
  if (!U.icons.claude || !U.icons.codex)
    for (const a of agents()) {
      const p = a.program;
      if (!p?.icon) continue;
      if (/claude/i.test(p.name)) U.icons.claude ??= p;
      if (/codex/i.test(p.name)) U.icons.codex ??= p;
    }
  return U.icons;
}

/** The fullest window of a service (percent used): its gauge shows what's left of it. */
export function topPct(s) {
  return s?.windows?.length ? Math.max(...s.windows.map((w) => w.pct)) : null;
}

function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const pm = h >= 12;
  h = h % 12 || 12;
  const time = `${h}:${m} ${pm ? "PM" : "AM"}`;
  if (d - Date.now() < 20 * 3600 * 1000) return `resets ${time}`;
  return `resets ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]} ${time}`;
}

/** The usage extra's menu: what's left of each service's limits, in plain words. */
export function usageItems() {
  const u = shared("sl.usage");
  const items = [];
  for (const s of [u?.claude, u?.codex]) {
    if (!s) continue;
    if (items.length) items.push({ sep: true });
    items.push({ label: s.plan ? `${s.name} (${s.plan})` : s.name, header: true });
    for (const w of s.windows) items.push({ label: w.label, detail: `${Math.max(0, Math.round(100 - w.pct))}% left${w.resets ? `, ${when(w.resets)}` : ""}` });
    if (s.extra) items.push({ label: "Extra usage", detail: `$${Math.max(0, Math.round(s.extra.limit - s.extra.used))} of $${Math.round(s.extra.limit)} left` });
  }
  if (!items.length) items.push({ label: "No Claude or Codex login found", disabled: true });
  items.push({ sep: true });
  const at = U.at ? new Date(U.at) : null;
  if (at) items.push({ label: `Updated ${when(at.toISOString()).replace("resets ", "")}${u?.from ? ` from ${u.from}` : ""}`, disabled: true });
  items.push({ label: "Check Now", act: { run: ["snowleopard.usage"] } });
  return items;
}
