const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');

const source = fs.readFileSync(process.env.TRIM_SOURCE || 'src-app.html', 'utf8');
const start = source.indexOf('const COACH={');
const end = source.indexOf('function coachNote(', start);
assert.ok(start >= 0 && end > start, 'coach provider source not found');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function response(body, {status = 200} = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

function harness(saved = {}, fetchImpl) {
  const calls = [];
  const localStorage = storage(saved);
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value:'', placeholder:'', textContent:'', hidden:false, style:{}, children:[],
      classList:{add() {}, remove() {}},
      appendChild(child) { this.children.push(child); },
      replaceChildren(...children) { this.children = children; },
      scrollIntoView() {},
    });
    return elements.get(id);
  };
  const document = {createElement:tag => element(`${tag}-${elements.size}`)};
  const fetch = async (...args) => {
    calls.push(args);
    if (fetchImpl) return fetchImpl(...args);
    return response({choices:[{message:{content:'openai answer'}}]});
  };
  const context = vm.createContext({
    localStorage, fetch, URL, URLSearchParams, TextEncoder,
    Date, JSON, Math, Uint8Array,
    window:{open() {}},
    crypto:{getRandomValues:a=>a, subtle:{digest:async()=>new ArrayBuffer(32)}},
    btoa:value=>Buffer.from(value, 'binary').toString('base64'),
    document, $:element,
  });
  vm.runInContext(`function coachNote() {}
    ${source.slice(start, end)}
    coachInstructions=()=>"coach system instructions";
    globalThis.coachApi={COACH,COACH_PROVIDERS,COACH_CONFIG,COACH_STORE,COACH_MODEL,OAUTH_STORE,
      coachConfig,coachEndpoint,coachAskApi,coachSave,coachForget,coachSettings,coachStatus};`, context);
  return {api:context.coachApi, calls, localStorage, elements, element};
}

