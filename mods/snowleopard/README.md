# Snow Leopard

A Mac OS X 10.6 layout for Herdr: `layouts/snowleopard.json`, the five
Terminal.app profiles in `themes/snowleopard*.json`, and this mod.
One mod, many roles (`main.js`): menubar, titlebar, sidebar, tabs, pane
(split pane strip), status, dock, menu and sheet (overlays). `kit.js` draws
Aqua: gradients as px paths, glass beads (traffic lights, badges), textured
toolbar buttons, pulsing default buttons, menus.

The layout pushes macOS's own window buttons off the window
(`traffic_lights: [-200, -200]`); the glossy ones in the title bar close,
minimize and zoom the Herdr window instead.

Keys (`keys.json`, section `layout:snowleopard`): `ctrl-f2` walks the menu
bar menus, `cmd-alt-escape` Force Quit, `cmd-m` minimize, `ctrl-cmd-f` full screen. Mod commands:
`snowleopard.<apple|app|file|edit|view|window|help|menus|about|forcequit|fullscreen>`.

View > Terminal Profile switches Basic, Pro, Homebrew, Ocean and Novel.
`art/aurora.py` regenerates the wallpaper (numpy + Pillow).
