// A torn-off window's title bar: a tab that left the main window lives in its
// own Aqua window (an overlay window over its terminals; see kit.js). Red
// puts the tab back in the main window, yellow minimizes it to the Dock,
// green zooms it. Drag the title to move it (Herdr moves overlay windows by
// any press the mod doesn't stop); double-click zooms. Key while one of its
// terminals has the keyboard.

import { div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, panes, focused, closeOverlay, window as appWindow } from "herdr";
import { C, GLYPH, ICON, paint, rrect, vgrad, embossed, bead, closeMenus, torn, tabInfo, putBack, minimizeTorn, zoomTorn } from "./kit.js";

export default class AquaWindow {
  init() {
    this.size = null;
    this.lit = false;
    this.closing = false;
  }

  render(_cx) {
    const p = props() ?? {};
    const id = p.tab;
    const info = tabInfo(id);
    // Put back from elsewhere (Window › Merge All Windows) or its tab is gone: close.
    if ((!torn()[id] || !info) && !this.closing) {
      this.closing = true;
      closeOverlay(p.overlay);
    }
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 22;
    const live = appWindow()?.active !== false && Boolean(info?.terminals.includes(focused()?.terminal));
    const on = live || this.lit;
    const pane = panes().find((x) => x.tab === id && x.terminal === (info?.terminals.includes(focused()?.terminal) ? focused().terminal : info?.terminals[0]));
    const who = pane?.program && !pane.program.shell ? pane.program.name : null;
    const title = info ? `${info.space.name} — ${info.tab.named ? info.tab.name : who ?? `Tab ${info.tab.name}`}` : "";
    const lights = [
      ["close", GLYPH.close, "Put Back in Main Window", () => putBack(id, p.overlay)],
      ["min", GLYPH.minus, "Minimize to the Dock", () => minimizeTorn(id, p.overlay)],
      ["zoom", GLYPH.plus, "Zoom", () => zoomTorn(id)],
    ];
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .on_mouse_down("left", (e) => {
        closeMenus();
        if (e.click_count >= 2) zoomTorn(id);
      })
      .relative()
      .size_full()
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, [5, 5, 0, 0]), live ? vgrad(C.titleTop, C.titleBot) : vgrad(C.titleTopOff, C.titleBotOff), w, h))
          .child(paint(rrect(w - 2, 1, 0, 1, 1), "#ffffffb0", w, h))
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
            lights.map(([kind, glyph, tip, act]) =>
              div()
                .id(`al-${kind}`)
                .flex_none()
                .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
                .tooltip(tip)
                .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                .on_click(act),
            ),
          ),
      );
  }
}
