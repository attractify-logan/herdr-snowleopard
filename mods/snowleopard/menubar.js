// The menu bar: the Apple menu, the bold app menu, File, Edit, View, Window,
// Help; on the right the agents and machines menu extras, the clock, the
// user (fast user switching between layouts) and Spotlight (the palette).
// Menus open on mouse down and follow the pointer along the bar, as in Aqua.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  spaces, agents, machines, layouts, shared, settings, home, run, knownAgents, focused, updates,
  window as appWindow,
} from "herdr";
import {
  C, FONT, GLYPH, ICON, paint, rrect, vgrad, fillGrad, openMenu, closeMenus, shortcut, shown, plural, torn, tabInfo, canTear,
} from "./kit.js";

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

const STATUS_WORD = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };

/** Every agent, as menu rows that focus it. */
export function agentItems() {
  const list = agents();
  if (!list.length) return [{ label: "No agents running", disabled: true }];
  return list.map((a) => ({
    label: a.tab_name && a.tab_name !== String(a.tab_index) ? a.tab_name : a.program?.name ?? "Agent",
    detail: `${a.space_name} · ${STATUS_WORD[a.status] ?? a.status}`,
    icon: a.program?.icon && !a.program.tint ? a.program.icon : null,
    checked: a.focused,
    act: { run: ["agent.focus", { terminal: a.address }] },
  }));
}

export default class MenuBar {
  init(_p, cx) {
    this.widths = {};
    this.now = new Date();
    this.agentsToRun = [];
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
          { label: shown("dock") ? "Turn Dock Hiding On" : "Turn Dock Hiding Off", act: { toggle: "dock" } },
          { label: "Dock Applications…", act: { sheet: ["dockapps", {}] } },
          { sep: true },
          { label: "Force Quit…", shortcut: sc("snowleopard.forcequit"), act: { sheet: ["forcequit"] } },
          { sep: true },
          { label: "Sleep", act: { run: ["window.minimize"] } },
          { label: "Restart…", disabled: !u?.app?.ready, act: { run: ["app.update"] } },
          { label: "Shut Down…", act: { sheet: ["confirm", { title: "Are you sure you want to quit Herdr?", detail: "Your terminals and agents keep running in herdr-core and will be here when you come back.", yes: "Shut Down", command: { name: "app.quit" } }] } },
          { sep: true },
          { label: `Log Out ${userName()}…`, act: { run: ["window.close"] } },
        ];
      }
      case "app":
        return [
          { label: "About Herdr", act: { sheet: ["about"] } },
          { sep: true },
          { label: "Preferences…", shortcut: sc("app.settings"), act: { run: ["app.settings", {}] } },
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
          ...tabs.map((t) => ({
            label: t.name,
            detail: s?.name,
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
      case "agents":
        return [
          { label: "Agents", header: true },
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
          ...ms.map((m) => ({ label: m.name ?? "This Mac", detail: word[m.layout] ?? m.layout, checked: m.layout === "ready", disabled: m.layout !== "ready" })),
          { sep: true },
          { label: "Open Machines Preferences…", act: { run: ["app.settings", { section: "machines" }] } },
        ];
      }
      case "clock":
        return [
          { label: `${LONG_DAYS[this.now.getDay()]}, ${MONTHS[this.now.getMonth()]} ${this.now.getDate()}, ${this.now.getFullYear()}`, disabled: true },
          { sep: true },
          { label: "Open Alerts Preferences…", act: { run: ["app.settings", { section: "alerts" }] } },
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
    const right = ["agents", "machines", "clock", "user"].includes(name);
    const items = this.menu(name);
    const at = bounds ? { x: right ? Math.max(0, bounds.x + bounds.width - 220) : bounds.x, y: 22 } : undefined;
    // Right-side menus hang from their right edge: size them to know where that is.
    openMenu(items, at && right ? this.rightAt(items, bounds) : at, { owner: name, attached: true });
  }

  rightAt(items, bounds) {
    const longest = items.reduce((n, it) => Math.max(n, (it.label ?? "").length + (it.detail ? it.detail.length * 0.85 + 2 : 0)), 0);
    const w = Math.max(172, 46 + longest * 7.3);
    return { x: Math.max(0, bounds.x + bounds.width - w), y: 22 };
  }

  /** Key commands: "apple", "app", "file", ... open that menu (Ctrl-F2 walks them, as in Aqua). */
  command(c) {
    const order = ["apple", "app", "file", "edit", "view", "window", "help"];
    let name = c;
    if (c === "menus") {
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

  render(_cx) {
    const list = agents();
    const working = list.filter((a) => a.status === "working").length;
    const blocked = list.filter((a) => a.status === "blocked").length;
    const ms = machines();
    const allUp = ms.every((m) => m.layout === "ready");
    const glyph = (path, on, w = 16, h = 16, dim = false) => svg(path).w(w).h(h).text_color(on ? "#ffffff" : dim ? "#00000059" : "#000000");
    const agentsExtra = (on) =>
      h_flex()
        .items_center()
        .gap(4)
        .child(blocked ? div().w(8).h(8).rounded(4).bg(on ? "#ffffff" : C.red).loop("opacity", { from: 0.35, to: 1, period: 1100 }) : div())
        .child(working ? svg(GLYPH.spinner).w(15).h(15).text_color(on ? "#ffffff" : "#222222").spin(900) : glyph(GLYPH.agents, on))
        .when(working + blocked > 0, (el) => el.child(div().text_size(13).child(String(working + blocked))));
    return h_flex()
      .id("menubar")
      .relative()
      .size_full()
      .font_family(FONT)
      .text_size(14)
      .text_color(C.text)
      .child(fillGrad(C.barTop, C.barBot))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg("#ffffffa0"))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(C.barLine))
      .child(
        h_flex()
          .relative()
          .h_full()
          .pl(10)
          .items_center()
          .child(this.title("apple", (on) => div().font_family(FONT).text_size(17).text_color(on ? "#ffffff" : "#1b1b1b").child(""), { px: 10 }))
          .child(this.title("app", "Herdr", { bold: true }))
          .child(this.title("file", "File"))
          .child(this.title("edit", "Edit"))
          .child(this.title("view", "View"))
          .child(this.title("window", "Window"))
          .child(this.title("help", "Help")),
      )
      .child(div().flex_1())
      .child(
        h_flex()
          .relative()
          .h_full()
          .items_center()
          .child(this.title("agents", agentsExtra, { px: 7 }))
          .when(ms.length > 1, (el) => el.child(this.title("machines", (on) => glyph(GLYPH.wifi, on, 16, 14, !allUp), { px: 7 })))
          .child(this.title("clock", clock(this.now), { px: 8 }))
          .child(this.title("user", userName(), { px: 8 }))
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
          ),
      );
  }
}
