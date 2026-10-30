// A Snow Leopard menu: translucent white, rounded bottom corners (all four
// when it pops up away from the menu bar), Lucida Grande 14, the blue
// gradient selection, checkmarks on the left and shortcuts on the right.
// props { items, owner, attached }.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, shared, setShared } from "herdr";
import { C, FONT, MENU, GLYPH, paint, rrect, vgrad, perform } from "./kit.js";

export default class Menu {
  init(_p, cx) {
    this.at = -1;
    this.size = null;
    this.focus = cx.focus_handle();
    this.focus.focus();
  }

  items() {
    return props()?.items ?? [];
  }

  pickable(it) {
    return it && !it.sep && !it.header && !it.disabled;
  }

  done() {
    const p = props() ?? {};
    const m = shared("sl.menu");
    if (m?.id === p.overlay) setShared("sl.menu", { owner: null, id: null, closed: m.owner, at: Date.now() });
    closeOverlay(p.overlay);
  }

  choose(it) {
    if (!this.pickable(it)) return;
    this.done();
    perform(it.act);
  }

  move(d) {
    const items = this.items();
    let i = this.at;
    for (let n = 0; n < items.length; n++) {
      i = (i + d + items.length) % items.length;
      if (this.pickable(items[i])) break;
    }
    this.at = i;
  }

  key(e, cx) {
    switch (e.key) {
      case "down":
        this.move(1);
        break;
      case "up":
        this.move(-1);
        break;
      case "enter":
      case "space":
        this.choose(this.items()[this.at]);
        break;
      case "escape":
        this.done();
        break;
      default: {
        // Type-select: the first item starting with the letter.
        const ch = (e.key_char ?? e.key ?? "").toLowerCase();
        if (ch.length !== 1) return;
        const i = this.items().findIndex((it) => this.pickable(it) && (it.label ?? "").toLowerCase().startsWith(ch));
        if (i >= 0) this.at = i;
      }
    }
    cx.stop_propagation();
    cx.notify();
  }

  row(it, i) {
    if (it.sep) return div().flex_none().h(MENU.sep).flex().items_center().child(div().w_full().h(1).bg(C.sepLine));
    if (it.header)
      return h_flex()
        .flex_none()
        .h(MENU.header)
        .pl(10)
        .items_center()
        .text_color(C.disabled)
        .text_size(13)
        .child(it.label);
    const on = i === this.at && !it.disabled;
    const fg = it.disabled ? C.disabled : on ? "#ffffff" : C.text;
    const lead = div()
      .w(it.icon ? 40 : 22)
      .flex_none()
      .flex()
      .items_center()
      .justify_end()
      .pr(it.icon ? 6 : 6)
      .gap(4)
      .when(Boolean(it.checked), (el) => el.child(svg(GLYPH.check).w(10).h(10).text_color(fg)))
      .when(Boolean(it.icon), (el) => el.child(image(it.icon).w(16).h(16).flex_none()));
    return h_flex()
      .id(`mi-${i}`)
      .relative()
      .flex_none()
      .h(MENU.row)
      .w_full()
      .items_center()
      .text_color(fg)
      .when(on, (el) =>
        el
          .child(div().absolute().top(0).left(0).size_full().child(paint(rrect(this.size?.width ?? 300, MENU.row, 0), vgrad(C.selTop, C.selBot), this.size?.width ?? 300, MENU.row)))
          .child(div().absolute().top(0).left(0).w_full().h(1).bg(C.selLine)),
      )
      .on_mouse_move((_e, cx) => {
        if (this.at === i) return;
        this.at = i;
        cx.notify();
      })
      .on_click(() => this.choose(it))
      .child(lead.relative())
      .child(
        h_flex()
          .relative()
          .flex_1()
          .min_w(0)
          .gap(6)
          .child(div().flex_none().whitespace_nowrap().child(it.label ?? ""))
          .when(Boolean(it.detail), (el) => el.child(div().min_w(0).truncate().text_size(12).text_color(on ? "#ffffffcc" : C.gray).child(it.detail))),
      )
      .when(Boolean(it.shortcut), (el) => el.child(div().relative().flex_none().pl(18).pr(14).whitespace_nowrap().child(it.shortcut)))
      .when(!it.shortcut, (el) => el.child(div().flex_none().w(14)));
  }

  render(_cx) {
    const p = props() ?? {};
    const items = this.items();
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 0;
    // Hanging from the menu bar: square top corners. Popped up: round all four.
    const r = p.attached ? [0, 0, 5, 5] : [5, 5, 5, 5];
    return v_flex()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .key_context("SnowLeopardMenu")
      .track_focus(this.focus)
      .on_key_down((e, cx) => this.key(e, cx))
      .on_mouse_down_out(() => {
        const m = shared("sl.menu");
        if (m?.id === p.overlay) setShared("sl.menu", { owner: null, id: null, closed: m.owner, at: Date.now() });
      })
      .relative()
      .size_full()
      .font_family(FONT)
      .text_size(14)
      .text_color(C.text)
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, r), C.menuEdge, w, h))
          .child(paint(rrect(w - 2, h - 2, r.map((n) => (n ? n - 1 : 0)), 1, p.attached ? 0 : 1), C.menu, w, h)),
      )
      .child(
        v_flex()
          .relative()
          .size_full()
          .py(MENU.pad)
          .px(1)
          .children(items.map((it, i) => this.row(it, i))),
      );
  }

  async close() {
    const m = shared("sl.menu");
    const id = props()?.overlay;
    if (m?.id && m.id === id) setShared("sl.menu", { owner: null, id: null, closed: m.owner, at: Date.now() });
  }
}
