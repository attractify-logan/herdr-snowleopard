// The source list: Finder's sidebar. SPACES grouped by machine (THIS MAC,
// then each other machine), each a folder with its tab count or the
// most urgent agent's mark; AGENTS below with the spinner, a red badge
// when one needs you and Mail's blue dot when one finished. Selected rows
// get the blue gradient (graphite when the window isn't key). The bottom
// bar holds + (new space) and the action gear.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, machines, run, setAgentOrder } from "herdr";
import {
  C, FONT, GLYPH, ICON, key, paint, rrect, vgrad, fillGrad, embossed, pill, statusMark, programIcon, openMenu,
  closeMenus, textured, menuSize, spaceItems,
} from "./kit.js";

const ROW = 22;

export default class Sidebar {
  init() {
    this.size = null;
    this.fold = {};
    this.hot = null;
  }

  heading(id, label) {
    const open = !this.fold[id];
    return h_flex()
      .id(`hd-${id}`)
      .flex_none()
      .h(24)
      .pt(6)
      .pl(10)
      .pr(8)
      .items_center()
      .justify_between()
      .child(embossed(label.toUpperCase(), { size: 11, bold: true, color: C.heading, shadow: "#ffffffc0" }))
      .child(div().text_size(11).text_color(C.heading).opacity(this.hot === id ? 0.9 : 0).child(open ? "Hide" : "Show"))
      .on_hover((h, cx) => {
        this.hot = h ? id : this.hot === id ? null : this.hot;
        cx.notify();
      })
      .on_click((_e, cx) => {
        this.fold[id] = open;
        cx.notify();
      });
  }

  row(id, o) {
    const sel = Boolean(o.selected);
    const live = key();
    const w = this.size?.width ?? 200;
    return h_flex()
      .id(id)
      .relative()
      .flex_none()
      .h(ROW)
      .w_full()
      .pl(o.indent ?? 18)
      .pr(8)
      .gap(6)
      .items_center()
      .when(sel, (el) =>
        el
          .child(paint(rrect(w, ROW, 0), live ? vgrad(C.rowTop, C.rowBot) : vgrad(C.rowTopOff, C.rowBotOff), w, ROW))
          .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? C.rowLine : C.rowLineOff)),
      )
      .child(div().relative().flex_none().child(o.icon))
      .child(
        div()
          .relative()
          .flex_1()
          .min_w(0)
          .truncate()
          .text_size(12)
          .text_color(sel ? "#ffffff" : C.text)
          .when(sel, (el) => el.font_weight(700))
          .child(o.label),
      )
      .when(Boolean(o.mark), (el) => el.child(div().relative().flex_none().child(o.mark)))
      .on_click((e, cx) => o.onClick?.(e, cx))
      .when(Boolean(o.onRight), (el) =>
        el.on_mouse_down("right", (e, cx) => {
          cx.stop_propagation();
          o.onRight(e, cx);
        }),
      );
  }

  spaceMenu(s, e, above = false) {
    closeMenus();
    const items = spaceItems(s);
    const b = e.bounds;
    const at = above && b ? { x: b.x, y: b.y - menuSize(items).h - 2 } : e.position ? { x: e.position.x, y: e.position.y } : undefined;
    openMenu(items, at, { owner: `space-${s.id}` });
  }

  render(_cx) {
    const live = key();
    const all = spaces();
    const ags = agents();
    setAgentOrder(ags.map((a) => a.address));
    const groups = [];
    for (const m of machines()) {
      const list = all.filter((s) => (s.machine ?? null) === (m.name ?? null));
      if (list.length || m.name === null) groups.push({ name: m.name, list, state: m.layout });
    }
    const sections = [];
    for (const g of groups) {
      const id = `m-${g.name ?? "local"}`;
      sections.push(this.heading(id, g.name ? g.name : "This Mac"));
      if (this.fold[id]) continue;
      if (g.state !== "ready" && !g.list.length)
        sections.push(h_flex().h(ROW).pl(18).text_size(11).italic().text_color(C.gray).child(g.state === "loading" ? "Connecting…" : "Unavailable"));
      for (const s of g.list) {
        const urgent = s.status === "blocked" || s.status === "done" || s.status === "working";
        const tabs = s.tabs.filter((t) => !t.settled).length;
        sections.push(
          this.row(`sp-${s.id}`, {
            selected: s.active,
            icon: image(s.machine ? ICON.folderNet : ICON.folder).w(16).h(16),
            label: s.name,
            mark: urgent ? statusMark(s.status, { selected: s.active }) : tabs > 1 ? pill(tabs, { selected: s.active }) : null,
            onClick: () => run("space.select", { id: s.id }),
            onRight: (e) => this.spaceMenu(s, e),
          }),
        );
      }
    }
    if (ags.length) {
      sections.push(this.heading("agents", "Agents"));
      if (!this.fold.agents)
        for (const a of ags) {
          const name = a.tab_name && a.tab_name !== String(a.tab_index) ? a.tab_name : a.program?.name ?? "Agent";
          sections.push(
            this.row(`ag-${a.address}`, {
              selected: a.focused,
              icon: programIcon(a.program, 16, { small: true }),
              label: name,
              mark: statusMark(a.status, { selected: a.focused }),
              onClick: () => run("agent.focus", { terminal: a.address }),
            }).tooltip(`${a.program?.name ?? "Agent"} in ${a.space_name} — ${a.title || a.address}`),
          );
        }
    }

    return v_flex()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .size_full()
      .font_family(FONT)
      .bg(live ? C.source : C.sourceOff)
      .child(v_flex().id("list").flex_1().min_h(0).pb(8).overflow_y_scroll().children(sections))
      .child(this.bottomBar(live));
  }

  bottomBar(live) {
    return h_flex()
      .flex_none()
      .relative()
      .h(23)
      .w_full()
      .px(6)
      .gap(6)
      .items_center()
      .child(fillGrad(live ? "#e3e3e3" : "#f2f2f2", live ? "#c3c3c3" : "#e2e2e2"))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#9a9a9a" : "#c2c2c2"))
      .child(
        div()
          .relative()
          .child(
            textured([
              { id: "sb-add", glyph: GLYPH.plus, size: 10, w: 26, tooltip: "New space", onClick: () => run("space.new", {}) },
              {
                id: "sb-gear",
                glyph: GLYPH.gear,
                size: 12,
                menu: true,
                w: 36,
                tooltip: "Action",
                onDown: (e) => {
                  closeMenus();
                  const s = spaces().find((x) => x.active);
                  if (!s) return;
                  this.spaceMenu(s, e, true);
                },
              },
            ]),
          ),
      );
  }
}
