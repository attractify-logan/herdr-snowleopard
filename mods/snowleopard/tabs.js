// Terminal's tab bar: equal tabs on a recessed graphite strip, the shown tab
// lifted to the toolbar's gray. Each tab: a close button on hover (left), its
// name with its agent mark, its ⌘ number. + at the end; a double-click on the
// strip makes a tab, on a tab renames it; right-click a tab for its menu. Drag
// a tab down out of the strip to tear it off into its own window. Tabs that
// don't fit at 90 pt go into a » menu before the +.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, run } from "herdr";
import { C, FONT, GLYPH, key, fillGrad, embossed, statusMark, openMenu, closeMenus, shortcut, tabClose, torn, canTear, startTear, tabLabel, STATUS_WORD, askCloseTab, newTab, openSheet, raiseTorn } from "./kit.js";

export default class Tabs {
  init() {
    this.hover = null;
    this.hotClose = false;
    this.size = null;
    this.moving = false;
  }

  // The tabs that didn't fit, as a menu under the » button.
  overflow(s, hidden, e) {
    closeMenus();
    const items = hidden.map((t) => ({ label: tabLabel(s.id, t), detail: STATUS_WORD[t.status] ?? "", act: { run: ["tab.select", { id: t.id }] } }));
    const b = e.bounds;
    openMenu(items, b ? { x: b.x, y: b.y + b.height + 2 } : { x: e.position.x, y: e.position.y }, { owner: "tab-overflow" });
  }

  menu(s, t, e) {
    closeMenus();
    const sc = shortcut;
    const items = [
      { label: "Rename Tab…", shortcut: t.active ? sc("tab.rename") : "", act: { sheet: ["rename", { what: "tab", id: t.id }] } },
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

  render(cx) {
    const live = key();
    const s = spaces().find((x) => x.active);
    const out = torn();
    const tabs = (s?.tabs ?? []).filter((t) => !out[t.id] && (!t.settled || t.active));
    // The shown tab is in its own window (something selected it, e.g. "go to the agent
    // that needs you"): bring that window forward, and show the nearest tab still in
    // this window instead of a second copy of that terminal.
    const lost = s?.tabs.find((t) => t.active && out[t.id]);
    if (lost && tabs.length && !this.moving) {
      this.moving = true;
      const next = tabs.find((t) => t.index > lost.index) ?? tabs[tabs.length - 1];
      cx.timer.after(0, () => {
        this.moving = false;
        raiseTorn(lost.id);
        run("tab.select", { id: next.id });
      });
    }
    const edge = live ? "#7e7e7e" : "#acacac";
    // Tabs keep at least 90 pt; the rest wait in the » menu (the shown tab never does).
    const W = this.size?.width ?? 0;
    let room = W > 0 ? Math.max(1, Math.floor((W - 28) / 90)) : tabs.length;
    if (tabs.length > room) room = Math.max(1, Math.floor((W - 28 - 24) / 90));
    let shownTabs = tabs;
    let hidden = [];
    if (tabs.length > room) {
      shownTabs = tabs.slice(0, room);
      const on = tabs.find((t) => t.active);
      if (on && !shownTabs.includes(on)) shownTabs[room - 1] = on;
      hidden = tabs.filter((t) => !shownTabs.includes(t));
    }
    const each = W > 0 ? (W - 28 - (hidden.length ? 24 : 0)) / Math.max(1, shownTabs.length) : 200;
    const tab = (t, i) => {
      const on = t.active;
      const hov = this.hover === t.id;
      const label = tabLabel(s.id, t);
      // The ⌘ number only where there's room for it (and only tabs 1-9 have one).
      const sc = t.index <= 9 && each >= 120 ? shortcut(`tab.select:${t.index}`) : "";
      const mark = t.status === "working" || t.status === "blocked" || t.status === "done";
      return h_flex()
        .id(`tab-${t.id}`)
        .relative()
        .flex_1()
        .min_w(90)
        .h_full()
        .items_center()
        .when(on, (el) => el.child(fillGrad(live ? "#cbcbcb" : "#e9e9e9", live ? "#bdbdbd" : "#dedede")).child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? "#a9a9a9" : "#d0d0d0")))
        .when(!on, (el) => el.child(div().absolute().top(0).left(0).w_full().h(2).bg("#00000014")))
        .when(i > 0, (el) => el.child(div().absolute().top(0).left(0).w(1).h_full().bg(edge)))
        .child(
          h_flex()
            .relative()
            .flex_1()
            .min_w(0)
            .px(16)
            .gap(4)
            .items_center()
            .justify_center()
            .when(mark, (el) => el.child(statusMark(t.status)))
            .child(embossed(label, { size: 11, color: live ? (on ? "#000000" : "#2e2e2e") : "#6e6e6e", truncate: true, bold: on && t.status === "blocked" })),
        )
        .when(hov, (el) =>
          el.child(
            div()
              .id(`tx-${t.id}`)
              .absolute()
              .top(5)
              .left(8)
              .w(14)
              .h(14)
              .child(tabClose(13, this.hotClose))
              .on_hover((h, cx) => {
                this.hotClose = h;
                cx.notify();
              })
              .tooltip("Close Tab")
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click(() => askCloseTab(t.id)),
          ),
        )
        .when(sc !== "", (el) => el.child(div().absolute().top(0).right(8).h_full().flex().items_center().text_size(10).text_color(live ? "#5b5b5b" : "#9a9a9a").child(sc)))
        .tooltip(label)
        .on_hover((h, cx) => {
          this.hover = h ? t.id : this.hover === t.id ? null : this.hover;
          cx.notify();
        })
        // Select on press, as Terminal does; then watch for a drag down and out.
        // A double-click renames. Stopping the press keeps the strip from also making a tab.
        .on_mouse_down("left", (e, cx) => {
          cx.stop_propagation();
          if (e.click_count >= 2) return openSheet("rename", { what: "tab", id: t.id, key: "sl-rename" });
          run("tab.select", { id: t.id });
          if (canTear(t.id)) startTear(t.id, e, label);
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
      .on_size_change((size, cx) => {
        if (this.size?.width !== size.width) {
          this.size = size;
          cx.notify();
        }
      })
      .child(fillGrad(live ? "#a3a3a3" : "#dcdcdc", live ? "#b4b4b4" : "#e6e6e6"))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(edge))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(edge))
      .child(h_flex().relative().flex_1().min_w(0).h_full().children(shownTabs.map(tab)))
      .when(hidden.length > 0, (el) =>
        el.child(
          div()
            .id("tab-more")
            .relative()
            .flex_none()
            .w(24)
            .h_full()
            .flex()
            .items_center()
            .justify_center()
            .child(div().absolute().top(0).left(0).w(1).h_full().bg(edge))
            .child(div().text_size(13).font_weight(700).text_color(live ? "#3a3a3a" : "#9a9a9a").child("»"))
            .active((st) => st.bg("#00000020"))
            .tooltip(`${hidden.length} more tab${hidden.length === 1 ? "" : "s"}`)
            .on_mouse_down("left", (e, cx) => {
              cx.stop_propagation();
              this.overflow(s, hidden, e);
            }),
        ),
      )
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
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => newTab({})),
      )
      .on_click((e) => {
        if (e.click_count >= 2) newTab({});
      });
  }
}
