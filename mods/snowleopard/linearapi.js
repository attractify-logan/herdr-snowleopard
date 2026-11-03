// Linear's GraphQL API for the Linear window (linear.js) and the Dock's badge:
// the queries, the connection kept across the window's copies (KEEP), and a
// small watch of the inbox's unread count.
//
// It signs in with a personal API key (lin_api_…) the person makes in Linear's
// settings. The key is kept in the macOS Keychain, never in a file. With the
// file ~/.config/herdr-app/linear-demo present it answers from made-up data
// instead (linear-demo.js), for screenshots.

import { exec, shared, setShared } from "herdr";
import { winState, appTab } from "./kit.js";
import { demoGql } from "./linear-demo.js";

export const KEYCHAIN = "herdr-snowleopard-linear";
export const DEMO = "demo";

// What Linear knows, kept across the window's copies (a resize, zoom or restore
// reopens it). A mod reload starts it over.
export const KEEP = (globalThis.__snowleopardLinear ??= {
  token: null,
  me: null, // { id, name, org, urlKey }
  teams: [], // [{ id, key, name, states: [{ id, name, type, color, position }] }]
  users: [], // [{ id, name }]
  projects: [],
  lists: new Map(), // source key → rows
  src: null,
  sel: null, // the selected row's id
  issue: null, // the open issue, in full
  note: null, // the open notification, when it isn't about an issue
  unread: 0,
  at: 0, // when teams, people and projects were loaded
});
const W = (globalThis.__snowleopardLinearWatch ??= { owner: null, beat: 0, busy: 0, keyAt: 0 });

// The issue fields a list row shows.
const ROW = `fragment Row on Issue { id identifier title priority updatedAt url state { id name type color } assignee { id name displayName } team { id key } }`;
const OPEN = `state: { type: { nin: ["completed", "canceled", "duplicate"] } }`;

export const Q = {
  me: `query Me { viewer { id name displayName organization { name urlKey } } teams(first: 50) { nodes { id key name states { nodes { id name type color position } } } } users(first: 250, filter: { active: { eq: true } }) { nodes { id name displayName } } projects(first: 50, orderBy: updatedAt, filter: { status: { type: { in: ["backlog", "planned", "started"] } } }) { nodes { id name progress targetDate url status { name type } lead { name displayName } } } }`,
  mine: `query Mine { notificationsUnreadCount viewer { assignedIssues(first: 100, orderBy: updatedAt, filter: { ${OPEN} }) { nodes { ...Row } } } } ${ROW}`,
  team: `query Team($id: ID!) { notificationsUnreadCount issues(first: 100, orderBy: updatedAt, filter: { team: { id: { eq: $id } }, ${OPEN} }) { nodes { ...Row } } } ${ROW}`,
  project: `query Project($id: ID!) { notificationsUnreadCount issues(first: 100, orderBy: updatedAt, filter: { project: { id: { eq: $id } }, ${OPEN} }) { nodes { ...Row } } } ${ROW}`,
  inbox: `query Inbox { notificationsUnreadCount notifications(first: 60) { nodes { id type readAt createdAt title subtitle url actor { name displayName } ... on IssueNotification { issue { ...Row } } } } } ${ROW}`,
  issue: `query Issue($id: String!) { issue(id: $id) { ...Row description createdAt creator { name displayName } project { id name } labels { nodes { name color } } comments(first: 100) { nodes { id body createdAt user { name displayName } botActor { name } parent { id } } } } } ${ROW}`,
  update: `mutation Update($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { ...Row } } } ${ROW}`,
  comment: `mutation Comment($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
  read: `mutation Read($id: String!, $at: DateTime!) { notificationUpdate(id: $id, input: { readAt: $at }) { success } }`,
  unread: `query Unread { notificationsUnreadCount }`,
};

/** One GraphQL request. Errors come back as short codes plain() can word. */
export async function gql(token, query, variables = {}) {
  if (token === DEMO) return demoGql(query, variables);
  let r;
  try {
    r = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      // A personal key goes as it is; an OAuth token as a bearer.
      headers: { Authorization: token.startsWith("lin_") ? token : `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error("offline");
  }
  if (r.status === 401) throw new Error("auth");
  if (r.status === 429) throw new Error("ratelimited");
  let j = null;
  try {
    j = await r.json();
  } catch {}
  if (!j) throw new Error(`http ${r.status}`);
  if (j.errors?.length) {
    const e = j.errors[0];
    const code = String(e.extensions?.code ?? e.extensions?.type ?? "").toUpperCase();
    if (code.includes("AUTHENTICATION")) throw new Error("auth");
    if (code.includes("RATELIMIT")) throw new Error("ratelimited");
    if (code.includes("FORBIDDEN") || /scope|permission/i.test(e.message ?? "")) throw new Error("forbidden");
    throw new Error(e.message ?? "error");
  }
  return j.data;
}

