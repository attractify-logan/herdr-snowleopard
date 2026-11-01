#!/usr/bin/env python3
"""Snow Leopard context gauge for Claude Code's status line.

Claude Code pipes the session's status as JSON to this script. It prints an
Aqua-style capsule gauge of the context window in use:

    ◖████████░░░░░░░░◗ 47% context

blue like Aqua's progress bars, amber from 70%, red from 85%. With --then
"<command>", that status line command runs first (on the same JSON) and the
gauge follows it, so an existing status line keeps working. With --no-gauge it
prints only that command's output (the snowleopard-context mod draws the gauge
on the footer's mode line instead) and still labels the terminal.

Inside a Herdr terminal it also labels the terminal `sl.context=<percent>`
(with `hc label`), which the Snow Leopard layout draws as a gauge in the
sidebar and the pane's title strip.
"""

import json
import os
import subprocess
import sys

WIDTH = 16
TRACK = (72, 72, 72)
COLORS = [(85, (226, 59, 46)), (70, (240, 163, 21)), (0, (91, 147, 227))]
PARTS = " ▏▎▍▌▋▊▉█"


def fg(rgb):
    return "\033[38;2;%d;%d;%dm" % rgb


def bg(rgb):
    return "\033[48;2;%d;%d;%dm" % rgb


RESET = "\033[0m"


def percent(status):
    cw = status.get("context_window") or {}
    used = cw.get("used_percentage")
    if isinstance(used, (int, float)):
        return max(0.0, min(100.0, float(used)))
    size = cw.get("context_window_size")
    usage = cw.get("current_usage") or {}
    if size and isinstance(usage, dict):
        tokens = sum(usage.get(k) or 0 for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        return max(0.0, min(100.0, 100.0 * tokens / size))
    return None


def gauge(pct):
    color = next(c for limit, c in COLORS if pct >= limit)
    filled = pct / 100 * WIDTH
    whole = int(filled)
    part = int((filled - whole) * 8)
    cells = "█" * whole
    if whole < WIDTH:
        cells += PARTS[part] + " " * (WIDTH - whole - 1)
    # The capsule: fill drawn over the gray track, rounded caps in the edge colors.
    left = fg(color if pct > 0 else TRACK) + "◖"
    right = fg(color if pct >= 100 else TRACK) + "◗"
    body = fg(color) + bg(TRACK) + cells + RESET
    label = fg(color) + "%d%%" % round(pct) + RESET + fg((150, 150, 150)) + " context" + RESET
    return left + RESET + body + right + RESET + " " + label


def label_terminal(pct):
    term = os.environ.get("HC_TERMINAL_ID")
    if not term:
        return
    value = str(round(pct))
    # Only when it changes: the status line refreshes often.
    stamp = os.path.join(os.environ.get("TMPDIR", "/tmp"), "sl-context-%s" % term.replace("/", "_"))
    try:
        if open(stamp).read() == value:
            return
    except OSError:
        pass
    try:
        subprocess.run(["hc", "label", term, "sl.context=" + value], timeout=2, capture_output=True)
        with open(stamp, "w") as f:
            f.write(value)
    except (OSError, subprocess.SubprocessError):
        pass


def main():
    raw = sys.stdin.read()
    try:
        status = json.loads(raw)
    except ValueError:
        status = {}
    args = sys.argv[1:]
    quiet = "--no-gauge" in args
    args = [a for a in args if a != "--no-gauge"]
    before = ""
    if len(args) > 1 and args[0] == "--then":
        try:
            r = subprocess.run(args[1], shell=True, input=raw, capture_output=True, text=True, timeout=10)
            before = r.stdout.rstrip("\n")
        except (OSError, subprocess.SubprocessError):
            before = ""
    pct = percent(status)
    if pct is None:
        print(before)
        return
    label_terminal(pct)
    if quiet:
        print(before)
        return
    print(before + ("  " if before else "") + gauge(pct))


if __name__ == "__main__":
    main()
