// Linear, opened from the Window menu or Linear's Dock icon: as a tab in the
// main window (props inTab; the default, since floating windows always stay
// above the main one), or in its own Aqua window. Laid out as Mail is: a
// source list (Inbox, My Issues, each team, each active project), the issues
// in a table above, and the selected one below with its description, comments
// and a field to reply. Its status, priority and assignee pop up menus to
// change them, rows and sources have right-click menus (mark read, archive,
// Mark All as Read, open/closed/all), the toolbar searches, and the column
// heads sort. It polls while it's on screen: the list every 30 s, the open
// issue every 20 s. Anything else is one click away in Linear itself.
//
// The connection (a personal API key in the Keychain) and the queries are in
// linearapi.js.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, TextView, v_virtual_list, VirtualListScrollHandle, Scrollbar } from "gpui-base";
import { props, exec, closeOverlay, run, shared } from "herdr";
import {
  C, FONT, GLYPH, key, paint, rrect, vgrad, fillGrad, embossed, bead, textured, aquaButton, closeMenus, openMenu, menuSize, appSize, winState, setWin, noteWinSpot,
  closeWin, zoomWin, startTornResize, dockApps, appName, openWin, appTab, aquaScrollbar, dragScroll, endScroll, builtinApp, appImage,
} from "./kit.js";
import { KEEP, KEYCHAIN, DEMO, Q, gql, listQuery, manyQuery, plain, savedKey, signIn, forget, setUnread, linearShown } from "./linearapi.js";

const TITLE = 22;
const TOOLBAR = 32;
const BAR = 15;
const SIDE = 200;
const ROW = 20;
const HEAD = 17;
const SETTINGS = "https://linear.app/settings/account/security";

const PRIORITY = ["No priority", "Urgent", "High", "Medium", "Low"];
const CLOSED = ["completed", "canceled", "duplicate"];
const closed = (r) => CLOSED.includes(r?.state?.type);
// Which rows a source shows: the switch in the toolbar and the source's right-click menu.
const SHOWS = {
  inbox: [["all", "All", 40, "Every notification"], ["unread", "Unread", 60, "Only the unread ones"]],
  issues: [["open", "Open", 50, "Issues still to do"], ["closed", "Closed", 58, "Done and canceled issues, newest first"], ["all", "All", 38, "Open and closed issues"]],
};
// A change from a menu: kit.js perform hands it to the window (sl.linear pick → apply).
const pick = (p) => ({ linearPick: p });
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A keystroke with its modifiers in one order, whichever order Herdr names them in. */
function stroke(e) {
  const parts = String(e.keystroke ?? "").toLowerCase().split("-");
  const k = parts.pop() || "-";
  return [...["ctrl", "alt", "shift", "cmd"].filter((m) => parts.includes(m)), k].join("-");
}

