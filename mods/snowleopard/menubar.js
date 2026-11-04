// The menu bar: the Apple menu, the bold app menu, File, Edit, View, Window,
// Help; on the right the agents and machines menu extras, the clock, the
// user (fast user switching between layouts) and Spotlight (the palette).
// Menus open on mouse down and follow the pointer along the bar, as in Aqua.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  spaces, agents, machines, layouts, shared, settings, home, run, knownAgents, focused, updates,
  window as appWindow, exec,
} from "herdr";
import {
  C, FONT, GLYPH, ICON, pill, paint, rrect, vgrad, fillGrad, openMenu, closeMenus, menuSize, shortcut, shown, plural, torn, tabInfo, canTear, remoteSpaceItems, pref, openSheet,
  fitFrame, takeAskMark, winState,
  gauge, programIcon,
} from "./kit.js";
import { refreshUsage, usageItems, usageIcons, topPct } from "./usage.js";

export const PROFILES = [
  ["snowleopard", "Basic"],
  ["snowleopard-pro", "Pro"],
  ["snowleopard-homebrew", "Homebrew"],
  ["snowleopard-ocean", "Ocean"],
  ["snowleopard-novel", "Novel"],
];

const LAYOUT_NAMES = { main: "Herdr", terminals: "Terminals", win98: "Herdr 98", snowleopard: "Snow Leopard" };

