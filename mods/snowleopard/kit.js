// Snow Leopard's drawing kit: Aqua colors, gradients, glossy beads (the
// traffic lights, badges), textured buttons, menus and sheets, shared by
// every role of the snowleopard mod.
//
// Shapes with rounded corners are painted as paths in px (GPUI doesn't clip a
// gradient to a rounded box), so the roles measure themselves first
// (on_size_change) and draw once they know their size.

import { div, svg, image, PathBuilder, Background } from "gpui-kit";
import { h_flex } from "gpui-base";
import {
  keys, machines, terminals, openOverlay, closeOverlay, pickFolder, shared, setShared, run, exec, spaces, agents, panes, layout, appHome, home, readTextFile,
  window as appWindow,
} from "herdr";

export const A = "mods/snowleopard";
export const FONT = "Lucida Grande";

export const C = {
  text: "#000000",
  label: "#262626",
  dim: "#4c4c4c",
  gray: "#7a7a7a",
  disabled: "#a3a3a3",
  emboss: "#ffffffb0",
  window: "#ededed",
  // Menus: the bar, the selection, the translucent white menus.
  barTop: "#f8f8f8f0",
  barBot: "#d3d3d3f0",
  barLine: "#7d7d7d",
  selTop: "#6c87f4",
  selBot: "#2c58e8",
  selLine: "#5470ee",
  menu: "#f6f6f6f4",
  menuEdge: "#00000033",
  sepLine: "#dedede",
  // The unified title bar and toolbar, key and not.
  titleTop: "#e9e9e9",
  titleBot: "#a6a6a6",
  titleTopOff: "#f7f7f7",
  titleBotOff: "#d6d6d6",
  titleLine: "#525252",
  titleLineOff: "#8f8f8f",
  // The source list.
  source: "#dee4ea",
  sourceOff: "#e8e8e8",
  heading: "#646f7c",
  rowTop: "#5f95d9",
  rowBot: "#2361c1",
  rowLine: "#4b85cf",
  rowTopOff: "#a5b3c6",
  rowBotOff: "#8394ad",
  rowLineOff: "#9aa8bd",
  badge: "#8b9cb7",
  badgeOff: "#a8a8a8",
  // Status colors in Aqua: graphite spinner, Mail's blue dot, a red badge.
  blue: "#3b7cef",
  red: "#e23b2e",
  amber: "#f0a315",
  focus: "#5b93e3",
};

export const ICON = {
  note: `${A}/icons/note.svg`,
  folder: `${A}/icons/folder.svg`,
  folderNet: `${A}/icons/folder-net.svg`,
  // For the Dock, which engraves initials where these have their mark.
  folderPlain: `${A}/icons/folder-plain.svg`,
  folderNetPlain: `${A}/icons/folder-net-plain.svg`,
  terminal: `${A}/icons/terminal.svg`,
  trash: `${A}/icons/trash.svg`,
  herdr: `${A}/img/herdr.png`,
  linearApp: `${A}/icons/linear-app.svg`,
};

export const GLYPH = {
  search: `${A}/icons/search.svg`,
  gear: `${A}/icons/gear.svg`,
  plus: `${A}/icons/plus.svg`,
  refresh: `${A}/icons/refresh.svg`,
  left: `${A}/icons/chevron-left.svg`,
  right: `${A}/icons/chevron-right.svg`,
  down: `${A}/icons/chevron-down.svg`,
  splitRight: `${A}/icons/split-right.svg`,
  splitDown: `${A}/icons/split-down.svg`,
  zoom: `${A}/icons/zoom.svg`,
  sidebar: `${A}/icons/sidebar.svg`,
  check: `${A}/icons/check.svg`,
  spinner: `${A}/icons/spinner.svg`,
  wifi: `${A}/icons/wifi.svg`,
  agents: `${A}/icons/agents.svg`,
  close: `${A}/icons/x.svg`,
  minus: `${A}/icons/minus.svg`,
  grip: `${A}/icons/grip.svg`,
  inbox: `${A}/icons/inbox.svg`,
  person: `${A}/icons/person.svg`,
  project: `${A}/icons/project.svg`,
};

/** Is the Herdr window key? Inactive windows go flat and gray, as in Aqua.
 *  Torn-off windows go with it: Herdr doesn't report which overlay window's
 *  terminal has the keyboard (focused() names only layout blocks), so every
 *  Aqua window looks active while Herdr is in front. */
export function key() {
  return appWindow()?.active !== false;
}

// ---- text

/** The root of every role: Lucida Grande, black, 13 px. */
export function root(el, size = 13) {
  return el.font_family(FONT).text_size(size).text_color(C.text);
}

/** Text with Aqua's white emboss under it (title bars, headings, status bars). */
export function embossed(text, o = {}) {
  const size = o.size ?? 13;
  const lead = o.lead ?? size + 3;
  const face = (color) => {
    let el = div().whitespace_nowrap().text_size(size).line_height(`${lead}px`).text_color(color).child(text);
    if (o.bold) el = el.font_weight(700);
    if (o.truncate) el = el.truncate();
    return el;
  };
  return div()
    .relative()
    .min_w(0)
    .map((el) => (o.truncate ? el.flex_shrink(1) : el.flex_none()))
    .child(face(o.shadow ?? C.emboss).absolute().top(1).left(0).w_full())
    .child(face(o.color ?? C.text).relative());
}

// ---- paths and gradients

/** A rounded rectangle path in px; r is a number or [tl, tr, br, bl]. */
// Built paths and gradients are immutable native values, and building one is
// many calls into the host: every part redraws its chrome often, so they're
// kept by their arguments. (Redraws share a time budget; see RECIPE.md.)
const PATHS = new Map();
const GRADS = new Map();
function cached(map, key, make) {
  let v = map.get(key);
  if (v === undefined) {
    if (map.size > 4000) map.clear();
    v = make();
    map.set(key, v);
  }
  return v;
}

export function rrect(w, h, r = 0, x = 0, y = 0) {
  return cached(PATHS, `r${w},${h},${r},${x},${y}`, () => buildRrect(w, h, r, x, y));
}

function buildRrect(w, h, r, x, y) {
  const [tl, tr, br, bl] = (Array.isArray(r) ? r : [r, r, r, r]).map((n) => Math.max(0, Math.min(n, w / 2, h / 2)));
  let b = PathBuilder.fill().move_to(x + tl, y).line_to(x + w - tr, y);
  if (tr) b = b.arc_to(tr, tr, 0, false, true, x + w, y + tr);
  b = b.line_to(x + w, y + h - br);
  if (br) b = b.arc_to(br, br, 0, false, true, x + w - br, y + h);
  b = b.line_to(x + bl, y + h);
  if (bl) b = b.arc_to(bl, bl, 0, false, true, x, y + h - bl);
  b = b.line_to(x, y + tl);
  if (tl) b = b.arc_to(tl, tl, 0, false, true, x + tl, y);
  return b.close().build();
}

/** An ellipse path in px. */
export function oval(w, h, x = 0, y = 0) {
  return cached(PATHS, `o${w},${h},${x},${y}`, () => buildOval(w, h, x, y));
}

function buildOval(w, h, x, y) {
  const rx = w / 2;
  const ry = h / 2;
  return PathBuilder.fill()
    .move_to(x, y + ry)
    .arc_to(rx, ry, 0, false, true, x + w, y + ry)
    .arc_to(rx, ry, 0, false, true, x, y + ry)
    .close()
    .build();
}

/** A vertical gradient, top to bottom. */
export function vgrad(top, bottom) {
  return cached(GRADS, `${top},${bottom}`, () => Background.linear_gradient(180, top, bottom));
}

/** Paints a path (in px, from the parent's top left) over a relative parent. */
export function paint(path, bg, w, h) {
  return window.paint_path(path, bg).absolute().top(0).left(0).w(w).h(h);
}

let RECT_PATH = null;
const RECT = () => (RECT_PATH ??= buildRect());
const buildRect = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();

/** A layer that fills its relative parent with a top-to-bottom gradient. */
export function fillGrad(top, bottom) {
  return window.paint_path(RECT(), vgrad(top, bottom)).absolute().top(0).left(0).size_full();
}

// ---- beads: the traffic lights and anything glassy and round

const BEAD = {
  close: { rim: "#8e2f27", top: "#c8382d", bottom: "#ff9d8f", glyph: "#4d0a03" },
  min: { rim: "#8f6510", top: "#cf930f", bottom: "#ffe68f", glyph: "#5b3c00" },
  zoom: { rim: "#2f6f17", top: "#47961b", bottom: "#c5f48f", glyph: "#174203" },
  off: { rim: "#8a8a8a", top: "#a7a7a7", bottom: "#ededed", glyph: "#4a4a4a" },
  blue: { rim: "#1e4fa8", top: "#2a64d8", bottom: "#a9d0ff", glyph: "#ffffff" },
  red: { rim: "#a01a10", top: "#d22a1c", bottom: "#ff8a74", glyph: "#ffffff" },
};

