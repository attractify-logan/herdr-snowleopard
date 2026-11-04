// A made-up Slack workspace for screenshots and tests: slackwatch.js answers
// Slack's Web API from here while ~/.config/herdr-app/slack-demo exists, and
// then never calls Slack. Sent messages and read marks stick until the mod reloads.

// Kept across the mod's copies, so changes stick everywhere.
const G = (globalThis.__snowleopardSlackDemo ??= {});
const T0 = (G.t0 ??= Math.floor(Date.now() / 1000));
const ago = (min) => T0 - min * 60;

const ME = "U0ME";
const USERS = [
  { id: ME, name: "alex", real_name: "Alex Rivera" },
  { id: "U0MAYA", name: "maya", real_name: "Maya Torres" },
  { id: "U0BEN", name: "ben", real_name: "Ben Okafor" },
  { id: "U0PRIYA", name: "priya", real_name: "Priya Shah" },
  { id: "U0SAM", name: "sam", real_name: "Sam Ortiz" },
  { id: "U0GH", name: "github", real_name: "GitHub", is_bot: true },
  { id: "U0LIN", name: "linear", real_name: "Linear", is_bot: true },
  { id: "USLACKBOT", name: "slackbot", real_name: "Slackbot" },
];

const CONVS = [
  { id: "C1", name: "general" },
  { id: "C2", name: "design" },
  { id: "C3", name: "launch-plan" },
  { id: "C4", name: "random" },
  { id: "G1", name: "leadership", is_private: true },
  { id: "D1", is_im: true, user: "U0MAYA" },
  { id: "D2", is_im: true, user: "U0BEN" },
  { id: "D3", is_im: true, user: "U0PRIYA" },
  { id: "D4", is_im: true, user: "U0SAM" },
  { id: "D5", is_im: true, user: ME },
  { id: "D6", is_im: true, user: "U0GH" },
  { id: "D7", is_im: true, user: "U0LIN" },
  { id: "D8", is_im: true, user: "USLACKBOT" },
  { id: "M1", is_mpim: true, name: "mpdm-alex--maya--ben-1" },
];

// [conversation, minutes ago, from, text, read]
const SEED = [
  ["C1", 3000, "U0SAM", "Welcome to the new workspace, everyone :wave:"],
  ["C1", 600, "U0MAYA", "Office is closed Friday for the move. Pack your desks by Thursday!"],
  ["C2", 900, "U0PRIYA", "New icon set is up in the shared drive. Feedback welcome."],
  ["C2", 880, ME, "These look great. The calendar one could use a bit more contrast."],
  ["C3", 300, "U0BEN", "Launch checklist is at 80%. Waiting on the pricing page."],
  ["C3", 40, "U0MAYA", "Pricing page copy is in review, should be done by 3.", false],
  ["C4", 200, "U0SAM", "Who's in for lunch at the taco place? :taco:"],
  ["G1", 1400, "U0SAM", "Q3 planning notes are in the doc."],
  ["D1", 120, ME, "Can you send me the latest mockups?"],
  ["D1", 12, "U0MAYA", "Sent! Let me know what you think.", false],
  ["D1", 10, "U0MAYA", "Also, are we still on for 2pm?", false],
  ["D2", 2000, "U0BEN", "Thanks for the review yesterday."],
  ["D3", 400, "U0PRIYA", "I pushed the fix for the login bug."],
  ["D3", 395, ME, "Nice, merging it now."],
  ["D4", 9000, "U0SAM", "Welcome aboard!"],
  ["D5", 700, ME, "Reminder: renew the domain before the 15th."],
  ["D6", 90, "U0GH", "Pull request #142 was merged into main."],
  ["D7", 60, "U0LIN", "You were assigned WEB-88: Pricing page layout."],
  ["D8", 30, "USLACKBOT", "Reminder: send the weekly update.", false],
  ["M1", 250, "U0BEN", "Dinner Thursday?"],
  ["M1", 240, "U0MAYA", "I'm in!"],
];

if (!G.msgs) {
  G.msgs = new Map(CONVS.map((c) => [c.id, []]));
  G.read = {};
  let n = 0;
  for (const [conv, min, user, text, read] of SEED) {
    // Distinct times, even for the same minute.
    const ts = `${ago(min)}.${String((n += 1)).padStart(6, "0")}`;
    G.msgs.get(conv).push({ type: "message", user, text, ts });
    if (read !== false) G.read[conv] = ts;
  }
}

const ok = (o) => ({ ok: true, ...o });

/** Answers a Slack Web API call ({ ok, … }), as Slack would for these conversations. */
export async function demoApi(method, p = {}) {
  const list = (id) => {
    const m = G.msgs.get(id);
    if (!m) throw new Error("channel_not_found");
    return m;
  };
  switch (method) {
    case "auth.test":
      return ok({ user_id: ME, user: "alex", team: "Northwind Studio", team_id: "T0DEMO" });
    case "users.list":
      return ok({ members: USERS.map((u) => ({ ...u, profile: { display_name: "" } })) });
    case "users.conversations":
      return ok({ channels: CONVS });
    case "conversations.info": {
      const m = list(p.channel);
      return ok({ channel: { id: p.channel, last_read: G.read[p.channel] ?? "0", latest: m[m.length - 1] ?? null } });
    }
    case "conversations.history": {
      const oldest = Number(p.oldest ?? 0);
      return ok({ messages: list(p.channel).filter((m) => Number(m.ts) > oldest).reverse().slice(0, Number(p.limit ?? 60)) });
    }
    case "conversations.replies":
      return ok({ messages: list(p.channel).filter((m) => m.ts === p.ts) });
    case "conversations.mark":
      G.read[p.channel] = p.ts;
      return ok({});
    case "chat.postMessage": {
      const m = { type: "message", user: ME, text: p.text, ts: `${Math.floor(Date.now() / 1000)}.000001` };
      list(p.channel).push(m);
      G.read[p.channel] = m.ts;
      return ok({ ts: m.ts });
    }
    default:
      throw new Error("unknown_method");
  }
}
