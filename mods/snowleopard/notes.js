// The Obsidian vault in an Aqua window (props.role "notes"; see kit.js): a
// unified title bar and toolbar (back and forward, Edit, search), a source list
// of the vault's folders and notes, the note rendered as Markdown with its
// [[wiki-links]] followed in place, and an Edit mode that saves the file (⌘S,
// or Done). Search matches note names, and their text from two letters on.
// New Note (⌘N) asks for a name above the list and makes the note in the shown
// note's folder, opened for editing.
// The bottom edge's grip resizes the window. Opened from Obsidian's Dock icon.
//
// Herdr moves an overlay window by any press its mod doesn't stop, so the
// title bar moves it and every control stops its press.

import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, TextView, EditorState, Editor, v_virtual_list } from "gpui-base";
import { props, exec, readTextFile, writeTextFile, settings, closeOverlay } from "herdr";
import {
  C, FONT, GLYPH, ICON, key, paint, rrect, vgrad, fillGrad, embossed, bead, textured, closeMenus, winState, setWin,
  closeWin, zoomWin, startTornResize,
} from "./kit.js";
import { obsidianVault } from "./kit.js";

const TITLE = 22;
const TOOLBAR = 32;
const BAR = 15;
const SIDE = 210;
const ROW = 20;

/** Obsidian's [[links]] and ![[embeds]] as Markdown links this window follows; front matter
 *  off. Code blocks and code spans are left as written. */
export function wikify(md) {
  const text = md.startsWith("---\n") && md.indexOf("\n---", 3) > 0 ? md.slice(md.indexOf("\n", md.indexOf("\n---", 3) + 1) + 1) : md;
  return codeSplit(text)
    .map((part, i) => (i % 2 ? part : links(part)))
    .join("");
}

/** Text and code, alternating (code at odd places): ``` fences and `spans`. It jumps from
 *  backtick to backtick: string calls cost far more in this runtime than in Node, so a
 *  scan of every character (or a regex) runs out a redraw's time on a long note. */
function codeSplit(md) {
  const out = [];
  let from = 0;
  let i = md.indexOf("`");
  while (i >= 0) {
    let stop = -1;
    if (md.substr(i, 3) === "```") {
      const end = md.indexOf("```", i + 3);
      stop = end < 0 ? md.length : end + 3;
    } else {
      const end = md.indexOf("`", i + 1);
      const nl = md.indexOf("\n", i + 1);
      if (end > 0 && (nl < 0 || end < nl)) stop = end + 1;
    }
    if (stop < 0) {
      i = md.indexOf("`", i + 1);
      continue;
    }
    out.push(md.slice(from, i), md.slice(i, stop));
    from = stop;
    i = md.indexOf("`", stop);
  }
  out.push(md.slice(from));
  return out;
}

function links(md) {
  return md
    .replace(/!\[\[([^\]]+)\]\]/g, (_m, t) => {
      const [target] = t.split("|");
      return `[📎 ${target}](note:${encodeURIComponent(target)})`;
    })
    .replace(/\[\[([^\]]+)\]\]/g, (_m, t) => {
      const [target, alias] = t.split("|");
      return `[${alias ?? target.replace("#", " › ")}](note:${encodeURIComponent(target)})`;
    });
}

// The vault as last read, kept across the window's copies (a resize, zoom or
// restore reopens the window): a fresh copy shows it at once, then rereads.
const KEEP = (globalThis.__snowleopardNotes ??= {});

const base = (rel) => rel.split("/").pop();
// Case-blind order. localeCompare with options is far too slow in this runtime
// for a vault's worth of names (a whole redraw's time).
const byName = (a, b) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};
const title = (rel) => base(rel).replace(/\.md$/i, "");
const dir = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");

