// The Dock: Leopard's glass shelf in perspective, Herdr at the left (the
// space picker), one folder per space (engraved with its initials, badged
// with its agent's icon), the zebra separator and the Trash. A light on the
// shelf under every space that's running an agent (brighter under the shown
// one); a red count badge for agents that finished or need you, and a
// space with a blocked agent bounces until you look. Hover shows the name,
// click opens, right-click lists its tabs. Minimized torn-off windows wait
// between the separator and the Trash; click one to bring it back.
// Applications kept in the Dock ("sl.dockApps", View › Dock Applications…)
// sit beside Herdr: click opens one, right-click opens the shown space's
// folder in it (Obsidian as a vault), and a light shows the running ones.

import { div, image, PathBuilder } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run, shared, exec } from "herdr";
import {
  C, FONT, ICON, paint, rrect, oval, vgrad, programIcon, leadProgram, countBadge, openMenu, closeMenus, menuSize,
  spaceItems, shortcut, torn, tabInfo, restoreTorn, dockApps, appIcon,
} from "./kit.js";

const ICON_SIZE = 48;
const GAP = 8;
const PAD = 14;
const SHELF = 22; // top surface 16 + front 6
const SURFACE = 16;
const MARGIN = 3; // under the shelf
const SEP = 18; // the separator's slot

