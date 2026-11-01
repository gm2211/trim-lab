// packages/core/src/storage.ts
function requireStoragePrefix(prefix) {
  if (typeof prefix !== "string" || !prefix.trim() || prefix !== prefix.trim() || prefix.length > 128) {
    throw new TypeError("Storage prefix must be a non-empty, trimmed string of at most 128 characters.");
  }
  return prefix;
}
function resolveStorage(storage) {
  if (storage) return storage;
  const scope = globalThis;
  let session;
  let local;
  try {
    session = scope.sessionStorage;
  } catch {
    session = void 0;
  }
  try {
    local = scope.localStorage;
  } catch {
    local = void 0;
  }
  return { session, local };
}
function safeGet(store, key) {
  try {
    return store ? store.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeSet(store, key, value) {
  try {
    store?.setItem(key, value);
  } catch {
  }
}
function safeRemove(store, key) {
  try {
    store?.removeItem(key);
  } catch {
  }
}

// packages/core/src/effort.ts
var VALID_EFFORTS = /* @__PURE__ */ new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra"
]);
function isReasoningEffort(value) {
  return typeof value === "string" && VALID_EFFORTS.has(value);
}
function supportedEfforts(model) {
  return Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts.map((option) => option.effort).filter(isReasoningEffort) : [];
}
function reasoningEffortOptions(model) {
  return Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts.filter((option) => isReasoningEffort(option.effort)) : [];
}
function createEffortStore(options) {
  const prefix = requireStoragePrefix(options.prefix);
  const key = (provider, model) => `${prefix}${provider}:${model}`;
  const storage = () => resolveStorage(options.storage);
  function read(provider, model) {
    const { local, session } = storage();
    const saved = safeGet(local, key(provider, model.id)) || safeGet(session, key(provider, model.id));
    return isReasoningEffort(saved) && supportedEfforts(model).includes(saved) ? saved : void 0;
  }
  function store(provider, model, effort) {
    const { local, session } = storage();
    safeSet(local, key(provider, model), effort);
    safeSet(session, key(provider, model), effort);
  }
  function clear(provider, model) {
    const { local, session } = storage();
    safeRemove(local, key(provider, model));
    safeRemove(session, key(provider, model));
  }
  function resolve(provider, model) {
    const supported = supportedEfforts(model);
    const saved = read(provider, model);
    if (saved) return saved;
    const recommendation = options.recommend?.(provider, model.id);
    if (recommendation && supported.includes(recommendation)) return recommendation;
    if (model.defaultReasoningEffort && supported.includes(model.defaultReasoningEffort)) return model.defaultReasoningEffort;
    return "";
  }
  return { key, read, store, clear, resolve };
}

// packages/core/src/model-catalog.ts
var MAX_CACHED_MODELS = 120;
function isUsableModelId(id) {
  return typeof id === "string" && id.trim().length > 0 && id.length <= 128 && !/\s/.test(id);
}
function parseModelCatalog(raw) {
  if (!raw) return void 0;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return void 0;
  }
  if (!Array.isArray(parsed)) return void 0;
  const models = parsed.filter((entry) => Boolean(entry) && typeof entry === "object" && isUsableModelId(entry.id)).map((entry) => {
    const row = entry;
    const model = { id: row.id, name: typeof row.name === "string" && row.name ? row.name : row.id };
    if (row.hidden === true) model.hidden = true;
    if (Array.isArray(row.reasoningEfforts)) model.reasoningEfforts = row.reasoningEfforts.filter((value) => Boolean(value) && isReasoningEffort(value.effort)).map((value) => ({ effort: value.effort, ...typeof value.description === "string" ? { description: value.description } : {} }));
    if (isReasoningEffort(row.defaultReasoningEffort)) model.defaultReasoningEffort = row.defaultReasoningEffort;
    return model;
  });
  return models.length ? models : void 0;
}
function createModelCatalogCache(options) {
  const prefix = requireStoragePrefix(options.prefix);
  const key = (provider) => `${prefix}${provider}`;
  return {
    read(provider) {
      return parseModelCatalog(safeGet(resolveStorage(options.storage).local, key(provider)));
    },
    store(provider, models) {
      if (!models.length) return;
      safeSet(resolveStorage(options.storage).local, key(provider), JSON.stringify(models.slice(0, MAX_CACHED_MODELS)));
    }
  };
}
function pickerModels(models, selection, live) {
  if (live || !isUsableModelId(selection) || models.some((model) => model.id === selection)) return models;
  return [...models, { id: selection, name: selection }];
}

// packages/core/src/credential-vault.ts
function restore(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
  }
}
function createCredentialVault(options) {
  const prefix = requireStoragePrefix(options.prefix);
  const tokenKey = (provider) => `${prefix}${provider}`;
  const refreshKey = (provider) => `${tokenKey(provider)}:refresh`;
  const areas = () => resolveStorage(options.storage);
  function targetStorage(where) {
    const area = where === "browser" ? areas().local : areas().session;
    if (!area) throw new Error("Browser storage is unavailable, so this sign-in cannot be kept.");
    return area;
  }
  function snapshot(area, tokenKey2, grantKey) {
    if (!area) return void 0;
    try {
      return { area, tokenKey: tokenKey2, grantKey, token: area.getItem(tokenKey2), grant: area.getItem(grantKey) };
    } catch {
      return void 0;
    }
  }
  function rollback(snapshots) {
    for (const prior of snapshots) if (prior) {
      restore(prior.area, prior.tokenKey, prior.token);
      restore(prior.area, prior.grantKey, prior.grant);
    }
  }
  function read(provider) {
    const { session, local } = areas();
    return safeGet(session, tokenKey(provider)) ?? safeGet(local, tokenKey(provider)) ?? "";
  }
  function persistence(provider) {
    const { session, local } = areas();
    return safeGet(session, tokenKey(provider)) ? "session" : safeGet(local, tokenKey(provider)) ? "browser" : "session";
  }
  function store(provider, value, where) {
    const token = value.trim();
    const { session, local } = areas();
    const key = tokenKey(provider);
    const grantKey = refreshKey(provider);
    const target = targetStorage(where);
    const prior = snapshot(target, key, grantKey);
    if (!prior) throw new Error("Browser storage is unavailable, so this sign-in cannot be kept.");
    const other = where === "browser" ? session : local;
    const snapshots = [prior, ...other && other !== target ? [snapshot(other, key, grantKey)] : []];
    try {
      if (token) {
        target.setItem(key, token);
        if (target.getItem(key) !== token) throw new Error("Browser storage did not preserve the sign-in.");
        target.removeItem(grantKey);
      } else {
        target.removeItem(key);
        target.removeItem(grantKey);
      }
      if (other && other !== target) {
        const otherSnapshot = snapshots[1];
        if (otherSnapshot) {
          other.removeItem(key);
          other.removeItem(grantKey);
        } else {
          safeRemove(other, key);
          safeRemove(other, grantKey);
        }
      }
    } catch (error) {
      rollback(snapshots);
      throw error;
    }
  }
  function readRefresh(provider) {
    const { session, local } = areas();
    const raw = safeGet(session, refreshKey(provider)) ?? safeGet(local, refreshKey(provider));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.refreshToken) return null;
      return { refreshToken: parsed.refreshToken, expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : void 0 };
    } catch {
      return null;
    }
  }
  function storeRefresh(provider, record, where) {
    const { session, local } = areas();
    const key = tokenKey(provider);
    const grantKey = refreshKey(provider);
    const target = targetStorage(where);
    const prior = snapshot(target, key, grantKey);
    if (!prior) throw new Error("Browser storage is unavailable, so this sign-in cannot be kept.");
    const other = where === "browser" ? session : local;
    const snapshots = [prior, ...other && other !== target ? [snapshot(other, key, grantKey)] : []];
    try {
      if (record?.refreshToken) target.setItem(grantKey, JSON.stringify(record));
      else target.removeItem(grantKey);
      if (record?.refreshToken && target.getItem(grantKey) !== JSON.stringify(record)) {
        throw new Error("Browser storage did not preserve the sign-in.");
      }
      if (other && other !== target) {
        const otherSnapshot = snapshots[1];
        if (otherSnapshot) other.removeItem(grantKey);
        else safeRemove(other, grantKey);
      }
    } catch (error) {
      rollback(snapshots);
      throw error;
    }
  }
  function clearRefresh(provider) {
    const { session, local } = areas();
    safeRemove(session, refreshKey(provider));
    safeRemove(local, refreshKey(provider));
  }
  function clear(provider) {
    const { session, local } = areas();
    safeRemove(session, tokenKey(provider));
    safeRemove(local, tokenKey(provider));
    clearRefresh(provider);
  }
  function setPersistence(provider, where) {
    const { session, local } = areas();
    const key = tokenKey(provider);
    const grantKey = refreshKey(provider);
    const source = safeGet(session, key) !== null ? session : safeGet(local, key) !== null ? local : null;
    if (!source) return;
    const target = where === "browser" ? local : session;
    if (!target) throw new Error("Browser storage is unavailable, so this sign-in cannot be kept.");
    if (source === target) return;
    const token = source.getItem(key);
    if (token === null) return;
    const grant = safeGet(session, grantKey) ?? safeGet(local, grantKey);
    const targetPrior = snapshot(target, key, grantKey);
    if (!targetPrior) throw new Error("Browser storage is unavailable, so this sign-in cannot be kept.");
    const sourcePrior = snapshot(source, key, grantKey);
    if (!sourcePrior) throw new Error("Browser storage is unavailable, so this sign-in cannot be kept.");
    try {
      target.setItem(key, token);
      if (grant === null) target.removeItem(grantKey);
      else target.setItem(grantKey, grant);
      if (target.getItem(key) !== token || target.getItem(grantKey) !== grant) {
        throw new Error("Browser storage did not preserve the sign-in.");
      }
      source.removeItem(grantKey);
      source.removeItem(key);
    } catch (error) {
      rollback([targetPrior, sourcePrior]);
      throw error;
    }
  }
  return { read, persistence, store, clear, setPersistence, readRefresh, storeRefresh, clearRefresh };
}
function tokenNeedsRefresh(expiresAt, skewMs, now = Date.now()) {
  return Boolean(expiresAt && expiresAt - now <= skewMs);
}

