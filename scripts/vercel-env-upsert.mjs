// Upsert environment variables on the linked Vercel project (.vercel/project.json) through the
// REST API, authenticated with the local Vercel CLI login. Values are read from .env.local via
// `fromEnvLocal` so no secret appears on the command line or in the output.
// Usage: APPLY=1 node scripts/vercel-env-upsert.mjs '<json>'   (omit APPLY=1 for a dry run)
//   json = [{ key, value? , fromEnvLocal?, targets: ["production","preview"], sensitive?: boolean }]
//   `fromEnvLocal` reads the value from .env.local (never printed). Dry run unless APPLY=1.
import fs from "node:fs";
import os from "node:os";
const auth = JSON.parse(fs.readFileSync(`${os.homedir()}/Library/Application Support/com.vercel.cli/auth.json`, "utf8"));
const { projectId, orgId } = JSON.parse(fs.readFileSync(".vercel/project.json", "utf8"));
const local = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_0-9]+=/.test(l)).map((l) => {
    const i = l.indexOf("=");
    let v = l.slice(i + 1).trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    return [l.slice(0, i), v];
  }),
);
const h = { Authorization: `Bearer ${auth.token}`, "content-type": "application/json" };
const api = (path, init = {}) =>
  fetch(`https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${orgId}`, { ...init, headers: h });
const wanted = JSON.parse(process.argv[2]);
const existing = (await (await api(`/v9/projects/${projectId}/env`)).json()).envs ?? [];
for (const item of wanted) {
  const value = item.fromEnvLocal ? local[item.fromEnvLocal] : item.value;
  if (!value) {
    console.log(`SKIP ${item.key}: no value${item.fromEnvLocal ? ` (${item.fromEnvLocal} missing in .env.local)` : ""}`);
    continue;
  }
  for (const target of item.targets) {
    const current = existing.find((e) => e.key === item.key && (e.target ?? []).includes(target) && !e.gitBranch);
    const shared = current && (current.target ?? []).length > 1;
    const action = current ? (shared ? `update shared[${current.target.join(",")}]` : "update") : "create";
    console.log(`${process.env.APPLY ? "APPLY" : "DRY"} ${action} ${item.key} [${target}] (${value.length} chars)${current ? ` id=${current.id} type=${current.type}` : ""}`);
    if (!process.env.APPLY) continue;
    let res;
    if (current) {
      res = await api(`/v9/projects/${projectId}/env/${current.id}`, { method: "PATCH", body: JSON.stringify({ value }) });
    } else {
      res = await api(`/v10/projects/${projectId}/env?upsert=true`, {
        method: "POST",
        body: JSON.stringify({ key: item.key, value, target: [target], type: item.sensitive ? "sensitive" : "encrypted" }),
      });
    }
    const body = await res.json().catch(() => ({}));
    console.log(`   -> ${res.status}${body.error ? " " + JSON.stringify(body.error).slice(0, 160) : ""}`);
  }
}