/**
 * A glass bead: rim, a lit-from-below body and a specular cap. kind: close,
 * min, zoom, off, blue, red. glyph: an svg path drawn in the bead's
 * glyph color (the traffic lights show theirs on hover).
 */
export function bead(kind, size, glyph = null) {
  const c = BEAD[kind] ?? BEAD.off;
  const s = size;
  const capW = s * 0.62;
  const capH = s * 0.42;
  let el = div()
    .relative()
    .flex_none()
    .w(s)
    .h(s)
    .child(paint(oval(s, s), c.rim, s, s))
    .child(paint(oval(s - 2, s - 2, 1, 1), vgrad(c.top, c.bottom), s, s))
    .child(paint(oval(capW, capH, (s - capW) / 2, s * 0.09), vgrad("#ffffffe6", "#ffffff10"), s, s));
  if (glyph)
    el = el.child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .child(svg(glyph).w(s * 0.5).h(s * 0.5).text_color(c.glyph)),
    );
  // The traffic lights darken while pressed, as Aqua's do.
  if (kind === "close" || kind === "min" || kind === "zoom" || kind === "off")
    el = el.child(div().id(`bead-${kind}`).absolute().top(0).left(0).size_full().rounded_full().active((st) => st.bg("#00000052")));
  return el;
}

/**
 * Safari 4 and Terminal's tab close button: a flat gray disc with a white
 * ×, darker under the pointer and when pressed. No gloss.
 */
export function tabClose(size, hot = false) {
  const s = size;
  return div()
    .relative()
    .flex_none()
    .w(s)
    .h(s)
    .child(paint(oval(s, s, 0, 1), "#ffffff66", s, s + 1))
    .child(paint(oval(s, s), hot ? "#555555" : "#888888", s, s))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .child(svg(GLYPH.close).w(s * 0.56).h(s * 0.56).text_color("#ffffff")),
    );
}

/** How full each Claude Code session's context is: terminal address → percent,
 *  from the `sl.context` label claude-code/snowleopard-context.py sets. */
// terminals() hands over every terminal on every machine, so it's read at most
// every 3 s and shared by every part that draws a gauge (redraws share a budget).
let LEVELS = new Map();
let LEVELS_AT = 0;

export function contextLevels() {
  const now = Date.now();
  if (now - LEVELS_AT < 3000) return LEVELS;
  LEVELS_AT = now;
  const out = new Map();
  for (const t of terminals() ?? []) {
    const v = Number(t?.labels?.["sl.context"]);
    if (t?.address && Number.isFinite(v)) out.set(t.address, v);
  }
  LEVELS = out;
  return out;
}

/** An Aqua progress bar: a recessed gray track with a glossy fill, blue, amber
 *  from 70% and red from 85%, as Claude Code's context gauge shows it. With
 *  o.left the fill is what's left, amber from 30% left and red from 15%. */
export function gauge(pct, w = 34, h = 7, o = {}) {
  const fill = Math.max(0, Math.min(w - 2, Math.round(((w - 2) * pct) / 100)));
  const used = o.left ? 100 - pct : pct;
  const [top, bottom] = used >= 85 ? ["#ff8a74", "#c41606"] : used >= 70 ? ["#ffd27a", "#d98a06"] : ["#9cc4f6", "#2a64d8"];
  return div()
    .relative()
    .flex_none()
    .w(w)
    .h(h)
    .child(paint(rrect(w, h, h / 2), o.selected ? "#ffffff90" : "#7d7d7d", w, h))
    .child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), vgrad("#b9b9b9", "#ececec"), w, h))
    .when(fill > 1, (el) =>
      el
        .child(paint(rrect(Math.max(fill, h - 2), h - 2, (h - 2) / 2, 1, 1), vgrad(top, bottom), w, h))
        .child(paint(rrect(Math.max(fill - 2, 1), Math.max(1, (h - 2) / 2 - 0.5), (h - 2) / 4, 2, 1.5), "#ffffff70", w, h)),
    );
}

/** A left-to-right gradient. */
export function hgrad(left, right) {
  return cached(GRADS, `h${left},${right}`, () => Background.linear_gradient(90, left, right));
}

function tri(up, x, y) {
  return cached(PATHS, `t${up},${x},${y}`, () =>
    (up ? PathBuilder.fill().move_to(x + 3.5, y).line_to(x + 7, y + 5).line_to(x, y + 5) : PathBuilder.fill().move_to(x, y).line_to(x + 7, y).line_to(x + 3.5, y + 5)).close().build(),
  );
}

const SCROLL_W = 15;
const SCROLL_ARROW = 15;

/**
 * Aqua's vertical scrollbar, for a list that scrolls itself and paints none (the
 * list says only which rows it drew): a grooved track, a glossy blue thumb (gray
 * in a window in back) sized to the rows on screen, and both arrows at the
 * bottom, as Snow Leopard sets them. o: { id, state (an object the view keeps),
 * live, count, first, shown, onStep(dir, cx), onPage(dir, cx), onDrag(first, cx) }.
 * The thumb drags while the view passes its mouse moves to dragScroll(state, ...)
 * and its mouse ups to endScroll(state).
 */
export function aquaScrollbar(o) {
  const st = o.state;
  const h = st.h ?? 0;
  const track = Math.max(0, h - 2 * SCROLL_ARROW);
  const w = SCROLL_W;
  const can = o.count > 0 && o.shown < o.count;
  const th = can ? Math.max(22, Math.min(track, Math.round((o.shown / o.count) * track))) : 0;
  const ty = can ? Math.min(track - th, Math.round((o.first / Math.max(1, o.count - o.shown)) * (track - th))) : 0;
  const ink = o.live ? "#2e2e2e" : "#8c8c8c";
  const arrow = (up) =>
    div()
      .id(`${o.id}-${up ? "up" : "down"}`)
      .absolute()
      .left(0)
      .top(track + (up ? 0 : SCROLL_ARROW))
      .w(w)
      .h(SCROLL_ARROW)
      .child(paint(rrect(w - 1, SCROLL_ARROW, 0, 1, 0), hgrad("#fbfbfb", "#d9d9d9"), w, SCROLL_ARROW))
      .child(div().absolute().top(0).left(1).w(w - 1).h(1).bg("#a9a9a9"))
      .child(paint(tri(up, 4.5, 5), ink, w, SCROLL_ARROW))
      .active((s) => s.opacity(0.6))
      .on_mouse_down("left", (_e, cx) => {
        cx.stop_propagation();
        if (can) o.onStep(up ? -1 : 1, cx);
      });
  return div()
    .id(o.id)
    .relative()
    .flex_none()
    .w(w)
    .h_full()
    .on_size_change((size, cx) => {
      if (Math.round(size.height) !== st.h) {
        st.h = Math.round(size.height);
        cx.notify();
      }
    })
    .child(div().absolute().top(0).left(0).w(1).h_full().bg("#a3a3a3"))
    .when(h > 0, (el) =>
      el
        .child(paint(rrect(w - 1, track, 0, 1, 0), hgrad("#d2d2d2", "#f9f9f9"), w, h))
        .child(paint(rrect(w - 5, Math.max(0, track - 4), (w - 5) / 2, 3, 2), hgrad("#c4c4c4", "#ececec"), w, h))
        .when(can, (el) =>
          el
            .child(paint(rrect(w - 3, th, (w - 3) / 2, 2, ty), o.live ? "#2756ad" : "#8a8a8a", w, h))
            .child(paint(rrect(w - 5, th - 2, (w - 5) / 2, 3, ty + 1), o.live ? hgrad("#4f8fec", "#b4d8ff") : hgrad("#b9b9b9", "#efefef"), w, h))
            .child(paint(rrect(4, Math.max(2, th - 8), 2, 4, ty + 4), o.live ? "#ffffff8c" : "#ffffffa0", w, h)),
        )
        .child(
          div()
            .id(`${o.id}-track`)
            .absolute()
            .top(0)
            .left(0)
            .w(w)
            .h(track)
            .on_mouse_down("left", (e, cx) => {
              cx.stop_propagation();
              if (!can || !e.bounds) return;
              const y = e.position.y - e.bounds.y;
              if (y >= ty && y <= ty + th) st.drag = { y: e.position.y, first: o.first, per: Math.max(1, o.count - o.shown) / Math.max(1, track - th), onDrag: o.onDrag };
              else o.onPage(y < ty ? -1 : 1, cx);
            }),
        )
        .child(arrow(true))
        .child(arrow(false)),
    );
}

/** A mouse move over the view while the thumb is held. */
export function dragScroll(st, e, cx) {
  const d = st.drag;
  if (!d) return;
  const first = Math.max(0, Math.round(d.first + (e.position.y - d.y) * d.per));
  if (first !== d.last) {
    d.last = first;
    d.onDrag(first, cx);
  }
}

export function endScroll(st) {
  st.drag = null;
}