// packages/core/src/codex-client.ts
var CODEX_CLIENT_VERSION = "0.161.0";
var CODEX_ACCOUNT_CATALOG_URL = `https://chatgpt.com/backend-api/codex/models?client_version=${CODEX_CLIENT_VERSION}`;

// packages/core/src/claude-oauth.ts
var CLAUDE_OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
var CLAUDE_AUTHORIZE_URL = "https://claude.com/cai/oauth/authorize";
var CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
var CLAUDE_OAUTH_SCOPE = "user:profile user:inference";
var CLAUDE_PASTE_REDIRECT_URI = "https://platform.claude.com/oauth/code/callback";
var CLAUDE_OAUTH_BETA = "oauth-2025-04-20,claude-code-20250219";
var CLAUDE_CODE_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude.";
function claudeAuthorizeUrl(params) {
  const url = new URL(CLAUDE_AUTHORIZE_URL);
  const query = {
    code: "true",
    client_id: CLAUDE_OAUTH_CLIENT_ID,
    response_type: "code",
    redirect_uri: params.redirectUri,
    scope: CLAUDE_OAUTH_SCOPE,
    code_challenge: params.challenge,
    code_challenge_method: "S256",
    state: params.state
  };
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.href;
}
function parseClaudePastedCode(pasted, expectedState) {
  if (typeof pasted !== "string") return void 0;
  const [code, state = expectedState] = pasted.trim().split("#");
  if (!code || code.length > 4096 || /\s/.test(code) || state !== expectedState) return void 0;
  return code;
}
function buildClaudeTokenRequest(request) {
  if (request.kind === "authorization_code") {
    return {
      grant_type: "authorization_code",
      code: request.code,
      state: request.state,
      client_id: CLAUDE_OAUTH_CLIENT_ID,
      redirect_uri: request.redirectUri,
      code_verifier: request.verifier
    };
  }
  return { grant_type: "refresh_token", refresh_token: request.refreshToken, client_id: CLAUDE_OAUTH_CLIENT_ID };
}
var EXCHANGE_KEYS = ["client_id", "code", "code_verifier", "grant_type", "redirect_uri", "state"];
var REFRESH_KEYS = ["client_id", "grant_type", "refresh_token"];
function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function grantText(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 4096 && !/[\s\u0000-\u001f\u007f]/.test(value);
}
function base64urlText(value) {
  return typeof value === "string" && value.length >= 43 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}
function validateClaudeTokenRequest(value) {
  if (!isPlainObject(value)) return void 0;
  const keys = Object.keys(value).sort();
  const same = (expected) => keys.length === expected.length && keys.every((key, index) => key === expected[index]);
  if (value.client_id !== CLAUDE_OAUTH_CLIENT_ID) return void 0;
  if (value.grant_type === "authorization_code" && same(EXCHANGE_KEYS)) {
    if (value.redirect_uri !== CLAUDE_PASTE_REDIRECT_URI) return void 0;
    if (!grantText(value.code) || !base64urlText(value.state) || !base64urlText(value.code_verifier)) return void 0;
    return buildClaudeTokenRequest({
      kind: "authorization_code",
      code: value.code,
      state: value.state,
      verifier: value.code_verifier,
      redirectUri: CLAUDE_PASTE_REDIRECT_URI
    });
  }
  if (value.grant_type === "refresh_token" && same(REFRESH_KEYS)) {
    if (!grantText(value.refresh_token)) return void 0;
    return buildClaudeTokenRequest({ kind: "refresh_token", refreshToken: value.refresh_token });
  }
  return void 0;
}
function shortText(value, max) {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function filterClaudeTokenResponse(payload) {
  if (!isPlainObject(payload) || !shortText(payload.access_token, 32768)) return void 0;
  const email = isPlainObject(payload.account) && shortText(payload.account.email_address, 256) ? payload.account.email_address : void 0;
  return {
    access_token: payload.access_token,
    ...shortText(payload.refresh_token, 32768) ? { refresh_token: payload.refresh_token } : {},
    ...typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) && payload.expires_in > 0 ? { expires_in: payload.expires_in } : {},
    ...shortText(payload.token_type, 64) ? { token_type: payload.token_type } : {},
    ...shortText(payload.scope, 512) ? { scope: payload.scope } : {},
    ...email ? { account: { email_address: email } } : {}
  };
}

// packages/core/src/refresh-lock.ts
async function waitForCaller(promise, signal) {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    signal.addEventListener("abort", aborted, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}
function createCredentialRefresher(options) {
  let inflight;
  return {
    async refreshed(token, refresh, signal) {
      const run = async () => {
        const latest = options.readCredential();
        if (latest !== token) {
          if (!latest) throw options.reconnectError();
          return latest;
        }
        const next = await refresh();
        const afterRefresh = options.readCredential();
        if (afterRefresh !== token) {
          if (!afterRefresh) throw options.reconnectError();
          return afterRefresh;
        }
        options.saveCredential(next);
        return next;
      };
      inflight ??= (globalThis.navigator?.locks ? globalThis.navigator.locks.request(options.lockName, { mode: "exclusive" }, run) : run()).finally(() => {
        inflight = void 0;
      });
      return waitForCaller(inflight, signal);
    }
  };
}

// packages/providers/src/sse.ts
function parseSseLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return null;
  if (line.startsWith(":")) return { type: "comment", text: line.slice(1).trim() };
  if (!line.startsWith("data:")) return null;
  const data = line.slice("data:".length).trim();
  if (!data || data === "[DONE]") return null;
  return { type: "data", data };
}
async function* iterateSseEvents(reader, options = {}) {
  const decoder = options.decoder ?? new TextDecoder();
  let buffer = options.seed ?? "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseSseLine(line);
      if (event) yield event;
    }
    if (done) break;
  }
  if (buffer) {
    const event = parseSseLine(buffer);
    if (event) yield event;
  }
}

// packages/providers/src/endpoints.ts
var PROVIDER_BASE_URLS = {
  openrouter: "https://openrouter.ai/api/v1",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  // Hugging Face Inference Providers, OpenAI-compatible: GET /models, POST /chat/completions.
  // Billed against the caller's own HF account (free tier, PRO credits, then pay-as-you-go).
  huggingface: "https://router.huggingface.co/v1"
};
function endpointFor(provider, credential, options = {}) {
  switch (provider) {
    case "openrouter": {
      const referer = options.referer ?? (typeof window !== "undefined" ? window.location.origin : "");
      return {
        baseUrl: PROVIDER_BASE_URLS.openrouter,
        apiKey: credential,
        headers: { "HTTP-Referer": referer, ...options.appTitle ? { "X-OpenRouter-Title": options.appTitle } : {} },
        webSearch: "openrouter-plugin"
      };
    }
    case "xai":
      return { baseUrl: PROVIDER_BASE_URLS.xai, apiKey: credential, webSearch: "xai-responses-web-search" };
    case "groq":
      return { baseUrl: PROVIDER_BASE_URLS.groq, apiKey: credential, webSearch: "none" };
    case "huggingface":
      return { baseUrl: PROVIDER_BASE_URLS.huggingface, apiKey: credential, webSearch: "none" };
  }
}

// packages/providers/src/xai-responses.ts
function xaiResponsesUrl(endpoint) {
  return `${endpoint.baseUrl}/responses`;
}
function joinUserInput(...parts) {
  return parts.filter((part) => part.trim()).join("\n\n");
}
function buildXaiResponsesBody(options) {
  return {
    model: options.model,
    instructions: options.system,
    input: options.user,
    temperature: options.temperature,
    max_output_tokens: options.maxOutputTokens,
    ...options.structuredOutput ? { text: { format: { type: "json_object" } } } : {},
    // Both fields belong to the search request, so both are dropped together on a no-search retry.
    ...options.webSearch ? { tools: [{ type: "web_search" }], include: ["no_inline_citations"] } : {}
  };
}
var ORDINAL_TITLE = /^\[?\d+\]?$/;
function displayTitle(rawTitle, url) {
  const title = typeof rawTitle === "string" ? rawTitle.trim() : "";
  if (title && !ORDINAL_TITLE.test(title)) return title;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}
