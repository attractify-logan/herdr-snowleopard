// The window's bottom bar, as on a Finder window: "3 spaces, 7 tabs, 2
// agents working" in the middle (who needs you, in bold), and the resize
// grip's diagonal lines in the corner. Click the words to go to the agent
// that needs you most.

import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run } from "herdr";
import { C, FONT, GLYPH, key, paint, rrect, vgrad, embossed, plural } from "./kit.js";

export default class StatusBar {
  init() {
    this.size = null;
  }

  render(_cx) {
    const live = key();
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 23;
    const all = spaces();
    const tabs = all.reduce((n, s) => n + s.tabs.length, 0);
    const ags = agents();
    const working = ags.filter((a) => a.status === "working").length;
    const blocked = ags.filter((a) => a.status === "blocked");
    const done = ags.filter((a) => a.status === "done");
    const parts = [plural(all.length, "space"), plural(tabs, "tab")];
    if (working) parts.push(`${working} working`);
    if (done.length) parts.push(`${done.length} done`);
    const words = parts.join(", ");
    const urgent = blocked[0] ?? done[0] ?? null;
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
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
          .when(blocked.length > 0, (el) =>
            el.child(embossed(`${blocked.length} ${blocked.length === 1 ? "needs" : "need"} you`, { size: 11, bold: true, color: live ? "#9c1b10" : "#7a7a7a" })),
          )
          .when(Boolean(urgent), (el) => el.tooltip("Go to the agent that needs you").on_click(() => run("agent.focus", { terminal: urgent.address }))),
      )
      .child(div().absolute().bottom(2).right(2).child(svg(GLYPH.grip).w(11).h(11).text_color("#000000")));
  }
}