/** Aqua's red count badge (the Dock's, Mail's): white rim, glossy red, bold white digits. */
export function countBadge(text, h = 20) {
  const label = String(text);
  const w = Math.max(h, 8 + label.length * (h * 0.42));
  return div()
    .relative()
    .flex_none()
    .w(w)
    .h(h)
    .child(paint(rrect(w, h, h / 2), "#ffffff", w, h))
    .child(paint(rrect(w - 3, h - 3, (h - 3) / 2, 1.5, 1.5), vgrad("#f5604c", "#c41606"), w, h))
    .child(paint(rrect(w - 7, h * 0.42, h * 0.21, 3.5, 2.5), vgrad("#ffffffa0", "#ffffff08"), w, h))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .font_family("Helvetica")
        .font_weight(700)
        .text_size(h * 0.6)
        .text_color("#ffffff")
        .child(label),
    );
}

/** A source list's count pill: blue-gray, white digits; inverted on a selected row. */
export function pill(text, o = {}) {
  const sel = Boolean(o.selected);
  const bg = o.color ?? (key() ? C.badge : C.badgeOff);
  return div()
    .flex_none()
    .h(14)
    .min_w(20)
    .px(6)
    .rounded(7)
    .flex()
    .items_center()
    .justify_center()
    .bg(sel ? "#ffffff" : bg)
    .text_color(sel ? (o.color ?? C.rowBot) : "#ffffff")
    .font_family("Helvetica")
    .font_weight(700)
    .text_size(10)
    .child(String(text));
}

/** An agent's status, the Aqua way: a spinner while working, a red badge when blocked, Mail's blue dot when done. */
export function statusMark(status, o = {}) {
  const sel = Boolean(o.selected);
  if (status === "working")
    return svg(GLYPH.spinner).flex_none().w(14).h(14).text_color(sel ? "#ffffff" : "#4a4a4a").spin(900);
  if (status === "blocked") return pill("!", { color: C.red, selected: sel });
  if (status === "done")
    return div()
      .flex_none()
      .w(14)
      .h(14)
      .flex()
      .items_center()
      .justify_center()
      .child(sel ? div().w(8).h(8).rounded(4).bg("#ffffff") : bead("blue", 9));
  return div().flex_none().w(14);
}

// ---- textured toolbar buttons

/**
 * A textured (unified toolbar) button: graphite gradient, dark rim, 4 px
 * corners. segments: [{ id, glyph, text, lead (an element before the text), onClick, onDown, tooltip, menu (shows a ▾), on, w }],
 * drawn as one segmented control. Height 23.
 */
export function textured(segments, o = {}) {
  const h = 23;
  const live = key();
  const segW = (s) => s.w ?? (s.text ? 18 + s.text.length * 7 : 32) + (s.menu ? 10 : 0);
  const w = segments.reduce((n, s) => n + segW(s), 0);
  const rim = live ? "#555555" : "#8f8f8f";
  let x = 0;
  const parts = segments.map((s, i) => {
    const sw = segW(s);
    const first = i === 0;
    const last = i === segments.length - 1;
    const r = [first ? 4 : 0, last ? 4 : 0, last ? 4 : 0, first ? 4 : 0];
    const fill = s.on ? vgrad("#9c9c9c", "#c4c4c4") : live ? vgrad("#fbfbfb", "#c8c8c8") : vgrad("#fdfdfd", "#e5e5e5");
    const pressed = vgrad("#8a8a8a", "#b5b5b5");
    const ix = x;
    x += sw;
    // The rim is drawn once behind the whole control; each face sits 1 px inside it.
    const inset = [first ? 1 : 0, last ? 1 : 0];
    const body = (bg) => paint(rrect(sw - inset[0] - inset[1], h - 3, r.map((n) => (n ? 3.5 : 0)), inset[0], 1), bg, sw, h);
    return div()
      .id(s.id)
      .relative()
      .flex_none()
      .w(sw)
      .h(h)
      .child(body(fill))
      .child(
        div()
          .absolute()
          .top(0)
          .left(0)
          .size_full()
          .flex()
          .items_center()
          .justify_center()
          .gap(3)
          .text_color(live ? "#333333" : "#8a8a8a")
          .active((st) => st.bg("#00000026"))
          .when(Boolean(s.lead), (el) => el.child(s.lead))
          .when(Boolean(s.glyph), (el) => el.child(svg(s.glyph).w(s.size ?? 14).h(s.size ?? 14).text_color(live ? (s.on ? "#1d1d1d" : "#3a3a3a") : "#8f8f8f")))
          .when(Boolean(s.text), (el) => el.text_size(12).child(s.text))
          .when(Boolean(s.menu), (el) => el.child(svg(GLYPH.down).w(7).h(5).text_color(live ? "#333333" : "#8f8f8f"))),
      )
      .when(!last, (el) => el.child(div().absolute().top(1).right(0).w(1).h(h - 2).bg(rim)))
      .when(Boolean(s.tooltip), (el) => el.tooltip(s.tooltip))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        s.onDown?.(e, cx, ix);
      })
      .when(Boolean(s.onClick), (el) => el.on_click((e, cx) => s.onClick(e, cx)));
  });
  return div()
    .relative()
    .flex_none()
    .w(w)
    .h(h)
    .child(paint(rrect(w, h, 5), live ? "#ffffff70" : "#ffffff50", w, h + 1).top(1))
    .child(paint(rrect(w, h - 1, 4.5), rim, w, h))
    .child(h_flex().absolute().top(0).left(0).h(h).children(parts));
}

/**
 * An Aqua push button (sheets): a white gel pill, or the default one's blue
 * gel, which pulses. o: { primary, w }.
 */
export function aquaButton(id, label, onClick, o = {}) {
  const w = o.w ?? Math.max(78, 26 + label.length * 7.5);
  const h = 22;
  const blue = Boolean(o.primary) && key();
  const rim = blue ? "#3466b3" : "#9a9a9a";
  // The gel: a pill darkest just under its middle, lit from below, with a
  // glossy capsule over its top half. Every shape is a whole pill: rrect caps
  // a corner at half its shape's height, so half-height halves get square ends.
  const body = blue ? vgrad("#4a8de6", "#b9ddff") : vgrad("#d9d9d9", "#fbfbfb");
  const gloss = blue ? vgrad("#eaf3ffe6", "#a6cdf733") : vgrad("#ffffffff", "#ffffff40");
  const gh = Math.round((h - 2) * 0.5);
  let glow = div().absolute().top(0).left(0).size_full();
  if (blue) glow = glow.child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), "#9ccaff", w, h)).loop("opacity", { from: 0, to: 0.6, period: 1700 });
  return div()
    .id(id)
    .relative()
    .flex_none()
    .w(w)
    .h(h + 2)
    .child(paint(rrect(w, h, h / 2, 0, 1.5), "#0000001a", w, h + 2))
    .child(paint(rrect(w, h, h / 2), rim, w, h))
    .child(paint(rrect(w - 2, h - 2, (h - 2) / 2, 1, 1), body, w, h))
    .child(glow)
    .child(paint(rrect(w - 8, gh, gh / 2, 4, 1.5), gloss, w, h))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .w(w)
        .h(h)
        .flex()
        .items_center()
        .justify_center()
        .text_size(13)
        .text_color("#000000")
        .active((s) => s.bg("#0000001c"))
        .rounded(h / 2)
        .child(label),
    )
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_click((e, cx) => onClick(e, cx));
}

// ---- icons

/** A program's icon at size: its own art, or its glyph on an Aqua glass tile. Shells are Terminal. */
export function programIcon(program, size, o = {}) {
  if (!program || program.shell || program.key === "shell" || !program.icon) return image(ICON.terminal).flex_none().w(size).h(size);
  if (!program.tint) return image(program.icon).flex_none().w(size).h(size);
  const r = size * 0.22;
  const inner = size * (o.small ? 0.7 : 0.62);
  return div()
    .relative()
    .flex_none()
    .w(size)
    .h(size)
    .child(paint(rrect(size, size, r), program.tile ?? "#4b5563", size, size))
    .child(paint(rrect(size, size, r), vgrad("#ffffff38", "#00000030"), size, size))
    .child(paint(rrect(size - 2, size * 0.48, [r - 1, r - 1, 0, 0], 1, 1), vgrad("#ffffff55", "#ffffff10"), size, size))
    .child(
      div()
        .absolute()
        .top(0)
        .left(0)
        .size_full()
        .flex()
        .items_center()
        .justify_center()
        .child(svg(program.icon).w(inner).h(inner).text_color(program.color ?? "#ffffff")),
    );
}

/** A tab's icon in lists: an app's view in a tab (Linear, Slack) shows that app's icon,
 *  as the Dock does; any other tab its lead program's. */
export function tabIcon(spaceId, tab, size) {
  const app = WIN_APPS[tab.name] && panes().some((p) => p.tab === tab.id && p.mod === "snowleopard");
  const path = app ? dockApps().find((a) => appName(a.path) === tab.name)?.path ?? BUILTIN_APPS[tab.name]?.path : null;
  return path ? appImage(path, size) : programIcon(leadProgram(spaceId, tab.id), size, { small: true });
}

