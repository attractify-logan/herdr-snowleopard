// Aqua alerts and panels, opened as dialogs: props { kind, ... }.
//   confirm     { title, detail, yes, command: { name, args } }
//   closetab    { tab }    asks, then tab.close { confirmed }
//   closespace  { space }  asks, then space.close { confirmed }
//   about       About Herdr: the icon, versions, More Info and Software Update
//   forcequit   Force Quit Applications: every terminal; Force Quit asks first
//   dockapps    the applications kept in the Dock: every installed app, checked or not
//   rename      { what: "tab" | "space", id, isNew }: a name field; empty gives Herdr's name back
//   prefs       Snow Leopard Settings: Aqua checkboxes
// The default button is Aqua's pulsing blue gel; Return presses it, Escape
// cancels.

import { div, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, run, spaces, agents, panes, updates, home } from "herdr";
import {
  C, FONT, ICON, paint, rrect, vgrad, aquaButton, programIcon, plural, base, dockApps, addDockApp, removeDockApp, listApps, makeAppIcons, builtinApp, BUILTIN_APPS, appImage,
  appIcon, appName, pref, setPref, tabLabel, openSheet, bead, statusMark, perform,
} from "./kit.js";

export default class Sheet {
  init(_p, cx) {
    this.size = null;
    this.pick = null;
    this.focus = cx.focus_handle();
    this.focus.focus();
    this.apps = null;
    if (props()?.kind === "rename") {
      const p = props();
      const s = spaces().find((x) => (p.what === "space" ? x.id === p.id : x.tabs.some((t) => t.id === p.id)));
      const t = s?.tabs.find((x) => x.id === p.id);
      const named = p.what === "space" ? s?.named : t?.named;
      const start = named ? (p.what === "space" ? s.name : t.name) : "";
      // The placeholder is drawn by rename() (Aqua's grey), not by the Input.
      this.hint = p.what === "space" ? s?.name ?? "" : tabLabel(s?.id, t);
      this.dontAsk = false;
      this.input = InputState.new({ value: start });
      this.input.on("submit", () => this.doRename());
      // Redraw as the field empties or fills, so the grey name hides once typing starts.
      this.input.on("change", (_e, cx) => cx.notify());
      const focus = () => {
        this.input.focus();
        // Like Finder: the old name opens selected, so typing replaces it.
        if (start) this.input.set_selected_range({ start: 0, end: start.length });
      };
      focus();
      // As Herdr's own picker does: the keyboard isn't always the field's on the first frame.
      cx.timer.after(300, focus);
    }
    this.icons = new Set();
    if (props()?.kind === "dockapps")
      cx.spawn(async (cx) => {
        try {
          this.apps = await listApps();
          cx.notify();
          // Icons come from each app's .icns (once; they're kept).
          this.icons = await makeAppIcons(this.apps);
        } catch {
          this.apps ??= [];
        }
        cx.notify();
      });
  }

  close() {
    // "Don't ask again" holds whether OK or Cancel ends the sheet.
    if (props()?.kind === "rename" && props().isNew && this.dontAsk) setPref("askTabName", false);
    closeOverlay(props()?.overlay);
  }

