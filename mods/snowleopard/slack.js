// Slack, opened from Slack's Dock icon: as a tab in the main window (props
// inTab; the default, since floating windows always stay above the main one),
// or in its own Aqua window (an app window, see kit.js). A source list of your channels and direct
// messages, the open conversation's messages (Slack's mrkdwn as Markdown,
// names for user ids, threads collapsed to "N replies": click one to read it
// beside), and a field to send. It polls: the open conversation every 5 s,
// the list every 2 minutes. Slack's own app stays one right-click away.
//
// It talks to Slack's Web API with a user token (xoxp-…) from a Slack app the
// person makes in their workspace (the setup panel opens it with the scopes
// filled in). The token is kept in the macOS Keychain, never in a file.
//
// Redraws stay cheap (Herdr budgets each one): messages are converted once when
// they arrive, and both lists draw only what's on screen.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, TextView, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { props, exec, closeOverlay, setShared, run } from "herdr";
import {
  C, FONT, GLYPH, ICON, key, paint, rrect, vgrad, fillGrad, embossed, bead, textured, aquaButton, closeMenus, winState, setWin,
  closeWin, zoomWin, startTornResize, dockApps, appIcon, appName, openWin, slackTab, aquaScrollbar, dragScroll, endScroll,
} from "./kit.js";
import { KEEP, KEYCHAIN, slackApi, slackSignIn, loadUsers, loadConvs, unread, markSeen, slackShown } from "./slackwatch.js";

const TITLE = 22;
const TOOLBAR = 32;
const BAR = 15;
const SIDE = 220;
const ROW = 20;

const SCOPES = ["channels:read", "channels:history", "groups:read", "groups:history", "im:read", "im:history", "mpim:read", "mpim:history", "users:read", "chat:write"];
const MANIFEST = {
  display_information: { name: "Herdr Snow Leopard", description: "Slack in Herdr's Snow Leopard layout." },
  oauth_config: { scopes: { user: SCOPES } },
  settings: { org_deploy_enabled: false, socket_mode_enabled: false, token_rotation_enabled: false },
};
const CREATE_URL = `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(MANIFEST))}`;

const EMOJI = {
  "+1": "👍", thumbsup: "👍", "-1": "👎", smile: "😄", slightly_smiling_face: "🙂", joy: "😂", sweat_smile: "😅", tada: "🎉",
  white_check_mark: "✅", heavy_check_mark: "✔️", x: "❌", eyes: "👀", heart: "❤️", fire: "🔥", rocket: "🚀", pray: "🙏", 100: "💯",
  wave: "👋", warning: "⚠️", thinking_face: "🤔", raised_hands: "🙌", clap: "👏", point_up: "☝️", ok_hand: "👌", muscle: "💪",
  sob: "😭", grin: "😁", wink: "😉", star: "⭐", bulb: "💡", memo: "📝", calendar: "📆", link: "🔗",
};

/** Text and code, alternating (code at odd places). It jumps between backticks: a regex or a
 *  per-character scan costs too much in this runtime (see notes.js). */
function codeSplit(md) {
  const out = [];
  let from = 0;
  let i = md.indexOf("`");
  while (i >= 0) {
    let stop = -1;
    if (md.substr(i, 3) === "```") {
      const end = md.indexOf("```", i + 3);
      stop = end < 0 ? md.length : end + 3;
    } else {
      const end = md.indexOf("`", i + 1);
      const nl = md.indexOf("\n", i + 1);
      if (end > 0 && (nl < 0 || end < nl)) stop = end + 1;
    }
    if (stop < 0) {
      i = md.indexOf("`", i + 1);
      continue;
    }
    out.push(md.slice(from, i), md.slice(i, stop));
    from = stop;
    i = md.indexOf("`", stop);
  }
  out.push(md.slice(from));
  return out;
}

/** Slack's error codes in plain sentences. */
function plain(e) {
  const code = e?.message ?? String(e);
  switch (code) {
    case "invalid_auth":
      return "Slack didn't accept that token. Copy the User OAuth Token again from your Slack app's OAuth & Permissions page.";
    case "not_authed":
    case "account_inactive":
    case "token_revoked":
      return "This Slack sign-in has ended. Sign out and connect again.";
    case "not_in_channel":
      return "You're not in this channel. Join it in Slack first.";
    case "ratelimited":
      return "Slack asked us to slow down. Try again in a minute.";
    case "missing_scope":
      return "The Slack app is missing a permission. Recreate it from the setup panel.";
    default:
      return `Slack didn't answer as expected (${code}).`;
  }
}

