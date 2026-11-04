// iMessage on this Mac, for the Messages window (imessage.js) and the Dock: the
// conversations and messages read from Messages' own database, names from
// Contacts, sending through Messages itself, and a watch for new messages (the
// Dock's red badge and a banner for each one, even with the window closed).
//
// It reads ~/Library/Messages/chat.db with /usr/bin/sqlite3 -readonly, which
// needs Full Disk Access for Herdr (System Settings › Privacy & Security). It
// reads nothing until the person asks it to (the window's setup panel sets
// sl.imessage on), so a Mac whose messages aren't yours to read stays unread.
// It sends with osascript, the text passed as an argument, never in the script.
// Reading here marks nothing read in Messages: Herdr keeps its own marks.
//
// With ~/.config/herdr-app/imessage-demo present it answers from made-up
// conversations instead (imessage-demo.js) and never touches the database.

import { exec, home, shared, setShared, notify, watchFolder, appHome } from "herdr";
import { winState, setWin, appTab, dockApps, appName, appIcon, APP_ICONS } from "./kit.js";
import { demoConvs, demoThread, demoSince, demoNames, demoSend } from "./imessage-demo.js";

const SQLITE = "/usr/bin/sqlite3";
const dbPath = () => `${home()}/Library/Messages/chat.db`;
export const PRIVACY_URL = "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles";

// What Messages knows, kept across the window's copies and shared with the watch.
export const KEEP = (globalThis.__snowleopardIMessage ??= {
  convs: [], // newest first: { id, guid, ident, service, group, name, members, last: { id, t, text, mine }, unread: [ROWID] }
  names: new Map(), // phone (last 10 digits) or email → a contact's name
  namesAt: 0,
  photos: new Map(), // the same keys → a contact's picture (a PNG in the mod's hidden icon folder)
  msgs: new Map(), // conversation id → messages, oldest first
  cur: null,
  last: 0, // the newest message's ROWID the watch has seen
  error: null, // "access" (no Full Disk Access, or no database) or a short message
  demo: null, // { on, at }
});
const W = (globalThis.__snowleopardIMessageWatch ??= { owner: null, beat: 0, busy: 0, again: false, watching: null, base: false, last: null });

// ---- the database

// Messages' dates: nanoseconds since 2001 (seconds in old databases), as Unix milliseconds.
const T = (c) => `((CASE WHEN ${c} > 100000000000 THEN ${c} / 1000000 ELSE ${c} * 1000 END) + 978307200000)`;
// The text, else the attributedBody it hides in on recent macOS (decoded here, not in SQL).
const TEXT = (m) => `${m}.text AS text, CASE WHEN ${m}.text IS NULL THEN hex(${m}.attributedBody) END AS body`;
// Real messages: no tapbacks (associated_message_type), no "renamed the group" lines (item_type).
const REAL = (m) => `${m}.item_type = 0 AND ${m}.associated_message_type = 0`;

