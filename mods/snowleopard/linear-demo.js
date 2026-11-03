// Made-up Linear data for screenshots: a small company's teams, projects,
// issues and inbox. linearapi.js answers from here, by each query's name,
// while ~/.config/herdr-app/linear-demo exists. Changes (status, priority,
// assignee, comments, read marks) stick until the mod reloads.

// Kept across the mod's copies (each window loads this afresh), so changes stick everywhere.
const G = (globalThis.__snowleopardLinearDemo ??= {});
const T0 = (G.t0 ??= Date.now());
const ago = (min) => new Date(T0 - min * 60000).toISOString();

const USERS = [
  { id: "u-riley", name: "Riley Park", displayName: "Riley" },
  { id: "u-avery", name: "Avery Chen", displayName: "Avery" },
  { id: "u-sam", name: "Sam Ortiz", displayName: "Sam" },
  { id: "u-jordan", name: "Jordan Lee", displayName: "Jordan" },
  { id: "u-morgan", name: "Morgan Diaz", displayName: "Morgan" },
];
const U = Object.fromEntries(USERS.map((u) => [u.id.slice(2), u]));

const states = (p) => [
  { id: `${p}-backlog`, name: "Backlog", type: "backlog", color: "#bec2c8", position: 0 },
  { id: `${p}-todo`, name: "Todo", type: "unstarted", color: "#9aa0a8", position: 1 },
  { id: `${p}-doing`, name: "In Progress", type: "started", color: "#f2c94c", position: 2 },
  { id: `${p}-review`, name: "In Review", type: "started", color: "#4cb782", position: 3 },
  { id: `${p}-done`, name: "Done", type: "completed", color: "#5e6ad2", position: 4 },
  { id: `${p}-canceled`, name: "Canceled", type: "canceled", color: "#95a2b3", position: 5 },
];
const TEAMS = [
  { id: "t-web", key: "WEB", name: "Web", states: { nodes: states("web") } },
  { id: "t-mob", key: "MOB", name: "Mobile", states: { nodes: states("mob") } },
];
const PROJECTS = [
  { id: "p-launch", name: "Spring Launch", progress: 0.62, targetDate: "2026-12-04", url: "https://linear.app", status: { name: "In Progress", type: "started" }, lead: U.avery },
  { id: "p-checkout", name: "Checkout Revamp", progress: 0.18, targetDate: "2027-01-22", url: "https://linear.app", status: { name: "Planned", type: "planned" }, lead: U.sam },
  { id: "p-offline", name: "Offline Mode", progress: 0.41, targetDate: null, url: "https://linear.app", status: { name: "In Progress", type: "started" }, lead: U.jordan },
];
const P = Object.fromEntries(PROJECTS.map((p) => [p.id.slice(2), p]));

let n = 0;
const ISSUES = (G.issues ??= []);
const fresh = !ISSUES.length;
function issue(team, num, title, o) {
  if (!fresh) return;
  const t = TEAMS.find((x) => x.key === team);
  const st = t.states.nodes.find((s) => s.id.endsWith(o.state));
  ISSUES.push({
    id: `i-${team}-${num}`,
    identifier: `${team}-${num}`,
    title,
    priority: o.pri ?? 0,
    updatedAt: ago(o.upd ?? (n += 37)),
    createdAt: ago((o.upd ?? n) + 2880),
    url: "https://linear.app",
    state: { id: st.id, name: st.name, type: st.type, color: st.color },
    assignee: o.who ? U[o.who] : null,
    team: { id: t.id, key: t.key },
    creator: U[o.by ?? "avery"],
    project: o.proj ? { id: P[o.proj].id, name: P[o.proj].name } : null,
    labels: { nodes: o.labels ?? [] },
    description: o.desc ?? "",
    comments: { nodes: (o.comments ?? []).map(([by, min, body], i) => ({ id: `c-${team}-${num}-${i}`, body, createdAt: ago(min), user: U[by], botActor: null, parent: null })) },
  });
}

const BUG = { name: "Bug", color: "#eb5757" };
const FEAT = { name: "Feature", color: "#bb87fc" };
const POLISH = { name: "Polish", color: "#4ea7fc" };

