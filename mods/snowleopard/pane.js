// A split pane's header: a utility-window title strip. Small close and zoom
// beads on the left, "program — folder (branch)" in the middle, the agent's
// mark on the right. The focused pane's strip is darker, like a key window.

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, home } from "herdr";
import { C, FONT, GLYPH, key, fillGrad, embossed, bead, statusMark, base, contextLevels, gauge } from "./kit.js";

export function paneTitle(p) {
  if (!p) return "";
  if (p.mod) return p.title || p.mod;
  const prog = p.program;
  const where = base(p.cwd, home());
  const branch = p.branch ? ` (${p.branch})` : "";
  const who = prog && !prog.shell ? prog.name : prog?.name ?? "shell";
  return `${who} — ${where}${branch}`;
}

export default class PaneHeader {
  init() {
    this.lit = false;
  }

  render(_cx) {
    const id = props()?.pane;
    const p = panes().find((x) => x.pane === id);
    const on = Boolean(p?.focused) && key();
    const zoomed = Boolean(p?.zoomed);
    const beadKind = (k) => (on || this.lit ? k : "off");
    return h_flex()
      .id(`ph-${id}`)
      .relative()
      .size_full()
      .px(6)
      .gap(6)
      .items_center()
      .font_family(FONT)
      .child(fillGrad(on ? "#e2e2e2" : "#f3f3f3", on ? "#bdbdbd" : "#e0e0e0"))
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(on ? "#8a8a8a" : "#c4c4c4"))
      .child(
        h_flex()
          .id(`ph-l-${id}`)
          .relative()
          .flex_none()
          .gap(5)
          .on_hover((h, cx) => {
            this.lit = h;
            cx.notify();
          })
          .child(
            div()
              .id(`ph-x-${id}`)
              .child(bead(beadKind("close"), 11, this.lit ? GLYPH.close : null))
              .tooltip("Close Pane")
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click(() => run("pane.close", { pane: id })),
          )
          .child(
            div()
              .id(`ph-z-${id}`)
              .child(bead(beadKind("zoom"), 11, this.lit ? GLYPH.plus : null))
              .tooltip(zoomed ? "Unzoom" : "Zoom Pane")
              .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
              .on_click(() => run("pane.zoom", { pane: id })),
          ),
      )
      .child(
        h_flex()
          .relative()
          .flex_1()
          .min_w(0)
          .justify_center()
          .child(embossed(paneTitle(p), { size: 11, color: on ? "#1a1a1a" : "#6a6a6a", truncate: true })),
      )
      .when(Boolean(p?.terminal) && contextLevels().has(p.terminal), (el) => {
        const pct = contextLevels().get(p.terminal) ?? 0;
        return el.child(div().id(`ph-ctx-${id}`).relative().flex_none().child(gauge(pct, 40, 8)).tooltip(`Context ${Math.round(pct)}% full`));
      })
      .child(div().relative().flex_none().w(23).flex().justify_end().child(statusMark(p?.status)))
      .on_click((e) => {
        if (e.click_count >= 2) run("pane.zoom", { pane: id });
        else run("pane.focus", { pane: id });
      });
  }
}
