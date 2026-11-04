// Messages (iMessage and SMS on this Mac), opened from Messages' Dock icon: in its
// own Aqua window (an app window, see kit.js; the default), or as a tab in the
// main window (props inTab). Conversations on the left, newest first, with
// their unread counts and latest message; the open one as bubbles (blue sent,
// gray received, names in groups); a field to send. Right-click a conversation
// to open it in Messages, copy it or mark it read here; the toolbar narrows the
// list by name. Messages itself is one click away for anything else.
//
// What it reads and how it sends are in imessagedb.js. Reading here doesn't mark
// anything read in Messages (that needs Apple's private API): Herdr keeps its
// own marks, so its counts and Messages' can differ.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { props, exec, closeOverlay, run, shared } from "herdr";
import {
  C, FONT, GLYPH, key, paint, rrect, vgrad, fillGrad, embossed, bead, textured, aquaButton, closeMenus, openMenu, menuSize, appSize, winState, setWin, noteWinSpot,
  closeWin, zoomWin, startTornResize, dockApps, appName, appImage, openWin, appTab, aquaScrollbar, dragScroll, endScroll,
} from "./kit.js";
import {
  KEEP, PRIVACY_URL, demoOn, loadConvs, loadThread, sendText, openInMessages, unread, markSeen, markAllSeen, imessageShown, connect, disconnect, nameFor, prettyHandle,
} from "./imessagedb.js";

const TITLE = 22;
const TOOLBAR = 32;
const BAR = 15;
const SIDE = 250;
const ROW = 46;
const MESSAGES_APP = "/System/Applications/Messages.app";

// A change from a menu: kit.js perform hands it to the window (sl.imessage pick → apply).
const pick = (p) => ({ imessagePick: p });

/** A keystroke with its modifiers in one order, whichever order Herdr names them in. */
function stroke(e) {
  const parts = String(e.keystroke ?? "").toLowerCase().split("-");
  const k = parts.pop() || "-";
  return [...["ctrl", "alt", "shift", "cmd"].filter((m) => parts.includes(m)), k].join("-");
}

const tile = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ["#3b7cef", "#2fa443", "#d9822b", "#9c4dcc", "#d23a64", "#1d9aa5", "#7a6f5a", "#5a6ad6"][Math.abs(h) % 8];
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clock(d) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const pm = h >= 12;
  h = h % 12 || 12;
  return `${h}:${m} ${pm ? "PM" : "AM"}`;
}

