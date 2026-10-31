# Snow Leopard

A Mac OS X 10.6 layout for Herdr: `layouts/snowleopard.json`, the five
Terminal.app profiles in `themes/snowleopard*.json`, and this mod.
One mod, many roles (`main.js`): menubar, titlebar, sidebar, tabs, pane
(split pane strip), status, dock, desk (bare desktop spacers), menu, sheet,
drag (overlays) and aqua (a torn-off window's title bar). `kit.js` draws
Aqua: gradients as px paths, glass beads (traffic lights, badges), textured
toolbar buttons, pulsing default buttons, menus.

The layout pushes macOS's own window buttons off the window
(`traffic_lights: [-200, -200]`); the glossy ones in the title bar close,
and minimize the Herdr window instead; green zooms the Aqua window.

The window sits between desktop spacers (`desk-top`, `desk-left`,
`desk-right`, `desk-bottom`). Zoomed, it takes the leftover space; placed,
`window` and `desk-row` get px sizes and the spacers set its position. A
title-bar press opens the `drag` role as a clear full-window overlay, so it
gets every pointer move until release. The placement is kept in shared
`sl.placed`, and the last placed frame in `sl.frame`.

A tab can leave for its own window: an overlay window (`key: sl-win-<tab>`,
`keep: true`) holding the `aqua` title bar over the tab's `{terminal}`
blocks. The tab is settled while it's out and unsettled when it's put back;
shared `sl.windows` records each one (`min` while it waits in the Dock,
`big` when zoomed, `at` where it sits). A tab bar press opens the `drag`
overlay in `tear` mode: a ghost tab, then a ghost window, follows the pointer
and the window opens where it's released.

Keys (`keys.json`, section `layout:snowleopard`): `ctrl-f2` walks the menu
bar menus, `cmd-alt-escape` Force Quit, `cmd-m` minimize, `ctrl-cmd-f` full screen. Mod commands:
`snowleopard.<apple|app|file|edit|view|window|help|menus|about|forcequit|fullscreen|tearoff|mergeall>`.

View > Terminal Profile switches Basic, Pro, Homebrew, Ocean and Novel.
`art/aurora.py` regenerates the wallpaper (numpy + Pillow).
