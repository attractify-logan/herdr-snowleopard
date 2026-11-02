// The Dock: Leopard's glass shelf in perspective, Herdr at the left (the
// space picker), one folder per space (engraved with its initials, badged
// with its agent's icon), the zebra separator and the Trash. A light on the
// shelf under every space that's running an agent (brighter under the shown
// one); a red count badge for agents that finished or need you, and a
// space whose agent has just started to need you bounces its folder a few
// times (and may open a notice, notice.js). Hover shows the name,
// click opens, right-click lists its tabs. Herdr's own icon goes to the agent
// that needs you most; right-click lists the agents. Minimized torn-off windows wait
// between the separator and the Trash; click one to bring it back.
// Applications kept in the Dock ("sl.dockApps", View › Dock Applications…)
// sit beside Herdr: click opens one, right-click opens the shown space's
// folder in it (Obsidian as a vault), and a light shows the running ones.
// Some apps open a window of their own inside Herdr (WIN_APPS): Obsidian's
// icon opens the vault (notes.js), Slack's opens Slack (slack.js); their menus
// still open the real app. A minimized one waits by the Trash.

import { div, image, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run, shared, exec } from "herdr";
import {
  C, FONT, ICON, paint, rrect, oval, vgrad, programIcon, leadProgram, countBadge, openMenu, closeMenus, menuSize,
  spaceItems, shortcut, embossed, torn, tabInfo, restoreTorn, dockApps, appIcon, appName, openWin, winState, WIN_APPS, openSlackTab,
  STATUS_WORD, tabLabel, pref,
} from "./kit.js";
import { withStatus, urgentAgent, agentName, agentSpace, showNotice } from "./notice.js";
import { watchSlack, slackBadge } from "./slackwatch.js";

const ICON_SIZE = 48;
const GAP = 8;
const PAD = 14;
const SHELF = 22; // top surface 16 + front 6
const SURFACE = 16;
const MARGIN = 3; // under the shelf
const SEP = 18; // the separator's slot