function sourcesFromAnnotations(annotations, seen = /* @__PURE__ */ new Set()) {
  if (!Array.isArray(annotations)) return [];
  const sources = [];
  for (const item of annotations) {
    if (!item || typeof item !== "object") continue;
    const nested = item.url_citation;
    const flatUrl = item.url;
    const url = typeof nested?.url === "string" ? nested.url : typeof flatUrl === "string" ? flatUrl : void 0;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const rawTitle = typeof nested?.title === "string" ? nested.title : item.title;
    sources.push({ url, title: displayTitle(rawTitle, url) });
  }
  return sources;
}
function finiteCount(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
}
function usageFrom(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const usage = raw;
  const prompt_tokens = finiteCount(usage.input_tokens) ?? finiteCount(usage.prompt_tokens);
  const completion_tokens = finiteCount(usage.output_tokens) ?? finiteCount(usage.completion_tokens);
  const total_tokens = finiteCount(usage.total_tokens);
  if (prompt_tokens === void 0 && completion_tokens === void 0 && total_tokens === void 0) return void 0;
  return { prompt_tokens, completion_tokens, total_tokens };
}
function xaiResponsesErrorText(payload) {
  if (!payload || typeof payload !== "object") return void 0;
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return void 0;
}
function parseXaiResponsesPayload(payload) {
  const errorMessage = xaiResponsesErrorText(payload);
  const root = payload && typeof payload === "object" ? payload : {};
  const seen = /* @__PURE__ */ new Set();
  const sources = [];
  let text = "";
  const output = Array.isArray(root.output) ? root.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const message = item;
    if (message.type !== "message" || !Array.isArray(message.content)) continue;
    for (const rawBlock of message.content) {
      if (!rawBlock || typeof rawBlock !== "object") continue;
      const block = rawBlock;
      if (block.type !== "output_text") continue;
      if (typeof block.text === "string") text += block.text;
      sources.push(...sourcesFromAnnotations(block.annotations, seen));
    }
  }
  if (!text && typeof root.output_text === "string") text = root.output_text;
  const truncated = root.status === "incomplete" && (root.incomplete_details?.reason === "max_output_tokens" || root.incomplete_details?.reason === void 0);
  return { text, sources, truncated, usage: usageFrom(root.usage), errorMessage };
}

// packages/providers/src/chat.ts
var ProviderRequestError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
};
var PROVIDER_ERROR_MESSAGES = {
  auth: "The provider did not accept this sign-in or key. Reconnect it, then try again.",
  quota: "The provider refused the request because of credits or rate limits. Check your account, or choose another provider.",
  aborted: "The request was cancelled.",
  unavailable: "The provider could not complete this request. Try again later."
};
function classifyProviderError(error) {
  const name = error && typeof error === "object" ? error.name : void 0;
  const status = error && typeof error === "object" ? error.status : void 0;
  const kind = name === "AbortError" || name === "TimeoutError" ? "aborted" : status === 401 || status === 403 ? "auth" : status === 402 || status === 429 ? "quota" : "unavailable";
  return { kind, message: PROVIDER_ERROR_MESSAGES[kind] };
}
function providerErrorText(payload) {
  if (!payload || typeof payload !== "object") return void 0;
  const error = payload.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const message = error.message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return void 0;
}
function redactProviderSecrets(text, secrets) {
  let safe = text;
  for (const secret of secrets) if (secret) safe = safe.split(secret).join("[redacted]");
  return safe;
}
function safeProviderErrorText(payload, credential) {
  const text = providerErrorText(payload);
  return text ? redactProviderSecrets(text, [credential]) : void 0;
}
var count = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : void 0;
async function* streamChatCompletions(endpoint, request) {
  const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
    method: "POST",
    signal: request.signal,
    redirect: "error",
    headers: { Authorization: `Bearer ${endpoint.apiKey}`, "Content-Type": "application/json", ...endpoint.headers },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      stream: true,
      stream_options: { include_usage: true },
      ...request.effort ? { reasoning_effort: request.effort } : {}
    })
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => void 0);
    throw new ProviderRequestError(safeProviderErrorText(payload, endpoint.apiKey) ?? `The provider answered ${response.status}.`, response.status);
  }
  const reader = response.body.getReader();
  try {
    for await (const event of iterateSseEvents(reader)) {
      if (event.type !== "data") continue;
      let chunk;
      try {
        chunk = JSON.parse(event.data);
      } catch {
        continue;
      }
      const error = safeProviderErrorText(chunk, endpoint.apiKey);
      if (error) throw new ProviderRequestError(error, 200);
      const delta = chunk.choices?.[0]?.delta;
      const reasoning = delta?.reasoning ?? delta?.reasoning_content;
      if (typeof reasoning === "string" && reasoning) yield { type: "reasoning", text: reasoning };
      if (typeof delta?.content === "string" && delta.content) yield { type: "text", text: delta.content };
      if (chunk.usage) {
        yield { type: "usage", inputTokens: count(chunk.usage.prompt_tokens), outputTokens: count(chunk.usage.completion_tokens), costUsd: count(chunk.usage.cost) };
      }
    }
  } finally {
    await reader.cancel().catch(() => void 0);
    try {
      reader.releaseLock();
    } catch {
    }
  }
  yield { type: "done" };
}

