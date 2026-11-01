// A Growl "Smoke" notice for an agent that needs you: a translucent black
// rounded rectangle at the top right, under the menu bar, the program's icon
// at the left, white Lucida Grande. Click goes to the agent; it closes by
// itself after a few seconds. The Dock opens it (showNotice); props { role,
// address, title, detail, program, size }. Also the helpers that name an
// agent the same way on every surface and pick the one to go to next.

import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, spaces, agents } from "herdr";
import { FONT, paint, rrect, programIcon, tabLabel } from "./kit.js";

const W = 320;
const H = 68;
const SECONDS = 6;
const MENUBAR = 22;

/** The agent's tab name, as the tab bar and the menus print it. */
export function agentName(a) {
  const s = spaces().find((x) => x.id === a.space);
  const t = s?.tabs.find((x) => x.id === a.tab);
  return (t && tabLabel(s.id, t)) || a.tab_name || a.program?.name || "Agent";
}

/** "acme-portal", plus " on steve" for a remote space. */
export function agentSpace(a) {
  const s = spaces().find((x) => x.id === a.space);
  return `${a.space_name}${s?.machine ? ` on ${s.machine}` : ""}`;
}

/** "tests in acme-portal". */
export function agentWhere(a) {
  return `${agentName(a)} in ${agentSpace(a)}`;
}

/** Agents in a status, oldest change first. */
export function withStatus(status) {
  return agents()
    .filter((a) => a.status === status)
    .sort((a, b) => a.seq - b.seq);
}

/** The one after the focused agent, so repeated clicks walk the list. */
export function nextAfterFocus(list) {
  const i = list.findIndex((a) => a.focused);
  return list[i < 0 ? 0 : (i + 1) % list.length] ?? null;
}

/** Where a click should go: a blocked agent, else a finished one. */
export function urgentAgent() {
  return nextAfterFocus(withStatus("blocked")) ?? nextAfterFocus(withStatus("done"));
}

/** Opens a notice for an agent that just needs you, replacing the one still up. */
export function showNotice(a, previous) {
  if (previous) closeOverlay(previous);
  const v = window.viewport_size();
  return openOverlay({
    mod: "snowleopard",
    // A window, not a popup: it doesn't take the keyboard from the terminal you're typing in.
    kind: "window",
    frame: "none",
    key: "sl-notice",
    width: W,
    height: H,
    ...(v?.width ? { at: { x: Math.round(v.width - W - 12), y: MENUBAR + 8 } } : {}),
    props: { role: "notice", address: a.address, title: `${a.program?.name ?? "An agent"} needs you`, detail: agentWhere(a), program: a.program ?? null, size: [W, H] },
  });
}

export default class Notice {
  init(_p, cx) {
    cx.timer.after(SECONDS * 1000, () => this.close());
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  render(_cx) {
    const p = props() ?? {};
    return div()
      .id("root")
      .relative()
      .w(W)
      .h(H)
      .font_family(FONT)
      .cursor_pointer()
      .child(paint(rrect(W, H, 12), "#000000c0", W, H))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .size_full()
          .items_center()
          .gap(12)
          .px(14)
          .child(programIcon(p.program, 40))
          .child(
            v_flex()
              .min_w(0)
              .flex_shrink(1)
              .gap(2)
              .child(div().truncate().text_size(13).font_weight(700).text_color("#ffffff").child(p.title ?? ""))
              .child(div().truncate().text_size(12).text_color("#ffffffe0").child(p.detail ?? "")),
          ),
      )
      // A press here must not drag the window; the click goes to the agent.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => {
        if (p.address) run("agent.focus", { terminal: p.address });
        this.close();
      });
  }
}
