// A piece of bare desktop around the window (the layout's desk-* spacers):
// it draws nothing, so the wallpaper shows, and reports its size so the
// green button knows how big the desktop is. While the window is dragged
// ("sl.dragging") it holds the report: every report redraws every part of
// the layout, and the spacers change on every frame of a drag.

import { div } from "gpui-kit";
import { props, shared } from "herdr";
import { reportSize } from "./kit.js";

export default class Desk {
  init() {
    this.size = null;
  }

  report() {
    const slot = props()?.slot;
    if (slot && this.size && !shared("sl.dragging")) reportSize(slot, this.size);
  }

  render(_cx) {
    // The drag ending redraws this copy: report the size it settled at.
    this.report();
    return div()
      .id("root")
      .size_full()
      .on_size_change((size) => {
        this.size = size;
        this.report();
      });
  }
}
