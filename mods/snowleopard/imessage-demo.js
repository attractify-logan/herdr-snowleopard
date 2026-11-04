// Made-up iMessage conversations for screenshots and tests: imessagedb.js answers
// from here, in the same rows its SQL would return, while
// ~/.config/herdr-app/imessage-demo exists, and then never reads Messages'
// database or sends anything. Some texts come as attributedBody blobs (text
// NULL), as recent macOS keeps them, so the decoder runs too. Sent messages and
// `snowleopard.imessagedemo` (a new message arriving) stick until the mod reloads.

// Kept across the mod's copies, so changes stick everywhere.
const G = (globalThis.__snowleopardIMessageDemo ??= {});
const T0 = (G.t0 ??= Date.now());
const ago = (min) => T0 - min * 60000;

const PEOPLE = {
  maya: { f: "Maya", l: "Torres", v: "+15555550142" },
  ben: { f: "Ben", l: "Okafor", v: "ben.okafor@example.com" },
  priya: { f: "Priya", l: "Shah", v: "+15555550178" },
  mom: { f: "Mom", l: "", v: "+15555550110" },
  dad: { f: "Dad", l: "", v: "+15555550111" },
};
const H = (k) => PEOPLE[k].v;

const CHATS = [
  { id: 1, guid: "iMessage;-;+15555550142", ident: H("maya"), service: "iMessage", title: "", style: 45, members: ["maya"] },
  { id: 2, guid: "iMessage;+;chat100200300", ident: "chat100200300", service: "iMessage", title: "Weekend Hike", style: 43, members: ["maya", "ben", "priya"] },
  { id: 3, guid: "iMessage;-;ben.okafor@example.com", ident: H("ben"), service: "iMessage", title: "", style: 45, members: ["ben"] },
  { id: 4, guid: "iMessage;+;chat400500600", ident: "chat400500600", service: "iMessage", title: "", style: 43, members: ["mom", "dad"] },
  { id: 5, guid: "SMS;-;+15555550199", ident: "+15555550199", service: "SMS", title: "", style: 45, members: [] },
  { id: 6, guid: "iMessage;-;+15555550178", ident: H("priya"), service: "iMessage", title: "", style: 45, members: ["priya"] },
];

let n = 100;
const MSGS = (G.msgs ??= []);
const fresh = !MSGS.length;
// [chat, minutes ago, from (a person, or "me"), text, { blob, read, files, error }]
function m(chat, min, from, text, o = {}) {
  if (!fresh) return;
  const mine = from === "me";
  MSGS.push({ id: (n += 1), chat, t: ago(min), mine, who: mine ? "" : PEOPLE[from] ? H(from) : from, text, blob: Boolean(o.blob), read: mine || o.read !== false, files: o.files ?? [], error: o.error ?? 0 });
}

m(3, 2900, "ben", "Did you end up trying that ramen place on 5th?");
m(3, 2890, "me", "Yes! Get the spicy miso. Worth the wait.");
m(3, 2880, "ben", "Noted 🍜", { blob: true });
m(4, 1500, "mom", "Are you still coming for dinner Sunday?");
m(4, 1495, "dad", "I'm making the lasagna", { blob: true });
m(4, 1490, "me", "Wouldn't miss it. I'll bring dessert.");
m(4, 1480, "mom", "Perfect ❤️");
m(6, 700, "priya", "Here's the photo from the trailhead", { files: [{ name: "IMG_2041.HEIC", path: "~/Library/Messages/Attachments/demo/IMG_2041.HEIC", mime: "image/heic" }] });
m(6, 690, "me", "That view! Send me the full-size one?");
m(6, 680, "priya", "Will do tonight.");
m(2, 240, "ben", "Saturday still on? Forecast says clear skies.");
m(2, 235, "priya", "I'm in. Can someone bring the extra headlamp?");
m(2, 230, "me", "I've got two, I'll bring both.");
m(2, 50, "maya", "Trailhead at 7:30? Parking fills up fast after 8.", { read: false, blob: true });
m(2, 45, "ben", "7:30 works. I'll pick up coffee on the way ☕️", { read: false });
m(2, 40, "priya", "Meet you there. Bringing snacks for the summit, and the good trail mix, the one with the dark chocolate and dried cherries that everybody always eats first.", { read: false, blob: true });
m(5, 30, "+15555550199", "Your table for 2 is ready. Please check in with the host within 10 minutes.", { read: true });
m(1, 25, "maya", "Hey! Are you around this afternoon?");
m(1, 22, "me", "Mostly, after 3. What's up?");
m(1, 8, "maya", "Want to grab coffee and go over the plan for Saturday?", { read: false });
m(1, 6, "maya", "I can come to you 😊", { read: false, blob: true });

