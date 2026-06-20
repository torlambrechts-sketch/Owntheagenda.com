// Question database — a curated, reusable library of team-assessment items the
// instrument builder can draw from instead of authoring every question from a
// blank page. This is the OwnTheAgenda answer to "a library of validated pulse
// questions" (Gallup ships ~400): pick a topic, drop proven items in, edit to
// taste. Items are our own wording of well-established constructs so they read
// in one voice and carry no third-party text.
//
// Each item suggests the dimension it belongs to; the builder creates that
// dimension on insert if it doesn't exist yet. `reverse` marks an item whose
// high answer should count as *low* on its dimension (a couple per dimension
// blunts yes-to-everything bias).

export type BankItem = {
  id: string; // stable, unique
  text: string;
  topic: string; // browse group
  dimension: string; // suggested dimension label
  reverse?: boolean;
  source: string; // the construct/framework it draws on (attribution, not copied wording)
};

export const ITEM_BANK: BankItem[] = [
  // — Psychological safety —
  { id: "ps_1", text: "It's easy to raise problems and tough issues in this team.", topic: "Psychological safety", dimension: "Psychological safety", source: "Edmondson (1999)" },
  { id: "ps_2", text: "It's safe to take a risk or try something new in this team.", topic: "Psychological safety", dimension: "Psychological safety", source: "Edmondson (1999)" },
  { id: "ps_3", text: "Members of this team are able to bring up problems without it being held against them.", topic: "Psychological safety", dimension: "Psychological safety", source: "Edmondson (1999)" },
  { id: "ps_4", text: "People on this team sometimes hold back what they really think.", topic: "Psychological safety", dimension: "Psychological safety", reverse: true, source: "Edmondson (1999)" },
  { id: "ps_5", text: "When I admit a mistake here, it's treated as a chance to learn.", topic: "Psychological safety", dimension: "Psychological safety", source: "Edmondson (1999)" },

  // — Trust —
  { id: "tr_1", text: "I can rely on my teammates to follow through on what they say.", topic: "Trust", dimension: "Trust", source: "Lencioni; Mayer et al." },
  { id: "tr_2", text: "People on this team assume good intent in one another.", topic: "Trust", dimension: "Trust", source: "Mayer et al. (1995)" },
  { id: "tr_3", text: "I'm comfortable being vulnerable with this team about what I don't know.", topic: "Trust", dimension: "Trust", source: "Lencioni (2002)" },
  { id: "tr_4", text: "I often double-check my teammates' work because I'm not sure it's reliable.", topic: "Trust", dimension: "Trust", reverse: true, source: "Mayer et al. (1995)" },

  // — Healthy conflict / debate —
  { id: "cf_1", text: "We surface disagreements openly rather than letting them simmer.", topic: "Healthy conflict", dimension: "Conflict norms", source: "Lencioni (2002)" },
  { id: "cf_2", text: "We debate ideas hard without it becoming personal.", topic: "Healthy conflict", dimension: "Conflict norms", source: "Lencioni (2002)" },
  { id: "cf_3", text: "Tough topics tend to get avoided in our meetings.", topic: "Healthy conflict", dimension: "Conflict norms", reverse: true, source: "Lencioni (2002)" },
  { id: "cf_4", text: "When we disagree, we look for the strongest version of the other view.", topic: "Healthy conflict", dimension: "Conflict norms", source: "De Dreu & Weingart (2003)" },

  // — Role clarity —
  { id: "rc_1", text: "I'm clear on what I'm accountable for on this team.", topic: "Role clarity", dimension: "Role clarity", source: "Rizzo et al. (1970)" },
  { id: "rc_2", text: "We understand who owns what across the team.", topic: "Role clarity", dimension: "Role clarity", source: "Rizzo et al. (1970)" },
  { id: "rc_3", text: "There's confusion about where one person's responsibilities end and another's begin.", topic: "Role clarity", dimension: "Role clarity", reverse: true, source: "Rizzo et al. (1970)" },
  { id: "rc_4", text: "I know how my work connects to the team's goals.", topic: "Role clarity", dimension: "Role clarity", source: "Rizzo et al. (1970)" },

  // — Decision-making —
  { id: "dm_1", text: "It's clear how decisions get made on this team.", topic: "Decision-making", dimension: "Decision rights", source: "Bang & Midelfart" },
  { id: "dm_2", text: "We know who has the final say on each kind of decision.", topic: "Decision-making", dimension: "Decision rights", source: "DACI / RAPID" },
  { id: "dm_3", text: "Once we decide, we commit — even those who disagreed.", topic: "Decision-making", dimension: "Decision rights", source: "Lencioni (2002)" },
  { id: "dm_4", text: "Decisions get revisited again and again without really being settled.", topic: "Decision-making", dimension: "Decision rights", reverse: true, source: "Bang & Midelfart" },

  // — Accountability —
  { id: "ac_1", text: "We hold each other to the commitments we make.", topic: "Accountability", dimension: "Accountability", source: "Lencioni (2002)" },
  { id: "ac_2", text: "When standards slip, someone on the team speaks up.", topic: "Accountability", dimension: "Accountability", source: "Lencioni (2002)" },
  { id: "ac_3", text: "People here follow through on what they commit to.", topic: "Accountability", dimension: "Accountability", source: "Bang & Midelfart" },
  { id: "ac_4", text: "Missed commitments usually pass without comment.", topic: "Accountability", dimension: "Accountability", reverse: true, source: "Lencioni (2002)" },

  // — Direction & alignment —
  { id: "al_1", text: "We're aligned on what matters most right now.", topic: "Direction & alignment", dimension: "Alignment", source: "Bang & Midelfart" },
  { id: "al_2", text: "I understand the team's priorities for this quarter.", topic: "Direction & alignment", dimension: "Alignment", source: "Gallup Q12-style" },
  { id: "al_3", text: "Our goals are clear and shared across the team.", topic: "Direction & alignment", dimension: "Alignment", source: "Locke & Latham" },
  { id: "al_4", text: "Different people would describe our top priority differently.", topic: "Direction & alignment", dimension: "Alignment", reverse: true, source: "Bang & Midelfart" },

  // — Communication —
  { id: "co_1", text: "We share the information each of us needs to do our work.", topic: "Communication", dimension: "Communication", source: "Bang & Midelfart" },
  { id: "co_2", text: "Important news reaches the people it affects in good time.", topic: "Communication", dimension: "Communication", source: "Gallup Q12-style" },
  { id: "co_3", text: "I often find out about things that affect my work too late.", topic: "Communication", dimension: "Communication", reverse: true, source: "Bang & Midelfart" },

  // — Collaboration —
  { id: "cl_1", text: "We help each other solve problems.", topic: "Collaboration", dimension: "Collaboration", source: "Bang & Midelfart" },
  { id: "cl_2", text: "We share resources rather than guarding our own turf.", topic: "Collaboration", dimension: "Collaboration", source: "Bang & Midelfart" },
  { id: "cl_3", text: "Work tends to happen in silos here.", topic: "Collaboration", dimension: "Collaboration", reverse: true, source: "Bang & Midelfart" },

  // — Team learning —
  { id: "le_1", text: "We regularly ask for feedback on how we're doing.", topic: "Team learning", dimension: "Team learning", source: "Edmondson (1999)" },
  { id: "le_2", text: "We openly discuss mistakes so we can learn from them.", topic: "Team learning", dimension: "Team learning", source: "Edmondson (1999)" },
  { id: "le_3", text: "We take time to reflect on how we work, not just what we deliver.", topic: "Team learning", dimension: "Team learning", source: "Edmondson (1999)" },
  { id: "le_4", text: "We try new ways of working and experiment.", topic: "Team learning", dimension: "Team learning", source: "Edmondson (1999)" },

  // — Belonging & inclusion —
  { id: "bl_1", text: "I feel like I belong on this team.", topic: "Belonging & inclusion", dimension: "Belonging", source: "Google Aristotle; Walton & Cohen" },
  { id: "bl_2", text: "My perspective is genuinely valued here.", topic: "Belonging & inclusion", dimension: "Belonging", source: "SCARF (status/relatedness)" },
  { id: "bl_3", text: "Everyone gets a fair share of airtime in our discussions.", topic: "Belonging & inclusion", dimension: "Belonging", source: "Google Aristotle (equal voice)" },
  { id: "bl_4", text: "I sometimes feel like an outsider on this team.", topic: "Belonging & inclusion", dimension: "Belonging", reverse: true, source: "Walton & Cohen" },

  // — Recognition —
  { id: "re_1", text: "Good work gets noticed on this team.", topic: "Recognition", dimension: "Recognition", source: "Gallup Q12-style" },
  { id: "re_2", text: "In the last week, I've received recognition for doing good work.", topic: "Recognition", dimension: "Recognition", source: "Gallup Q12-style" },
  { id: "re_3", text: "People here say thank you when it's earned.", topic: "Recognition", dimension: "Recognition", source: "Gallup Q12-style" },

  // — Workload & wellbeing —
  { id: "wb_1", text: "My workload is sustainable.", topic: "Workload & wellbeing", dimension: "Wellbeing", source: "Maslach Burnout Inventory" },
  { id: "wb_2", text: "I have enough time to do my work to a standard I'm proud of.", topic: "Workload & wellbeing", dimension: "Wellbeing", source: "Maslach Burnout Inventory" },
  { id: "wb_3", text: "I feel emotionally drained by my work.", topic: "Workload & wellbeing", dimension: "Wellbeing", reverse: true, source: "Maslach Burnout Inventory" },
  { id: "wb_4", text: "I can switch off from work when I need to.", topic: "Workload & wellbeing", dimension: "Wellbeing", source: "Maslach Burnout Inventory" },

  // — Manager effectiveness —
  { id: "mg_1", text: "My manager gives me clear, useful feedback.", topic: "Manager effectiveness", dimension: "Manager effectiveness", source: "Google Oxygen" },
  { id: "mg_2", text: "My manager removes obstacles that get in my way.", topic: "Manager effectiveness", dimension: "Manager effectiveness", source: "Google Oxygen" },
  { id: "mg_3", text: "My manager genuinely cares about me as a person.", topic: "Manager effectiveness", dimension: "Manager effectiveness", source: "Gallup Q12-style" },
  { id: "mg_4", text: "My manager trusts me to do my job without micromanaging.", topic: "Manager effectiveness", dimension: "Manager effectiveness", source: "Google Oxygen" },

  // — Autonomy —
  { id: "au_1", text: "I have a say in how I do my work.", topic: "Autonomy", dimension: "Autonomy", source: "Self-Determination Theory" },
  { id: "au_2", text: "I'm trusted to make decisions in my area.", topic: "Autonomy", dimension: "Autonomy", source: "Self-Determination Theory" },
  { id: "au_3", text: "I have to get sign-off for things I should be able to decide myself.", topic: "Autonomy", dimension: "Autonomy", reverse: true, source: "Self-Determination Theory" },

  // — Change readiness —
  { id: "ch_1", text: "I understand why the changes we're making are happening.", topic: "Change readiness", dimension: "Change readiness", source: "Prosci ADKAR" },
  { id: "ch_2", text: "I feel equipped to handle the changes ahead.", topic: "Change readiness", dimension: "Change readiness", source: "Prosci ADKAR" },
  { id: "ch_3", text: "Change tends to land on us without enough context.", topic: "Change readiness", dimension: "Change readiness", reverse: true, source: "Prosci ADKAR" },
];

// Topics in their first-seen order, for the browse picker.
export const BANK_TOPICS: string[] = ITEM_BANK.reduce<string[]>((acc, it) => {
  if (!acc.includes(it.topic)) acc.push(it.topic);
  return acc;
}, []);

// Free-text + topic filter over the bank. Empty query + no topic returns all.
export function searchBank(query: string, topic?: string | null): BankItem[] {
  const q = query.trim().toLowerCase();
  return ITEM_BANK.filter((it) => {
    if (topic && it.topic !== topic) return false;
    if (!q) return true;
    return (
      it.text.toLowerCase().includes(q) ||
      it.dimension.toLowerCase().includes(q) ||
      it.topic.toLowerCase().includes(q) ||
      it.source.toLowerCase().includes(q)
    );
  });
}