/** Sorts on one value or a list of them, with numbers as numbers. */
function cmp(a, b) {
  if (Array.isArray(a)) {
    for (let i = 0; i < a.length; i++) {
      const c = cmp(a[i], b[i]);
      if (c) return c;
    }
    return 0;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

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
    this.query = "";
    this.memo = null;
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.keyField = InputState.new({ placeholder: "lin_api_…" });
    this.keyField.set_masked(true);
    this.keyField.on("submit", (_e, cx) => cx.spawn((cx) => this.saveKey(cx)));
    this.compose = InputState.new({ placeholder: "Add a comment… (Return sends)" });
    this.compose.on("submit", (_e, cx) => this.send(cx));
    this.search = InputState.new({ placeholder: "Search" });
    this.search.on("change", (_e, cx) => {
      const q = this.search.value().trim();
      if (q === this.query) return;
      this.query = q;
      this.scroll.scroll_to_item(0, "top");
      cx.notify();
    });
    this.search.on("submit", (_e, cx) => this.query && KEEP.src !== "inbox" && this.searchAll(this.query, cx));
    // Which field has the keyboard, so a closing menu hands it back to the list only when none does.
    this.inField = false;
    for (const f of [this.compose, this.search]) {
      f.on("focus", () => (this.inField = true));
      f.on("blur", () => (this.inField = false));
    }
    this.scroll = VirtualListScrollHandle.new();
    this.vis = { lo: 0, hi: -1 };
    this.drawn = "";
    this.sb = {};
    cx.timer.every(120, (cx) => {
      if (`${this.vis.lo},${this.vis.hi}` !== this.drawn) cx.notify();
    });
    cx.timer.every(30000, (cx) => this.shown() && this.loadList(KEEP.src, cx));
    cx.timer.every(20000, (cx) => this.shown() && KEEP.issue && !KEEP.issue.loading && this.loadIssue(KEEP.issue.id, cx, true));
    cx.timer.every(600000, (cx) => this.shown() && KEEP.token && cx.spawn((cx) => this.refreshMeta(cx)));
    if (KEEP.token && KEEP.me) {
      this.ready = true;
      KEEP.src ??= this.startSrc();
      this.loadList(KEEP.src, cx);
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
    KEEP.src = this.startSrc();
    cx.notify();
    this.loadList(KEEP.src, cx);
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

  /** A word in the status bar, gone after a while unless something newer replaced it. */
  say(text, cx, bad = false, ms = 5000) {
    this.status = text;
    this.bad = bad;
    const mine = (this.said = (this.said ?? 0) + 1);
    cx.notify();
    if (ms)
      cx.timer.after(ms, (cx) => {
        if (this.said !== mine) return;
        this.status = "";
        this.bad = false;
        cx.notify();
      });
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

  /** What a source shows: inbox all or unread; issues open, closed or all. */
  show(src = KEEP.src) {
    if (src === "search") return "all";
    const v = winState("linear").show?.[src];
    const kinds = SHOWS[src === "inbox" ? "inbox" : "issues"].map((x) => x[0]);
    return kinds.includes(v) ? v : kinds[0] === "all" ? "all" : "open";
  }

  /** Where a source's rows are kept: one list per source and per open/closed/all. */
  listKey(src = KEEP.src) {
    return src === "inbox" || src === "search" ? src : `${src}|${this.show(src)}`;
  }

  setShow(src, v, cx) {
    setWin("linear", { show: { ...(winState("linear").show ?? {}), [src]: v } });
    if (src !== KEEP.src) return this.pick(src, cx);
    this.scroll.scroll_to_item(0, "top");
    cx.notify();
    if (src !== "inbox") this.loadList(src, cx);
  }

  pick(key, cx) {
    if (key.startsWith("h-") || !KEEP.token) return;
    this.focus.focus();
    if (key === KEEP.src) return this.loadList(key, cx);
    KEEP.src = key;
    KEEP.sel = null;
    KEEP.issue = null;
    KEEP.note = null;
    if (key !== "search") {
      setWin("linear", { last: key });
      if (this.query) {
        this.query = "";
        this.search.set_value("");
      }
    }
    this.status = "";
    this.bad = false;
    this.scroll.scroll_to_item(0, "top");
    cx.notify();
    this.loadList(key, cx);
  }

  loadList(src, cx) {
    if (!KEEP.token || !src) return;
    if (src === "search") return KEEP.term ? this.searchAll(KEEP.term, cx, true) : undefined;
    const lk = this.listKey(src);
    cx.spawn(async (cx) => {
      try {
        const [kind, id] = src.split(":");
        const d = await gql(KEEP.token, kind === "inbox" ? Q.inbox : listQuery(kind, this.show(src)), id ? { id } : {});
        let rows;
        let more = false;
        if (kind === "inbox") rows = [...(d.notifications?.nodes ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        else {
          const conn = kind === "mine" ? d.viewer?.assignedIssues : d.issues;
          rows = conn?.nodes ?? [];
          more = Boolean(conn?.pageInfo?.hasNextPage);
        }
        setUnread(d.notificationsUnreadCount ?? KEEP.unread);
        if (src === KEEP.src && this.bad) {
          this.status = "";
          this.bad = false;
        }
        const before = KEEP.lists.get(lk);
        // The selected row stays until the selection moves (an issue just closed, say), as Mail keeps a deleted message.
        if (before && KEEP.sel && lk === this.listKey() && !rows.some((r) => r.id === KEEP.sel)) {
          const i = before.findIndex((r) => r.id === KEEP.sel);
          if (i >= 0) rows.splice(Math.min(i, rows.length), 0, before[i]);
        }
        (KEEP.more ??= new Map()).set(lk, more);
        if (JSON.stringify(before) !== JSON.stringify(rows)) {
          KEEP.lists.set(lk, rows);
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

  /** Return in the search field: every issue in Linear that matches, as a list of its own. */
  searchAll(term, cx, quiet = false) {
    if (!quiet) {
      if (KEEP.src !== "search") this.back = KEEP.src;
      KEEP.term = term;
      KEEP.lists.delete("search");
      KEEP.src = "search";
      KEEP.sel = null;
      KEEP.issue = null;
      KEEP.note = null;
      this.status = "";
      this.bad = false;
      this.scroll.scroll_to_item(0, "top");
      this.focus.focus();
      cx.notify();
    }
    cx.spawn(async (cx) => {
      try {
        const d = await gql(KEEP.token, Q.search, { t: term });
        if (KEEP.term !== term) return;
        const rows = d.searchIssues?.nodes ?? [];
        KEEP.found = d.searchIssues?.totalCount ?? rows.length;
        if (JSON.stringify(KEEP.lists.get("search")) !== JSON.stringify(rows)) {
          KEEP.lists.set("search", rows);
          cx.notify();
        }
      } catch (e) {
        if (KEEP.src === "search") this.say(plain(e), cx, true, 0);
      }
    });
  }

  /** Esc: the search cleared (and back where it started), and the keyboard back on the list. */
  escape(cx) {
    if (this.query || KEEP.src === "search") {
      this.query = "";
      this.search.set_value("");
      if (KEEP.src === "search") this.pick(this.back ?? winState("linear").last ?? "mine", cx);
    }
    this.focus.focus();
    cx.notify();
  }

  /** What the typed search matches in a row. */
  hay(r) {
    if (KEEP.src === "inbox") return `${who(r.actor)} ${r.issue?.identifier ?? ""} ${r.title ?? ""} ${r.subtitle ?? ""}`.toLowerCase();
    return `${r.identifier} ${r.title} ${who(r.assignee)} ${r.state?.name ?? ""}`.toLowerCase();
  }

  /** The sort picked for this kind of list, by a column's key: newest first unless chosen. */
  sortOf() {
    return winState("linear").sort?.[KEEP.src === "inbox" ? "inbox" : "issues"] ?? { k: "date", up: false };
  }

  sortBy(k, cx) {
    const kind = KEEP.src === "inbox" ? "inbox" : "issues";
    const cur = this.sortOf();
    const next = cur.k === k ? { k, up: !cur.up } : { k, up: k !== "date" };
    setWin("linear", { sort: { ...(winState("linear").sort ?? {}), [kind]: next } });
    cx.notify();
  }

  /** The rows shown: the source's list, the typed search's matches, sorted. Kept until any of those change. */
  rows() {
    const base = KEEP.lists.get(this.listKey()) ?? [];
    const inbox = KEEP.src === "inbox";
    const unreadOnly = inbox && this.show() === "unread";
    // A search of all of Linear already matched its term; typing more narrows it.
    const q = KEEP.src === "search" && this.query === KEEP.term ? "" : this.query.toLowerCase();
    const sort = this.sortOf();
    const ck = `${q}|${sort.k}|${sort.up}|${unreadOnly ? KEEP.sel : ""}|${this.show()}`;
    if (this.memo?.base === base && this.memo.ck === ck) return this.memo.out;
    let out = base;
    if (unreadOnly) out = out.filter((r) => !r.readAt || r.id === KEEP.sel);
    if (q) out = out.filter((r) => this.hay(r).includes(q));
    const order = new Map();
    for (const t of KEEP.teams) t.states.forEach((st, i) => order.set(st.id, i));
    const closedView = this.show() === "closed";
    const by = {
      dot: (r) => (r.readAt ? 1 : 0),
      from: (r) => who(r.actor).toLowerCase() || "￿",
      subject: (r) => String(r.title ?? "").toLowerCase(),
      pri: (r) => r.priority || 9,
      id: (r) => [r.team?.key ?? "", Number(String(r.identifier).split("-")[1]) || 0],
      title: (r) => String(r.title ?? "").toLowerCase(),
      state: (r) => order.get(r.state?.id) ?? 99,
      who: (r) => who(r.assignee).toLowerCase() || "￿",
      date: (r) => (inbox ? r.createdAt : closedView ? r.completedAt ?? r.canceledAt ?? r.updatedAt : r.updatedAt) ?? "",
    }[sort.k];
    if (by) {
      const keyed = out.map((r, i) => [by(r), i, r]);
      keyed.sort((a, b) => (sort.up ? cmp(a[0], b[0]) : cmp(b[0], a[0])) || a[1] - b[1]);
      out = keyed.map((x) => x[2]);
    }
    this.memo = { base, ck, out };
    return out;
  }

  /** A row clicked: its issue below (a notification's issue, marked read unless only right-clicked). */
  select(id, cx, read = true) {
    this.focus.focus();
    const r = this.rows().find((x) => x.id === id);
    if (!r) return;
    KEEP.sel = id;
    cx.notify();
    if (KEEP.src === "inbox") {
      if (!r.readAt && read) this.setRead([r.id], true, cx, true);
      if (!r.issue) {
        KEEP.issue = null;
        KEEP.note = r;
        return cx.notify();
      }
      KEEP.note = null;
      if (KEEP.issue?.id === r.issue.id && !KEEP.issue.error) return;
      return this.loadIssue(r.issue.id, cx);
    }
    KEEP.note = null;
    if (KEEP.issue?.id === r.id && !KEEP.issue.error) return;
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

  /** An issue as a list or the open issue knows it, by id. */
  findIssue(id) {
    if (KEEP.issue?.id === id && !KEEP.issue.loading && !KEEP.issue.error) return KEEP.issue;
    for (const rows of KEEP.lists.values())
      for (const r of rows) {
        if (r.id === id && r.identifier) return r;
        if (r.issue?.id === id) return r.issue;
      }
    return null;
  }

  /** The notification shown by id. */
  findNote(id) {
    return (KEEP.lists.get("inbox") ?? []).find((r) => r.id === id) ?? null;
  }

  // ---- changes

  /** A change picked from a menu (kit.js perform → sl.linear pick), or the undo of one. */
  apply(p, cx) {
    if (!KEEP.token) return;
    const op = p.do ?? "set";
    if (op === "set") return this.setField(p.issue, p.field, p.value, cx, p.undoing);
    if (op === "read") return this.setRead(p.ids, p.read, cx, false, p.undoing);
    if (op === "readAll") return this.readAll(cx);
    if (op === "archive") return this.archive(p.ids, cx);
    if (op === "archiveRead") return cx.spawn(async (cx) => this.archive((await this.inbox(cx)).filter((r) => r.readAt).map((r) => r.id), cx));
    if (op === "unarchive") return this.unarchive(p.ids, cx);
    if (op === "show") return this.setShow(p.src, p.show, cx);
    if (op === "refresh") return p.src === KEEP.src ? this.refresh(cx) : this.loadList(p.src, cx);
    if (op === "signOut") return cx.spawn((cx) => this.signOut(cx));
  }

  /** ⌘Z: the last change made from here, taken back. */
  undoLast(cx) {
    const u = KEEP.undo;
    if (!u) return;
    KEEP.undo = null;
    this.apply({ ...u, undoing: true }, cx);
  }

  /** A status, priority or assignee changed, on any issue shown: at once on screen, then in Linear (put back if Linear says no). */
  setField(id, field, value, cx, undoing = false) {
    const cur = this.findIssue(id);
    if (!cur) return;
    const input = {};
    const patch = {};
    let was;
    if (field === "state") {
      const st = KEEP.teams.find((t) => t.id === cur.team?.id)?.states.find((s) => s.id === value);
      if (!st || st.id === cur.state?.id) return;
      was = cur.state?.id;
      input.stateId = st.id;
      patch.state = { id: st.id, name: st.name, type: st.type, color: st.color };
    } else if (field === "priority") {
      if (value === cur.priority) return;
      was = cur.priority;
      input.priority = value;
      patch.priority = value;
    } else if (field === "assignee") {
      if ((value ?? null) === (cur.assignee?.id ?? null)) return;
      was = cur.assignee?.id ?? null;
      input.assigneeId = value ?? null;
      const u = KEEP.users.find((x) => x.id === value);
      patch.assignee = u ? { id: u.id, name: u.full, displayName: u.name } : null;
    } else return;
    const before = { id, state: cur.state, priority: cur.priority, assignee: cur.assignee };
    const name = cur.identifier;
    const put = (fields) => {
      if (KEEP.issue?.id === id && !KEEP.issue.loading) Object.assign(KEEP.issue, fields);
      this.patchRow({ id, ...fields });
    };
    put(patch);
    this.say("Saving…", cx, false, 0);
    cx.spawn(async (cx) => {
      try {
        const d = await gql(KEEP.token, Q.update, { id, input });
        if (!d.issueUpdate?.success) throw new Error("not saved");
        if (d.issueUpdate.issue) put(pickRow(d.issueUpdate.issue));
        const done =
          field === "state" ? `Moved ${name} to ${patch.state.name}.` : field === "priority" ? `${name} is ${PRIORITY[value].toLowerCase()} now.` : patch.assignee ? `Assigned ${name} to ${who(patch.assignee)}.` : `${name} has no assignee now.`;
        if (!undoing) KEEP.undo = { do: "set", issue: id, field, value: was };
        this.say(undoing ? `Undone: ${done}` : `${done} ⌘Z undoes it.`, cx);
      } catch (e) {
        put(before);
        this.say(`Not saved. ${plain(e)}`, cx, true, 8000);
      }
      cx.notify();
    });
  }

  /** Some notifications' fields changed in the inbox's list (and the open one). */
  editNotes(ids, fields) {
    const set = new Set(ids);
    const rows = KEEP.lists.get("inbox");
    if (rows) KEEP.lists.set("inbox", rows.map((r) => (set.has(r.id) ? { ...r, ...fields(r) } : r)));
    if (KEEP.note && set.has(KEEP.note.id)) KEEP.note = { ...KEEP.note, ...fields(KEEP.note) };
  }

  /** Many notifications changed in as few requests as possible (50 at a time, each an aliased mutation). */
  async many(ids, one, op, field, vars = {}) {
    if (ids.length === 1) {
      const d = await gql(KEEP.token, one, { id: ids[0], ...vars });
      if (!Object.values(d ?? {})[0]?.success) throw new Error("not saved");
      return;
    }
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50);
      const d = await gql(KEEP.token, manyQuery(op, field, part, "at" in vars), { ...vars, ...Object.fromEntries(part.map((id, j) => [`i${j}`, id])) });
      if (Object.values(d ?? {}).some((x) => !x?.success)) throw new Error("not saved");
    }
  }

  /** Marks notifications read or unread: the dots and the counts at once, then Linear. */
  setRead(ids, read, cx, quiet = false, undoing = false) {
    const targets = ids.map((id) => this.findNote(id)).filter((n) => n && Boolean(n.readAt) !== read);
    if (!targets.length) return;
    const at = read ? new Date().toISOString() : null;
    const was = new Map(targets.map((n) => [n.id, n.readAt]));
    const changed = targets.map((n) => n.id);
    this.editNotes(changed, () => ({ readAt: at }));
    setUnread(Math.max(0, KEEP.unread + (read ? -1 : 1) * changed.length));
    if (!quiet) this.say(read ? "Marking as read…" : "Marking as unread…", cx, false, 0);
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.many(changed, Q.read, "MarkMany", "notificationUpdate", { at });
        if (quiet) return;
        const what = `Marked ${plural(changed.length, "notification")} as ${read ? "read" : "unread"}.`;
        if (!undoing) KEEP.undo = { do: "read", ids: changed, read: !read };
        this.say(undoing ? `Undone: ${what}` : `${what} ⌘Z undoes it.`, cx);
      } catch (e) {
        this.editNotes(changed, (n) => ({ readAt: was.get(n.id) ?? null }));
        setUnread(Math.max(0, KEEP.unread + (read ? 1 : -1) * changed.length));
        this.say(`Not changed. ${plain(e)}`, cx, true, 8000);
      }
      cx.notify();
    });
  }

  /** The inbox's notifications, loaded first if the inbox hasn't been opened yet. */
  async inbox(cx) {
    if (KEEP.lists.has("inbox")) return KEEP.lists.get("inbox");
    try {
      const d = await gql(KEEP.token, Q.inbox);
      const rows = [...(d.notifications?.nodes ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      KEEP.lists.set("inbox", rows);
      setUnread(d.notificationsUnreadCount ?? KEEP.unread);
      return rows;
    } catch (e) {
      this.say(plain(e), cx, true, 8000);
      return [];
    }
  }

  readAll(cx) {
    cx.spawn(async (cx) => {
      const ids = (await this.inbox(cx)).filter((r) => !r.readAt).map((r) => r.id);
      if (!ids.length) {
        // The count says more than the inbox holds (older ones past the first 100): ask again.
        setUnread(0);
        return this.loadList("inbox", cx);
      }
      this.setRead(ids, true, cx);
    });
  }

  /** Archives notifications: out of the list at once (the next row selected, as Mail does), then out of Linear's inbox. */
  archive(ids, cx) {
    const rows = KEEP.lists.get("inbox") ?? [];
    const set = new Set(ids);
    const gone = rows.map((r, i) => ({ r, i })).filter((x) => set.has(x.r.id));
    if (!gone.length) return;
    const shown = this.rows();
    const selGone = set.has(KEEP.sel);
    let next = null;
    if (selGone) {
      const at = shown.findIndex((r) => r.id === KEEP.sel);
      next = shown.slice(at + 1).find((r) => !set.has(r.id)) ?? shown.slice(0, Math.max(0, at)).reverse().find((r) => !set.has(r.id)) ?? null;
    }
    KEEP.lists.set("inbox", rows.filter((r) => !set.has(r.id)));
    (KEEP.archived ??= new Map());
    for (const x of gone) KEEP.archived.set(x.r.id, x);
    const unread = gone.filter((x) => !x.r.readAt).length;
    setUnread(Math.max(0, KEEP.unread - unread));
    if (selGone) {
      KEEP.sel = null;
      KEEP.issue = null;
      KEEP.note = null;
      if (next && KEEP.src === "inbox") this.select(next.id, cx);
    }
    this.say("Archiving…", cx, false, 0);
    cx.spawn(async (cx) => {
      try {
        await this.many(gone.map((x) => x.r.id), Q.archive, "ArchiveMany", "notificationArchive");
        KEEP.undo = { do: "unarchive", ids: gone.map((x) => x.r.id) };
        this.say(`Archived ${plural(gone.length, "notification")}. ⌘Z undoes it.`, cx);
      } catch (e) {
        this.restore(gone);
        setUnread(KEEP.unread + unread);
        this.say(`Not archived. ${plain(e)}`, cx, true, 8000);
      }
      cx.notify();
    });
  }

  /** Archived rows back where they were. */
  restore(gone) {
    const rows = [...(KEEP.lists.get("inbox") ?? [])];
    for (const x of [...gone].sort((a, b) => a.i - b.i)) if (!rows.some((r) => r.id === x.r.id)) rows.splice(Math.min(x.i, rows.length), 0, x.r);
    KEEP.lists.set("inbox", rows);
  }

  unarchive(ids, cx) {
    const gone = ids.map((id) => KEEP.archived?.get(id)).filter(Boolean);
    if (!gone.length) return;
    this.restore(gone);
    setUnread(KEEP.unread + gone.filter((x) => !x.r.readAt).length);
    this.say("Putting back…", cx, false, 0);
    cx.spawn(async (cx) => {
      try {
        await this.many(ids, Q.unarchive, "UnarchiveMany", "notificationUnarchive");
        for (const id of ids) KEEP.archived.delete(id);
        this.say(`Undone: ${plural(gone.length, "notification")} back in the inbox.`, cx);
      } catch (e) {
        this.say(`Not put back. ${plain(e)}`, cx, true, 8000);
        this.loadList("inbox", cx);
      }
      cx.notify();
    });
  }

  send(cx) {
    const body = this.compose.value().trim();
    const it = KEEP.issue;
    if (!body || !it || it.loading || it.error) return;
    this.compose.set_value("");
    this.say(`Commenting on ${it.identifier}…`, cx, false, 0);
    cx.spawn(async (cx) => {
      try {
        const d = await gql(KEEP.token, Q.comment, { input: { issueId: it.id, body } });
        if (!d.commentCreate?.success) throw new Error("not saved");
        this.say(`Commented on ${it.identifier}.`, cx);
        this.loadIssue(it.id, cx, true);
      } catch (e) {
        this.compose.set_value(body);
        this.say(`Not sent. ${plain(e)}`, cx, true, 8000);
      }
      cx.notify();
    });
  }

  // ---- menus

  /** A menu at the pointer, kept on screen: it opens upward when it wouldn't fit below. */
  popup(items, e, owner) {
    if (!items.length) return;
    closeMenus();
    const p = e.position;
    if (!p) return openMenu(items, undefined, { owner });
    const { h } = menuSize(items);
    const a = appSize();
    const y = a && p.y + h + 12 > a.h ? Math.max(24, p.y - h) : p.y;
    openMenu(items, { x: p.x, y }, { owner });
  }

  /** The menus for an issue's status, priority and assignee, under the button pressed. */
  menu(field, e) {
    const it = KEEP.issue;
    if (!it || it.loading || it.error) return;
    const set = (value) => pick({ issue: it.id, field, value });
    let items = [];
    if (field === "state") items = this.stateItems(it, set);
    else if (field === "priority") items = this.priorityItems(it, set);
    else {
      const me = KEEP.users.find((u) => u.id === KEEP.me?.id);
      const rest = KEEP.users.filter((u) => u.id !== KEEP.me?.id).slice(0, 40);
      items = [
        { label: "No Assignee", checked: !it.assignee, act: set(null) },
        { sep: true },
        ...(me ? [{ label: `${me.name} (you)`, checked: it.assignee?.id === me.id, act: set(me.id) }] : []),
        ...rest.map((u) => ({ label: u.name, checked: it.assignee?.id === u.id, act: set(u.id) })),
      ];
    }
    if (!items.length) return;
    closeMenus();
    const b = e.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height + 2 } : undefined, { owner: `linear-${field}` });
  }

  stateItems(it, set) {
    const states = KEEP.teams.find((t) => t.id === it.team?.id)?.states ?? [];
    return states.map((s) => ({ label: s.name, checked: s.id === it.state?.id, act: set(s.id) }));
  }

  priorityItems(it, set) {
    return [0, { sep: true }, 1, 2, 3, 4].map((n) => (typeof n === "number" ? { label: PRIORITY[n], checked: it.priority === n, act: set(n) } : n));
  }

  /** Right-click on a row: the row selected (a notification not marked read by it), then its menu. */
  rowMenu(id, e, cx) {
    const r = this.rows().find((x) => x.id === id);
    if (!r) return;
    if (KEEP.sel !== id) this.select(id, cx, false);
    this.popup(KEEP.src === "inbox" ? this.noteItems(r) : this.issueItems(r), e, "linear-row");
  }

  noteItems(r) {
    const iss = r.issue;
    const url = iss?.url ?? r.url;
    return [
      { label: "Open in Linear", shortcut: "⌘O", disabled: !url, act: { open: url } },
      { sep: true },
      { label: r.readAt ? "Mark as Unread" : "Mark as Read", shortcut: "⇧⌘U", act: pick({ do: "read", ids: [r.id], read: !r.readAt }) },
      { label: "Archive", shortcut: "⌫", act: pick({ do: "archive", ids: [r.id] }) },
      { sep: true },
      ...(iss ? [{ label: `Copy “${iss.identifier}”`, act: { copy: iss.identifier } }] : []),
      ...(url ? [{ label: "Copy Link", act: { copy: url } }] : []),
      { sep: true },
      { label: "Mark All as Read", disabled: !KEEP.unread, act: pick({ do: "readAll" }) },
    ];
  }

  issueItems(r) {
    const set = (field, value) => pick({ issue: r.id, field, value });
    const mine = Boolean(KEEP.me) && r.assignee?.id === KEEP.me.id;
    return [
      { label: "Open in Linear", shortcut: "⌘O", act: { open: r.url } },
      { label: `Copy “${r.identifier}”`, act: { copy: r.identifier } },
      { label: "Copy Link", act: { copy: r.url } },
      ...(r.branchName ? [{ label: "Copy Git Branch Name", act: { copy: r.branchName } }] : []),
      { sep: true },
      { label: mine ? "Unassign Me" : "Assign to Me", disabled: !KEEP.me, act: set("assignee", mine ? null : KEEP.me?.id) },
      { sep: true },
      { label: "Status", header: true },
      ...this.stateItems(r, (v) => set("state", v)),
      { sep: true },
      { label: "Priority", header: true },
      ...this.priorityItems(r, (v) => set("priority", v)).filter((x) => !x.sep),
    ];
  }

  /** A source's link in Linear itself. */
  sourceUrl(key) {
    const base = `https://linear.app/${KEEP.me?.urlKey ?? ""}`;
    if (key === "inbox") return `${base}/inbox`;
    if (key === "mine") return `${base}/my-issues/assigned`;
    if (key.startsWith("team:")) {
      const t = KEEP.teams.find((x) => x.id === key.slice(5));
      return t ? `${base}/team/${t.key}/active` : base;
    }
    if (key.startsWith("project:")) return KEEP.projects.find((x) => x.id === key.slice(8))?.url ?? base;
    return base;
  }

  /** Right-click on a source: the inbox's Mark All as Read and Archive All Read; a list's Open, Closed or All. */
  sourceMenu(key, e) {
    if (key.startsWith("h-") || !KEEP.token) return;
    const url = this.sourceUrl(key);
    const show = this.show(key);
    const kind = key === "inbox" ? "inbox" : "issues";
    const words = { inbox: { all: "Show All", unread: "Show Unread Only" }, issues: { open: "Open Issues", closed: "Closed Issues", all: "All Issues" } }[kind];
    const shows = SHOWS[kind].map(([v]) => ({ label: words[v], checked: show === v, act: pick({ do: "show", src: key, show: v }) }));
    const tail = [
      { sep: true },
      { label: "Check for Changes", shortcut: key === KEEP.src ? "⌘R" : undefined, act: pick({ do: "refresh", src: key }) },
      { label: key === "inbox" ? "Open Inbox in Linear" : "Open in Linear", act: { open: url } },
      { label: "Copy Link", act: { copy: url } },
    ];
    if (key === "inbox") {
      const rows = KEEP.lists.get("inbox");
      return this.popup(
        [
          { label: "Mark All as Read", disabled: !KEEP.unread, act: pick({ do: "readAll" }) },
          { label: "Archive All Read", disabled: Boolean(rows) && !rows.some((r) => r.readAt), act: pick({ do: "archiveRead" }) },
          { sep: true },
          ...shows,
          ...tail,
        ],
        e,
        "linear-src",
      );
    }
    this.popup([...shows, ...tail], e, "linear-src");
  }

  /** The toolbar's action menu (⚙): settings, links, and Sign Out (asked first). */
  gearMenu(e) {
    const url = this.hereUrl();
    const items = [
      { label: "Open Linear Settings…", act: { open: SETTINGS } },
      { label: "Copy Link", disabled: !url, act: { copy: url ?? "" } },
      { sep: true },
      { label: "Mark All as Read", disabled: !KEEP.unread, act: pick({ do: "readAll" }) },
      { sep: true },
      KEEP.token === DEMO
        ? { label: "Leave the Demo", act: pick({ do: "signOut" }) }
        : {
            label: "Sign Out…",
            act: {
              sheet: [
                "confirm",
                {
                  title: "Sign out of Linear?",
                  detail: "The key is removed from your Keychain. To come back, make a new personal API key in Linear's settings.",
                  yes: "Sign Out",
                  act: pick({ do: "signOut" }),
                },
              ],
            },
          },
    ];
    closeMenus();
    const b = e.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height + 2 } : undefined, { owner: "linear-gear" });
  }

  /** The link for what's shown: the open issue or notification, else the source. */
  hereUrl() {
    const it = KEEP.issue;
    if (it?.url) return it.url;
    if (KEEP.note?.url) return KEEP.note.url;
    const r = this.rows().find((x) => x.id === KEEP.sel);
    if (r) return r.issue?.url ?? r.url;
    return KEEP.src && KEEP.src !== "search" ? this.sourceUrl(KEEP.src) : null;
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
    if (KEEP.src === "search") return `Search: “${KEEP.term ?? ""}”`;
    const s = this.sources().find((x) => x.key === KEEP.src);
    return s?.name ?? "Linear";
  }

  /** The toolbar's buttons, as a window's and as a tab's. */
  tools(inTab) {
    const app = dockApps().find((a) => appName(a.path) === "Linear");
    const one = Boolean(KEEP.issue?.url || KEEP.note);
    const parts = [];
    if (KEEP.token) {
      parts.push(textured([{ id: "ln-refresh", glyph: GLYPH.refresh, size: 13, w: 32, tooltip: "Check for changes now (⌘R)", onClick: (_e, cx) => this.refresh(cx) }]));
      if (KEEP.src && KEEP.src !== "search") {
        const cur = this.show();
        parts.push(
          textured(SHOWS[KEEP.src === "inbox" ? "inbox" : "issues"].map(([v, label, w, tip]) => ({ id: `ln-show-${v}`, text: label, w, on: cur === v, tooltip: tip, onClick: (_e, cx) => this.setShow(KEEP.src, v, cx) }))),
        );
      } else if (KEEP.src === "search")
        parts.push(textured([{ id: "ln-back", glyph: GLYPH.left, size: 12, w: 30, tooltip: "Back to the list (Esc)", onClick: (_e, cx) => this.escape(cx) }]));
    }
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
    if (KEEP.token) {
      parts.push(
        textured([{ id: "ln-web", text: "Open in Linear", w: 112, tooltip: one ? "Open this in Linear (⌘O)" : "Open Linear", onClick: () => this.openHere(app) }]),
        textured([{ id: "ln-gear", glyph: GLYPH.gear, size: 13, w: 38, menu: true, onDown: (e) => this.gearMenu(e) }]),
        this.searchField(key()),
      );
    }
    return parts;
  }

  /** ⌘O and Open in Linear: the open issue or notification there, else Linear itself. */
  openHere(app = dockApps().find((a) => appName(a.path) === "Linear")) {
    const url = KEEP.issue?.url ?? KEEP.note?.url ?? (KEEP.sel ? this.hereUrl() : null);
    if (!url && app && !builtinApp(app.path)) return exec("open", ["-a", app.path]).catch(() => {});
    exec("open", [url ?? (KEEP.me?.urlKey ? `https://linear.app/${KEEP.me.urlKey}` : "https://linear.app")]).catch(() => {});
  }

  /** The round search field: typing narrows the list, Return searches all of Linear. */
  searchField(live) {
    const w = 170;
    const h = 22;
    return div()
      .id("ln-search")
      .relative()
      .flex_none()
      .w(w)
      .h(h + 1)
      .tooltip(KEEP.src === "inbox" ? "Narrow the inbox (⌘F)" : "Narrow the list; Return searches all of Linear (⌘F)")
      .child(paint(rrect(w, h, h / 2, 0, 1), "#ffffff60", w, h + 1))
      .child(paint(rrect(w, h, h / 2), live ? "#6d6d6d" : "#a0a0a0", w, h))
      .child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), "#ffffff", w, h))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .w(w)
          .h(h)
          .pl(9)
          .pr(8)
          .gap(5)
          .items_center()
          .child(svg(GLYPH.search).flex_none().w(12).h(12).text_color("#5a5a5a"))
          .child(Input.new(this.search).flex_1().h(h).text_size(12).text_color("#000000"))
          .when(Boolean(this.query), (el) =>
            el.child(
              div()
                .id("ln-search-x")
                .flex_none()
                .w(13)
                .h(13)
                .rounded_full()
                .bg("#9a9a9a")
                .flex()
                .items_center()
                .justify_center()
                .child(svg(GLYPH.close).w(7).h(7).text_color("#ffffff"))
                .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                .on_click((_e, cx) => this.escape(cx)),
            ),
          ),
      )
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        closeMenus();
      });
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
          .when(Boolean(app?.icon), (el) => el.child(div().flex_none().opacity(live ? 1 : 0.6).child(appImage(app.path, 16))))
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
              .on_item_click((k, cx) => this.pick(k, cx))
              .on_item_secondary_click((k, e) => this.sourceMenu(k, e)),
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
    cols.push(["date", this.show() === "closed" ? "Closed" : "Updated", 86]);
    return cols;
  }

  colHeads(cols, live) {
    const sort = this.sortOf();
    return h_flex()
      .id("ln-cols")
      .relative()
      .flex_none()
      .w_full()
      .h(HEAD)
      .child(fillGrad(live ? "#ffffff" : "#fbfbfb", live ? "#dcdcdc" : "#ececec"))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg("#a8a8a8"))
      .children(
        cols.map(([k, label, w]) => {
          const on = sort.k === k;
          const narrow = w !== null && w < 30;
          return h_flex()
            .id(`ln-col-${k}`)
            .relative()
            .h(HEAD)
            .when(w !== null, (el) => el.flex_none().w(w))
            .when(w === null, (el) => el.flex_1().min_w(0))
            .when(on, (el) => el.child(fillGrad(live ? "#d7e4f7" : "#eef2f8", live ? "#a9c1e6" : "#d5dde9")))
            .px(narrow ? 3 : 5)
            .gap(3)
            .items_center()
            .text_size(11)
            .text_color(live ? "#262626" : "#7a7a7a")
            .border_r_1()
            .border_color("#c4c4c4")
            .tooltip(`Sort by ${{ pri: "priority", dot: "unread first", date: label.toLowerCase() }[k] ?? label.toLowerCase()}`)
            .child(
              k === "pri"
                ? div().relative().child(priorityMark(2, false))
                : k === "dot"
                  ? div().relative().text_size(8).text_color("#6a6a6a").child("●")
                  : div().relative().flex_1().min_w(0).truncate().child(label),
            )
            .when(on && !narrow, (el) => el.child(div().relative().flex_none().text_size(8).text_color("#3a3a3a").child(sort.up ? "▲" : "▼")))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => this.sortBy(k, cx));
        }),
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
    // Done and canceled issues are grayed, as Mail grays a deleted message.
    const fg = on ? "#ffffff" : KEEP.src !== "inbox" && closed(r) ? "#8a8a8a" : "#000000";
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
      date: () => text(when(inbox ? r.createdAt : this.show() === "closed" ? r.completedAt ?? r.canceledAt ?? r.updatedAt : r.updatedAt), dim),
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

  emptyWords() {
    const show = this.show();
    if (this.query && KEEP.src !== "search") return `Nothing here matches “${this.query}”.${KEEP.src !== "inbox" ? " Press Return to search all of Linear." : ""}`;
    if (KEEP.src === "search") return `Nothing in Linear matches “${KEEP.term}”.`;
    if (KEEP.src === "inbox") return show === "unread" ? "No unread notifications." : "Your inbox is empty.";
    if (KEEP.src === "mine") return { open: "Nothing assigned to you is open.", closed: "Nothing assigned to you is closed yet.", all: "Nothing is assigned to you." }[show];
    return { open: "No open issues here.", closed: "No closed issues here yet.", all: "No issues here." }[show];
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
    const loading = !KEEP.lists.has(this.listKey());
    const empty = this.emptyWords();
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
              .on_item_click((id, cx) => this.select(id, cx))
              .on_item_secondary_click((id, e, cx) => this.rowMenu(id, e, cx)),
          )
          .child(this.scrollbar(rows.length, live)),
      )
      .when(loading || !rows.length, (el) =>
        el.child(
          v_flex()
            .absolute()
            .top(HEAD + (band ? 36 : 8))
            .left(0)
            .w_full()
            .px(20)
            .gap(8)
            .items_center()
            .text_size(12)
            .text_color(C.gray)
            .when(loading && this.bad, (el) =>
              el.child(div().text_color("#9c1b10").child(this.status || "Linear didn't answer.")).child(aquaButton("ln-retry", "Try Again", (_e, cx) => this.refresh(cx), { w: 100 })),
            )
            .when(loading && !this.bad, (el) => el.child(h_flex().gap(5).items_center().child(svg(GLYPH.spinner).w(12).h(12).text_color("#6a6a6a").spin(900)).child("Loading…")))
            .when(!loading, (el) => el.child(empty)),
        ),
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
  field(id, label, fieldKey, lead = null) {
    return textured([{ id, text: label, lead, w: 26 + label.length * 7 + (lead ? 14 : 0), menu: true, onDown: (e) => {
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
          // The keys (↑ ↓, ⌘Z…) keep working after a click on the issue.
          this.focus.focus();
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
          .child(this.field("ln-f-state", it.state?.name ?? "Status", "state", stateMark(it.state, false)))
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
    const shown = this.rows().length;
    const all = (KEEP.lists.get(this.listKey()) ?? []).length;
    if (KEEP.src === "search") {
      if (!KEEP.lists.has("search")) return `Searching Linear for “${KEEP.term}”…`;
      const found = KEEP.found ?? all;
      return `${plural(all, "issue")} ${found > all ? `(of ${found}) ` : ""}${all === 1 ? "matches" : "match"} “${KEEP.term}”${shown !== all ? ` · ${shown} shown` : ""} · Esc goes back`;
    }
    if (this.query) return `${shown} of ${all} match “${this.query}”${KEEP.src !== "inbox" ? " · Return searches all of Linear" : ""}`;
    if (KEEP.src === "inbox") return `${KEEP.unread} unread · updates every 30 s`;
    const show = this.show();
    const more = KEEP.more?.get(this.listKey()) ? (show === "closed" ? " (the 50 most recent)" : " (the 100 most recently updated)") : "";
    const what = show === "open" ? plural(all, "open issue") : show === "closed" ? plural(all, "closed issue") : plural(all, "issue");
    return `${what}${more} · updates every 30 s`;
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

  /** Mail's keys. The ⌘ ones work anywhere in the window; the plain ones only while no field has the keyboard
   *  (so ↑ in the comment field never moves to another issue). */
  keys(el) {
    return el.on_key_down((e, cx) => {
      if (!KEEP.token) return;
      const k = stroke(e);
      const list = this.focus.is_focused();
      const sel = KEEP.src === "inbox" && KEEP.sel ? this.findNote(KEEP.sel) : null;
      if (k === "cmd-r" || k === "shift-cmd-n") this.refresh(cx);
      else if (k === "cmd-f" || k === "alt-cmd-f") this.search.focus();
      else if (k === "cmd-o") this.openHere();
      else if (k === "escape") this.escape(cx);
      else if (k === "shift-cmd-u" && sel) this.setRead([sel.id], !sel.readAt, cx);
      else if (k === "cmd-z" && list && KEEP.undo) this.undoLast(cx);
      else if (!list) return;
      else if (k === "down") this.step(1, cx);
      else if (k === "up") this.step(-1, cx);
      else if ((k === "backspace" || k === "delete") && sel) this.archive([sel.id], cx);
      else if (k === "enter" && KEEP.issue && !KEEP.issue.loading && !KEEP.issue.error) this.compose.focus();
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
    // One of this window's menus closed: the keyboard comes back to the list (a menu takes it while open).
    const m = shared("sl.menu");
    if (m && !m.id && String(m.closed ?? "").startsWith("linear-") && m.at !== this.menuBack) {
      this.menuBack = m.at;
      cx.timer.after(0, () => this.inField || this.focus.focus());
    }
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
      .on_mouse_move((e, cx) => {
        dragScroll(this.sb, e, cx);
        noteWinSpot("linear", e.bounds, cx, true);
      })
      .on_mouse_up("left", () => endScroll(this.sb))
      .on_mouse_down("left", (e, cx) => {
        closeMenus();
        noteWinSpot("linear", e.bounds, cx);
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