/** How long ago a day was, in whole days (0 today, 1 yesterday). */
function daysAgo(d) {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

/** The list's dates, as Messages has them: the time today, Yesterday, the weekday this week, else the date. */
function listDate(t) {
  if (!t) return "";
  const d = new Date(t);
  const n = daysAgo(d);
  if (n <= 0) return clock(d);
  if (n === 1) return "Yesterday";
  if (n < 7) return DAYS[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/** The line between messages far apart in time: Today 3:42 PM, Yesterday…, Monday…, Nov 2… */
function dayLine(t) {
  const d = new Date(t);
  const n = daysAgo(d);
  const day = n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 7 ? DAYS[d.getDay()] : `${MONTHS[d.getMonth()]} ${d.getDate()}${d.getFullYear() === new Date().getFullYear() ? "" : `, ${d.getFullYear()}`}`;
  return `${day} ${clock(d)}`;
}

/** Two letters for a name's tile, or none for a bare number or address (it gets a person). */
function initials(name) {
  if (/^[+(\d]/.test(name) || name.includes("@")) return "";
  const w = name.split(/[\s,]+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? "")).toUpperCase();
}

/** Mail's source-list count: a gray-blue pill, white on a selected row. */
function countPill(n, on) {
  const label = String(n > 99 ? "99+" : n);
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

function avatar(c, s) {
  const ini = initials(c.name);
  return div()
    .relative()
    .flex_none()
    .w(s)
    .h(s)
    .child(paint(rrect(s, s, s / 2), c.group ? "#8e97a6" : tile(c.name), s, s))
    .child(paint(rrect(s - 4, s / 2 - 2, (s / 2 - 2) / 2, 2, 1), vgrad("#ffffff70", "#ffffff10"), s, s))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .text_size(Math.round(s * 0.38))
        .font_weight(700)
        .text_color("#ffffff")
        .when(Boolean(ini), (el) => el.child(ini))
        .when(!ini, (el) => el.child(svg(GLYPH.person).w(Math.round(s * 0.55)).h(Math.round(s * 0.55)).text_color("#ffffff"))),
    );
}

export default class IMessage {
  init(_p, cx) {
    this.size = null;
    this.lit = false;
    this.status = "";
    this.bad = false;
    this.ready = false;
    this.busy = false;
    this.sending = false;
    this.query = "";
    this.demo = false;
    this.focus = cx.focus_handle();
    this.focus.focus();
    // The send field, worded as Messages words it: iMessage, or Text Message for SMS.
    this.fields = { iMessage: InputState.new({ placeholder: "iMessage" }), SMS: InputState.new({ placeholder: "Text Message" }) };
    for (const f of Object.values(this.fields)) f.on("submit", (_e, cx) => this.send(cx));
    this.search = InputState.new({ placeholder: "Search" });
    this.search.on("change", (_e, cx) => {
      const q = this.search.value().trim();
      if (q === this.query) return;
      this.query = q;
      cx.notify();
    });
    this.search.on("submit", (_e, cx) => {
      const first = this.list()[0];
      if (first) this.open(first.id, cx);
    });
    this.inField = false;
    for (const f of [...Object.values(this.fields), this.search]) {
      f.on("focus", () => (this.inField = true));
      f.on("blur", () => (this.inField = false));
    }
    this.scroll = VirtualListScrollHandle.new();
    this.vis = { lo: 0, hi: -1 };
    this.drawn = "";
    this.follow = true;
    this.sb = {};
    cx.timer.every(120, (cx) => {
      if (`${this.vis.lo},${this.vis.hi}` !== this.drawn) cx.notify();
    });
    // The demo switched on or off: seen here too, not only by the Dock's watch.
    cx.timer.every(5000, (cx) =>
      cx.spawn(async (cx) => {
        const was = this.on();
        await demoOn();
        if (this.on() !== was) cx.notify();
      }),
    );
    cx.spawn(async (cx) => {
      this.demo = await demoOn();
      if (this.demo || winState("imessage").on === true) await this.reload(cx, true);
      this.ready = true;
      cx.notify();
    });
  }

  /** Reading: the demo (as the Dock's watch last found it), or the person turned it on here. */
  on() {
    return Boolean(KEEP.demo?.on ?? this.demo) || winState("imessage").on === true;
  }

  /** The conversations again, and the open one's messages. */
  async reload(cx, start = false) {
    try {
      await loadConvs();
      if (start || !KEEP.convs.some((c) => c.id === KEEP.cur)) this.start(cx);
      else if (KEEP.cur) await this.fetch(KEEP.cur, cx);
      this.say("", cx);
    } catch (e) {
      this.fail(e, cx);
    }
  }

  fail(e, cx) {
    const m = e?.message ?? String(e);
    this.say(m === "access" ? "macOS didn't let Herdr read Messages. It needs Full Disk Access: ⚙ › Open Privacy Settings…" : m === "off" ? "" : `Couldn't read Messages (${m}).`, cx, m !== "off");
  }

  say(text, cx, bad = false) {
    this.status = text;
    this.bad = bad;
    cx.notify();
  }

  /** Opens the conversation a banner was about, the one last open, or the newest. */
  start(cx) {
    const last = winState("imessage").last;
    const c = KEEP.convs.find((x) => x.id === last) ?? KEEP.convs[0];
    if (c) this.open(c.id, cx);
  }

  open(id, cx) {
    if (KEEP.cur !== id) {
      KEEP.cur = id;
      setWin("imessage", { last: id });
      this.follow = true;
    }
    cx.notify();
    this.fetch(id, cx, true);
  }

  conv() {
    return KEEP.convs.find((c) => c.id === KEEP.cur) ?? null;
  }

  /** The send field for the open conversation. */
  field() {
    return this.fields[this.conv()?.service === "SMS" ? "SMS" : "iMessage"];
  }

  async fetch(id, cx, jump = false) {
    try {
      const before = KEEP.msgs.get(id);
      const rows = await loadThread(id);
      if (id !== KEEP.cur) return;
      const changed = !before || before.length !== rows.length || before[before.length - 1]?.id !== rows[rows.length - 1]?.id || before.some((m, i) => m.failed !== rows[i]?.failed);
      if (!changed && !jump) return;
      cx.notify();
      if (jump || this.follow) {
        this.follow = true;
        for (const ms of [0, 120, 400])
          cx.timer.after(ms, (cx) => {
            if (id !== KEEP.cur || !this.follow) return;
            this.scroll.scroll_to_item(Math.max(0, rows.length - 1), "top");
            this.scroll.scroll_to_bottom();
            cx.notify();
          });
      }
    } catch (e) {
      if (id === KEEP.cur) this.fail(e, cx);
    }
  }

  /** Return in the field: sent through Messages, and back in the field if Messages says no. */
  send(cx) {
    const field = this.field();
    const text = field.value().trim();
    const c = this.conv();
    if (!text || !c || this.sending) return;
    this.sending = true;
    field.set_value("");
    this.say("Sending…", cx);
    cx.spawn(async (cx) => {
      try {
        await sendText(c, text);
        this.say("", cx);
        // Messages writes the sent message a moment later.
        for (const ms of [300, 1500]) {
          await cx.sleep(ms);
          await loadConvs().catch(() => {});
          await this.fetch(c.id, cx, true);
        }
      } catch (e) {
        if (!field.value()) field.set_value(text);
        this.say(`Not sent. ${e?.message ?? e}`, cx, true);
      } finally {
        this.sending = false;
        cx.notify();
      }
    });
  }

  /** The setup panel's button: one read to see whether macOS allows it. */
  async connect(cx) {
    this.busy = true;
    this.say("Reading Messages…", cx);
    const err = await connect();
    this.busy = false;
    if (err === "access") this.say("macOS didn't let Herdr read Messages. Herdr needs Full Disk Access: open Privacy Settings, switch Herdr on, then quit and reopen Herdr.", cx, true);
    else if (err) this.say(`Couldn't read Messages (${err}).`, cx, true);
    else {
      this.say("", cx);
      this.start(cx);
    }
  }

  /** A change picked from a menu (kit.js perform → sl.imessage pick). */
  apply(p, cx) {
    if (p.do === "read") {
      const c = KEEP.convs.find((x) => x.id === p.id);
      if (c) markSeen(c.id, c.last.id);
    } else if (p.do === "readAll") markAllSeen();
    else if (p.do === "stop") {
      disconnect();
      this.say("", cx);
    } else if (p.do === "refresh") this.refresh(cx);
    cx.notify();
  }

  refresh(cx) {
    if (!this.on()) return;
    cx.spawn((cx) => this.reload(cx));
  }

  /** The conversations the search leaves: by name, or by a member's name or address. */
  list() {
    const q = this.query.toLowerCase();
    if (!q) return KEEP.convs;
    return KEEP.convs.filter((c) => c.name.toLowerCase().includes(q) || c.members.some((m) => m.toLowerCase().includes(q) || nameFor(m).toLowerCase().includes(q)));
  }

  step(d, cx) {
    const rows = this.list();
    const i = rows.findIndex((c) => c.id === KEEP.cur);
    const to = rows[Math.max(0, Math.min(rows.length - 1, i + d))];
    if (to && to.id !== KEEP.cur) this.open(to.id, cx);
  }

  escape(cx) {
    if (this.query) {
      this.query = "";
      this.search.set_value("");
    }
    this.focus.focus();
    cx.notify();
  }

  // ---- menus

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

  /** Open in Messages: a person by their address; a group in Messages itself. */
  openAct(c) {
    const who = c && !c.group ? c.ident || c.members[0] : null;
    return who ? { open: `imessage:${who}` } : { launch: [MESSAGES_APP] };
  }

  convMenu(id, e) {
    const c = KEEP.convs.find((x) => x.id === id);
    if (!c) return;
    const n = unread()[c.id] ?? 0;
    const who = c.group ? null : c.ident || c.members[0];
    this.popup(
      [
        { label: "Open in Messages", act: this.openAct(c) },
        { sep: true },
        { label: "Copy Name", act: { copy: c.name } },
        ...(who ? [{ label: who.includes("@") ? "Copy Email Address" : "Copy Phone Number", act: { copy: prettyHandle(who) } }] : []),
        { sep: true },
        { label: "Mark as Read", disabled: !n, act: pick({ do: "read", id: c.id }) },
        { label: "Mark All as Read", disabled: !Object.keys(unread()).length, act: pick({ do: "readAll" }) },
      ],
      e,
      "imessage-conv",
    );
  }

  msgMenu(id, e) {
    const m = (KEEP.msgs.get(KEEP.cur) ?? []).find((x) => String(x.id) === String(id));
    if (!m) return;
    const f = m.files[0];
    this.popup(
      [
        { label: "Copy", disabled: !m.text, act: { copy: m.text } },
        ...(f ? [{ sep: true }, { label: m.files.length > 1 ? "Open Attachments" : "Open Attachment", act: { open: f.path } }, { label: "Show in Finder", act: { reveal: f.path } }] : []),
        { sep: true },
        { label: "Open in Messages", act: this.openAct(this.conv()) },
      ],
      e,
      "imessage-msg",
    );
  }

  gearMenu(e) {
    const items = [
      { label: "Mark All as Read", disabled: !Object.keys(unread()).length, act: pick({ do: "readAll" }) },
      { label: "Check for New Messages", shortcut: "⌘R", act: pick({ do: "refresh" }) },
      { sep: true },
      { label: "Open Messages App", act: { launch: [MESSAGES_APP] } },
      { label: "Open Privacy Settings…", act: { open: PRIVACY_URL } },
      ...(KEEP.demo?.on
        ? []
        : [
            { sep: true },
            {
              label: "Stop Reading Messages…",
              act: {
                sheet: [
                  "confirm",
                  {
                    title: "Stop reading Messages in Herdr?",
                    detail: "Herdr stops reading your conversations and the Dock's badge goes away. Messages itself is untouched.",
                    yes: "Stop Reading",
                    act: pick({ do: "stop" }),
                  },
                ],
              },
            },
          ]),
    ];
    closeMenus();
    const b = e.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height + 2 } : undefined, { owner: "imessage-gear" });
  }

  // ---- parts

  lights(live) {
    const p = props() ?? {};
    const on = live || this.lit;
    const kinds = [
      ["close", GLYPH.close, "Close", () => closeWin("imessage", p.overlay)],
      ["min", GLYPH.minus, "Minimize to the Dock", () => closeWin("imessage", p.overlay, true)],
      ["zoom", GLYPH.plus, "Zoom", () => zoomWin("imessage", p.overlay)],
    ];
    return h_flex()
      .id("im-lights")
      .gap(7)
      .items_center()
      .on_hover((h, cx) => {
        this.lit = h;
        cx.notify();
      })
      .children(
        kinds.map(([kind, glyph, tip, act]) =>
          div()
            .id(`iml-${kind}`)
            .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
            .tooltip(tip)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click(() => act()),
        ),
      );
  }

  /** The toolbar's buttons, as a window's and as a tab's. */
  tools(inTab) {
    const parts = [];
    const reading = this.on();
    if (reading) parts.push(textured([{ id: "im-refresh", glyph: GLYPH.refresh, size: 13, w: 32, tooltip: "Check for new messages now (⌘R)", onClick: (_e, cx) => this.refresh(cx) }]));
    parts.push(div().flex_1());
    if (inTab) parts.push(embossed((reading && this.conv()?.name) || "Messages", { size: 12, color: key() ? "#000000" : "#4d4d4d", truncate: true }), div().flex_1());
    if (inTab)
      parts.push(
        textured([{ id: "im-float", text: "Open in Window", w: 112, tooltip: "Move Messages to its own window", onClick: () => {
          openWin("imessage");
          // One copy only.
          const at = appTab("Messages");
          if (at) run("tab.close", { id: at.tab.id, confirmed: true });
        } }]),
      );
    parts.push(textured([{ id: "im-app", text: "Open in Messages", w: 124, tooltip: "Open this conversation in Messages (⌘O)", onClick: () => (reading ? openInMessages(this.conv()) : exec("open", ["-a", MESSAGES_APP]).catch(() => {})) }]));
    if (reading) parts.push(textured([{ id: "im-gear", glyph: GLYPH.gear, size: 13, w: 38, menu: true, onDown: (e) => this.gearMenu(e) }]), this.searchField(key()));
    return parts;
  }

  searchField(live) {
    const w = 160;
    const h = 22;
    return div()
      .id("im-search")
      .relative()
      .flex_none()
      .w(w)
      .h(h + 1)
      .tooltip("Find a conversation by name (⌘F)")
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
                .id("im-search-x")
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

  header(live) {
    const app = dockApps().find((a) => appName(a.path) === "Messages");
    const title = (this.on() && this.conv()?.name) || "Messages";
    return div()
      .id("im-head")
      .relative()
      .flex_none()
      .w_full()
      .h(TITLE + TOOLBAR)
      .on_mouse_down("left", (e) => {
        if (e.click_count >= 2) zoomWin("imessage", props()?.overlay);
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
          .when(Boolean(app?.icon), (el) => el.child(div().opacity(live ? 1 : 0.6).child(appImage(app.path, 16))))
          .child(embossed(title, { size: 13, color: live ? "#000000" : "#4d4d4d", truncate: true })),
      )
      .child(div().absolute().top(4).left(8).child(this.lights(live)))
      .child(h_flex().absolute().top(TITLE).left(0).w_full().h(TOOLBAR).px(8).pb(3).gap(10).items_center().children(this.tools(false)));
  }

  convRow(c, n, live) {
    const on = c.id === KEEP.cur;
    const fg = on ? "#ffffff" : C.text;
    const dim = on ? "#ffffffd0" : C.gray;
    const snippet = (c.last.mine ? "You: " : "") + (c.last.text || "");
    return h_flex()
      .id(`imc-${c.id}`)
      .relative()
      .h(ROW)
      .w_full()
      .pl(4)
      .pr(8)
      .gap(6)
      .items_center()
      .when(on, (el) => el.child(fillGrad(live ? C.rowTop : C.rowTopOff, live ? C.rowBot : C.rowBotOff)))
      .when(!on, (el) => el.child(div().absolute().bottom(0).left(46).right(0).h(1).bg("#d7dce3")))
      // Messages' blue dot for unread, in a gutter of its own.
      .child(div().relative().flex_none().w(10).h(10).flex().items_center().justify_center().when(n > 0, (el) => el.child(div().w(8).h(8).rounded_full().bg(on ? "#ffffff" : "#2f7bf5"))))
      .child(avatar(c, 30))
      .child(
        v_flex()
          .relative()
          .flex_1()
          .min_w(0)
          .gap(1)
          .child(
            h_flex()
              .gap(6)
              .items_baseline()
              .child(div().flex_1().min_w(0).truncate().text_size(12).font_weight(n > 0 || on ? 700 : 400).text_color(fg).child(c.name))
              .child(div().flex_none().text_size(10).text_color(dim).child(listDate(c.last.t))),
          )
          .child(
            h_flex()
              .gap(6)
              .items_center()
              .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(dim).child(snippet || " "))
              .when(n > 0, (el) => el.child(countPill(n, on))),
          ),
      );
  }

  sidebar(live) {
    const rows = this.list();
    const news = unread();
    return v_flex()
      .id("im-side")
      .relative()
      .flex_none()
      .w(SIDE)
      .h_full()
      .bg(live ? "#eef1f5" : "#f2f2f2")
      .child(
        v_flex()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_virtual_list("im-convs", rows.length, ROW, (i) => rows[i].id, (range) => rows.slice(range.start, range.end).map((c) => this.convRow(c, news[c.id] ?? 0, live)))
              .size_full()
              .on_item_click((id, cx) => {
                this.focus.focus();
                this.open(id, cx);
              })
              .on_item_secondary_click((id, e) => this.convMenu(id, e)),
          )
          .when(!rows.length, (el) => el.child(div().absolute().top(14).left(0).w_full().flex().justify_center().text_size(11).text_color(C.gray).child(this.query ? "No conversation matches." : "No conversations."))),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  /** One message: a day line when time has passed, the sender in groups, the bubble, its files. */
  message(m, prev, c, maxW) {
    const gap = !prev || m.t - prev.t > 15 * 60000;
    const head = c?.group && !m.mine && (gap || prev?.who !== m.who || prev?.mine);
    const blue = m.mine && c?.service !== "SMS";
    const bg = m.mine ? (blue ? "#2f7bf5" : "#36b34a") : "#e3e5e8";
    const fg = m.mine ? "#ffffff" : "#111111";
    const bubble = div()
      .relative()
      .max_w(maxW)
      .px(11)
      .py(6)
      .rounded(14)
      .bg(bg)
      .border_1()
      .border_color(m.mine ? (blue ? "#2563c9" : "#2a8f3b") : "#cfd2d6")
      // Aqua's gloss across the top.
      .child(div().absolute().top(1).left(6).right(6).h(9).rounded(6).bg(m.mine ? "#ffffff30" : "#ffffffa0"))
      .when(Boolean(m.text), (el) => el.child(div().relative().text_size(13).text_color(fg).child(m.text)))
      .children(
        m.files.map((f, i) =>
          h_flex()
            .id(`imf-${m.id}-${i}`)
            .relative()
            .gap(4)
            .items_center()
            .text_size(12)
            .text_color(m.mine ? "#ffffff" : "#1f5bd6")
            .child("📎")
            .child(div().underline().child(f.name))
            .tooltip(f.path)
            .on_click(() => exec("open", [f.path]).catch(() => {})),
        ),
      );
    return v_flex()
      .id(`im-${m.id}`)
      .w_full()
      .px(14)
      .pt(gap ? 4 : 2)
      .pb(2)
      .when(gap, (el) => el.child(div().w_full().flex().justify_center().pb(6).text_size(10).font_weight(700).text_color(C.gray).child(dayLine(m.t))))
      .when(head, (el) => el.child(div().pl(12).pb(1).text_size(10).text_color(C.gray).child(nameFor(m.who))))
      .child(h_flex().w_full().when(m.mine, (el) => el.justify_end()).child(bubble))
      .when(m.failed, (el) => el.child(h_flex().w_full().justify_end().pt(1).text_size(10).text_color("#c4281c").child("Not Delivered")));
  }

  /** Measured message heights at one width, kept across the window's copies (a tab and a window can differ). */
  heights(w) {
    if (!(KEEP.heights instanceof Map) || KEEP.heights.size > 8) KEEP.heights = new Map();
    let m = KEEP.heights.get(w);
    if (!m) KEEP.heights.set(w, (m = new Map()));
    return m;
  }

  measured(w, id, h, cx) {
    const hs = this.heights(w);
    const v = Math.ceil(h);
    if (hs.get(id) === v) return;
    hs.set(id, v);
    cx.notify();
    if (this.follow) this.scroll.scroll_to_bottom();
  }

  feed() {
    const c = this.conv();
    const rows = KEEP.msgs.get(KEEP.cur) ?? [];
    const name = `im-msgs-${KEEP.cur}`;
    if (this.visName !== name) {
      this.visName = name;
      this.vis = { lo: 0, hi: -1 };
      this.follow = true;
    }
    this.drawn = `${this.vis.lo},${this.vis.hi}`;
    const w = Math.max(0, (this.feedW ?? 0) - 15);
    const maxW = Math.max(160, Math.round(w * 0.66));
    // A message's height depends on the one before (the day line, the sender), so the key has both.
    const k = (i) => `${rows[i].id}:${rows[i - 1]?.id ?? 0}`;
    const hs = this.heights(w);
    const sizes = rows.map((_m, i) => hs.get(k(i)) ?? 40);
    const todo = w > 0 ? rows.map((_m, i) => i).filter((i) => !hs.has(k(i))).slice(0, 60) : [];
    return v_flex()
      .id("im-feed")
      .relative()
      .flex_1()
      .min_h(0)
      .bg("#ffffff")
      .font_family(FONT)
      .child(
        h_flex()
          .id("im-feedbox")
          .relative()
          .flex_1()
          .min_h(0)
          .overflow_hidden()
          .on_size_change((size, cx) => {
            const fw = Math.round(size.width);
            if (fw !== this.feedW) {
              this.feedW = fw;
              cx.notify();
            }
          })
          .when(todo.length > 0, (el) =>
            el.child(
              v_flex()
                .absolute()
                .top(0)
                .left(0)
                .w(w)
                .opacity(0)
                .children(todo.map((i) => v_flex().id(`ims-${k(i)}`).w(w).on_size_change((size, cx) => this.measured(w, k(i), size.height, cx)).child(this.message(rows[i], rows[i - 1], c, maxW)))),
            ),
          )
          .child(
            v_virtual_list(name, rows.length, sizes.length ? sizes : 0, (i) => String(rows[i].id), (range) => {
              this.vis = { lo: range.start, hi: range.end - 1 };
              const out = [];
              for (let i = range.start; i < range.end; i++) out.push(this.message(rows[i], rows[i - 1], c, maxW));
              return out;
            })
              .track_scroll(this.scroll)
              .flex_1()
              .min_w(0)
              .h_full()
              .on_scroll_wheel((e) => {
                if (e.delta.y > 0) this.follow = false;
                else if (this.vis.hi >= rows.length - 1) this.follow = true;
              })
              .on_item_secondary_click((id, e) => this.msgMenu(id, e)),
          )
          .child(this.scrollbar(sizes)),
      )
      .when(!rows.length, (el) => el.child(div().absolute().top(16).left(0).w_full().flex().justify_center().text_size(12).text_color(C.gray).child(c ? "Loading messages…" : "No conversation selected.")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  scrollbar(sizes) {
    const count = sizes.length;
    const { lo, hi } = this.vis;
    const view = this.sb.h ?? 0;
    const at = [];
    let total = 0;
    for (const h of sizes) {
      at.push(total);
      total += h;
    }
    const end = Math.max(0, total - view);
    const first = hi >= count - 1 ? end : at[lo] ?? 0;
    const rowAt = (px) => {
      let i = 0;
      while (i < count - 1 && at[i + 1] <= px) i++;
      return i;
    };
    const go = (i, cx) => {
      const to = Math.max(0, Math.min(count - 1, i));
      this.follow = (at[to] ?? 0) >= end;
      if (this.follow) this.scroll.scroll_to_bottom();
      else this.scroll.scroll_to_item(to, "top");
      cx.notify();
    };
    return aquaScrollbar({
      id: "im-scroll",
      state: this.sb,
      live: key(),
      count: total,
      first,
      shown: Math.min(view, total),
      onStep: (dir, cx) => go(dir < 0 ? (first > (at[lo] ?? 0) ? lo : lo - 1) : lo + 1, cx),
      onPage: (dir, cx) => go(rowAt(Math.max(0, first + dir * Math.max(40, view - 40))), cx),
      onDrag: (px, cx) => go(rowAt(px), cx),
    });
  }

  composer(live) {
    const w = Math.max(0, (this.mainW ?? 0) - 24);
    const h = 26;
    const c = this.conv();
    return div()
      .id("im-compose")
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
          .child(paint(rrect(w, h, h / 2), live ? "#8e8e8e" : "#b0b0b0", w, h))
          .child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), "#ffffff", w, h))
          .child(
            h_flex()
              .absolute()
              .top(0)
              .left(0)
              .w(w)
              .h(h)
              .px(12)
              .items_center()
              .child(Input.new(this.field()).flex_1().h(h).text_size(13).text_color("#000000"))
              .when(this.sending, (el) => el.child(svg(GLYPH.spinner).flex_none().w(12).h(12).text_color("#4a4a4a").spin(900))),
          ),
      )
      .when(Boolean(c && c.service === "SMS"), (el) => el.child(div().pt(3).pl(12).text_size(10).text_color(C.gray).child("Sent as a text message (SMS) through your iPhone.")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  setup() {
    const access = KEEP.error === "access" || this.status.startsWith("macOS didn't");
    const steps = [
      "1. Click Read My Messages. Herdr reads your conversations from Messages on this Mac; they stay on this Mac.",
      "2. If macOS stops it, Herdr needs Full Disk Access: click Open Privacy Settings, switch Herdr on, then quit and reopen Herdr.",
      "3. The first time you send, macOS asks whether Herdr may control Messages. Click OK.",
    ];
    return v_flex()
      .id("im-setup")
      .flex_1()
      .min_w(0)
      .h_full()
      .bg("#ffffff")
      .items_center()
      .justify_center()
      .child(
        v_flex()
          .w(460)
          .gap(10)
          .child(div().text_size(15).font_weight(700).child("Read Messages in Herdr"))
          .child(div().text_size(12).text_color(C.dim).child("Your iMessage and text conversations, beside your agents. Messages must be signed in on this Mac."))
          .children(steps.map((t) => div().text_size(12).child(t)))
          .child(
            h_flex()
              .pt(6)
              .gap(10)
              .child(aquaButton("im-connect", "Read My Messages", (_e, cx) => cx.spawn((cx) => this.connect(cx)), { primary: !access, w: 160 }))
              .child(aquaButton("im-privacy", "Open Privacy Settings…", () => exec("open", [PRIVACY_URL]).catch(() => {}), { primary: access, w: 190 })),
          )
          .when(Boolean(this.status), (el) =>
            el.child(
              h_flex()
                .gap(5)
                .items_center()
                .when(this.busy, (el) => el.child(svg(GLYPH.spinner).flex_none().w(12).h(12).text_color("#4a4a4a").spin(900)))
                .child(div().text_size(11).text_color(this.bad ? "#9c1b10" : C.dim).child(this.status)),
            ),
          )
          .child(div().pt(4).text_size(11).text_color(C.gray).child("Reading here doesn't mark messages read in Messages, and tapbacks, edits and typing indicators aren't shown.")),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  words() {
    if (this.status) return this.status;
    if (!this.on()) return "Not reading Messages";
    const n = KEEP.convs.length;
    return `${n} ${n === 1 ? "conversation" : "conversations"}${KEEP.demo?.on ? " · demo" : ""}`;
  }

  bottom(w, live) {
    return div()
      .id("im-bar")
      .relative()
      .flex_none()
      .w_full()
      .h(BAR)
      .child(paint(rrect(w - 2, BAR, [0, 0, 4, 4]), live ? vgrad("#c9c9c9", "#a9a9a9") : vgrad("#e9e9e9", "#d6d6d6"), w - 2, BAR))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#6a6a6a" : "#a5a5a5"))
      .child(div().absolute().top(0).left(0).w_full().h(BAR).flex().items_center().justify_center().child(embossed(this.words(), { size: 10, color: this.bad ? "#9c1b10" : live ? "#2b2b2b" : "#7a7a7a", truncate: true })))
      .child(
        div()
          .id("im-grip")
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
            startTornResize(null, e, { x: Math.round(b.x + b.width - fw), y: Math.round(b.y + b.height - fh), w: fw, h: fh }, "imessage");
          }),
      );
  }

  keys(el) {
    return el.on_key_down((e, cx) => {
      if (!this.on()) return;
      const k = stroke(e);
      const list = this.focus.is_focused();
      if (k === "cmd-r") this.refresh(cx);
      else if (k === "cmd-f" || k === "alt-cmd-f") this.search.focus();
      else if (k === "cmd-o") openInMessages(this.conv());
      else if (k === "escape") this.escape(cx);
      else if (!list) return;
      else if (k === "down") this.step(1, cx);
      else if (k === "up") this.step(-1, cx);
      else if (k === "enter" && this.conv()) this.field().focus();
      else return;
      cx.stop_propagation();
    });
  }

  inTab(body, live) {
    const strip = h_flex()
      .id("im-strip")
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
      .child(
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
      );
  }

  render(cx) {
    const p = props() ?? {};
    const st = winState("imessage");
    // A pick from one of this window's menus (kit.js perform sets it), applied once.
    const pk = st.pick;
    if (pk && pk.at !== this.picked) {
      this.picked = pk.at;
      cx.timer.after(0, (cx) => {
        setWin("imessage", { pick: null });
        this.apply(pk, cx);
      });
    }
    // One of this window's menus closed: the keyboard comes back to the list.
    const m = shared("sl.menu");
    if (m && !m.id && String(m.closed ?? "").startsWith("imessage-") && m.at !== this.menuBack) {
      this.menuBack = m.at;
      cx.timer.after(0, () => this.inField || this.focus.focus());
    }
    // A banner's click: the conversation it was about.
    if (st.goto && st.goto !== this.went && this.ready && this.on()) {
      this.went = st.goto;
      cx.timer.after(0, (cx) => {
        setWin("imessage", { goto: null });
        if (KEEP.convs.some((c) => c.id === st.goto)) this.open(st.goto, cx);
      });
    } else if (!st.goto) this.went = null;
    // Reading switched on or off elsewhere (another copy's setup panel, Stop Reading).
    const reading = this.on();
    if (this.ready && reading !== this.wasOn) {
      const was = this.wasOn;
      this.wasOn = reading;
      if (reading && was === false) cx.timer.after(0, (cx) => cx.spawn((cx) => this.reload(cx, true)));
    }
    // The Dock's watch saw something new: the open conversation again, if it moved.
    const tick = shared("sl.imessageTick") ?? 0;
    if (reading && tick !== this.tick) {
      this.tick = tick;
      const c = this.conv();
      const rows = KEEP.msgs.get(KEEP.cur);
      if (c && rows && (rows[rows.length - 1]?.id ?? 0) < c.last.id) cx.timer.after(0, (cx) => this.fetch(c.id, cx));
    }
    // On screen, so read here (Herdr's marks only).
    const c = this.conv();
    if (c && unread()[c.id] && KEEP.msgs.get(c.id)?.length && imessageShown()) cx.timer.after(0, () => markSeen(c.id, c.last.id));
    if (!p.inTab && (st.open === false || Boolean(st.big) !== Boolean(p.big)) && !this.closing) {
      this.closing = true;
      closeOverlay(p.overlay);
    }
    const w = this.size?.width ?? p.size?.[0] ?? 0;
    const h = this.size?.height ?? p.size?.[1] ?? 0;
    const live = key();
    const body = !this.ready
      ? div().flex_1().h_full().bg("#ffffff")
      : !reading
        ? this.setup()
        : h_flex()
            .flex_1()
            .min_w(0)
            .h_full()
            .child(this.sidebar(live))
            .child(div().flex_none().w(1).h_full().bg("#8b8b8b"))
            .child(
              v_flex()
                .flex_1()
                .min_w(0)
                .h_full()
                .on_size_change((size, cx) => {
                  const mw = Math.round(size.width);
                  if (mw !== this.mainW) {
                    this.mainW = mw;
                    cx.notify();
                  }
                })
                .child(this.feed())
                .child(this.composer(live)),
            );
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
        noteWinSpot("imessage", e.bounds, cx, true);
      })
      .on_mouse_up("left", () => endScroll(this.sb))
      .on_mouse_down("left", (e, cx) => {
        closeMenus();
        noteWinSpot("imessage", e.bounds, cx);
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