// Capitals, as on Leopard's folder glyphs: one letter for a one-word name.
function initials(name) {
  const words = String(name ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "~";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const BOUNCES = 3;
const CYCLE = 1000; // ms: one hop, its rebound and a pause

/** The Dock's hop at t ms into a cycle: up 16 px easing out, down, a small rebound, rest. */
function hop(t) {
  const p = (t % CYCLE) / CYCLE;
  if (p < 0.35) return -16 * (1 - (1 - p / 0.35) ** 2);
  if (p < 0.75) return -16 * (1 - ((p - 0.35) / 0.4) ** 2);
  if (p < 0.9) return -3 * Math.sin(((p - 0.75) / 0.15) * Math.PI);
  return 0;
}

const RANK = { blocked: 0, done: 1, working: 2 };

export default class Dock {
  init(_p, cx) {
    this.size = null;
    this.hover = null;
    this.running = new Set();
    // Which agents needed you last time we looked (null until the first look), the folders
    // hopping now (space id → start time) and the notice still up.
    this.waiting = null;
    this.hops = new Map();
    this.notice = null;
    cx.timer.every(500, (cx) => this.watch(cx));
    // Which kept apps are running, for their lights: a process list every few seconds.
    this.poll(cx);
    cx.timer.every(4000, (cx) => this.poll(cx));
    // Slack's unread messages, for its badge here and its banners (slackwatch.js).
    watchSlack(cx);
  }

  poll(cx) {
    const apps = dockApps();
    if (!apps.length) return;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("ps", ["-axo", "comm="]);
        const procs = r.stdout.split("\n");
        const now = new Set(apps.filter((a) => procs.some((l) => l.startsWith(`${a.path}/Contents/MacOS/`))).map((a) => a.path));
        if ([...now].join() !== [...this.running].join()) {
          this.running = now;
          cx.notify();
        }
      } catch {}
    });
  }

  /** Bounces the folder and opens a notice for every agent that has just started to need you. */
  watch(cx) {
    const now = new Set(withStatus("blocked").map((a) => a.address));
    const before = this.waiting;
    this.waiting = now;
    if (before) {
      const fresh = agents().filter((a) => now.has(a.address) && !before.has(a.address));
      const unseen = fresh.filter((a) => !spaces().find((s) => s.id === a.space)?.active);
      if (pref("bounce") && unseen.length) {
        for (const a of unseen) if (!this.hops.has(a.space)) this.hops.set(a.space, Date.now());
        this.tick ??= cx.timer.every(40, (cx) => this.hopAll(cx));
      }
      const last = fresh.filter((a) => !a.focused).pop();
      if (pref("notice") && last) this.notice = showNotice(last, this.notice);
    }
  }

  /** One frame of every hopping folder; the animation stops after BOUNCES hops or when you look. */
  hopAll(cx) {
    const now = Date.now();
    const active = spaces().find((s) => s.active)?.id;
    for (const [id, t0] of this.hops) if (id === active || now - t0 >= CYCLE * BOUNCES) this.hops.delete(id);
    if (!this.hops.size) {
      this.tick?.cancel();
      this.tick = null;
    }
    cx.notify();
  }

  /** The agents, grouped as the Dock menu lists them: needs you, done, working. */
  agentMenu() {
    const items = [];
    for (const status of ["blocked", "done", "working"]) {
      const list = withStatus(status);
      if (!list.length) continue;
      items.push({ header: true, label: STATUS_WORD[status] });
      for (const a of list)
        items.push({
          label: agentName(a),
          detail: agentSpace(a),
          icon: a.program?.icon && !a.program.tint ? a.program.icon : null,
          checked: a.focused,
          act: { run: ["agent.focus", { terminal: a.address }] },
        });
    }
    if (items.length) items.push({ sep: true });
    items.push({ label: "Go to…", act: { run: ["mod.open", { name: "picker" }] } });
    items.push({ label: "Dock Applications…", act: { sheet: ["dockapps", {}] } });
    return items;
  }

  appItems(it) {
    const s = spaces().find((x) => x.active);
    const here = s && !s.machine && s.folder;
    const win = WIN_APPS[appName(it.app.path)];
    return [
      ...(win === "slack"
        ? [{ label: "Open Slack in a Tab", act: { slackTab: true } }, { label: "Open Slack in a Window", act: { win } }, { label: "Open Slack App", act: { launch: [it.app.path] } }]
        : win
        ? [{ label: win === "notes" ? "Open Vault in Herdr" : `Open ${it.label} in Herdr`, act: { win } }, { label: `Open ${it.label} App`, act: { launch: [it.app.path] } }]
        : [{ label: "Open", act: { launch: [it.app.path] } }]),
      ...(here ? [{ label: `Open “${s.name}” in ${it.label}`, act: { launch: [it.app.path, s.folder] } }] : []),
      { sep: true },
      { label: "Show in Finder", act: { reveal: it.app.path } },
      { label: "Remove from Dock", act: { unDock: it.app.path } },
      { sep: true },
      { label: "Dock Applications…", act: { sheet: ["dockapps", {}] } },
    ];
  }

  items() {
    const ags = agents();
    const list = [{ kind: "app", id: "herdr", label: "Herdr" }];
    for (const a of dockApps()) list.push({ kind: "dapp", id: `app-${a.path}`, label: a.name, app: a, count: WIN_APPS[appName(a.path)] === "slack" ? slackBadge() : 0 });
    for (const s of spaces()) {
      const mine = ags.filter((a) => a.space === s.id);
      // The folder wears the most urgent agent's badge: blocked, then done, working, the first.
      const top = mine.reduce((m, a) => (m && (RANK[m.status] ?? 3) <= (RANK[a.status] ?? 3) ? m : a), null);
      list.push({
        kind: "space",
        id: s.id,
        label: s.machine ? `${s.name} (${s.machine})` : s.name,
        space: s,
        count: mine.filter((a) => a.status === "blocked" || (a.status === "done" && pref("doneBadge"))).length,
        running: mine.length > 0,
        program: top?.program ?? leadProgram(s.id),
      });
    }
    list.push({ kind: "sep", id: "sep" });
    const out = torn();
    for (const [id, w] of Object.entries(out)) {
      const info = w.min ? tabInfo(id) : null;
      if (!info) continue;
      list.push({ kind: "win", id: `win-${id}`, tab: id, label: `${info.space.name} — ${tabLabel(info.space.id, info.tab)}`, program: leadProgram(info.space.id, id) });
    }
    // Notes and Slack wait here whether or not Obsidian and Slack are in the Dock.
    for (const win of ["notes", "slack"]) {
      if (!winState(win).min) continue;
      const app = dockApps().find((a) => WIN_APPS[appName(a.path)] === win) ?? null;
      const last = winState(win).last;
      list.push({ kind: "winmin", id: `winmin-${win}`, win, label: last ? last.split("/").pop().replace(/\.md$/i, "") : app?.name ?? (win === "notes" ? "Notes" : "Slack"), app });
    }
    list.push({ kind: "trash", id: "trash", label: "Trash" });
    return list;
  }

  menuAbove(items, bounds) {
    closeMenus();
    const { w, h } = menuSize(items);
    const at = bounds ? { x: Math.max(4, bounds.x + bounds.width / 2 - w / 2), y: bounds.y - h - 8 } : undefined;
    openMenu(items, at, { owner: "dock" });
  }

  trashItems() {
    const s = spaces().find((x) => x.active);
    const tab = s?.tabs.find((t) => t.active);
    return [
      { label: tab ? `Close Tab “${tabLabel(s.id, tab)}”…` : "Close Tab…", shortcut: shortcut("tab.close"), disabled: !tab, act: { sheet: ["closetab", { tab: tab?.id }] } },
      { label: s ? `Close Space “${s.name}”…` : "Close Space…", disabled: !s, act: { sheet: ["closespace", { space: s?.id }] } },
    ];
  }

  art(it) {
    const s = ICON_SIZE;
    if (it.kind === "app") return image(ICON.herdr).w(s).h(s);
    if (it.kind === "trash") return image(ICON.trash).w(s).h(s);
    if (it.kind === "win") return miniWindow(s, it.program);
    if (it.kind === "winmin") return miniWindow(s, null, it.app?.icon ? appIcon(it.app.path) : null, it.win);
    if (it.kind === "dapp") return it.app.icon ? image(appIcon(it.app.path)).w(s).h(s) : plainApp(s, it.label);
    const sp = it.space;
    const agent = it.program && !it.program.shell && it.program.key !== "shell";
    // The folder, its initials engraved on the front like Applications' "A".
    return div()
      .relative()
      .w(s)
      .h(s)
      .child(image(sp.machine ? ICON.folderNetPlain : ICON.folderPlain).absolute().top(0).left(0).w(s).h(s))
      .child(
        div()
          .absolute()
          .top(s * 0.44)
          .left(0)
          .w(agent ? s - Math.round(s * 0.38) : s)
          .h(s * 0.36)
          .flex()
          .items_center()
          .justify_center()
          .child(
            div()
              .font_family("Helvetica")
              .child(embossed(initials(sp.name), { size: Math.round(s * 0.3), lead: Math.round(s * 0.34), bold: true, color: sp.machine ? "#46536a" : "#1f5296", shadow: "#ffffffc8" })),
          ),
      )
      .when(agent, (el) => el.child(div().absolute().bottom(2).right(0).child(programIcon(it.program, s * 0.38, { small: true }))));
  }

  icon(it, x) {
    const hov = this.hover === it.id;
    const label = it.label;
    const lw = Math.ceil(24 + label.length * 7.4);
    let face = div().relative().w(ICON_SIZE).h(ICON_SIZE).child(this.art(it));
    if (it.count) face = face.child(div().absolute().top(-6).right(-8).child(countBadge(it.count, 21)));
    let lift = div().absolute().left(0).w(ICON_SIZE).h(ICON_SIZE).top(0).child(face);
    const t0 = this.hops.get(it.id);
    if (t0) lift = lift.top(hop(Date.now() - t0));
    return div()
      .id(`dk-${it.id}`)
      .absolute()
      .left(x)
      .w(ICON_SIZE)
      .h(ICON_SIZE)
      .child(lift)
      .active((s) => s.opacity(0.55))
      .when(hov, (el) =>
        el.child(
          div()
            .absolute()
            .top(-30)
            .left((ICON_SIZE - lw) / 2)
            .w(lw)
            .h(22)
            .child(paint(rrect(lw, 22, 11), "#000000a8", lw, 22))
            .child(paint(rrect(lw - 2, 10, [10, 10, 0, 0], 1, 1), "#ffffff14", lw, 22))
            .child(div().absolute().top(0).left(0).w(lw).h(22).flex().items_center().justify_center().font_family(FONT).text_size(13).font_weight(700).text_color("#ffffff").child(label)),
        ),
      )
      .on_hover((h, cx) => {
        this.hover = h ? it.id : this.hover === it.id ? null : this.hover;
        cx.notify();
      })
      .on_click(() => this.click(it))
      .on_mouse_down("left", (e, cx) => {
        // The real Dock hides its label the moment you click.
        if (this.hover) {
          this.hover = null;
          cx.notify();
        }
        if (it.kind === "trash") this.menuAbove(this.trashItems(), e.bounds);
      })
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        this.hover = null;
        if (it.kind === "space") this.menuAbove(spaceItems(it.space), e.bounds);
        if (it.kind === "dapp") this.menuAbove(this.appItems(it), e.bounds);
        if (it.kind === "app") this.menuAbove(this.agentMenu(), e.bounds);
        if (it.kind === "win")
          this.menuAbove(
            [
              { label: "Show", act: { raise: it.tab } },
              { label: "Put Back in Main Window", act: { putBack: it.tab } },
            ],
            e.bounds,
          );
        if (it.kind === "trash") this.menuAbove(this.trashItems(), e.bounds);
      });
  }

  click(it) {
    // Like any Dock icon: go to the app, here the agent that needs you most (else the picker).
    if (it.kind === "app") {
      this.hover = null;
      const a = urgentAgent();
      return a ? run("agent.focus", { terminal: a.address }) : run("mod.open", { name: "picker" });
    }
    this.hover = null;
    if (it.kind === "space") run("space.select", { id: it.space.id });
    if (it.kind === "win") restoreTorn(it.tab);
    if (it.kind === "dapp") {
      const win = WIN_APPS[appName(it.app.path)];
      // Slack goes in a tab, which the main window can cover; its menu offers a window.
      if (win === "slack" && winState("slack").min) openWin("slack");
      else if (win === "slack" && !winState("slack").open) openSlackTab();
      else if (win) openWin(win);
      else exec("open", ["-a", it.app.path]).catch(() => {});
    }
    if (it.kind === "winmin") openWin(it.win);
  }

  light(x, bright) {
    const w = 18;
    const h = 8;
    return div()
      .absolute()
      .left(x + ICON_SIZE / 2 - w / 2)
      .bottom(MARGIN + 6)
      .w(w)
      .h(h)
      .child(paint(oval(w, h), bright ? "#9fd0ff70" : "#9fd0ff40", w, h))
      .child(paint(oval(6, 4, w / 2 - 3, h / 2 - 2), bright ? "#ffffff" : "#e6f2ffd0", w, h));
  }

  render(_cx) {
    const bw = this.size?.width ?? 0;
    const bh = this.size?.height ?? 96;
    const items = this.items();
    const width = items.reduce((n, it) => n + (it.kind === "sep" ? SEP : ICON_SIZE), 0) + GAP * (items.length - 1) + PAD * 2;
    const left = Math.max(0, (bw - width) / 2);
    const top = bh - MARGIN - SHELF;
    const slant = 12;

    const kids = [];
    // The shelf: frosted glass in perspective, a bright lip, a dark front face.
    const surface = window.paint_path(trapezoid(width, slant), vgrad("#ffffff40", "#cfd8e8c8"));
    kids.push(div().absolute().left(left).top(top).w(width).h(SHELF).child(surface.absolute().top(0).left(0).w(width).h(SURFACE)));
    // The glass reflects the sky: a soft band across the surface's middle.
    kids.push(div().absolute().left(left + slant / 2).top(top + 5).w(width - slant).h(5).child(paint(rrect(width - slant, 5, 2.5), "#ffffff26", width - slant, 5)));
    kids.push(div().absolute().left(left).top(top + SURFACE).w(width).h(SHELF - SURFACE).child(paint(rrect(width, SHELF - SURFACE, [0, 0, 2, 2]), vgrad("#c5ccd8f0", "#5d6474f0"), width, SHELF - SURFACE)));
    kids.push(div().absolute().left(left).top(top + SURFACE).w(width).h(1).bg("#ffffffe8"));
    kids.push(div().absolute().left(left + slant).top(top).w(width - slant * 2).h(1).bg("#ffffff70"));

    let x = left + PAD;
    for (const it of items) {
      if (it.kind === "sep") {
        // Leopard's zebra crossing on the glass.
        const sx = x + SEP / 2 - 1;
        for (let y = 2; y < SURFACE; y += 3) kids.push(div().absolute().left(sx).top(top + y).w(2).h(2).bg("#ffffffc0"));
        x += SEP + GAP;
        continue;
      }
      if (it.kind === "app") kids.push(this.light(x, false));
      const winOpen = Boolean(winState(WIN_APPS[appName(it.app?.path ?? "")] ?? "none").open);
      if (it.kind === "dapp" && (this.running.has(it.app.path) || winOpen)) kids.push(this.light(x, false));
      if (it.kind === "space" && (it.running || it.space.active)) kids.push(this.light(x, it.space.active));
      kids.push(this.icon(it, x).top(top - ICON_SIZE + 9));
      x += ICON_SIZE + GAP;
    }

    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .relative()
      .size_full()
      .font_family(FONT)
      .when(bw > 0, (el) => el.children(kids));
  }
}