/** Herdr's status words, as people read them. */
export const STATUS_WORD = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };

/** A tab's one name everywhere (tab bar, title, menus, sheets, Dock): its own
 *  name, else its lead program's ("zsh", "Claude Code"), else "Tab N". */
export function tabLabel(spaceId, tab) {
  if (!tab) return "";
  if (tab.named) return tab.name;
  return leadProgram(spaceId, tab.id)?.name ?? `Tab ${tab.name}`;
}

/** The program a space or tab shows best: its first agent's, else its first terminal's. */
export function leadProgram(spaceId, tabId = null) {
  const a = agents().find((x) => x.space === spaceId && (!tabId || x.tab === tabId));
  if (a) return a.program;
  const s = spaces().find((x) => x.id === spaceId);
  const tabs = tabId ? [tabId] : (s?.tabs ?? []).map((t) => t.id);
  const p = panes().find((x) => tabs.includes(x.tab) && x.terminal);
  return p?.program ?? null;
}

// ---- keyboard shortcuts, as menus print them

const KEYNAME = {
  enter: "↩", return: "↩", escape: "⎋", backspace: "⌫", delete: "⌦", tab: "⇥", space: "Space",
  left: "←", right: "→", up: "↑", down: "↓", pageup: "⇞", pagedown: "⇟", home: "↖", end: "↘",
  "=": "=", "+": "+", "-": "-",
};

function pretty(chord) {
  const parts = chord.split("-");
  let k = parts.pop();
  if (k === "" && parts.length) k = "-";
  const mods = new Set(parts);
  // A Mac prints shift-/ as ?, with no shift glyph.
  const q = k === "/" && mods.has("shift");
  const name = q ? "?" : KEYNAME[k] ?? (k.length === 1 ? k.toUpperCase() : k.toUpperCase().replace(/^F(\d+)$/, "F$1"));
  return `${mods.has("ctrl") ? "⌃" : ""}${mods.has("alt") ? "⌥" : ""}${mods.has("shift") && !q ? "⇧" : ""}${mods.has("cmd") ? "⌘" : ""}${name}`;
}

/** The shortcut bound to an action (global, this layout's or the terminal's), e.g. "⇧⌘D", or "". */
// Every action's printed chord, rebuilt at most every 3 s: keys() hands over
// every binding on each call, and menus, tabs and the toolbar ask often.
let CHORDS = null;
let CHORDS_AT = 0;

export function shortcut(action) {
  const now = Date.now();
  if (!CHORDS || now - CHORDS_AT > 3000) {
    CHORDS = new Map();
    CHORDS_AT = now;
    const ok = (s) => s === "global" || s === "layout:snowleopard" || s === "terminal";
    // The layout's own binding wins over a global one for the same action.
    for (const k of keys() ?? []) {
      if (!ok(k.section) || String(k.keys).includes(" ")) continue;
      // An action bound to both / and shift-/ prints the shifted one (⌘?).
      if (!CHORDS.has(k.action) || k.section === "layout:snowleopard" || String(k.keys).endsWith("shift-/")) CHORDS.set(k.action, pretty(String(k.keys)));
    }
  }
  return CHORDS.get(action) ?? "";
}

// ---- menus and sheets

// Menu metrics; the menu role draws exactly these.
export const MENU = { row: 20, header: 20, sep: 12, pad: 5, shadow: 8 };

/** A menu's size in px for its items. */
export function menuSize(items, min = 0) {
  let h = MENU.pad * 2;
  let longest = 0;
  let keys = 0;
  for (const it of items) {
    if (it.sep) {
      h += MENU.sep;
      continue;
    }
    h += it.header ? MENU.header : MENU.row;
    longest = Math.max(longest, (it.label ?? "").length + (it.detail ? it.detail.length * 0.85 + 2 : 0));
    keys = Math.max(keys, (it.shortcut ?? "").length);
  }
  // A shortcut glyph is about 13 px wide, with a 36 px gutter before it; an icon column adds 18.
  const icons = items.some((it) => it.icon) ? 18 : 0;
  const w = Math.max(min, 172, 46 + icons + longest * 7.3 + (keys ? 36 + keys * 13 : 0));
  return { w: Math.ceil(w), h };
}

/**
 * Opens a Snow Leopard menu (the menu role) under a menu title or at a
 * point. items: [{ label, act, shortcut, checked, disabled, header, detail,
 * icon, sep }]. owner: the menu title that opened it (it stays highlighted).
 */
export function openMenu(items, at, o = {}) {
  const { w, h } = menuSize(items, o.minWidth ?? 0);
  // The popup is MENU.shadow larger on the left, right and bottom, for the drop shadow.
  const sh = MENU.shadow;
  const left = at ? Math.max(0, at.x - sh) : 0;
  const id = openOverlay({
    mod: "snowleopard",
    kind: "popup",
    frame: "none",
    width: w + sh * 2,
    height: h + sh,
    ...(at ? { at: { x: left, y: at.y } } : {}),
    props: { role: "menu", items, owner: o.owner ?? null, attached: Boolean(o.attached), lpad: at ? at.x - left : sh },
  });
  setShared("sl.menu", { owner: o.owner ?? null, id });
  return id;
}

/** Closes whichever Snow Leopard menu is open. */
export function closeMenus() {
  const m = shared("sl.menu");
  if (m?.id) closeOverlay(m.id);
  setShared("sl.menu", null);
}

const SHEET = { about: [300, 360], forcequit: [440, 400], dockapps: [400, 480], rename: [420, 170], prefs: [420, 340] };

/** Opens a sheet (the sheet role): kind and its props. */
export function openSheet(kind, p = {}) {
  const [w, h] = SHEET[kind] ?? [450, 150];
  return openOverlay({
    mod: "snowleopard",
    kind: "dialog",
    frame: "none",
    // A key makes a second open replace the first instead of stacking.
    ...(p.key ? { key: p.key } : {}),
    width: p.width ?? w,
    height: p.height ?? h,
    props: { role: "sheet", kind, size: [p.width ?? w, p.height ?? h], ...p },
  });
}

/** Does what a menu item says: { run: [command, args], sheet: [kind, props], open: path, toggle: node id, look: {...}, newSpaceIn, fullscreen, zoomWindow, tearOff: tab, raise: tab, putBack: tab, mergeAll, launch: [app, folder?], reveal: path, unDock: app, win: name, pref: [name, value], copy: text, linearPick: change, imessageTab, imessagePick: change }. */
export function perform(act) {
  if (!act) return;
  if (act.run?.[0] === "tab.new") newTab(act.run[1] ?? {});
  else if (act.run) run(act.run[0], act.run[1] ?? {});
  if (act.sheet) openSheet(act.sheet[0], act.sheet[1] ?? {});
  if (act.open) exec("open", [act.open]).catch(() => {});
  if (act.toggle) run("layout.toggle", { id: act.toggle });
  if (act.look) setLook(act.look);
  if (act.fullscreen) window.toggle_fullscreen();
  if (act.zoomWindow) toggleZoom();
  if (act.tearOff) tearOff(act.tearOff);
  if (act.raise) raiseTorn(act.raise);
  if (act.putBack) putBack(act.putBack);
  if (act.launch) launch(act.launch[0], act.launch[1] ?? null);
  if (act.reveal) exec("open", ["-R", act.reveal]).catch(() => {});
  if (act.unDock) removeDockApp(act.unDock);
  if (act.win) openWin(act.win);
  if (act.slackTab) openSlackTab();
  if (act.linearTab) openLinearTab();
  // A change picked from one of the Linear window's menus: the window applies it (linear.js).
  if (act.linearPick) setWin("linear", { pick: { ...act.linearPick, at: Date.now() } });
  if (act.imessageTab) openImessageTab();
  if (act.imessagePick) setWin("imessage", { pick: { ...act.imessagePick, at: Date.now() } });
  if (typeof act.copy === "string") exec("/bin/sh", ["-c", 'printf %s "$1" | pbcopy', "sh", act.copy]).catch(() => {});
  if (act.mergeAll) mergeAll();
  if (act.pref) setPref(act.pref[0], act.pref[1]);
  if (act.newSpaceIn)
    pickFolder({ prompt: "New Space" })
      .then((folder) => folder && run("space.new", { folder }))
      .catch(() => {});
}

/** Sets look fields on this layout's root (the terminal profile), keeping the rest. */
export function setLook(fields) {
  const l = layout();
  if (!l || typeof l !== "object") return;
  run("layout.set", { layout: { ...l, ...fields } });
}

/** Is a layout node shown? */
export function shown(id) {
  const find = (n) => (!n || typeof n !== "object" ? null : n.id === id ? n : (n.children ?? []).map(find).find(Boolean) ?? null);
  const n = find(layout());
  return n ? !n.hidden : false;
}