export const SQL = {
  // Each conversation and its newest message. Unread (their ROWIDs, so Herdr's own read marks
  // can count only what came after them): not mine, not read in Messages (the message's flag,
  // and the chat's "read up to" time, which Messages keeps more faithfully when you read on
  // your phone), and after my last reply there (a reply means it was read, wherever); replied
  // is that reply, so chats merged into one conversation can share it. filtered: Messages put the
  // chat under Unknown Senders (or Junk), which its badge leaves out. Older databases have
  // neither column (new = false).
  convs: (lr = true) => `SELECT c.ROWID AS id, c.guid, c.chat_identifier AS ident, c.service_name AS service, c.display_name AS title, c.style,${lr ? " IFNULL(c.is_filtered, 0) AS filtered," : ""}
  (SELECT group_concat(h.id, char(9)) FROM chat_handle_join x JOIN handle h ON h.ROWID = x.handle_id WHERE x.chat_id = c.ROWID) AS members,
  m.ROWID AS last, ${T("m.date")} AS t, ${TEXT("m")}, m.is_from_me AS mine, m.cache_has_attachments AS att,
  IFNULL((SELECT max(z.message_id) FROM chat_message_join z JOIN message v ON v.ROWID = z.message_id WHERE z.chat_id = c.ROWID AND v.is_from_me = 1), 0) AS replied,
  (SELECT k.ROWID || char(9) || IFNULL(k.service, '') FROM chat_message_join y JOIN message k ON k.ROWID = y.message_id
    WHERE y.chat_id = c.ROWID AND k.is_from_me = 0 AND ${REAL("k")} ORDER BY k.ROWID DESC LIMIT 1) AS their,
  (SELECT ${T("max(k.date)")} FROM chat_message_join y JOIN message k ON k.ROWID = y.message_id
    WHERE y.chat_id = c.ROWID AND k.is_from_me = 0 AND k.service = 'iMessage') AS im,
  (SELECT group_concat(u.ROWID) FROM chat_message_join y JOIN message u ON u.ROWID = y.message_id
    WHERE y.chat_id = c.ROWID AND u.is_read = 0 AND u.is_from_me = 0 AND ${REAL("u")}${lr ? " AND u.date > IFNULL(c.last_read_message_timestamp, 0)" : ""}
    AND u.ROWID > IFNULL((SELECT max(z.message_id) FROM chat_message_join z JOIN message v ON v.ROWID = z.message_id WHERE z.chat_id = c.ROWID AND v.is_from_me = 1), 0)) AS unread
FROM chat c
JOIN message m ON m.ROWID = (SELECT max(j.message_id) FROM chat_message_join j JOIN message k ON k.ROWID = j.message_id WHERE j.chat_id = c.ROWID AND ${REAL("k")})
ORDER BY m.ROWID DESC LIMIT 300;`,
  // A conversation's newest 200 messages (newest first), with their attachments. Lists are
  // joined with tabs and newlines: JSON escapes those, and some sqlite3 builds mangle other control characters.
  thread: (ids) => `SELECT m.ROWID AS id, ${T("m.date")} AS t, ${TEXT("m")}, m.is_from_me AS mine, h.id AS who, m.error, m.service,
  (SELECT group_concat(IFNULL(a.transfer_name, '') || char(9) || IFNULL(a.filename, '') || char(9) || IFNULL(a.mime_type, ''), char(10))
    FROM message_attachment_join x JOIN attachment a ON a.ROWID = x.attachment_id WHERE x.message_id = m.ROWID) AS files
FROM chat_message_join j JOIN message m ON m.ROWID = j.message_id LEFT JOIN handle h ON h.ROWID = m.handle_id
WHERE j.chat_id IN (${[].concat(ids).map(Number).join(",")}) AND ${REAL("m")}
ORDER BY m.ROWID DESC LIMIT 200;`,
  // Messages newer than a ROWID, for banners.
  since: (n) => `SELECT m.ROWID AS id, j.chat_id AS chat, ${T("m.date")} AS t, ${TEXT("m")}, m.is_from_me AS mine, h.id AS who, m.cache_has_attachments AS att
FROM message m JOIN chat_message_join j ON j.message_id = m.ROWID LEFT JOIN handle h ON h.ROWID = m.handle_id
WHERE m.ROWID > ${Number(n)} AND ${REAL("m")}
ORDER BY m.ROWID LIMIT 50;`,
  // Contacts: each phone number and email with its person's name.
  names: `SELECT r.Z_PK AS pk, r.ZFIRSTNAME AS f, r.ZLASTNAME AS l, r.ZORGANIZATION AS o, p.ZFULLNUMBER AS v FROM ZABCDPHONENUMBER p JOIN ZABCDRECORD r ON r.Z_PK = p.ZOWNER
UNION ALL SELECT r.Z_PK, r.ZFIRSTNAME, r.ZLASTNAME, r.ZORGANIZATION, e.ZADDRESS FROM ZABCDEMAILADDRESS e JOIN ZABCDRECORD r ON r.Z_PK = e.ZOWNER;`,
};

/** Is the demo switched on (a file in Herdr's folder)? Asked at most every 10 s. */
export async function demoOn() {
  const now = Date.now();
  if (KEEP.demo && now - KEEP.demo.at < 10000) return KEEP.demo.on;
  const r = await exec("/bin/sh", ["-c", '[ -f "$HOME/.config/herdr-app/imessage-demo" ]']).catch(() => null);
  const on = r?.code === 0;
  // In or out of the demo: nothing made up is kept for real conversations, or the other way round.
  if (KEEP.demo && KEEP.demo.on !== on) {
    Object.assign(KEEP, { convs: [], msgs: new Map(), cur: null, last: 0 });
    W.base = false;
  }
  KEEP.demo = { on, at: now };
  return on;
}

/** Whether to read at all: the demo, or the person said so in the setup panel. */
export async function enabled() {
  return (await demoOn()) || winState("imessage").on === true;
}

