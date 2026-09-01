/* ============================================================
   drawing.js — Zeichnungs-Editor (Canvas) & Einfügen in die Notiz
   Feature 5: Zeichnungen erstellen & im Editor einfügen.
   ============================================================ */
'use strict';
// A in core.js (window.App)

let drawCtx = null;
let drawTool = 'pen';
let drawColor = '#2563eb';
let drawBrush = 4;
let drawHistory = [];
let drawOpen = false;

A.drawingInit = function () {
  A.$('#btn-insert-drawing')?.addEventListener('click', () => openDrawing());
  // toolbar inside the modal
  A.$('#draw-tool-pen')?.addEventListener('click', (e) => { setDrawTool('pen'); highlightActive(e.currentTarget); });
  A.$('#draw-tool-eraser')?.addEventListener('click', (e) => { setDrawTool('eraser'); highlightActive(e.currentTarget); });
  A.$('#draw-color')?.addEventListener('input', (e) => { drawColor = e.target.value; setDrawTool(drawTool); });
  A.$('#draw-brush')?.addEventListener('input', (e) => { drawBrush = parseInt(e.target.value, 10) || 4; setDrawTool(drawTool); });
  A.$('#draw-undo')?.addEventListener('click', drawUndo);
  A.$('#draw-clear')?.addEventListener('click', drawClear);
  A.$('#draw-insert')?.addEventListener('click', drawInsert);
  A.$('#drawing-modal')?.addEventListener('click', (e) => { if (e.target === A.$('#drawing-modal')) A.$('#drawing-modal').classList.add('hidden'); });

  const canvas = A.$('#draw-canvas');
  if (canvas) {
    canvas.addEventListener('mousedown', startStroke);
    canvas.addEventListener('mousemove', moveStroke);
    canvas.addEventListener('mouseup', endStroke);
    canvas.addEventListener('mouseleave', endStroke);
    // touch support
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); const p = touchPoint(e); startPoint(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); const p = touchPoint(e); movePoint(p.x, p.y); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); endStroke(); }, { passive: false });
  }
};

function touchPoint(e) {
  const t = e.touches[0];
  const c = A.$('#draw-canvas');
  const r = c.getBoundingClientRect();
  const sx = c.width / r.width;
  const sy = c.height / r.height;
  return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
}

function setDrawTool(tool) {
  drawTool = tool;
  const c = A.$('#draw-canvas');
  if (!c) return;
  c.style.cursor = tool === 'eraser' ? 'cell' : 'crosshair';
  c.style.background = tool === 'eraser' ? '#f0f2f5' : '#fff';
}