/** A space's menu (sidebar right-click, the Dock): its tabs, then what to do with it. */
export function spaceItems(s) {
  return [
    ...s.tabs.map((t) => ({ label: tabLabel(s.id, t), detail: STATUS_WORD[t.status] ?? "", checked: s.active && t.active, act: { run: ["tab.select", { id: t.id }] } })),
    { sep: true },
    { label: "Open", disabled: s.active, act: { run: ["space.select", { id: s.id }] } },
    { label: "New Tab Here", act: { run: ["tab.new", { space: s.id }] } }, // perform → newTab
    { label: "Rename…", shortcut: s.active ? shortcut("space.rename") : "", act: { sheet: ["rename", { what: "space", id: s.id }] } },
    ...(!s.machine && s.folder ? [{ label: "Show in Finder", act: { open: s.folder } }] : []),
    { sep: true },
    { label: "Close Space…", act: { sheet: ["closespace", { space: s.id }] } },
  ];
}

/** "New Space on <machine>" for each other machine Herdr can reach. */
export function remoteSpaceItems() {
  return machines()
    .filter((m) => m.name && m.layout !== "unavailable")
    .map((m) => ({ label: `New Space on ${m.name}`, act: { run: ["space.new", { machine: m.name }] } }));
}

/** A new tab made here, by hand (⌘T, +, a New menu): the menu bar asks for its
 *  name only after one of these, never for tabs that scripts and agents make. */
export function newTab(args = {}) {
  globalThis.__slAskName = Date.now();
  run("tab.new", args);
}

/** Closes a tab the way Terminal does: at once when nothing is running in it but
 *  a shell, else after the Close Tab alert (an agent, or the space's last tab). */
export function askCloseTab(tabId) {
  const s = spaces().find((x) => x.tabs.some((t) => t.id === tabId));
  if (!s) return;
  if (s.tabs.length > 1 && !agents().some((a) => a.tab === tabId)) run("tab.close", { id: tabId, confirmed: true });
  else openSheet("closetab", { tab: tabId, key: "sl-closetab" });
}

/** Was a tab made by hand in the last two seconds? Takes the mark. */
export function takeAskMark() {
  const t = globalThis.__slAskName ?? 0;
  globalThis.__slAskName = 0;
  return Date.now() - t < 2000;
}

// ---- preferences (Herdr › Snow Leopard Settings…), shared "sl.prefs"
//   askTabName  ask for a name after ⌘T or +
//   bounce      bounce a space's Dock folder when an agent there starts needing you
//   notice      show a notice (top right) when an agent starts needing you
//   doneBadge   count finished agents in the Dock's red badges too
//   usage       show Claude's and Codex's plan usage in the menu bar (usage.js)
//   dockAutoHide  the Dock slides away until the pointer reaches the bottom edge (dock.js)

export const PREF_DEFAULTS = { askTabName: true, bounce: true, notice: true, doneBadge: false, usage: true, dockAutoHide: false };

export function pref(name) {
  return { ...PREF_DEFAULTS, ...(shared("sl.prefs") ?? {}) }[name];
}

export function setPref(name, value) {
  setShared("sl.prefs", { ...(shared("sl.prefs") ?? {}), [name]: value });
}

// ---- the window on the desktop
//
// The desktop column holds spacers around the window: desk-top over desk-row,
// whose desk-left sits beside the window. Zoomed, the window and desk-row take
// the leftover space (weight) inside the margins below; placed, they have a
// size in px and desk-right / desk-bottom take what's left.

export const MIN_W = 520;
export const MIN_H = 300;
const MARGIN = { x: 20, y: 12 };
const MENUBAR = 22;

function node(id, n = layout()) {
  if (!n || typeof n !== "object") return null;
  if (n.id === id) return n;
  for (const c of n.children ?? []) {
    const hit = node(id, c);
    if (hit) return hit;
  }
  return null;
}

/** Is the window zoomed to fill the desktop? (Placed windows keep their frame in shared "sl.placed".) */
export function zoomed() {
  return !shared("sl.placed");
}

/** The desktop's size (what the window may cover) for an app window of this size. */
export function desktopLimits(app) {
  return { w: app.width, h: app.height - MENUBAR - dockHeight() };
}

/** How much of the app window's bottom the Dock covers (0 while it's hidden). */
export function dockHeight() {
  const dock = node("dock");
  return dock && !dock.hidden ? dock.size?.px ?? 0 : 0;
}

/** Where the window is now, in desktop px; h is null while zoomed (the drag works it out). */
export function currentFrame(width) {
  const placed = shared("sl.placed");
  if (placed?.w) return { ...placed, bottom: 0 };
  return { x: MARGIN.x, y: MARGIN.y, w: width, h: null, bottom: MARGIN.y };
}

/** Places the window: spacers and its own size in px, the far spacers take the rest. */
export function applyFrame(f) {
  setShared("sl.placed", f);
  placeFrame(null, f);
}

/**
 * Keeps a placed window on the desktop when the app window gets smaller (moved
 * to a smaller display, or resized): shrinks it to fit, then moves it back on,
 * so its bottom (where you type) never ends up off screen.
 */
export function fitFrame() {
  if (shared("sl.dragging")) return;
  const v = window.viewport_size();
  if (!v?.width || !v?.height) return;
  const f = shared("sl.placed");
  if (!f?.w || !f?.h) return fitWindows(v);
  const lim = desktopLimits(v);
  const w = Math.round(Math.min(f.w, Math.max(MIN_W, lim.w)));
  const h = Math.round(Math.min(f.h, Math.max(MIN_H, lim.h)));
  const x = Math.round(Math.max(0, Math.min(f.x, lim.w - w)));
  const y = Math.round(Math.max(0, Math.min(f.y, lim.h - h)));
  if (w === f.w && h === f.h && x === f.x && y === f.y) return fitWindows(v);
  const to = { ...f, x, y, w, h };
  setShared("sl.placed", to);
  placeFrame(f, to);
  fitWindows(v);
}

/** A floating window's saved size and spot, fitted into the desktop (below the menu bar, above
 *  the Dock); with no spot it's centered, so a window always has one. */
function fitBox(w, h, at, v = window.viewport_size()) {
  if (!v?.width || !v?.height) return { w, h, at };
  const floor = v.height - dockHeight();
  const fw = Math.round(Math.min(w, Math.max(WIN.minW, v.width - 8)));
  const fh = Math.round(Math.min(h, Math.max(WIN.minH, floor - MENUBAR - 4)));
  const from = at ?? { x: (v.width - fw) / 2, y: MENUBAR + (floor - MENUBAR - fh) / 2 };
  const fat = { x: Math.round(Math.max(0, Math.min(from.x, v.width - fw))), y: Math.round(Math.max(MENUBAR, Math.min(from.y, floor - fh))) };
  return { w: fw, h: fh, at: fat, moved: fw !== w || fh !== h || !at || fat.x !== at.x || fat.y !== at.y };
}

/** A zoomed window's size and spot in px: most of the desktop, centered above the Dock. */
function bigBox(v = window.viewport_size()) {
  if (!v?.width || !v?.height) return null;
  const floor = v.height - dockHeight();
  const w = Math.round(v.width * WIN.bigW);
  const h = Math.round((floor - MENUBAR) * WIN.bigH);
  return { w, h, at: { x: Math.round((v.width - w) / 2), y: Math.round(MENUBAR + (floor - MENUBAR - h) / 2) } };
}

/** Open floating windows (app windows, torn-off tabs) that hang off the app window: closed
 *  and reopened fitted, since reopening a window under its key keeps its old spot. */
function fitWindows(v) {
  for (const name of Object.keys(APP_WIN)) {
    const n = winState(name);
    if (!n.open || n.min || n.big || !n.overlay) continue;
    const f = fitBox(n.w ?? APP_WIN[name].w, n.h ?? APP_WIN[name].h, n.at, v);
    if (f.moved) moveWinTo(name, f);
  }
  const all = torn();
  for (const [id, t] of Object.entries(all)) {
    if (t.min || t.big || !t.overlay) continue;
    const f = fitBox(t.w ?? WIN.w, t.h ?? WIN.h, t.at, v);
    if (!f.moved) continue;
    setTorn({ ...torn(), [id]: { ...t, w: f.w, h: f.h, at: f.at } });
    closeOverlay(t.overlay);
    openTorn(id);
  }
}

/** Moves the window from frame `from` to `to` with as few layout changes as it
 *  takes: each one is a layout pass, so a move along one axis is one resize.
 *  From a zoomed window (no `from`) it sets them all. Touches no shared state. */
export function placeFrame(from, to) {
  const px = [["desk-left", "x"], ["desk-top", "y"], ["window", "w"], ["desk-row", "h"]];
  for (const [id, k] of px) if (!from || from[k] !== to[k]) run("layout.resize", { id, px: to[k] });
  if (from) return;
  run("layout.resize", { id: "desk-right", weight: 1 });
  run("layout.resize", { id: "desk-bottom", weight: 1 });
}

