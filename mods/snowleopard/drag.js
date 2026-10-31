// Moving and resizing the window on the desktop. A press on the title bar
// (move) or the status bar's grip (resize) opens this as a clear overlay
// over the whole app window, so it gets every pointer move until the button
// comes up, wherever the pointer goes. A move only notes where the window
// should be; once a frame (16 ms) the latest spot is applied, resizing just
// the spacers (desk-left, desk-top) or sizes (window, desk-row) that changed.
// Every resize is a layout pass, so pointer events never queue up behind them.
// props { mode: "move" | "resize", start: {x, y}, frame }, or { mode: "tear",
// tab, name, start, bounds }: a tab pressed in the tab bar. As in Terminal,
// a ghost of the tab follows the pointer; pulled 28 px out of the strip it
// becomes a ghost window, and releasing there opens the tab's window under
// the pointer. Released inside the strip, nothing happens. Or { mode:
// "tornresize", tab, start, frame }: a torn-off window's grip; an outline shows
// the new size and the window takes it on release (reopening it on every frame
// would be too heavy).

import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, closeOverlay, shared, setShared } from "herdr";
import { C, FONT, ICON, placeFrame, setSavedFrame, desktopLimits, tearOff, tearSpot, resizeTorn, paint, rrect, vgrad, embossed, WIN, MIN_W, MIN_H } from "./kit.js";

export default class Drag {
  init(_p, cx) {
    this.size = null;
    this.frame = null;
    this.want = null; // where the pointer says the window goes
    this.shown = undefined; // the frame the layout has now (null: still zoomed)
    const m = props()?.mode;
    if (m === "move" || m === "resize") cx.timer.every(16, () => this.flush());
  }

  /** Applies the latest wanted frame, if it moved since the last one. */
  flush() {
    const f = this.want;
    const s = this.shown;
    if (!f || (s && s.x === f.x && s.y === f.y && s.w === f.w && s.h === f.h)) return;
    placeFrame(s, f);
    this.shown = f;
  }

  move(e, cx) {
    const p = props() ?? {};
    if (!p.start) return;
    if (p.mode === "tornresize") {
      this.pos = { x: e.position.x, y: e.position.y };
      return cx.notify();
    }
    if (p.mode === "tear") {
      this.pos = { x: e.position.x, y: e.position.y };
      this.out = this.out || Math.abs(this.pos.y - p.start.y) >= 28;
      return cx.notify();
    }
    if (!this.size) return;
    const lim = desktopLimits(this.size);
    if (!this.frame) {
      this.frame = this.startFrame(p, lim);
      // A placed window is already laid out at its frame; a zoomed one isn't.
      this.shown = p.frame.h !== null && p.frame.h !== undefined ? this.frame : null;
    }
    const f = this.frame;
    const dx = Math.round(e.position.x - p.start.x);
    const dy = Math.round(e.position.y - p.start.y);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const next =
      p.mode === "resize"
        ? { x: f.x, y: f.y, w: clamp(f.w + dx, MIN_W, lim.w - f.x), h: clamp(f.h + dy, MIN_H, lim.h - f.y) }
        : { x: clamp(f.x + dx, 0, Math.max(0, lim.w - f.w)), y: clamp(f.y + dy, 0, Math.max(0, lim.h - f.h)), w: f.w, h: f.h };
    this.want = next;
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

  /** A torn window's frame for the grip at the pointer: its top left stays. */
  tornFrame() {
    const p = props() ?? {};
    const f = p.frame;
    const at = this.pos ?? p.start;
    const maxW = this.size ? this.size.width - f.x : Infinity;
    const maxH = this.size ? this.size.height - f.y : Infinity;
    const w = Math.round(Math.max(WIN.minW, Math.min(maxW, f.w + at.x - p.start.x)));
    const h = Math.round(Math.max(WIN.minH, Math.min(maxH, f.h + at.y - p.start.y)));
    return { x: f.x, y: f.y, w, h };
  }

  end() {
    const p = props() ?? {};
    if (p.mode === "tornresize" && this.pos && !this.done) {
      this.done = true;
      resizeTorn(p.tab, this.tornFrame());
    }
    if (p.mode === "tear" && this.out && this.pos && !this.done) {
      this.done = true;
      tearOff(p.tab, tearSpot(this.pos, this.grab(), this.size));
    }
    if (this.want) {
      this.flush();
      setShared("sl.placed", this.want);
      setSavedFrame(this.want);
    }
    closeOverlay(props()?.overlay);
  }

  // However the overlay goes, the desk spacers may report again.
  async close() {
    const m = props()?.mode;
    if (m === "move" || m === "resize") setShared("sl.dragging", false);
  }

  // How far into the ghost window's title the pointer holds it: where it held the tab, scaled.
  grab() {
    const b = props()?.bounds;
    const s = props()?.start;
    if (!b || !s || !b.width) return 120;
    return Math.round(Math.min(0.9, Math.max(0.1, (s.x - b.x) / b.width)) * WIN.w * 0.5);
  }

  ghost() {
    const p = props() ?? {};
    if (!this.pos) return null;
    if (p.mode === "tornresize") {
      // The new frame's outline, as Aqua draws a live-resize rectangle.
      const f = this.tornFrame();
      return div().absolute().left(f.x).top(f.y).w(f.w).h(f.h).rounded(5).border_2().border_color("#3875d7d0").bg("#3875d714");
    }
    if (!this.out) {
      // The tab, lifted and following the pointer along the strip.
      const b = p.bounds;
      if (!b) return null;
      const w = b.width;
      const h = b.height;
      return div()
        .absolute()
        .left(b.x + this.pos.x - p.start.x)
        .top(b.y + this.pos.y - p.start.y)
        .w(w)
        .h(h)
        .opacity(0.85)
        .child(paint(rrect(w, h, 2), vgrad("#d8d8d8", "#bdbdbd"), w, h))
        .child(div().absolute().top(0).left(0).w(w).h(h).border_1().border_color("#7e7e7e").rounded(2))
        .child(div().absolute().top(0).left(0).size_full().flex().items_center().justify_center().child(embossed(p.name ?? "", { size: 11, color: "#000000", truncate: true })));
    }
    // The window to be: an Aqua title over a dark, see-through body.
    const at = tearSpot(this.pos, this.grab(), this.size);
    const w = WIN.w;
    const h = WIN.h;
    const t = WIN.title;
    return div()
      .absolute()
      .left(at.x)
      .top(at.y)
      .w(w)
      .h(h)
      .opacity(0.8)
      // A light rim so the shape reads over a black terminal too.
      .child(paint(rrect(w, h, 5), "#ffffffa0", w, h))
      .child(paint(rrect(w - 2, t - 1, [4, 4, 0, 0], 1, 1), vgrad(C.titleTop, C.titleBot), w, h))
      .child(paint(rrect(w - 2, h - t - 1, [0, 0, 4, 4], 1, t), "#3a3d44d8", w, h))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .w(w)
          .h(t)
          .items_center()
          .justify_center()
          .font_family(FONT)
          .child(embossed(p.name ?? "", { size: 13, color: "#000000", truncate: true })),
      );
  }

  render(_cx) {
    const g = this.ghost();
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .size_full()
      .when(Boolean(g), (el) => el.child(g))
      .when(props()?.mode === "resize" || props()?.mode === "tornresize", (el) => el.cursor_nwse_resize())
      .on_mouse_move((e, cx) => this.move(e, cx))
      .on_mouse_up("left", () => this.end())
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        this.end();
      });
  }
}
