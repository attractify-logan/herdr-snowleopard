# Snow Leopard for Claude Code

Matching Claude Code color themes for the Snow Leopard Herdr layout.

- `snowleopard.json`: **Snow Leopard**, a dark theme for the Pro terminal
  profile (the layout's default). Aqua blue accent, graphite borders, Aqua
  green, red and amber for status, and Aurora violet and cyan for modes.
- `snowleopard-basic.json`: **Snow Leopard Basic**, a light theme for the
  Basic (white) profile.

Install: copy either file into `~/.claude/themes/`, then pick it in `/theme`,
or set `"theme": "custom:snowleopard"` in `~/.claude/settings.json`.

## Context gauge

`snowleopard-context.py` is a status line for Claude Code that shows how full
the context window is as an Aqua progress bar: blue, amber from 70%, red from
85%.

```
◖████████▎       ◗ 52% context
```

Install it (Python 3, no packages):

```sh
cp snowleopard-context.py ~/.claude/
```

and in `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "python3 ~/.claude/snowleopard-context.py" }
```

To keep a status line you already have, run it first with `--then`: the
gauge follows its output.

```json
"statusLine": { "type": "command", "command": "python3 ~/.claude/snowleopard-context.py --then 'my-statusline'" }
```

Inside a Herdr terminal it also labels the terminal (`sl.context`), and the
Snow Leopard layout draws the same gauge beside the agent in the sidebar and
in a split pane's title strip.
