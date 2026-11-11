// The source list: Finder's sidebar. SPACES grouped by machine (THIS MAC,
// then each other machine), each a folder with its tab count or the
// most urgent agent's mark; AGENTS above with the spinner, a red badge
// when one needs you and Mail's blue dot when one finished; APPS between
// them: Messages, Slack, Linear and notes open as a tab or a window, with
// their unread counts (their tabs leave their spaces' lists). Selected rows
// get the blue gradient (graphite when the window isn't key). The bottom
// bar holds + (new space) and the action gear. A space's disclosure triangle
// lists its tabs under it (the shown space's are open); hovering a tab or an
// agent shows a close button, which asks before closing its tab. An agent's
// threads (the sub-agents it started with `hc run`) sit under it in AGENTS:
// click one to peek at it, right-click to open it beside its agent.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { spaces, agents, machines, panes, terminals, run, setAgentOrder } from "herdr";
import {
  C, FONT, GLYPH, ICON, key, paint, rrect, vgrad, fillGrad, embossed, pill, statusMark, programIcon, tabIcon, openMenu,
  closeMenus, textured, menuSize, spaceItems, remoteSpaceItems, tabLabel, askCloseTab,
  torn, raiseTorn, tabClose, leadProgram, shortcut, contextLevels, gauge, WIN_APPS, winState, openWin, dockApps, appName,
  appImage, BUILTIN_APPS, SEEDED_APPS,
} from "./kit.js";
import { slackBadge } from "./slackwatch.js";
import { linearBadge } from "./linearapi.js";
import { imessageBadge } from "./imessagedb.js";

const UNREAD = { slack: slackBadge, linear: linearBadge, imessage: imessageBadge };
// The Apps section's order: the ones that talk to you first.
const APPS = ["Messages", "Slack", "Linear", "Obsidian"];

/** A tab holding one of the layout's app views (Slack, Linear, Messages, notes), not a terminal. */
function isAppTab(t) {
  return Boolean(WIN_APPS[t.name]) && panes().some((p) => p.tab === t.id && p.mod === "snowleopard");
}

const ROW = 22;
// AGENTS' order; an agent there only for its threads comes last.
const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
// A thread reports to its agent, so its finishing isn't news (the agent's is); an error is.
const threadStatus = (k, listed) => {
  const s = listed.get(k.address)?.status ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};

export default class Sidebar {
  init() {
    this.size = null;
    this.fold = {};
    this.hot = null;
    this.open = {}; // space id → its tabs shown (a space opens when first shown)
    this.last = {}; // machine → its space shown last, which stays open while another machine's is shown
    this.hoverRow = null;
    this.hotClose = false;
  }