/** Text as Messages keeps it on recent macOS: an NSAttributedString typedstream, in hex. */
function blob(text) {
  const bytes = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const hx = (b) => b.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  const ascii = (s) => hx([...s].map((c) => c.charCodeAt(0)));
  const len = bytes.length < 0x80 ? [bytes.length] : [0x81, bytes.length & 255, bytes.length >> 8];
  return `040B${ascii("streamtyped")}81E803840140848484 12${ascii("NSAttributedString")}0084840 8${ascii("NSObject")}0085928484840 8${ascii("NSString")}019484012B${hx(len)}${hx(bytes)}8684026949 01${hx([bytes.length & 127])}928484840C${ascii("NSDictionary")}00`.replace(/ /g, "");
}

const textOf = (x) => (x.blob ? { text: null, body: blob(x.text) } : { text: x.text, body: null });
const filesOf = (x) => x.files.map((f) => `${f.name}\t${f.path}\t${f.mime}`).join("\n");
const membersOf = (c) => (c.members.length ? c.members.map(H) : [c.ident]).join("\t");

export function demoNames() {
  return Object.values(PEOPLE).map((p) => ({ f: p.f, l: p.l, o: null, v: p.v }));
}

export function demoConvs() {
  const out = [];
  for (const c of CHATS) {
    const mine = MSGS.filter((x) => x.chat === c.id);
    if (!mine.length) continue;
    const last = mine[mine.length - 1];
    const replied = mine.filter((x) => x.mine).reduce((a, x) => Math.max(a, x.id), 0);
    const unread = mine.filter((x) => !x.mine && !x.read && x.id > replied).map((x) => x.id).join(",");
    out.push({ id: c.id, guid: c.guid, ident: c.ident, service: c.service, title: c.title, style: c.style, members: membersOf(c), last: last.id, t: last.t, ...textOf(last), mine: last.mine ? 1 : 0, att: last.files.length ? 1 : 0, unread });
  }
  return out.sort((a, b) => b.last - a.last);
}

export function demoThread(id) {
  return MSGS.filter((x) => x.chat === Number(id))
    .map((x) => ({ id: x.id, t: x.t, ...textOf(x), mine: x.mine ? 1 : 0, who: x.who, error: x.error, files: filesOf(x) }))
    .reverse();
}

export function demoSince(rowid) {
  return MSGS.filter((x) => x.id > rowid).map((x) => ({ id: x.id, chat: x.chat, t: x.t, ...textOf(x), mine: x.mine ? 1 : 0, who: x.who, att: x.files.length ? 1 : 0 }));
}

export function demoSend(chat, text) {
  const top = MSGS.reduce((a, x) => Math.max(a, x.id), 0);
  MSGS.push({ id: top + 1, chat: Number(chat), t: Date.now(), mine: true, who: "", text, blob: false, read: true, files: [], error: 0 });
}

const ARRIVALS = [
  [3, "ben", "Also, are we still splitting the campsite for next month?"],
  [2, "priya", "Forecast just changed, bring a rain jacket just in case 🌧️"],
  [1, "maya", "Running 5 minutes late!"],
  [4, "mom", "Don't forget to call your grandmother"],
];

/** A new message arrives (the command snowleopard.imessagedemo), from the next person in line. */
export function demoIncoming() {
  const [chat, from, text] = ARRIVALS[(G.arrived = (G.arrived ?? -1) + 1) % ARRIVALS.length];
  const top = MSGS.reduce((a, x) => Math.max(a, x.id), 0);
  MSGS.push({ id: top + 1, chat, t: Date.now(), mine: false, who: H(from), text, blob: true, read: false, files: [], error: 0 });
}
