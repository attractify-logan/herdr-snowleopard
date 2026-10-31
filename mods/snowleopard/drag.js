// Moving and resizing the window on the desktop. A press on the title bar
// (move) or the status bar's grip (resize) opens this as a clear overlay
// over the whole app window, so it gets every pointer move until the button
// comes up, wherever the pointer goes. Each move resizes the desktop's
// spacers (desk-left, desk-top) or the window itself (window, desk-row).
// props { mode: "move" | "resize", start: {x, y}, frame }, or { mode: "tear",
// tab, start }: a tab pressed in the tab bar, torn off into its own window
// once it's pulled 28 px down or up out of the strip.

import { div } from "gpui-kit";
import { props, closeOverlay } from "herdr";
import { shared } from "herdr";
import { applyFrame, setSavedFrame, desktopLimits, tearOff, MIN_W, MIN_H } from "./kit.js";

export default class Drag {
  init() {
    this.size = null;
    this.frame = null;
    this.last = null;
  }

  move(e) {
    const p = props() ?? {};
    if (!p.start) return;
    if (p.mode === "tear") {
      if (this.done || Math.abs(e.position.y - p.start.y) < 28) return;
      this.done = true;
      tearOff(p.tab, { x: Math.max(0, Math.round(e.position.x - 120)), y: Math.max(0, Math.round(e.position.y - 11)) });
      return this.end();
    }
    if (!this.size) return;
    const lim = desktopLimits(this.size);
    this.frame ??= this.startFrame(p, lim);
    const f = this.frame;
    const dx = Math.round(e.position.x - p.start.x);
    const dy = Math.round(e.position.y - p.start.y);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const next =
      p.mode === "resize"
        ? { x: f.x, y: f.y, w: clamp(f.w + dx, MIN_W, lim.w - f.x), h: clamp(f.h + dy, MIN_H, lim.h - f.y) }
        : { x: clamp(f.x + dx, 0, Math.max(0, lim.w - f.w)), y: clamp(f.y + dy, 0, Math.max(0, lim.h - f.h)), w: f.w, h: f.h };
    const key = `${next.x},${next.y},${next.w},${next.h}`;
    if (key === this.last) return;
    this.last = key;
    this.now = next;
    applyFrame(next);
  }

  // Dragging a zoomed window by its title un-zooms it to its last size (or
  // about 72% of the desktop), keeping the pointer at the same spot along the title.
  startFrame(p, lim) {
    const f = p.frame;
    if (f.h !== null && f.h !== undefined) return { ...f };
    const full = { ...f, h: lim.h - f.y - (f.bottom ?? 0) };
    if (p.mode !== "move") return full;
    const saved = shared("sl.frame");
    const w = Math.min(lim.w, Math.max(MIN_W, saved?.w ?? Math.round(lim.w * 0.72)));
    const h = Math.min(lim.h, Math.max(MIN_H, saved?.h ?? Math.round(lim.h * 0.78)));
    const along = f.w ? (p.start.x - f.x) / f.w : 0.5;
    return { x: Math.round(p.start.x - along * w), y: f.y, w, h };
  }

  end() {
    if (this.now) setSavedFrame(this.now);
    closeOverlay(props()?.overlay);
  }

  render(_cx) {
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .size_full()
      .when(props()?.mode === "resize", (el) => el.cursor_nwse_resize())
      .on_mouse_move((e) => this.move(e))
      .on_mouse_up("left", () => this.end())
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        this.end();
      });
  }
}