// packages/providers/src/catalog.ts
var OpenRouterAuthenticationError = class extends ProviderRequestError {
  constructor(status = 401) {
    super("OpenRouter rejected this key. Reconnect your OpenRouter account.", status);
    this.name = "OpenRouterAuthenticationError";
  }
};
function rejectInvalidCredential(status) {
  if (status === 401 || status === 403) throw new OpenRouterAuthenticationError(status);
}
var API_ROOT = PROVIDER_BASE_URLS.openrouter;
function perMillion(value) {
  const perToken = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(perToken) && perToken >= 0 ? perToken * 1e6 : void 0;
}
function analysisFit(id, name) {
  const value = `${id} ${name}`.toLowerCase();
  if (/gpt-5\.[2-9]|claude.*(?:opus|sonnet).*4|gemini.*(?:3|3\.1).*pro|grok-4|sonar-pro|deep-research/.test(value)) return "recommended";
  if (/gpt-5|claude.*sonnet|gemini.*flash(?!.*lite)|o3|o4-mini|sonar/.test(value)) return "balanced";
  if (/lite|nano|haiku|flash-lite|\bfree\b/.test(value)) return "lightweight";
  return "standard";
}
function fitRank(fit) {
  return { recommended: 0, balanced: 1, standard: 2, lightweight: 3 }[fit];
}
async function readOpenRouterKeyInfo(key, signal) {
  const response = await fetch(`${API_ROOT}/key`, { signal, redirect: "error", headers: { Authorization: `Bearer ${key}` } });
  rejectInvalidCredential(response.status);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderRequestError(safeProviderErrorText(payload, key) || "OpenRouter rejected this key.", response.status);
  return payload.data ?? {};
}
async function listOpenRouterModels(key, signal) {
  const response = await fetch(`${API_ROOT}/models`, { signal, redirect: "error", headers: { Authorization: `Bearer ${key}` } });
  rejectInvalidCredential(response.status);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderRequestError(safeProviderErrorText(payload, key) || "Could not load OpenRouter models.", response.status);
  return (payload.data ?? []).filter((model) => model.id && model.supported_parameters?.includes("tools")).map((model) => {
    const name = model.name || model.id;
    return {
      id: model.id,
      name,
      analysisFit: analysisFit(model.id, name),
      promptPerMillion: perMillion(model.pricing?.prompt),
      completionPerMillion: perMillion(model.pricing?.completion),
      contextLength: typeof model.context_length === "number" && model.context_length > 0 ? model.context_length : void 0,
      reasoning: Boolean(model.supported_parameters?.includes("reasoning"))
    };
  }).sort((a, b) => fitRank(a.analysisFit) - fitRank(b.analysisFit) || a.name.localeCompare(b.name));
}
var NON_CHAT_MODEL_WORDS = /* @__PURE__ */ new Set(["imagine", "image", "video", "embed", "embedding", "tts", "whisper", "dall", "moderation", "transcribe", "sora", "realtime", "audio", "speech", "imagen", "banana", "veo", "lyria"]);
function isChatModel(id) {
  return !id.toLowerCase().split(/[^a-z0-9]+/).some((word) => NON_CHAT_MODEL_WORDS.has(word));
}
var DATED_SEGMENT = /(?:^|-)\d{4,8}(?:-|$)/;
function isVariantId(id) {
  if (DATED_SEGMENT.test(id)) return true;
  const parts = id.toLowerCase().split("-");
  const firstVersion = parts.findIndex((part) => /\d/.test(part));
  return firstVersion !== -1 && parts.slice(firstVersion + 1).some((part) => /^[a-z]+$/.test(part));
}
function versionOf(id) {
  return id.split("-").filter((part) => !/^\d{4,8}$/.test(part)).flatMap((part) => part.match(/\d+/g) ?? []).map(Number);
}
function compareVersionsDescending(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] ?? -1) - (a[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}
function newestFirst(models) {
  const createdAt = (model) => typeof model.created === "number" && Number.isFinite(model.created) ? model.created : -Infinity;
  return models.map((model, index) => ({ model, index, created: createdAt(model), variant: isVariantId(model.id) ? 1 : 0, version: versionOf(model.id) })).sort((a, b) => (a.created === b.created ? 0 : b.created > a.created ? 1 : -1) || a.variant - b.variant || compareVersionsDescending(a.version, b.version) || a.index - b.index).map((entry) => entry.model);
}
async function listModelsForEndpoint(endpoint, signal) {
  const response = await fetch(`${endpoint.baseUrl}/models`, { signal, redirect: "error", headers: { Authorization: `Bearer ${endpoint.apiKey}`, ...endpoint.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ProviderRequestError(safeProviderErrorText(payload, endpoint.apiKey) || "Could not load models.", response.status);
  const seen = /* @__PURE__ */ new Set();
  return newestFirst((payload.data ?? []).filter((model) => {
    if (!model.id || !isChatModel(model.id) || seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  })).map((model) => ({ id: model.id, name: model.name || model.id, analysisFit: "standard", reasoning: false }));
}

// packages/providers/src/providers.ts
var toCatalog = (models) => models.map((model) => ({ id: model.id, name: model.name, ...model.analysisFit === "recommended" ? { recommended: true } : {} }));
function openrouter(options = {}) {
  return {
    id: "openrouter",
    displayName: "OpenRouter",
    // PKCE runs entirely in the browser: OpenRouter's key exchange answers CORS.
    signIn: [{ kind: "pkce", handshakeViaSite: false }],
    availability: () => ({ available: true }),
    listModels: async (token, signal) => toCatalog(await listOpenRouterModels(token, signal)),
    stream: (token, request) => streamChatCompletions(endpointFor("openrouter", token, options), request)
  };
}
function grok(options = {}) {
  return {
    id: "xai",
    displayName: "Grok",
    signIn: [
      // auth.x.ai sends no CORS headers, so the device-code start/poll needs the site's server once.
      ...options.deviceCodeViaSite === false ? [] : [{ kind: "device-code", handshakeViaSite: true }],
      { kind: "api-key", hint: "An xAI API key from console.x.ai" }
    ],
    availability: () => ({ available: true }),
    listModels: async (token, signal) => toCatalog(await listModelsForEndpoint(endpointFor("xai", token), signal)),
    stream: (token, request) => streamChatCompletions(endpointFor("xai", token), request)
  };
}
function groq() {
  return {
    id: "groq",
    displayName: "Groq",
    signIn: [{ kind: "api-key", hint: "A Groq API key from console.groq.com" }],
    availability: () => ({ available: true }),
    listModels: async (token, signal) => toCatalog(await listModelsForEndpoint(endpointFor("groq", token), signal)),
    stream: (token, request) => streamChatCompletions(endpointFor("groq", token), request)
  };
}
function huggingface(options = {}) {
  return {
    id: "huggingface",
    displayName: "Hugging Face",
    signIn: [
      ...options.clientId ? [{ kind: "pkce", handshakeViaSite: false }] : [],
      { kind: "api-key", hint: "A fine-grained access token from huggingface.co/settings/tokens" }
    ],
    availability: () => ({ available: true }),
    listModels: async (token, signal) => toCatalog(await listModelsForEndpoint(endpointFor("huggingface", token), signal)),
    stream: (token, request) => streamChatCompletions(endpointFor("huggingface", token), request)
  };
}

// packages/providers/src/claude-sign-in.ts
var CREDENTIAL_PREFIX = "claude-subscription:";
var ATTEMPT_TTL_MS = 20 * 6e4;
var REQUEST_TIMEOUT_MS = 3e4;
var MAX_RESPONSE_BYTES = 64 * 1024;
var DEFAULT_LIFETIME_SECONDS = 8 * 3600;
var REFRESH_WINDOW_MS = 5 * 6e4;
var ClaudeAuthError = class extends Error {
  status;
  constructor(status = 502, message = "Claude sign-in could not be completed. Try connecting again.") {
    super(message);
    this.status = status;
    this.name = "ClaudeAuthError";
  }
};
var ClaudeReconnectRequiredError = class extends Error {
  status = 401;
  constructor(message = "Your Claude sign-in expired. Connect it again.") {
    super(message);
    this.name = "ClaudeReconnectRequiredError";
  }
};
function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
function validText(value, maxLength = 32768) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\s\u0000-\u001f\u007f]/.test(value);
}
function toBase64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function textToBase64url(text) {
  return toBase64url(new TextEncoder().encode(text));
}
function base64urlToText(value) {
  const encoded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(encoded + "=".repeat((4 - encoded.length % 4) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
function linkedSignal(parent) {
  return AbortSignal.any([...parent ? [parent] : [], AbortSignal.timeout(REQUEST_TIMEOUT_MS)]);
}
function encodeClaudeCredential(credential) {
  return `${CREDENTIAL_PREFIX}${textToBase64url(JSON.stringify(credential))}`;
}
function decodeClaudeCredential(value) {
  if (!value || !value.startsWith(CREDENTIAL_PREFIX)) return void 0;
  try {
    const payload = JSON.parse(base64urlToText(value.slice(CREDENTIAL_PREFIX.length)));
    if (!isRecord(payload) || !validText(payload.accessToken)) return void 0;
    if (typeof payload.expiresAt !== "number" || !Number.isFinite(payload.expiresAt)) return void 0;
    return {
      accessToken: payload.accessToken,
      ...validText(payload.refreshToken) ? { refreshToken: payload.refreshToken } : {},
      expiresAt: payload.expiresAt,
      ...typeof payload.label === "string" && payload.label.length > 0 && payload.label.length <= 320 ? { label: payload.label } : {}
    };
  } catch {
    return void 0;
  }
}
function isClaudeSubscriptionRecord(value) {
  return typeof value === "string" && value.startsWith(CREDENTIAL_PREFIX);
}
function claudeTokenRelayFetch(options) {
  const path = options.path;
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path) || path.includes("//")) {
    throw new TypeError("path must be a same-origin absolute path with safe segments.");
  }
  const segments = path.slice(1).split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || !/^[A-Za-z0-9._~-]+$/.test(segment))) {
    throw new TypeError("path must be a same-origin absolute path with safe segments.");
  }
  return (input, init) => {
    if (input !== CLAUDE_TOKEN_URL) return Promise.reject(new ClaudeAuthError());
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: init.body,
      signal: init.signal,
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store"
    });
  };
}
async function postGrant(tokenFetch, body, signal) {
  return tokenFetch(CLAUDE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    credentials: "omit",
    signal: linkedSignal(signal)
  });
}
async function readJsonObject(response) {
  if (!response.body) throw new ClaudeAuthError(response.status);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => void 0);
        throw new ClaudeAuthError(response.status);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ClaudeAuthError(response.status);
  }
  if (!isRecord(payload)) throw new ClaudeAuthError(response.status);
  return payload;
}
function credentialFromTokens(value, previous, now = Date.now()) {
  if (!validText(value.access_token)) throw new ClaudeAuthError();
  if (value.refresh_token !== void 0 && !validText(value.refresh_token)) throw new ClaudeAuthError();
  const refreshToken = typeof value.refresh_token === "string" ? value.refresh_token : previous?.refreshToken;
  const expiresIn = typeof value.expires_in === "number" && Number.isFinite(value.expires_in) && value.expires_in > 0 ? Math.min(value.expires_in, 365 * 24 * 3600) : DEFAULT_LIFETIME_SECONDS;
  const account = value.account;
  const email = isRecord(account) && typeof account.email_address === "string" && account.email_address.length > 0 && account.email_address.length <= 256 && !/[\u0000-\u001f\u007f]/.test(account.email_address) ? account.email_address : void 0;
  const label = email ?? previous?.label;
  return {
    accessToken: value.access_token,
    ...refreshToken ? { refreshToken } : {},
    expiresAt: now + expiresIn * 1e3,
    ...label ? { label } : {}
  };
}
async function beginClaudeSignIn(now = Date.now()) {
  const verifier = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const url = claudeAuthorizeUrl({ challenge: toBase64url(new Uint8Array(digest)), state, redirectUri: CLAUDE_PASTE_REDIRECT_URI });
  return { url, attempt: { verifier, state, createdAt: now } };
}
async function completeClaudeSignIn(tokenFetch, attempt, pasted, signal, now = Date.now()) {
  if (now - attempt.createdAt > ATTEMPT_TTL_MS || now < attempt.createdAt) {
    throw new ClaudeAuthError(400, "This sign-in expired. Start again.");
  }
  const code = parseClaudePastedCode(pasted, attempt.state);
  if (!code) throw new ClaudeAuthError(400, "That code did not match. Copy all of it again.");
  let response;
  try {
    response = await postGrant(tokenFetch, buildClaudeTokenRequest({
      kind: "authorization_code",
      code,
      state: attempt.state,
      verifier: attempt.verifier,
      redirectUri: CLAUDE_PASTE_REDIRECT_URI
    }), signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ClaudeAuthError();
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => void 0);
    throw new ClaudeAuthError(response.status);
  }
  return encodeClaudeCredential(credentialFromTokens(await readJsonObject(response), void 0, now));
}
function claudeNeedsRefresh(credential, now = Date.now()) {
  return credential.expiresAt - now <= REFRESH_WINDOW_MS;
}
async function refreshClaudeCredential(tokenFetch, current, signal) {
  if (!validText(current.refreshToken, 4096)) throw new ClaudeReconnectRequiredError();
  let response;
  try {
    response = await postGrant(tokenFetch, buildClaudeTokenRequest({ kind: "refresh_token", refreshToken: current.refreshToken }), signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ClaudeAuthError();
  }
  if ([400, 401, 403].includes(response.status)) {
    await response.body?.cancel().catch(() => void 0);
    throw new ClaudeReconnectRequiredError();
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => void 0);
    throw new ClaudeAuthError();
  }
  return encodeClaudeCredential(credentialFromTokens(await readJsonObject(response), current));
}

