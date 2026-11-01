// A torn-off window's title bar and bottom edge (props.part "bar"): a tab that
// left the main window lives in its own Aqua window (an overlay window over its
// terminals; see kit.js). Red closes it, as a Mac window does: the tab and its
// terminals end, after the alert. Yellow minimizes it to the Dock, green zooms
// it; right-click the title to move the tab back to the main window. The
// bottom edge's grip resizes it. Drag the title to move it (Herdr moves overlay windows by
// any press the mod doesn't stop); double-click zooms. Looks key while Herdr
// is in front (see key() in kit.js).

import { div, image, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, panes, closeOverlay, run } from "herdr";
import {
  C, GLYPH, ICON, WIN, key, paint, rrect, vgrad, embossed, bead, closeMenus, openMenu, openSheet, torn, tabInfo, putBack, minimizeTorn, zoomTorn,
  placeTorn, startTornResize, appSize,
} from "./kit.js";

export default class AquaWindow {
  // The bottom edge: Terminal's window frame below the terminals, with the
  // resize grip in the corner. A press elsewhere on it moves the window.
  bar(p) {
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? WIN.bar;
    const live = key();
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .relative()
      .size_full()
      .when(w > 0, (el) => el.child(paint(rrect(w, h, [0, 0, 5, 5]), live ? vgrad("#c9c9c9", "#a9a9a9") : vgrad("#e9e9e9", "#d6d6d6"), w, h)))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#6a6a6a" : "#a5a5a5"))
      .child(
        div()
          .id("grip")
          .absolute()
          .bottom(0)
          .right(0)
          .w(16)
          .h(h)
          .flex()
          .items_end()
          .justify_end()
          .p(2)
          .cursor_nwse_resize()
          .child(svg(GLYPH.grip).w(10).h(10).text_color("#000000"))
          .tooltip("Drag to resize the window")
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            const t = torn()[p.tab];
            const b = e.bounds;
            if (!t || !b) return;
            // The grip sits in the window's bottom right corner: that and the size give its
            // frame. The bar is as wide as the window; a zoomed one's height is a share of the app.
            const a = appSize();
            const fw = Math.round(this.size?.width ?? t.w ?? WIN.w);
            const fh = t.big && a ? Math.round(a.h * WIN.bigH) : t.h ?? WIN.h;
            const right = b.x + b.width;
            const bottom = b.y + b.height;
            startTornResize(p.tab, e, { x: Math.round(right - fw), y: Math.round(bottom - fh), w: fw, h: fh });
          }),
      );
  }

  init() {
    this.size = null;
    this.lit = false;
    this.closing = false;
  }

  render(cx) {
    const p = props() ?? {};
    if (p.part === "bar") return this.bar(p);
    const id = p.tab;
    const info = tabInfo(id);
    // Put back from elsewhere (Window › Merge All Windows): close. Not when the tab
    // can't be found: the lists are empty for a moment while Herdr starts or quits,
    // and closing then would stop it coming back; Herdr closes it when its terminal ends.
    // The zoomed and standard windows have their own keys: whichever doesn't match
    // the state (after a zoom, an un-zoom or a resize from either) closes itself.
    // A minimized one is closed too (the Dock reopens the right one).
    if ((!torn()[id] || torn()[id].min || Boolean(torn()[id].big) !== Boolean(p.big)) && !this.closing) {
      this.closing = true;
      closeOverlay(p.overlay);
    }
    // Herdr brings a settled tab back to the lists when its agent needs you; while it
    // has its own window, put it away again, or the main window shows the same
    // terminal too (one terminal drawn at two sizes garbles both).
    if (info && !info.tab.settled && torn()[id] && !torn()[id].min && !this.resettling) {
      this.resettling = true;
      cx.timer.after(0, () => {
        this.resettling = false;
        if (torn()[id] && !torn()[id].min) run("tab.settle", { id });
      });
    }
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 22;
    const live = key();
    const on = live || this.lit;
    const pane = panes().find((x) => x.tab === id && x.terminal === info?.terminals[0]);
    const who = pane?.program && !pane.program.shell ? pane.program.name : null;
    const title = info ? `${info.space.name} — ${info.tab.named ? info.tab.name : who ?? `Tab ${info.tab.name}`}` : "";
    // Only the standard-size window's spot is kept; zoomed ones open centered.
    const place = (b, dx, dy) => b && !torn()[id]?.big && placeTorn(id, { x: Math.round(b.x - dx), y: Math.round(b.y - dy) });
    const lights = [
      ["close", GLYPH.close, "Close Tab…", () => openSheet("closetab", { tab: id })],
      ["min", GLYPH.minus, "Minimize to the Dock", () => minimizeTorn(id, p.overlay)],
      ["zoom", GLYPH.plus, "Zoom", () => zoomTorn(id, p.overlay)],
    ];
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      // Herdr moves the window while the button is down and keeps the release,
      // so where it is gets noted on the next press (here or on a light), before
      // anything reopens it.
      .on_mouse_down("left", (e) => {
        closeMenus();
        place(e.bounds, 0, 0);
        if (e.click_count >= 2) zoomTorn(id, p.overlay);
      })
      .on_mouse_down("right", (e, cx) => {
        cx.stop_propagation();
        closeMenus();
        openMenu(
          [
            { label: "Move Tab to Main Window", act: { putBack: id } },
            { sep: true },
            { label: "Close Tab…", act: { sheet: ["closetab", { tab: id }] } },
          ],
          { x: e.position.x, y: e.position.y },
          { owner: `aqua-${id}` },
        );
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
          .size_full()
          .flex()
          .items_center()
          .justify_center()
          .px(70)
          .child(
            h_flex()
              .min_w(0)
              .gap(5)
              .items_center()
              .child(image(info?.space.machine ? ICON.folderNet : ICON.folder).flex_none().w(16).h(16).opacity(live ? 1 : 0.6))
              .child(embossed(title, { size: 13, color: live ? "#000000" : "#4d4d4d", truncate: true })),
          ),
      )
      .child(
        h_flex()
          .id("lights")
          .absolute()
          .top(4)
          .left(8)
          .gap(7)
          .items_center()
          .on_hover((hv, cx) => {
            this.lit = hv;
            cx.notify();
          })
          .children(
            lights.map(([kind, glyph, tip, act], i) =>
              div()
                .id(`al-${kind}`)
                .flex_none()
                .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
                .tooltip(tip)
                .on_mouse_down("left", (e, cx) => {
                  place(e.bounds, 8 + i * 21, 4);
                  cx.stop_propagation();
                })
                .on_click(act),
            ),
          ),
      );
  }
}
