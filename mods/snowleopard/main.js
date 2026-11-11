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
//   desk      bare desktop around the window (the desk-* spacers)
//   drag      moves or resizes the window while the button is down (an overlay)
//   aqua      a torn-off tab's window title bar (in an overlay window)
//   notes     the Obsidian vault in an Aqua window (an overlay window)
//   slack     Slack in an Aqua window (an overlay window)
//   linear    Linear in an Aqua window (an overlay window) or a tab
//   imessage  Messages in an Aqua window (an overlay window) or a tab
//   notice    a Growl-style "needs you" notice at the top right (an overlay window)

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
import Desk from "./desk.js";
import Drag from "./drag.js";
import AquaWindow from "./aqua.js";
import Notes from "./notes.js";
import Slack from "./slack.js";
import Linear from "./linear.js";
import IMessage from "./imessage.js";
import Notice from "./notice.js";
import { spaces } from "herdr";
import { openSheet, tearOff, mergeAll, torn, openWin, openSlackTab, openLinearTab, openImessageTab, imessageTab, setWin, winState, newTab, askCloseTab, toggleFullScreen } from "./kit.js";
import { lastNotified } from "./slackwatch.js";
import { lastNotified as lastIMessage, demoOn as imessageDemo } from "./imessagedb.js";
import { demoIncoming } from "./imessage-demo.js";
import { refreshUsage } from "./usage.js";

const ROLES = { menubar: MenuBar, titlebar: TitleBar, sidebar: Sidebar, tabs: Tabs, pane: PaneHeader, status: StatusBar, dock: Dock, menu: Menu, sheet: Sheet, desk: Desk, drag: Drag, aqua: AquaWindow, notes: Notes, slack: Slack, linear: Linear, imessage: IMessage, notice: Notice };

// Key commands ("snowleopard.<command>" in keys.json), taken by the menu bar's copy.
const COMMANDS = {
  about: () => openSheet("about"),
  prefs: () => openSheet("prefs", { key: "sl-prefs" }),
  usage: () => refreshUsage(true),
  forcequit: () => openSheet("forcequit"),
  fullscreen: () => toggleFullScreen(),
  desktopfullscreen: () => window.toggle_fullscreen(),
  tearoff: () => {
    const t = spaces().find((s) => s.active)?.tabs.find((t) => t.active && !torn()[t.id]);
    if (t) tearOff(t.id);
  },
  mergeall: () => mergeAll(),
  // ⌘T and ⌘W in this layout: a new tab that asks for its name, and a close that
  // asks first when an agent is running in the tab (as Terminal does).
  newtab: () => newTab({}),
  closetab: () => {
    const t = spaces().find((s) => s.active)?.tabs.find((t) => t.active);
    if (t) askCloseTab(t.id);
  },
  notes: () => openWin("notes"),
  slack: () => openWin("slack"),
  slacktab: () => openSlackTab(),
  linear: () => (winState("linear").open || winState("linear").min ? openWin("linear") : openLinearTab()),
  linearwindow: () => openWin("linear"),
  // Messages: its window (a tab already open is gone to), or a tab.
  imessage: () => (!winState("imessage").open && !winState("imessage").min && imessageTab() ? openImessageTab() : openWin("imessage")),
  imessagetab: () => openImessageTab(),
  // A Messages banner's click: Messages, open to the conversation it was about.
  imessageunread: () => {
    const id = lastIMessage();
    if (id) setWin("imessage", { goto: id });
    if (!winState("imessage").open && !winState("imessage").min && imessageTab()) openImessageTab();
    else openWin("imessage");
  },
  // The demo only: a made-up message arrives (imessage-demo.js), for the badge and banner.
  imessagedemo: () => imessageDemo().then((on) => on && demoIncoming()),
  // A Slack banner's click: Slack, open to the conversation it was about.
  slackunread: () => {
    const id = lastNotified();
    if (id) setWin("slack", { goto: id });
    if (winState("slack").open) openWin("slack");
    else openSlackTab();
  },
  // F2 and ⇧F2 in this layout: the Aqua rename sheet instead of Herdr's prompt.
  renametab: () => {
    const t = spaces().find((s) => s.active)?.tabs.find((t) => t.active);
    if (t) openSheet("rename", { what: "tab", id: t.id });
  },
  renamespace: () => {
    const s = spaces().find((s) => s.active);
    if (s) openSheet("rename", { what: "space", id: s.id });
  },
};

export default class SnowLeopard extends View {
  init(p, cx) {
    const pr = props() ?? p ?? {};
    // A notification with no role: Herdr opened this mod as the layout's toast (layout "toast").
    const R = ROLES[pr.role] ?? (typeof pr.title === "string" && pr.overlay ? Notice : null);
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
