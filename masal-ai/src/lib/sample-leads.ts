import type { LeadInput } from "@/lib/ai/schemas";

/*
 * Six FICTIONAL leads (rule R9) chosen to show different shapes of lead, set in Delhi NCR with
 * budgets written the way customers really write them. Contacts use example.com / fake numbers.
 *  a. hot + urgent: competing offer, loan pre-approved, wants a visit this week
 *  b. warm: comparing two areas, budget a little low for what they want
 *  c. cold: "just browsing", vague
 *  d. price-sensitive with an explicit objection
 *  e. written in Hinglish (Hindi + English)
 *  f. almost empty message (tests graceful handling)
 */
export type SampleLead = Omit<LeadInput, "contact"> & { contact?: string };

export const SAMPLE_LEADS: SampleLead[] = [
  {
    name: "Riya Sharma",
    location: "Sector 62, Noida",
    property_requirement: "3BHK apartment, high floor, near Sector 62 metro, 2 car parking",
    budget: "1.4-1.5 Cr, home loan pre-approved",
    timeline: "immediately",
    message:
      "Hi, we liked the 3BHK listing near Sector 62 metro. Our home loan with HDFC is already pre-approved. We also have an offer on another flat that we must accept or decline by Friday, so we need to decide fast. Can we visit this Saturday morning? Please confirm the possession date and whether 2 covered parking slots are included.",
    contact: "riya.sharma@example.com",
  },
  {
    name: "Arjun Mehta",
    location: "Gurugram Sector 65 or Noida Sector 75",
    property_requirement: "3BHK in a gated society with clubhouse, good schools nearby",
    budget: "around 1.6 Cr",
    timeline: "1_3_months",
    message:
      "We are a family of four moving from Bangalore. Comparing Golf Course Extension Road with Noida Sector 75. My office is in Cyber City but my wife works in Noida, so location is still open. Need a gated society with a clubhouse and a good school within 3 km. Can you share options in both areas and how prices compare?",
    contact: "+91 90000 00002",
  },
  {
    name: "Vikram Rao",
    location: "Noida",
    property_requirement: "Something for investment",
    budget: "not decided",
    timeline: "just_exploring",
    message: "Just browsing for now. Send me whatever you have.",
    contact: "vikram.rao@example.com",
  },
  {
    name: "Neha Kapoor",
    location: "Greater Noida West",
    property_requirement: "2BHK, ready to move",
    budget: "60-70L",
    timeline: "3_6_months",
    message:
      "I saw a 2BHK in Greater Noida West listed at 78 lakh, which is too expensive for what it is. Prices in nearby societies are lower. Is there any room for negotiation or a festive discount? Also, what are the monthly maintenance charges? I have heard builders here delay possession, so I only want ready-to-move.",
    contact: "+91 90000 00004",
  },
  {
    name: "Sana Qureshi",
    location: "Sector 137, Noida",
    property_requirement: "2BHK for parents, ground or first floor, lift required",
    budget: "80-95 lakh",
    timeline: "within_1_month",
    message:
      "Hi, mujhe apne parents ke liye 2BHK chahiye, ground ya first floor, lift zaroori hai. Budget 90 lakh tak hai. Metro ke paas ho toh better. Kya is weekend site visit ho sakti hai? Possession jaldi chahiye kyunki unka current lease next month khatam ho raha hai.",
    contact: "sana.qureshi@example.com",
  },
  {
    name: "Rahul",
    location: "Sector 150, Noida",
    property_requirement: "flat",
    budget: "-",
    timeline: "just_exploring",
    message: "price?",
  },
];
