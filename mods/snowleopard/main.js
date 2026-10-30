// Snow Leopard: a Mac OS X 10.6 layout for Herdr, in roles. The layout and
// overlays give each copy props { role }:
//   menubar   the menu bar, its menus and menu extras, the clock, Spotlight
//   titlebar  the window's unified title bar and toolbar (traffic lights)
//   sidebar   the source list: spaces by machine, agents
//   tabs      Terminal's tab bar
//   pane      a split pane's title strip (the layout's pane header)
//   status    the window's bottom bar
//   dock      the Dock
//   menu      a menu (an overlay)
//   sheet     alerts, About, Force Quit (overlays)

import { View, div } from "gpui-kit";
import { props, nextCommand } from "herdr";
import MenuBar from "./menubar.js";
import TitleBar from "./titlebar.js";
import Sidebar from "./sidebar.js";
import Tabs from "./tabs.js";
import PaneHeader from "./pane.js";
import StatusBar from "./status.js";
import Dock from "./dock.js";
import Menu from "./menu.js";
import Sheet from "./sheet.js";
import { openSheet } from "./kit.js";

const ROLES = { menubar: MenuBar, titlebar: TitleBar, sidebar: Sidebar, tabs: Tabs, pane: PaneHeader, status: StatusBar, dock: Dock, menu: Menu, sheet: Sheet };

// Key commands ("snowleopard.<command>" in keys.json), taken by the menu bar's copy.
const COMMANDS = {
  about: () => openSheet("about"),
  forcequit: () => openSheet("forcequit"),
};

export default class SnowLeopard extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    const R = ROLES[pr.role];
    this.role = R ? new R() : null;
    this.role?.init?.(pr, cx);
    if (pr.role === "menubar")
      cx.spawn(async (cx) => {
        for (;;) {
          const c = await nextCommand();
          try {
            if (!this.role.command?.(c)) COMMANDS[c]?.();
          } catch (e) {
            console.log(`snowleopard: ${c} failed: ${e}`);
          }
          cx.notify();
        }
      });
  }

  render(cx) {
    if (!this.role) return div().child(`snowleopard: no role "${props()?.role}"`);
    return this.role.render(cx);
  }

  async close(cx) {
    await this.role?.close?.(cx);
  }
}