/** Linear's errors in plain sentences. */
export function plain(e) {
  const code = e?.message ?? String(e);
  switch (code) {
    case "auth":
      return "Linear didn't accept that key. Make a new personal API key in Linear's settings and paste it again.";
    case "ratelimited":
      return "Linear asked us to slow down. Trying again in a minute.";
    case "forbidden":
      return "This key can read but not change things. Make a key with Write access in Linear's settings.";
    case "offline":
      return "Couldn't reach Linear. Check the connection.";
    default:
      return `Linear didn't answer as expected (${code}).`;
  }
}

/** Is the demo switched on (a file in Herdr's folder)? */
export async function demoOn() {
  const r = await exec("/bin/sh", ["-c", '[ -f "$HOME/.config/herdr-app/linear-demo" ]']).catch(() => null);
  return r?.code === 0;
}

/** The key kept in the Keychain, the demo's, or null. */
export async function savedKey() {
  if (await demoOn()) return DEMO;
  const r = await exec("security", ["find-generic-password", "-s", KEYCHAIN, "-w"]).catch(() => null);
  return r?.code === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

/** Checks a key and loads who you are, the teams, people and projects. */
export async function signIn(token) {
  const d = await gql(token, Q.me);
  const v = d.viewer;
  KEEP.token = token;
  KEEP.me = { id: v.id, name: v.displayName || v.name, org: v.organization?.name ?? "Linear", urlKey: v.organization?.urlKey ?? "" };
  const order = { triage: 0, backlog: 1, unstarted: 2, started: 3, completed: 4, canceled: 5, duplicate: 6 };
  KEEP.teams = (d.teams?.nodes ?? [])
    .map((t) => ({ id: t.id, key: t.key, name: t.name, states: [...(t.states?.nodes ?? [])].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.position - b.position) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  KEEP.users = (d.users?.nodes ?? []).map((u) => ({ id: u.id, name: u.displayName || u.name, full: u.name })).sort((a, b) => a.name.localeCompare(b.name));
  KEEP.projects = (d.projects?.nodes ?? []).sort((a, b) => a.name.localeCompare(b.name));
  KEEP.at = Date.now();
  return KEEP.me;
}

export function forget() {
  Object.assign(KEEP, { token: null, me: null, teams: [], users: [], projects: [], lists: new Map(), src: null, sel: null, issue: null, note: null, unread: 0, at: 0 });
  setShared("sl.linearUnread", 0);
}

/** The inbox's unread count, for the Dock badge. */
export function linearBadge() {
  return shared("sl.linearUnread") ?? 0;
}

export function setUnread(n) {
  KEEP.unread = n;
  if ((shared("sl.linearUnread") ?? 0) !== n) setShared("sl.linearUnread", n);
}

/** Whether Linear is on screen: its window open, or its tab the one shown. */
export function linearShown() {
  const w = winState("linear");
  if (w.open && !w.min) return true;
  const at = appTab("Linear");
  return Boolean(at?.space.active && at.tab.active);
}

/** Keeps the inbox count fresh from a copy that's always on screen (the Dock's): once a
 *  minute while Linear is out of sight (the window counts while it's shown). */
export function watchLinear(cx) {
  const who = `w${Math.random().toString(36).slice(2)}`;
  cx.timer.after(3000, (cx) => tick(cx, who));
  cx.timer.every(60000, (cx) => tick(cx, who));
}

function tick(cx, who) {
  const now = Date.now();
  if (W.owner && W.owner !== who && now - W.beat < 180000) return;
  W.owner = who;
  W.beat = now;
  if (W.busy && now - W.busy < 60000) return;
  if (KEEP.token && linearShown()) return;
  const mine = (W.busy = now);
  cx.spawn(async () => {
    try {
      if (!KEEP.token) {
        // Not signed in: look in the Keychain now and then (Linear may have been connected elsewhere).
        if (now - W.keyAt < 300000) return;
        W.keyAt = now;
        const key = await savedKey();
        if (!key) return;
        await signIn(key);
      }
      const d = await gql(KEEP.token, Q.unread);
      setUnread(d.notificationsUnreadCount ?? 0);
    } catch {
    } finally {
      if (W.busy === mine) W.busy = 0;
    }
  });
}
