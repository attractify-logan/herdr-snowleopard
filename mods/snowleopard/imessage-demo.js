// Made-up iMessage conversations for screenshots and tests: imessagedb.js answers
// from here, in the same rows its SQL would return, while
// ~/.config/herdr-app/imessage-demo exists, and then never reads Messages'
// database or sends anything. Some texts come as attributedBody blobs (text
// NULL), as recent macOS keeps them, so the decoder runs too. Links come with
// previews as Messages archives them (made with LinkPresentation on a Mac, read by
// plist.js), and tapbacks as Messages' own rows. Sent messages and
// `snowleopard.imessagedemo` (a new message or tapback arriving) stick until Herdr restarts.

import { appHome } from "herdr";
import { A } from "./kit.js";

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
  // Priya again, by SMS: Messages keeps a separate chat per service; Herdr shows the two as one.
  { id: 7, guid: "SMS;-;+15555550178", ident: H("priya"), service: "SMS", title: "", style: 45, members: ["priya"] },
];

let n = 100;
const MSGS = (G.msgs ??= []);
const REACTS = (G.reacts ??= []);
const fresh = !MSGS.length;
// Messages' guids are 36 characters.
const guidOf = (id) => `DE300000-0000-4000-8000-${String(id).padStart(12, "0")}`;
// [chat, minutes ago, from (a person, or "me"), text, { blob, read, files, error, payload }] → its id
function m(chat, min, from, text, o = {}) {
  if (!fresh) return 0;
  const mine = from === "me";
  MSGS.push({ id: (n += 1), chat, t: ago(min), mine, who: mine ? "" : PEOPLE[from] ? H(from) : from, text, blob: Boolean(o.blob), read: mine || o.read !== false, files: o.files ?? [], error: o.error ?? 0, payload: o.payload ?? null });
  return n;
}
// A tapback: [on message id, from (a person, or "me"), Messages' type (2000 love … 2006 emoji, 3000+ off), emoji, as a balloon (bp:)]
function tb(on, from, kind, emoji = null, bp = false) {
  if (!fresh) return;
  const x = MSGS.find((y) => y.id === on);
  const mine = from === "me";
  REACTS.push({ id: (n += 1), chat: x.chat, t: x.t + 60000, mine, who: mine ? "" : H(from), kind, emoji, target: `${bp ? "bp:" : "p:0/"}${guidOf(on)}` });
}
// Two link previews, archived as Messages archives them.
const TRAIL = "62706C6973743030D4010203040506070A582476657273696F6E592461726368697665725424746F7058246F626A6563747312000186A05F100F4E534B657965644172636869766572D1080954726F6F748001AD0B0C15162C3233393D3E3F404455246E756C6CD30D0E0F101214574E532E6B6579735A4E532E6F626A656374735624636C617373A1118002A1138003800C5F1010726963684C696E6B4D65746164617461DB1718191A1B1C0F1D1E1F202122232424262724292A2B5773756D6D6172795B6F726967696E616C55524C58736974654E616D655C6973496E636F6D706C6574655F100F757365734163746976697479507562557469746C655F10146973456E636F646564466F724C6F63616C5573655776657273696F6E5F1011636F6C6C61626F726174696F6E547970655355524C80098004800A08088008800B08100110008007D32D0F2E2F3031574E532E626173655B4E532E72656C61746976658000800680055F102668747470733A2F2F747261696C732E6578616D706C652E636F6D2F736576656E2D6C616B6573D2343536375A24636C6173736E616D655824636C6173736573554E5355524CA23638584E534F626A656374D32D0F2E2F30318000800680056F101E0053006500760065006E0020004C0061006B006500730020004C006F006F00700020201300200054007200610069006C0020004700750069006400655F1043412031342D6D696C65206C6F6F70207061737420736576656E20616C70696E65206C616B65732C20776974682063616D70696E67206174205570706572205477696E2E5E4578616D706C6520547261696C73D2343541425E4C504C696E6B4D65746164617461A243385E4C504C696E6B4D65746164617461D2343545465C4E5344696374696F6E617279A2453800080011001A00240029003200370049004C0051005300610067006E007600810088008A008C008E0090009200A500BC00C400D000D900E600F800FE0115011D0131013501370139013B013C013D013F01410142014401460148014F015701630165016701690192019701A201AB01B101B401BD01C401C601C801CA0209024F025E0263027202750284028902960000000000000201000000000000004700000000000000000000000000000299";
const FORECAST = "62706C6973743030D4010203040506070A582476657273696F6E592461726368697665725424746F7058246F626A6563747312000186A05F100F4E534B657965644172636869766572D1080954726F6F748001AD0B0C15162C3233393D3E3F404455246E756C6CD30D0E0F101214574E532E6B6579735A4E532E6F626A656374735624636C617373A1118002A1138003800C5F1010726963684C696E6B4D65746164617461DB1718191A1B1C0F1D1E1F202122232424262724292A2B5773756D6D6172795B6F726967696E616C55524C58736974654E616D655C6973496E636F6D706C6574655F100F757365734163746976697479507562557469746C655F10146973456E636F646564466F724C6F63616C5573655776657273696F6E5F1011636F6C6C61626F726174696F6E547970655355524C80098004800A08088008800B08100110008007D32D0F2E2F3031574E532E626173655B4E532E72656C61746976658000800680055F102468747470733A2F2F776561746865722E6578616D706C652E636F6D2F6D6F756E742D7369D2343536375A24636C6173736E616D655824636C6173736573554E5355524CA23638584E534F626A656374D32D0F2E2F30318000800680055F101B4D6F756E742053693A20536174757264617920466F7265636173746F10400043006C00650061007200200061006E006400200035003400B000460020006100740020007400680065002000730075006D006D0069007400200062007900200031003000200041004D002C0020006C0069006700680074002000770069006E0064002000660072006F006D002000740068006500200077006500730074002E5F100F4578616D706C652057656174686572D2343541425E4C504C696E6B4D65746164617461A243385E4C504C696E6B4D65746164617461D2343545465C4E5344696374696F6E617279A2453800080011001A00240029003200370049004C0051005300610067006E007600810088008A008C008E0090009200A500BC00C400D000D900E600F800FE0115011D0131013501370139013B013C013D013F01410142014401460148014F015701630165016701690190019501A001A901AF01B201BB01C201C401C601C801E60269027B0280028F029202A102A602B300000000000002010000000000000047000000000000000000000000000002B6";
// A preview's pictures: the page's (big) and the site's icon (small), as Messages keeps them.
const pic = (file, size) => ({
  name: `${file}.pluginPayloadAttachment`,
  get path() {
    return `${appHome()}/${A}/img/${file}`;
  },
  mime: "",
  size,
});