function highlightActive(btn) {
  A.$$('#drawing-modal .draw-pen').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function openDrawing() {
  if (!A.state.currentPath) { A.toast(A.t('saveFirst'), true); return; }
  drawOpen = true;
  drawHistory = [];
  drawTool = 'pen';
  setDrawTool('pen');
  A.$$('#draw-tool-pen').forEach(b => b.classList.add('active'));
  A.$$('#draw-tool-eraser').forEach(b => b.classList.remove('active'));
  const c = A.$('#draw-canvas');
  // Modal erst sichtbar machen, DAMIT offsetWidth korrekt ist (sonst ist es 0 bei display:none)
  A.$('#drawing-modal').classList.remove('hidden');
  if (c) {
    c.width = c.offsetWidth || 900;
    c.height = Math.round((c.width || 900) * 0.6);
  }
  drawCtx = c ? c.getContext('2d') : null;
  if (drawCtx) drawCtx.clearRect(0, 0, c.width, c.height);
  A.$('#draw-brush').value = drawBrush;
  A.$('#draw-color').value = drawAdvanceColor();
}

function drawAdvanceColor() {
  // keep chosen colour; nothing to advance
  const el = A.$('#draw-color');
  return el ? el.value : drawColor;
}

function canvasPoint(e) {
  const c = A.$('#draw-canvas');
  const r = c.getBoundingClientRect();
  // Anzeige-Koordinaten -> Canvas-Pixel (wegen CSS-Skalierung max-width:100%)
  const sx = c.width / r.width;
  const sy = c.height / r.height;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

function startStroke(e) {
  if (!drawOpen) return;
  const p = canvasPoint(e);
  startPoint(p.x, p.y);
}
function startPoint(x, y) {
  if (!drawOpen) return;
  if (!drawCtx) { const c = A.$('#draw-canvas'); if (c) drawCtx = c.getContext('2d'); }
  A.drawDrawing = true;
  drawCtx.beginPath();
  drawCtx.moveTo(x, y);
  drawCtx.lineCap = 'round';
  drawCtx.lineJoin = 'round';
  drawCtx.strokeStyle = drawTool === 'eraser' ? '#ffffff' : drawColor;
  drawCtx.lineWidth = drawTool === 'eraser' ? drawBrush * 4 : drawBrush;
  drawCtx.lineTo(x + 0.1, y + 0.1);
  drawCtx.stroke();
}
function moveStroke(e) {
  if (!A.drawDrawing || !drawOpen) return;
  const p = canvasPoint(e);
  movePoint(p.x, p.y);
}
function movePoint(x, y) {
  if (!drawCtx) return;
  drawCtx.lineTo(x, y);
  drawCtx.stroke();
}
function endStroke() {
  if (!A.drawDrawing) return;
  A.drawDrawing = false;
  const c = A.$('#draw-canvas');
  if (c) drawHistory.push(c.toDataURL());
  if (drawHistory.length > 60) drawHistory.shift();
}

function drawUndo() {
  if (!drawCtx || !drawHistory.length) return;
  drawHistory.pop();
  const c = A.$('#draw-canvas');
  drawCtx.clearRect(0, 0, c.width, c.height);
  const prev = drawHistory[drawHistory.length - 1];
  if (prev) { const img = new Image(); img.onload = () => drawCtx.drawImage(img, 0, 0); img.src = prev; }
}

function drawClear() {
  if (!drawCtx) return;
  drawCtx.clearRect(0, 0, drawCtx.canvas.width, drawCtx.canvas.height);
  drawHistory = [];
}

async function drawInsert() {
  if (!drawCtx) return;
  const dataUrl = drawCtx.canvas.toDataURL('image/png');
  try {
    const res = await A.api('/api/upload-drawing', { method: 'POST', body: { dataUrl } });
    insertDrawingLink(res);
    // Zeichnungs-Fenster nach dem Einfügen schließen
    A.$('#drawing-modal')?.classList.add('hidden');
    drawOpen = false;
  } catch (err) { A.toast(err.message, true); }
}

// Fügt die Zeichnung an der markierten Stelle (Cursor-Position) in die Notiz
// ein — in WYSIWYG und MD-Modus — und speichert danach in die Datei.
// Fallback, wenn der Cursor ungültig ist (z.B. in einer Überschrift):
// ans Ende anhängen, damit das Bild nie verloren geht.
function insertDrawingLink(link) {
  if (!link || !link.url) { A.toast('Zeichnung'); return; }
  const mdLine = `![${link.filename || 'zeichnung'}](${link.url})`;
  const ta = A.$ && A.$('#mdsrc');
  const w = A.$ && A.$('#wysiwyg');

  if (A.state && A.state.editorMode === 'md' && ta) {
    // MD-Modus: an der Textarea-Cursorposition einfügen
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? start;
    const cur = ta.value || '';
    ta.value = cur.slice(0, start) + mdLine + (cur.slice(end).startsWith('\n') ? '' : '\n') + cur.slice(end);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.selectionStart = ta.selectionEnd = start + mdLine.length;
  } else if (w) {
    // WYSIWYG-Modus: an der Caret-Position einfügen
    w.focus();
    const img = document.createElement('img');
    img.src = link.url;
    img.alt = link.filename || 'zeichnung';
    const sel = window.getSelection();
    if (sel && sel.rangeCount && w.contains(sel.anchorNode) && !sel.anchorNode.parentNode?.closest('h1,h2,h3,h4')) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      // Cursor ungültig/in Überschrift → safe ans Ende
      w.appendChild(img);
    }
    w.appendChild(document.createElement('br'));
    w.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (ta) {
    // Kein WYSIWYG-DOM → direkt ans Ende der Quelle
    const cur = ta.value || '';
    ta.value = cur + (cur && !cur.endsWith('\n') ? '\n' : '') + mdLine + '\n';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  if (A.state) A.state.dirty = true;
  // Force a save so the markdown (with the image) is written to the file.
  if (typeof A.saveCurrent === 'function') {
    A.saveCurrent(false).catch(() => {});
  }
  A.toast('Bild eingefügt');
}
