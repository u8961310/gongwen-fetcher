const $ = (id) => document.getElementById(id);
const rows = new Map(); // docNumber -> <tr>
let running = false;

function showSetup(values) {
  $('main').classList.add('hidden');
  $('setup').classList.remove('hidden');
  $('s-url').value = values.baseUrl || '';
  $('s-acc').value = values.account || '';
  $('s-pwd').value = values.password || '';
  $('s-out').value = values.outputDir || 'D:\\公文附件';
}

function showMain() {
  $('setup').classList.add('hidden');
  $('main').classList.remove('hidden');
}

function badge(cls, txt) {
  return `<span class="badge ${cls}">${txt}</span>`;
}

function statusBadge(e) {
  if (e.status === 'downloaded') return badge('b-ok', `✅ ${e.message}`);
  if (e.status === 'failed') return badge('b-fail', `⚠️ ${e.message}`);
  if (e.status === 'skipped') return badge('b-muted', `⏭️ ${e.message}`);
  if (e.status === 'noattach') return badge('b-muted', 'ℹ️ 無附件');
  if (e.status === 'dry') return badge('b-muted', e.message);
  return badge('', e.message || '');
}

function buildRows(items) {
  const tb = $('grid').querySelector('tbody');
  tb.innerHTML = '';
  rows.clear();
  for (const it of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="mono">${it.docNumber}</td><td>${it.subject}</td><td>${badge('b-wait', '等待中')}</td>`;
    tb.appendChild(tr);
    rows.set(it.docNumber, tr);
  }
}

function setRunning(on) {
  running = on;
  $('t-run').disabled = on;
  $('t-run').textContent = on ? '⏳ 下載中…' : '🔄 重新下載';
}

async function start(force = false) {
  if (running) return;
  setRunning(true);
  $('summary').textContent = '登入中…';
  buildRows([]);
  try { await window.api.startDownload({ force }); } finally { setRunning(false); }
}

window.api.onProgress((e) => {
  if (e.type === 'login') $('summary').textContent = '✅ 已登入，讀取收件夾…';
  else if (e.type === 'list') { $('summary').textContent = `收件夾 ${e.total} 件，待處理 ${e.fresh} 件`; buildRows(e.items); }
  else if (e.type === 'item-start') { const tr = rows.get(e.docNumber); if (tr) tr.children[2].innerHTML = badge('b-run', '下載中…'); }
  else if (e.type === 'item-done') { const tr = rows.get(e.docNumber); if (tr) tr.children[2].innerHTML = statusBadge(e); }
  else if (e.type === 'done') $('summary').textContent = `完成：新下載 ${e.downloaded} 件${e.failed ? `，${e.failed} 件失敗` : ''}　·　存放於 ${e.outputDir}`;
  else if (e.type === 'error') $('summary').textContent = `❌ ${e.message}（請檢查設定）`;
});

$('s-save').onclick = async () => {
  const v = { baseUrl: $('s-url').value.trim(), account: $('s-acc').value.trim(), password: $('s-pwd').value.trim(), outputDir: $('s-out').value.trim() };
  if (!v.baseUrl || !v.account || !v.password || !v.outputDir) { alert('全部欄位都要填'); return; }
  await window.api.saveSettings(v);
  showMain(); start(false);
};
$('t-run').onclick = () => start(true);
$('t-folder').onclick = () => window.api.openFolder();
$('t-settings').onclick = async () => showSetup(await window.api.getSettings());
$('t-history').onclick = async () => {
  const h = $('history'); h.classList.toggle('hidden');
  if (!h.classList.contains('hidden')) {
    const list = await window.api.getHistory();
    const tb = $('hgrid').querySelector('tbody');
    tb.innerHTML = list.map((r) => {
      let t = r.time;
      try { t = new Date(r.time).toLocaleString('zh-TW'); } catch { /* 保留原字串 */ }
      return `<tr><td class="mono">${t}</td><td class="mono">${r.docNumber}</td><td>${r.count}</td></tr>`;
    }).join('');
  }
};
$('t-sched').onchange = async (ev) => { await window.api.setSchedule(ev.target.checked); };

(async () => {
  const st = await window.api.getState();
  $('t-sched').checked = await window.api.getSchedule();
  if (st.configured) { showMain(); start(false); }
  else showSetup(await window.api.getSettings());
})();