// packages/providers/src/claude.ts
var ANTHROPIC_POLICY_URL = "https://code.claude.com/docs/en/legal-and-compliance";
var CLAUDE_PLAN_CREDITS_URL = "https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers";
var CLAUDE_API_KEY_SETUP = [
  { label: "Claim your Max or Team plan\u2019s API credits (optional)", url: "https://claude.ai/settings/billing" },
  { label: "Create an API key in Claude Console", url: "https://platform.claude.com/settings/keys" }
];
var CLAUDE_SUBSCRIPTIONS_PAUSED_NOTE = "This app has paused Claude subscription sign-in. Use an API key, or pick another service.";
var API = "https://api.anthropic.com/v1";
var ANTHROPIC_VERSION = "2023-06-01";
var EFFORT_ORDER = ["low", "medium", "high", "xhigh", "max"];
var MAX_PAGES = 5;
function isClaudeSubscriptionCredential(raw) {
  const token = raw.trim();
  return Boolean(token) && !(token.startsWith("sk-ant-") && !token.startsWith("sk-ant-oat"));
}
function claudeCredentialAllowed(raw, subscriptionsPaused = false) {
  return !(subscriptionsPaused && isClaudeSubscriptionCredential(raw));
}
function headers(key, json) {
  const subscription = isClaudeSubscriptionCredential(key);
  return {
    ...subscription ? { Authorization: `Bearer ${key.trim()}`, "anthropic-beta": CLAUDE_OAUTH_BETA } : { "x-api-key": key },
    "anthropic-version": ANTHROPIC_VERSION,
    // Anthropic requires this opt-in for calls made straight from a browser page.
    "anthropic-dangerous-direct-browser-access": "true",
    ...json ? { "content-type": "application/json" } : {}
  };
}
function parseAnthropicModels(rows) {
  if (!Array.isArray(rows)) return [];
  const models = [];
  for (const raw of rows) {
    if (!raw || typeof raw.id !== "string" || !raw.id.trim() || /\s/.test(raw.id)) continue;
    const effort = raw.capabilities?.effort;
    const efforts = effort && effort.supported === true ? EFFORT_ORDER.filter((level) => effort[level]?.supported === true) : [];
    models.push({
      id: raw.id,
      name: typeof raw.display_name === "string" && raw.display_name.trim() ? raw.display_name : raw.id,
      ...efforts.length ? { reasoningEfforts: efforts.map((level) => ({ effort: level })) } : {}
    });
  }
  return models;
}
function requireKey(key, paused) {
  if (!claudeCredentialAllowed(key, paused)) throw new ProviderRequestError(CLAUDE_SUBSCRIPTIONS_PAUSED_NOTE, 403);
}
async function listClaudeModels(key, signal, subscriptionsPaused = false) {
  requireKey(key, subscriptionsPaused);
  const models = [];
  let after = "";
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await fetch(`${API}/models?limit=100${after ? `&after_id=${encodeURIComponent(after)}` : ""}`, { headers: headers(key, false), signal, redirect: "error" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new ProviderRequestError(safeProviderErrorText(payload, key) ?? `Claude model list failed (${response.status}).`, response.status);
    models.push(...parseAnthropicModels(payload.data));
    if (payload.has_more !== true || typeof payload.last_id !== "string") break;
    after = payload.last_id;
  }
  return models;
}
async function* streamClaude(key, request, subscriptionsPaused = false) {
  requireKey(key, subscriptionsPaused);
  const userSystem = request.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const system = isClaudeSubscriptionCredential(key) ? [{ type: "text", text: CLAUDE_CODE_SYSTEM_PREFIX }, ...userSystem ? [{ type: "text", text: userSystem }] : []] : userSystem;
  const response = await fetch(`${API}/messages`, {
    method: "POST",
    signal: request.signal,
    redirect: "error",
    headers: headers(key, true),
    body: JSON.stringify({
      model: request.model,
      max_tokens: 16e3,
      stream: true,
      ...system.length ? { system } : {},
      messages: request.messages.filter((message) => message.role !== "system").map(({ role, content }) => ({ role, content })),
      // Effort only when chosen and listed for the model; some models reject the field outright.
      ...request.effort ? { thinking: { type: "adaptive" }, output_config: { effort: request.effort } } : {}
    })
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => void 0);
    throw new ProviderRequestError(safeProviderErrorText(payload, key) ?? `Claude answered ${response.status}.`, response.status);
  }
  let inputTokens;
  const reader = response.body.getReader();
  try {
    for await (const event of iterateSseEvents(reader)) {
      if (event.type !== "data") continue;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        continue;
      }
      if (data.type === "error") throw new ProviderRequestError(safeProviderErrorText(data, key) ?? "Claude stopped with an error.", 200);
      if (data.type === "message_start" && typeof data.message?.usage?.input_tokens === "number") inputTokens = data.message.usage.input_tokens;
      if (data.type === "content_block_delta") {
        if (data.delta?.type === "text_delta" && typeof data.delta.text === "string") yield { type: "text", text: data.delta.text };
        if (data.delta?.type === "thinking_delta" && typeof data.delta.thinking === "string") yield { type: "reasoning", text: data.delta.thinking };
      }
      if (data.type === "message_delta" && typeof data.usage?.output_tokens === "number") {
        yield { type: "usage", inputTokens, outputTokens: data.usage.output_tokens };
      }
    }
  } finally {
    await reader.cancel().catch(() => void 0);
    try {
      reader.releaseLock();
    } catch {
    }
  }
  yield { type: "done" };
}
var API_KEY_METHOD = {
  kind: "api-key",
  hint: "A Claude API key from platform.claude.com. Max and Team plans include monthly API credits for it.",
  setup: CLAUDE_API_KEY_SETUP
};
function claude(options = {}) {
  const paused = options.subscriptionsPaused ?? false;
  const subscription = options.subscription;
  const refresher = subscription && createCredentialRefresher({
    lockName: `byos-claude-refresh:${subscription.namespace?.trim() || "default"}`,
    readCredential: () => subscription.readCredential(),
    saveCredential: (value) => subscription.saveCredential(value),
    reconnectError: () => new ClaudeReconnectRequiredError()
  });
  async function accessToken(token, force, signal) {
    requireKey(token, paused);
    if (!isClaudeSubscriptionRecord(token)) return token;
    const current = decodeClaudeCredential(token);
    if (!current) throw new ClaudeReconnectRequiredError();
    const expired = current.expiresAt <= Date.now();
    if (!force && !claudeNeedsRefresh(current)) return current.accessToken;
    if (!subscription || !refresher || !current.refreshToken) {
      if (force || expired) throw new ClaudeReconnectRequiredError();
      return current.accessToken;
    }
    const value = await refresher.refreshed(token, () => refreshClaudeCredential(subscription.tokenFetch, current), signal);
    const next = decodeClaudeCredential(value);
    if (!next) throw new ClaudeReconnectRequiredError();
    return next.accessToken;
  }
  async function withRetry(token, signal, run) {
    const key = await accessToken(token, false, signal);
    try {
      return await run(key);
    } catch (error) {
      if (!(error instanceof ProviderRequestError) || error.status !== 401 || !isClaudeSubscriptionRecord(token)) throw error;
      return run(await accessToken(subscription?.readCredential() || token, true, signal));
    }
  }
  return {
    id: "claude",
    displayName: "Claude",
    signIn: subscription && !paused ? [{ kind: "pkce", handshakeViaSite: true, completion: "paste-code" }, API_KEY_METHOD] : [API_KEY_METHOD],
    availability: () => ({ available: true }),
    listModels: (token, signal) => withRetry(token, signal, (key) => listClaudeModels(key, signal, paused)),
    async *stream(token, request) {
      const key = await accessToken(token, false, request.signal);
      const first = streamClaude(key, request, paused);
      let started = false;
      try {
        for await (const event of first) {
          started = true;
          yield event;
        }
        return;
      } catch (error) {
        if (started || !(error instanceof ProviderRequestError) || error.status !== 401 || !isClaudeSubscriptionRecord(token)) throw error;
      }
      const retryKey = await accessToken(subscription?.readCredential() || token, true, request.signal);
      yield* streamClaude(retryKey, request, paused);
    }
  };
}
function claudeAcceptsTemperature(model) {
  const parts = model.toLowerCase().split("-");
  if (parts.shift() !== "claude") return false;
  if (parts[0] !== void 0 && !/^\d+$/.test(parts[0])) parts.shift();
  if (!/^\d+$/.test(parts[0] ?? "")) return false;
  const major = Number(parts[0]);
  if (major <= 3) return true;
  if (major !== 4) return false;
  const next = parts[1];
  const minor = next !== void 0 && next.length <= 2 && /^\d+$/.test(next) ? Number(next) : 0;
  return minor <= 6;
}

