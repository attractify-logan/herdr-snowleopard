// Slack's unread messages, watched in the background so you can tell there's
// something new without the Slack tab in front: a count beside each
// conversation in Slack's list, a red badge on Slack's Dock icon (direct
// messages, group messages and mentions, as Slack's own badge counts), and a
// banner for a new direct message or mention. Clicking the banner opens it.
//
// The Dock runs the watch (it's always on screen; one copy at a time): every
// 10 s it checks a few conversations, direct and group messages first, with
// conversations.info (Slack's last read mark) and, when something's newer,
// conversations.history for the count. Reading a conversation in Herdr marks
// it read here and, where the token may, in Slack too.
//
// The Slack window (slack.js) shares the connection kept here (KEEP).
//
// With ~/.config/herdr-app/slack-demo present it answers from a made-up
// workspace instead (slack-demo.js) and never calls Slack.

import { exec, shared, setShared } from "herdr";
import { winState, slackTab, dockApps, appName, appIcon } from "./kit.js";
import { demoApi } from "./slack-demo.js";
import { showBanner } from "./notice.js";

export const KEYCHAIN = "herdr-snowleopard-slack";

// What Slack knows, kept across the window's copies (a resize, zoom or restore
// reopens it) and shared with the watch. A mod reload starts it over.
export const KEEP = (globalThis.__snowleopardSlack ??= { token: null, me: null, users: new Map(), convs: [], cur: null, msgs: new Map(), thread: null });
// Apps and bots (their direct messages list under Apps), and display names by @handle (group DMs are named by handles).
KEEP.bots ??= new Set();
KEEP.handles ??= new Map();
const W = (globalThis.__snowleopardSlackWatch ??= { owner: null, beat: 0, busy: 0, tokenAt: 0, convsAt: 0, dm: 0, ch: 0, unread: {}, base: {}, last: null });

const form = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");

export const DEMO = "demo";

/** Is the demo switched on (a file in Herdr's folder)? */
export async function demoOn() {
  const r = await exec("/bin/sh", ["-c", '[ -f "$HOME/.config/herdr-app/slack-demo" ]']).catch(() => null);
  return r?.code === 0;
}

/** The token kept in the Keychain, the demo's, or "". */
export async function savedToken() {
  if (await demoOn()) return DEMO;
  const r = await exec("security", ["find-generic-password", "-s", KEYCHAIN, "-w"]);
  return r.code === 0 ? r.stdout.trim() : "";
}

export async function slackApi(token, method, params = {}) {
  if (token === DEMO) return demoApi(method, params);
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
    body: form(params),
  });
  if (r.status === 429) throw new Error("Slack asked to slow down; trying again shortly.");
  const j = await r.json();
  if (!j.ok) throw new Error(j.error ?? "Slack said no");
  return j;
}

/** Checks a token and keeps who it is. A bot token (xoxb-) sees the bot's conversations, not yours. */
export async function slackSignIn(token) {
  const who = await slackApi(token, "auth.test");
  KEEP.token = token;
  KEEP.me = { user: who.user_id, team: who.team, teamId: who.team_id, bot: token.startsWith("xoxb-"), name: who.user };
  return KEEP.me;
}

export async function loadUsers() {
  let cursor;
  for (let page = 0; page < 10; page++) {
    const j = await slackApi(KEEP.token, "users.list", { limit: 200, cursor });
    for (const u of j.members ?? []) {
      const name = u.profile?.display_name || u.real_name || u.name;
      KEEP.users.set(u.id, name);
      if (u.name) KEEP.handles.set(u.name, name);
      if (u.is_bot || u.is_app_user || u.id === "USLACKBOT") KEEP.bots.add(u.id);
    }
    cursor = j.response_metadata?.next_cursor;
    if (!cursor) break;
  }
}

