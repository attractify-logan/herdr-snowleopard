// Messages keeps a link's preview (title, site, summary, URL) as an NSKeyedArchiver
// binary property list in the message's payload_data. This reads one from its hex
// (as sqlite3 hands it over), with no help from the Mac: a bplist00 reader, then
// the archive's objects put back together. Nothing here imports Herdr, so it
// runs under node for tests.

class UID {
  constructor(n) {
    this.n = n;
  }
}

/** Bytes from a hex string. */
export function hexBytes(hex) {
  const s = String(hex ?? "");
  const b = new Uint8Array(s.length >> 1);
  for (let i = 0; i < b.length; i++) b[i] = parseInt(s.substr(i * 2, 2), 16);
  return b;
}

/** A binary property list as plain values: dicts as objects, data as bytes, UIDs as UID. */
export function bplist(b) {
  const magic = String.fromCharCode(...b.slice(0, 8));
  if (b.length < 40 || magic !== "bplist00") throw new Error("not a binary plist");
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const num = (at, n) => {
    if (at < 0 || at + n > b.length) throw new Error("plist cut short");
    let v = 0;
    for (let k = 0; k < n; k++) v = v * 256 + b[at + k];
    return v;
  };
  const t = b.length - 32;
  const offSize = b[t + 6];
  const refSize = b[t + 7];
  const count = num(t + 8, 8);
  const top = num(t + 16, 8);
  const table = num(t + 24, 8);
  // A length: in the marker's low half, or (15) an int object after it.
  const size = (at, low) => {
    if (low !== 15) return [low, at + 1];
    const n = 1 << (b[at + 1] & 15);
    return [num(at + 2, n), at + 2 + n];
  };
  const done = new Map();
  const obj = (i, depth) => {
    if (depth > 64 || i >= count) throw new Error("bad plist reference");
    if (done.has(i)) return done.get(i);
    const at = num(table + i * offSize, offSize);
    const m = b[at];
    const low = m & 15;
    let v;
    switch (m >> 4) {
      case 0:
        v = low === 8 ? false : low === 9 ? true : null;
        break;
      case 1:
        v = num(at + 1, 1 << low);
        break;
      case 2:
        v = low === 2 ? view.getFloat32(at + 1) : view.getFloat64(at + 1);
        break;
      case 3:
        v = view.getFloat64(at + 1);
        break;
      case 4: {
        const [n, s] = size(at, low);
        v = b.slice(s, s + n);
        break;
      }
      case 5: {
        const [n, s] = size(at, low);
        v = String.fromCharCode(...b.slice(s, s + n));
        break;
      }
      case 6: {
        const [n, s] = size(at, low);
        let out = "";
        for (let k = 0; k < n; k++) out += String.fromCharCode(num(s + k * 2, 2));
        v = out;
        break;
      }
      case 8:
        v = new UID(num(at + 1, low + 1));
        break;
      case 10:
      case 12: {
        const [n, s] = size(at, low);
        v = [];
        done.set(i, v);
        for (let k = 0; k < n; k++) v.push(obj(num(s + k * refSize, refSize), depth + 1));
        break;
      }
      case 13: {
        const [n, s] = size(at, low);
        v = {};
        done.set(i, v);
        for (let k = 0; k < n; k++) v[String(obj(num(s + k * refSize, refSize), depth + 1))] = obj(num(s + (n + k) * refSize, refSize), depth + 1);
        break;
      }
      default:
        v = null;
    }
    done.set(i, v);
    return v;
  };
  return obj(top, 0);
}

/** An NSKeyedArchiver plist's root, its objects put back together: dictionaries, arrays, strings and URLs as plain values. */
export function unarchive(p) {
  const objs = p?.$objects;
  if (!Array.isArray(objs)) throw new Error("not a keyed archive");
  const out = (v, depth) => {
    if (depth > 40) return null;
    if (v instanceof UID) return out(objs[v.n], depth + 1);
    if (v === "$null") return null;
    if (Array.isArray(v)) return v.map((x) => out(x, depth + 1));
    if (!v || typeof v !== "object" || v instanceof Uint8Array) return v;
    const cls = v.$class instanceof UID ? objs[v.$class.n]?.$classname : null;
    if (Array.isArray(v["NS.keys"])) {
      const o = {};
      v["NS.keys"].forEach((k, i) => (o[String(out(k, depth + 1))] = out(v["NS.objects"]?.[i], depth + 1)));
      return o;
    }
    if (Array.isArray(v["NS.objects"])) return v["NS.objects"].map((x) => out(x, depth + 1));
    if ("NS.relative" in v) {
      const rel = out(v["NS.relative"], depth + 1);
      const base = out(v["NS.base"], depth + 1);
      return base && !/^[a-z][a-z0-9+.-]*:/i.test(rel) ? `${base}${rel}` : rel;
    }
    if ("NS.string" in v) return out(v["NS.string"], depth + 1);
    const o = {};
    for (const [k, x] of Object.entries(v)) if (k !== "$class") o[k] = out(x, depth + 1);
    if (cls) o.$class = cls;
    return o;
  };
  const top = p.$top ?? {};
  return out(top.root ?? Object.values(top)[0], 0);
}

const str = (v) => (typeof v === "string" ? v : typeof v?.URL === "string" ? v.URL : "");
const index = (v) => (Number.isInteger(v?.richLinkImageAttachmentSubstituteIndex) ? v.richLinkImageAttachmentSubstituteIndex : null);

/**
 * A link preview from payload_data (hex): { url, title, site, summary, image, icon }, where
 * image and icon are indexes into the message's preview attachments when Messages says so.
 * Null when there is none, or it was never loaded (a placeholder keeps only the address).
 */
export function linkPreview(hex) {
  if (!hex) return null;
  const root = unarchive(bplist(hexBytes(hex)));
  const md = root?.richLinkMetadata ?? root?.metadata ?? root;
  if (!md || typeof md !== "object") return null;
  const url = str(md.URL) || str(md.originalURL);
  if (!url) return null;
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  return {
    url,
    title: md.richLinkIsPlaceholder === true ? "" : text(md.title),
    site: text(md.siteName),
    summary: text(md.summary),
    image: index(md.image),
    icon: index(md.icon),
  };
}