  // alert: something under this heading is blocked, which a folded heading must still say.
  heading(id, label, alert = false) {
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
      .child(
        !open && alert
          ? statusMark("blocked")
          : div().text_size(11).text_color(C.heading).opacity(this.hot === id ? 0.9 : 0).child(open ? "Hide" : "Show"),
      )
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
      .when(o.disclose !== undefined, (el) =>
        el.child(
          div()
            .id(`${id}-dis`)
            .relative()
            .flex_none()
            .w(10)
            .ml(-12)
            .text_size(9)
            .text_color(sel ? "#ffffff" : "#6a7380")
            .child(o.disclose === null ? "" : o.disclose ? "▼" : "▶")
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => {
              if (o.disclose !== null) o.onDisclose?.();
              cx.notify();
            }),
        ),
      )
      .child(div().relative().flex_none().child(o.icon))
      .child(
        h_flex()
          .relative()
          .flex_1()
          .min_w(0)
          .overflow_hidden()
          .gap(5)
          .items_baseline()
          .child(
            div()
              .min_w(0)
              // With a gray sub-label, the name keeps its room and the sub-label gives way.
              .when(Boolean(o.sub), (el) => el.flex_shrink(0).max_w(o.subRoom ?? 110))
              .truncate()
              .text_size(12)
              .text_color(sel ? "#ffffff" : C.text)
              .when(sel, (el) => el.font_weight(700))
              .child(o.label),
          )
          .when(Boolean(o.sub), (el) => el.child(div().flex_1().min_w(0).truncate().text_size(11).text_color(sel ? "#ffffffd0" : C.gray).child(o.sub))),
      )
      .when(Boolean(o.mark), (el) => el.child(div().relative().flex_none().child(o.mark)))
      // The close disc sits left of the icon, in the indent, so the status stays in view.
      .when(Boolean(o.onClose) && this.hoverRow === id, (el) =>
        el.child(
          div()
            .id(`${id}-x`)
            .absolute()
            .top((ROW - 13) / 2)
            .left((o.indent ?? 18) - 17)
            .child(tabClose(13, this.hotClose))
            .tooltip("Close Tab…")
            .on_hover((h, cx) => {
              this.hotClose = h;
              cx.notify();
            })
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => {
              cx.stop_propagation();
              o.onClose();
            }),
        ),
      )
      .when(Boolean(o.onClose), (el) =>
        el.on_hover((h, cx) => {
          this.hoverRow = h ? id : this.hoverRow === id ? null : this.hoverRow;
          if (!h) this.hotClose = false;
          cx.notify();
        }),
      )
      .on_click((e, cx) => o.onClick?.(e, cx))
      .when(Boolean(o.onRight), (el) =>
        el.on_mouse_down("right", (e, cx) => {
          cx.stop_propagation();
          o.onRight(e, cx);
        }),
      );
  }

  tabMenu(t, e) {
    closeMenus();
    openMenu(
      [
        { label: "Rename Tab…", act: { sheet: ["rename", { what: "tab", id: t.id }] } },
        { label: "Close Tab…", shortcut: shortcut("tab.close"), act: { sheet: ["closetab", { tab: t.id }] } },
      ],
      { x: e.position.x, y: e.position.y },
      { owner: `tb-${t.id}` },
    );
  }

  /** A thread under its agent: click to peek (or go to its pane), right-click to open it beside the agent. */
  threadRow(s, parent, listed) {
    const k = s.k;
    const a = listed.get(k.address);
    const st = threadStatus(k, listed);
    const name = k.name || k.template || k.program?.name || k.address;
    return this.row(`th-${k.address}`, {
      indent: 36 + s.depth * 14,
      selected: Boolean(a?.focused),
      icon: programIcon(k.program, 14, { small: true }),
      label: name,
      mark: statusMark(st, { selected: a?.focused }),
      onClick: () => run(a ? "pane.focus" : "terminal.peek", { terminal: k.address }),
      onRight: (e) => this.threadMenu(k, name, parent, Boolean(a), e),
    }).tooltip(a ? `${name}: a thread, in a pane` : `${name}: a thread. Click to peek; right-click to open it beside its agent`);
  }

  threadMenu(k, name, parent, kept, e) {
    closeMenus();
    const t = k.address;
    openMenu(
      [
        ...(kept ? [] : [{ label: "Peek", act: { run: ["terminal.peek", { terminal: t }] } }]),
        { label: "Open Beside Its Agent", act: { keepBy: [t, parent, "right"] } },
        { label: "Open Below Its Agent", act: { keepBy: [t, parent, "down"] } },
        { label: "Open in New Tab", act: { run: ["terminal.keep", { terminal: t, place: "tab" }] } },
        ...(kept ? [{ label: "Put Away", act: { run: ["terminal.park", { terminal: t }] } }] : []),
        { sep: true },
        {
          label: "End Thread…",
          act: {
            sheet: ["confirm", { title: `Do you want to end “${name}”?`, detail: "It stops, and so do the threads it started.", yes: "End Thread", command: { name: "terminal.kill", args: { terminal: t } } }],
          },
        },
      ],
      { x: e.position.x, y: e.position.y },
      { owner: `th-${t}` },
    );
  }

  /** APPS: each app open as a tab (in any space) or as a window, with its unread count. */
  apps(all) {
    const rows = [];
    const out = torn();
    for (const name of APPS) {
      const win = WIN_APPS[name];
      const n = UNREAD[win]?.() ?? 0;
      const kept = dockApps().find((a) => appName(a.path) === name);
      const path = kept?.icon ? kept.path : BUILTIN_APPS[name]?.path ?? SEEDED_APPS[name];
      for (const s of all)
        for (const t of s.tabs.filter((x) => x.name === name && isAppTab(x) && (!x.settled || out[x.id]))) {
          const sel = s.active && t.active && !out[t.id];
          rows.push(
            this.row(`ap-${t.id}`, {
              selected: sel,
              icon: tabIcon(s.id, t, 16),
              label: tabLabel(s.id, t),
              sub: out[t.id] ? "window" : `${s.name}${s.machine ? ` on ${s.machine}` : ""}`,
              subRoom: 90,
              mark: n ? pill(n, { selected: sel }) : null,
              onClick: () => {
                if (out[t.id]) return raiseTorn(t.id);
                run("space.select", { id: s.id });
                run("tab.select", { id: t.id });
              },
              onClose: () => askCloseTab(t.id),
              onRight: (e) => this.tabMenu(t, e),
            }),
          );
        }
      const st = winState(win);
      if (st.open || st.min)
        rows.push(
          this.row(`ap-win-${win}`, {
            icon: path ? appImage(path, 16) : image(ICON.herdr).w(16).h(16),
            label: name === "Obsidian" ? "Notes" : name,
            sub: st.min ? "in the Dock" : "window",
            mark: n ? pill(n) : null,
            onClick: () => openWin(win),
          }),
        );
    }
    return rows;
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
    const ctx = contextLevels();
    const listed = new Map(ags.map((a) => [a.address, a]));
    const terms = terminals();
    // An agent's live threads, depth first.
    const threads = (addr, depth = 0) =>
      terms.filter((k) => k.parent === addr && k.state === "live").flatMap((k) => [{ k, depth }, ...threads(k.address, depth + 1)]);
    // A thread kept in a pane is an agent too; it stays under its agent, not beside it.
    const nested = new Set(ags.flatMap((a) => threads(a.address).map((s) => s.k.address)));
    // AGENTS: whoever needs you first (blocked, longest waiting first), then the
    // finished (newest first), then the working, then agents only for their threads.
    // An agent ranks as its most urgent thread. Idle ones show under their spaces.
    const rankOf = (x) => Math.min(RANK[x.a.status] ?? 9, ...x.subs.map((s) => RANK[threadStatus(s.k, listed)] ?? RANK.idle));
    const attn = ags
      .filter((a) => !nested.has(a.address))
      .map((a) => ({ a, subs: threads(a.address) }))
      .filter((x) => (x.a.status in RANK && x.a.status !== "idle") || x.subs.length)
      .map((x) => ({ ...x, r: rankOf(x) }))
      .sort((x, y) => x.r - y.r || (x.a.status === "blocked" ? x.a.seq - y.a.seq : x.a.status === "done" ? y.a.seq - x.a.seq : 0));
    const order = attn.flatMap((x) => [x.a.address, ...x.subs.map((s) => s.k.address).filter((t) => listed.has(t))]);
    setAgentOrder(order.concat(ags.map((a) => a.address).filter((t) => !order.includes(t))));
    // The machine running the most agents first, This Mac first on a tie.
    const load = (name) => ags.filter((a) => (all.find((s) => s.id === a.space)?.machine ?? null) === (name ?? null)).length;
    const groups = machines()
      .map((m, i) => ({ name: m.name, list: all.filter((s) => (s.machine ?? null) === (m.name ?? null)), state: m.layout, n: load(m.name), i }))
      .sort((a, b) => b.n - a.n || (a.name ? 1 : 0) - (b.name ? 1 : 0) || a.i - b.i);
    const sections = [];
    // Agents lead the list, so who needs you is never scrolled out of view.
    if (attn.length) {
      sections.push(this.heading("agents", "Agents", attn.some((x) => x.r === RANK.blocked)));
      if (!this.fold.agents)
        for (const { a, subs } of attn) {
          const sp = all.find((s) => s.id === a.space);
          const tab = sp?.tabs.find((t) => t.id === a.tab);
          sections.push(
            this.row(`ag-${a.address}`, {
              selected: a.focused,
              icon: programIcon(a.program, 16, { small: true }),
              label: tab ? tabLabel(a.space, tab) : a.program?.name ?? "Agent",
              sub: `${a.space_name}${sp?.machine ? ` on ${sp.machine}` : ""}`,
              mark: ctx.has(a.address)
                ? h_flex().gap(5).items_center().child(gauge(ctx.get(a.address), 30, 7, { selected: a.focused })).child(statusMark(a.status, { selected: a.focused }))
                : statusMark(a.status, { selected: a.focused }),
              onClick: () => {
                const t = panes().find((x) => x.terminal === a.address)?.tab;
                if (t && torn()[t]) raiseTorn(t);
                else run("agent.focus", { terminal: a.address });
              },
            }).tooltip(`${a.program?.name ?? "Agent"} in ${a.space_name} — ${a.title || a.address}${ctx.has(a.address) ? ` · context ${Math.round(ctx.get(a.address))}% full` : ""}`),
            ...subs.map((s) => this.threadRow(s, a.address, listed)),
          );
        }
    }
    const apps = this.apps(all);
    if (apps.length) {
      sections.push(this.heading("apps", "Apps"));
      if (!this.fold.apps) sections.push(...apps);
    }
    for (const g of groups) {
      const id = `m-${g.name ?? "local"}`;
      sections.push(this.heading(id, g.name ? g.name : "This Mac", g.list.some((s) => s.status === "blocked")));
      if (this.fold[id]) continue;
      if (g.state !== "ready" && !g.list.length)
        sections.push(h_flex().h(ROW).pl(18).text_size(11).italic().text_color(C.gray).child(g.state === "loading" ? "Connecting…" : "Unavailable"));
      else if (!g.list.length && g.name)
        sections.push(
          this.row(`new-${g.name}`, {
            icon: image(ICON.folderNet).w(16).h(16).opacity(0.55),
            label: "New Space…",
            onClick: () => run("space.new", { machine: g.name }),
          }).tooltip(`Make a space on ${g.name}`),
        );
      const mk = g.name ?? "";
      const shown = g.list.find((s) => s.active);
      if (shown) this.last[mk] = shown.id;
      for (const s of g.list) {
        const urgent = s.status === "blocked" || s.status === "done" || s.status === "working";
        // App tabs are listed under APPS, not here.
        const tabs = s.tabs.filter((t) => !t.settled && !isAppTab(t)).length;
        const out = torn();
        const list = s.tabs.filter((t) => (!t.settled || out[t.id]) && !isAppTab(t));
        // A space's tabs show when it's the shown space (or its machine's last shown one, so
        // showing another machine's space closes nothing here) or something there needs you,
        // unless its triangle has been clicked: that choice wins.
        const open = this.open[s.id] ?? (s.active || this.last[mk] === s.id || s.status === "blocked" || s.status === "done");
        // Only a row drawn selected gets the inverted mark.
        const sel = s.active && !open;
        sections.push(
          this.row(`sp-${s.id}`, {
            disclose: list.length ? open : null,
            onDisclose: () => (this.open[s.id] = !open),
            selected: sel,
            icon: image(s.machine ? ICON.folderNet : ICON.folder).w(16).h(16),
            label: s.name,
            mark: urgent ? statusMark(s.status, { selected: sel }) : tabs > 1 ? pill(tabs, { selected: sel }) : null,
            onClick: () => run("space.select", { id: s.id }),
            onRight: (e) => this.spaceMenu(s, e),
          }),
        );
        if (open)
          for (const t of list) {
            const named = tabLabel(s.id, t);
            sections.push(
              this.row(`tb-${t.id}`, {
                indent: 36,
                selected: s.active && t.active && !out[t.id],
                icon: tabIcon(s.id, t, 14),
                label: out[t.id] ? `${named} (window)` : named,
                mark: t.status ? statusMark(t.status, { selected: s.active && t.active }) : null,
                onClick: () => {
                  if (out[t.id]) return raiseTorn(t.id);
                  run("space.select", { id: s.id });
                  run("tab.select", { id: t.id });
                },
                onClose: () => askCloseTab(t.id),
                onRight: (e) => this.tabMenu(t, e),
              }),
            );
          }
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
      .child(
        v_flex()
          .relative()
          .flex_1()
          .min_h(0)
          .child(v_flex().id("sl-source").size_full().pb(8).overflow_y_scroll().children(sections))
          .child(Scrollbar.vertical("sl-source").mode("always").absolute().inset_0()),
      )
      .child(this.bottomBar(live));
  }

  bottomBar(live) {
    const several = machines().length > 1;
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
              several
                ? {
                    id: "sb-add",
                    glyph: GLYPH.plus,
                    size: 10,
                    menu: true,
                    w: 36,
                    tooltip: "New space…",
                    onDown: (e) => {
                      closeMenus();
                      const items = [
                        { label: "New Space on This Mac", act: { run: ["space.new", {}] } },
                        ...remoteSpaceItems(),
                        { sep: true },
                        { label: "New Space in Folder…", act: { newSpaceIn: true } },
                      ];
                      const b = e.bounds;
                      openMenu(items, b ? { x: b.x, y: b.y - menuSize(items).h - 2 } : undefined, { owner: "sb-add" });
                    },
                  }
                : { id: "sb-add", glyph: GLYPH.plus, size: 10, w: 26, tooltip: "New space", onClick: () => run("space.new", {}) },
              {
                id: "sb-gear",
                glyph: GLYPH.gear,
                size: 12,
                menu: true,
                w: 36,
                tooltip: `Actions for ${spaces().find((x) => x.active)?.name ?? "the space"}`,
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