const tile = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ["#3b7cef", "#2fa443", "#d9822b", "#9c4dcc", "#d23a64", "#1d9aa5", "#7a6f5a", "#5a6ad6"][Math.abs(h) % 8];
};

function clock(ts) {
  const d = new Date(Number(ts) * 1000);
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const pm = h >= 12;
  h = h % 12 || 12;
  return `${h}:${m} ${pm ? "PM" : "AM"}`;
}

/** Mail's source-list count: a gray-blue pill (red for a mention), white on a selected row. */
function countPill(n, on, mention) {
  const label = String(n > 99 ? "99+" : n);
  const w = Math.max(20, 10 + label.length * 7);
  const h = 14;
  const bg = on ? "#ffffff" : mention ? vgrad("#ef5a46", "#c8241a") : vgrad("#93a3bd", "#7b8ca8");
  return div()
    .relative()
    .flex_none()
    .w(w)
    .h(h)
    .child(paint(rrect(w, h, h / 2), bg, w, h))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .text_size(10)
        .font_weight(700)
        .text_color(on ? "#3875d7" : "#ffffff")
        .child(label),
    );
}

export default class Slack {
  // People and conversations are the shared connection's (the Dock's watch refreshes them too).
  get users() {
    return KEEP.users;
  }
  set users(_v) {}
  get convs() {
    return KEEP.convs;
  }
  set convs(v) {
    KEEP.convs = v;
  }

  init(_p, cx) {
    this.size = null;
    this.lit = false;
    this.token = null;
    this.me = null; // { user, team }
    this.cur = null;
    this.msgs = new Map(); // conversation id → converted messages, oldest first
    this.thread = null; // { ts, msgs }
    this.status = "";
    this.bad = true; // the status is a failure (red); progress and notes are gray
    this.ready = false;
    // The window's own keyboard focus, so typing never reaches a hidden terminal.
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.tokenField = InputState.new({ placeholder: "xoxp-…" });
    this.compose = InputState.new({ placeholder: "Message" });
    this.compose.on("submit", (_e, cx) => this.send(cx));
    this.scroll = VirtualListScrollHandle.new();
    // The rows the list drew last (for the scrollbar): the list scrolls itself, and says
    // which rows are on screen only by drawing them.
    this.vis = { lo: 0, hi: -1 };
    this.drawn = "";
    // Follows the newest message while the list is at the bottom.
    this.follow = true;
    this.sb = {};
    cx.timer.every(120, (cx) => {
      if (`${this.vis.lo},${this.vis.hi}` !== this.drawn) cx.notify();
    });
    if (KEEP.token && KEEP.me) {
      Object.assign(this, { token: KEEP.token, me: KEEP.me, users: KEEP.users, convs: KEEP.convs, cur: KEEP.cur, msgs: KEEP.msgs, thread: KEEP.thread });
      this.ready = true;
      // The list measures messages as it draws them, so the bottom moves while it settles.
      for (const ms of [50, 250, 700])
        cx.timer.after(ms, (cx) => {
          this.scroll.scroll_to_item(Math.max(0, this.rows().length - 1), "top");
          this.scroll.scroll_to_bottom();
          cx.notify();
        });
      if (!this.cur) this.start(cx);
      this.poll(cx);
      return this.timers(cx);
    }
    cx.spawn(async (cx) => {
      try {
        const r = await exec("security", ["find-generic-password", "-s", KEYCHAIN, "-w"]);
        if (r.code === 0 && r.stdout.trim()) await this.connect(r.stdout.trim(), cx);
      } catch {}
      this.ready = true;
      cx.notify();
    });
    this.timers(cx);
  }

  timers(cx) {
    cx.timer.every(5000, (cx) => this.poll(cx));
    cx.timer.every(120000, (cx) => this.token && this.loadConvs(cx));
  }

  /** Remembers the state for the window's next copy. */
  keep() {
    Object.assign(KEEP, { token: this.token, me: this.me, users: this.users, convs: this.convs, cur: this.cur, msgs: this.msgs, thread: this.thread });
  }

  api(method, params = {}) {
    return slackApi(this.token, method, params);
  }

  /** Checks a token with Slack, then loads people and conversations. */
  async connect(token, cx) {
    this.me = await slackSignIn(token);
    this.token = token;
    this.keep();
    this.status = "";
    cx.notify();
    await loadUsers();
    await this.loadConvs(cx);
    this.start(cx);
  }