/** One read of Messages' database. Throws "access" when macOS won't let Herdr open it. */
async function sql(query, force = false) {
  if (!force && winState("imessage").on !== true) throw new Error("off");
  const r = await exec(SQLITE, ["-readonly", "-json", dbPath(), query]);
  if (r.code !== 0) {
    const err = r.stderr ?? "";
    if (/authori[sz]ation denied|unable to open|not permitted|no such table: (chat|message)/i.test(err)) throw new Error("access");
    // The line that says what went wrong: newer sqlite3 follows it with the query and an arrow.
    const lines = err.trim().split("\n");
    throw new Error((lines.find((l) => /error|no such|unable|locked|malformed/i.test(l)) ?? lines[0] ?? "").replace(/^(Parse )?Error:?( near line \d+:)?( in prepare,)?\s*/i, "") || "sqlite failed");
  }
  return r.stdout.trim() ? JSON.parse(r.stdout) : [];
}

// ---- the text inside attributedBody

/** The UTF-8 bytes from a hex string, as text. */
function utf8(hex, from, len) {
  let out = "";
  const end = Math.min(hex.length, from + len * 2);
  for (let i = from; i < end; ) {
    const b = parseInt(hex.substr(i, 2), 16);
    let cp;
    let n;
    if (b < 0x80) (cp = b), (n = 0);
    else if (b >= 0xf0) (cp = b & 0x07), (n = 3);
    else if (b >= 0xe0) (cp = b & 0x0f), (n = 2);
    else if (b >= 0xc0) (cp = b & 0x1f), (n = 1);
    else (cp = 0xfffd), (n = 0);
    i += 2;
    for (let k = 0; k < n; k++, i += 2) {
      const c = i < end ? parseInt(hex.substr(i, 2), 16) : NaN;
      // Not a continuation byte (or cut off): a bad character, and the byte starts the next one.
      if (!(c >= 0x80 && c < 0xc0)) {
        cp = 0xfffd;
        break;
      }
      cp = (cp << 6) | (c & 0x3f);
    }
    out += String.fromCodePoint(cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? 0xfffd : cp);
  }
  return out;
}

const NSSTRING = "4E53537472696E67"; // "NSString"

/**
 * The plain text in an NSAttributedString typedstream (hex), as Messages keeps it: after the
 * NSString class name comes "+" (0x2B) and a length (one byte, or 0x81 and two bytes, or 0x82
 * and four, little-endian), then that many bytes of UTF-8.
 */
export function decodeBody(hex) {
  if (!hex) return "";
  let i = hex.indexOf(NSSTRING);
  if (i < 0) return "";
  i += NSSTRING.length;
  // The "+" starts the string's value a few bytes on (01 94 84 01 2B).
  let plus = -1;
  for (let k = i; k < i + 24 && k < hex.length; k += 2)
    if (hex.substr(k, 2) === "2B") {
      plus = k;
      break;
    }
  if (plus < 0) return "";
  let at = plus + 2;
  const b = parseInt(hex.substr(at, 2), 16);
  at += 2;
  let len = b;
  const le = (n) => {
    let v = 0;
    for (let k = n - 1; k >= 0; k--) v = v * 256 + parseInt(hex.substr(at + k * 2, 2), 16);
    at += n * 2;
    return v;
  };
  if (b === 0x81) len = le(2);
  else if (b === 0x82) len = le(4);
  if (!(len > 0)) return "";
  return utf8(hex, at, len);
}

/** A message row's words: its text, else the decoded body; attachment marks dropped. */
export function words(row) {
  let s = "";
  try {
    s = row.text ?? decodeBody(row.body);
  } catch {}
  return clean(String(s ?? "").replace(/￼/g, "")).trim();
}

/** Text that's safe to draw: no control characters (but tabs and line breaks), no half emoji, not endless. */
export function clean(s) {
  const t = String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "\ufffd");
  return t.length > 6000 ? `${t.slice(0, 6000)}…` : t;
}

// ---- names