/** Zooms the window to fill the desktop (inside a margin), following the app window's size. */
export function fillDesktop() {
  setShared("sl.placed", null);
  run("layout.resize", { id: "desk-left", px: MARGIN.x });
  run("layout.resize", { id: "desk-right", px: MARGIN.x });
  run("layout.resize", { id: "desk-top", px: MARGIN.y });
  run("layout.resize", { id: "desk-bottom", px: MARGIN.y });
  run("layout.resize", { id: "window", weight: 1 });
  run("layout.resize", { id: "desk-row", weight: 1 });
}

/** Records a part's size in shared "sl.desk" (the desk spacers, the window's width), when it changes. */
export function reportSize(slot, size) {
  const all = shared("sl.desk") ?? {};
  const w = Math.round(size.width);
  const h = Math.round(size.height);
  if (all[slot]?.w === w && all[slot]?.h === h) return;
  setShared("sl.desk", { ...all, [slot]: { w, h } });
}

export function setSavedFrame(f) {
  setShared("sl.frame", f);
}

/**
 * The green button: zoomed ⇄ the size and place it had, or a centered window.
 * width: the window's width now (the title bar's).
 */
export function toggleZoom(width = shared("sl.desk")?.window?.w) {
  if (!zoomed()) return fillDesktop();
  const saved = shared("sl.frame");
  if (saved?.w) return applyFrame(saved);
  // Zoomed, the window is the desktop less its margins; desk-left is as tall as it.
  const rowH = shared("sl.desk")?.["desk-left"]?.h;
  if (!width || !rowH) return;
  const lim = { w: width + MARGIN.x * 2, h: rowH + MARGIN.y * 2 };
  const w = Math.max(MIN_W, Math.round(lim.w * 0.72));
  const h = Math.max(MIN_H, Math.round(lim.h * 0.78));
  applyFrame({ x: Math.round((lim.w - w) / 2), y: Math.round((lim.h - h) / 3), w, h });
}

/** Starts moving ("move") or resizing ("resize") the window from a press. */
export function startDrag(mode, e, width) {
  // The desk spacers hold their size reports until it's over (see desk.js).
  setShared("sl.dragging", true);
  openOverlay({
    mod: "snowleopard",
    kind: "window",
    frame: "none",
    width: 1,
    height: 1,
    at: { x: 0, y: 0 },
    props: { role: "drag", mode, start: { x: e.position.x, y: e.position.y }, frame: currentFrame(width) },
  });
}

// ---- torn-off windows
//
// A tab can leave the main window for its own Aqua window: an overlay window
// holding a title bar (the "aqua" role) over its terminals. The tab is settled
// (out of the lists, still running) while it's out, and unsettled when it
// comes back. Shared "sl.windows" = { [tab]: { min, big, at } }; minimized
// ones wait in the Dock. `at` is the window's top left: Herdr remembers a
// window's spot only once it's dragged, so it's kept here to reopen in place.

export const WIN = { w: 660, h: 430, bigW: 0.86, bigH: 0.8, title: 22, bar: 15, minW: 360, minH: 180 };

export function torn() {
  return shared("sl.windows") ?? {};
}

function setTorn(map) {
  setShared("sl.windows", map);
}

/** The tab, its space and its terminals. */
export function tabInfo(tabId) {
  for (const s of spaces()) {
    const t = s.tabs.find((x) => x.id === tabId);
    if (t) return { space: s, tab: t, terminals: panes().filter((p) => p.tab === tabId && p.terminal).map((p) => p.terminal) };
  }
  return null;
}

/** Can this tab go to its own window? Not the space's last tab in the main window. */
export function canTear(tabId) {
  const info = tabInfo(tabId);
  if (!info || !info.terminals.length || torn()[tabId]) return false;
  const t = torn();
  return info.space.tabs.filter((x) => !t[x.id] && !x.settled).length > 1;
}

function openTorn(tabId, o = {}) {
  const info = tabInfo(tabId);
  if (!info) return false;
  const cell = (terminal) => ({ type: "block", content: { terminal }, background: "background", padding: [4, 6] });
  const terms = info.terminals;
  // Zoomed, it opens centered; otherwise where it was.
  const saved = torn()[tabId];
  const fit = fitBox(saved?.w ?? WIN.w, saved?.h ?? WIN.h, o.at ?? saved?.at);
  const big = o.big ? bigBox() : null;
  const at = o.big ? big?.at ?? zoomedSpot() : fit.at;
  const body = terms.length === 1 ? { ...cell(terms[0]), size: { weight: 1 } } : { type: "row", size: { weight: 1 }, divider: { width: 1, color: "#8b8b8b" }, children: terms.map(cell) };
  const overlay = openOverlay({
    kind: "window",
    frame: "none",
    // The zoomed window has its own key: reopening a key keeps its old spot, whatever `at` says.
    key: `sl-win-${tabId}${o.big ? "-big" : ""}`,
    keep: true,
    width: o.big ? big?.w ?? WIN.bigW : fit.w,
    height: o.big ? big?.h ?? WIN.bigH : fit.h,
    ...(at ? { at } : {}),
    layout: {
      type: "column",
      radius: 5,
      shadow: "lg",
      border: { width: 1, color: "#00000070" },
      background: "background",
      children: [
        { type: "block", size: { px: WIN.title }, content: { mod: "snowleopard", props: { role: "aqua", tab: tabId, big: Boolean(o.big) } } },
        body,
        // The bottom edge and its resize grip.
        { type: "block", size: { px: WIN.bar }, content: { mod: "snowleopard", props: { role: "aqua", part: "bar", tab: tabId } } },
      ],
    },
  });
  if (saved && (saved.overlay !== overlay || fit.moved)) setTorn({ ...torn(), [tabId]: { ...saved, overlay, ...(o.big ? {} : { w: fit.w, h: fit.h, at: fit.at }) } });
  return overlay || true;
}

/** The app window's size, from the desktop spacers' reports (sl.desk). */
export function appSize() {
  const d = shared("sl.desk") ?? {};
  const w = d["desk-top"]?.w;
  if (!w) return null;
  const h = MENUBAR + (d["desk-top"]?.h ?? 0) + (d["desk-left"]?.h ?? 0) + (d["desk-bottom"]?.h ?? 0) + dockHeight();
  return { w, h };
}

/** A zoomed window's top left: centered in the app window. */
function zoomedSpot() {
  const a = appSize();
  return a ? { x: Math.round((a.w * (1 - WIN.bigW)) / 2), y: Math.round((a.h * (1 - WIN.bigH)) / 2) } : null;
}

/** Moves a tab to its own window (at: its top left, else where it last was). */
export function tearOff(tabId, at = null) {
  if (!canTear(tabId)) return;
  // Forget windows whose tabs were closed.
  const known = Object.fromEntries(Object.entries(torn()).filter(([id]) => tabInfo(id)));
  if (Object.keys(known).length !== Object.keys(torn()).length) setTorn(known);
  const info = tabInfo(tabId);
  // Show a neighbor in the main window first, so the torn tab isn't the shown one.
  if (info.tab.active) {
    const t = torn();
    const rest = info.space.tabs.filter((x) => x.id !== tabId && !t[x.id] && !x.settled);
    const next = rest.find((x) => x.index > info.tab.index) ?? rest[rest.length - 1];
    if (next) run("tab.select", { id: next.id });
  }
  // Opened by command or menu there's no spot: take the centered one, so `at` is never null.
  const spot = at ?? fitBox(WIN.w, WIN.h, null).at;
  const overlay = openTorn(tabId, { at: spot });
  if (!overlay) return;
  setTorn({ ...torn(), [tabId]: { min: false, big: false, at: spot, overlay } });
  run("tab.settle", { id: tabId });
}

/** Puts a torn-off tab back in the main window, shown. */
export function putBack(tabId, overlay = null) {
  const t = { ...torn() };
  delete t[tabId];
  setTorn(t);
  if (overlay) closeOverlay(overlay);
  if (!tabInfo(tabId)) return;
  run("tab.unsettle", { id: tabId });
  run("tab.select", { id: tabId });
}

export function mergeAll() {
  // Each window's title bar closes its window once its tab is back.
  for (const id of Object.keys(torn())) putBack(id, null);
}

/** A new size for a torn window (its top left stays), from its grip. */
export function resizeTorn(tabId, f) {
  const w = torn()[tabId];
  if (!w) return;
  setTorn({ ...torn(), [tabId]: { ...w, big: false, at: { x: f.x, y: f.y }, w: f.w, h: f.h } });
  // Reopening the same key replaces the window in place, at its new size.
  openTorn(tabId, { at: { x: f.x, y: f.y } });
}

/** A press on a torn window's grip (or the notes window's, target "notes"): the drag
 *  overlay shows the new outline; it's applied on release. */
