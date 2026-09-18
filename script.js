const defaultBrister = ['Läkemedelslista', 'Medföljandeblankett', 'ID-band', '0-HLR Beslut', 'Bemötandeplan'];
const REPORTS_PAGE_SIZE = 50;
let reportsLoaded = 0;
let reportsTotal = 0;
let currentFilter = { boende: '', fromDate: '', toDate: '' };

export function createReportRequestGate() {
  let sequence = 0;
  let current = 0;
  let currentBusy = false;
  return {
    start(append) {
      if (append && currentBusy) return null;
      const token = ++sequence;
      current = token;
      currentBusy = true;
      return token;
    },
    isCurrent(token) { return token === current; },
    finish(token) { if (token === current) currentBusy = false; }
  };
}

const reportRequestGate = createReportRequestGate();

export async function requestJson(path, options = {}, fetchImpl = globalThis.fetch) {
  let response;
  try {
    response = await fetchImpl(path, { credentials: 'same-origin', ...options });
  } catch {
    throw new Error('Kunde inte nå servern. Kontrollera anslutningen och försök igen.');
  }
  let body = {};
  try { body = await response.json(); } catch { /* Proxy error without JSON. */ }
  if (!response.ok) {
    const error = new Error(body.error || 'Något gick fel på servern. Försök igen.');
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function submitReport(payload, onSuccess, fetchImpl = globalThis.fetch) {
  const result = await requestJson('/api/reports', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload)
  }, fetchImpl);
  onSuccess?.(result);
  return result;
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function buildReportsUrl(filter, limit = REPORTS_PAGE_SIZE, offset = 0) {
  const params = new URLSearchParams();
  if (filter.boende) params.set('boende', filter.boende);
  if (filter.fromDate) params.set('from', filter.fromDate);
  if (filter.toDate) params.set('to', filter.toDate);
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return `/api/admin/reports?${params}`;
}

export function filterForPrint(filter, onlyResidence) {
  return onlyResidence ? { ...filter, fromDate: '', toDate: '' } : { ...filter };
}

export function selectedDeficiencies(status, values) {
  return status === 'NEJ' ? values.join(', ') : '';
}

export async function finishReportSubmission(event, submit) {
  const form = event.currentTarget;
  await submit();
  form.reset();
}

function showError(error, fallback = 'Något gick fel. Försök igen.') { alert(error?.message || fallback); }

function setLoading(isLoading) {
  const button = document.querySelector('#reportForm button[type="submit"]');
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Skickar...' : 'SKICKA RAPPORT';
}

function toggleMissing() {
  document.getElementById('missingSection').classList.toggle('d-none', !document.getElementById('mappNej').checked);
  document.getElementById('successSection').classList.toggle('d-none', !document.getElementById('mappJa').checked);
}

function renderBrister() {
  const rows = defaultBrister.map((brist, index) => {
    const row = document.createElement('div');
    row.className = 'form-check py-2 border-bottom';
    const input = document.createElement('input');
    input.className = 'form-check-input scale-check'; input.type = 'checkbox'; input.value = brist; input.id = `brist${index}`;
    const label = document.createElement('label');
    label.className = 'form-check-label ms-2'; label.htmlFor = input.id; label.textContent = brist;
    row.append(input, label);
    return row;
  });
  document.getElementById('bristContainer').replaceChildren(...rows);
}

function renderSuccessList() {
  const items = defaultBrister.map(point => {
    const item = document.createElement('li');
    item.className = 'list-group-item bg-transparent border-0 py-1 ps-0 text-dark';
    const icon = document.createElement('i'); icon.className = 'fas fa-check text-success me-2';
    item.append(icon, document.createTextNode(point));
    return item;
  });
  document.getElementById('successList').replaceChildren(...items);
}

function populateResidenceSelect(select, residences, firstLabel) {
  const selected = select.value;
  const first = document.createElement('option');
  first.value = ''; first.textContent = firstLabel;
  if (select.id === 'boende') { first.disabled = true; first.selected = true; }
  const options = residences.map(residence => {
    const option = document.createElement('option'); option.value = residence.name; option.textContent = residence.name; return option;
  });
  select.replaceChildren(first, ...options);
  if (residences.some(residence => residence.name === selected)) select.value = selected;
}

async function renderDropdown() {
  const select = document.getElementById('boende');
  try {
    const { residences } = await requestJson('/api/residences');
    populateResidenceSelect(select, residences, 'Välj i listan...');
  } catch (error) {
    const option = document.createElement('option'); option.textContent = 'Kunde inte ladda boenden'; option.disabled = true;
    select.replaceChildren(option); showError(error);
  }
}

function reportPayload() {
  const status = document.querySelector('input[name="rodMapp"]:checked')?.value;
  return {
    boende: document.getElementById('boende').value,
    prio: document.querySelector('input[name="prioDit"]:checked')?.value,
    atgard: document.getElementById('atgard').value,
    mapp_status: status,
    brister: selectedDeficiencies(status, [...document.querySelectorAll('#bristContainer input:checked')].map(input => input.value)),
    fritext: document.getElementById('fritext').value
  };
}

async function handleReportSubmit(event) {
  event.preventDefault(); setLoading(true);
  try {
    await finishReportSubmission(event, () => submitReport(reportPayload()));
    alert('✅ Tack! Rapporten är sparad.');
    document.getElementById('missingSection').classList.add('d-none');
    document.getElementById('successSection').classList.add('d-none');
  } catch (error) { showError(error, 'Rapporten kunde inte sparas.'); }
  finally { setLoading(false); }
}

function setAdminState(authenticated, message = '') {
  document.getElementById('adminLogin').classList.toggle('d-none', authenticated);
  document.getElementById('adminPanel').classList.toggle('d-none', !authenticated);
  const error = document.getElementById('loginError'); error.textContent = message; error.classList.toggle('d-none', !message);
}

async function loadAdmin() { await Promise.all([renderAdminList(), renderAdminBoendeFilter(), fetchStatistics(), fetchReportsList(false)]); }

async function checkSession() {
  try { await requestJson('/api/admin/session'); setAdminState(true); await loadAdmin(); }
  catch (error) { if (error.status !== 401) setAdminState(false, error.message); }
}

async function checkAdmin() {
  const input = document.getElementById('adminPass');
  const button = document.getElementById('adminLoginButton'); button.disabled = true;
  try {
    await requestJson('/api/admin/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
    input.value = ''; setAdminState(true); await loadAdmin();
  } catch (error) { setAdminState(false, error.message); input.select(); }
  finally { button.disabled = false; }
}

async function logoutAdmin() {
  try { await requestJson('/api/admin/session', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: '{}' }); }
  catch (error) { showError(error, 'Det gick inte att logga ut.'); }
  finally { setAdminState(false); }
}

async function renderAdminList() {
  const list = document.getElementById('adminBoendeList');
  list.innerHTML = '<li class="list-group-item">Laddar lista...</li>';
  try {
    const { residences } = await requestJson('/api/admin/residences');
    list.replaceChildren(...residences.map(residence => {
      const item = document.createElement('li'); item.className = 'list-group-item d-flex justify-content-between align-items-center';
      item.append(document.createTextNode(residence.name));
      const button = document.createElement('button'); button.className = 'btn btn-sm btn-outline-danger'; button.textContent = 'Ta bort';
      button.addEventListener('click', () => removeBoende(residence.id)); item.append(button); return item;
    }));
  } catch (error) { list.innerHTML = `<li class="list-group-item text-danger">${escapeHtml(error.message)}</li>`; }
}

async function renderAdminBoendeFilter() {
  try {
    const { residences } = await requestJson('/api/admin/residences');
    populateResidenceSelect(document.getElementById('filterBoende'), residences, 'Alla boenden');
  } catch (error) { showError(error); }
}

async function addBoende() {
  const input = document.getElementById('newBoendeInput'); const name = input.value.trim();
  if (!name) return showError(new Error('Skriv ett namn.'));
  try {
    await requestJson('/api/admin/residences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) });
    input.value = ''; await Promise.all([renderAdminList(), renderDropdown(), renderAdminBoendeFilter()]);
  } catch (error) { showError(error); }
}

async function removeBoende(id) {
  if (!confirm('Ta bort detta boende?')) return;
  try {
    await requestJson('/api/admin/residences', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    await Promise.all([renderAdminList(), renderDropdown(), renderAdminBoendeFilter()]);
  } catch (error) { showError(error); }
}

async function fetchStatistics() {
  const list = document.getElementById('statBristerList'); list.innerHTML = '<li class="list-group-item">Hämtar data...</li>';
  try {
    const stats = await requestJson('/api/admin/statistics');
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statKomplett').textContent = stats.total ? `${stats.completePercent}%` : '-';
    const entries = Object.entries(stats.missing).sort((a, b) => b[1] - a[1]);
    list.innerHTML = entries.length
      ? entries.map(([name, count]) => `<li class="list-group-item d-flex justify-content-between align-items-center">${escapeHtml(name)} <span class="badge bg-danger rounded-pill">${count} (${stats.total ? Math.round(count / stats.total * 100) : 0}%)</span></li>`).join('')
      : '<li class="list-group-item text-success">Inga brister!</li>';
  } catch (error) { list.innerHTML = `<li class="list-group-item text-danger">${escapeHtml(error.message)}</li>`; }
}

function readFilterFromUI() {
  currentFilter = { boende: document.getElementById('filterBoende').value || '', fromDate: document.getElementById('filterFrom').value || '', toDate: document.getElementById('filterTo').value || '' };
  document.getElementById('printBoendeBtn').disabled = !currentFilter.boende;
}

async function applyReportFilter() { readFilterFromUI(); await fetchReportsList(false); }
async function clearReportFilter() {
  document.getElementById('filterBoende').value = ''; document.getElementById('filterFrom').value = ''; document.getElementById('filterTo').value = '';
  await applyReportFilter();
}

function reportHtml(report) {
  const date = new Date(report.created_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const mapBadge = report.mapp_status === 'JA' ? '<span class="badge bg-success">Mapp OK</span>' : '<span class="badge bg-danger">Mapp Brist</span>';
  const missing = report.brister && report.mapp_status === 'NEJ' ? `<div class="small text-danger mt-1"><strong>Saknades:</strong> ${escapeHtml(report.brister)}</div>` : '';
  const notes = report.fritext ? `<div class="mt-2 p-2 bg-light border-start border-4 border-info rounded small"><em>”${escapeHtml(report.fritext)}”</em></div>` : '';
  return `<div class="d-flex justify-content-between align-items-start mb-1"><h6 class="mb-0 fw-bold">${escapeHtml(report.boende)}</h6><small class="text-muted">${escapeHtml(date)}</small></div><div class="mb-2">${mapBadge}<span class="badge border text-dark ms-1">Prio ${escapeHtml(report.prio)}</span><span class="badge border text-dark ms-1">${escapeHtml(report.atgard)}</span></div>${missing}${notes}`;
}

async function fetchReportsList(append = false) {
  const list = document.getElementById('individualReportsList'); const count = document.getElementById('reportCountBadge'); const loadMore = document.getElementById('loadMoreContainer');
  const loadMoreButton = document.getElementById('loadMoreBtn');
  const requestToken = reportRequestGate.start(append);
  if (requestToken === null) return;
  loadMoreButton.disabled = true;
  if (!append) {
    reportsLoaded = 0; reportsTotal = 0; list.innerHTML = '<div class="text-center p-3 text-muted">Laddar rapporter...</div>';
    loadMore.classList.add('d-none');
  } else loadMoreButton.textContent = 'Laddar...';
  try {
    const result = await requestJson(buildReportsUrl(currentFilter, REPORTS_PAGE_SIZE, reportsLoaded));
    if (!reportRequestGate.isCurrent(requestToken)) return;
    if (!append) list.replaceChildren();
    for (const report of result.reports) { const item = document.createElement('div'); item.className = 'list-group-item p-3'; item.innerHTML = reportHtml(report); list.append(item); }
    reportsLoaded += result.reports.length; reportsTotal = result.total;
    if (!reportsLoaded) list.innerHTML = '<div class="p-3 text-center text-muted">Inga rapporter inskickade än.</div>';
    count.textContent = reportsLoaded ? `Visar ${reportsLoaded} av ${reportsTotal} st` : '0 st';
    loadMore.classList.toggle('d-none', reportsLoaded >= reportsTotal);
    if (reportsLoaded < reportsTotal) {
      const remaining = reportsTotal - reportsLoaded;
      loadMoreButton.textContent = `Ladda fler (${Math.min(REPORTS_PAGE_SIZE, remaining)} av ${remaining} kvar)`;
    }
  } catch (error) {
    if (!reportRequestGate.isCurrent(requestToken)) return;
    if (error.status === 401) setAdminState(false, 'Administratörssessionen har gått ut. Logga in igen.');
    else if (!append) list.innerHTML = `<div class="p-3 text-danger">${escapeHtml(error.message)}</div>`;
    else showError(error);
  } finally {
    reportRequestGate.finish(requestToken);
    if (reportRequestGate.isCurrent(requestToken)) loadMoreButton.disabled = false;
  }
}

async function loadMoreReports() { await fetchReportsList(true); }

function computeSummary(data) {
  const total = data.length; const complete = data.filter(report => report.mapp_status === 'JA').length;
  const prio = { 1: 0, 2: 0, 3: 0 }; const actions = {}; const missing = {};
  for (const report of data) {
    if (prio[report.prio] !== undefined) prio[report.prio] += 1;
    if (report.atgard) actions[report.atgard] = (actions[report.atgard] || 0) + 1;
    if (report.mapp_status === 'NEJ' && report.brister) for (const item of report.brister.split(',')) { const clean = item.trim(); if (clean) missing[clean] = (missing[clean] || 0) + 1; }
  }
  return { total, completePercent: total ? Math.round(complete / total * 100) : 0, prio, actions, missing };
}

async function fetchAllReportsForPrint(filter) {
  const all = []; let offset = 0;
  while (true) {
    const page = await requestJson(buildReportsUrl(filter, 1000, offset)); all.push(...page.reports); offset += page.reports.length;
    if (offset >= page.total || !page.reports.length) return all;
  }
}

function buildPrintHtml(data, title, filterInfo) {
  const summary = computeSummary(data);
  const actions = Object.entries(summary.actions).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td></tr>`).join('');
  const missing = Object.entries(summary.missing).sort((a, b) => b[1] - a[1]).map(([name, count]) => `<tr><td>${escapeHtml(name)}</td><td>${count}</td><td>${summary.total ? Math.round(count / summary.total * 100) : 0}%</td></tr>`).join('') || '<tr><td colspan="3">Inga brister registrerade.</td></tr>';
  const groups = Object.groupBy(data, report => report.boende?.trim() || 'Okänt boende');
  const details = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'sv')).map(name => {
    const reports = groups[name].toSorted((a, b) => new Date(b.created_at) - new Date(a.created_at)); const complete = reports.filter(report => report.mapp_status === 'JA').length;
    return `<div class="boende-grupp"><h3 class="boende-rubrik">${escapeHtml(name)} <span class="meta">— ${reports.length} rapporter · ${reports.length ? Math.round(complete / reports.length * 100) : 0}% kompletta mappar</span></h3>${reports.map(report => `<div class="print-report"><h3 class="report-datum">${escapeHtml(new Date(report.created_at).toLocaleString('sv-SE'))}</h3><div><span class="badge-print ${report.mapp_status === 'JA' ? 'mapp-ok' : 'mapp-brist'}">${report.mapp_status === 'JA' ? 'Mapp OK' : 'Mapp Brist'}</span><span class="badge-print">Prio ${escapeHtml(report.prio)}</span><span class="badge-print">${escapeHtml(report.atgard)}</span></div>${report.mapp_status === 'NEJ' && report.brister ? `<div class="saknades"><strong>Saknades:</strong> ${escapeHtml(report.brister)}</div>` : ''}${report.fritext ? `<div class="fritext">”${escapeHtml(report.fritext)}”</div>` : ''}</div>`).join('')}</div>`;
  }).join('');
  return `<h1>🚑 SÄBO-kollen — ${escapeHtml(title)}</h1><div class="meta">${escapeHtml(filterInfo)} · Skapad ${escapeHtml(new Date().toLocaleString('sv-SE'))}</div><h2>Översikt</h2><table><tr><th>Rapporter</th><th>Kompletta mappar</th><th>Prio 1</th><th>Prio 2</th><th>Prio 3</th></tr><tr><td>${summary.total}</td><td>${summary.completePercent}%</td><td>${summary.prio[1]}</td><td>${summary.prio[2]}</td><td>${summary.prio[3]}</td></tr></table><h2>Åtgärder</h2><table><tr><th>Åtgärd</th><th>Antal</th></tr>${actions}</table><h2>Brister</h2><table><tr><th>Brist</th><th>Antal</th><th>Andel</th></tr>${missing}</table><h2>Detaljerade rapporter</h2>${details || '<p>Inga rapporter i urvalet.</p>'}`;
}

async function printSummary(onlyResidence) {
  readFilterFromUI(); if (onlyResidence && !currentFilter.boende) return showError(new Error('Välj ett boende först.'));
  try {
    const printFilter = filterForPrint(currentFilter, onlyResidence);
    const data = await fetchAllReportsForPrint(printFilter);
    const parts = [printFilter.boende ? `Boende: ${printFilter.boende}` : 'Boende: alla'];
    parts.push(printFilter.fromDate || printFilter.toDate ? `Period: ${printFilter.fromDate || '…'} till ${printFilter.toDate || '…'}` : 'Period: alla datum');
    document.getElementById('printView').innerHTML = buildPrintHtml(data, onlyResidence ? printFilter.boende : 'Sammanställning', parts.join(' · ')); window.print();
  } catch (error) { showError(error, 'Underlaget kunde inte hämtas.'); }
}

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(element => element.classList.add('d-none'));
  document.querySelectorAll('.nav-btn').forEach(element => element.classList.remove('active'));
  document.getElementById(tabId).classList.remove('d-none');
  document.querySelectorAll('.nav-btn')[{ rapportTab: 0, infoTab: 1, adminTab: 2 }[tabId]]?.classList.add('active');
}

if (typeof document !== 'undefined') {
  Object.assign(window, { showTab, checkAdmin, logoutAdmin, addBoende, removeBoende, fetchStatistics, applyReportFilter, clearReportFilter, loadMoreReports, printSummary });
  document.addEventListener('DOMContentLoaded', () => {
    renderBrister(); renderSuccessList(); renderDropdown(); checkSession();
    document.getElementById('mappJa').addEventListener('change', toggleMissing);
    document.getElementById('mappNej').addEventListener('change', toggleMissing);
    document.getElementById('reportForm').addEventListener('submit', handleReportSubmit);
    document.getElementById('adminPass').addEventListener('keydown', event => { if (event.key === 'Enter') checkAdmin(); });
  });
}
