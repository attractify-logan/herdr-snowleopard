// Terminal's tab bar: equal tabs on a recessed graphite strip, the shown tab
// lifted to the toolbar's gray. Each tab: a close button on hover (left), its
// agent mark, its name, its ⌘ number. + at the end; a double-click on the
// strip makes a tab; right-click a tab for its menu. Drag a tab down out of
// the strip to tear it off into its own window.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run } from "herdr";
import { C, FONT, GLYPH, key, fillGrad, embossed, statusMark, openMenu, closeMenus, shortcut, tabClose, torn, canTear, startTear } from "./kit.js";

export default class Tabs {
  init() {
    this.hover = null;
    this.hotClose = false;
  }

  menu(s, t, e) {
    closeMenus();
    const sc = shortcut;
    const items = [
      { label: "Rename Tab…", shortcut: t.active ? sc("tab.rename") : "", act: { run: ["tab.rename", { id: t.id }] } },
      { label: "Move Tab Left", disabled: t.index <= 1, act: { run: ["tab.move", { id: t.id, index: t.index - 1 }] } },
      { label: "Move Tab Right", disabled: t.index >= s.tabs.length, act: { run: ["tab.move", { id: t.id, index: t.index + 1 }] } },
      { sep: true },
      { label: "New Tab", shortcut: sc("tab.new"), act: { run: ["tab.new", { space: s.id }] } },
      { label: "Move Tab to New Window", disabled: !canTear(t.id), act: { tearOff: t.id } },
      { sep: true },
      { label: "Close Tab…", act: { sheet: ["closetab", { tab: t.id }] } },
    ];
    openMenu(items, { x: e.position.x, y: e.position.y }, { owner: `tab-${t.id}` });
  }

  render(_cx) {
    const live = key();
    const s = spaces().find((x) => x.active);
    const out = torn();
    const tabs = (s?.tabs ?? []).filter((t) => !out[t.id] && (!t.settled || t.active));
    const edge = live ? "#7e7e7e" : "#acacac";
    const tab = (t, i) => {
      const on = t.active;
      const hov = this.hover === t.id;
      const sc = t.index <= 9 ? shortcut(`tab.select:${t.index}`) : "";
      return h_flex()
        .id(`tab-${t.id}`)
        .relative()
        .flex_1()
        .min_w(60)
        .h_full()
        .px(8)
        .gap(5)
        .items_center()
        .when(on, (el) => el.child(fillGrad(live ? "#cbcbcb" : "#e9e9e9", live ? "#bdbdbd" : "#dedede")).child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? "#a9a9a9" : "#d0d0d0")))
        .when(!on, (el) => el.child(div().absolute().top(0).left(0).w_full().h(2).bg("#00000014")))
        .when(i > 0, (el) => el.child(div().absolute().top(0).left(0).w(1).h_full().bg(edge)))
        .child(
          div()
            .relative()
            .flex_none()
            .w(14)
            .h(14)
            .when(hov, (el) =>
              el.child(
                div()
                  .id(`tx-${t.id}`)
                  .child(tabClose(13, this.hotClose))
                  .on_hover((h, cx) => {
                    this.hotClose = h;
                    cx.notify();
                  })
                  .tooltip("Close Tab")
                  .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                  .on_click(() => run("tab.close", { id: t.id })),
              ),
            )
            .when(!hov, (el) => el.child(statusMark(t.status))),
        )
        .child(
          h_flex()
            .relative()
            .flex_1()
            .min_w(0)
            .justify_center()
            .child(embossed(t.name, { size: 11, color: live ? (on ? "#000000" : "#2e2e2e") : "#6e6e6e", truncate: true, bold: on && t.status === "blocked" })),
        )
        .child(div().relative().flex_none().w(26).text_size(10).text_color(live ? "#5b5b5b" : "#9a9a9a").child(sc))
        .on_hover((h, cx) => {
          this.hover = h ? t.id : this.hover === t.id ? null : this.hover;
          cx.notify();
        })
        // Select on press, as Terminal does; then watch for a drag down and out.
        .on_mouse_down("left", (e) => {
          if (e.click_count >= 2) return;
          run("tab.select", { id: t.id });
          if (canTear(t.id)) startTear(t.id, e);
        })
        .on_mouse_down("right", (e, cx) => {
          cx.stop_propagation();
          this.menu(s, t, e);
        });
    };
    return h_flex()
      .id("tabs")
      .relative()
      .size_full()
      .font_family(FONT)
      .child(fillGrad(live ? "#a3a3a3" : "#dcdcdc", live ? "#b4b4b4" : "#e6e6e6"))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(edge))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(edge))
      .child(h_flex().relative().flex_1().min_w(0).h_full().children(tabs.map(tab)))
      .child(
        div()
          .id("tab-add")
          .relative()
          .flex_none()
          .w(28)
          .h_full()
          .flex()
          .items_center()
          .justify_center()
          .child(div().absolute().top(0).left(0).w(1).h_full().bg(edge))
          .child(svg(GLYPH.plus).w(11).h(11).text_color(live ? "#3a3a3a" : "#9a9a9a"))
          .active((st) => st.bg("#00000020"))
          .tooltip("New Tab")
          .on_click(() => run("tab.new", {})),
      )
      .on_click((e) => {
        if (e.click_count >= 2) run("tab.new", {});
      });
  }
}