function configured(provider, overrides = {}) {
  return {
    trimlab_coach_config:JSON.stringify({
      provider,
      model:`${provider}-test-model`,
      endpoint:'',
      key:`${provider}-secret`,
      ...overrides,
    }),
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('named providers route to their registered endpoint with the configured model and key', async () => {
  for (const provider of ['openrouter','openai','gemini','groq','xai','mistral','deepseek']) {
    const h = harness(configured(provider));
    h.api.COACH.turns.push({role:'assistant',content:'prior'});
    assert.equal(await h.api.coachAskApi('trim me'), 'openai answer', provider);
    assert.equal(h.calls.length, 1, provider);
    const [url, init] = h.calls[0];
    const config = h.api.coachConfig();
    assert.equal(url, h.api.coachEndpoint(config), provider);
    assert.equal(init.method, 'POST', provider);
    assert.equal(init.headers.authorization, `Bearer ${provider}-secret`, provider);
    assert.equal(init.headers['content-type'], 'application/json', provider);
    const body = JSON.parse(init.body);
    assert.equal(body.model, `${provider}-test-model`, provider);
    const tokenField = provider === 'openai' ? 'max_completion_tokens' : 'max_tokens';
    const otherField = provider === 'openai' ? 'max_tokens' : 'max_completion_tokens';
    assert.ok(Number.isInteger(body[tokenField]) && body[tokenField] > 0, provider);
    assert.equal(body[otherField], undefined, provider);
    assert.deepEqual(body.messages.slice(-2), [
      {role:'assistant',content:'prior'},
      {role:'user',content:'trim me'},
    ], provider);
    assert.equal(body.messages[0].role, 'system', provider);
  }
});

test('OpenAI uses max_completion_tokens and preserves an arbitrary OpenRouter model', async () => {
  const openai = harness(configured('openai'));
  await openai.api.coachAskApi('hello');
  const openaiBody = JSON.parse(openai.calls[0][1].body);
  assert.equal(openaiBody.max_completion_tokens, 1024);
  assert.equal(openaiBody.max_tokens, undefined);

  const model = 'meta-llama/llama-3.3-70b-instruct';
  const router = harness(configured('openrouter', {model}));
  await router.api.coachAskApi('hello');
  assert.equal(JSON.parse(router.calls[0][1].body).model, model);
});

test('Anthropic uses its message shape and API-key headers without output_config', async () => {
  const h = harness(configured('anthropic'), async () => response({
    content:[{type:'text',text:'anthropic answer'}], stop_reason:'end_turn',
  }));
  assert.equal(await h.api.coachAskApi('trim me'), 'anthropic answer');
  const [url, init] = h.calls[0];
  assert.equal(url, h.api.coachEndpoint(h.api.coachConfig()));
  assert.equal(init.headers['x-api-key'], 'anthropic-secret');
  assert.equal(init.headers.authorization, undefined);
  assert.equal(init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'anthropic-test-model');
  assert.equal(body.max_tokens, 1024);
  assert.equal(typeof body.system, 'string');
  assert.equal(body.output_config, undefined);
  assert.deepEqual(body.messages.at(-1), {role:'user',content:'trim me'});
});

test('legacy credentials restore without writing config while existing OpenRouter configuration is unchanged', () => {
  const legacyRouter = harness({
    trimlab_anth_cred:'sk-or-legacy',
    trimlab_coach_model:'claude-haiku-4-5',
  });
  assert.deepEqual(plain(legacyRouter.api.coachConfig()), {
    provider:'openrouter', model:'anthropic/claude-haiku-4.5',
    endpoint:'https://openrouter.ai/api/v1/chat/completions', key:'sk-or-legacy',
  });
  assert.equal(legacyRouter.localStorage.getItem('trimlab_coach_config'), null);

  const legacyAnthropic = harness({
    trimlab_anth_cred:'sk-ant-api-legacy', trimlab_coach_model:'claude-sonnet-test',
  });
  assert.deepEqual(plain(legacyAnthropic.api.coachConfig()), {
    provider:'anthropic', model:'claude-sonnet-test',
    endpoint:'https://api.anthropic.com/v1/messages', key:'sk-ant-api-legacy',
  });

  const existing = harness(configured('openrouter', {model:'claude-haiku-4-5'}));
  assert.equal(existing.api.coachConfig().model, 'claude-haiku-4-5');
});

test('an unknown stored provider discards its credential and falls back to default OpenRouter', () => {
  const h = harness(configured('surprise-provider', {model:'claude-safe'}));
  assert.deepEqual(plain(h.api.coachConfig()), {
    provider:'openrouter', model:'openai/gpt-4.1-mini',
    endpoint:'https://openrouter.ai/api/v1/chat/completions', key:'',
  });
});

test('OAuth is considered only for Anthropic without a configured key', async () => {
  const oauth = JSON.stringify({access:'oauth-access',refresh:'refresh',exp:Date.now()+60_000});
  for (const provider of ['openrouter','openai','gemini','groq','xai','mistral','deepseek']) {
    const h = harness({...configured(provider, {key:''}), trimlab_oauth:oauth});
    await assert.rejects(h.api.coachAskApi('hello'), error => error && error.code === 'no_key', provider);
    assert.equal(h.calls.length, 0, provider);
  }

  const anth = harness({...configured('anthropic', {key:''}), trimlab_oauth:oauth}, async () =>
    response({content:[{type:'text',text:'oauth answer'}]}));
  assert.equal(await anth.api.coachAskApi('hello'), 'oauth answer');
  assert.equal(anth.calls[0][1].headers.authorization, 'Bearer oauth-access');
  assert.equal(anth.calls[0][1].headers['anthropic-beta'], 'oauth-2025-04-20');
  assert.equal(anth.calls[0][1].headers['x-api-key'], undefined);
});

test('custom provider accepts HTTPS and localhost HTTP chat-completion URLs without a key', async () => {
  for (const endpoint of [
    'https://llm.example.test/v1/chat/completions',
    'http://localhost:11434/v1/chat/completions',
    'http://127.0.0.1:1234/v1/chat/completions',
  ]) {
    const h = harness(configured('custom', {endpoint, key:''}));
    assert.equal(await h.api.coachAskApi('hello'), 'openai answer');
    assert.equal(h.calls[0][0], endpoint);
    assert.equal(h.calls[0][1].headers.authorization, undefined);
    assert.equal(JSON.parse(h.calls[0][1].body).model, 'custom-test-model');
  }
});

test('custom provider rejects malformed or insecure remote endpoints before fetch', async () => {
  for (const endpoint of ['', 'not a url', 'http://llm.example.test/v1/chat/completions', 'ftp://localhost/model']) {
    const h = harness(configured('custom', {endpoint, key:''}));
    assert.throws(() => h.api.coachEndpoint(h.api.coachConfig()), undefined, endpoint || 'empty endpoint');
    await assert.rejects(h.api.coachAskApi('hello'), undefined, endpoint || 'empty endpoint');
    assert.equal(h.calls.length, 0);
  }
});

test('named providers require keys and API HTTP errors retain status and provider detail', async () => {
  const missing = harness(configured('groq', {key:''}));
  await assert.rejects(missing.api.coachAskApi('hello'), error => error && error.code === 'no_key');
  assert.equal(missing.calls.length, 0);

  const failed = harness(configured('openai'), async () =>
    response({error:{message:'quota exhausted'}}, {status:429}));
  await assert.rejects(failed.api.coachAskApi('hello'), error => {
    assert.equal(error.code, 'http_429');
    assert.equal(error.message, 'quota exhausted');
    return true;
  });
});

test('saving a model change for the same provider retains its saved key', () => {
  const h = harness(configured('groq', {model:'old-model', key:'saved-groq-key'}));
  h.element('providerSel').value = 'groq';
  h.element('modelSel').value = 'new-model';
  h.element('keyIn').value = '';
  h.api.coachSave();
  assert.deepEqual(JSON.parse(h.localStorage.getItem('trimlab_coach_config')), {
    provider:'groq', model:'new-model',
    endpoint:'https://api.groq.com/openai/v1/chat/completions', key:'saved-groq-key',
  });
});

test('changing a custom endpoint does not reuse the credential saved for the old endpoint', () => {
  const original = configured('custom', {
    endpoint:'https://old.example.test/v1/chat/completions', key:'old-endpoint-key',
  });
  const h = harness(original);
  h.element('providerSel').value = 'custom';
  h.element('modelSel').value = 'custom-model';
  h.element('endpointIn').value = 'https://new.example.test/v1/chat/completions';
  h.element('keyIn').value = '';
  h.api.coachSave();
  assert.deepEqual(JSON.parse(h.localStorage.getItem('trimlab_coach_config')), {
    provider:'custom', model:'custom-model',
    endpoint:'https://new.example.test/v1/chat/completions', key:'',
  });
});

test('switching named providers requires that provider own key and clears the key input', () => {
  const initial = configured('openrouter', {key:'router-key'});
  const h = harness(initial);
  h.element('keyIn').value = 'must disappear';
  h.api.coachSettings('groq');
  assert.equal(h.element('keyIn').value, '');
  assert.equal(h.element('modelSel').value, h.api.COACH_PROVIDERS.groq.models[0]);

  h.element('providerSel').value = 'groq';
  h.element('modelSel').value = 'llama-test';
  h.api.coachSave();
  assert.equal(h.element('coachSettingsStatus').textContent, 'Paste an API key for Groq.');
  assert.deepEqual(JSON.parse(h.localStorage.getItem('trimlab_coach_config')),
    JSON.parse(initial.trimlab_coach_config));
});

test('Forget removes provider config, OAuth, and both legacy settings', () => {
  const h = harness({
    ...configured('anthropic'),
    trimlab_oauth:JSON.stringify({access:'oauth'}),
    trimlab_anth_cred:'legacy-key',
    trimlab_coach_model:'legacy-model',
  });
  h.api.coachForget();
  for (const key of ['trimlab_coach_config','trimlab_oauth','trimlab_anth_cred','trimlab_coach_model']) {
    assert.equal(h.localStorage.getItem(key), null, key);
  }
  assert.equal(h.api.COACH.provider, null);
});