/** The key a phone number or email is known by: the last 10 digits, or the email in lower case. */
export function handleKey(h) {
  const s = String(h ?? "").trim();
  if (s.includes("@")) return s.toLowerCase();
  const d = s.replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

/** A raw handle as people write it: +1 (555) 010-0123 for a North American number. */
export function prettyHandle(h) {
  const s = String(h ?? "");
  const d = s.replace(/\D/g, "");
  if (s.includes("@") || d.length < 10) return s;
  if (d.length === 11 && d[0] === "1") return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return s;
}

export function nameFor(h) {
  return KEEP.names.get(handleKey(h)) ?? prettyHandle(h);
}

/** Contacts' names for phone numbers and emails, from each address book on this Mac. Once every 10 minutes. */
async function loadNames() {
  if (Date.now() - KEEP.namesAt < 600000 && KEEP.names.size) return;
  KEEP.namesAt = Date.now();
  let rows = [];
  if (await demoOn()) rows = demoNames();
  else {
    // Each address book's rows as one JSON array, then a line of "--".
    const sh = `for f in ${BOOKS}; do [ -f "$f" ] && ${SQLITE} -readonly -json "$f" "$1" 2>/dev/null; echo "--"; done`;
    const r = await exec("/bin/sh", ["-c", sh, "sh", SQL.names]).catch(() => null);
    // Each address book in turn (its number is its photos' prefix), present or not.
    (r?.stdout ?? "").split(/^--$/m).forEach((part, book) => {
      const t = part.trim();
      if (!t) return;
      try {
        rows = rows.concat(JSON.parse(t).map((x) => ({ ...x, book })));
      } catch {}
    });
  }
  const names = new Map();
  const who = new Map();
  for (const r of rows) {
    const name = [r.f, r.l].filter(Boolean).join(" ") || r.o;
    const k = handleKey(r.v);
    if (name && k && !names.has(k)) names.set(k, name);
    if (k && r.pk != null && !who.has(k)) who.set(k, `${r.book ?? 0}-${r.pk}`);
  }
  KEEP.names = names;
  KEEP.who = who;
  if (!(await demoOn())) loadPhotos(rows).catch(() => {});
}

// Every address book: the main one, then each account's (iCloud, Google, Exchange).
const BOOKS = '"$HOME/Library/Application Support/AddressBook/AddressBook-v22.abcddb" "$HOME/Library/Application Support/AddressBook/Sources/"*/AddressBook-v22.abcddb';
const PHOTOS = `${APP_ICONS}/people`;

// $1: the folder for the pictures. Each contact's thumbnail, kept in the address book itself
// (01 + the image) or beside it (02 + a file name), becomes <book>-<record>.png, 64 px, once.
// Herdr only shows images from the mod's own folder, so they're copied there (never committed: .icons is ignored).
const PHOTOS_SH = `out="$1"; mkdir -p "$out"; i=0
for db in ${BOOKS}; do
  b=$i; i=$((i+1)); [ -f "$db" ] || continue
  ext="$(dirname "$db")/.AddressBook-v22_SUPPORT/_EXTERNAL_DATA"
  ${SQLITE} -readonly "$db" "SELECT Z_PK || char(9) || hex(substr(ZTHUMBNAILIMAGEDATA, 1, 1)) || char(9) || CASE WHEN hex(substr(ZTHUMBNAILIMAGEDATA, 1, 1)) = '02' THEN replace(CAST(substr(ZTHUMBNAILIMAGEDATA, 2) AS TEXT), char(0), '') ELSE '' END FROM ZABCDRECORD WHERE ZTHUMBNAILIMAGEDATA IS NOT NULL" 2>/dev/null |
  while IFS="$(printf '\t')" read -r pk kind ref; do
    png="$out/$b-$pk.png"; [ -s "$png" ] && continue
    case "$kind" in
      01) ${SQLITE} -readonly "$db" "SELECT writefile('$out/tmp.img', substr(ZTHUMBNAILIMAGEDATA, 2)) FROM ZABCDRECORD WHERE Z_PK = $pk" >/dev/null 2>&1 ;;
      02) case "$ref" in */*|"") continue ;; esac; cp "$ext/$ref" "$out/tmp.img" 2>/dev/null || continue ;;
      *) continue ;;
    esac
    sips -s format png -Z 64 "$out/tmp.img" --out "$png" >/dev/null 2>&1 || rm -f "$png"
    rm -f "$out/tmp.img"
  done
done
ls "$out"`;

/** Contacts' pictures for the conversation list: made once, then found by phone number or email. */
async function loadPhotos(rows) {
  const r = await exec("/bin/sh", ["-c", PHOTOS_SH, "sh", `${appHome()}/${PHOTOS}`]);
  const have = new Set(r.stdout.split("\n").filter((f) => f.endsWith(".png")));
  const photos = new Map();
  for (const x of rows) {
    const f = `${x.book}-${x.pk}.png`;
    const k = handleKey(x.v);
    if (k && have.has(f) && !photos.has(k)) photos.set(k, `${PHOTOS}/${f}`);
  }
  KEEP.photos = photos;
}

/** A one-to-one conversation's contact picture (a mod-relative path), if Contacts has one. */
export function photoFor(c) {
  if (!c || c.group) return null;
  return KEEP.photos.get(handleKey(c.ident || c.members[0])) ?? null;
}

// ---- conversations and messages

/** The conversations, newest first, with their names and unread counts. */
export async function loadConvs(force = false) {
  const demo = await demoOn();
  let rows;
  if (demo) rows = demoConvs();
  else
    try {
      rows = await sql(SQL.convs(!KEEP.noReadTime), force);
    } catch (e) {
      // An older Messages database without the chat's read time: the messages' own flags then.
      if (!/no such column/i.test(e?.message ?? "")) throw e;
      KEEP.noReadTime = true;
      rows = await sql(SQL.convs(false), force);
    }
  await loadNames();
  KEEP.error = null;
  const list = rows.map((r) => {
    const members = String(r.members ?? "").split("\t").filter(Boolean);
    const group = r.style === 43 || members.length > 1;
    const name = r.title || (group ? members.map((m) => firstName(nameFor(m))).join(", ") || "Group" : nameFor(r.ident || members[0]));
    return {
      id: String(r.id),
      ids: [String(r.id)],
      guid: r.guid,
      ident: r.ident,
      service: r.service || "iMessage",
      group,
      name,
      members,
      last: { id: Number(r.last), t: Number(r.t), text: words(r) || (r.att ? "Attachment" : ""), mine: Boolean(r.mine) },
      replied: Number(r.replied ?? 0),
      filtered: Number(r.filtered ?? 0) !== 0,
      // Their newest message ([ROWID, service]) and when they last sent an iMessage, for how to send.
      their: r.their ? [Number(String(r.their).split("\t")[0]), String(r.their).split("\t")[1] ?? ""] : [0, ""],
      im: Number(r.im ?? 0),
      unread: String(r.unread ?? "").split(",").filter(Boolean).map(Number),
    };
  });
  KEEP.convs = merge(list);
  KEEP.chatTo = new Map(KEEP.convs.flatMap((c) => c.ids.map((x) => [x, c.id])));
  const top = KEEP.convs.reduce((n, c) => Math.max(n, c.last.id), 0);
  if (top > KEEP.last) KEEP.last = top;
  return KEEP.convs;
}

/**
 * One conversation per person, as Messages shows it: Messages keeps a separate chat for each
 * service and address (an iMessage chat and an SMS chat, or a phone number and an email on one
 * contact). Their messages are read together, sent by iMessage when one of them is iMessage, and
 * known by the lowest chat id among them, which doesn't move when another becomes the newest.
 */
function merge(list) {
  const out = [];
  const by = new Map();
  for (const c of list) {
    if (c.group) {
      out.push(c);
      continue;
    }
    const h = c.ident || c.members[0];
    const k = KEEP.who?.get(handleKey(h)) ?? handleKey(h);
    const into = k ? by.get(k) : null;
    if (!into) {
      if (k) by.set(k, c);
      out.push(c);
      continue;
    }
    // The list is newest first, so `into` keeps the newest message.
    into.ids.push(c.id);
    into.unread = into.unread.concat(c.unread);
    into.replied = Math.max(into.replied, c.replied);
    if (c.their[0] > into.their[0]) into.their = c.their;
    into.im = Math.max(into.im, c.im);
    into.filtered = into.filtered && c.filtered;
    if (into.service !== "iMessage" && c.service === "iMessage") Object.assign(into, { service: c.service, ident: c.ident, guid: c.guid });
  }
  // How to send, as near as Messages' own choice (it asks Apple whether they have iMessage, which
  // Herdr can't): iMessage when they've sent one in the last 60 days or their newest came by
  // iMessage, a text when they've only been texting, else the chat's own service.
  for (const c of out) {
    if (c.group) continue;
    if (c.im > Date.now() - 60 * 86400000 || c.their[1] === "iMessage") c.service = "iMessage";
    else if (c.their[1] === "SMS" || c.their[1] === "RCS") c.service = "SMS";
  }
  for (const c of out) {
    // Unknown senders and junk: listed, but not counted, as Messages' own badge doesn't.
    if (c.filtered) c.unread = [];
    if (c.ids.length < 2) continue;
    c.id = c.ids.reduce((a, x) => (Number(x) < Number(a) ? x : a));
    // A reply in any of its chats means what came before it was read.
    c.unread = c.unread.filter((x) => x > c.replied);
  }
  return out;
}

/** The conversation a chat (Messages' own id) is part of. */
export function convOf(chat) {
  return KEEP.chatTo?.get(String(chat)) ?? String(chat);
}

function firstName(n) {
  return /^[+(\d]/.test(n) || n.includes("@") ? n : n.split(" ")[0];
}

/** A conversation's messages, oldest first. */
export async function loadThread(id) {
  const ids = KEEP.convs.find((c) => c.id === String(id))?.ids ?? [String(id)];
  const rows = (await demoOn()) ? demoThread(ids) : await sql(SQL.thread(ids));
  const out = [];
  for (const r of [...rows].reverse()) {
    const files = String(r.files ?? "")
      .split("\n")
      .filter(Boolean)
      .map((f) => {
        const [name, path, mime] = f.split("\t");
        return { name: name || String(path ?? "").split("/").pop() || "Attachment", path: String(path ?? "").replace(/^~/, home()), mime: mime ?? "" };
      });
    out.push({ id: Number(r.id), t: Number(r.t), text: words(r), mine: Boolean(r.mine), who: r.who ?? "", failed: Boolean(r.error), service: r.service ?? "", files });
  }
  KEEP.msgs.set(String(id), out);
  return out;
}

// ---- diagnostics

/**
 * What Herdr sees, for finding a problem from afar: chat ids, services, message ids and flags
 * only, never a name, address or a word of a message. The ⚙ menu copies it.
 */
export async function diagnostics() {
  const out = ["Herdr Messages diagnostics (ids and services only: no names, numbers or text)"];
  const c = KEEP.convs.find((x) => x.id === KEEP.cur);
  const chatsOf = (cv) => cv.ids.join("+");
  out.push(`database: ${KEEP.noReadTime ? "older (no read time or filter columns)" : "read time and filter columns"}; ${KEEP.convs.length} conversations from ${KEEP.convs.reduce((n, x) => n + x.ids.length, 0)} chats; contacts ${KEEP.names.size}, photos ${KEEP.photos.size}`);
  try {
    const handles = await sql("SELECT ROWID AS id, id AS h FROM handle;");
    if (c && !c.group) {
      // Every chat with this person (by contact card, else address), merged or not.
      const key = (h) => KEEP.who?.get(handleKey(h)) ?? handleKey(h);
      const mine = key(c.ident || c.members[0]);
      const hs = handles.filter((h) => key(h.h) === mine).map((h) => Number(h.id));
      const chats = hs.length
        ? await sql(`SELECT DISTINCT c.ROWID AS id, c.service_name AS svc, c.style${KEEP.noReadTime ? "" : ", IFNULL(c.is_filtered, 0) AS f"}, (SELECT max(message_id) FROM chat_message_join WHERE chat_id = c.ROWID) AS newest FROM chat c JOIN chat_handle_join x ON x.chat_id = c.ROWID WHERE x.handle_id IN (${hs.join(",")});`)
        : [];
      const rows = KEEP.msgs.get(c.id) ?? [];
      out.push(`open conversation ${c.id}: chats ${chatsOf(c)}; sends by ${c.service}; their newest #${c.their?.[0] ?? 0} (${c.their?.[1] || "-"}); last iMessage from them ${c.im ? `${Math.round((Date.now() - c.im) / 3600000)} h ago` : "never"}; conversation newest #${c.last.id}; thread ${rows.length} messages, newest #${rows[rows.length - 1]?.id ?? 0}`);
      out.push(`  this person's addresses: ${hs.length}; their chats: ${chats.map((x) => `${x.id} ${x.svc} style ${x.style}${x.f ? ` filtered ${x.f}` : ""} newest #${x.newest ?? 0}${c.ids.includes(String(x.id)) ? "" : ` NOT MERGED (${KEEP.chatTo?.has(String(x.id)) ? `shown as ${convOf(x.id)}` : "not listed"})`}`).join("; ") || "none"}`);
    } else out.push(`open conversation: ${c ? `${c.id} (group, chats ${chatsOf(c)})` : "none"}`);
    const newest = await sql(`SELECT m.ROWID AS id, j.chat_id AS chat, m.service AS svc, m.is_from_me AS mine, m.item_type AS it, m.associated_message_type AS at FROM message m LEFT JOIN chat_message_join j ON j.message_id = m.ROWID ORDER BY m.ROWID DESC LIMIT 8;`);
    out.push("newest messages in the database:");
    for (const m of newest) out.push(`  #${m.id} chat ${m.chat ?? "none"} ${m.svc || "-"} ${m.mine ? "from me" : "from them"}${m.it || m.at ? ` (item ${m.it}, reaction ${m.at})` : ""}: ${m.chat == null ? "in no chat" : KEEP.chatTo?.has(String(m.chat)) ? `shown in conversation ${convOf(m.chat)}` : "chat not listed"}`);
  } catch (e) {
    out.push(`couldn't read: ${e?.message ?? e}`);
  }
  const u = unread();
  out.push(`unread here: ${Object.keys(u).length ? Object.entries(u).map(([id, n]) => {
    const cv = KEEP.convs.find((x) => x.id === id);
    return `${id} (${cv ? `${cv.group ? "group" : KEEP.names.has(handleKey(cv.ident || cv.members[0])) ? "contact" : "not a contact"}, chats ${chatsOf(cv)}, ${cv.service}` : "gone"}): ${n}`;
  }).join("; ") : "none"}`);
  return out.join("\n");
}

// ---- sending

const SEND = `on run argv
  set {svc, who, cid, t} to {item 1 of argv, item 2 of argv, item 3 of argv, item 4 of argv}
  tell application "Messages"
    if who is "" then
      send t to chat id cid
    else
      try
        if svc is "SMS" then
          set s to 1st account whose service type = SMS
        else
          set s to 1st account whose service type = iMessage
        end if
        send t to participant who of s
      on error
        send t to chat id cid
      end try
    end if
  end tell
end run`;

/** Sends text through Messages: to the person in a one-to-one conversation, to the chat in a group. */
export async function sendText(conv, text) {
  if (await demoOn()) return demoSend(conv.id, text);
  const who = conv.group ? "" : conv.ident || conv.members[0] || "";
  const r = await exec("/usr/bin/osascript", ["-e", SEND, conv.service, who, conv.guid ?? "", text]);
  if (r.code !== 0) throw new Error(sendError(r.stderr ?? ""));
}

function sendError(err) {
  if (/-1743|not authori[sz]ed/i.test(err)) return "Herdr isn't allowed to control Messages. Turn it on in System Settings › Privacy & Security › Automation, then try again.";
  if (/-1728|can.t get/i.test(err)) return "Messages couldn't find this conversation to send to. Try sending from Messages.";
  if (/-1712|timed out/i.test(err)) return "Messages took too long to answer.";
  return "Messages didn't send it. Try again, or send from Messages.";
}

/** Opens the conversation in Messages: a person by their address, a group by Messages itself. */
export function openInMessages(conv) {
  const who = conv && !conv.group ? conv.ident || conv.members[0] : null;
  exec("open", who ? [`imessage:${who}`] : ["-a", "Messages"]).catch(() => {});
}

// ---- unread, in Herdr's own view

/** Herdr's read marks: conversation id → the newest ROWID read here. Messages' own stay as they are. */
function seen() {
  return shared("sl.imessageSeen") ?? {};
}

/** Unread counts by conversation id, less what was read here. */
export function unread() {
  return shared("sl.imessageUnread") ?? {};
}

export function imessageBadge() {
  let n = 0;
  for (const v of Object.values(unread())) n += v;
  return n;
}

function publish() {
  const s = seen();
  const out = {};
  for (const c of KEEP.convs) {
    const n = c.unread.filter((id) => id > Number(s[c.id] ?? 0)).length;
    if (n) out[c.id] = n;
  }
  if (JSON.stringify(out) !== JSON.stringify(unread())) setShared("sl.imessageUnread", out);
}

/** Read here up to a message: clears its count in Herdr (not in Messages). */
export function markSeen(id, rowid) {
  if (!id || !rowid) return;
  const s = seen();
  if (Number(s[id] ?? 0) >= rowid && !unread()[id]) return;
  setShared("sl.imessageSeen", { ...s, [id]: Math.max(Number(s[id] ?? 0), rowid) });
  publish();
}

export function markAllSeen() {
  const s = { ...seen() };
  for (const c of KEEP.convs) s[c.id] = Math.max(Number(s[c.id] ?? 0), c.last.id);
  setShared("sl.imessageSeen", s);
  publish();
}

/** Whether Messages is on screen here: its window open, or its tab the one shown. */
export function imessageShown() {
  const w = winState("imessage");
  if (w.open && !w.min) return true;
  const at = appTab("Messages");
  return Boolean(at?.space.active && at.tab.active);
}

/** The conversation the last banner was about (the window opens to it). */
export function lastNotified() {
  return W.last;
}

/** The setup panel's button: reads once to see whether macOS lets Herdr, and turns reading on if so. */
export async function connect() {
  try {
    await loadConvs(true);
    setWin("imessage", { on: true });
    W.base = false;
    publish();
    return null;
  } catch (e) {
    KEEP.error = e?.message === "access" ? "access" : e?.message ?? "error";
    return KEEP.error;
  }
}

/** Stops reading: the setup panel comes back, the badge goes. */
export function disconnect() {
  setWin("imessage", { on: false });
  Object.assign(KEEP, { convs: [], msgs: new Map(), cur: null, error: null });
  setShared("sl.imessageUnread", {});
}

// ---- the watch (from the Dock: always on screen)

/** Watches Messages' folder for a change to its database (chat.db-wal), and checks every 15 s besides. */
export function watchIMessage(cx) {
  const who = `w${Math.random().toString(36).slice(2)}`;
  cx.timer.after(2500, (cx) => tick(cx, who));
  cx.timer.every(15000, (cx) => tick(cx, who));
}

function tick(cx, who) {
  const now = Date.now();
  if (W.owner && W.owner !== who && now - W.beat < 60000) return;
  W.owner = who;
  W.beat = now;
  if (W.watching !== who) {
    W.watching = who;
    cx.spawn(async (cx) => {
      // Reload-safe: a newer watch takes over and this loop ends at its next wake.
      while (W.watching === who) {
        if (!(await enabled()) || (await demoOn())) {
          await cx.sleep(15000);
          continue;
        }
        let changed;
        try {
          changed = await watchFolder(`${home()}/Library/Messages`);
        } catch {
          // No access to the folder yet: the 15 s check is all there is.
          await cx.sleep(60000);
          continue;
        }
        if (W.watching !== who) break;
        if (changed.some((p) => p.endsWith("chat.db-wal") || p.endsWith("chat.db"))) check(cx);
      }
    });
  }
  check(cx);
}

/** One check, never two at once; a change during one runs another after it. */
function check(cx) {
  const now = Date.now();
  if (W.busy && now - W.busy < 60000) {
    W.again = true;
    return;
  }
  const mine = (W.busy = now);
  cx.spawn(async (cx) => {
    try {
      if (!(await enabled())) {
        if (Object.keys(unread()).length) setShared("sl.imessageUnread", {});
        return;
      }
      await news();
    } catch (e) {
      KEEP.error = e?.message === "access" ? "access" : KEEP.error;
    } finally {
      if (W.busy === mine) W.busy = 0;
      if (W.again) {
        W.again = false;
        cx.timer.after(800, (cx) => check(cx));
      }
    }
  });
}

async function news() {
  const before = KEEP.last;
  const demo = await demoOn();
  const fresh = demo ? demoSince(before) : before ? await sql(SQL.since(before)) : [];
  await loadConvs();
  // A tick others can redraw on (the window refetches its open conversation when it moves).
  if (KEEP.last !== (shared("sl.imessageTick") ?? 0)) setShared("sl.imessageTick", KEEP.last);
  publish();
  // The first look after a start sets where "new" begins: no banners for the backlog.
  if (!W.base || !before) {
    W.base = true;
    return;
  }
  const incoming = fresh.filter((m) => !m.mine);
  const shown = imessageShown();
  const out = incoming.filter((m) => !(shown && KEEP.cur === convOf(m.chat)));
  if (!out.length) return;
  // A burst (Messages catching up after sleep) is one banner, not a stack of them.
  if (out.length > 3) {
    const chats = new Set(out.map((m) => convOf(m.chat)));
    W.last = convOf(out[out.length - 1].chat);
    return banner(`${out.length} new messages`, chats.size === 1 ? `In ${KEEP.convs.find((c) => chats.has(c.id))?.name ?? "one conversation"}` : `In ${chats.size} conversations`);
  }
  for (const m of out) {
    const c = KEEP.convs.find((x) => x.id === convOf(m.chat));
    const text = words(m) || (m.att ? "Sent an attachment" : "New message");
    W.last = convOf(m.chat);
    banner(c?.name ?? nameFor(m.who), c?.group ? `${firstName(nameFor(m.who))}: ${text}` : text);
  }
}

function banner(title, body) {
  const app = dockApps().find((a) => appName(a.path) === "Messages");
  notify({
    title,
    body: body.length > 200 ? `${body.slice(0, 199)}…` : body,
    level: "info",
    timeout: 8000,
    ...(app?.icon ? { icon: appIcon(app.path) } : {}),
    action: { name: "snowleopard.imessageunread" },
  });
}
