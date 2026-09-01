/**
 * Trim Lab auth relay — the ONE step a browser cannot do itself.
 *
 * The browser runs the whole Claude-subscription OAuth flow (PKCE verifier,
 * authorize page, pasted code, direct api.anthropic.com calls afterwards);
 * platform.claude.com/v1/oauth/token rejects every browser origin, so this
 * relay forwards exactly that exchange and nothing else. Pattern proven in
 * gm2211/motive (server/src/claude-exchange.ts): stateless — nothing stored,
 * no token ever logged, the response body is the only place tokens exist here.
 *
 * Deploy (either, ~2 minutes, free tier):
 *   Cloudflare:  npx wrangler deploy relay/worker.js --name trim-lab-relay --compatibility-date 2026-01-01
 *   Deno Deploy: deployctl deploy --project trim-lab-relay relay/worker.js   (or point the dashboard at this file)
 * Then paste the deployed URL into the coach's settings panel.
 */
const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_REDIRECT = "https://platform.claude.com/oauth/code/callback";
const ALLOWED_ORIGINS = [
  "https://gm2211.github.io",
  "http://localhost:8472",
  "http://localhost:8471",
  "http://localhost:8080",
];

function cors(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Cache-Control": "no-store",
  };
}

async function postToken(body) {
  // Anthropic's endpoint has accepted JSON and form encodings at different
  // times; try JSON first, fall back to form (motive's dual-shape trick).
  let res = await fetch(CLAUDE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    res = await fetch(CLAUDE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  }
  if (res.status !== 200) return { error: res.status };
  return { tokens: await res.json() };
}

async function handle(req) {
  const origin = req.headers.get("origin") || "";
  const headers = { ...cors(origin), "content-type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers });

  const url = new URL(req.url);
  let body = {};
  try { body = await req.json(); } catch {}

  if (url.pathname.endsWith("/claude/exchange")) {
    const raw = String(body.code || "").trim();
    const verifier = String(body.verifier || "").trim();
    if (!raw || !verifier) return new Response(JSON.stringify({ error: "need code + verifier" }), { status: 400, headers });
    // the console displays the code as "code#state"
    const [code, pastedState] = raw.split("#");
    const out = await postToken({
      grant_type: "authorization_code",
      code,
      state: String(body.state || pastedState || ""),
      redirect_uri: String(body.redirectUri || CLAUDE_REDIRECT),
      client_id: CLAUDE_CLIENT_ID,
      code_verifier: verifier,
    });
    if (out.error) return new Response(JSON.stringify({ error: "exchange rejected (HTTP " + out.error + ")" }), { status: 502, headers });
    const t = out.tokens;
    return new Response(JSON.stringify({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in }), { headers });
  }

  if (url.pathname.endsWith("/claude/refresh")) {
    const refreshToken = String(body.refreshToken || "").trim();
    if (!refreshToken) return new Response(JSON.stringify({ error: "need refreshToken" }), { status: 400, headers });
    const out = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CLAUDE_CLIENT_ID });
    if (out.error) return new Response(JSON.stringify({ error: "refresh rejected (HTTP " + out.error + ")" }), { status: 502, headers });
    const t = out.tokens;
    return new Response(JSON.stringify({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresIn: t.expires_in }), { headers });
  }

  return new Response(JSON.stringify({ error: "unknown path" }), { status: 404, headers });
}

export default { fetch: handle };            // Cloudflare Workers
if (typeof Deno !== "undefined" && Deno.serve) Deno.serve(handle);  // Deno Deploy