  /** Opens the conversation last read here, or the first channel. */
  start(cx) {
    const last = winState("slack").last;
    const start = this.convs.find((c) => c.id === last) ?? this.convs.find((c) => c.kind === "channel") ?? this.convs[0];
    if (start) this.open(start.id, cx);
  }

  async saveToken(cx) {
    const token = this.tokenField.value().trim();
    if (!token) return;
    if (token.startsWith("xoxb-")) {
      this.bad = true;
      this.status = "That's a bot token (xoxb-): it would show the bot's messages, not yours. Paste the User OAuth Token (xoxp-).";
      cx.notify();
      return;
    }
    this.bad = false;
    this.status = "Checking the token with Slack…";
    cx.notify();
    try {
      await this.connect(token, cx);
      await exec("security", ["add-generic-password", "-U", "-s", KEYCHAIN, "-a", "slack", "-w", token]);
      this.tokenField.set_value("");
      this.focus.focus();
    } catch (e) {
      this.token = KEEP.token = null;
      this.me = KEEP.me = null;
      this.bad = true;
      this.status = plain(e);
    }
    cx.notify();
  }

  async signOut(cx) {
    await exec("security", ["delete-generic-password", "-s", KEYCHAIN]).catch(() => {});
    this.token = null;
    this.me = null;
    this.convs = [];
    this.msgs = new Map();
    this.cur = null;
    this.thread = null;
    this.keep();
    setShared("sl.slackUnread", {});
    this.status = "";
    this.focus.focus();
    cx.notify();
  }

  async loadConvs(cx) {
    try {
      this.convs = await loadConvs();
      cx.notify();
    } catch (e) {
      this.bad = true;
      this.status = plain(e);
      cx.notify();
    }
  }