m(3, 2900, "ben", "Did you end up trying that ramen place on 5th?");
m(3, 2890, "me", "Yes! Get the spicy miso. Worth the wait.");
m(3, 2885, "me", "Menu's here if you want to look first: https://ramen.example.com/menu");
m(3, 2880, "ben", "Noted 🍜", { blob: true });
m(4, 1500, "mom", "Are you still coming for dinner Sunday?");
m(4, 1495, "dad", "I'm making the lasagna", { blob: true });
const dessert = m(4, 1490, "me", "Wouldn't miss it. I'll bring dessert.");
m(4, 1480, "mom", "Perfect ❤️");
const photo = m(6, 700, "priya", "Here's the photo from the trailhead", { files: [{ name: "IMG_2041.HEIC", path: "~/Library/Messages/Attachments/demo/IMG_2041.HEIC", mime: "image/heic" }] });
m(6, 690, "me", "That view! Send me the full-size one?");
m(6, 680, "priya", "Will do tonight.");
m(2, 240, "ben", "Saturday still on? Forecast says clear skies.");
m(2, 235, "priya", "I'm in. Can someone bring the extra headlamp?");
const headlamps = m(2, 230, "me", "I've got two, I'll bring both.");
const forecast = m(2, 60, "maya", "https://weather.example.com/mount-si", { payload: FORECAST, files: [pic("herdr.png", 17033), pic("aurora.jpg", 206782)] });
m(2, 50, "maya", "Trailhead at 7:30? Parking fills up fast after 8.", { read: false, blob: true });
const coffee = m(2, 45, "ben", "7:30 works. I'll pick up coffee on the way ☕️", { read: false });
m(2, 40, "priya", "Meet you there. Bringing snacks for the summit, and the good trail mix, the one with the dark chocolate and dried cherries that everybody always eats first.", { read: false, blob: true });
m(5, 30, "+15555550199", "Your table for 2 is ready. Please check in with the host within 10 minutes.", { read: true });
m(1, 25, "maya", "Hey! Are you around this afternoon?");
m(1, 22, "me", "Mostly, after 3. What's up?");
// A sent link as Messages may keep it: the words, then the preview a moment later.
const loop = m(1, 21, "me", "Thinking of this loop for Saturday: https://trails.example.com/seven-lakes");
m(1, 20.97, "me", "https://trails.example.com/seven-lakes", { payload: TRAIL });
m(1, 8, "maya", "Want to grab coffee and go over the plan for Saturday?", { read: false });
m(1, 6, "maya", "I can come to you 😊", { read: false, blob: true });
m(7, 3, "priya", "On the train with no data, so this is a text. Photos tonight!");
tb(headlamps, "ben", 2003);
tb(headlamps, "maya", 2000);
tb(headlamps, "priya", 2001);
tb(headlamps, "priya", 3001); // taken off again,
tb(headlamps, "priya", 2006, "🔥"); // and an emoji instead
tb(coffee, "me", 2001);
tb(coffee, "maya", 2001);
tb(dessert, "mom", 2000);
tb(dessert, "dad", 2000);
tb(photo, "me", 2000);
tb(forecast, "priya", 2004, null, true);
tb(loop, "maya", 2000); // on the words' row, which shows as one with its preview

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
const filesOf = (x) => x.files.map((f) => `${f.name}\t${f.path}\t${f.mime}\t${f.size ?? 0}`).join("\n");
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
    const theirs = mine.filter((x) => !x.mine);
    const their = theirs.length ? `${theirs[theirs.length - 1].id}\t${c.service}` : null;
    const im = c.service === "iMessage" && theirs.length ? theirs[theirs.length - 1].t : null;
    out.push({ id: c.id, guid: c.guid, ident: c.ident, service: c.service, title: c.title, style: c.style, members: membersOf(c), last: last.id, t: last.t, ...textOf(last), mine: last.mine ? 1 : 0, att: last.files.length ? 1 : 0, replied, their, im, unread });
  }
  return out.sort((a, b) => b.last - a.last);
}

