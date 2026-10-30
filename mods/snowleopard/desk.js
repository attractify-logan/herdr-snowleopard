// A piece of bare desktop around the window (the layout's desk-* spacers):
// it draws nothing, so the wallpaper shows, and reports its size so the
// green button knows how big the desktop is.

import { div } from "gpui-kit";
import { props } from "herdr";
import { reportSize } from "./kit.js";

export default class Desk {
  render(_cx) {
    return div()
      .id("root")
      .size_full()
      .on_size_change((size) => {
        const slot = props()?.slot;
        if (slot) reportSize(slot, size);
      });
  }
}
