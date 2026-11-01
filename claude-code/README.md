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

How full the context window is, as an Aqua progress bar on Claude Code's
footer, beside the permission mode: blue, amber from 70%, red from 85%.

```
━━━━━━━━━━━━ 68% context
```

It's the `snowleopard-context` mod (Claude Code 2.1.287 or later). Install it
in Claude Code:

```
/plugin install snowleopard-context --marketplace attractify-logan/herdr-snowleopard
```

Answer `y` to add the marketplace, then pick a scope (user, for every project).

### In the Snow Leopard Herdr layout

`snowleopard-context.py` is a status line that reports the same figure to
Herdr (it labels the terminal `sl.context`), and the layout draws a gauge
beside each agent in the sidebar and in a split pane's title strip. Copy it to
`~/.claude/` and add to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "python3 ~/.claude/snowleopard-context.py --no-gauge" }
```

`--no-gauge` leaves the drawing to the mod. To keep a status line you already
have, run it first with `--then`, and its output is what the status line
shows:

```json
"statusLine": { "type": "command", "command": "python3 ~/.claude/snowleopard-context.py --no-gauge --then 'my-statusline'" }
```

Without the mod, leave out `--no-gauge` and the status line draws the gauge
itself: `◖████████▎       ◗ 52% context`.