function initials(name) {
  const words = String(name ?? "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "~";
  if (words.length === 1) return words[0].slice(0, 2).replace(/^./, (c) => c.toUpperCase());
  return (words[0][0] + words[1][0]).toUpperCase();
}

export default class Dock {
  init(_p, cx) {
    this.size = null;
    this.hover = null;
    this.running = new Set();
    // Which kept apps are running, for their lights: a process list every few seconds.
    this.poll(cx);
    cx.timer.every(4000, (cx) => this.poll(cx));
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

  appItems(it) {
    const s = spaces().find((x) => x.active);
    const here = s && !s.machine && s.folder;
    return [
      { label: "Open", act: { launch: [it.app.path] } },
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
    for (const a of dockApps()) list.push({ kind: "dapp", id: `app-${a.path}`, label: a.name, app: a });
    for (const s of spaces()) {
      const mine = ags.filter((a) => a.space === s.id);
      list.push({
        kind: "space",
        id: s.id,
        label: s.machine ? `${s.name} (${s.machine})` : s.name,
        space: s,
        blocked: mine.some((a) => a.status === "blocked"),
        count: mine.filter((a) => a.status === "blocked" || a.status === "done").length,
        running: mine.length > 0,
        program: leadProgram(s.id),
      });
    }
    list.push({ kind: "sep", id: "sep" });
    const out = torn();
    for (const [id, w] of Object.entries(out)) {
      const info = w.min ? tabInfo(id) : null;
      if (!info) continue;
      list.push({ kind: "win", id: `win-${id}`, tab: id, label: `${info.space.name} — ${info.tab.named ? info.tab.name : `Tab ${info.tab.name}`}`, program: leadProgram(info.space.id, id) });
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
      { label: tab ? `Close Tab “${tab.name}”…` : "Close Tab…", shortcut: shortcut("tab.close"), disabled: !tab, act: { sheet: ["closetab", { tab: tab?.id }] } },
      { label: s ? `Close Space “${s.name}”…` : "Close Space…", disabled: !s, act: { sheet: ["closespace", { space: s?.id }] } },
    ];
  }

  art(it) {
    const s = ICON_SIZE;
    if (it.kind === "app") return image(ICON.herdr).w(s).h(s);
    if (it.kind === "trash") return image(ICON.trash).w(s).h(s);
    if (it.kind === "win") return miniWindow(s, it.program);
    if (it.kind === "dapp") return it.app.icon ? image(appIcon(it.app.path)).w(s).h(s) : plainApp(s, it.label);
    const sp = it.space;
    const agent = it.program && !it.program.shell && it.program.key !== "shell";
    // The folder, its initials engraved on the front like Applications' "A".
    return div()
      .relative()
      .w(s)
      .h(s)
      .child(image(sp.machine ? ICON.folderNet : ICON.folder).absolute().top(0).left(0).w(s).h(s))
      .child(
        div()
          .absolute()
          .top(s * 0.44)
          .left(0)
          .w(s)
          .h(s * 0.36)
          .flex()
          .items_center()
          .justify_center()
          .child(
            div()
              .relative()
              .font_family("Helvetica")
              .font_weight(700)
              .text_size(s * 0.3)
              .child(div().absolute().top(1).left(0).text_color("#ffffffc8").child(initials(sp.name)))
              .child(div().relative().text_color(sp.machine ? "#46536a" : "#1f5296").child(initials(sp.name))),
          ),
      )
      .when(agent, (el) => el.child(div().absolute().bottom(-1).right(-3).child(programIcon(it.program, s * 0.42, { small: true }))));
  }

  icon(it, x) {
    const hov = this.hover === it.id;
    const label = it.label;
    const lw = Math.ceil(24 + label.length * 7.4);
    let face = div().relative().w(ICON_SIZE).h(ICON_SIZE).child(this.art(it));
    if (it.count) face = face.child(div().absolute().top(-6).right(-8).child(countBadge(it.count, 21)));
    let lift = div().absolute().left(0).w(ICON_SIZE).h(ICON_SIZE).top(0).child(face);
    if (it.blocked && !it.space?.active) lift = lift.loop("top", { from: 0, to: -16, period: 760 });
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
      .on_mouse_down("left", (e) => {
        if (it.kind === "trash") this.menuAbove(this.trashItems(), e.bounds);
      })
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        if (it.kind === "space") this.menuAbove(spaceItems(it.space), e.bounds);
        if (it.kind === "dapp") this.menuAbove(this.appItems(it), e.bounds);
        if (it.kind === "app") this.menuAbove([{ label: "Dock Applications…", act: { sheet: ["dockapps", {}] } }], e.bounds);
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
    if (it.kind === "app") return run("mod.open", { name: "picker" });
    if (it.kind === "space") run("space.select", { id: it.space.id });
    if (it.kind === "win") restoreTorn(it.tab);
    if (it.kind === "dapp") exec("open", ["-a", it.app.path]).catch(() => {});
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
      if (it.kind === "dapp" && this.running.has(it.app.path)) kids.push(this.light(x, false));
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

/** A minimized window in the Dock: a tiny Aqua window, its program's icon badged on it. */
function miniWindow(s, program) {
  const w = s;
  const h = s * 0.74;
  const y = (s - h) / 2;
  const agent = program && !program.shell && program.key !== "shell";
  return div()
    .relative()
    .w(s)
    .h(s)
    .child(paint(rrect(w, h, 3, 0, y), "#00000080", s, s))
    .child(paint(rrect(w - 2, 9, [2, 2, 0, 0], 1, y + 1), vgrad("#e9e9e9", "#a6a6a6"), s, s))
    .child(paint(rrect(w - 2, h - 11, [0, 0, 2, 2], 1, y + 10), "#141414", s, s))
    .children(["#ff6a5c", "#ffc130", "#5fcf3f"].map((c, i) => div().absolute().top(y + 3).left(4 + i * 5).w(3).h(3).rounded_full().bg(c)))
    .child(div().absolute().top(y + 13).left(4).text_size(6).font_family("Menlo").text_color("#c8c8c8").child("$ _"))
    .when(agent, (el) => el.child(div().absolute().bottom(-1).right(-3).child(programIcon(program, s * 0.42, { small: true }))));
}

/** The shelf's top surface: narrower at the back, full width at the front. */
function trapezoid(w, slant) {
  return PathBuilder.fill().move_to(slant, 0).line_to(w - slant, 0).line_to(w, SURFACE).line_to(0, SURFACE).close().build();
}