/** An app without an .icns: a rounded tile with its initial. */
function plainApp(s, name) {
  return div()
    .relative()
    .w(s)
    .h(s)
    .child(paint(rrect(s - 6, s - 6, 10, 3, 3), vgrad("#f2f2f2", "#b9bfc8"), s, s))
    .child(div().absolute().top(0).left(0).size_full().flex().items_center().justify_center().font_family("Helvetica").font_weight(700).text_size(s * 0.42).text_color("#4a5160").child(String(name ?? "?").slice(0, 1).toUpperCase()));
}

/** A minimized window in the Dock: a tiny Aqua window with the body of what it holds (a
 *  terminal, a notes page or Slack), its program's or app's icon badged on it. */
function miniWindow(s, program, badge = null, kind = "terminal") {
  const w = s;
  const h = s * 0.74;
  const y = (s - h) / 2;
  const agent = Boolean(program && !program.shell && program.key !== "shell");
  const body = kind === "terminal" ? "#141414" : "#ffffff";
  const bodyH = h - 11;
  let el = div()
    .relative()
    .w(s)
    .h(s)
    .child(paint(rrect(w, h, 3, 0, y), "#00000080", s, s))
    .child(paint(rrect(w - 2, 9, [2, 2, 0, 0], 1, y + 1), vgrad("#e9e9e9", "#a6a6a6"), s, s))
    .child(paint(rrect(w - 2, bodyH, [0, 0, 2, 2], 1, y + 10), body, s, s))
    .children(["#ff6a5c", "#ffc130", "#5fcf3f"].map((c, i) => div().absolute().top(y + 3).left(4 + i * 5).w(3).h(3).rounded_full().bg(c)));
  if (kind === "terminal") el = el.child(div().absolute().top(y + 13).left(4).text_size(6).font_family("Menlo").text_color("#c8c8c8").child("$ _"));
  // A page of ruled gray lines; Slack's source list is a gray strip at the left.
  if (kind === "notes") for (let i = 0; i < 4; i++) el = el.child(div().absolute().top(y + 14 + i * 4).left(5).w(i === 3 ? 16 : w - 12).h(1).bg("#b4b4b4"));
  if (kind === "slack") {
    el = el.child(div().absolute().top(y + 10).left(1).w(11).h(bodyH).bg("#4a3a5c"));
    for (let i = 0; i < 3; i++) el = el.child(div().absolute().top(y + 14 + i * 5).left(16).w(i === 1 ? 14 : 22).h(1).bg("#b4b4b4"));
  }
  return el
    .when(agent, (e) => e.child(div().absolute().bottom(2).right(0).child(programIcon(program, s * 0.38, { small: true }))))
    .when(Boolean(badge), (e) => e.child(image(badge).absolute().bottom(2).right(0).w(s * 0.38).h(s * 0.38)))
    // No app icon to badge it with: the notes glyph, or Slack's # on its aubergine.
    .when(!badge && kind === "notes", (e) => e.child(image(ICON.note).absolute().bottom(2).right(0).w(s * 0.38).h(s * 0.38)))
    .when(!badge && kind === "slack", (e) =>
      e.child(div().absolute().bottom(2).right(0).w(s * 0.38).h(s * 0.38).rounded(4).bg("#4a154b").flex().items_center().justify_center().font_family("Helvetica").font_weight(700).text_size(s * 0.26).text_color("#ffffff").child("#")),
    );
}

/** The shelf's top surface: narrower at the back, full width at the front. */
function trapezoid(w, slant) {
  return PathBuilder.fill().move_to(slant, 0).line_to(w - slant, 0).line_to(w, SURFACE).line_to(0, SURFACE).close().build();
}
