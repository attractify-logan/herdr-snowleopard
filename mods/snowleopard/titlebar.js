// The window's unified title bar and toolbar: the glossy traffic lights
// (close, minimize and zoom the Herdr window), the title with its proxy
// icon, and a Finder-style toolbar: back/forward through tabs, the view
// controls (sidebar, splits, zoom), the action gear, New, and the search
// field (the command palette). The layout hides macOS's own buttons
// (traffic_lights off the window) so these can stand in for them.

import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, focused, panes, run, knownAgents, shared, window as appWindow } from "herdr";
import {
  C, GLYPH, ICON, key, paint, rrect, vgrad, embossed, bead, textured, openMenu, closeMenus, shortcut, shown,
  startDrag, toggleZoom, reportSize, remoteSpaceItems, tabLabel, fullScreen, toggleFullScreen, followNativeFullScreen,
} from "./kit.js";

const TITLE = 22;

export default class TitleBar {
  init(_p, cx) {
    this.size = null;
    this.lit = false;
    this.agentsToRun = [];
    cx.spawn(async (cx) => {
      try {
        this.agentsToRun = (await knownAgents()).filter((a) => a.installed).slice(0, 8);
      } catch {}
      cx.notify();
    });
  }

  lights() {
    const on = key() || this.lit;
    const kinds = [
      ["close", "window.close", GLYPH.close],
      ["min", "window.minimize", GLYPH.minus],
      ["zoom", null, GLYPH.plus],
    ];
    return h_flex()
      .id("lights")
      .flex_none()
      .gap(7)
      .items_center()
      .on_hover((h, cx) => {
        this.lit = h;
        cx.notify();
      })
      .children(
        kinds.map(([kind, command, glyph]) =>
          div()
            .id(`tl-${kind}`)
            .flex_none()
            .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            // Green in full screen: out of it, as Lion's window does.
            .on_click(() => (command ? run(command) : fullScreen() ? toggleFullScreen() : toggleZoom(this.size?.width))),
        ),
      );
  }

  newItems() {
    const sc = shortcut;
    const rows = this.agentsToRun.map((a) => ({ label: a.name, icon: a.icon && !a.tint ? a.icon : null, act: { run: ["tab.new", { argv: a.run }] } }));
    return [
      { label: "New Tab", shortcut: sc("tab.new"), act: { run: ["tab.new", {}] } },
      { label: "New Space", shortcut: sc("space.new"), act: { run: ["space.new", {}] } },
      { label: "New Space in Folder…", act: { newSpaceIn: true } },
      ...remoteSpaceItems(),
      ...(rows.length ? [{ sep: true }, { label: "New Tab with Agent", header: true }, ...rows] : []),
    ];
  }

  actionItems() {
    const sc = shortcut;
    const s = spaces().find((x) => x.active);
    const tab = s?.tabs.find((t) => t.active);
    const pane = focused()?.pane;
    return [
      { label: "Rename Tab…", shortcut: sc("tab.rename"), disabled: !tab, act: { sheet: ["rename", { what: "tab", id: tab?.id }] } },
      { label: "Rename Space…", shortcut: sc("space.rename"), disabled: !s, act: { sheet: ["rename", { what: "space", id: s?.id }] } },
      { sep: true },
      { label: "Split Pane Right", shortcut: sc("pane.split:right"), disabled: !pane, act: { run: ["pane.split", { direction: "right" }] } },
      { label: "Split Pane Down", shortcut: sc("pane.split:down"), disabled: !pane, act: { run: ["pane.split", { direction: "down" }] } },
      { label: "Zoom Pane", shortcut: sc("pane.zoom"), disabled: !pane, act: { run: ["pane.zoom", {}] } },
      { sep: true },
      { label: "Close Pane", shortcut: sc("pane.close"), disabled: !pane, act: { run: ["pane.close", {}] } },
      { label: "Close Tab…", disabled: !tab, act: { sheet: ["closetab", { tab: tab?.id }] } },
      { label: "Close Space…", disabled: !s, act: { sheet: ["closespace", { space: s?.id }] } },
      ...(s && !s.machine && s.folder ? [{ sep: true }, { label: "Show in Finder", act: { open: s.folder } }] : []),
    ];
  }