// packages/providers/src/openrouter-sign-in.ts
var DEFAULT_MESSAGES = {
  noAttempt: "This OpenRouter callback no longer matches a sign-in attempt. Retry connection.",
  expired: "The OpenRouter sign-in attempt expired. Retry connection.",
  unverifiable: "This OpenRouter callback could not be verified. Retry connection.",
  exchangeFailed: "OpenRouter could not finish the connection. Retry sign-in."
};
function toBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomVerifier() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(64)));
}
async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}
function createOpenRouterSignIn(options) {
  const KEY_STORAGE = options.keyStorageKey;
  const SESSION_ONLY = options.credentialPersistence === "session";
  const VERIFIER_STORAGE = options.transactionStorageKey;
  const HANDOFF_CHANNEL = options.handoffChannel;
  const HANDOFF_FALLBACK_KEY = options.handoffFallbackKey;
  const PKCE_TTL_MS = options.ttlMs ?? 20 * 60 * 1e3;
  const API_ROOT2 = options.apiRoot ?? "https://openrouter.ai/api/v1";
  const AUTH_URL = options.authUrl ?? "https://openrouter.ai/auth";
  const DEFAULT_RETURN_ROUTE = options.defaultReturnRoute ?? "";
  const RESYNC_EVENTS = options.resyncEvents ?? [];
  const messages = { ...DEFAULT_MESSAGES, ...options.messages };
  let oauthExchangeCode;
  let oauthExchangePromise;
  function storePkceTransaction(transaction) {
    const serialized = JSON.stringify(transaction);
    sessionStorage.setItem(VERIFIER_STORAGE, serialized);
    localStorage.setItem(VERIFIER_STORAGE, serialized);
  }
  function clearPkceTransaction() {
    sessionStorage.removeItem(VERIFIER_STORAGE);
    localStorage.removeItem(VERIFIER_STORAGE);
  }
  function parseStoredTransaction() {
    const raw = sessionStorage.getItem(VERIFIER_STORAGE) || localStorage.getItem(VERIFIER_STORAGE);
    if (!raw) return void 0;
    try {
      const transaction = JSON.parse(raw);
      if (typeof transaction.verifier !== "string" || !transaction.verifier) return void 0;
      if (typeof transaction.createdAt !== "number" || Date.now() - transaction.createdAt > PKCE_TTL_MS) return void 0;
      return transaction;
    } catch {
      return void 0;
    }
  }
  function readPkceVerifier() {
    const raw = sessionStorage.getItem(VERIFIER_STORAGE) || localStorage.getItem(VERIFIER_STORAGE);
    if (!raw) throw new Error(messages.noAttempt);
    try {
      const transaction = JSON.parse(raw);
      if (typeof transaction.verifier !== "string" || !transaction.verifier) throw new Error("invalid");
      if (typeof transaction.createdAt !== "number" || Date.now() - transaction.createdAt > PKCE_TTL_MS) {
        clearPkceTransaction();
        throw new Error("expired");
      }
      return transaction.verifier;
    } catch (error) {
      if (!raw.startsWith("{") && raw.length >= 43) return raw;
      if (error instanceof Error && error.message === "expired") {
        throw new Error(messages.expired);
      }
      clearPkceTransaction();
      throw new Error(messages.unverifiable);
    }
  }
  function peekReturnRoute() {
    const transaction = parseStoredTransaction();
    return typeof transaction?.returnRoute === "string" ? transaction.returnRoute : void 0;
  }
  function getStoredKey() {
    if (SESSION_ONLY) {
      const key = sessionStorage.getItem(KEY_STORAGE) ?? localStorage.getItem(KEY_STORAGE) ?? "";
      if (key) sessionStorage.setItem(KEY_STORAGE, key);
      localStorage.removeItem(KEY_STORAGE);
      return key;
    }
    const browserKey = localStorage.getItem(KEY_STORAGE);
    if (browserKey !== null) {
      sessionStorage.removeItem(KEY_STORAGE);
      return browserKey;
    }
    const sessionKey = sessionStorage.getItem(KEY_STORAGE) || "";
    if (sessionKey) storeKey(sessionKey);
    return sessionKey;
  }
  function storeKey(key) {
    if (SESSION_ONLY) {
      sessionStorage.setItem(KEY_STORAGE, key);
      localStorage.removeItem(KEY_STORAGE);
      return;
    }
    sessionStorage.removeItem(KEY_STORAGE);
    localStorage.setItem(KEY_STORAGE, key);
  }
  function clearKey() {
    sessionStorage.removeItem(KEY_STORAGE);
    if (SESSION_ONLY) localStorage.removeItem(KEY_STORAGE);
    else localStorage.setItem(KEY_STORAGE, "");
  }
  async function begin() {
    const verifier = randomVerifier();
    const challenge = await challengeFor(verifier);
    const returnRoute = window.location.hash || DEFAULT_RETURN_ROUTE;
    storePkceTransaction({ verifier, createdAt: Date.now(), returnRoute });
    const callbackUrl = new URL(`${window.location.origin}${window.location.pathname}`);
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("callback_url", callbackUrl.toString());
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    window.location.assign(authUrl.toString());
  }
  async function complete(code) {
    if (oauthExchangeCode === code && oauthExchangePromise) return oauthExchangePromise;
    oauthExchangeCode = code;
    oauthExchangePromise = (async () => {
      const verifier = readPkceVerifier();
      const response = await fetch(`${API_ROOT2}/auth/keys`, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.key) {
        if (response.status === 400 || response.status === 403) clearPkceTransaction();
        const message = providerErrorText(payload) || messages.exchangeFailed;
        throw new Error(redactProviderSecrets(message, [code, verifier]));
      }
      clearPkceTransaction();
      storeKey(payload.key);
      return payload.key;
    })();
    return oauthExchangePromise;
  }
  function broadcast(result) {
    if (result.type === "connected") storeKey(result.key);
    const signal = result.type === "connected" ? { type: "connected" } : result;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(HANDOFF_CHANNEL);
        channel.postMessage(signal);
        channel.close();
      }
    } catch {
    }
    try {
      localStorage.setItem(HANDOFF_FALLBACK_KEY, JSON.stringify({ ...signal, at: Date.now() }));
      localStorage.removeItem(HANDOFF_FALLBACK_KEY);
    } catch {
    }
  }
  function listen(onResult) {
    const teardown = [];
    let lastKey = getStoredKey();
    const syncConnection = () => {
      const key = getStoredKey();
      if (key === lastKey) return;
      lastKey = key;
      onResult(key ? { type: "connected", key } : { type: "disconnected" });
    };
    const receiveSignal = (value) => {
      if (!value || typeof value !== "object") return;
      const signal = value;
      if (signal.type === "error" && typeof signal.message === "string") {
        onResult({ type: "error", message: signal.message });
      } else if (signal.type === "connected" || signal.type === "disconnected") {
        syncConnection();
      }
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(HANDOFF_CHANNEL);
        channel.onmessage = (event) => receiveSignal(event.data);
        teardown.push(() => channel.close());
      }
    } catch {
    }
    const onStorage = (event) => {
      if (event.key === KEY_STORAGE || event.key === null) {
        syncConnection();
        return;
      }
      if (event.key !== HANDOFF_FALLBACK_KEY || !event.newValue) return;
      try {
        receiveSignal(JSON.parse(event.newValue));
      } catch {
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncConnection);
    window.addEventListener("pageshow", syncConnection);
    RESYNC_EVENTS.forEach((name) => window.addEventListener(name, syncConnection));
    teardown.push(() => window.removeEventListener("storage", onStorage));
    teardown.push(() => window.removeEventListener("focus", syncConnection));
    teardown.push(() => window.removeEventListener("pageshow", syncConnection));
    RESYNC_EVENTS.forEach((name) => teardown.push(() => window.removeEventListener(name, syncConnection)));
    return () => teardown.forEach((fn) => fn());
  }
  return {
    begin,
    complete,
    peekReturnRoute,
    getStoredKey,
    storeKey,
    clearKey,
    broadcast,
    listen,
    /** Exposed so a site can test its return-route handling without a real redirect. */
    storePkceTransaction
  };
}