  /** Slack's mrkdwn as Markdown: people, channels and links by name, *bold* and _italic_. */
  md(text) {
    const entities = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    const prose = (s) =>
      s
        .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_m, id) => `**@${this.users.get(id) ?? id}**`)
        .replace(/<#([CG][A-Z0-9]+)(?:\|([^>]*))?>/g, (_m, id, name) => `**#${name || this.convs.find((c) => c.id === id)?.name || id}**`)
        .replace(/<!(here|channel|everyone)[^>]*>/g, "**@$1**")
        .replace(/<!subteam\^[A-Z0-9]+\|([^>]+)>/g, "**$1**")
        .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "[$2]($1)")
        .replace(/<(https?:[^>]+)>/g, "[$1]($1)")
        .replace(/<mailto:([^|>]+)\|([^>]+)>/g, "[$2](mailto:$1)")
        .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, "$1**$2**")
        .replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/g, "$1*$2*")
        .replace(/(^|[\s(])~([^~\n]+)~(?=[\s).,!?:;]|$)/g, "$1~~$2~~")
        .replace(/:([a-z0-9_+-]+):/g, (m, name) => EMOJI[name] ?? m);
    return codeSplit(entities(text ?? ""))
      .map((part, i) => (i % 2 ? part : prose(part)))
      .join("")
      .replace(/\n/g, "  \n");
  }

  /** Slack's messages (newest first) as rows, oldest first, converted once. */
  convert(raw) {
    const out = [];
    for (const m of [...raw].reverse()) {
      const who = m.user ?? m.bot_id ?? "";
      const name = m.user ? this.users.get(m.user) ?? m.user : m.username ?? m.bot_profile?.name ?? "App";
      const files = (m.files ?? []).map((f) => `📎 ${f.name ?? f.title ?? "file"}`).join("  \n");
      const body = [this.md(m.text), files].filter(Boolean).join("  \n");
      const prev = out[out.length - 1];
      // A run of messages from one person within five minutes shows their name once.
      const cont = Boolean(prev && prev.who === who && !m.subtype && Number(m.ts) - Number(prev.ts) < 300);
      out.push({ ts: m.ts, who, name, time: clock(m.ts), md: body || " ", system: Boolean(m.subtype && m.subtype !== "bot_message" && m.subtype !== "thread_broadcast"), replies: m.reply_count ?? 0, cont });
    }
    return out;
  }

  open(id, cx) {
    this.cur = id;
    this.thread = null;
    this.keep();
    setWin("slack", { last: id });
    this.status = "";
    cx.notify();
    this.fetch(id, cx, true);
  }

  async fetch(id, cx, jump = false) {
    try {
      const j = await this.api("conversations.history", { channel: id, limit: 60 });
      const rows = this.convert(j.messages ?? []);
      // On screen, so read: clears its unread count (slackwatch.js).
      if (id === this.cur && !this.thread && rows.length && slackShown()) markSeen(id, rows[rows.length - 1].ts);
      const before = this.msgs.get(id);
      const changed = !before || before.length !== rows.length || before[before.length - 1]?.ts !== rows[rows.length - 1]?.ts || before.some((m, i) => m.replies !== rows[i]?.replies);
      if (!changed) return;
      this.msgs.set(id, rows);
      if (id === this.cur) {
        cx.notify();
        if (jump || (before && rows.length && this.follow)) {
          this.follow = true;
          this.scroll.scroll_to_item(rows.length - 1, "top");
          this.scroll.scroll_to_bottom();
        }
      }
    } catch (e) {
      if (id === this.cur) {
        this.bad = true;
        this.status = plain(e);
        cx.notify();
      }
    }
  }

  async openThread(ts, cx) {
    try {
      const j = await this.api("conversations.replies", { channel: this.cur, ts, limit: 100 });
      // Replies come oldest first; convert() takes newest first.
      this.thread = KEEP.thread = { ts, msgs: this.convert([...(j.messages ?? [])].reverse()) };
      cx.notify();
    } catch (e) {
      this.bad = true;
      this.status = plain(e);
      cx.notify();
    }
  }

  poll(cx) {
    if (!this.token || !this.cur) return;
    cx.spawn(async (cx) => {
      await this.fetch(this.cur, cx);
      if (this.thread) await this.openThread(this.thread.ts, cx);
    });
  }

  send(cx) {
    const text = this.compose.value().trim();
    if (!text || !this.cur) return;
    const channel = this.cur;
    const thread_ts = this.thread?.ts;
    this.compose.set_value("");
    cx.spawn(async (cx) => {
      try {
        await this.api("chat.postMessage", { channel, text, thread_ts });
        await this.fetch(channel, cx, true);
        if (thread_ts) await this.openThread(thread_ts, cx);
      } catch (e) {
        this.compose.set_value(text);
        this.bad = true;
        this.status = `Not sent. ${plain(e)}`;
        cx.notify();
      }
    });
  }

  // ---- parts

  lights(live) {
    const p = props() ?? {};
    const on = live || this.lit;
    const kinds = [
      ["close", GLYPH.close, "Close", () => closeWin("slack", p.overlay)],
      ["min", GLYPH.minus, "Minimize to the Dock", () => closeWin("slack", p.overlay, true)],
      ["zoom", GLYPH.plus, "Zoom", () => zoomWin("slack", p.overlay)],
    ];
    return h_flex()
      .id("sl-lights")
      .gap(7)
      .items_center()
      .on_hover((h, cx) => {
        this.lit = h;
        cx.notify();
      })
      .children(
        kinds.map(([kind, glyph, tip, act]) =>
          div()
            .id(`sll-${kind}`)
            .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
            .tooltip(tip)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click(() => act()),
        ),
      );
  }

  header(live) {
    const conv = this.convs.find((c) => c.id === this.cur);
    const where = conv ? (conv.kind === "dm" || conv.kind === "group" ? conv.name : `#${conv.name}`) : "Slack";
    const title = this.me ? `${where} — ${this.me.team}` : "Slack";
    const app = dockApps().find((a) => appName(a.path) === "Slack");
    const bare = this.bare();
    return div()
      .id("sl-head")
      .relative()
      .flex_none()
      .w_full()
      .h(bare ? TITLE : TITLE + TOOLBAR)
      .on_mouse_down("left", (e) => {
        if (e.click_count >= 2) zoomWin("slack", props()?.overlay);
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
      .when(!bare, (el) =>
        el.child(
        h_flex()
          .absolute()
          .top(TITLE)
          .left(0)
          .w_full()
          .h(TOOLBAR)
          .px(8)
          .pb(3)
          .gap(10)
          .items_center()
          .when(Boolean(this.thread), (el) =>
            el.child(textured([{ id: "sl-back", glyph: GLYPH.left, size: 12, w: 30, tooltip: "Back to the conversation", onClick: (_e, cx) => ((this.thread = KEEP.thread = null), cx.notify()) }])),
          )
          .when(Boolean(this.token), (el) => el.child(textured([{ id: "sl-refresh", text: "Refresh", w: 66, tooltip: "Fetch new messages now", onClick: (_e, cx) => this.poll(cx) }])))
          .child(div().flex_1())
          .when(Boolean(app), (el) => el.child(textured([{ id: "sl-app", text: "Slack", w: 56, tooltip: "Open the Slack app", onClick: () => exec("open", ["-a", app.path]).catch(() => {}) }])))
          .when(Boolean(this.token), (el) => el.child(textured([{ id: "sl-out", text: "Sign Out", w: 70, tooltip: "Forget the Slack token (it's removed from the Keychain)", onClick: (_e, cx) => cx.spawn((cx) => this.signOut(cx)) }]))),
        ),
      );
  }

  /** Not signed in and nothing to put in the toolbar: a plain title bar, as a 10.6 utility window has. */
  bare() {
    return this.ready && !this.token && !this.thread && !dockApps().some((a) => appName(a.path) === "Slack");
  }

  convRow(c, news) {
    const on = c.id === this.cur;
    const n = news?.n ?? 0;
    const mark = c.kind === "channel" ? "#" : c.kind === "private" ? "🔒" : c.kind === "group" ? "◆" : "●";
    return h_flex()
      .id(`c-${c.id}`)
      .relative()
      .h(ROW)
      .w_full()
      .pl(12)
      .pr(8)
      .gap(6)
      .items_center()
      .when(on, (el) => el.child(fillGrad(C.rowTop, C.rowBot)))
      .child(div().relative().flex_none().w(12).text_size(c.kind === "dm" ? 8 : 12).text_color(on ? "#ffffff" : c.kind === "dm" ? "#2fa443" : "#6a7380").child(mark))
      .child(div().relative().flex_1().min_w(0).truncate().text_size(12).text_color(on ? "#ffffff" : C.text).font_weight(on || n ? 700 : 400).child(c.name))
      .when(n > 0, (el) => el.child(countPill(n, on, news?.mention)));
  }

  sidebar(live) {
    const rows = this.convs;
    const news = unread();
    return v_flex()
      .id("sl-side")
      .relative()
      .flex_none()
      .w(SIDE)
      .h_full()
      .bg(live ? C.source : C.sourceOff)
      .pt(6)
      .child(div().flex_none().px(10).pb(3).text_size(11).font_weight(700).text_color(C.heading).child((this.me?.team ?? "SLACK").toUpperCase()))
      .child(
        v_flex()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_virtual_list("sl-convs", rows.length, ROW, (i) => rows[i].id, (range) => rows.slice(range.start, range.end).map((c) => this.convRow(c, news[c.id])))
              .size_full()
              .on_item_click((id, cx) => this.open(id, cx)),
          ),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  message(m, inThread) {
    const avatar = div()
      .relative()
      .flex_none()
      .w(32)
      .h(32)
      .child(paint(rrect(32, 32, 6), tile(m.who || m.name), 32, 32))
      .child(paint(rrect(30, 14, [5, 5, 0, 0], 1, 1), vgrad("#ffffff50", "#ffffff08"), 32, 32))
      .child(div().absolute().top(0).left(0).size_full().flex().items_center().justify_center().text_size(14).font_weight(700).text_color("#ffffff").child(String(m.name).slice(0, 1).toUpperCase()));
    return h_flex()
      .id(`m-${m.ts}`)
      .w_full()
      .px(14)
      .pt(m.cont ? 1 : 8)
      .gap(10)
      .items_start()
      .child(m.cont ? div().flex_none().w(32) : avatar)
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .when(!m.cont, (el) =>
            el.child(
              h_flex()
                .gap(6)
                .items_baseline()
                .child(div().text_size(13).font_weight(700).text_color(m.system ? C.gray : "#1d1d1d").child(m.name))
                .child(div().text_size(10).text_color(C.gray).child(m.time)),
            ),
          )
          // Not selectable (it is by default): text selection takes the theme's terminal selection color (dark
          // gray in the Pro profile), which covered messages like black bars.
          .child(div().text_size(13).text_color(m.system ? C.gray : "#1d1d1d").child(TextView.markdown(`md-${m.ts}`, m.md).selectable(false)))
          .when(!inThread && m.replies > 0, (el) => el.child(div().pt(2).text_size(11).font_weight(700).text_color("#2a62c9").child(`${m.replies} ${m.replies === 1 ? "reply" : "replies"} ›`))),
      );
  }

  rows() {
    return this.thread ? this.thread.msgs : this.msgs.get(this.cur) ?? [];
  }

  /** Measured message heights at one width, kept across the window's copies. */
  heights(w) {
    if (KEEP.heights?.w !== w) KEEP.heights = { w, map: new Map() };
    return KEEP.heights.map;
  }

  measured(w, ts, h, cx) {
    const hs = this.heights(w);
    const v = Math.ceil(h);
    if (hs.get(ts) === v) return;
    hs.set(ts, v);
    cx.notify();
    if (this.follow) this.scroll.scroll_to_bottom();
  }

  feed() {
    const rows = this.rows();
    const thread = Boolean(this.thread);
    const name = this.thread ? "sl-thread" : `sl-msgs-${this.cur}`;
    if (this.visName !== name) {
      this.visName = name;
      this.vis = { lo: 0, hi: -1 };
      this.follow = true;
    }
    this.drawn = `${this.vis.lo},${this.vis.hi}`;
    // A virtual list (the one kind a script can scroll) takes each row's height. Each
    // message is measured once at this width, drawn unseen behind the list.
    const w = Math.max(0, (this.feedW ?? 0) - 15);
    const hs = this.heights(w);
    const sizes = rows.map((m) => hs.get(m.ts) ?? 60);
    const todo = w > 0 ? rows.filter((m) => !hs.has(m.ts)).slice(0, 60) : [];
    return v_flex()
      .id("sl-feed")
      .relative()
      .flex_1()
      .min_h(0)
      .bg("#ffffff")
      .font_family(FONT)
      .when(Boolean(this.me?.bot || this.token?.startsWith("xoxb-")), (el) => el.child(this.botNote()))
      .when(thread, (el) => el.child(div().flex_none().px(14).py(6).text_size(11).font_weight(700).text_color(C.heading).border_b_1().border_color("#e2e2e2").child("THREAD")))
      .child(
        h_flex()
          .id("sl-feedbox")
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
                .children(
                  todo.map((m) =>
                    v_flex()
                      .id(`ms-${m.ts}`)
                      .w(w)
                      .on_size_change((size, cx) => this.measured(w, m.ts, size.height, cx))
                      .child(this.message(m, thread)),
                  ),
                ),
            ),
          )
          .child(
            v_virtual_list(name, rows.length, sizes.length ? sizes : 0, (i) => rows[i].ts, (range) => {
              this.vis = { lo: range.start, hi: range.end - 1 };
              return rows.slice(range.start, range.end).map((m) => this.message(m, thread));
            })
              .track_scroll(this.scroll)
              .flex_1()
              .min_w(0)
              .h_full()
              .on_scroll_wheel((e) => {
                // Scrolling up leaves the newest message; back at the bottom follows it again.
                if (e.delta.y > 0) this.follow = false;
                else if (this.vis.hi >= rows.length - 1) this.follow = true;
              })
              .on_item_click((ts, cx) => {
                const m = rows.find((r) => r.ts === ts);
                if (!this.thread && m?.replies) this.openThread(ts, cx);
              }),
          )
          .child(this.scrollbar(sizes)),
      )
      .when(!rows.length, (el) => el.child(div().absolute().top(16).left(0).w_full().flex().justify_center().text_size(12).text_color(C.gray).child(this.status || "Loading messages…")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  /** Aqua's scrollbar beside the messages: a glossy blue thumb sized to what's on screen,
   *  both arrows at the bottom. Clicking the track pages; the thumb drags. */
  scrollbar(sizes) {
    const count = sizes.length;
    const { lo, hi } = this.vis;
    const view = this.sb.h ?? 0;
    // In pixels, from the measured heights: where each row starts, and the whole.
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
      id: "sl-scroll",
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

  /** A bot token sees the bot's conversations: say so, plainly, above the messages. */
  botNote() {
    return h_flex()
      .id("sl-bot")
      .flex_none()
      .w_full()
      .px(12)
      .py(6)
      .gap(10)
      .items_center()
      .bg("#fff6c8")
      .border_b_1()
      .border_color("#d9c66a")
      .child(
        div()
          .flex_1()
          .min_w(0)
          .text_size(11)
          .text_color("#4a3d00")
          .child(`Signed in as the bot “${this.users.get(this.me?.user) ?? this.me?.name ?? "bot"}”, so this shows the bot's conversations, not yours, and sends as the bot. Sign out and connect your User OAuth Token (xoxp-) to see your own messages.`),
      )
      .child(aquaButton("sl-bot-out", "Sign Out", (_e, cx) => cx.spawn((cx) => this.signOut(cx)), { w: 80 }));
  }

  composer(live) {
    const w = Math.max(0, (this.size?.width ?? 0) - SIDE - 3 - 24);
    const h = 26;
    return div()
      .id("sl-compose")
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

  setup() {
    const steps = [
      "1. Click Create the Slack App. Slack opens with everything filled in: pick your workspace and click Create.",
      "2. In your new Slack app, click Install to Workspace, then copy the User OAuth Token (it starts with xoxp-).",
      "3. Paste it below. It's kept in your Mac's Keychain, never in a file.",
    ];
    return v_flex()
      .id("sl-setup")
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
          .child(div().text_size(15).font_weight(700).child("Connect Slack"))
          .child(div().text_size(12).text_color(C.dim).child("Slack runs here through a small Slack app of your own. If you don't run the workspace, an admin may need to approve it."))
          .children(steps.map((t) => div().text_size(12).child(t)))
          .child(
            h_flex()
              .pt(4)
              .gap(10)
              .child(aquaButton("sl-create", "Create the Slack App…", () => exec("open", [CREATE_URL]).catch(() => {}), { w: 190 }))
              // If Slack doesn't fill the form from the link: Create New App › From a manifest, and paste.
              .child(
                aquaButton(
                  "sl-manifest",
                  "Copy Manifest",
                  (_e, cx) =>
                    exec("/bin/sh", ["-c", 'printf %s "$1" | pbcopy', "sh", JSON.stringify(MANIFEST, null, 2)])
                      .then(() => {
                        this.bad = false;
                        this.status = "Manifest copied.";
                        cx.notify();
                      })
                      .catch(() => {}),
                  { w: 130 },
                ),
              ),
          )
          .child(div().text_size(11).text_color(C.gray).child("If the form comes up empty, choose “From a manifest” in Slack and paste what Copy Manifest copied."))
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
                  .child(h_flex().absolute().top(0).left(0).w(300).h(24).px(8).items_center().child(Input.new(this.tokenField).flex_1().h(24).text_size(12).text_color("#000000"))),
              )
              .child(aquaButton("sl-connect", "Connect", (_e, cx) => cx.spawn((cx) => this.saveToken(cx)), { primary: true, w: 90 })),
          )
          .when(Boolean(this.status), (el) =>
            el.child(
              h_flex()
                .gap(5)
                .items_center()
                .when(this.busy(), (el) => el.child(svg(GLYPH.spinner).flex_none().w(12).h(12).text_color("#4a4a4a").spin(900)))
                .child(div().text_size(11).text_color(this.bad ? "#9c1b10" : C.dim).child(this.status)),
            ),
          ),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  busy() {
    return !this.bad && this.status.startsWith("Checking");
  }

  bottom(w, live) {
    const conv = this.convs.find((c) => c.id === this.cur);
    const words = this.token ? this.status || (conv ? `${this.convs.length} conversations · updates every 5 s` : "") : "Not connected";
    return div()
      .id("sl-bar")
      .relative()
      .flex_none()
      .w_full()
      .h(BAR)
      .child(paint(rrect(w - 2, BAR, [0, 0, 4, 4]), live ? vgrad("#c9c9c9", "#a9a9a9") : vgrad("#e9e9e9", "#d6d6d6"), w - 2, BAR))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#6a6a6a" : "#a5a5a5"))
      .child(div().absolute().top(0).left(0).w_full().h(BAR).flex().items_center().justify_center().child(embossed(words, { size: 10, color: live ? "#2b2b2b" : "#7a7a7a", truncate: true })))
      .child(
        div()
          .id("sl-grip")
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
            startTornResize(null, e, { x: Math.round(b.x + b.width - fw), y: Math.round(b.y + b.height - fh), w: fw, h: fh }, "slack");
          }),
      );
  }

  /** As a tab: a toolbar strip over the body, no window chrome of its own. */
  inTab(body, live) {
    const app = dockApps().find((a) => appName(a.path) === "Slack");
    const strip = h_flex()
      .id("sl-strip")
      .relative()
      .flex_none()
      .w_full()
      .h(TOOLBAR)
      .px(8)
      .gap(10)
      .items_center()
      .child(fillGrad(live ? C.titleTop : C.titleTopOff, live ? C.titleBot : C.titleBotOff))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? C.titleLine : C.titleLineOff))
      .when(Boolean(this.thread), (el) =>
        el.child(textured([{ id: "sl-back", glyph: GLYPH.left, size: 12, w: 30, tooltip: "Back to the conversation", onClick: (_e, cx) => ((this.thread = KEEP.thread = null), cx.notify()) }])),
      )
      .when(Boolean(this.token), (el) => el.child(textured([{ id: "sl-refresh", text: "Refresh", w: 66, tooltip: "Fetch new messages now", onClick: (_e, cx) => this.poll(cx) }])))
      .child(div().flex_1())
      .child(embossed(this.me?.team ?? "Slack", { size: 12, color: live ? "#000000" : "#4d4d4d" }))
      .child(div().flex_1())
      .child(textured([{ id: "sl-float", text: "Open in Window", w: 112, tooltip: "Move Slack to its own window", onClick: () => {
        openWin("slack");
        // One copy only: the tab would poll alongside the window.
        const at = slackTab();
        if (at) run("tab.close", { id: at.tab.id, confirmed: true });
      } }]))
      .when(Boolean(app), (el) => el.child(textured([{ id: "sl-app", text: "Slack", w: 56, tooltip: "Open the Slack app", onClick: () => exec("open", ["-a", app.path]).catch(() => {}) }])))
      .when(Boolean(this.token), (el) => el.child(textured([{ id: "sl-out", text: "Sign Out", w: 70, tooltip: "Forget the Slack token (it's removed from the Keychain)", onClick: (_e, cx) => cx.spawn((cx) => this.signOut(cx)) }])));
    return v_flex()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .track_focus(this.focus)
      // The moves carry no button, so a thumb let go outside the view is dropped when the pointer leaves it.
      .on_hover((over) => over || endScroll(this.sb))
      .on_mouse_move((e, cx) => dragScroll(this.sb, e, cx))
      .on_mouse_up("left", () => endScroll(this.sb))
      .size_full()
      .bg("#ededed")
      .font_family(FONT)
      .text_color(C.text)
      .child(strip)
      .child(h_flex().flex_1().min_h(0).w_full().child(body));
  }

  render(cx) {
    const p = props() ?? {};
    const goto = winState("slack").goto;
    if (goto && goto !== this.went && this.token) {
      this.went = goto;
      cx.timer.after(0, (cx) => {
        setWin("slack", { goto: null });
        if (this.convs.some((c) => c.id === goto)) this.open(goto, cx);
      });
    } else if (!goto) this.went = null;
    const fresh = this.cur && !this.thread && unread()[this.cur];
    const rows = this.msgs.get(this.cur);
    if (fresh && rows?.length && slackShown()) cx.timer.after(0, () => markSeen(this.cur, rows[rows.length - 1].ts));
    // Closed from elsewhere (sl.slack open: false): close, as torn-off windows do.
    if (!p.inTab && (winState("slack").open === false || Boolean(winState("slack").big) !== Boolean(p.big)) && !this.closing) {
      this.closing = true;
      closeOverlay(p.overlay);
    }
    const w = this.size?.width ?? props()?.size?.[0] ?? 0;
    const h = this.size?.height ?? props()?.size?.[1] ?? 0;
    const live = key();
    const body = !this.ready
      ? div().flex_1().h_full().bg("#ffffff")
      : !this.token
        ? this.setup()
        : h_flex()
            .flex_1()
            .min_w(0)
            .h_full()
            .child(this.sidebar(live))
            .child(div().flex_none().w(1).h_full().bg("#8b8b8b"))
            .child(v_flex().flex_1().min_w(0).h_full().child(this.feed()).child(this.composer(live)));
    if (p.inTab) return this.inTab(body, live);
    return div()
      .id("root")
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
        const n = winState("slack");
        if (b && !n.big && (n.at?.x !== Math.round(b.x) || n.at?.y !== Math.round(b.y))) setWin("slack", { at: { x: Math.round(b.x), y: Math.round(b.y) } });
      })
      .relative()
      .size_full()
      .font_family(FONT)
      .text_color(C.text)
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, 5), "#00000078", w, h))
          .child(paint(rrect(w - 2, h - 2, 4, 1, 1), "#ededed", w, h))
          .child(paint(rrect(w - 2, this.bare() ? TITLE : TITLE + TOOLBAR, [4, 4, 0, 0], 1, 1), live ? vgrad(C.titleTop, C.titleBot) : vgrad(C.titleTopOff, C.titleBotOff), w, h))
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