issue("WEB", 214, "Pricing page jumps when the plan toggle switches", {
  state: "doing", pri: 2, who: "riley", upd: 12, proj: "launch", labels: [BUG],
  desc: "Switching **Monthly / Yearly** on the pricing page shifts every card down by about 8 px, then back.\n\n### Steps\n1. Open /pricing on a laptop-sized window\n2. Click *Yearly*\n3. Watch the cards jump\n\nThe badge for the yearly discount is inserted above the price instead of beside it, so the card grows while it animates.",
  comments: [
    ["avery", 190, "Seeing it in Safari too. Probably the `discount` badge mounting late."],
    ["riley", 95, "Found it: the badge renders in a new row. Moving it beside the price fixes the jump, PR coming."],
    ["sam", 40, "Nice. Can we keep the badge on mobile, where it does need its own row?"],
  ],
});
issue("WEB", 219, "Add the team-size question to sign-up", { state: "todo", pri: 3, who: "riley", upd: 55, proj: "launch", labels: [FEAT], desc: "Ask *How many people will use it?* after the email step, with 1, 2–10, 11–50 and 50+.\n\nSales wants this on the account record from day one." });
issue("WEB", 221, "Launch checklist: legal copy on the landing page", { state: "review", pri: 2, who: "riley", upd: 130, proj: "launch", desc: "Terms and privacy links in the footer, and the trial wording approved by legal.", comments: [["morgan", 140, "Legal signed off on the trial wording this morning."]] });
issue("WEB", 198, "Receipts show the wrong time zone", { state: "todo", pri: 1, who: "sam", upd: 30, proj: "checkout", labels: [BUG], desc: "Receipts are stamped in UTC. They should use the account's time zone, as invoices do." });
issue("WEB", 203, "Saved cards: let people pick a default", { state: "backlog", pri: 4, who: "sam", upd: 400, proj: "checkout", labels: [FEAT] });
issue("WEB", 207, "Empty state for the reports page", { state: "todo", pri: 3, who: "avery", upd: 220, labels: [POLISH], desc: "A short line and a button to make the first report, instead of a blank table." });
issue("WEB", 211, "Speed up the dashboard's first load", { state: "doing", pri: 2, who: "jordan", upd: 75, proj: "launch", desc: "First load is 3.4 s on a cold cache. Target is under 2 s.\n\n- [x] Split the charts bundle\n- [ ] Cache the account summary\n- [ ] Lazy-load the activity feed" });
issue("WEB", 216, "Keyboard shortcut sheet", { state: "backlog", pri: 0, who: null, upd: 900, labels: [POLISH] });
issue("WEB", 222, "Coupon field accepts expired codes", { state: "review", pri: 2, who: "morgan", upd: 160, proj: "checkout", labels: [BUG] });
issue("MOB", 88, "Offline queue loses edits after a crash", { state: "doing", pri: 1, who: "riley", upd: 20, proj: "offline", labels: [BUG], desc: "Edits made offline are kept in memory until the app syncs. If the app crashes first they're gone.\n\nWrite the queue to disk on every change, and replay it at launch.", comments: [["jordan", 70, "We can reuse the draft store for this, it already survives restarts."], ["riley", 25, "Good call. Trying that now."]] });
issue("MOB", 91, "Sync badge on the tab bar", { state: "todo", pri: 3, who: "jordan", upd: 260, proj: "offline", labels: [FEAT] });
issue("MOB", 93, "Pull to refresh on the inbox", { state: "todo", pri: 4, who: "riley", upd: 610, labels: [POLISH] });
issue("MOB", 95, "Crash opening a photo from a notification", { state: "todo", pri: 2, who: "avery", upd: 110, labels: [BUG] });
issue("MOB", 97, "Dark mode for the settings screens", { state: "backlog", pri: 0, who: null, upd: 1500, labels: [POLISH] });
issue("MOB", 99, "Conflict screen when two people edit offline", { state: "backlog", pri: 3, who: "jordan", upd: 1200, proj: "offline", labels: [FEAT] });

const I = (id) => ISSUES.find((x) => x.id === id || x.identifier === id);