export async function loadConvs() {
  const out = [];
  let cursor;
  for (let page = 0; page < 10; page++) {
    const j = await slackApi(KEEP.token, "users.conversations", { types: "public_channel,private_channel,mpim,im", exclude_archived: true, limit: 200, cursor });
    for (const c of j.channels ?? []) {
      if (c.is_im) {
        if (c.is_user_deleted) continue;
        const name = KEEP.users.get(c.user) ?? c.user;
        if (KEEP.bots.has(c.user)) out.push({ id: c.id, kind: "app", name });
        else out.push({ id: c.id, kind: "dm", name: c.user === KEEP.me?.user ? `${name} (you)` : name });
      } else if (c.is_mpim) {
        // mpdm-ann--bo--me-1: everyone but you, by name.
        const handles = (c.name ?? "").replace(/^mpdm-/, "").replace(/-\d+$/, "").split("--");
        const others = handles.filter((h) => h !== KEEP.me?.name);
        out.push({ id: c.id, kind: "group", name: (others.length ? others : handles).map((h) => KEEP.handles.get(h) ?? h).join(", ") });
      } else out.push({ id: c.id, kind: c.is_private ? "private" : "channel", name: c.name });
    }
    cursor = j.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  const lower = (s) => s.toLowerCase();
  KEEP.convs = out.sort((a, b) => (lower(a.name) < lower(b.name) ? -1 : lower(a.name) > lower(b.name) ? 1 : 0));
  W.convsAt = Date.now();
  // Direct messages list newest first: the time of each one's latest message, once, for those not known yet.
  const known = latest();
  const missing = KEEP.convs.filter((c) => direct(c) && !known[c.id]).slice(0, 40);
  if (missing.length) {
    const got = {};
    for (const c of missing) {
      const info = await slackApi(KEEP.token, "conversations.info", { channel: c.id }).catch(() => null);
      got[c.id] = Number(info?.channel?.latest?.ts ?? 0) || 1;
    }
    noteLatest(got);
  }
  return KEEP.convs;
}

/** A direct conversation: one person, a group, or an app. */
export const direct = (c) => c.kind === "dm" || c.kind === "group" || c.kind === "app";

/** When each conversation last had a message (Slack ts in seconds), as far as Herdr has seen. */
export function latest() {
  return shared("sl.slackLatest") ?? {};
}

/** Notes newer latest times ({ id: ts }); written only when something moved. */
export function noteLatest(times) {
  const was = latest();
  let next = null;
  for (const [id, ts] of Object.entries(times)) if (Number(ts) > Number(was[id] ?? 0)) (next ??= { ...was })[id] = Number(ts);
  if (next) setShared("sl.slackLatest", next);
}

/** Unread counts by conversation id: { n, mention }. */
export function unread() {
  return shared("sl.slackUnread") ?? {};
}

/** The Dock badge: direct and group messages, and channel messages that mention you. */
export function slackBadge() {
  let n = 0;
  const u = unread();
  for (const c of KEEP.convs) {
    const x = u[c.id];
    if (x && (direct(c) || x.mention)) n += x.n;
  }
  return n;
}

/** Whether Slack is on screen: its window open, or its tab the one shown. */
export function slackShown() {
  const w = winState("slack");
  if (w.open && !w.min) return true;
  const at = slackTab();
  return Boolean(at?.space.active && at.tab.active);
}

/** Read up to ts in Herdr: clears its count, and tells Slack where the token may. */
export function markSeen(id, ts) {
  if (!id || !ts) return;
  W.base[id] = Math.max(Number(W.base[id] ?? 0), Number(ts));
  if (W.unread[id] || unread()[id]) {
    W.unread[id] = null;
    publish();
  }
  const seen = shared("sl.slackSeen") ?? {};
  if (Number(seen[id] ?? 0) >= Number(ts)) return;
  setShared("sl.slackSeen", { ...seen, [id]: ts });
  if (KEEP.token) slackApi(KEEP.token, "conversations.mark", { channel: id, ts }).catch(() => {});
}

/** The conversation the last banner was about (Slack opens to it). */

export function lastNotified() {
  return W.last;
}

function publish() {
  const out = {};
  for (const c of KEEP.convs) if (W.unread[c.id]) out[c.id] = W.unread[c.id];
  const was = unread();
  if (JSON.stringify(out) !== JSON.stringify(was)) setShared("sl.slackUnread", out);
}

/** Starts the watch from a copy that's always on screen (the Dock's). */
export function watchSlack(cx) {
  const who = `w${Math.random().toString(36).slice(2)}`;
  cx.timer.after(2000, (cx) => tick(cx, who));
  cx.timer.every(10000, (cx) => tick(cx, who));
}

function tick(cx, who) {
  const now = Date.now();
  // One watch at a time; another copy takes over if this one stops.
  if (W.owner && W.owner !== who && now - W.beat < 60000) return;
  W.owner = who;
  W.beat = now;
  // A check cut off by a mod reload never finishes: its mark runs out after a minute.
  if (W.busy && now - W.busy < 60000) return;
  const mine = (W.busy = now);
  cx.spawn(async () => {
    try {
      await check();
    } catch {
    } finally {
      if (W.busy === mine) W.busy = 0;
    }
  });
}

async function check() {
  const now = Date.now();
  if (!KEEP.token) {
    if (Object.keys(unread()).length) setShared("sl.slackUnread", {});
    if (now - W.tokenAt < 300000) return;
    W.tokenAt = now;
    const token = await savedToken();
    if (!token) return;
    await slackSignIn(token);
  }
  if (!KEEP.me) await slackSignIn(KEEP.token);
  if (!KEEP.users.size) await loadUsers();
  if (!KEEP.convs.length || now - W.convsAt > 120000) await loadConvs();
  const dms = KEEP.convs.filter(direct);
  const rooms = KEEP.convs.filter((c) => !direct(c));
  const pick = [];
  for (let i = 0; i < Math.min(3, dms.length); i++) pick.push(dms[W.dm++ % dms.length]);
  if (rooms.length) pick.push(rooms[W.ch++ % rooms.length]);
  for (const c of pick) await checkConv(c);
  publish();
}

const COUNTED = new Set([undefined, "bot_message", "thread_broadcast", "file_share", "me_message"]);

async function checkConv(c) {
  const token = KEEP.token;
  const me = KEEP.me?.user;
  const info = (await slackApi(token, "conversations.info", { channel: c.id })).channel ?? {};
  if (info.latest?.ts) noteLatest({ [c.id]: info.latest.ts });
  const seen = (shared("sl.slackSeen") ?? {})[c.id];
  let since = Math.max(Number(info.last_read ?? 0), Number(seen ?? 0));
  const first = W.base[c.id] === undefined;
  // Never read (a mark of 0): taken as read up to now rather than a backlog of everything.
  if (!since) {
    const h = await slackApi(token, "conversations.history", { channel: c.id, limit: 1 });
    since = Number(h.messages?.[0]?.ts ?? 0) || Date.now() / 1000;
    W.base[c.id] = since;
    W.unread[c.id] = null;
    return;
  }
  // Direct messages carry their latest message: nothing newer, nothing to fetch.
  if (info.latest?.ts && Number(info.latest.ts) <= since) {
    W.unread[c.id] = null;
    W.base[c.id] = Math.max(Number(W.base[c.id] ?? 0), since);
    return;
  }
  const h = await slackApi(token, "conversations.history", { channel: c.id, oldest: String(since), limit: 50 });
  const msgs = (h.messages ?? []).filter((m) => m.user !== me && COUNTED.has(m.subtype) && Number(m.ts) > since);
  const mention = Boolean(me) && msgs.some((m) => (m.text ?? "").includes(`<@${me}>`));
  W.unread[c.id] = msgs.length ? { n: msgs.length, mention } : null;
  const newest = msgs[0];
  if (h.messages?.[0]?.ts) noteLatest({ [c.id]: h.messages[0].ts });
  const base = Number(W.base[c.id] ?? 0);
  W.base[c.id] = Math.max(base, since, Number(newest?.ts ?? 0));
  if (first || !newest || Number(newest.ts) <= base) return;
  if (!(direct(c) || mention)) return;
  if (KEEP.cur === c.id && slackShown()) return;
  banner(c, newest);
}

function plain(text) {
  return String(text ?? "")
    .slice(0, 300)
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_m, id) => `@${KEEP.users.get(id) ?? id}`)
    .replace(/<#[CG][A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<!(here|channel|everyone)[^>]*>/g, "@$1")
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function banner(c, m) {
  W.last = c.id;
  const who = m.user ? KEEP.users.get(m.user) ?? m.user : m.username ?? m.bot_profile?.name ?? "Slack";
  const where = c.kind === "group" ? c.name : direct(c) ? who : `#${c.name}`;
  const words = plain(m.text) || (m.files?.length ? "Sent a file" : "New message");
  const app = dockApps().find((a) => appName(a.path) === "Slack");
  showBanner({
    title: where,
    detail: c.kind === "group" || !direct(c) ? `${who}: ${words}` : words,
    timeout: 8000,
    ...(app?.icon ? { icon: appIcon(app.path) } : {}),
    action: { name: "snowleopard.slackunread" },
  });
}