  // What the alert says and does, by kind: { title, detail, yes, act } or null.
  alert(p) {
    if (p.kind === "confirm") return { title: p.title, detail: p.detail, yes: p.yes ?? "OK", act: () => (p.command ? run(p.command.name, p.command.args ?? {}) : perform(p.act)) };
    if (p.kind === "closetab") {
      const s = spaces().find((x) => x.tabs.some((t) => t.id === p.tab));
      const t = s?.tabs.find((x) => x.id === p.tab);
      if (!t) return { title: "That tab is already gone.", detail: "", yes: "OK", act: () => {} };
      const ags = agents().filter((a) => a.tab === t.id).length;
      const last = s.tabs.length === 1;
      return {
        title: `Do you want to close the tab “${tabLabel(s.id, t)}”?`,
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
    const w = this.size?.width ?? props()?.size?.[0] ?? 0;
    const h = this.size?.height ?? props()?.size?.[1] ?? 0;
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
          .child(paint(rrect(w - 12, 1, 0, 6, 1), "#ffffffc0", w, h)),
      )
      .child(div().relative().size_full().child(body));
  }

  render(_cx) {
    const p = props() ?? {};
    if (p.kind === "about") return this.about();
    if (p.kind === "forcequit") return this.forceQuit();
    if (p.kind === "dockapps") return this.dockApps();
    if (p.kind === "rename") return this.rename(p);
    if (p.kind === "prefs") return this.prefs();
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
    const w = this.size?.width ?? props()?.size?.[0] ?? 0;
    // A slim title strip with the red light, as 10.6's About panels have (only red is active).
    const strip = div()
      .relative()
      .flex_none()
      .w_full()
      .h(22)
      .child(w > 0 ? paint(rrect(w - 2, 22, 5, 1, 1), vgrad("#e8e8e8", "#c8c8c8"), w, 22) : div())
      .child(div().absolute().bottom(0).left(1).right(1).h(1).bg("#a0a0a0"))
      .child(
        div()
          .id("about-close")
          .absolute()
          .top(4)
          .left(9)
          .child(bead("close", 14, null))
          .tooltip("Close")
          .on_click(() => this.close()),
      );
    const content = v_flex()
      .flex_1()
      .w_full()
      .pt(18)
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
    return this.frame(v_flex().size_full().child(strip).child(content), ok);
  }

  doRename() {
    const p = props() ?? {};
    const name = this.input.value().trim();
    this.close();
    run(p.what === "space" ? "space.rename" : "tab.rename", { id: p.id, name });
  }

  // The space a tab is in (for the new-tab sheet's title).
  spaceName(tabId) {
    return spaces().find((x) => x.tabs.some((t) => t.id === tabId))?.name ?? "";
  }

  // An Aqua checkbox, 14 px.
  checkbox(on, centered = false) {
    return div()
      .relative()
      .flex_none()
      .mt(centered ? 0 : 1)
      .w(14)
      .h(14)
      .child(paint(rrect(14, 14, 3), on ? "#2a5db5" : "#8e8e8e", 14, 14))
      .child(paint(rrect(12, 12, 2, 1, 1), on ? vgrad("#7fb2f2", "#2f6fd6") : vgrad("#ffffff", "#e3e3e3"), 14, 14))
      .when(on, (el) => el.child(div().absolute().top(-2).left(2).text_size(12).font_weight(700).text_color("#ffffff").child("✓")));
  }

  rename(p) {
    const w = 300;
    const h = 24;
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
          .child(div().text_size(13).font_weight(700).child(p.isNew ? `Name the new tab in “${this.spaceName(p.id)}”:` : p.what === "space" ? "Rename Space" : "Rename Tab"))
          .child(
            div()
              .relative()
              .w(w)
              .h(h)
              .child(paint(rrect(w, h, 3), "#8e8e8e", w, h))
              .child(paint(rrect(w - 2, h - 2, 2, 1, 1), "#ffffff", w, h))
              .child(paint(rrect(w - 2, 2, 0, 1, 1), "#00000014", w, h))
              // The name it will get, in Aqua's placeholder grey, while the field is empty.
              .when(this.input.value() === "", (el) => el.child(div().absolute().top(0).left(6).h(h).flex().items_center().text_size(13).text_color("#a0a0a0").child(this.hint)))
              .child(h_flex().absolute().top(0).left(0).w(w).h(h).px(6).items_center().child(Input.new(this.input).flex_1().h(h).text_size(13).text_color("#000000"))),
          )
          .child(
            p.isNew
              ? h_flex()
                  .id("rn-dont")
                  .gap(6)
                  .items_center()
                  .child(this.checkbox(this.dontAsk, true))
                  .child(div().text_size(11).child("Don't ask again"))
                  .on_click((_e, cx) => {
                    this.dontAsk = !this.dontAsk;
                    cx.notify();
                  })
              : div().text_size(11).text_color(C.gray).child(p.what === "space" ? "Leave it empty to name the space after its folder again." : "Leave it empty to name the tab after its program again."),
          )
          .child(div().flex_1())
          .child(h_flex().justify_end().gap(12).child(aquaButton("rn-cancel", "Cancel", () => this.close())).child(aquaButton("rn-ok", p.isNew ? "OK" : "Rename", () => this.doRename(), { primary: true }))),
      );
    return this.frame(body, () => this.doRename());
  }

  prefs() {
    const box = (id, label, detail, key) => {
      const on = pref(key);
      return h_flex()
        .id(id)
        .gap(8)
        .items_start()
        .child(this.checkbox(on))
        .child(v_flex().gap(2).child(div().text_size(12).child(label)).when(Boolean(detail), (el) => el.child(div().text_size(11).text_color(C.gray).child(detail))))
        .on_click((_e, cx) => {
          setPref(key, !on);
          cx.notify();
        });
    };
    const done = () => this.close();
    const body = v_flex()
      .size_full()
      .p(18)
      .gap(12)
      .child(div().text_size(13).font_weight(700).child("Snow Leopard Settings"))
      .child(box("pf-ask", "Ask for a name when I make a new tab", "Herdr asks for a name when you press ⌘T or +.", "askTabName"))
      .child(box("pf-bounce", "Bounce a space in the Dock when an agent needs me", "", "bounce"))
      .child(box("pf-notice", "Show a notice when an agent needs me", "", "notice"))
      .child(box("pf-done-badge", "Count finished agents in Dock badges", "", "doneBadge"))
      .child(box("pf-usage", "Show Claude and Codex usage in the menu bar", "", "usage"))
      .child(box("pf-dock-hide", "Automatically hide and show the Dock", "It slides back up when the pointer reaches the bottom edge.", "dockAutoHide"))
      .child(div().flex_1())
      .child(h_flex().justify_end().child(aquaButton("pf-done", "Done", done, { primary: true })));
    return this.frame(body, done);
  }

