/**
 * GST state codes (CBIC list). Stored address states are messy ("KA",
 * "tamilnadu", "Tamil Nadu ", "test"), so matching uses lower-case letters
 * only, against the name plus common aliases and 2-letter codes.
 */
const GST_STATES: { code: string; name: string; aliases: string[] }[] = [
  { code: "01", name: "Jammu and Kashmir", aliases: ["jk"] },
  { code: "02", name: "Himachal Pradesh", aliases: ["hp"] },
  { code: "03", name: "Punjab", aliases: ["pb"] },
  { code: "04", name: "Chandigarh", aliases: ["ch"] },
  { code: "05", name: "Uttarakhand", aliases: ["uk", "ut", "uttaranchal"] },
  { code: "06", name: "Haryana", aliases: ["hr"] },
  { code: "07", name: "Delhi", aliases: ["dl", "newdelhi", "nctofdelhi"] },
  { code: "08", name: "Rajasthan", aliases: ["rj"] },
  { code: "09", name: "Uttar Pradesh", aliases: ["up"] },
  { code: "10", name: "Bihar", aliases: ["br"] },
  { code: "11", name: "Sikkim", aliases: ["sk"] },
  { code: "12", name: "Arunachal Pradesh", aliases: ["ar"] },
  { code: "13", name: "Nagaland", aliases: ["nl"] },
  { code: "14", name: "Manipur", aliases: ["mn"] },
  { code: "15", name: "Mizoram", aliases: ["mz"] },
  { code: "16", name: "Tripura", aliases: ["tr"] },
  { code: "17", name: "Meghalaya", aliases: ["ml"] },
  { code: "18", name: "Assam", aliases: ["as"] },
  { code: "19", name: "West Bengal", aliases: ["wb"] },
  { code: "20", name: "Jharkhand", aliases: ["jh"] },
  { code: "21", name: "Odisha", aliases: ["od", "or", "orissa"] },
  { code: "22", name: "Chhattisgarh", aliases: ["cg", "ct"] },
  { code: "23", name: "Madhya Pradesh", aliases: ["mp"] },
  { code: "24", name: "Gujarat", aliases: ["gj"] },
  {
    code: "26",
    name: "Dadra and Nagar Haveli and Daman and Diu",
    aliases: ["dn", "dd", "damananddiu", "dadraandnagarhaveli"],
  },
  { code: "27", name: "Maharashtra", aliases: ["mh"] },
  { code: "29", name: "Karnataka", aliases: ["ka"] },
  { code: "30", name: "Goa", aliases: ["ga"] },
  { code: "31", name: "Lakshadweep", aliases: ["ld"] },
  { code: "32", name: "Kerala", aliases: ["kl"] },
  { code: "33", name: "Tamil Nadu", aliases: ["tn"] },
  { code: "34", name: "Puducherry", aliases: ["py", "pondicherry"] },
  { code: "35", name: "Andaman and Nicobar Islands", aliases: ["an"] },
  { code: "36", name: "Telangana", aliases: ["ts", "tg"] },
  { code: "37", name: "Andhra Pradesh", aliases: ["ap"] },
  { code: "38", name: "Ladakh", aliases: ["la"] },
];

function normalise(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
}

const LOOKUP = new Map<string, string>();
for (const state of GST_STATES) {
  LOOKUP.set(normalise(state.name), state.code);
  for (const alias of state.aliases) LOOKUP.set(alias, state.code);
}

export function resolveGstStateCode(state: string | null | undefined): string | null {
  if (!state) return null;
  const key = normalise(state);
  return key ? LOOKUP.get(key) ?? null : null;
}

export function gstStateName(code: string): string | null {
  return GST_STATES.find((s) => s.code === code)?.name ?? null;
}
