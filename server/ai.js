// AI integration for DeepSeek, Claude (Anthropic), ChatGPT (OpenAI), and Google Gemini

function buildSystem(instructions, lang) {
  const langHint = lang === 'en'
    ? 'Write all content in English.'
    : 'Schreibe den gesamten Inhalt auf Deutsch.';
  const base = instructions
    ? `You are a helpful note-taking assistant. ${langHint} Follow these instructions for the note content:\n${instructions}`
    : `You are a helpful note-taking assistant. ${langHint} Write the note in clean Markdown.`;
  return base + `\n\nReturn only the Markdown content of the note. No extra commentary, no code fences around the whole output.`;
}

function openaiCompatibleBody(prompt, instructions, model, lang) {
  return {
    model: model || 'deepseek-chat',
    temperature: 0.7,
    messages: [
      { role: 'system', content: buildSystem(instructions, lang) },
      { role: 'user', content: prompt }
    ]
  };
}

function claudeBody(prompt, instructions, model, lang) {
  return {
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    system: buildSystem(instructions, lang),
    messages: [{ role: 'user', content: prompt }]
  };
}

function geminiBody(prompt, instructions, model, lang) {
  return {
    contents: [{
      parts: [{ text: buildSystem(instructions, lang) + '\n\n' + prompt }]
    }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
  };
}

async function parseText(provider, data) {
  if (provider === 'gemini') {
    if (Array.isArray(data.candidates)) {
      return data.candidates.map(c =>
        (c.content && c.content.parts || []).map(p => p.text || '').join('')
      ).join('');
    }
    return '';
  }
  if (provider === 'claude') {
    if (data.content && Array.isArray(data.content)) {
      return data.content.map(b => b.text || '').join('');
    }
    return data.content || '';
  }
  return data.choices?.[0]?.message?.content || '';
}

export async function generateWithAI({ provider, prompt, instructions, apiKey, model, lang }) {
  const endpoints = {
    deepseek: { url: 'https://api.deepseek.com/chat/completions', body: openaiCompatibleBody },
    openai: { url: 'https://api.openai.com/v1/chat/completions', body: openaiCompatibleBody },
    'openai-compatible': { url: '', body: openaiCompatibleBody },
    claude: { url: 'https://api.anthropic.com/v1/messages', body: claudeBody },
    gemini: { url: 'https://generativelanguage.googleapis.com/v1beta/models/:model:generateContent', body: geminiBody }
  };
  const cfg = endpoints[provider];
  if (!cfg) throw new Error(`Unbekannter Anbieter: ${provider}`);

  const envKey = provider === 'openai' ? 'OPENAI_API_KEY'
    : provider === 'openai-compatible' ? 'AI_BASE_URL'
    : provider === 'gemini' ? 'GEMINI_API_KEY'
    : `${provider.toUpperCase()}_API_KEY`;
  const key = apiKey || process.env[envKey];
  if (!key) throw new Error('Kein API-Key konfiguriert. Bitte in den Einstellungen eintragen.');

  const body = cfg.body(prompt, instructions, model, lang);

  // allow custom base url for openai-compatible providers (e.g. Ollama)
  const url = provider === 'openai-compatible'
    ? (process.env.AI_BASE_URL || apiKey && /^https?:\/\//.test(apiKey) ? process.env.AI_BASE_URL || '' : '')
    : cfg.url;
  const finalUrl = provider === 'openai-compatible' ? (process.env.AI_BASE_URL || '') + '/chat/completions' : url;

  let headers;
  let finalUrlFor = provider === 'gemini'
    ? cfg.url.replace(':model', model || 'gemini-2.0-flash') + (finalUrl.includes('key=') ? '' : '?key=' + encodeURIComponent(key))
    : finalUrl;
  if (provider === 'gemini') {
    headers = { 'Content-Type': 'application/json' };
  } else if (provider === 'claude') {
    headers = {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    };
  } else {
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  }

  if (!finalUrlFor) throw new Error('Keine AI-Base-URL für openai-compatible konfiguriert (AI_BASE_URL).');

  const res = await fetch(finalUrlFor, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`${provider} API Fehler (${res.status}): ${txt.slice(0, 600)}`);
  }

  const data = await res.json();
  return parseText(provider, data);
}