  dockApps() {
    const kept = new Set(dockApps().map((a) => a.path));
    const hasIcon = (path) => builtinApp(path) || this.icons.has(appIcon(path).split("/").pop());
    // The built-in apps lead the list, unless the real one is installed (its icon opens the same window).
    const real = new Set((this.apps ?? []).map(appName));
    const built = this.apps === null ? [] : Object.entries(BUILTIN_APPS).filter(([n]) => !real.has(n)).map(([, b]) => b.path);
    const rows = [...built, ...(this.apps ?? [])].map((path, i) => {
      const on = kept.has(path);
      return h_flex()
        .id(`da-${i}`)
        .relative()
        .h(26)
        .px(8)
        .gap(8)
        .items_center()
        .bg(i % 2 ? "#f3f6fa" : "#ffffff")
        // An Aqua checkbox.
        .child(
          div()
            .relative()
            .flex_none()
            .w(14)
            .h(14)
            .child(paint(rrect(14, 14, 3), on ? "#2a5db5" : "#8e8e8e", 14, 14))
            .child(paint(rrect(12, 12, 2, 1, 1), on ? vgrad("#7fb2f2", "#2f6fd6") : vgrad("#ffffff", "#e3e3e3"), 14, 14))
            .when(on, (el) => el.child(div().absolute().top(-2).left(2).text_size(12).font_weight(700).text_color("#ffffff").child("✓"))),
        )
        .child(hasIcon(path) ? appImage(path, 20) : div().flex_none().w(20).h(20))
        .child(div().flex_1().min_w(0).truncate().text_size(12).child(appName(path)))
        // Obsidian, Slack, Linear and Messages open inside Herdr (kit.js WIN_APPS), not in their own apps.
        .child(div().flex_none().text_size(10).text_color(C.gray).child(["Obsidian", "Slack", "Linear", "Messages"].includes(appName(path)) ? "Opens inside Herdr" : path.startsWith("/System/") ? "System" : ""))
        .on_click((_e, cx) => {
          if (on) removeDockApp(path);
          else addDockApp(path);
          cx.notify();
        });
    });
    const done = () => this.close();
    const body = v_flex()
      .size_full()
      .p(16)
      .gap(10)
      .child(div().text_size(13).font_weight(700).child("Applications in the Dock"))
      .child(div().text_size(11).line_height(1.35).child("Check the applications to keep in the Dock beside Herdr. Click one there to open it; right-click it to open the shown space's folder in it."))
      .child(
        v_flex()
          .id("da-list")
          .flex_1()
          .min_h(0)
          .border_1()
          .border_color("#8e8e8e")
          .bg("#ffffff")
          .overflow_y_scroll()
          .when(this.apps === null, (el) => el.child(div().p(10).text_size(11).text_color(C.gray).child("Looking for applications…")))
          .children(rows),
      )
      .child(h_flex().justify_end().child(aquaButton("da-done", "Done", done, { primary: true })));
    return this.frame(body, done);
  }

  forceQuit() {
    const list = panes().filter((p) => p.terminal);
    const all = spaces();
    // "<tab> in <space>", " on <machine>" when remote, and the folder only if it isn't the space's name.
    const where = (p) => {
      const s = all.find((x) => x.tabs.some((t) => t.id === p.tab));
      if (!s) return "";
      const t = s.tabs.find((x) => x.id === p.tab);
      const dir = base(p.cwd, home());
      return `${tabLabel(s.id, t)} in ${s.name}${s.machine ? ` on ${s.machine}` : ""}${dir && dir !== s.name ? ` · ${dir}` : ""}`;
    };
    const chosen = list.find((p) => p.terminal === this.pick);
    const name = (p) => (p.program && !p.program.shell ? p.program.name : p.program?.name ?? "shell");
    // A real alert, as 10.6 asks it.
    const kill = () => {
      if (!chosen) return;
      this.close();
      openSheet("confirm", {
        title: `Do you want to force “${name(chosen)}” to quit?`,
        detail: "You will lose any unsaved work in it.",
        yes: "Force Quit",
        command: { name: "terminal.kill", args: { terminal: chosen.terminal } },
      });
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
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(on ? "#ffffffc0" : C.gray).child(where(p)))
        .child(statusMark(p.status, { selected: on }))
        .on_click((_e, cx) => {
          this.pick = p.terminal;
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
