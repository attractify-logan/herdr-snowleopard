// The window's bottom bar, as on a Finder window: "3 spaces, 7 tabs, 2
// agents working" in the middle (who needs you, in bold), and the resize
// grip's diagonal lines in the corner. Click the red "needs you" words to go
// to the next agent that needs you (the rest of the bar moves the window).

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run } from "herdr";
import { C, FONT, GLYPH, key, paint, rrect, vgrad, embossed, plural, startDrag } from "./kit.js";
import { withStatus, nextAfterFocus, agentName, agentSpace } from "./notice.js";

export default class StatusBar {
  init() {
    this.size = null;
    this.hot = false;
  }

  render(_cx) {
    const live = key();
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 23;
    const all = spaces();
    const tabs = all.reduce((n, s) => n + s.tabs.length, 0);
    const ags = agents();
    const working = ags.filter((a) => a.status === "working").length;
    const blocked = withStatus("blocked");
    const done = withStatus("done");
    const parts = [plural(all.length, "space"), plural(tabs, "tab")];
    if (working) parts.push(`${working} working`);
    // The words that are links: "needs you" first, "done" only when nothing needs you.
    const link = blocked.length > 0 ? "blocked" : done.length > 0 ? "done" : null;
    const target = nextAfterFocus(link === "blocked" ? blocked : done);
    const words = parts.join(", ") + (link === "done" ? "," : "");
    const linkText = link === "blocked" ? `${blocked.length} ${blocked.length === 1 ? "needs" : "need"} you` : `${done.length} done`;
    const linkColor = !live ? "#7a7a7a" : link === "done" ? (this.hot ? "#000000" : "#2b2b2b") : this.hot ? "#5e0d06" : "#9c1b10";
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      // The bottom bar moves the window too; its grip resizes it.
      .on_mouse_down("left", (e, cx) => {
        if (e.click_count < 2) startDrag("move", e, w);
        cx.stop_propagation();
      })
      .relative()
      .size_full()
      .font_family(FONT)
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, [0, 0, 5, 5]), live ? vgrad("#cdcdcd", "#a6a6a6") : vgrad("#ececec", "#d6d6d6"), w, h))
          .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#565656" : "#a5a5a5"))
          .child(div().absolute().top(1).left(0).w_full().h(1).bg("#ffffff70")),
      )
      .child(
        h_flex()
          .id("status-words")
          .absolute()
          .top(0)
          .left(0)
          .size_full()
          .gap(6)
          .items_center()
          .justify_center()
          .child(embossed(words, { size: 11, color: live ? "#2b2b2b" : "#7a7a7a" }))
          .when(Boolean(link), (el) =>
            el.child(
              div()
                .id("status-link")
                .cursor_pointer()
                .when(this.hot, (d) => d.underline())
                .child(embossed(linkText, { size: 11, bold: link === "blocked", color: linkColor }))
                .tooltip(target ? `Go to “${agentName(target)}” in ${agentSpace(target)}` : "")
                .on_hover((h, cx) => {
                  this.hot = h;
                  cx.notify();
                })
                .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
                .on_click(() => target && run("agent.focus", { terminal: target.address })),
            ),
          ),
      )
      .child(
        div()
          .id("grip")
          .absolute()
          .bottom(0)
          .right(0)
          .w(18)
          .h(h)
          .flex()
          .items_end()
          .justify_end()
          .p(2)
          .cursor_nwse_resize()
          .child(svg(GLYPH.grip).w(11).h(11).text_color("#000000"))
          .tooltip("Drag to resize the window")
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            startDrag("resize", e, w);
          }),
      );
  }
}
