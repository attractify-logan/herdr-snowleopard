// Linear, opened from the Window menu or Linear's Dock icon: as a tab in the
// main window (props inTab; the default, since floating windows always stay
// above the main one), or in its own Aqua window. Laid out as Mail is: a
// source list (Inbox, My Issues, each team, each active project), the issues
// in a table above, and the selected one below with its description, comments
// and a field to reply. Its status, priority and assignee pop up menus to
// change them. It polls while it's on screen: the list every 30 s, the open
// issue every 20 s. Anything else is one click away in Linear itself.
//
// The connection (a personal API key in the Keychain) and the queries are in
// linearapi.js.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, TextView, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { props, exec, closeOverlay, run } from "herdr";
import {
  C, FONT, GLYPH, key, paint, rrect, vgrad, fillGrad, embossed, bead, textured, aquaButton, closeMenus, openMenu, winState, setWin,
  closeWin, zoomWin, startTornResize, dockApps, appIcon, appName, openWin, appTab, aquaScrollbar, dragScroll, endScroll,
} from "./kit.js";
import { KEEP, KEYCHAIN, DEMO, Q, gql, plain, savedKey, signIn, forget, setUnread, linearShown } from "./linearapi.js";

const TITLE = 22;
const TOOLBAR = 32;
const BAR = 15;
const SIDE = 200;
const ROW = 20;
const HEAD = 17;
const SETTINGS = "https://linear.app/settings/account/security";

const PRIORITY = ["No priority", "Urgent", "High", "Medium", "Low"];