export function startTornResize(tabId, e, frame, target = null) {
  openOverlay({
    mod: "snowleopard",
    kind: "window",
    frame: "none",
    width: 1,
    height: 1,
    at: { x: 0, y: 0 },
    props: { role: "drag", mode: "tornresize", tab: tabId, target, start: { x: e.position.x, y: e.position.y }, frame },
  });
}

/** The main window's title and tab bars, in window coordinates: where a torn
 *  window is dropped to put its tab back. */
export function mainBars() {
  const placed = shared("sl.placed");
  const w = placed?.w ?? shared("sl.desk")?.window?.w;
  if (!w) return null;
  const x = placed?.w ? placed.x : MARGIN.x;
  const y = MENUBAR + (placed?.w ? placed.y : MARGIN.y);
  return { x, y, w, h: 58 + 24 };
}

/** A press on a torn window's title: the drag overlay moves its outline, and
 *  dropping it on the main window's title or tab bar puts the tab back. */
export function startTornMove(tabId, e, frame, winOverlay) {
  openOverlay({
    mod: "snowleopard",
    kind: "window",
    frame: "none",
    width: 1,
    height: 1,
    at: { x: 0, y: 0 },
    props: { role: "drag", mode: "tornmove", tab: tabId, start: { x: e.position.x, y: e.position.y }, frame, winOverlay },
  });
}

/** Moves a torn window: closed and reopened at the new spot (reopening a key keeps its old spot). */
export function moveTorn(tabId, at) {
  const w = torn()[tabId];
  if (!w || w.big) return;
  setTorn({ ...torn(), [tabId]: { ...w, at } });
  if (w.overlay) closeOverlay(w.overlay);
  openTorn(tabId, { at });
}

/** Records where a torn window is (its title bar's top left), after a drag. */
export function placeTorn(tabId, at) {
  const w = torn()[tabId];
  if (!w || !at || (w.at && w.at.x === at.x && w.at.y === at.y)) return;
  setTorn({ ...torn(), [tabId]: { ...w, at } });
}

/** Minimize: the window goes to the Dock; clicking it there brings it back. */
export function minimizeTorn(tabId, overlay) {
  setTorn({ ...torn(), [tabId]: { ...torn()[tabId], min: true } });
  closeOverlay(overlay);
}

export function restoreTorn(tabId) {
  const w = torn()[tabId];
  if (!w || !openTorn(tabId, { big: w.big })) return;
  setTorn({ ...torn(), [tabId]: { ...torn()[tabId], min: false } });
}

/** Zoom: a big window centered in the app, or back to the standard size where it was. */
export function zoomTorn(tabId, overlay = null) {
  const w = torn()[tabId];
  if (!w) return;
  setTorn({ ...torn(), [tabId]: { ...w, big: !w.big } });
  if (overlay) closeOverlay(overlay);
  openTorn(tabId, { big: !w.big });
}

/** Brings a torn window to the front (reopening it by key keeps its spot). */
export function raiseTorn(tabId) {
  const w = torn()[tabId];
  if (!w) return;
  if (w.min) return restoreTorn(tabId);
  // Reopening it by key brings it to the front in place. Not pane.focus: that
  // would select the tab in the main window and unsettle it.
  openTorn(tabId, { big: w.big });
}

/** Where a torn-off window lands for a pointer at p, holding it `grab` px into
 *  its title, kept inside the app window (size) when it's known. */
export function tearSpot(p, grab = 120, size = null) {
  let x = Math.round(p.x - grab);
  let y = Math.round(p.y - WIN.title / 2);
  if (size) {
    x = Math.min(x, size.width - WIN.w - 4);
    y = Math.min(y, size.height - dockHeight() - WIN.h - 4);
  }
  return { x: Math.max(0, x), y: Math.max(MENUBAR, y) };
}

/** A press on a tab: a drag overlay where the tab follows the pointer, then a
 *  ghost window once it's pulled out of the strip; the window opens on release. */
export function startTear(tabId, e, name = "") {
  openOverlay({
    mod: "snowleopard",
    kind: "window",
    frame: "none",
    width: 1,
    height: 1,
    at: { x: 0, y: 0 },
    props: { role: "drag", mode: "tear", tab: tabId, name, start: { x: e.position.x, y: e.position.y }, bounds: e.bounds ?? null },
  });
}

// ---- app windows
//
// Aqua windows for an app's content inside Herdr, opened from its Dock icon:
// "notes" (the Obsidian vault, notes.js), "slack" (slack.js), "linear"
// (linear.js) and "imessage" (Messages, imessage.js). Each is an
// overlay window like a torn-off tab's, its role named after it, with shared
// "sl.<name>" = { open, min, big, at, w, h, ... }: whether it's showing,
// minimized to the Dock or zoomed, where it sits and how big, plus the
// window's own memory (the notes window's last note).

const APP_WIN = { notes: { w: 860, h: 560 }, slack: { w: 900, h: 600 }, linear: { w: 980, h: 640 }, imessage: { w: 860, h: 580 } };

/** The Dock app whose icon opens each window. */
export const WIN_APPS = { Obsidian: "notes", Slack: "slack", Linear: "linear", Messages: "imessage" };

export function winState(name) {
  return shared(`sl.${name}`) ?? {};
}

export function setWin(name, fields) {
  setShared(`sl.${name}`, { ...winState(name), ...fields });
}

/** Opens (or brings forward) an app window, where it was. */
export function openWin(name, o = {}) {
  const n = { ...winState(name), ...o };
  if (!n.big) Object.assign(n, fitBox(n.w ?? APP_WIN[name].w, n.h ?? APP_WIN[name].h, n.at));
  const big = n.big ? bigBox() : null;
  const overlay = openOverlay({
    mod: "snowleopard",
    kind: "window",
    frame: "none",
    key: winKey(name, n),
    keep: true,
    width: n.big ? big?.w ?? WIN.bigW : n.w ?? APP_WIN[name].w,
    height: n.big ? big?.h ?? WIN.bigH : n.h ?? APP_WIN[name].h,
    ...((n.big ? big?.at ?? zoomedSpot() : n.at) ? { at: n.big ? big?.at ?? zoomedSpot() : n.at } : {}),
    // The size it opens at, so it draws its background before it has measured itself.
    props: { role: name, big: Boolean(n.big), ...(n.big ? {} : { size: [n.w ?? APP_WIN[name].w, n.h ?? APP_WIN[name].h] }) },
  });
  setWin(name, { ...o, open: true, min: false, overlay, ...(n.big ? {} : { w: n.w, h: n.h, at: n.at }) });
}

/** An app window's key. Herdr reopens a key where it was last dropped, whatever `at` says,
 *  so the zoomed window has its own (to open centered), and a window moved back onto the
 *  desktop gets a fresh one (`gen`) to land where it's put. */
function winKey(name, n) {
  return n.big ? `sl-${name}-big` : n.gen ? `sl-${name}-${n.gen}` : `sl-${name}`;
}

/** Reopens an app window at a fitted frame `f` ({w, h, at}), under a fresh key. */
function moveWinTo(name, f) {
  const n = winState(name);
  setWin(name, { w: f.w, h: f.h, at: f.at, gen: (n.gen ?? 0) + 1 });
  if (n.overlay) closeOverlay(n.overlay);
  openWin(name);
}

const spotWait = {};

/**
 * Where an app window really is: its root's bounds, from a press on it or the pointer
 * moving over it (Herdr moves the window itself and keeps the release, so nothing says
 * where it was dropped). Kept as its spot; and if it hangs off the desktop (dragged past
 * an edge, where only its buttons would be left to grab), it's moved back on. With
 * `settle` it waits for the pointer to rest, so a drag under way isn't cut short.
 */
export function noteWinSpot(name, b, cx, settle = false) {
  if (!b) return;
  const go = () => {
    const n = winState(name);
    if (n.big || !n.open || n.min) return;
    const at = { x: Math.round(b.x), y: Math.round(b.y) };
    const f = fitBox(n.w ?? APP_WIN[name].w, n.h ?? APP_WIN[name].h, at);
    if (f.moved) return moveWinTo(name, f);
    if (n.at?.x !== at.x || n.at?.y !== at.y) setWin(name, { at });
  };
  if (!settle) return go();
  const t = (spotWait[name] = (spotWait[name] ?? 0) + 1);
  cx.timer.after(400, () => t === spotWait[name] && go());
}

export function closeWin(name, overlay, min = false, extra = {}) {
  setWin(name, { open: false, min, ...extra });
  closeOverlay(overlay);
}

export function zoomWin(name, overlay, extra = {}) {
  const big = !winState(name).big;
  closeOverlay(overlay);
  openWin(name, { big, ...extra });
}

/** The tab showing an app window's view (a snowleopard mod pane in a tab of that name), if any. */
export function appTab(name) {
  for (const s of spaces())
    for (const t of s.tabs)
      if (t.name === name && panes().some((p) => p.tab === t.id && p.mod === "snowleopard")) return { space: s, tab: t };
  return null;
}