// packages/providers/src/huggingface-sign-in.ts
var DEFAULT_MESSAGES2 = {
  noAttempt: "This Hugging Face callback no longer matches a sign-in attempt. Retry connection.",
  expired: "The Hugging Face sign-in attempt expired. Retry connection.",
  stateMismatch: "This Hugging Face callback could not be verified. Retry connection.",
  exchangeFailed: "Hugging Face could not finish the connection. Retry sign-in.",
  tokenExpired: "Your Hugging Face sign-in expired. Sign in again."
};
function toBase64Url2(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function randomVerifier2() {
  return toBase64Url2(crypto.getRandomValues(new Uint8Array(64)));
}
function randomState() {
  return toBase64Url2(crypto.getRandomValues(new Uint8Array(32)));
}
async function challengeFor2(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return toBase64Url2(new Uint8Array(digest));
}
function createHuggingFaceSignIn(options) {
  const TOKEN_STORAGE = options.tokenStorageKey;
  const TRANSACTION_STORAGE = options.transactionStorageKey;
  const HANDOFF_CHANNEL = options.handoffChannel;
  const HANDOFF_FALLBACK_KEY = options.handoffFallbackKey;
  const PKCE_TTL_MS = options.ttlMs ?? 20 * 60 * 1e3;
  const AUTH_URL = options.authUrl ?? "https://huggingface.co/oauth/authorize";
  const TOKEN_URL = options.tokenUrl ?? "https://huggingface.co/oauth/token";
  const SCOPES = options.scopes ?? "openid profile inference-api";
  const DEFAULT_RETURN_ROUTE = options.defaultReturnRoute ?? "";
  const RESYNC_EVENTS = options.resyncEvents ?? [];
  const messages = { ...DEFAULT_MESSAGES2, ...options.messages };
  let oauthExchangeCode;
  let oauthExchangePromise;
  function storeTransaction(transaction) {
    const serialized = JSON.stringify(transaction);
    sessionStorage.setItem(TRANSACTION_STORAGE, serialized);
    localStorage.setItem(TRANSACTION_STORAGE, serialized);
  }
  function clearTransaction() {
    sessionStorage.removeItem(TRANSACTION_STORAGE);
    localStorage.removeItem(TRANSACTION_STORAGE);
  }
  function parseStoredTransaction() {
    const raw = sessionStorage.getItem(TRANSACTION_STORAGE) || localStorage.getItem(TRANSACTION_STORAGE);
    if (!raw) return void 0;
    try {
      const transaction = JSON.parse(raw);
      if (typeof transaction.verifier !== "string" || !transaction.verifier) return void 0;
      if (typeof transaction.createdAt !== "number" || Date.now() - transaction.createdAt > PKCE_TTL_MS) return void 0;
      return transaction;
    } catch {
      return void 0;
    }
  }
  function peekReturnRoute() {
    const transaction = parseStoredTransaction();
    return typeof transaction?.returnRoute === "string" ? transaction.returnRoute : void 0;
  }
  function readTransaction(state) {
    const raw = sessionStorage.getItem(TRANSACTION_STORAGE) || localStorage.getItem(TRANSACTION_STORAGE);
    if (!raw) throw new Error(messages.noAttempt);
    let transaction;
    try {
      transaction = JSON.parse(raw);
    } catch {
      clearTransaction();
      throw new Error(messages.noAttempt);
    }
    if (typeof transaction.verifier !== "string" || !transaction.verifier || typeof transaction.state !== "string" || !transaction.state) {
      clearTransaction();
      throw new Error(messages.noAttempt);
    }
    if (typeof transaction.createdAt !== "number" || Date.now() - transaction.createdAt > PKCE_TTL_MS) {
      clearTransaction();
      throw new Error(messages.expired);
    }
    if (transaction.state !== state) {
      clearTransaction();
      throw new Error(messages.stateMismatch);
    }
    return transaction;
  }
  function getStoredToken() {
    const raw = localStorage.getItem(TOKEN_STORAGE);
    if (!raw) return null;
    try {
      const record = JSON.parse(raw);
      if (typeof record.accessToken !== "string" || !record.accessToken || typeof record.expiresAt !== "number") return null;
      return { accessToken: record.accessToken, expiresAt: record.expiresAt, refreshToken: typeof record.refreshToken === "string" ? record.refreshToken : void 0 };
    } catch {
      return null;
    }
  }
  function getUsableStoredToken() {
    const token = getStoredToken();
    if (!token) return null;
    if (Date.now() < token.expiresAt) return token;
    return token.refreshToken ? token : null;
  }
  function storeToken(token) {
    localStorage.setItem(TOKEN_STORAGE, JSON.stringify(token));
  }
  function clearToken() {
    localStorage.removeItem(TOKEN_STORAGE);
  }
  async function begin() {
    const verifier = randomVerifier2();
    const challenge = await challengeFor2(verifier);
    const state = randomState();
    const returnRoute = window.location.hash || DEFAULT_RETURN_ROUTE;
    storeTransaction({ verifier, state, createdAt: Date.now(), returnRoute });
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("client_id", options.clientId);
    authUrl.searchParams.set("redirect_uri", options.redirectUri);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    window.location.assign(authUrl.toString());
  }
  async function buildAuthorizeUrl(state, challenge) {
    const authUrl = new URL(AUTH_URL);
    authUrl.searchParams.set("client_id", options.clientId);
    authUrl.searchParams.set("redirect_uri", options.redirectUri);
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    return authUrl.toString();
  }
  async function exchangeToken(body, secrets = []) {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) {
      throw new Error(redactProviderSecrets(payload.error_description || payload.error || messages.exchangeFailed, secrets));
    }
    const expiresAt = Date.now() + (typeof payload.expires_in === "number" ? payload.expires_in : 3600) * 1e3;
    return { accessToken: payload.access_token, expiresAt, refreshToken: payload.refresh_token };
  }
  async function complete(code, state) {
    if (oauthExchangeCode === code && oauthExchangePromise) return oauthExchangePromise;
    oauthExchangeCode = code;
    oauthExchangePromise = (async () => {
      const transaction = readTransaction(state);
      const token = await exchangeToken(new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: options.redirectUri,
        client_id: options.clientId,
        code_verifier: transaction.verifier
      }), [code, transaction.verifier]);
      clearTransaction();
      storeToken(token);
      return token;
    })();
    return oauthExchangePromise;
  }
  async function refresh() {
    const current = getStoredToken();
    if (!current?.refreshToken) {
      clearToken();
      throw new Error(messages.tokenExpired);
    }
    try {
      const token = await exchangeToken(new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: current.refreshToken,
        client_id: options.clientId
      }), [current.refreshToken]);
      storeToken(token);
      return token;
    } catch (error) {
      clearToken();
      throw error instanceof Error ? error : new Error(messages.tokenExpired);
    }
  }
  function broadcast(result) {
    if (result.type === "connected") storeToken(result.token);
    const signal = result.type === "connected" ? { type: "connected" } : result;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(HANDOFF_CHANNEL);
        channel.postMessage(signal);
        channel.close();
      }
    } catch {
    }
    try {
      localStorage.setItem(HANDOFF_FALLBACK_KEY, JSON.stringify({ ...signal, at: Date.now() }));
      localStorage.removeItem(HANDOFF_FALLBACK_KEY);
    } catch {
    }
  }
  function listen(onResult) {
    const teardown = [];
    let lastToken = getStoredToken()?.accessToken ?? "";
    const syncConnection = () => {
      const token = getStoredToken();
      const accessToken = token?.accessToken ?? "";
      if (accessToken === lastToken) return;
      lastToken = accessToken;
      onResult(token ? { type: "connected", token } : { type: "disconnected" });
    };
    const receiveSignal = (value) => {
      if (!value || typeof value !== "object") return;
      const signal = value;
      if (signal.type === "error" && typeof signal.message === "string") {
        onResult({ type: "error", message: signal.message });
      } else if (signal.type === "connected" || signal.type === "disconnected") {
        syncConnection();
      }
    };
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(HANDOFF_CHANNEL);
        channel.onmessage = (event) => receiveSignal(event.data);
        teardown.push(() => channel.close());
      }
    } catch {
    }
    const onStorage = (event) => {
      if (event.key === TOKEN_STORAGE || event.key === null) {
        syncConnection();
        return;
      }
      if (event.key !== HANDOFF_FALLBACK_KEY || !event.newValue) return;
      try {
        receiveSignal(JSON.parse(event.newValue));
      } catch {
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", syncConnection);
    window.addEventListener("pageshow", syncConnection);
    RESYNC_EVENTS.forEach((name) => window.addEventListener(name, syncConnection));
    teardown.push(() => window.removeEventListener("storage", onStorage));
    teardown.push(() => window.removeEventListener("focus", syncConnection));
    teardown.push(() => window.removeEventListener("pageshow", syncConnection));
    RESYNC_EVENTS.forEach((name) => teardown.push(() => window.removeEventListener(name, syncConnection)));
    return () => teardown.forEach((fn) => fn());
  }
  return {
    begin,
    complete,
    refresh,
    peekReturnRoute,
    getStoredToken,
    getUsableStoredToken,
    storeToken,
    clearToken,
    broadcast,
    listen,
    /** Exposed so a site (or a test) can build/verify the authorize URL and PKCE machinery without a
     * real redirect. */
    storeTransaction,
    buildAuthorizeUrl,
    challengeFor: challengeFor2
  };
}