  popup(items, e, owner) {
    const m = closeMenus();
    const b = e.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height + 2 } : undefined, { owner });
  }

  render(_cx) {
    // A resize drag holds the window's size report until it's over (see desk.js).
    if (this.size && !shared("sl.dragging")) reportSize("window", this.size);
    followNativeFullScreen();
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 58;
    const live = key();
    const s = spaces().find((x) => x.active);
    const tab = s?.tabs.find((t) => t.active);
    const pane = panes().find((p) => p.pane === focused()?.pane);
    const tabWord = tab ? tabLabel(s.id, tab) : "";
    const title = s ? `${s.name}${tabWord ? ` — ${tabWord}` : ""}` : "Herdr";
    const zoomed = Boolean(pane?.zoomed);

    const toolbar = h_flex()
      .relative()
      .h(h - TITLE)
      .w_full()
      .px(8)
      .pb(3)
      .gap(10)
      .items_center()
      .child(
        textured([
          { id: "tb-back", glyph: GLYPH.left, size: 12, w: 30, tooltip: "Previous tab", onClick: () => run("tab.prev") },
          { id: "tb-fwd", glyph: GLYPH.right, size: 12, w: 30, tooltip: "Next tab", onClick: () => run("tab.next") },
        ]),
      )
      .child(
        textured([
          { id: "tb-side", glyph: GLYPH.sidebar, on: shown("sidebar"), w: 34, tooltip: "Show or hide the sidebar", onClick: () => run("layout.toggle", { id: "sidebar" }) },
          { id: "tb-right", glyph: GLYPH.splitRight, w: 34, tooltip: "Split right", onClick: () => run("pane.split", { direction: "right" }) },
          { id: "tb-down", glyph: GLYPH.splitDown, w: 34, tooltip: "Split down", onClick: () => run("pane.split", { direction: "down" }) },
          { id: "tb-zoom", glyph: GLYPH.zoom, on: zoomed, w: 34, tooltip: "Zoom the pane", onClick: () => run("pane.zoom", {}) },
        ]),
      )
      .child(textured([{ id: "tb-gear", glyph: GLYPH.gear, menu: true, w: 44, tooltip: "Action", onDown: (e) => this.popup(this.actionItems(), e, "gear") }]))
      .child(textured([{ id: "tb-new", glyph: GLYPH.plus, size: 12, menu: true, w: 44, tooltip: "New tab, space or agent", onDown: (e) => this.popup(this.newItems(), e, "new") }]))
      .child(div().flex_1())
      .child(w > 0 && w < 720 ? textured([{ id: "tb-search", glyph: GLYPH.search, size: 13, w: 30, tooltip: "Search every Herdr command", onClick: () => run("app.palette") }]) : this.search(live));

    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        if (!shared("sl.dragging")) reportSize("window", size);
        cx.notify();
      })
      // Drag the title bar (or the toolbar's bare parts) to move the window; double-click zooms it.
      .on_mouse_down("left", (e, cx) => {
        closeMenus();
        if (e.click_count >= 2) toggleZoom(this.size?.width);
        else startDrag("move", e, this.size?.width);
        cx.stop_propagation();
      })
      .relative()
      .size_full()
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, [5, 5, 0, 0]), live ? vgrad(C.titleTop, C.titleBot) : vgrad(C.titleTopOff, C.titleBotOff), w, h))
          .child(paint(rrect(w - 12, 1, 0, 6, 1), "#ffffffb0", w, h))
          .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? C.titleLine : C.titleLineOff)),
      )
      .child(
        div()
          .absolute()
          .top(0)
          .left(0)
          .w_full()
          .h(TITLE)
          .flex()
          .items_center()
          .justify_center()
          .px(80)
          .child(
            h_flex()
              .min_w(0)
              .gap(5)
              .items_center()
              .child(image(s?.machine ? ICON.folderNet : ICON.folder).flex_none().w(16).h(16).opacity(live ? 1 : 0.6))
              .child(embossed(title, { size: 13, color: live ? "#000000" : "#4d4d4d", truncate: true })),
          ),
      )
      .child(div().absolute().top(4).left(8).child(this.lights()))
      // Lion's full-screen arrows, at the title bar's right end.
      .child(
        div()
          .id("tb-fullscreen")
          .absolute()
          .top(4)
          .right(9)
          .child(svg(GLYPH.fullScreen).w(13).h(13).text_color(live ? "#3d3d3d" : "#8c8c8c"))
          .tooltip(fullScreen() ? "Exit Full Screen" : "Enter Full Screen")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => toggleFullScreen()),
      )
      .child(div().absolute().top(TITLE).left(0).w_full().child(toolbar));
  }

  search(live) {
    const w = 190;
    const h = 22;
    return div()
      .id("search")
      .relative()
      .flex_none()
      .w(w)
      .h(h + 1)
      .child(paint(rrect(w, h, h / 2, 0, 1), "#ffffff60", w, h + 1))
      .child(paint(rrect(w, h, h / 2), live ? "#6d6d6d" : "#a0a0a0", w, h))
      .child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), vgrad("#e4e4e4", "#ffffff"), w, h))
      .child(paint(rrect(w - 2, h - 4, (h - 4) / 2, 1, 3), "#ffffff", w, h))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .w(w)
          .h(h)
          .px(8)
          .gap(4)
          .items_center()
          .child(svg(GLYPH.search).w(12).h(12).text_color("#5a5a5a"))
          .child(svg(GLYPH.down).w(6).h(4).text_color("#5a5a5a"))
          .child(div().pl(2).text_size(12).text_color("#9a9a9a").child("Search commands"))
          .child(div().flex_1())
          .child(div().text_size(11).text_color("#b0b0b0").child(shortcut("app.palette"))),
      )
      .tooltip("Search every Herdr command")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("app.palette"));
  }
}
