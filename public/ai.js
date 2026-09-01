/* ============================================================
   ai.js — AI assistant right-side panel (DeepSeek / Claude / ChatGPT)
   ============================================================ */
'use strict';
// A is declared once in core.js (window.App); referenced here as global.
// Anbieter & API-Key werden ausschliesslich in den Settings konfiguriert.

A.aiInit = function () {
  const panel = A.$('#ai-panel');

  // toggle panel open
  A.$('#btn-ai').addEventListener('click', () => {
    if (panel.classList.contains('hidden')) openAIPanel();
    else closeAIPanel();
  });
  A.$('#btn-ai-close').addEventListener('click', closeAIPanel);
  A.$('#btn-ai-run').addEventListener('click', runAI);
  A.$('#btn-ai-insert').addEventListener('click', () => { A.insertAIResult(); });

  A.$('#ai-prompt').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runAI();
  });
};

// Liefert den aktiven Anbieter: der in Settings gewaehlte (ai.activeProvider)
// oder fallback der erste mit gesetztem API-Key (deepseek -> claude -> openai).
A.getActiveAIProvider = function () {
  const ai = A.settings.ai || {};
  const order = ['deepseek', 'claude', 'openai', 'gemini'];
  if (ai.activeProvider && order.indexOf(ai.activeProvider) !== -1) {
    return ai.activeProvider;
  }
  for (const p of order) {
    if (ai[p] && ai[p].apiKey) return p;
  }
  // Default DeepSeek (Modell im settings.json vorhanden)
  return 'deepseek';
};

function openAIPanel() {
  const panel = A.$('#ai-panel');
  panel.classList.remove('hidden');
  A.$('#ai-result').classList.add('hidden');
  A.$('#ai-result').innerHTML = '';
  setTimeout(() => A.$('#ai-prompt').focus(), 50);
}

function closeAIPanel() {
  A.$('#ai-panel').classList.add('hidden');
}

async function runAI() {
  const provider = A.getActiveAIProvider();
  const prompt = A.$('#ai-prompt').value.trim();
  // Modell/Anweisungen kommen aus den Settings (optional)
  const cfg = (A.settings.ai || {})[provider] || {};
  const instructions = cfg.instructions || '';
  const model = cfg.model || '';
  // API-Key wird aus den Settings übernommen
  const apiKey = cfg.apiKey || '';
  const resultEl = A.$('#ai-result');

  if (!prompt) { A.toast(A.t('aiPrompt'), true); return; }
  if (!apiKey) { A.toast(A.t('aiKeyRequired'), true); return; }

  resultEl.classList.remove('hidden');
  resultEl.className = 'loading';
  resultEl.textContent = A.t('generating') + '…';
  A.$('#btn-ai-run').disabled = true;

  try {
    const data = await A.api('/api/ai', { method: 'POST', body: {
      provider, prompt, instructions, apiKey, model, lang: A.settings.lang
    } });
    resultEl.className = '';
    resultEl.textContent = data.text;
    A.$('#btn-ai-run').disabled = false;
    // Remember apiKey/model/instructions in settings
    const ai = A.settings.ai || {};
    ai[provider] = Object.assign({}, ai[provider], { apiKey, model, instructions });
    A.settings.ai = ai;
    try { await A.api('/api/settings', { method: 'POST', body: { ai } }); } catch (e) {}
  } catch (err) {
    resultEl.classList.add('error');
    resultEl.textContent = A.t('aiError') + ': ' + err.message;
    A.$('#btn-ai-run').disabled = false;
  }
}

/* Insert AI result into the current editor */
A.insertAIResult = function () {
  const rez = A.$('#ai-result');
  const text = rez ? rez.textContent : '';
  if (!text) return;
  const ed = A.state.editorMode === 'md' ? A.$('#mdsrc') : A.$('#wysiwyg');
  if (A.state.editorMode === 'md') {
    ed.value = (ed.value ? ed.value + '\n\n' : '') + text;
    ed.dispatchEvent(new Event('input'));
  } else {
    ed.focus();
    document.execCommand('insertHTML', false, A.mdToHtml(text));
    ed.dispatchEvent(new Event('input'));
  }
};