// packages/providers/src/order.ts
var DEFAULT_SERVICE_ORDER = ["claude", "chatgpt", "grok", "gemini", "openrouter", "groq", "huggingface"];
var NOT_RECOMMENDED_REASON = {};
function orderServices(items, keyOf, order = DEFAULT_SERVICE_ORDER) {
  const rank = (item) => {
    const key = keyOf(item);
    const index = key ? order.indexOf(key) : -1;
    return index === -1 ? order.length : index;
  };
  return items.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map((entry) => entry.item);
}

// packages/providers/src/on-device.ts
var ON_DEVICE_PROVIDERS = [
  {
    id: "local",
    displayName: "Local (Embedded)",
    description: "Run AI locally with llama.cpp \u2014 no server needed",
    execution: "on-device"
  },
  {
    id: "mlx",
    displayName: "On-device (MLX)",
    description: "Run a downloaded MLX model on-device. Offline. iOS/macOS only.",
    execution: "on-device"
  },
  {
    id: "foundation-models",
    displayName: "Apple Intelligence",
    description: "Apple's on-device model. Requires macOS 26+ or iOS 26+ on Apple Intelligence hardware.",
    execution: "on-device"
  }
];
var RUNTIME_UNAVAILABLE = "This provider requires a native on-device runtime.";
var BINDING_UNAVAILABLE = "This native runtime does not support this provider.";
var BRIDGE_UNAVAILABLE = "The native provider is not connected.";
var PROVIDER_UNAVAILABLE = "The on-device provider is unavailable.";
var ABORTED = "The operation was aborted.";
function isAbortError(error) {
  try {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
  } catch {
    return false;
  }
}
function abortError() {
  return new DOMException(ABORTED, "AbortError");
}
function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError();
}
function safeBridgeCall(operation) {
  try {
    return operation();
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new Error(PROVIDER_UNAVAILABLE);
  }
}
function safeBridgePromise(operation) {
  try {
    return operation().catch((error) => {
      if (isAbortError(error)) throw abortError();
      throw new Error(PROVIDER_UNAVAILABLE);
    });
  } catch (error) {
    if (isAbortError(error)) throw abortError();
    throw new Error(PROVIDER_UNAVAILABLE);
  }
}
function bridgeReadiness(bridge) {
  if (!bridge) return { available: false, reason: BRIDGE_UNAVAILABLE };
  try {
    return safeBridgeCall(() => bridge.availability());
  } catch {
    return { available: false, reason: PROVIDER_UNAVAILABLE };
  }
}
function makeAbortRace(signal) {
  if (!signal) return void 0;
  let rejectAbort;
  const promise = new Promise((_resolve, reject) => {
    rejectAbort = reject;
  });
  void promise.catch(() => {
  });
  const onAbort = () => rejectAbort(abortError());
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  return { promise, cancel: () => signal.removeEventListener("abort", onAbort) };
}
async function* guardedStream(request, availability, requireReady) {
  const signal = request.signal;
  throwIfAborted(signal);
  const ready = availability();
  if (!ready.available) throw new Error(ready.reason);
  let iterator;
  let returned = false;
  const returnIterator = async (wait) => {
    if (returned || !iterator?.return) return;
    returned = true;
    try {
      const closing = Promise.resolve(iterator.return());
      if (wait) await closing;
      else void closing.catch(() => {
      });
    } catch {
    }
  };
  const abortRace = makeAbortRace(signal);
  let wasAborted = false;
  try {
    throwIfAborted(signal);
    const liveBridge = requireReady(signal);
    const source = safeBridgeCall(() => liveBridge.stream(request));
    iterator = source[Symbol.asyncIterator]();
    throwIfAborted(signal);
    while (true) {
      throwIfAborted(signal);
      const next = safeBridgePromise(() => Promise.resolve(iterator.next()));
      const result = abortRace ? await Promise.race([next, abortRace.promise]) : await next;
      if (result.done) return;
      yield result.value;
    }
  } catch (error) {
    if (isAbortError(error)) {
      wasAborted = true;
      await returnIterator(false);
      throw abortError();
    }
    throw new Error(PROVIDER_UNAVAILABLE);
  } finally {
    abortRace?.cancel();
    await returnIterator(!wasAborted);
  }
}
function onDeviceProvidersFor(runtime) {
  if (runtime.kind !== "native") return [];
  return ON_DEVICE_PROVIDERS.filter((provider) => runtime.supportedProviders.includes(provider.id));
}
function createOnDeviceProvider(id, options) {
  const metadata = ON_DEVICE_PROVIDERS.find((provider) => provider.id === id);
  const runtimeSupported = options.runtime.kind === "native" && options.runtime.supportedProviders.includes(id);
  const availability = () => {
    if (options.runtime.kind !== "native") return { available: false, reason: RUNTIME_UNAVAILABLE };
    if (!runtimeSupported) return { available: false, reason: BINDING_UNAVAILABLE };
    return bridgeReadiness(options.bridge);
  };
  const requireReady = (signal) => {
    throwIfAborted(signal);
    const state = availability();
    if (!state.available) throw new Error(state.reason);
    return options.bridge;
  };
  return {
    id,
    displayName: metadata.displayName,
    signIn: [],
    availability,
    async listModels(signal) {
      const bridge = requireReady(signal);
      throwIfAborted(signal);
      return safeBridgePromise(() => bridge.listModels(signal));
    },
    stream(request) {
      return guardedStream(request, availability, requireReady);
    }
  };
}
export {
  ANTHROPIC_POLICY_URL,
  CLAUDE_API_KEY_SETUP,
  CLAUDE_AUTHORIZE_URL,
  CLAUDE_CODE_SYSTEM_PREFIX,
  CLAUDE_OAUTH_BETA,
  CLAUDE_OAUTH_CLIENT_ID,
  CLAUDE_OAUTH_SCOPE,
  CLAUDE_PASTE_REDIRECT_URI,
  CLAUDE_PLAN_CREDITS_URL,
  CLAUDE_SUBSCRIPTIONS_PAUSED_NOTE,
  CLAUDE_TOKEN_URL,
  CODEX_ACCOUNT_CATALOG_URL,
  CODEX_CLIENT_VERSION,
  ClaudeAuthError,
  ClaudeReconnectRequiredError,
  DEFAULT_SERVICE_ORDER,
  NOT_RECOMMENDED_REASON,
  ON_DEVICE_PROVIDERS,
  OpenRouterAuthenticationError,
  PROVIDER_BASE_URLS,
  ProviderRequestError,
  beginClaudeSignIn,
  buildClaudeTokenRequest,
  buildXaiResponsesBody,
  classifyProviderError,
  claude,
  claudeAcceptsTemperature,
  claudeAuthorizeUrl,
  claudeCredentialAllowed,
  claudeNeedsRefresh,
  claudeTokenRelayFetch,
  completeClaudeSignIn,
  createCredentialRefresher,
  createCredentialVault,
  createEffortStore,
  createHuggingFaceSignIn,
  createModelCatalogCache,
  createOnDeviceProvider,
  createOpenRouterSignIn,
  decodeClaudeCredential,
  encodeClaudeCredential,
  endpointFor,
  filterClaudeTokenResponse,
  grok,
  groq,
  huggingface,
  isChatModel,
  isClaudeSubscriptionCredential,
  isClaudeSubscriptionRecord,
  isReasoningEffort,
  isUsableModelId,
  iterateSseEvents,
  joinUserInput,
  listClaudeModels,
  listModelsForEndpoint,
  listOpenRouterModels,
  onDeviceProvidersFor,
  openrouter,
  orderServices,
  parseAnthropicModels,
  parseClaudePastedCode,
  parseModelCatalog,
  parseSseLine,
  parseXaiResponsesPayload,
  pickerModels,
  providerErrorText,
  readOpenRouterKeyInfo,
  reasoningEffortOptions,
  redactProviderSecrets,
  refreshClaudeCredential,
  requireStoragePrefix,
  resolveStorage,
  safeGet,
  safeProviderErrorText,
  safeRemove,
  safeSet,
  sourcesFromAnnotations,
  streamChatCompletions,
  streamClaude,
  tokenNeedsRefresh,
  validateClaudeTokenRequest,
  xaiResponsesErrorText,
  xaiResponsesUrl
};