/** a/b/../c → a/c */
function normalize(path) {
  const out = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export default class Notes {
  init(_p, cx) {
    this.size = null;
    this.lit = false;
    this.vault = null;
    this.all = []; // every file, relative to the vault
    this.notes = []; // the .md ones
    this.note = null;
    this.text = null;
    this.back = [];
    this.fwd = [];
    this.editor = null; // an EditorState while editing
    this.status = "";
    this.query = "";
    this.hits = null; // notes whose text matches the query
    this.expanded = new Set();
    this.naming = null; // the new note's name field while it's asked for
    this.search = InputState.new({ placeholder: "Search" });
    this.search.on("change", (_e, cx) => {
      this.query = this.search.value().trim();
      this.grep(cx);
      cx.notify();
    });
    this.search.on("submit", (_e, cx) => {
      const first = this.matches()[0];
      if (first) this.show(first, cx);
    });
    const vault = props()?.vault ?? null;
    if (KEEP.notes && KEEP.custom === vault) {
      Object.assign(this, { vault: KEEP.vault, all: KEEP.all, notes: KEEP.notes, folders: KEEP.folders, note: KEEP.note, text: KEEP.text, md: KEEP.md, expanded: KEEP.expanded });
    }
    cx.spawn(async (cx) => {
      try {
        // props.vault picks another folder (a demo vault); else Obsidian's open vault.
        this.vault = props()?.vault ?? (await obsidianVault());
        if (!this.vault) {
          this.status = "No Obsidian vault found.";
          return cx.notify();
        }
        // Hidden folders (.obsidian, .trash) and files are left out.
        const r = await exec("find", [this.vault, "-type", "f", "-not", "-path", "*/.*"]);
        this.all = r.stdout
          .split("\n")
          .filter((p) => p.startsWith(`${this.vault}/`))
          .map((p) => p.slice(this.vault.length + 1))
          .sort(byName);
        this.notes = this.all.filter((p) => /\.md$/i.test(p));
        this.index();
        Object.assign(KEEP, { custom: props()?.vault ?? null, vault: this.vault, all: this.all, notes: this.notes, folders: this.folders, expanded: this.expanded });
        // A copy that already shows a note keeps it.
        if (this.note && this.notes.includes(this.note)) return cx.notify();
        // The note read last here, else the one changed last.
        const last = winState("notes").last;
        const r2 = await exec("/bin/sh", ["-c", 'find "$1" -type f -name "*.md" -not -path "*/.*" -exec stat -f "%m %N" {} + | sort -rn | head -1 | cut -d" " -f2-', "sh", this.vault]);
        const recent = r2.stdout.trim().slice(this.vault.length + 1);
        const start = this.notes.includes(last) ? last : this.notes.includes(recent) ? recent : this.notes[0];
        if (start) this.show(start, cx, false);
      } catch (e) {
        this.status = `Couldn't read the vault: ${e}`;
      }
      cx.notify();
    });
  }

  abs(rel) {
    return `${this.vault}/${rel}`;
  }

  /** Shows a note (saving an edit first), keeping history for back and forward. */
  show(rel, cx, push = true) {
    cx.spawn(async (cx) => {
      if (this.editor && !(await this.save(cx))) return;
      const text = await readTextFile(this.abs(rel));
      if (text === null) {
        this.status = `“${title(rel)}” is no longer there.`;
        return cx.notify();
      }
      if (push && this.note && this.note !== rel) {
        this.back.push(this.note);
        this.fwd = [];
      }
      this.note = KEEP.note = rel;
      this.text = KEEP.text = text;
      this.md = KEEP.md = wikify(text);
      this.status = "";
      // Open the folders down to it.
      let d = dir(rel);
      while (d) {
        this.expanded.add(d);
        d = dir(d);
      }
      // Remembered when the window closes: a shared write redraws every part of the
      // layout at once, which on top of this window's own redraw runs out its time.
      cx.notify();
    });
  }

  go(stack, other, cx) {
    const rel = stack.pop();
    if (!rel) return;
    if (this.note) other.push(this.note);
    this.show(rel, cx, false);
  }

  /** A link's target among the vault's files: a path, a name, or a name with its extension. */
  resolve(target) {
    const t = decodeURIComponent(target).split("#")[0].split("^")[0].trim();
    if (!t) return this.note;
    const want = (/\.[a-z0-9]+$/i.test(t) ? t : `${t}.md`).toLowerCase();
    const near = normalize(`${dir(this.note ?? "")}/${want}`);
    return (
      this.all.find((p) => p.toLowerCase() === want) ??
      this.all.find((p) => p.toLowerCase() === near) ??
      this.all.find((p) => p.toLowerCase().endsWith(`/${want}`)) ??
      this.all.find((p) => base(p).toLowerCase() === base(want)) ??
      null
    );
  }

  link(url, cx) {
    if (/^(https?|mailto):/i.test(url)) return exec("open", [url]).catch(() => {});
    const target = url.startsWith("note:") ? url.slice(5) : url;
    const rel = this.resolve(target);
    if (!rel) {
      this.status = `No note called “${decodeURIComponent(target)}”.`;
      return cx.notify();
    }
    // Notes open here; pictures and PDFs in their own apps.
    if (/\.md$/i.test(rel)) this.show(rel, cx);
    else exec("open", [this.abs(rel)]).catch(() => {});
  }

  grep(cx) {
    const q = this.query;
    if (q.length < 2 || !this.vault) {
      this.hits = null;
      return;
    }
    cx.spawn(async (cx) => {
      try {
        const r = await exec("grep", ["-rliF", "--include=*.md", "--exclude-dir=.obsidian", "--exclude-dir=.trash", "--", q, this.vault]);
        if (q !== this.query) return;
        this.hits = new Set(r.stdout.split("\n").filter(Boolean).map((p) => p.slice(this.vault.length + 1)));
        cx.notify();
      } catch {}
    });
  }

  matches() {
    const q = this.query.toLowerCase();
    if (!q) return [];
    return this.notes.filter((p) => title(p).toLowerCase().includes(q) || this.hits?.has(p));
  }

  /** Asks for a new note's name, in a field above the list. */
  startNew(cx) {
    if (!this.vault) return;
    this.naming = InputState.new({ placeholder: "Note name" });
    this.naming.on("submit", (_e, cx) => this.create(this.naming?.value() ?? "", cx));
    this.naming.focus();
    cx.notify();
  }

  cancelNew(cx) {
    this.naming?.release();
    this.naming = null;
    cx.notify();
  }

  /** Makes the note in the shown note's folder (a free name: "Name 2" if it's taken), then edits it. */
  create(raw, cx) {
    const name = raw.replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return this.cancelNew(cx);
    const folder = this.note ? dir(this.note) : "";
    const taken = new Set(this.all.map((p) => p.toLowerCase()));
    let rel = folder ? `${folder}/${name}.md` : `${name}.md`;
    for (let i = 2; taken.has(rel.toLowerCase()); i++) rel = folder ? `${folder}/${name} ${i}.md` : `${name} ${i}.md`;
    this.cancelNew(cx);
    cx.spawn(async (cx) => {
      try {
        await writeTextFile(this.abs(rel), `# ${name}\n\n`, null);
      } catch (e) {
        this.status = `Couldn't make the note: ${e}`;
        return cx.notify();
      }
      this.all = [...this.all, rel].sort(byName);
      this.notes = this.all.filter((p) => /\.md$/i.test(p));
      this.index();
      Object.assign(KEEP, { all: this.all, notes: this.notes, folders: this.folders });
      this.query = "";
      this.search.set_value("");
      this.show(rel, cx);
      // Opened for writing once it's shown.
      cx.timer.after(150, (cx) => this.edit(cx));
    });
  }

  edit(cx) {
    if (this.text === null) return;
    this.editor = EditorState.new({
      language: "markdown",
      value: this.text,
      soft_wrap: true,
      line_numbers: false,
      folding: false,
      font_family: settings().font_family,
      font_size: 13,
    });
    cx.notify();
  }

  /** Saves an edit and leaves Edit mode (or stays in it, for ⌘S); true when nothing is left
   *  unsaved. Refuses a note changed on disk meanwhile. */
  async save(cx, stay = false) {
    if (!this.editor) return true;
    const next = this.editor.value();
    if (next !== this.text) {
      try {
        await writeTextFile(this.abs(this.note), next, this.text);
        this.text = KEEP.text = next;
        this.md = KEEP.md = wikify(next);
        this.status = "Saved.";
      } catch {
        this.status = "The note changed on disk, so this edit wasn't saved. Copy it, then reopen the note.";
        cx.notify();
        return false;
      }
    }
    if (!stay) {
      this.editor.release();
      this.editor = null;
    }
    cx.notify();
    return true;
  }

  // ---- parts

  lights(live) {
    const p = props() ?? {};
    const on = live || this.lit;
    const kinds = [
      ["close", GLYPH.close, "Close", (cx) => cx.spawn(async (cx) => (await this.save(cx)) && closeWin("notes", p.overlay, false, { last: this.note }))],
      ["min", GLYPH.minus, "Minimize to the Dock", (cx) => cx.spawn(async (cx) => (await this.save(cx)) && closeWin("notes", p.overlay, true, { last: this.note }))],
      ["zoom", GLYPH.plus, "Zoom", () => zoomWin("notes", p.overlay, { last: this.note })],
    ];
    return h_flex()
      .id("nl")
      .gap(7)
      .items_center()
      .on_hover((h, cx) => {
        this.lit = h;
        cx.notify();
      })
      .children(
        kinds.map(([kind, glyph, tip, act]) =>
          div()
            .id(`nl-${kind}`)
            .child(bead(on ? kind : "off", 14, this.lit ? glyph : null))
            .tooltip(tip)
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => act(cx)),
        ),
      );
  }

  searchField(live) {
    const w = 180;
    const h = 22;
    return div()
      .id("n-search")
      .relative()
      .flex_none()
      .w(w)
      .h(h + 1)
      .child(paint(rrect(w, h, h / 2, 0, 1), "#ffffff60", w, h + 1))
      .child(paint(rrect(w, h, h / 2), live ? "#6d6d6d" : "#a0a0a0", w, h))
      .child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), "#ffffff", w, h))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .w(w)
          .h(h)
          .pl(9)
          .pr(8)
          .gap(5)
          .items_center()
          .child(svg(GLYPH.search).flex_none().w(12).h(12).text_color("#5a5a5a"))
          .child(Input.new(this.search).flex_1().h(h).text_size(12).text_color("#000000")),
      )
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  header(w, live) {
    const editing = Boolean(this.editor);
    const name = this.note ? title(this.note) : "Notes";
    const vault = this.vault ? base(this.vault) : "";
    return div()
      .id("n-head")
      .relative()
      .flex_none()
      .w_full()
      .h(TITLE + TOOLBAR)
      .on_mouse_down("left", (e, cx) => {
        if (e.click_count >= 2) zoomWin("notes", props()?.overlay, { last: this.note });
      })
      .child(div().absolute().bottom(0).left(0).w_full().h(1).bg(live ? C.titleLine : C.titleLineOff))
      .child(
        h_flex()
          .absolute()
          .top(0)
          .left(0)
          .w_full()
          .h(TITLE)
          .justify_center()
          .items_center()
          .px(80)
          .gap(5)
          .child(image(ICON.note).flex_none().w(16).h(16).opacity(live ? 1 : 0.6))
          .child(embossed(vault ? `${name} — ${vault}` : name, { size: 13, color: live ? "#000000" : "#4d4d4d", truncate: true })),
      )
      .child(div().absolute().top(4).left(8).child(this.lights(live)))
      .child(
        h_flex()
          .absolute()
          .top(TITLE)
          .left(0)
          .w_full()
          .h(TOOLBAR)
          .px(8)
          .pb(3)
          .gap(10)
          .items_center()
          .child(
            textured([
              { id: "n-back", glyph: GLYPH.left, size: 12, w: 30, tooltip: "Back", onClick: (_e, cx) => this.go(this.back, this.fwd, cx) },
              { id: "n-fwd", glyph: GLYPH.right, size: 12, w: 30, tooltip: "Forward", onClick: (_e, cx) => this.go(this.fwd, this.back, cx) },
            ]),
          )
          .child(textured([{ id: "n-new", glyph: GLYPH.plus, size: 11, w: 34, tooltip: "New note (⌘N)", onClick: (_e, cx) => this.startNew(cx) }]))
          .child(
            textured([
              {
                id: "n-edit",
                text: editing ? "Done" : "Edit",
                w: 56,
                on: editing,
                tooltip: editing ? "Save and stop editing (⌘S saves)" : "Edit this note (⌘E)",
                onClick: (_e, cx) => (editing ? cx.spawn((cx) => this.save(cx)) : this.edit(cx)),
              },
            ]),
          )
          .child(
            textured([
              {
                id: "n-app",
                text: "Obsidian",
                w: 72,
                tooltip: "Open this note in the Obsidian app",
                onClick: () => this.note && exec("open", [`obsidian://open?path=${encodeURIComponent(this.abs(this.note))}`]).catch(() => {}),
              },
            ]),
          )
          .child(div().flex_1())
          .child(this.searchField(live)),
      );
  }

  /** Each folder's subfolders and notes, built once per load: "" is the vault itself. */
  index() {
    this.folders = new Map();
    const at = (d) => {
      if (!this.folders.has(d)) this.folders.set(d, { subs: [], notes: [] });
      return this.folders.get(d);
    };
    for (const n of this.notes) {
      at(dir(n)).notes.push(n);
      let d = dir(n);
      while (d && !at(dir(d)).subs.includes(d)) {
        at(dir(d)).subs.push(d);
        d = dir(d);
      }
    }
    for (const f of this.folders.values()) f.subs.sort(byName);
  }

  /** The source list as plain rows (no elements): folders open down to what's expanded, or the search's matches. */
  rows() {
    if (this.query) return this.matches().map((n) => ({ key: `n:${n}`, depth: 0, note: n, label: title(n), detail: dir(n) }));
    const out = [];
    const walk = (folder, depth) => {
      const f = this.folders?.get(folder);
      if (!f) return;
      for (const d of f.subs) {
        const open = this.expanded.has(d);
        out.push({ key: `f:${d}`, depth, folder: d, open, label: base(d) });
        if (open) walk(d, depth + 1);
      }
      for (const n of f.notes) out.push({ key: `n:${n}`, depth, note: n, label: title(n) });
    };
    walk("", 0);
    return out;
  }

  /** One row of the list, drawn only while it's on screen (no handlers: the list reports clicks). */
  rowEl(r) {
    const on = Boolean(r.note) && r.note === this.note;
    return h_flex()
      .id(r.key)
      .relative()
      .h(ROW)
      .w_full()
      .pl(8 + r.depth * 14)
      .pr(8)
      .gap(5)
      .items_center()
      .when(on, (el) => el.child(fillGrad(C.rowTop, C.rowBot)))
      .when(Boolean(r.folder), (el) => el.child(div().relative().flex_none().w(9).text_size(9).text_color("#6a7380").child(r.open ? "▼" : "▶")).child(image(ICON.folder).relative().flex_none().w(16).h(16)))
      .when(Boolean(r.note), (el) => el.child(image(ICON.note).relative().flex_none().ml(this.query ? 0 : 12).w(16).h(16)))
      .child(div().relative().flex_1().min_w(0).truncate().text_size(12).text_color(on ? "#ffffff" : C.text).font_weight(on ? 700 : 400).child(r.label))
      .when(Boolean(r.detail), (el) => el.child(div().relative().flex_none().max_w(80).truncate().text_size(10).text_color(on ? "#ffffffc0" : C.gray).child(r.detail)));
  }

  pick(key, cx) {
    if (key.startsWith("f:")) {
      const d = key.slice(2);
      if (this.expanded.has(d)) this.expanded.delete(d);
      else this.expanded.add(d);
      return cx.notify();
    }
    this.show(key.slice(2), cx);
  }

  sidebar(live) {
    const rows = this.rows();
    return v_flex()
      .id("n-side")
      .relative()
      .flex_none()
      .w(SIDE)
      .h_full()
      .bg(live ? C.source : C.sourceOff)
      .pt(6)
      .child(div().flex_none().px(10).pb(3).text_size(11).font_weight(700).text_color(C.heading).child(this.query ? "SEARCH" : (this.vault ? base(this.vault) : "VAULT").toUpperCase()))
      .when(Boolean(this.naming), (el) =>
        el.child(
          v_flex()
            .id("n-naming")
            .flex_none()
            .px(8)
            .pb(6)
            .gap(3)
            .child(
              div()
                .relative()
                .w(SIDE - 16)
                .h(22)
                .child(paint(rrect(SIDE - 16, 22, 3), "#3875d7", SIDE - 16, 22))
                .child(paint(rrect(SIDE - 18, 20, 2, 1, 1), "#ffffff", SIDE - 16, 22))
                .child(
                  h_flex()
                    .absolute()
                    .top(0)
                    .left(0)
                    .w(SIDE - 16)
                    .h(22)
                    .px(6)
                    .gap(5)
                    .items_center()
                    .child(image(ICON.note).flex_none().w(14).h(14))
                    .child(Input.new(this.naming).flex_1().h(22).text_size(12).text_color("#000000")),
                ),
            )
            .child(div().text_size(10).text_color(C.gray).child(`in ${this.note && dir(this.note) ? dir(this.note) : base(this.vault ?? "")} · Return makes it, Esc cancels`)),
        ),
      )
      .child(
        v_flex()
          .relative()
          .flex_1()
          .min_h(0)
          .child(
            v_virtual_list("n-rows", rows.length, ROW, (i) => rows[i].key, (range) => rows.slice(range.start, range.end).map((r) => this.rowEl(r)))
              .size_full()
              .on_item_click((key, cx) => this.pick(key, cx)),
          ),
      )
      .when(Boolean(this.query) && !rows.length, (el) => el.child(div().absolute().top(26).left(0).px(12).text_size(11).text_color(C.gray).child("No notes match.")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  page() {
    if (this.editor)
      return div()
        .id("n-edit-area")
        .flex_1()
        .min_w(0)
        .h_full()
        .flex()
        .flex_col()
        .child(Editor.new(this.editor).flex_1().min_h(0))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
    return div()
      .id("n-page")
      .flex_1()
      .min_w(0)
      .h_full()
      .bg("#ffffff")
      .px(26)
      .pt(16)
      .text_color("#1d1d1d")
      .text_size(14)
      .font_family(FONT)
      .when(this.text !== null, (el) =>
        el.child(
          TextView.markdown(`n-md-${this.note}`, this.md ?? "")
            // Not selectable (it is by default): the theme's selection color is the terminal's (dark gray in
            // Pro), which reads as black bars on this white page. Edit (⌘E) to copy text.
            .selectable(false)
            .scrollable(true)
            .on_link_click((url, cx) => this.link(url, cx)),
        ),
      )
      .when(this.text === null, (el) => el.child(div().text_size(12).text_color(C.gray).child(this.status || "Loading the vault…")))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation());
  }

  bottom(w, live) {
    const words = this.status || (this.notes.length ? `${this.notes.length} notes` : "");
    return div()
      .id("n-bar")
      .relative()
      .flex_none()
      .w_full()
      .h(BAR)
      .child(paint(rrect(w - 2, BAR, [0, 0, 4, 4]), live ? vgrad("#c9c9c9", "#a9a9a9") : vgrad("#e9e9e9", "#d6d6d6"), w - 2, BAR))
      .child(div().absolute().top(0).left(0).w_full().h(1).bg(live ? "#6a6a6a" : "#a5a5a5"))
      .child(div().absolute().top(0).left(0).w_full().h(BAR).flex().items_center().justify_center().child(embossed(words, { size: 10, color: live ? "#2b2b2b" : "#7a7a7a", truncate: true })))
      .child(
        div()
          .id("n-grip")
          .absolute()
          .bottom(0)
          .right(0)
          .w(16)
          .h(BAR)
          .flex()
          .items_end()
          .justify_end()
          .p(2)
          .cursor_nwse_resize()
          .child(svg(GLYPH.grip).w(10).h(10).text_color("#000000"))
          .tooltip("Drag to resize the window")
          .on_mouse_down("left", (e, cx) => {
            cx.stop_propagation();
            const b = e.bounds;
            if (!b || !this.size) return;
            const fw = Math.round(this.size.width);
            const fh = Math.round(this.size.height);
            startTornResize(null, e, { x: Math.round(b.x + b.width - fw), y: Math.round(b.y + b.height - fh), w: fw, h: fh }, "notes");
          }),
      );
  }

  render(_cx) {
    // Closed from elsewhere (sl.notes open: false): close, as torn-off windows do.
    const p = props() ?? {};
    if (!p.vault && (winState("notes").open === false || Boolean(winState("notes").big) !== Boolean(p.big)) && !this.closing) {
      this.closing = true;
      closeOverlay(p.overlay);
    }
    const w = this.size?.width ?? props()?.size?.[0] ?? 0;
    const h = this.size?.height ?? props()?.size?.[1] ?? 0;
    const live = key();
    return div()
      .id("root")
      .on_size_change((size, cx) => {
        this.size = size;
        cx.notify();
      })
      // A press that reaches here moves the window (Herdr): note where it is
      // first, so the window reopens in place (Herdr keeps the release).
      .on_mouse_down("left", (e) => {
        closeMenus();
        const b = e.bounds;
        const n = winState("notes");
        if (b && !n.big && (n.at?.x !== Math.round(b.x) || n.at?.y !== Math.round(b.y))) setWin("notes", { at: { x: Math.round(b.x), y: Math.round(b.y) } });
      })
      .on_key_down((e, cx) => {
        if (e.keystroke === "cmd-s" && this.editor) cx.spawn((cx) => this.save(cx, true));
        else if (e.keystroke === "cmd-n") this.startNew(cx);
        else if (e.keystroke === "escape" && this.naming) this.cancelNew(cx);
        else if (e.keystroke === "cmd-e") this.editor ? cx.spawn((cx) => this.save(cx)) : this.edit(cx);
        else if (e.keystroke === "cmd-[") this.go(this.back, this.fwd, cx);
        else if (e.keystroke === "cmd-]") this.go(this.fwd, this.back, cx);
        else return;
        cx.stop_propagation();
      })
      .relative()
      .size_full()
      .font_family(FONT)
      .text_color(C.text)
      .when(w > 0, (el) =>
        el
          .child(paint(rrect(w, h, 5), "#00000078", w, h))
          .child(paint(rrect(w - 2, h - 2, 4, 1, 1), "#ededed", w, h))
          .child(paint(rrect(w - 2, TITLE + TOOLBAR, [4, 4, 0, 0], 1, 1), live ? vgrad(C.titleTop, C.titleBot) : vgrad(C.titleTopOff, C.titleBotOff), w, h))
          .child(paint(rrect(w - 12, 1, 0, 6, 1), "#ffffffb0", w, h)),
      )
      .child(
        v_flex()
          .absolute()
          .top(1)
          .left(1)
          .w(Math.max(0, w - 2))
          .h(Math.max(0, h - 2))
          .child(this.header(w, live))
          .child(
            h_flex()
              .flex_1()
              .min_h(0)
              .w_full()
              .child(this.sidebar(live))
              .child(div().flex_none().w(1).h_full().bg("#8b8b8b"))
              .child(this.page()),
          )
          .child(this.bottom(w, live)),
      );
  }

  async close() {
    this.editor?.release();
  }
}