const NOTES = (G.notes ??= [
  { id: "n1", type: "issueNewComment", readAt: null, createdAt: ago(40), title: I("i-WEB-214").title, subtitle: "Sam commented: Nice. Can we keep the badge on mobile, where it does need its own row?", url: "https://linear.app", actor: U.sam, issue: "i-WEB-214" },
  { id: "n2", type: "issueAssignedToYou", readAt: null, createdAt: ago(58), title: I("i-WEB-219").title, subtitle: "Avery assigned the issue to you", url: "https://linear.app", actor: U.avery, issue: "i-WEB-219" },
  { id: "n3", type: "issueMention", readAt: null, createdAt: ago(72), title: I("i-MOB-88").title, subtitle: "Jordan mentioned you: We can reuse the draft store for this, it already survives restarts.", url: "https://linear.app", actor: U.jordan, issue: "i-MOB-88" },
  { id: "n4", type: "projectUpdateCreated", readAt: null, createdAt: ago(180), title: "Spring Launch", subtitle: "Avery posted an update: **On track.** Pricing and sign-up land this week; legal copy is in review.", url: "https://linear.app", actor: U.avery },
  { id: "n5", type: "issueStatusChanged", readAt: ago(100), createdAt: ago(150), title: I("i-WEB-221").title, subtitle: "Morgan moved the issue to In Review", url: "https://linear.app", actor: U.morgan, issue: "i-WEB-221" },
  { id: "n6", type: "issueDue", readAt: ago(300), createdAt: ago(720), title: I("i-WEB-198").title, subtitle: "Due tomorrow", url: "https://linear.app", actor: null, issue: "i-WEB-198" },
  { id: "n7", type: "issueNewComment", readAt: ago(1500), createdAt: ago(1700), title: I("i-WEB-211").title, subtitle: "Jordan commented: Charts bundle is split, first load is down to 2.6 s.", url: "https://linear.app", actor: U.jordan, issue: "i-WEB-211" },
]);

const open = (i) => !["completed", "canceled", "duplicate"].includes(i.state.type);
const ROWKEYS = ["id", "identifier", "title", "priority", "updatedAt", "url", "state", "assignee", "team"];
const row = (i) => Object.fromEntries(ROWKEYS.map((k) => [k, i[k]]));
const byUpdated = (a, b) => (a.updatedAt < b.updatedAt ? 1 : -1);
const copy = (x) => JSON.parse(JSON.stringify(x));
const unread = () => NOTES.filter((x) => !x.readAt).length;

export async function demoGql(query, v = {}) {
  const op = /^\s*(?:query|mutation)\s+(\w+)/.exec(query)?.[1];
  const list = (f) => ISSUES.filter((i) => open(i) && f(i)).sort(byUpdated).map(row);
  switch (op) {
    case "Me":
      return copy({ viewer: { id: U.riley.id, name: U.riley.name, displayName: U.riley.displayName, organization: { name: "Pinecrest", urlKey: "pinecrest" } }, teams: { nodes: TEAMS }, users: { nodes: USERS }, projects: { nodes: PROJECTS } });
    case "Mine":
      return copy({ notificationsUnreadCount: unread(), viewer: { assignedIssues: { nodes: list((i) => i.assignee?.id === U.riley.id) } } });
    case "Team":
      return copy({ notificationsUnreadCount: unread(), issues: { nodes: list((i) => i.team.id === v.id) } });
    case "Project":
      return copy({ notificationsUnreadCount: unread(), issues: { nodes: list((i) => i.project?.id === v.id) } });
    case "Inbox":
      return copy({ notificationsUnreadCount: unread(), notifications: { nodes: NOTES.map((x) => ({ ...x, issue: x.issue ? row(I(x.issue)) : undefined })) } });
    case "Unread":
      return { notificationsUnreadCount: unread() };
    case "Issue":
      return copy({ issue: I(v.id) ?? null });
    case "Update": {
      const i = I(v.id);
      if (!i) throw new Error("not found");
      const inp = v.input ?? {};
      if ("stateId" in inp) {
        const st = TEAMS.find((t) => t.id === i.team.id).states.nodes.find((s) => s.id === inp.stateId);
        if (st) i.state = { id: st.id, name: st.name, type: st.type, color: st.color };
      }
      if ("priority" in inp) i.priority = inp.priority;
      if ("assigneeId" in inp) i.assignee = USERS.find((u) => u.id === inp.assigneeId) ?? null;
      i.updatedAt = new Date().toISOString();
      return copy({ issueUpdate: { success: true, issue: row(i) } });
    }
    case "Comment": {
      const i = I(v.input?.issueId);
      if (!i) throw new Error("not found");
      i.comments.nodes.unshift({ id: `c-new-${Date.now()}`, body: v.input.body, createdAt: new Date().toISOString(), user: U.riley, botActor: null, parent: null });
      i.updatedAt = new Date().toISOString();
      return { commentCreate: { success: true } };
    }
    case "Read": {
      const x = NOTES.find((y) => y.id === v.id);
      if (x) x.readAt = v.at;
      return { notificationUpdate: { success: true } };
    }
    default:
      throw new Error(`demo: no ${op}`);
  }
}