const tile = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ["#3b7cef", "#2fa443", "#d9822b", "#9c4dcc", "#d23a64", "#1d9aa5", "#7a6f5a", "#5a6ad6"][Math.abs(h) % 8];
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Mail's dates: the time today, the weekday this week, else the day. */
function when(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const pm = h >= 12;
    h = h % 12 || 12;
    return `${h}:${m} ${pm ? "PM" : "AM"}`;
  }
  if (now - d < 6 * 86400000 && now > d) return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() === now.getFullYear() ? "" : `, ${d.getFullYear()}`}`;
}

/** Linear's Markdown, made safe for the page: pictures as links (they need Linear's
 *  sign-in to load) and collapsible sections (+++ Title … +++) as a bold title. */
function md(text) {
  const s = String(text ?? "");
  if (!s.trim()) return "";
  return s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt, url) => `[🖼 ${alt || "picture"}](${url})`)
    .split("\n")
    .map((l) => (l.startsWith("+++") ? (l.slice(3).trim() ? `**▸ ${l.slice(3).trim()}**` : "") : l))
    .join("\n");
}

const who = (u) => u?.displayName || u?.name || "";

/** Mail's source-list count: a gray-blue pill, white on a selected row. */
function countPill(n, on) {
  const label = String(n > 999 ? "999+" : n);
  const w = Math.max(20, 10 + label.length * 7);
  const h = 14;
  return div()
    .relative()
    .flex_none()
    .w(w)
    .h(h)
    .child(paint(rrect(w, h, h / 2), on ? "#ffffff" : vgrad("#93a3bd", "#7b8ca8"), w, h))
    .child(div().absolute().top(0).left(0).size_full().flex().items_center().justify_center().text_size(10).font_weight(700).text_color(on ? "#3875d7" : "#ffffff").child(label));
}

/** A workflow state's mark: a ring before work starts, filled once started, a check when done. */
function stateMark(st, on, s = 10) {
  const c = on ? "#ffffff" : st?.color ?? "#95a2b3";
  const t = st?.type;
  const filled = t === "started" || t === "completed";
  const gone = t === "canceled" || t === "duplicate";
  return div()
    .relative()
    .flex_none()
    .w(s)
    .h(s)
    .rounded_full()
    .border_1()
    .border_color(gone && !on ? "#a0a0a0" : c)
    .when(filled, (el) => el.bg(c))
    .when(t === "completed", (el) => el.child(svg(GLYPH.check).absolute().top(1).left(1).w(s - 4).h(s - 4).text_color(on ? "#2361c1" : "#ffffff")))
    .when(gone, (el) => el.child(svg(GLYPH.close).absolute().top(1).left(1).w(s - 4).h(s - 4).text_color(on ? "#ffffff" : "#a0a0a0")));
}

/** Linear's priority mark: a red ! for urgent, signal bars for high, medium and low. */
function priorityMark(p, on) {
  if (p === 1)
    return div().flex_none().w(12).h(12).rounded(3).bg(on ? "#ffffff" : "#e5484d").flex().items_center().justify_center().text_size(9).font_weight(700).text_color(on ? "#2361c1" : "#ffffff").child("!");
  if (!p) return div().flex_none().w(12).text_size(11).text_color(on ? "#ffffffa0" : "#b5b5b5").child("–");
  const lit = { 2: 3, 3: 2, 4: 1 }[p] ?? 0;
  return h_flex()
    .flex_none()
    .w(12)
    .h(10)
    .gap(1)
    .items_end()
    .children([4, 7, 10].map((h, i) => div().w(3).h(h).rounded(1).bg(i < lit ? (on ? "#ffffff" : "#555555") : on ? "#ffffff60" : "#cdcdcd")));
}

/** A label's chip: its color's dot and its name. */
function chip(l) {
  return h_flex()
    .flex_none()
    .h(18)
    .px(7)
    .gap(4)
    .items_center()
    .rounded(9)
    .border_1()
    .border_color("#c9c9c9")
    .bg("#f7f7f7")
    .child(div().w(7).h(7).rounded_full().bg(l.color ?? "#999999"))
    .child(div().text_size(11).text_color("#333333").child(l.name));
}

function avatar(name, s) {
  return div()
    .relative()
    .flex_none()
    .w(s)
    .h(s)
    .child(paint(rrect(s, s, s / 5), tile(name || "?"), s, s))
    .child(paint(rrect(s - 2, s / 2 - 1, [s / 6, s / 6, 0, 0], 1, 1), vgrad("#ffffff50", "#ffffff08"), s, s))
    .child(div().absolute().top(0).left(0).size_full().flex().items_center().justify_center().text_size(Math.round(s * 0.45)).font_weight(700).text_color("#ffffff").child(String(name || "?").slice(0, 1).toUpperCase()));
}

export default class Linear {
  init(_p, cx) {
    this.size = null;
    this.lit = false;
    this.status = "";
    this.bad = false;
    this.ready = false;
    this.busy = false;
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.keyField = InputState.new({ placeholder: "lin_api_…" });
    this.keyField.on("submit", (_e, cx) => cx.spawn((cx) => this.saveKey(cx)));
    this.compose = InputState.new({ placeholder: "Add a comment… (Return sends)" });
    this.compose.on("submit", (_e, cx) => this.send(cx));
    this.scroll = VirtualListScrollHandle.new();
    this.vis = { lo: 0, hi: -1 };
    this.drawn = "";
    this.sb = {};
    cx.timer.every(120, (cx) => {
      if (`${this.vis.lo},${this.vis.hi}` !== this.drawn) cx.notify();
    });
    cx.timer.every(30000, (cx) => this.shown() && this.loadList(KEEP.src, cx));
    cx.timer.every(20000, (cx) => this.shown() && KEEP.issue && this.loadIssue(KEEP.issue.id, cx, true));
    cx.timer.every(600000, (cx) => this.shown() && KEEP.token && cx.spawn((cx) => this.refreshMeta(cx)));
    if (KEEP.token && KEEP.me) {
      this.ready = true;
      this.loadList(KEEP.src ?? this.startSrc(), cx);
      return;
    }
    cx.spawn(async (cx) => {
      try {
        const key = await savedKey();
        if (key) await this.connect(key, cx);
      } catch (e) {
        this.bad = true;
        this.status = plain(e);
      }
      this.ready = true;
      cx.notify();
    });
  }

  /** On screen, so worth polling: the shown tab or an open window. */
  shown() {
    return Boolean(KEEP.token) && linearShown();
  }

  startSrc() {
    const last = winState("linear").last;
    return this.sources().some((s) => s.key === last && !s.head) ? last : "mine";
  }

  async connect(token, cx) {
    await signIn(token);
    this.status = "";
    this.bad = false;
    cx.notify();
    this.loadList(this.startSrc(), cx);
  }

  async refreshMeta(cx) {
    try {
      await signIn(KEEP.token);
      cx.notify();
    } catch {}
  }

  async saveKey(cx) {
    const token = this.keyField.value().trim();
    if (!token) return;
    this.bad = false;
    this.status = "Checking the key with Linear…";
    this.busy = true;
    cx.notify();
    try {
      await this.connect(token, cx);
      await exec("security", ["add-generic-password", "-U", "-s", KEYCHAIN, "-a", "linear", "-w", token]);
      this.keyField.set_value("");
      this.focus.focus();
    } catch (e) {
      forget();
      this.bad = true;
      this.status = plain(e);
    }
    this.busy = false;
    cx.notify();
  }

  async signOut(cx) {
    if (KEEP.token !== DEMO) await exec("security", ["delete-generic-password", "-s", KEYCHAIN]).catch(() => {});
    forget();
    this.status = "";
    this.bad = false;
    this.focus.focus();
    cx.notify();
  }

  // ---- what's listed

  /** The source list's rows: headings and places. */
  sources() {
    const out = [
      { key: "h-org", head: (KEEP.me?.org ?? "Linear").toUpperCase() },
      { key: "inbox", name: "Inbox", glyph: GLYPH.inbox, n: KEEP.unread },
      { key: "mine", name: "My Issues", glyph: GLYPH.person },
    ];
    if (KEEP.teams.length) {
      out.push({ key: "h-teams", head: "TEAMS" });
      for (const t of KEEP.teams) out.push({ key: `team:${t.id}`, name: t.name, team: t.key });
    }
    if (KEEP.projects.length) {
      out.push({ key: "h-projects", head: "PROJECTS" });
      for (const p of KEEP.projects) out.push({ key: `project:${p.id}`, name: p.name, glyph: GLYPH.project, pct: p.progress });
    }
    return out;
  }

  pick(key, cx) {
    if (key.startsWith("h-") || !KEEP.token) return;
    this.focus.focus();
    if (key === KEEP.src) return this.loadList(key, cx);
    KEEP.src = key;
    KEEP.sel = null;
    KEEP.issue = null;
    KEEP.note = null;
    setWin("linear", { last: key });
    this.status = "";
    this.scroll.scroll_to_item(0, "top");
    cx.notify();
    this.loadList(key, cx);
  }

  loadList(src, cx) {
    if (!KEEP.token || !src) return;
    if (KEEP.src !== src) {
      KEEP.src = src;
      cx.notify();
    }
    cx.spawn(async (cx) => {
      try {
        const [kind, id] = src.split(":");
        const q = kind === "inbox" ? Q.inbox : kind === "team" ? Q.team : kind === "project" ? Q.project : Q.mine;
        const d = await gql(KEEP.token, q, id ? { id } : {});
        let rows;
        if (kind === "inbox") rows = [...(d.notifications?.nodes ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        else rows = kind === "mine" ? d.viewer?.assignedIssues?.nodes ?? [] : d.issues?.nodes ?? [];
        setUnread(d.notificationsUnreadCount ?? KEEP.unread);
        if (this.bad) this.status = "";
        this.bad = false;
        const before = KEEP.lists.get(src);
        if (JSON.stringify(before) !== JSON.stringify(rows)) {
          KEEP.lists.set(src, rows);
          cx.notify();
        }
      } catch (e) {
        if (src === KEEP.src) {
          this.bad = true;
          this.status = plain(e);
          cx.notify();
        }
      }
    });
  }

  rows() {
    return KEEP.lists.get(KEEP.src) ?? [];
  }

  /** A row clicked: its issue below (a notification's issue, marked read). */
  select(id, cx) {
    this.focus.focus();
    const r = this.rows().find((x) => x.id === id);
    if (!r) return;
    KEEP.sel = id;
    cx.notify();
    if (KEEP.src === "inbox") {
      if (!r.readAt) this.markRead(r, cx);
      if (!r.issue) {
        KEEP.issue = null;
        KEEP.note = r;
        return cx.notify();
      }
      KEEP.note = null;
      return this.loadIssue(r.issue.id, cx);
    }
    KEEP.note = null;
    this.loadIssue(r.id, cx);
  }

  /** The arrow keys walk the list, as in Mail; the issue loads once the walk pauses. */
  step(d, cx) {
    const rows = this.rows();
    if (!rows.length) return;
    const at = rows.findIndex((r) => r.id === KEEP.sel);
    const i = Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + d));
    const id = rows[i].id;
    KEEP.sel = id;
    if (i < this.vis.lo || i > this.vis.hi - 1) this.scroll.scroll_to_item(i, d > 0 ? "bottom" : "top");
    cx.notify();
    cx.timer.after(250, (cx) => KEEP.sel === id && this.select(id, cx));
  }

  markRead(n, cx) {
    n.readAt = new Date().toISOString();
    setUnread(Math.max(0, KEEP.unread - 1));
    cx.notify();
    cx.spawn(async () => {
      try {
        await gql(KEEP.token, Q.read, { id: n.id, at: n.readAt });
      } catch {}
    });
  }

  loadIssue(id, cx, quiet = false) {
    if (!quiet && KEEP.issue?.id !== id) {
      KEEP.issue = { id, loading: true };
      cx.notify();
    }
    cx.spawn(async (cx) => {
      try {
        const d = await gql(KEEP.token, Q.issue, { id });
        const it = d.issue;
        if (!it) throw new Error("not found");
        if (KEEP.issue?.id !== id) return;
        // Oldest first, each reply under the comment it answers.
        const all = [...(it.comments?.nodes ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
        const tops = all.filter((c) => !c.parent || !all.some((p) => p.id === c.parent.id));
        const comments = [];
        for (const c of tops) {
          comments.push({ ...c, reply: false });
          for (const r of all) if (r.parent?.id === c.id) comments.push({ ...r, reply: true });
        }
        const full = { ...it, comments, md: md(it.description) };
        if (JSON.stringify(full) !== JSON.stringify(KEEP.issue)) {
          KEEP.issue = full;
          this.patchRow(it);
          cx.notify();
        }
      } catch (e) {
        if (quiet || KEEP.issue?.id !== id) return;
        KEEP.issue = { id, error: plain(e) };
        cx.notify();
      }
    });
  }

  /** An issue's new fields in every list that shows it. */
  patchRow(it) {
    for (const [src, rows] of KEEP.lists) {
      let hit = false;
      const next = rows.map((r) => {
        if (r.id === it.id) {
          hit = true;
          return { ...r, ...pickRow(it) };
        }
        if (r.issue?.id === it.id) {
          hit = true;
          return { ...r, issue: { ...r.issue, ...pickRow(it) } };
        }
        return r;
      });
      if (hit) KEEP.lists.set(src, next);
    }
  }

  // ---- changes

  /** A status, priority or assignee picked from its menu (kit.js perform → sl.linear pick). */
  apply(p, cx) {
    const it = KEEP.issue;
    if (!it || it.id !== p.issue || it.loading) return;
    const input = {};
    const before = { state: it.state, priority: it.priority, assignee: it.assignee };
    if (p.field === "state") {
      const st = KEEP.teams.find((t) => t.id === it.team?.id)?.states.find((s) => s.id === p.value);
      if (!st || st.id === it.state?.id) return;
      input.stateId = st.id;
      it.state = { id: st.id, name: st.name, type: st.type, color: st.color };
    } else if (p.field === "priority") {
      if (p.value === it.priority) return;
      input.priority = p.value;
      it.priority = p.value;
    } else if (p.field === "assignee") {
      if ((p.value ?? null) === (it.assignee?.id ?? null)) return;
      input.assigneeId = p.value ?? null;
      const u = KEEP.users.find((x) => x.id === p.value);
      it.assignee = u ? { id: u.id, name: u.full, displayName: u.name } : null;
    } else return;
    this.patchRow(it);
    this.bad = false;
    this.status = "Saving…";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const d = await gql(KEEP.token, Q.update, { id: it.id, input });
        if (!d.issueUpdate?.success) throw new Error("not saved");
        if (d.issueUpdate.issue && KEEP.issue?.id === it.id) {
          Object.assign(KEEP.issue, pickRow(d.issueUpdate.issue));
          this.patchRow(d.issueUpdate.issue);
        }
        this.status = p.field === "state" ? `Moved ${it.identifier} to ${it.state.name}.` : p.field === "priority" ? `${it.identifier} is ${PRIORITY[it.priority].toLowerCase()} now.` : it.assignee ? `Assigned ${it.identifier} to ${who(it.assignee)}.` : `${it.identifier} has no assignee now.`;
        cx.timer.after(4000, (cx) => {
          if (this.status.startsWith("Moved") || this.status.startsWith("Assigned") || this.status.includes(" now.")) {
            this.status = "";
            cx.notify();
          }
        });
      } catch (e) {
        Object.assign(it, before);
        this.patchRow(it);
        this.bad = true;
        this.status = `Not saved. ${plain(e)}`;
      }
      cx.notify();
    });
  }

  send(cx) {
    const body = this.compose.value().trim();
    const it = KEEP.issue;
    if (!body || !it || it.loading || it.error) return;
    this.compose.set_value("");
    this.bad = false;
    this.status = `Commenting on ${it.identifier}…`;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const d = await gql(KEEP.token, Q.comment, { input: { issueId: it.id, body } });
        if (!d.commentCreate?.success) throw new Error("not saved");
        this.status = `Commented on ${it.identifier}.`;
        this.loadIssue(it.id, cx, true);
        cx.timer.after(4000, (cx) => {
          if (this.status.startsWith("Commented")) {
            this.status = "";
            cx.notify();
          }
        });
      } catch (e) {
        this.compose.set_value(body);
        this.bad = true;
        this.status = `Not sent. ${plain(e)}`;
      }
      cx.notify();
    });
  }

  /** The menus for an issue's status, priority and assignee, under the button pressed. */
  menu(field, e) {
    const it = KEEP.issue;
    if (!it || it.loading || it.error) return;
    const pick = (value) => ({ linearPick: { issue: it.id, field, value } });
    let items = [];
    if (field === "state") {
      const states = KEEP.teams.find((t) => t.id === it.team?.id)?.states ?? [];
      items = states.map((s) => ({ label: s.name, checked: s.id === it.state?.id, act: pick(s.id) }));
    } else if (field === "priority") {
      items = [0, 1, 2, 3, 4].map((n) => ({ label: PRIORITY[n], checked: it.priority === n, act: pick(n) }));
      items.splice(1, 0, { sep: true });
    } else {
      const me = KEEP.users.find((u) => u.id === KEEP.me?.id);
      const rest = KEEP.users.filter((u) => u.id !== KEEP.me?.id).slice(0, 30);
      items = [
        { label: "No Assignee", checked: !it.assignee, act: pick(null) },
        { sep: true },
        ...(me ? [{ label: `${me.name} (you)`, checked: it.assignee?.id === me.id, act: pick(me.id) }] : []),
        ...rest.map((u) => ({ label: u.name, checked: it.assignee?.id === u.id, act: pick(u.id) })),
      ];
    }
    if (!items.length) return;
    closeMenus();
    const b = e.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height + 2 } : undefined, { owner: `linear-${field}` });
  }

  // ---- parts

  lights(live) {
    const p = props() ?? {};
    const on = live || this.lit;
    const kinds = [
      ["close", GLYPH.close, "Close", () => closeWin("linear", p.overlay)],
      ["min", GLYPH.minus, "Minimize to the Dock", () => closeWin("linear", p.overlay, true)],
      ["zoom", GLYPH.plus, "Zoom", () => zoomWin("linear", p.overlay)],
    ];
    return h_flex()
      .id("ln-lights")
      .gap(7)
      .items_center()
      .on_hover((h, cx) => {
        this.lit = h;
        cx.notify();
      })
      .children(
        kinds.map(([kind, glyph, tip, act]) =>
          div()
            .id(`lnl-${kind}`)
            .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
            .tooltip(tip)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click(() => act()),
        ),
      );
  }

  /** The place shown, by name (the title, and the tab's toolbar). */
  where() {
    const s = this.sources().find((x) => x.key === KEEP.src);
    return s?.name ?? "Linear";
  }

  /** The toolbar's buttons, as a window's and as a tab's. */
  tools(inTab) {
    const app = dockApps().find((a) => appName(a.path) === "Linear");
    const it = KEEP.issue;
    const url = it?.url ?? KEEP.note?.url ?? (KEEP.me?.urlKey ? `https://linear.app/${KEEP.me.urlKey}` : "https://linear.app");
    const parts = [];
    if (KEEP.token) parts.push(textured([{ id: "ln-refresh", glyph: GLYPH.refresh, size: 13, w: 32, tooltip: "Check for changes now (⌘R)", onClick: (_e, cx) => this.refresh(cx) }]));
    parts.push(div().flex_1());
    if (inTab) parts.push(embossed(KEEP.me ? `${this.where()} — ${KEEP.me.org}` : "Linear", { size: 12, color: key() ? "#000000" : "#4d4d4d", truncate: true }), div().flex_1());
    if (inTab)
      parts.push(
        textured([{ id: "ln-float", text: "Open in Window", w: 112, tooltip: "Move Linear to its own window", onClick: () => {
          openWin("linear");
          // One copy only: the tab would poll alongside the window.
          const at = appTab("Linear");
          if (at) run("tab.close", { id: at.tab.id, confirmed: true });
        } }]),
      );
    const one = Boolean((it && it.url) || KEEP.note);
    if (KEEP.token)
      parts.push(
        textured([{ id: "ln-web", text: one ? "Open in Linear" : "Open Linear", w: one ? 112 : 92, tooltip: one ? "Open this in Linear" : "Open Linear", onClick: () => (app && !one ? exec("open", ["-a", app.path]) : exec("open", [url])).catch(() => {}) }]),
      );
    if (KEEP.token) parts.push(textured([{ id: "ln-out", text: "Sign Out", w: 70, tooltip: KEEP.token === DEMO ? "Leave the demo" : "Forget the Linear key (it's removed from the Keychain)", onClick: (_e, cx) => cx.spawn((cx) => this.signOut(cx)) }]));
    return parts;
  }

  refresh(cx) {
    this.loadList(KEEP.src, cx);
    if (KEEP.issue && !KEEP.issue.loading) this.loadIssue(KEEP.issue.id, cx, true);
  }

  header(live) {
    const title = KEEP.me ? `${this.where()} — ${KEEP.me.org}` : "Linear";
    const app = dockApps().find((a) => appName(a.path) === "Linear");
    return div()
      .id("ln-head")
      .relative()
      .flex_none()
      .w_full()
      .h(TITLE + TOOLBAR)
      .on_mouse_down("left", (e) => {
        if (e.click_count >= 2) zoomWin("linear", props()?.overlay);
      })
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? C.titleLine : C.titleLineOff))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .w_full()
          .h(TITLE)
          .justify_center()
          .items_center()
          .px(80)
          .gap(5)
          .when(Boolean(app?.icon), (el) => el.child(image(appIcon(app.path)).flex_none().w(16).h(16).opacity(live ? 1 : 0.6)))
          .child(embossed(title, { size: 13, color: live ? "#000000" : "#4d4d4d", truncate: true })),
      )
      .child(div().absolute().top(4).left(8).child(this.lights(live)))
      .child(h_flex().absolute().top(TITLE).left(0).w_full().h(TOOLBAR).px(8).pb(3).gap(10).items_center().children(this.tools(false)));
  }

  sourceRow(s, live) {
    if (s.head)
      return div().id(`ls-${s.key}`).h(ROW).w_full().px(10).pt(6).text_size(11).font_weight(700).text_color(C.heading).truncate().child(s.head);
    const on = s.key === KEEP.src;
    const fg = on ? "#ffffff" : C.text;
    return h_flex()
      .id(`ls-${s.key}`)
      .relative()
      .h(ROW)
      .w_full()
      .pl(12)
      .pr(8)
      .gap(6)
      .items_center()
      .when(on, (el) => el.child(fillGrad(live ? C.rowTop : C.rowTopOff, live ? C.rowBot : C.rowBotOff)))
      .when(Boolean(s.glyph), (el) => el.child(svg(s.glyph).relative().flex_none().w(14).h(14).text_color(on ? "#ffffff" : "#5d6a7c")))
      .when(Boolean(s.team), (el) =>
        el.child(
          div()
            .relative()
            .flex_none()
            .w(14)
            .h(14)
            .rounded(3)
            .bg(on ? "#ffffff" : tile(s.team))
            .flex()
            .items_center()
            .justify_center()
            .text_size(8)
            .font_weight(700)
            .text_color(on ? "#2361c1" : "#ffffff")
            .child(s.team.slice(0, 2)),
        ),
      )
      .child(div().relative().flex_1().min_w(0).truncate().text_size(12).text_color(fg).font_weight(on ? 700 : 400).child(s.name))
      .when(s.n > 0, (el) => el.child(countPill(s.n, on)))
      .when(Number.isFinite(s.pct), (el) => el.child(div().relative().flex_none().text_size(10).text_color(on ? "#ffffffc0" : C.gray).child(`${Math.round(s.pct * 100)}%`)));
  }

  sidebar(live) {
    const rows = this.sources();
    return v_flex()
      .id("ln-side")
      .relative()
      .flex_none()
      .w(SIDE)
      .h_full()
      .bg(live ? C.source : C.sourceOff)
      .pt(2)
      .child(
        v_flex()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_virtual_list("ln-sources", rows.length, ROW, (i) => rows[i].key, (range) => rows.slice(range.start, range.end).map((s) => this.sourceRow(s, live)))
              .size_full()
              .on_item_click((k, cx) => this.pick(k, cx)),
          ),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  /** The table's columns at a width: [key, label, width] (one is null: the rest of the row). */
  columns() {
    if (KEEP.src === "inbox") return [["dot", "", 20], ["from", "From", 130], ["subject", "Subject", null], ["date", "Date", 86]];
    const w = this.mainW ?? 600;
    const cols = [["pri", "", 24], ["id", "ID", 80], ["title", "Title", null], ["state", "Status", 120]];
    if (w > 560) cols.push(["who", "Assignee", 110]);
    cols.push(["date", "Updated", 86]);
    return cols;
  }

  colHeads(cols, live) {
    return h_flex()
      .id("ln-cols")
      .relative()
      .flex_none()
      .w_full()
      .h(HEAD)
      .child(fillGrad(live ? "#ffffff" : "#fbfbfb", live ? "#dcdcdc" : "#ececec"))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg("#a8a8a8"))
      .children(
        cols.map(([k, label, w]) =>
          div()
            .relative()
            .h(HEAD)
            .when(w !== null, (el) => el.flex_none().w(w))
            .when(w === null, (el) => el.flex_1().min_w(0))
            .px(5)
            .flex()
            .items_center()
            .text_size(11)
            .text_color(live ? "#262626" : "#7a7a7a")
            .border_r_1()
            .border_color("#c4c4c4")
            .truncate()
            .child(label),
        ),
      );
  }

  cell(w, child) {
    return div()
      .relative()
      .h(ROW)
      .when(w !== null, (el) => el.flex_none().w(w))
      .when(w === null, (el) => el.flex_1().min_w(0))
      .px(5)
      .flex()
      .items_center()
      .overflow_hidden()
      .child(child);
  }

  row(r, i, cols, live) {
    const on = r.id === KEEP.sel;
    const fg = on ? "#ffffff" : "#000000";
    const dim = on ? "#ffffffc0" : C.gray;
    const text = (s, color = fg, bold = false) => div().min_w(0).truncate().text_size(12).text_color(color).when(bold, (el) => el.font_weight(700)).child(s ?? "");
    const inbox = KEEP.src === "inbox";
    const unread = inbox && !r.readAt;
    const parts = {
      dot: () => (unread ? bead("blue", 9) : div()),
      from: () => text(who(r.actor) || "Linear", fg, unread),
      subject: () =>
        h_flex()
          .min_w(0)
          .gap(6)
          .child(div().flex_none().max_w(320).min_w(0).child(text(r.issue ? `${r.issue.identifier}  ${r.title}` : r.title, fg, unread)))
          .child(text(String(r.subtitle ?? "").replace(/[*_`~]/g, "").replace(/\s+/g, " ").slice(0, 160), dim)),
      date: () => text(when(inbox ? r.createdAt : r.updatedAt), dim),
      pri: () => priorityMark(r.priority, on),
      id: () => text(r.identifier, dim),
      title: () => text(r.title),
      state: () => h_flex().min_w(0).gap(5).items_center().child(stateMark(r.state, on)).child(text(r.state?.name)),
      who: () => text(who(r.assignee) || "—", r.assignee ? fg : dim),
    };
    return h_flex()
      .id(`lr-${r.id}`)
      .relative()
      .h(ROW)
      .w_full()
      .items_center()
      .bg(i % 2 ? "#edf3fe" : "#ffffff")
      .when(on, (el) => el.child(fillGrad(live ? C.rowTop : C.rowTopOff, live ? C.rowBot : C.rowBotOff)))
      .children(cols.map(([k, , w]) => this.cell(w, parts[k]())));
  }

  /** A project's band above its issues: status, progress, lead and target date. */
  projectBand() {
    const id = KEEP.src?.startsWith("project:") ? KEEP.src.slice(8) : null;
    const p = id && KEEP.projects.find((x) => x.id === id);
    if (!p) return null;
    const pct = Math.max(0, Math.min(1, p.progress ?? 0));
    const facts = [p.status?.name, p.lead ? `Lead: ${who(p.lead)}` : "", p.targetDate ? `Target: ${when(`${p.targetDate}T12:00:00`)}` : ""].filter(Boolean).join("  ·  ");
    return h_flex()
      .id("ln-band")
      .flex_none()
      .w_full()
      .h(28)
      .px(10)
      .gap(10)
      .items_center()
      .bg("#f4f6f9")
      .border_b_1()
      .border_color("#c9ced6")
      .child(div().flex_none().text_size(12).font_weight(700).child(p.name))
      .child(
        div()
          .relative()
          .flex_none()
          .w(90)
          .h(8)
          .child(paint(rrect(90, 8, 4), "#c9ced6", 90, 8))
          .when(pct > 0, (el) => el.child(paint(rrect(Math.max(8, 90 * pct), 8, 4), vgrad("#7fb2f7", "#2c6fdc"), 90, 8))),
      )
      .child(div().flex_none().text_size(11).text_color(C.dim).child(`${Math.round(pct * 100)}%`))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(C.gray).child(facts));
  }

  table(h, live) {
    const rows = this.rows();
    const cols = this.columns();
    const name = `ln-rows-${KEEP.src}`;
    if (this.visName !== name) {
      this.visName = name;
      this.vis = { lo: 0, hi: -1 };
    }
    this.drawn = `${this.vis.lo},${this.vis.hi}`;
    const loading = !KEEP.lists.has(KEEP.src);
    const empty = KEEP.src === "inbox" ? "Your inbox is empty." : KEEP.src === "mine" ? "Nothing assigned to you is open." : "No open issues here.";
    const band = this.projectBand();
    return v_flex()
      .id("ln-table")
      .relative()
      .flex_none()
      .w_full()
      .h(h)
      .bg("#ffffff")
      .when(Boolean(band), (el) => el.child(band))
      .child(this.colHeads(cols, live))
      .child(
        h_flex()
          .relative()
          .flex_1()
          .min_h(0)
          .w_full()
          .child(
            v_virtual_list(name, rows.length, ROW, (i) => rows[i].id, (range) => {
              this.vis = { lo: range.start, hi: range.end - 1 };
              return rows.slice(range.start, range.end).map((r, j) => this.row(r, range.start + j, cols, live));
            })
              .track_scroll(this.scroll)
              .flex_1()
              .min_w(0)
              .h_full()
              .on_item_click((id, cx) => this.select(id, cx)),
          )
          .child(this.scrollbar(rows.length, live)),
      )
      .when(loading || !rows.length, (el) =>
        el.child(div().absolute().top(HEAD + (band ? 36 : 8)).left(0).w_full().flex().justify_center().text_size(12).text_color(C.gray).child(loading ? (this.bad ? "" : "Loading…") : empty)),
      )
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        closeMenus();
        this.focus.focus();
      });
  }

  scrollbar(count, live) {
    const { lo, hi } = this.vis;
    const shown = Math.max(1, hi - lo + 1);
    const go = (i, cx) => {
      this.scroll.scroll_to_item(Math.max(0, Math.min(count - 1, i)), "top");
      cx.notify();
    };
    return aquaScrollbar({
      id: "ln-scroll",
      state: this.sb,
      live,
      count,
      first: lo,
      shown: Math.min(shown, count),
      onStep: (dir, cx) => go(lo + dir, cx),
      onPage: (dir, cx) => go(lo + dir * Math.max(1, shown - 1), cx),
      onDrag: (i, cx) => go(i, cx),
    });
  }

  /** A popup button for one of the issue's fields: textured, with a ▾. */
  field(id, label, fieldKey, lead = null, w = null) {
    return textured([{ id, text: label, w: w ?? 26 + label.length * 7 + (lead ? 16 : 0), menu: true, tooltip: `Change the ${fieldKey === "state" ? "status" : fieldKey}`, onDown: (e) => {
      try {
        this.menu(fieldKey, e);
      } catch (err) {
        this.bad = true;
        this.status = `That menu didn't open (${err}).`;
      }
    } }]);
  }

  /** The selected issue: its title and fields, then its description and comments. */
  detail(live) {
    const it = KEEP.issue;
    const n = KEEP.note;
    const shell = (child) =>
      v_flex()
        .id("ln-detail")
        .relative()
        .flex_1()
        .min_h(0)
        .w_full()
        .bg("#ffffff")
        .child(child)
        .on_mouse_down("left", (_e, cx) => {
          cx.stop_propagation();
          closeMenus();
        });
    const centered = (words) => div().size_full().flex().items_center().justify_center().text_size(13).text_color(C.gray).child(words);
    if (n) {
      return shell(
        v_flex()
          .size_full()
          .px(18)
          .pt(14)
          .gap(8)
          .child(div().text_size(15).font_weight(700).child(n.title))
          .child(div().text_size(11).text_color(C.gray).child(`${who(n.actor) || "Linear"} · ${when(n.createdAt)}`))
          .child(div().text_size(13).text_color("#1d1d1d").child(TextView.markdown(`ln-note-${n.id}`, md(n.subtitle)).selectable(false)))
          .child(h_flex().pt(6).child(aquaButton("ln-note-open", "Open in Linear", () => exec("open", [n.url]).catch(() => {}), { w: 130 }))),
      );
    }
    if (!it) return shell(centered(this.rows().length ? "No issue selected" : ""));
    if (it.loading) return shell(centered("Loading…"));
    if (it.error) return shell(centered(it.error));
    const assignee = who(it.assignee);
    const head = v_flex()
      .flex_none()
      .w_full()
      .px(18)
      .pt(12)
      .pb(10)
      .gap(8)
      .border_b_1()
      .border_color("#d6d6d6")
      .bg("#fbfbfb")
      .child(
        h_flex()
          .gap(8)
          .items_baseline()
          .child(div().flex_none().text_size(12).text_color(C.gray).child(it.identifier))
          .child(div().flex_1().min_w(0).text_size(15).font_weight(700).child(it.title)),
      )
      .child(
        h_flex()
          .gap(8)
          .items_center()
          .flex_wrap()
          .child(
            h_flex()
              .relative()
              .gap(0)
              .items_center()
              // An em space leaves room for the state's mark, drawn over the button's left end.
              .child(this.field("ln-f-state", ` ${it.state?.name ?? "Status"}`, "state", true, 46 + (it.state?.name ?? "Status").length * 7))
              .child(div().absolute().top(7).left(8).child(stateMark(it.state, false))),
          )
          .child(this.field("ln-f-pri", it.priority ? PRIORITY[it.priority] : "Priority", "priority"))
          .child(this.field("ln-f-who", assignee || "Assign", "assignee"))
          .children((it.labels?.nodes ?? []).slice(0, 6).map(chip))
          .when(Boolean(it.project), (el) => el.child(div().text_size(11).text_color(C.dim).child(`Project: ${it.project?.name}`))),
      );
    const comments = it.comments ?? [];
    const body = v_flex()
      .id(`ln-issue-${it.id}`)
      .size_full()
      .px(18)
      .pt(12)
      .pb(16)
      .gap(10)
      .overflow_y_scroll()
      .child(div().text_size(11).text_color(C.gray).child(`Opened by ${who(it.creator) || "someone"} · ${when(it.createdAt)}`))
      .child(
        it.md
          ? div().text_size(13).text_color("#1d1d1d").child(TextView.markdown(`ln-desc-${it.id}`, it.md).selectable(false).on_link_click((url) => exec("open", [url]).catch(() => {})))
          : div().text_size(13).text_color(C.gray).child("No description."),
      )
      .child(div().pt(6).text_size(11).font_weight(700).text_color(C.heading).child(comments.length ? `COMMENTS (${comments.length})` : "NO COMMENTS YET"))
      .children(
        comments.map((c) => {
          const name = who(c.user) || c.botActor?.name || "Linear";
          return h_flex()
            .id(`lc-${c.id}`)
            .w_full()
            .gap(9)
            .items_start()
            .when(c.reply, (el) => el.pl(34))
            .child(avatar(name, 24))
            .child(
              v_flex()
                .flex_1()
                .min_w(0)
                .child(
                  h_flex()
                    .gap(6)
                    .items_baseline()
                    .child(div().text_size(12).font_weight(700).text_color("#1d1d1d").child(name))
                    .child(div().text_size(10).text_color(C.gray).child(when(c.createdAt))),
                )
                .child(div().text_size(13).text_color("#1d1d1d").child(TextView.markdown(`ln-c-${c.id}`, md(c.body) || " ").selectable(false).on_link_click((url) => exec("open", [url]).catch(() => {})))),
            );
        }),
      );
    return shell(
      v_flex()
        .size_full()
        .child(head)
        .child(
          div()
            .relative()
            .flex_1()
            .min_h(0)
            .w_full()
            .child(body)
            .child(Scrollbar.vertical(`ln-issue-${it.id}`).mode("always").absolute().inset_0()),
        )
        .child(this.composer(live)),
    );
  }

  composer(live) {
    const w = Math.max(0, (this.mainW ?? 0) - 24);
    const h = 26;
    return div()
      .id("ln-compose")
      .relative()
      .flex_none()
      .w_full()
      .px(12)
      .py(8)
      .bg("#f2f2f2")
      .border_t_1()
      .border_color("#c9c9c9")
      .child(
        div()
          .relative()
          .w(w)
          .h(h)
          .child(paint(rrect(w, h, 5), live ? "#8e8e8e" : "#b0b0b0", w, h))
          .child(paint(rrect(w - 2, h - 2, 4, 1, 1), "#ffffff", w, h))
          .child(h_flex().absolute().top(0).left(0).w(w).h(h).px(8).items_center().child(Input.new(this.compose).flex_1().h(h).text_size(13).text_color("#000000"))),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  /** Mail's split: the list above, the issue below, a gray bar between. */
  main(live) {
    const h = this.mainH ?? 0;
    const top = Math.max(120, Math.min(h - 180, Math.round(h * 0.4)));
    return v_flex()
      .id("ln-main")
      .relative()
      .flex_1()
      .min_w(0)
      .h_full()
      .on_size_change((size, cx) => {
        const w = Math.round(size.width);
        const hh = Math.round(size.height);
        if (w !== this.mainW || hh !== this.mainH) {
          this.mainW = w;
          this.mainH = hh;
          cx.notify();
        }
      })
      .when(h > 0, (el) =>
        el
          .child(this.table(top, live))
          .child(div().flex_none().w_full().h(1).bg("#8b8b8b"))
          .child(this.detail(live)),
      );
  }

  setup() {
    const steps = [
      "1. Click Open Linear Settings. Under Personal API keys, click New API key and name it Herdr. Full access works; Read and Write are enough.",
      "2. Copy the key (it starts with lin_api_).",
      "3. Paste it below. It's kept in your Mac's Keychain, never in a file.",
    ];
    return v_flex()
      .id("ln-setup")
      .flex_1()
      .min_w(0)
      .h_full()
      .bg("#ffffff")
      .items_center()
      .justify_center()
      .child(
        v_flex()
          .w(440)
          .gap(10)
          .child(div().text_size(15).font_weight(700).child("Connect Linear"))
          .child(div().text_size(12).text_color(C.dim).child("Linear runs here with a personal API key of your own: it sees and changes what you can."))
          .children(steps.map((t) => div().text_size(12).child(t)))
          .child(h_flex().pt(4).child(aquaButton("ln-settings", "Open Linear Settings…", () => exec("open", [SETTINGS]).catch(() => {}), { w: 190 })))
          .child(
            h_flex()
              .pt(6)
              .gap(10)
              .items_center()
              .child(
                div()
                  .relative()
                  .w(300)
                  .h(24)
                  .child(paint(rrect(300, 24, 4), "#8e8e8e", 300, 24))
                  .child(paint(rrect(298, 22, 3, 1, 1), "#ffffff", 300, 24))
                  .child(h_flex().absolute().top(0).left(0).w(300).h(24).px(8).items_center().child(Input.new(this.keyField).flex_1().h(24).text_size(12).text_color("#000000"))),
              )
              .child(aquaButton("ln-connect", "Connect", (_e, cx) => cx.spawn((cx) => this.saveKey(cx)), { primary: true, w: 90 })),
          )
          .when(Boolean(this.status), (el) =>
            el.child(
              h_flex()
                .gap(5)
                .items_center()
                .when(this.busy, (el) => el.child(svg(GLYPH.spinner).flex_none().w(12).h(12).text_color("#4a4a4a").spin(900)))
                .child(div().text_size(11).text_color(this.bad ? "#9c1b10" : C.dim).child(this.status)),
            ),
          ),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  words() {
    if (!KEEP.token) return "Not connected";
    if (this.status) return this.status;
    const n = this.rows().length;
    if (KEEP.src === "inbox") return `${KEEP.unread} unread · updates every 30 s`;
    return `${n} open ${n === 1 ? "issue" : "issues"} · updates every 30 s`;
  }

  bottom(w, live) {
    return div()
      .id("ln-bar")
      .relative()
      .flex_none()
      .w_full()
      .h(BAR)
      .child(paint(rrect(w - 2, BAR, [0, 0, 4, 4]), live ? vgrad("#c9c9c9", "#a9a9a9") : vgrad("#e9e9e9", "#d6d6d6"), w - 2, BAR))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#6a6a6a" : "#a5a5a5"))
      .child(div().absolute().top(0).left(0).w_full().h(BAR).flex().items_center().justify_center().child(embossed(this.words(), { size: 10, color: this.bad ? "#9c1b10" : live ? "#2b2b2b" : "#7a7a7a", truncate: true })))
      .child(
        div()
          .id("ln-grip")
          .absolute()
          .bottom(0)
          .right(0)
          .w(16)
          .h(BAR)
          .flex()
          .items_end()
          .justify_end()
          .p(2)
          .cursor_nwse_resize()
          .child(svg(GLYPH.grip).w(10).h(10).text_color("#000000"))
          .tooltip("Drag to resize the window")
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            const b = e.bounds;
            if (!b || !this.size) return;
            const fw = Math.round(this.size.width);
            const fh = Math.round(this.size.height);
            startTornResize(null, e, { x: Math.round(b.x + b.width - fw), y: Math.round(b.y + b.height - fh), w: fw, h: fh }, "linear");
          }),
      );
  }

  keys(el) {
    return el.on_key_down((e, cx) => {
      if (!KEEP.token) return;
      if (e.keystroke === "cmd-r") this.refresh(cx);
      else if (e.keystroke === "down") this.step(1, cx);
      else if (e.keystroke === "up") this.step(-1, cx);
      else return;
      cx.stop_propagation();
    });
  }

  /** As a tab: a toolbar strip over the body, no window chrome of its own, and the status at the foot. */
  inTab(body, live) {
    const strip = h_flex()
      .id("ln-strip")
      .relative()
      .flex_none()
      .w_full()
      .h(TOOLBAR)
      .px(8)
      .gap(10)
      .items_center()
      .child(fillGrad(live ? C.titleTop : C.titleTopOff, live ? C.titleBot : C.titleBotOff))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? C.titleLine : C.titleLineOff))
      .children(this.tools(true));
    return this.keys(v_flex().id("root"))
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .track_focus(this.focus)
      .on_hover((over) => over || endScroll(this.sb))
      .on_mouse_move((e, cx) => dragScroll(this.sb, e, cx))
      .on_mouse_up("left", () => endScroll(this.sb))
      .size_full()
      .bg("#ededed")
      .font_family(FONT)
      .text_color(C.text)
      .child(strip)
      .child(h_flex().flex_1().min_h(0).w_full().child(body))
      .when(Boolean(KEEP.token), (el) =>
        el.child(
          div()
            .flex_none()
            .w_full()
            .h(BAR)
            .border_t_1()
            .border_color(live ? "#6a6a6a" : "#a5a5a5")
            .child(fillGrad(live ? "#c9c9c9" : "#e9e9e9", live ? "#a9a9a9" : "#d6d6d6"))
            .flex()
            .items_center()
            .justify_center()
            .child(embossed(this.words(), { size: 10, color: this.bad ? "#9c1b10" : live ? "#2b2b2b" : "#7a7a7a", truncate: true })),
        ),
      );
  }

  render(cx) {
    const p = props() ?? {};
    // A pick from a field's menu (kit.js perform sets it), applied once.
    const pick = winState("linear").pick;
    if (pick && pick.at !== this.picked) {
      this.picked = pick.at;
      cx.timer.after(0, (cx) => {
        setWin("linear", { pick: null });
        this.apply(pick, cx);
      });
    }
    if (!p.inTab && (winState("linear").open === false || Boolean(winState("linear").big) !== Boolean(p.big)) && !this.closing) {
      this.closing = true;
      closeOverlay(p.overlay);
    }
    const w = this.size?.width ?? props()?.size?.[0] ?? 0;
    const h = this.size?.height ?? props()?.size?.[1] ?? 0;
    const live = key();
    const body = !this.ready
      ? div().flex_1().h_full().bg("#ffffff")
      : !KEEP.token
        ? this.setup()
        : h_flex()
            .flex_1()
            .min_w(0)
            .h_full()
            .child(this.sidebar(live))
            .child(div().flex_none().w(1).h_full().bg("#8b8b8b"))
            .child(this.main(live));
    if (p.inTab) return this.inTab(body, live);
    return this.keys(div().id("root"))
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .track_focus(this.focus)
      .on_hover((over) => over || endScroll(this.sb))
      .on_mouse_move((e, cx) => dragScroll(this.sb, e, cx))
      .on_mouse_up("left", () => endScroll(this.sb))
      .on_mouse_down("left", (e) => {
        closeMenus();
        const b = e.bounds;
        const n = winState("linear");
        if (b && !n.big && (n.at?.x !== Math.round(b.x) || n.at?.y !== Math.round(b.y))) setWin("linear", { at: { x: Math.round(b.x), y: Math.round(b.y) } });
      })
      .relative()
      .size_full()
      .font_family(FONT)
      .text_color(C.text)
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, 5), "#00000078", w, h))
          .child(paint(rrect(w - 2, h - 2, 4, 1, 1), "#ededed", w, h))
          .child(paint(rrect(w - 2, TITLE + TOOLBAR, [4, 4, 0, 0], 1, 1), live ? vgrad(C.titleTop, C.titleBot) : vgrad(C.titleTopOff, C.titleBotOff), w, h))
          .child(paint(rrect(w - 12, 1, 0, 6, 1), "#ffffffb0", w, h)),
      )
      .child(
        v_flex()
          .absolute()
          .top(1)
          .left(1)
          .w(Math.max(0, w - 2))
          .h(Math.max(0, h - 2))
          .child(this.header(live))
          .child(h_flex().flex_1().min_h(0).w_full().child(body))
          .child(this.bottom(w, live)),
      );
  }
}

/** The fields a list row keeps of an issue. */
function pickRow(it) {
  const out = {};
  for (const k of ["id", "identifier", "title", "priority", "updatedAt", "url", "state", "assignee", "team"]) if (k in it) out[k] = it[k];
  return out;
}