function layoutName(n) {
  return LAYOUT_NAMES[n] ?? n.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function clock(d) {
  const day = DAYS[d.getDay()];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const pm = h >= 12;
  h = h % 12 || 12;
  return `${day} ${h}:${m} ${pm ? "PM" : "AM"}`;
}

export function userName() {
  const n = (home() ?? "").split("/").filter(Boolean).pop() ?? "User";
  return n.charAt(0).toUpperCase() + n.slice(1);
}

// The account's full name (`id -F`), asked once; the folder name stands in until then.
let FULL_NAME = null;

function fullName() {
  return FULL_NAME || userName();
}

// Agents menu sections, most urgent first.
const SECTIONS = [["blocked", "Needs You"], ["done", "Done"], ["working", "Working"], ["idle", "Idle"]];

/** Every agent, as menu rows that focus it, under gray status headers. */
export function agentItems() {
  const list = agents();
  if (!list.length) return [{ label: "No agents running", disabled: true }];
  const sp = spaces();
  const row = (a) => {
    const machine = sp.find((s) => s.id === a.space)?.machine;
    return {
      label: a.tab_name && a.tab_name !== String(a.tab_index) ? a.tab_name : a.program?.name ?? "Agent",
      detail: machine ? `${a.space_name} on ${machine}` : a.space_name,
      icon: a.program?.icon && !a.program.tint ? a.program.icon : null,
      checked: a.focused,
      act: { run: ["agent.focus", { terminal: a.address }] },
    };
  };
  const out = [];
  const waiting = list.filter((a) => a.status === "blocked").sort((a, b) => a.seq - b.seq);
  if (waiting.length) out.push({ label: "Go to Next Agent That Needs You", act: { run: ["agent.focus", { terminal: waiting[0].address }] } });
  for (const [status, title] of SECTIONS) {
    // Oldest first for the ones waiting on you.
    const rows = list.filter((a) => a.status === status);
    if (status === "blocked" || status === "done") rows.sort((a, b) => a.seq - b.seq);
    if (!rows.length) continue;
    if (out.length) out.push({ sep: true });
    out.push({ label: title, header: true }, ...rows.map(row));
  }
  return out;
}

export default class MenuBar {
  init(_p, cx) {
    this.widths = {};
    // The app window can shrink under the Mac window (a smaller display): keep it on screen.
    cx.timer.after(500, () => fitFrame());
    cx.timer.every(1000, () => fitFrame());
    this.now = new Date();
    this.agentsToRun = [];
    // Claude's and Codex's plan usage for the usage extra (usage.js), checked every 5 minutes.
    if (pref("usage")) refreshUsage();
    cx.timer.every(60000, () => pref("usage") && refreshUsage());
    exec("id", ["-F"])
      .then((r) => {
        const n = r.stdout.trim();
        if (r.code === 0 && n) FULL_NAME = n;
      })
      .catch(() => {});
    const tick = (cx) => {
      this.now = new Date();
      cx.notify();
    };
    cx.timer.after(60000 - (Date.now() % 60000) + 50, (cx) => {
      tick(cx);
      cx.timer.every(60000, tick);
    });
    cx.spawn(async (cx) => {
      try {
        this.agentsToRun = (await knownAgents()).filter((a) => a.installed).slice(0, 8);
      } catch {}
      cx.notify();
    });
  }

  space() {
    return spaces().find((s) => s.active);
  }

  menu(name) {
    const s = this.space();
    const tab = s?.tabs.find((t) => t.active);
    const sc = shortcut;
    switch (name) {
      case "apple": {
        const u = updates();
        return [
          { label: "About Herdr", act: { sheet: ["about"] } },
          { label: u?.app?.ready ? "Software Update… (1)" : "Software Update…", act: { run: ["app.settings", { section: "updates" }] } },
          { sep: true },
          { label: "System Preferences…", act: { run: ["app.settings", {}] } },
          // As on a Mac, hiding means the Dock slides away until the pointer reaches the bottom edge.
          { label: pref("dockAutoHide") ? "Turn Dock Hiding Off" : "Turn Dock Hiding On", act: { pref: ["dockAutoHide", !pref("dockAutoHide")] } },
          { label: "Dock Applications…", act: { sheet: ["dockapps", {}] } },
          { sep: true },
          { label: "Force Quit…", shortcut: sc("snowleopard.forcequit"), act: { sheet: ["forcequit"] } },
          { sep: true },
          { label: "Sleep", act: { run: ["window.minimize"] } },
          { label: "Restart…", disabled: !u?.app?.ready, act: { run: ["app.update"] } },
          { label: "Shut Down…", act: { sheet: ["confirm", { title: "Are you sure you want to quit Herdr?", detail: "Your terminals and agents keep running in herdr-core and will be here when you come back.", yes: "Shut Down", command: { name: "app.quit" } }] } },
          { sep: true },
          { label: `Log Out ${fullName()}…`, act: { sheet: ["confirm", { title: "Close the Herdr window?", detail: "Your agents keep running.", yes: "Log Out", command: { name: "window.close" } }] } },
        ];
      }
      case "app":
        return [
          { label: "About Herdr", act: { sheet: ["about"] } },
          { sep: true },
          { label: "Preferences…", shortcut: sc("app.settings"), act: { run: ["app.settings", {}] } },
          { label: "Snow Leopard Settings…", act: { sheet: ["prefs", {}] } },
          { label: "What's New in Herdr", act: { run: ["app.whats_new"] } },
          { sep: true },
          { label: "Hide Herdr", shortcut: sc("app.hide"), act: { run: ["app.hide"] } },
          { label: "Hide Others", shortcut: sc("app.hide_others"), act: { run: ["app.hide_others"] } },
          { label: "Show All", act: { run: ["app.show_all"] } },
          { sep: true },
          { label: "Quit Herdr", shortcut: sc("app.quit"), act: { run: ["app.quit"] } },
        ];
      case "file": {
        const agentRows = this.agentsToRun.map((a) => ({
          label: a.name,
          icon: a.icon && !a.tint ? a.icon : null,
          act: { run: ["tab.new", { argv: a.run }] },
        }));
        return [
          { label: "New Tab", shortcut: sc("tab.new"), act: { run: ["tab.new", {}] } },
          { label: "New Space", shortcut: sc("space.new"), act: { run: ["space.new", {}] } },
          { label: "New Space in Folder…", act: { newSpaceIn: true } },
          ...remoteSpaceItems(),
          ...(agentRows.length ? [{ sep: true }, { label: "New Tab with Agent", header: true }, ...agentRows] : []),
          { sep: true },
          { label: "Split Pane Right", shortcut: sc("pane.split:right"), act: { run: ["pane.split", { direction: "right" }] }, disabled: !focused()?.pane },
          { label: "Split Pane Down", shortcut: sc("pane.split:down"), act: { run: ["pane.split", { direction: "down" }] }, disabled: !focused()?.pane },
          { sep: true },
          { label: "Close Pane", shortcut: sc("pane.close"), act: { run: ["pane.close", {}] }, disabled: !focused()?.pane },
          { label: "Close Tab", shortcut: sc("tab.close"), disabled: !tab, act: { sheet: ["closetab", { tab: tab?.id }] } },
          { label: "Close Space…", disabled: !s, act: { sheet: ["closespace", { space: s?.id }] } },
          { sep: true },
          { label: "Rename Tab…", shortcut: sc("tab.rename"), disabled: !tab, act: { sheet: ["rename", { what: "tab", id: tab?.id }] } },
          { label: "Rename Space…", shortcut: sc("space.rename"), disabled: !s, act: { sheet: ["rename", { what: "space", id: s?.id }] } },
          ...(s && !s.machine && s.folder ? [{ sep: true }, { label: "Show in Finder", act: { open: s.folder } }] : []),
        ];
      }
      case "edit":
        return [
          { label: "Copy", shortcut: sc("terminal.copy"), act: { run: ["terminal.copy"] } },
          { label: "Paste", shortcut: sc("terminal.paste"), act: { run: ["terminal.paste"] } },
          { label: "Paste Image", shortcut: sc("terminal.paste_image"), act: { run: ["terminal.paste_image"] } },
          { sep: true },
          { label: "Find Command…", shortcut: sc("app.palette"), act: { run: ["app.palette"] } },
        ];
      case "view": {
        const look = settings()?.theme;
        const cur = typeof look === "string" ? look : null;
        return [
          { label: appWindow()?.fullscreen ? "Exit Full Screen" : "Enter Full Screen", shortcut: sc("snowleopard.fullscreen"), act: { fullscreen: true } },
          { sep: true },
          { label: shown("sidebar") ? "Hide Sidebar" : "Show Sidebar", shortcut: sc("layout.toggle:sidebar"), act: { toggle: "sidebar" } },
          { label: shown("tabs") ? "Hide Tab Bar" : "Show Tab Bar", act: { toggle: "tabs" } },
          { label: shown("statusbar") ? "Hide Status Bar" : "Show Status Bar", act: { toggle: "statusbar" } },
          { label: shown("dock") ? "Hide Dock" : "Show Dock", act: { toggle: "dock" } },
          { label: "Dock Applications…", act: { sheet: ["dockapps", {}] } },
          { sep: true },
          { label: "Zoom In", shortcut: sc("app.zoom_in"), act: { run: ["app.zoom_in"] } },
          { label: "Zoom Out", shortcut: sc("app.zoom_out"), act: { run: ["app.zoom_out"] } },
          { label: "Actual Size", shortcut: sc("app.zoom_reset"), act: { run: ["app.zoom_reset"] } },
          { sep: true },
          { label: "Terminal Profile", header: true },
          ...PROFILES.map(([theme, label]) => ({ label, checked: cur === theme, act: { look: { theme } } })),
          { sep: true },
          { label: "Layout", header: true },
          ...layouts().map((n) => ({ label: layoutName(n), checked: n === shared("layout"), act: { run: ["layout.switch", { name: n }] } })),
        ];
      }
      case "window": {
        const out = torn();
        const tabs = (s?.tabs ?? []).filter((t) => !out[t.id] && (!t.settled || t.active));
        const cur = s?.tabs.find((t) => t.active && !out[t.id]);
        const wins = Object.keys(out).map(tabInfo).filter(Boolean);
        return [
          { label: "Minimize", shortcut: sc("window.minimize"), act: { run: ["window.minimize"] } },
          { label: "Zoom", act: { zoomWindow: true } },
          { sep: true },
          { label: "Select Next Tab", shortcut: sc("tab.next"), act: { run: ["tab.next"] } },
          { label: "Select Previous Tab", shortcut: sc("tab.prev"), act: { run: ["tab.prev"] } },
          { label: "Select Next Space", shortcut: sc("space.next"), act: { run: ["space.next"] } },
          { label: "Select Previous Space", shortcut: sc("space.prev"), act: { run: ["space.prev"] } },
          { label: "Zoom Pane", shortcut: sc("pane.zoom"), act: { run: ["pane.zoom", {}] }, disabled: !focused()?.pane },
          { sep: true },
          { label: "Move Tab to New Window", disabled: !cur || !canTear(cur.id), act: { tearOff: cur?.id } },
          { label: "Merge All Windows", disabled: !wins.length, act: { mergeAll: true } },
          { sep: true },
          ...(tabs.length ? [{ label: s?.name ?? "Tabs", header: true }] : []),
          ...tabs.map((t) => ({
            label: t.name,
            checked: t.active,
            shortcut: t.index <= 9 ? sc(`tab.select:${t.index}`) : "",
            act: { run: ["tab.select", { id: t.id }] },
          })),
          ...(wins.length
            ? [
                { sep: true },
                ...wins.map((w) => ({ label: w.tab.named ? w.tab.name : `Tab ${w.tab.name}`, detail: out[w.tab.id].min ? "in the Dock" : w.space.name, act: { raise: w.tab.id } })),
              ]
            : []),
          // Notes, Slack, Linear and Messages open inside Herdr, so they're reachable without the real apps.
          { sep: true },
          { label: "Notes", checked: Boolean(winState("notes").open), detail: winState("notes").min ? "in the Dock" : "", act: { win: "notes" } },
          { label: "Slack", checked: Boolean(winState("slack").open), detail: winState("slack").min ? "in the Dock" : "", act: winState("slack").open || winState("slack").min ? { win: "slack" } : { slackTab: true } },
          { label: "Linear", checked: Boolean(winState("linear").open), detail: winState("linear").min ? "in the Dock" : "", act: winState("linear").open || winState("linear").min ? { win: "linear" } : { linearTab: true } },
          { label: "Messages", checked: Boolean(winState("imessage").open), detail: winState("imessage").min ? "in the Dock" : "", act: { win: "imessage" } },
        ];
      }
      case "help":
        return [
          { label: "Herdr Help", shortcut: sc("app.help"), act: { run: ["app.help"] } },
          { label: "What's New", act: { run: ["app.whats_new"] } },
          { label: "Welcome to Herdr", act: { run: ["app.welcome"] } },
          { sep: true },
          { label: "Send Feedback…", act: { run: ["app.feedback", {}] } },
        ];
      case "usage":
        return usageItems();
      case "agents":
        return [
          ...agentItems(),
          { sep: true },
          { label: "Next Agent", shortcut: sc("agent.next"), act: { run: ["agent.next"] } },
          { label: "Previous Agent", shortcut: sc("agent.prev"), act: { run: ["agent.prev"] } },
        ];
      case "machines": {
        const ms = machines();
        const word = { ready: "Connected", loading: "Connecting…", unavailable: "Unavailable" };
        return [
          { label: "Machines", header: true },
          ...ms.map((m) => ({ label: m.name ?? "This Mac", detail: word[m.layout] ?? m.layout, bead: m.layout === "ready" ? "zoom" : m.layout === "loading" ? "min" : "red", disabled: m.layout !== "ready" })),
          { sep: true },
          { label: "Open Machines Preferences…", act: { run: ["app.settings", { section: "machines" }] } },
        ];
      }
      case "clock":
        return [
          { label: `${LONG_DAYS[this.now.getDay()]}, ${MONTHS[this.now.getMonth()]} ${this.now.getDate()}, ${this.now.getFullYear()}`, disabled: true },
        ];
      case "user":
        return [
          { label: "Layouts", header: true },
          ...layouts().map((n) => ({ label: layoutName(n), checked: n === shared("layout"), act: { run: ["layout.switch", { name: n }] } })),
          { sep: true },
          { label: "Look Preferences…", act: { run: ["app.settings", { section: "look" }] } },
        ];
    }
    return [];
  }

  open(name, bounds) {
    const m = shared("sl.menu");
    if (m?.id) closeMenus();
    const extra = ["usage", "agents", "machines", "clock", "user"].includes(name);
    const items = this.menu(name);
    // A menu extra's menu opens left-aligned under it, shifted left only at the screen edge.
    let x = bounds.x;
    if (extra) {
      // The extras end at the window's right edge: the title's x plus the widths from it on (Spotlight is 30).
      const order = ["usage", "agents", "machines", "clock", "user"];
      const edge = order.slice(order.indexOf(name)).reduce((n, k) => n + (this.widths[k] ?? 0), bounds.x + 30);
      x = Math.max(0, Math.min(bounds.x, edge - menuSize(items).w - 4));
    }
    openMenu(items, bounds ? { x, y: 22 } : undefined, { owner: name, attached: true });
  }

  /** Key commands: "apple", "app", "file", ... open that menu (Ctrl-F2 walks them, as in Aqua). */
  command(c) {
    const order = ["apple", "app", "file", "edit", "view", "window", "help"];
    let name = c;
    // Left and right in an open menu: its neighbour on the bar.
    if (c === "menuprev" || c === "menunext") {
      const i = order.indexOf(shared("sl.menu")?.owner);
      if (i < 0) return true;
      name = order[(i + (c === "menunext" ? 1 : order.length - 1)) % order.length];
    } else if (c === "menus") {
      const cur = shared("sl.menu");
      const i = order.indexOf(cur?.id ? cur.owner : null);
      name = order[(i + 1) % order.length];
    }
    if (!order.includes(name)) return false;
    let x = 10;
    for (const n of order) {
      if (n === name) break;
      x += this.widths[n] ?? 0;
    }
    this.open(name, { x, y: 0, width: this.widths[name] ?? 40, height: 22 });
    return true;
  }

  title(name, content, o = {}) {
    const m = shared("sl.menu");
    const on = m?.owner === name && Boolean(m?.id);
    const w = o.w;
    return div()
      .id(`mb-${name}`)
      .on_size_change((size) => {
        this.widths[name] = size.width;
      })
      .relative()
      .flex_none()
      .h(22)
      .px(o.px ?? 9)
      .flex()
      .items_center()
      .gap(5)
      .when(on, (el) => el.child(fillGrad(C.selTop, C.selBot)))
      .child(
        h_flex()
          .relative()
          .items_center()
          .gap(5)
          .text_color(on ? "#ffffff" : C.text)
          .when(Boolean(o.bold), (el) => el.font_weight(700))
          .child(typeof content === "function" ? content(on) : content),
      )
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        const cur = shared("sl.menu");
        // A press on the open menu's own title closes it.
        if (cur?.owner === name && cur?.id) return closeMenus();
        if (cur?.closed === name && Date.now() - (cur.at ?? 0) < 250) return;
        if (o.onPress) return o.onPress();
        o.onOpen?.();
        this.open(name, e.bounds);
        cx.notify();
      })
      .on_mouse_move((e, cx) => {
        const cur = shared("sl.menu");
        if (!cur?.id || cur.owner === name || o.onPress) return;
        this.open(name, e.bounds);
        cx.notify();
      });
  }

  /** A tab made by hand since the last look (⌘T, +, a New menu: newTab), shown and
   *  unnamed: ask for its name, unless that's turned off in Snow Leopard Settings.
   *  Tabs that scripts, the CLI and agents make are never asked about. */
  askNames(cx) {
    const now = new Set();
    let fresh = null;
    for (const s of spaces())
      for (const t of s.tabs) {
        now.add(t.id);
        if (this.known && !this.known.has(t.id) && s.active && t.active && !t.named && !t.settled) fresh = t.id;
      }
    this.known = now;
    if (fresh && takeAskMark() && pref("askTabName"))
      cx.timer.after(150, () => {
        // Still the shown tab, still unnamed? (The person may have moved on.)
        const t = spaces().find((x) => x.active)?.tabs.find((x) => x.id === fresh && x.active && !x.named);
        if (t) openSheet("rename", { what: "tab", id: fresh, isNew: true, key: "sl-rename" });
      });
  }

  /** The bar: the gradient and its two edge lines. */
  bar() {
    return h_flex()
      .id("menubar")
      .relative()
      .size_full()
      .font_family(FONT)
      .text_size(14)
      .text_color(C.text)
      .child(fillGrad(C.barTop, C.barBot))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg("#ffffffa0"))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(C.barLine));
  }

  render(cx) {
    this.askNames(cx);
    return this.bar()
      .child(
        h_flex()
          .relative()
          .h_full()
          .pl(10)
          .items_center()
          .child(this.title("apple", (on) => div().font_family(FONT).text_size(17).text_color(on ? "#ffffff" : "#1b1b1b").child("\uf8ff"), { px: 10 }))
          .child(this.title("app", "Herdr", { bold: true }))
          .child(this.title("file", "File"))
          .child(this.title("edit", "Edit"))
          .child(this.title("view", "View"))
          .child(this.title("window", "Window"))
          .child(this.title("help", "Help")),
      )
      .child(div().flex_1())
      .child(this.extras());
  }

  /** The right of the bar: the agents and machines extras, the clock, the user and Spotlight. */
  extras() {
    const list = agents();
    const working = list.filter((a) => a.status === "working").length;
    const blocked = list.filter((a) => a.status === "blocked").length;
    const ms = machines();
    const allUp = ms.every((m) => m.layout === "ready");
    const glyph = (path, on, w = 16, h = 16, dim = false) => svg(path).w(w).h(h).text_color(on ? "#ffffff" : dim ? "#00000059" : "#000000");
    // Claude's and Codex's plan usage: each one's icon, a small gauge of what's left of its fullest limit, the percent left.
    const u = pref("usage") ? shared("sl.usage") : null;
    const services = [["claude", u?.claude], ["codex", u?.codex]].filter(([, x]) => topPct(x) !== null);
    const usage = services.length > 0;
    const icons = usage ? usageIcons() : {};
    const usageExtra = (on) =>
      h_flex()
        .items_center()
        .gap(8)
        .children(
          services.map(([k, x]) =>
            h_flex()
              .items_center()
              .gap(4)
              .child(icons[k] ? programIcon(icons[k], 14, { small: true }) : div().text_size(11).font_weight(700).child(x.name))
              .child(gauge(100 - topPct(x), 24, 7, { selected: on, left: true }))
              .child(div().text_size(12).text_color(on ? "#ffffff" : C.text).child(`${Math.max(0, Math.round(100 - topPct(x)))}%`)),
          ),
        );
    // Who needs you is a red pill with the count; a spinner alone says something is working.
    const agentsExtra = (on) =>
      h_flex()
        .items_center()
        .gap(4)
        .when(blocked > 0, (el) => el.child(pill(blocked, { color: C.red, selected: on })))
        .when(working > 0, (el) => el.child(svg(GLYPH.spinner).w(15).h(15).text_color(on ? "#ffffff" : "#222222").spin(900)))
        .when(working + blocked === 0, (el) => el.child(glyph(GLYPH.agents, on)));
    return h_flex()
          .relative()
          .h_full()
          .items_center()
          .when(Boolean(usage), (el) => el.child(this.title("usage", usageExtra, { px: 7, onOpen: () => refreshUsage(true) })))
          .child(this.title("agents", agentsExtra, { px: 7 }))
          .when(ms.length > 1, (el) => el.child(this.title("machines", (on) => glyph(GLYPH.wifi, on, 16, 14, !allUp), { px: 7 })))
          .child(this.title("clock", clock(this.now), { px: 8 }))
          .child(this.title("user", fullName(), { px: 8 }))
          .child(
            div()
              .id("spotlight")
              .relative()
              .flex_none()
              .w(30)
              .h(22)
              .flex()
              .items_center()
              .justify_center()
              .child(fillGrad("#4e8de8", "#1b5fd2"))
              .child(svg(GLYPH.search).relative().w(14).h(14).text_color("#ffffff"))
              .tooltip("Spotlight: every Herdr command")
              .on_mouse_down("left", (_e, cx) => {
                cx.stop_propagation();
                closeMenus();
                run("app.palette");
              }),
          );
  }
}
