// A notice in the top right, under the menu bar: a light Aqua panel (a 10.6
// window's gray gradient, a dark edge and a soft drop shadow) with the
// program's or app's icon at the left and Lucida Grande beside it. Click runs
// its action (or goes to the agent); it closes by itself after a few seconds.
// Several stack downward. The Dock opens one for an agent that needs you
// (showNotice); Slack and Messages for a new message (showBanner). Props
// { role, title, detail, program | icon, address | action, timeout, size }.
// It also draws Herdr's own toasts (bottom right) where Herdr lets a layout
// choose its toast mod (the layout's "toast"): props are then the
// notification, { title, body, level, icon, action }. With mod.json's overlay
// (frame "none", props role "notice") it's this same panel; without, inside
// Herdr's own frame, just the panel's fill, rounded to that frame.
// Also the helpers that name an agent the same way on every surface and pick
// the one to go to next.

import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, openOverlay, run, spaces, agents } from "herdr";
import { div, image } from "gpui-kit";
import { FONT, paint, rrect, vgrad, programIcon, tabLabel } from "./kit.js";

// The panel, and the window around it: room for the shadow at the sides and below.
const PW = 320;
const PH = 62;
const SH = 8;
const TOP = 2;
const W = PW + 2 * SH;
const H = PH + SH + TOP;
const SECONDS = 6;
const MENUBAR = 22;

// Which spots down the right edge are taken, and until when (shared by every copy of the mod).
const SLOTS = (globalThis.__snowleopardNoticeSlots ??= []);

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
  return showBanner({ title: `${a.program?.name ?? "An agent"} needs you`, detail: agentWhere(a), program: a.program ?? null, address: a.address });
}

/** Opens a notice in the first free spot down the right edge. n: { title, detail, icon | program, action | address, timeout (ms) }. */
export function showBanner(n) {
  const v = window.viewport_size();
  const now = Date.now();
  const timeout = n.timeout ?? SECONDS * 1000;
  let i = SLOTS.findIndex((until) => !until || until < now);
  if (i < 0) i = SLOTS.length < 4 ? SLOTS.length : 0;
  SLOTS[i] = now + timeout;
  return openOverlay({
    mod: "snowleopard",
    // A window, not a popup: it doesn't take the keyboard from the terminal you're typing in.
    kind: "window",
    frame: "none",
    width: W,
    height: H,
    ...(v?.width ? { at: { x: Math.round(v.width - W - 4), y: MENUBAR + 6 + i * (PH + 6) } } : {}),
    props: { role: "notice", ...n, timeout, size: [W, H] },
  });
}

export default class Notice {
  init(_p, cx) {
    this.size = null;
    cx.timer.after(props()?.timeout ?? SECONDS * 1000, () => this.close());
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  render(_cx) {
    const p = props() ?? {};
    // A Herdr toast about an agent ("… finished") goes to its terminal: show that agent's icon.
    const agent = p.address ? null : p.action?.name === "agent.focus" ? agents().find((a) => a.address === p.action.args?.terminal) : null;
    const program = p.program ?? agent?.program ?? null;
    const detail = p.detail ?? p.body;
    const content = h_flex()
      .absolute()
      .top(0)
      .left(0)
      .size_full()
      .items_center()
      .gap(12)
      .px(14)
      // An agent's program, an app's icon, or (an app not in the Dock) none.
      .when(Boolean(p.icon || p.address || agent), (el) => el.child(p.icon ? image(p.icon).flex_none().w(40).h(40) : programIcon(program, 40)))
      .child(
        v_flex()
          .min_w(0)
          .flex_shrink(1)
          .gap(2)
          .child(div().truncate().text_size(13).font_weight(700).text_color("#000000").child(p.title ?? ""))
          .when(Boolean(detail), (el) => el.child(div().truncate().text_size(12).text_color("#3a3a3a").child(detail ?? ""))),
      );
    const click = () => {
      if (p.action?.name) run(p.action.name, p.action.args ?? {});
      else if (p.address) run("agent.focus", { terminal: p.address });
      this.close();
    };
    // Inside Herdr's toast frame (its edge, corners and shadow): the fill, rounded as the frame is.
    if (p.role !== "notice") {
      const w = this.size?.width ?? 0;
      const h = this.size?.height ?? 0;
      return div()
        .id("root")
        .relative()
        .size_full()
        .font_family(FONT)
        .cursor_pointer()
        .on_size_change((size, cx) => {
          this.size = size;
          cx.notify();
        })
        .when(w > 0, (el) => el.child(paint(rrect(w, h, 7), vgrad("#f3f3f3", "#d2d2d2"), w, h)).child(paint(rrect(w - 14, 1, 0, 7, 0), "#ffffffd8", w, h)))
        .child(content)
        .on_click(click);
    }
    return div()
      .id("root")
      .relative()
      .w(W)
      .h(H)
      .font_family(FONT)
      .cursor_pointer()
      // A soft shadow: translucent rounded rectangles, wider and fainter outward, a little low.
      .children([[6, "#00000012"], [4, "#0000001c"], [2, "#0000002a"]].map(([e, c]) => paint(rrect(PW + 2 * e, PH + e, 9 + e, SH - e, TOP + 1), c, W, H)))
      .child(paint(rrect(PW, PH, 9, SH, TOP), "#00000070", W, H))
      .child(paint(rrect(PW - 2, PH - 2, 8, SH + 1, TOP + 1), vgrad("#f3f3f3", "#d2d2d2"), W, H))
      .child(paint(rrect(PW - 16, 1, 0, SH + 8, TOP + 1), "#ffffffd8", W, H))
      .child(div().absolute().top(TOP).left(SH).w(PW).h(PH).child(content))
      // A press here must not drag the window; the click goes where the notice says.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(click);
  }
}
