// Aqua alerts and panels, opened as dialogs: props { kind, ... }.
//   confirm     { title, detail, yes, command: { name, args } }
//   closetab    { tab }    asks, then tab.close { confirmed }
//   closespace  { space }  asks, then space.close { confirmed }
//   about       About Herdr: the icon, versions, More Info and Software Update
//   forcequit   Force Quit Applications: every terminal; Force Quit asks first
// The default button is Aqua's pulsing blue gel; Return presses it, Escape
// cancels.

import { div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay, run, spaces, agents, panes, updates, home } from "herdr";
import { C, FONT, ICON, paint, rrect, vgrad, aquaButton, programIcon, plural, base } from "./kit.js";

export default class Sheet {
  init(_p, cx) {
    this.size = null;
    this.pick = null;
    this.asking = false;
    this.focus = cx.focus_handle();
    this.focus.focus();
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  // What the alert says and does, by kind: { title, detail, yes, act } or null.
  alert(p) {
    if (p.kind === "confirm") return { title: p.title, detail: p.detail, yes: p.yes ?? "OK", act: () => run(p.command.name, p.command.args ?? {}) };
    if (p.kind === "closetab") {
      const s = spaces().find((x) => x.tabs.some((t) => t.id === p.tab));
      const t = s?.tabs.find((x) => x.id === p.tab);
      if (!t) return { title: "That tab is already gone.", detail: "", yes: "OK", act: () => {} };
      const ags = agents().filter((a) => a.tab === t.id).length;
      const last = s.tabs.length === 1;
      return {
        title: `Do you want to close the tab “${t.name}”?`,
        detail: `${ags ? `${plural(ags, "agent")} and every terminal in it` : `Every terminal in it`} will be ended.${last ? ` It's the last tab, so the space “${s.name}” closes too.` : ""}`,
        yes: "Close",
        act: () => run("tab.close", { id: t.id, confirmed: true }),
      };
    }
    if (p.kind === "closespace") {
      const s = spaces().find((x) => x.id === p.space);
      if (!s) return { title: "That space is already gone.", detail: "", yes: "OK", act: () => {} };
      const ags = agents().filter((a) => a.space === s.id).length;
      return {
        title: `Do you want to close the space “${s.name}”?`,
        detail: `Its ${plural(s.tabs.length, "tab")}${ags ? `, ${plural(ags, "agent")}` : ""} and every terminal in it will be ended. This can't be undone.`,
        yes: "Close",
        act: () => run("space.close", { id: s.id, confirmed: true }),
      };
    }
    return null;
  }

  key(e, cx, ok) {
    if (e.key === "enter") ok?.();
    else if (e.key === "escape") this.close();
    else return;
    cx.stop_propagation();
  }

  frame(body, ok) {
    const w = this.size?.width ?? 0;
    const h = this.size?.height ?? 0;
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      .track_focus(this.focus)
      .on_key_down((e, cx) => this.key(e, cx, ok))
      .relative()
      .size_full()
      .font_family(FONT)
      .text_color(C.text)
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, 6), "#00000070", w, h))
          .child(paint(rrect(w - 2, h - 2, 5, 1, 1), vgrad("#f0f0f0", "#e4e4e4"), w, h))
          .child(paint(rrect(w - 4, 1, 0, 2, 1), "#ffffffc0", w, h)),
      )
      .child(div().relative().size_full().child(body));
  }

  render(_cx) {
    const p = props() ?? {};
    if (p.kind === "about") return this.about();
    if (p.kind === "forcequit") return this.forceQuit();
    const a = this.alert(p) ?? { title: "Unknown sheet", detail: p.kind, yes: "OK", act: () => {} };
    const ok = () => {
      this.close();
      a.act();
    };
    const body = h_flex()
      .size_full()
      .p(20)
      .gap(16)
      .items_start()
      .child(image(ICON.herdr).flex_none().w(64).h(64))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(8)
          .child(div().text_size(13).font_weight(700).child(a.title))
          .when(Boolean(a.detail), (el) => el.child(div().text_size(11).line_height(1.35).child(a.detail)))
          .child(div().flex_1().min_h(10))
          .child(
            h_flex()
              .justify_end()
              .gap(12)
              .when(a.yes !== "OK", (el) => el.child(aquaButton("cancel", "Cancel", () => this.close())))
              .child(aquaButton("ok", a.yes, ok, { primary: true })),
          ),
      );
    return this.frame(body, ok);
  }

  about() {
    const u = updates();
    const ok = () => this.close();
    const body = v_flex()
      .size_full()
      .pt(24)
      .pb(18)
      .px(24)
      .items_center()
      .gap(6)
      .child(image(ICON.herdr).w(112).h(112))
      .child(div().pt(6).text_size(26).font_family("Helvetica").font_weight(300).child("Herdr"))
      .child(div().text_size(11).text_color(C.dim).child(`Version ${u?.app?.version ?? "?"}`))
      .child(div().pt(8).text_size(11).text_color(C.dim).child(`herdr-core ${u?.core?.version ?? "not found"}${u?.core?.managed ? ` (${u.core.managed})` : ""}`))
      .child(div().text_size(11).text_color(C.dim).child(u?.app?.ready ? `Update ${u.app.ready} is ready to install.` : "Herdr is up to date."))
      .child(div().flex_1())
      .child(
        h_flex()
          .gap(12)
          .child(aquaButton("info", "More Info…", () => {
            this.close();
            run("app.whats_new");
          }))
          .child(aquaButton("update", "Software Update…", () => {
            this.close();
            run(u?.app?.ready ? "app.update" : "app.check_updates");
          }, { primary: Boolean(u?.app?.ready) })),
      )
      .child(div().pt(12).text_size(9).text_color(C.gray).child("Snow Leopard layout for Herdr"));
    return this.frame(body, ok);
  }

  forceQuit() {
    const list = panes().filter((p) => p.terminal);
    const all = spaces();
    const where = (p) => {
      const s = all.find((x) => x.tabs.some((t) => t.id === p.tab));
      const t = s?.tabs.find((x) => x.id === p.tab);
      return s ? `${s.name} › ${t?.name ?? ""}` : "";
    };
    const chosen = list.find((p) => p.terminal === this.pick);
    const name = (p) => (p.program && !p.program.shell ? p.program.name : p.program?.name ?? "shell");
    const kill = () => {
      if (!chosen) return;
      if (!this.asking) {
        this.asking = true;
        return;
      }
      this.close();
      run("terminal.kill", { terminal: chosen.terminal });
    };
    const rows = list.map((p, i) => {
      const on = p.terminal === this.pick;
      return h_flex()
        .id(`fq-${p.terminal}`)
        .relative()
        .h(24)
        .px(6)
        .gap(8)
        .items_center()
        .bg(on ? C.rowBot : i % 2 ? "#f3f6fa" : "#ffffff")
        .text_color(on ? "#ffffff" : C.text)
        .child(programIcon(p.program, 18, { small: true }))
        .child(div().flex_none().text_size(12).child(name(p)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(on ? "#ffffffc0" : C.gray).child(`${where(p)} · ${base(p.cwd, home())}`))
        .on_click((_e, cx) => {
          this.pick = p.terminal;
          this.asking = false;
          cx.notify();
        });
    });
    const body = v_flex()
      .size_full()
      .p(16)
      .gap(10)
      .child(div().text_size(13).font_weight(700).child("Force Quit Applications"))
      .child(div().text_size(11).line_height(1.35).child("If a program doesn't respond for a while, select its name and click Force Quit. Its terminal is ended."))
      .child(
        v_flex()
          .id("fq-list")
          .flex_1()
          .min_h(0)
          .border_1()
          .border_color("#8e8e8e")
          .bg("#ffffff")
          .overflow_y_scroll()
          .children(rows),
      )
      .when(this.asking && Boolean(chosen), (el) => el.child(div().text_size(11).font_weight(700).text_color("#9c1b10").child(`Force “${name(chosen)}” in ${where(chosen)} to quit? Click Force Quit again.`)))
      .child(
        h_flex()
          .justify_end()
          .gap(12)
          .child(aquaButton("fq-cancel", "Cancel", () => this.close()))
          .child(aquaButton("fq-kill", "Force Quit", kill, { primary: Boolean(chosen) })),
      );
    return this.frame(body, kill);
  }
}