/** A conversation's messages (from each of its chats), newest first. */
export function demoThread(ids) {
  const chats = new Set([].concat(ids).map(Number));
  return MSGS.filter((x) => chats.has(x.chat))
    .map((x) => ({ id: x.id, guid: guidOf(x.id), t: x.t, ...textOf(x), mine: x.mine ? 1 : 0, who: x.who, error: x.error, service: CHATS.find((c) => c.id === x.chat)?.service ?? "", files: filesOf(x), payload: x.payload }))
    .reverse();
}

/** A conversation's tapbacks after a ROWID, oldest first, as SQL.reacts has them (the target is the bare guid). */
export function demoReacts(ids, rowid) {
  const chats = new Set([].concat(ids).map(Number));
  return REACTS.filter((x) => chats.has(x.chat) && x.id > rowid).map((x) => ({ id: x.id, target: bare(x.target), kind: x.kind, mine: x.mine ? 1 : 0, who: x.who, emoji: x.emoji }));
}

const bare = (target) => target.replace(/^(p:\d+\/|bp:)/, "");

export function demoSince(rowid) {
  const msgs = MSGS.filter((x) => x.id > rowid).map((x) => ({ id: x.id, chat: x.chat, t: x.t, ...textOf(x), mine: x.mine ? 1 : 0, who: x.who, att: x.files.length ? 1 : 0, kind: 0 }));
  const reacts = REACTS.filter((x) => x.id > rowid).map((x) => {
    const on = MSGS.find((y) => guidOf(y.id) === bare(x.target));
    const t = on ? textOf(on) : { text: null, body: null };
    return { id: x.id, chat: x.chat, t: x.t, text: null, body: null, mine: x.mine ? 1 : 0, who: x.who, att: 0, kind: x.kind, emoji: x.emoji, tmine: on?.mine ? 1 : 0, ttext: t.text, tbody: t.body };
  });
  return msgs.concat(reacts).sort((a, b) => a.id - b.id);
}

const top = () => Math.max(MSGS.reduce((a, x) => Math.max(a, x.id), 0), REACTS.reduce((a, x) => Math.max(a, x.id), 0));

export function demoSend(chat, text) {
  MSGS.push({ id: top() + 1, chat: Number(chat), t: Date.now(), mine: true, who: "", text, blob: false, read: true, files: [], error: 0, payload: null });
}

// [chat, from, text], or a tapback (text null, its type) on my newest message there.
const ARRIVALS = [
  [3, "ben", "Also, are we still splitting the campsite for next month?"],
  [1, "maya", null, 2003],
  [2, "priya", "Forecast just changed, bring a rain jacket just in case 🌧️"],
  [1, "maya", "Running 5 minutes late!"],
  [4, "mom", "Don't forget to call your grandmother"],
];

/** A new message or tapback arrives (the command snowleopard.imessagedemo), from the next person in line. */
export function demoIncoming() {
  const [chat, from, text, kind] = ARRIVALS[(G.arrived = (G.arrived ?? -1) + 1) % ARRIVALS.length];
  if (kind) {
    const on = MSGS.filter((x) => x.chat === chat && x.mine).pop();
    if (on) REACTS.push({ id: top() + 1, chat, t: Date.now(), mine: false, who: H(from), kind, emoji: null, target: `p:0/${guidOf(on.id)}` });
    return;
  }
  MSGS.push({ id: top() + 1, chat, t: Date.now(), mine: false, who: H(from), text, blob: true, read: false, files: [], error: 0, payload: null });
}
