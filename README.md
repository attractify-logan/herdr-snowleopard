# Snow Leopard for Herdr

Mac OS X 10.6 for the [Herdr](https://herdr.dev) app. It has the menu bar over
the Aurora wallpaper, one Aqua window with a unified toolbar, Finder's source
list, Terminal.app tabs and split panes, and Leopard's glass Dock. Every menu,
button and Dock icon runs a real Herdr command.

![Snow Leopard](preview.png)

## Features

- **Menu bar.** It has the Apple, Herdr, File, Edit, View, Window and Help
  menus. Their shortcuts are read live from your `keys.json`. On the right are
  an agents menu, a machines status icon, the clock, a layout switcher and
  Spotlight (the command palette).
- **Window.**
  - It's a real window on the desktop: drag its title bar (or bottom bar) to
    move it and the bottom-right grip to resize it. Green (or a double-click on
    the title) zooms it to fill the desktop and back. Dragging a zoomed window
    un-zooms it. The menu bar still moves the Herdr app window itself.
  - Glossy traffic lights: red closes and yellow minimizes the Herdr window;
    green zooms the Aqua window.
  - The toolbar has tab navigation, split and zoom controls, an action menu, a
    New menu that can start any installed agent, and a command search field.
- **Source list.** Spaces are grouped by machine, with your agents below. A
  spinner means working, a red badge means it needs you, and a blue dot means
  done.
- **Tabs and panes.** The tab bar works like Terminal.app's, with ⌘ numbers.
  Split panes get small title strips.
- **Dock.** Each space is a folder with its initials and its agent's icon. A
  space bounces when an agent is blocked. The Trash closes a tab or space after
  asking first.
- **Aqua dialogs.** Close confirmations, About Herdr, and Force Quit (end any
  terminal).
- **Full screen.** View › Enter Full Screen (⌃⌘F with the keys below) fills the
  display with the whole desktop: menu bar, window and Dock.
- **Terminal profiles.** Choose Basic, Pro, Homebrew, Ocean or Novel under
  View › Terminal Profile.

## Install

Copy the folders into your Herdr home, then switch to the layout:

```sh
cp -R layouts mods themes ~/.config/herdr-app/
herdr-app check ~/.config/herdr-app/mods/snowleopard
herdr-app do layout.switch --name snowleopard
```

`ctrl-shift-l` cycles layouts to get back. You can also add these keys to
`~/.config/herdr-app/keys.json`:

```json
"layout:snowleopard": {
  "ctrl-f2": "snowleopard.menus",
  "cmd-alt-escape": "snowleopard.forcequit",
  "cmd-m": "window.minimize",
  "ctrl-cmd-f": "snowleopard.fullscreen"
}
```

The layout needs macOS for Lucida Grande and the Apple menu glyph.

## Claude Code theme

`claude-code/` has matching Claude Code themes: **Snow Leopard** (dark, for
the Pro profile) and **Snow Leopard Basic** (light). Copy one into
`~/.claude/themes/` and pick it with `/theme`. See
[claude-code/README.md](claude-code/README.md).

## Layout

| Path | What it is |
|---|---|
| `layouts/snowleopard.json` | The window layout |
| `mods/snowleopard/` | The mod that draws every part (see its README) |
| `themes/snowleopard*.json` | The five Terminal.app profiles |
| `claude-code/` | The matching Claude Code themes |
| `RECIPE.md` | The brief for rebuilding the layout from scratch |

## License

MIT. See [LICENSE](LICENSE). Herdr's app icon (`mods/snowleopard/img/herdr.png`)
belongs to Herdr. Snow Leopard, Aqua and the Apple logo are Apple's
trademarks. This is a fan-made homage, not affiliated with Apple.