/** An app window's view as a tab in the main window: goes to it, or makes one in the shown space. */
export function openAppTab(name, role) {
  const at = appTab(name);
  if (at) {
    run("space.select", { id: at.space.id });
    run("tab.select", { id: at.tab.id });
    return;
  }
  run("tab.new", { name, mod: "snowleopard", props: { role, inTab: true } });
}

export const slackTab = () => appTab("Slack");
export const openSlackTab = () => openAppTab("Slack", "slack");
export const linearTab = () => appTab("Linear");
export const openLinearTab = () => openAppTab("Linear", "linear");
export const imessageTab = () => appTab("Messages");
/** Messages as a tab: its window, if open, closes (one copy only). */
export function openImessageTab() {
  const n = winState("imessage");
  if (n.open && n.overlay) closeWin("imessage", n.overlay);
  else if (n.min) setWin("imessage", { min: false });
  openAppTab("Messages", "imessage");
}

/** A new frame from the grip: reopened in place at the new size. */
export function resizeWin(name, f) {
  setWin(name, { big: false, at: { x: f.x, y: f.y }, w: f.w, h: f.h });
  openWin(name);
}

/** The Obsidian vault to show: the open one in Obsidian's list, else the first. */
export async function obsidianVault() {
  const text = await readTextFile(`${home()}/Library/Application Support/obsidian/obsidian.json`);
  if (!text) return null;
  const vaults = Object.values(JSON.parse(text).vaults ?? {});
  return (vaults.find((v) => v.open) ?? vaults[0])?.path ?? null;
}

// ---- applications in the Dock
//
// Shared "sl.dockApps" = [{ path, name, icon }]: apps kept in the Dock beside
// Herdr. Their icons are converted once from each bundle's .icns with sips into
// a hidden folder (Herdr doesn't reload a mod for hidden files).

export const APP_ICONS = `${A}/.icons`;
const APP_DIRS = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities"];

export function dockApps() {
  return shared("sl.dockApps") ?? [];
}

// Apps built into this layout (no bundle of their own) sit in the Dock as "herdr:<Name>".
// Their real icon is fetched once from the service into the hidden icon folder, as an
// installed app's is made from its bundle; until then (or offline) a drawn one stands in.
export const BUILTIN_APPS = { Linear: { path: "herdr:Linear", icon: ICON.linearApp, fetch: "https://linear.app/static/apple-touch-icon.png" } };
const FETCHED = (globalThis.__snowleopardBuiltinIcons ??= {});

/** Fetches the built-in apps' icons that aren't there yet. True when one became ready. */
export async function fetchBuiltinIcons() {
  let changed = false;
  for (const [name, b] of Object.entries(BUILTIN_APPS)) {
    if (!b.fetch) continue;
    const r = await exec("/bin/sh", ["-c", '[ -s "$1" ] || { mkdir -p "$(dirname "$1")" && curl -fsSL -m 15 "$2" -o "$1.part" && mv "$1.part" "$1"; }; [ -s "$1" ] && echo ok', "sh", `${appHome()}/${APP_ICONS}/${name}.png`, b.fetch]).catch(() => null);
    const ok = (r?.stdout ?? "").includes("ok");
    if (ok !== Boolean(FETCHED[name])) changed = true;
    FETCHED[name] = ok;
  }
  return changed;
}

/** An app's icon at s px: a fetched built-in one is square, so it's inset and rounded as a Mac icon is. */
export function appImage(path, s) {
  if (builtinApp(path) && FETCHED[appName(path)]) {
    const m = Math.round(s * 0.09);
    return div().flex_none().w(s).h(s).p(m).child(image(appIcon(path)).w(s - 2 * m).h(s - 2 * m).rounded(Math.round((s - 2 * m) * 0.225)));
  }
  return image(appIcon(path)).flex_none().w(s).h(s);
}

export function builtinApp(path) {
  return String(path ?? "").startsWith("herdr:");
}

// Mac apps that open inside Herdr and join the Dock once by themselves, as Linear does.
const SEEDED_APPS = { Messages: "/System/Applications/Messages.app" };

/** The built-in apps (and Messages) go in the Dock once, as Obsidian and Slack would if installed; removing one keeps it out. */
export function seedBuiltinApps() {
  const seeded = shared("sl.builtinsSeeded") ?? [];
  const todo = [...Object.keys(BUILTIN_APPS), ...Object.keys(SEEDED_APPS)].filter((n) => !seeded.includes(n));
  if (!todo.length) return;
  let apps = dockApps();
  for (const n of todo) if (BUILTIN_APPS[n] && !apps.some((a) => appName(a.path) === n)) apps = [...apps, { path: BUILTIN_APPS[n].path, name: n, icon: true }];
  setShared("sl.dockApps", apps);
  setShared("sl.builtinsSeeded", [...seeded, ...todo]);
  // A Mac app's icon is made from its bundle first (addDockApp), then it shows.
  for (const n of todo) if (SEEDED_APPS[n] && !apps.some((a) => appName(a.path) === n)) addDockApp(SEEDED_APPS[n]);
}

export function appName(path) {
  return path.replace(/^herdr:/, "").split("/").pop().replace(/\.app$/, "");
}

export function appIcon(path) {
  if (builtinApp(path)) return FETCHED[appName(path)] ? `${APP_ICONS}/${appName(path)}.png` : BUILTIN_APPS[appName(path)]?.icon ?? ICON.herdr;
  return `${APP_ICONS}/${appName(path).replace(/[^A-Za-z0-9_.-]/g, "_")}.png`;
}

// $1: the icon folder; the rest: .app bundles. Prints the icons it has.
const ICON_SH = `out="$1"; shift; mkdir -p "$out"
jxa='ObjC.import("AppKit"); function run(a) { const rep = $.NSBitmapImageRep.imageRepWithData($.NSWorkspace.sharedWorkspace.iconForFile(a[0]).TIFFRepresentation); if (!rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(a[1], true)) throw new Error("no icon"); }'
for a in "$@"; do
  n=$(basename "$a" .app | sed 's/[^A-Za-z0-9_.-]/_/g')
  [ -f "$out/$n.png" ] && continue
  if f=$(plutil -extract CFBundleIconFile raw "$a/Contents/Info.plist" 2>/dev/null); then
    case "$f" in *.icns) ;; *) f="$f.icns" ;; esac
    [ -f "$a/Contents/Resources/$f" ] && sips -s format png -Z 128 "$a/Contents/Resources/$f" --out "$out/$n.png" >/dev/null 2>&1
  fi
  # No .icns (an app that keeps its icon only in Assets.car): the icon Finder shows, from macOS.
  [ -f "$out/$n.png" ] || { osascript -l JavaScript -e "$jxa" "$a" "$out/$n.png" >/dev/null 2>&1 && sips -Z 128 "$out/$n.png" >/dev/null 2>&1; } || rm -f "$out/$n.png"
done
ls "$out"`;

/** Makes the icons these apps lack; resolves with the icon file names there are. */
export async function makeAppIcons(paths) {
  const r = await exec("/bin/sh", ["-c", ICON_SH, "sh", `${appHome()}/${APP_ICONS}`, ...paths.filter((p) => !builtinApp(p))]);
  return new Set(r.stdout.split("\n").filter(Boolean));
}

/** Every application in the usual folders (and ~/Applications), by name. */
export async function listApps() {
  const dirs = [...APP_DIRS, "$HOME/Applications"].map((d) => `"${d}"`).join(" ");
  const r = await exec("/bin/sh", ["-c", `find ${dirs} -maxdepth 1 -name '*.app' 2>/dev/null`]);
  const seen = new Set();
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .filter((p) => !seen.has(appName(p)) && seen.add(appName(p)))
    .sort((a, b) => appName(a).localeCompare(appName(b)));
}

export function addDockApp(path) {
  if (dockApps().some((a) => a.path === path)) return;
  if (builtinApp(path)) return setShared("sl.dockApps", [...dockApps(), { path, name: appName(path), icon: true }]);
  setShared("sl.dockApps", [...dockApps(), { path, name: appName(path), icon: false }]);
  // Its icon, made now if the picker hasn't yet; the Dock shows it once it's there.
  makeAppIcons([path])
    .then((have) => {
      if (!have.has(appIcon(path).split("/").pop())) return;
      setShared("sl.dockApps", dockApps().map((a) => (a.path === path ? { ...a, icon: true } : a)));
    })
    .catch(() => {});
}

export function removeDockApp(path) {
  setShared("sl.dockApps", dockApps().filter((a) => a.path !== path));
}

/** Opens an app, or a folder in it. Obsidian opens a folder as a vault by URL. */
export function launch(path, folder = null) {
  if (builtinApp(path)) return Promise.resolve();
  if (folder && appName(path) === "Obsidian") return exec("open", [`obsidian://open?path=${encodeURIComponent(folder)}`]).catch(() => {});
  return exec("open", ["-a", path, ...(folder ? [folder] : [])]).catch(() => {});
}

// ---- words

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function base(path, home) {
  if (!path) return "";
  if (home && path === home) return "~";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "/";
}
