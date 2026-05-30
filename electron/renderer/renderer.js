const $ = (id) => document.getElementById(id);
const rows = new Map(); // docNumber -> <tr>

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

function statusText(e) {
  if (e.status === 'downloaded') return { cls: 'st-downloaded', txt: `✅ ${e.message}` };
  if (e.status === 'failed') return { cls: 'st-failed', txt: `⚠️ ${e.message}` };
  if (e.status === 'skipped') return { cls: 'st-skipped', txt: `⏭️ ${e.message}` };
  if (e.status === 'noattach') return { cls: 'st-noattach', txt: 'ℹ️ 無附件' };
  if (e.status === 'dry') return { cls: 'st-skipped', txt: e.message };
  return { cls: '', txt: e.message || '' };
}

function buildRows(items) {
  const tb = $('grid').querySelector('tbody');
  tb.innerHTML = '';
  rows.clear();
  for (const it of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${it.docNumber}</td><td>${it.subject}</td><td class="st-downloading">等待中</td>`;
    tb.appendChild(tr);
    rows.set(it.docNumber, tr);
  }
}

async function start() {
  $('summary').textContent = '登入中…';
  buildRows([]);
  await window.api.startDownload();
}

window.api.onProgress((e) => {
  if (e.type === 'login') $('summary').textContent = '✅ 已登入，讀取收件夾…';
  else if (e.type === 'list') { $('summary').textContent = `收件夾 ${e.total} 件，新 ${e.fresh} 件`; buildRows(e.items); }
  else if (e.type === 'item-start') { const tr = rows.get(e.docNumber); if (tr) tr.children[2].textContent = '下載中…'; }
  else if (e.type === 'item-done') { const tr = rows.get(e.docNumber); if (tr) { const s = statusText(e); tr.children[2].textContent = s.txt; tr.children[2].className = s.cls; } }
  else if (e.type === 'done') $('summary').textContent = `完成：新下載 ${e.downloaded} 件${e.failed ? `，${e.failed} 件失敗` : ''}（${e.outputDir}）`;
  else if (e.type === 'error') $('summary').textContent = `❌ ${e.message}（請檢查設定）`;
});

$('s-save').onclick = async () => {
  const v = { baseUrl: $('s-url').value.trim(), account: $('s-acc').value.trim(), password: $('s-pwd').value.trim(), outputDir: $('s-out').value.trim() };
  if (!v.baseUrl || !v.account || !v.password || !v.outputDir) { alert('全部欄位都要填'); return; }
  await window.api.saveSettings(v);
  showMain(); start();
};
$('t-run').onclick = start;
$('t-folder').onclick = () => window.api.openFolder();
$('t-settings').onclick = async () => showSetup(await window.api.getSettings());
$('t-history').onclick = async () => {
  const h = $('history'); h.classList.toggle('hidden');
  if (!h.classList.contains('hidden')) {
    const list = await window.api.getHistory();
    const tb = $('hgrid').querySelector('tbody');
    tb.innerHTML = list.map((r) => `<tr><td>${r.time}</td><td>${r.docNumber}</td><td>${r.count}</td></tr>`).join('');
  }
};
$('t-sched').onchange = async (ev) => { await window.api.setSchedule(ev.target.checked); };

(async () => {
  const st = await window.api.getState();
  $('t-sched').checked = await window.api.getSchedule();
  if (st.configured) { showMain(); start(); }
  else showSetup(await window.api.getSettings());
})();
