// --- KONFIGURATION ---
const SUPABASE_URL = 'https://seeahrjwakvyinwmndwa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZWFocmp3YWt2eWlud21uZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjUwOTcsImV4cCI6MjA4MDUwMTA5N30.xqMWlFIaOdqqKpGh_SFAmaT0rTEE7oy0muxFauW8SiY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Standardpunkter
const defaultBrister = ["Läkemedelslista", "Medföljandeblankett", "ID-band", "0-HLR Beslut", "Bemötandeplan"];

// --- APP START ---
document.addEventListener('DOMContentLoaded', function() {
    renderDropdown(); 
    renderBrister();     
    renderSuccessList(); 
    setupEventListeners();
    fetchStatistics(); 

    // SKICKA RAPPORT
    document.getElementById('reportForm').addEventListener('submit', async function(event) {
        event.preventDefault();
        setLoading(true); 
        
        const boende = document.getElementById('boende').value;
        const prio = document.querySelector('input[name="prioDit"]:checked').value;
        const atgard = document.getElementById('atgard').value;
        const mapp_status = document.querySelector('input[name="rodMapp"]:checked').value;
        const fritext = document.getElementById('fritext').value;
        
        let bristerArr = [];
        if (mapp_status === 'NEJ') {
            document.querySelectorAll('#bristContainer input:checked').forEach((checkbox) => {
                bristerArr.push(checkbox.value);
            });
        }
        const brister = bristerArr.join(", ");

        const { error } = await db
            .from('rapporter')
            .insert([{ boende, prio, atgard, mapp_status, brister, fritext }]);

        setLoading(false);

        if (error) {
            alert("Fel: " + error.message);
        } else {
            alert("✅ Tack! Rapporten är sparad.");
            this.reset();
            document.getElementById('missingSection').classList.add('d-none');
            document.getElementById('successSection').classList.add('d-none');
        }
    });
});

// --- UI-FUNKTIONER ---

function toggleMissing() {
    const radioNej = document.getElementById('mappNej');
    const radioJa = document.getElementById('mappJa');
    const missingSection = document.getElementById('missingSection');
    const successSection = document.getElementById('successSection');

    missingSection.classList.add('d-none');
    successSection.classList.add('d-none');

    if (radioNej && radioNej.checked) {
        missingSection.classList.remove('d-none');
    } 
    else if (radioJa && radioJa.checked) {
        successSection.classList.remove('d-none');
    }
}

function renderSuccessList() {
    const list = document.getElementById('successList');
    list.innerHTML = '';
    defaultBrister.forEach((punkt) => {
        const li = document.createElement('li');
        li.className = "list-group-item bg-transparent border-0 py-1 ps-0 text-dark";
        li.innerHTML = `<i class="fas fa-check text-success me-2"></i> ${punkt}`;
        list.appendChild(li);
    });
}

function renderBrister() {
    const container = document.getElementById('bristContainer');
    container.innerHTML = '';
    defaultBrister.forEach((brist, index) => {
        const div = document.createElement('div');
        div.className = "form-check py-2 border-bottom";
        div.innerHTML = `
            <input class="form-check-input scale-check" type="checkbox" value="${brist}" id="brist${index}">
            <label class="form-check-label ms-2" for="brist${index}">${brist}</label>
        `;
        container.appendChild(div);
    });
}

// --- BOENDE & ADMIN ---

async function renderDropdown() {
    const select = document.getElementById('boende');
    const { data, error } = await db.from('boenden').select('*').order('namn', { ascending: true });

    if (!error && data) {
        select.innerHTML = '<option value="" selected disabled>Välj i listan...</option>';
        data.forEach(rad => {
            const opt = document.createElement('option');
            opt.value = rad.namn;
            opt.textContent = rad.namn;
            select.appendChild(opt);
        });
    }
}

async function renderAdminList() {
    const list = document.getElementById('adminBoendeList');
    list.innerHTML = '<li class="list-group-item">Laddar lista...</li>';

    const { data } = await db.from('boenden').select('*').order('namn', { ascending: true });
        
    if (data) {
        list.innerHTML = '';
        data.forEach(rad => {
            const li = document.createElement('li');
            li.className = "list-group-item d-flex justify-content-between align-items-center";
            li.innerHTML = `${rad.namn} <button class="btn btn-sm btn-outline-danger" onclick="removeBoende(${rad.id})">Ta bort</button>`;
            list.appendChild(li);
        });
    }
}

async function addBoende() {
    const input = document.getElementById('newBoendeInput');
    const namn = input.value.trim();
    if (!namn) { alert("Skriv ett namn!"); return; }

    const { error } = await db.from('boenden').insert([{ namn: namn }]);
    if (error) { alert("Fel: " + error.message); }
    else {
        alert("✅ Boende tillagt!");
        input.value = '';
        renderAdminList();
        renderDropdown();
        renderAdminBoendeFilter();
    }
}

async function removeBoende(id) {
    if(!confirm("Ta bort detta boende?")) return;
    const { error } = await db.from('boenden').delete().eq('id', id);
    if (!error) { renderAdminList(); renderDropdown(); renderAdminBoendeFilter(); }
}

// --- ÖVRIGT (Stats & Login) ---

async function fetchStatistics() {
    if(document.getElementById('adminPanel').classList.contains('d-none')) return;
    
    const totalEl = document.getElementById('statTotal');
    const procentEl = document.getElementById('statKomplett');
    const listEl = document.getElementById('statBristerList');
    listEl.innerHTML = '<li class="list-group-item">Hämtar data...</li>';

    const { data } = await db.from('rapporter').select('*');

    if (!data || data.length === 0) {
        totalEl.innerText = "0"; procentEl.innerText = "-"; 
        listEl.innerHTML = '<li class="list-group-item">Inga rapporter än.</li>';
        return;
    }

    const totalCount = data.length;
    totalEl.innerText = totalCount;
    const komplettaCount = data.filter(rad => rad.mapp_status === 'JA').length;
    procentEl.innerText = Math.round((komplettaCount / totalCount) * 100) + "%";

    let bristRaknare = {};
    data.forEach(rad => {
        if (rad.brister && rad.mapp_status === 'NEJ') {
            rad.brister.split(',').forEach(item => {
                let clean = item.trim();
                if (clean) bristRaknare[clean] = (bristRaknare[clean] || 0) + 1;
            });
        }
    });

    const sorterade = Object.entries(bristRaknare).sort((a, b) => b[1] - a[1]);
    listEl.innerHTML = '';
    
    if (sorterade.length === 0) listEl.innerHTML = '<li class="list-group-item text-success">Inga brister!</li>';
    else {
        sorterade.forEach(([brist, antal]) => {
            const proc = Math.round((antal / totalCount) * 100);
            listEl.innerHTML += `<li class="list-group-item d-flex justify-content-between align-items-center">${brist} <span class="badge bg-danger rounded-pill">${antal} (${proc}%)</span></li>`;
        });
    }
}

// NYTT: Hämta lista med rapporter (med paginering + filter)
const REPORTS_PAGE_SIZE = 50;
let reportsLoaded = 0;
let reportsTotal = 0;
let currentFilter = { boende: '', fromDate: '', toDate: '' };

function buildReportsQuery(selectExpr = '*', selectOpts = undefined) {
    let q = selectOpts ? db.from('rapporter').select(selectExpr, selectOpts)
                       : db.from('rapporter').select(selectExpr);
    if (currentFilter.boende) q = q.eq('boende', currentFilter.boende);
    if (currentFilter.fromDate) q = q.gte('created_at', currentFilter.fromDate + 'T00:00:00');
    if (currentFilter.toDate)   q = q.lte('created_at', currentFilter.toDate   + 'T23:59:59');
    return q;
}

async function renderAdminBoendeFilter() {
    const sel = document.getElementById('filterBoende');
    if (!sel) return;
    const { data } = await db.from('boenden').select('*').order('namn', { ascending: true });
    if (!data) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">Alla boenden</option>';
    data.forEach(rad => {
        const opt = document.createElement('option');
        opt.value = rad.namn;
        opt.textContent = rad.namn;
        sel.appendChild(opt);
    });
    sel.value = current;
}

function readFilterFromUI() {
    currentFilter.boende   = document.getElementById('filterBoende').value || '';
    currentFilter.fromDate = document.getElementById('filterFrom').value || '';
    currentFilter.toDate   = document.getElementById('filterTo').value || '';
    const btn = document.getElementById('printBoendeBtn');
    if (btn) btn.disabled = !currentFilter.boende;
}

function applyReportFilter() {
    readFilterFromUI();
    fetchReportsList(false);
}

function clearReportFilter() {
    document.getElementById('filterBoende').value = '';
    document.getElementById('filterFrom').value = '';
    document.getElementById('filterTo').value = '';
    applyReportFilter();
}

async function fetchReportsList(append = false) {
    const listContainer = document.getElementById('individualReportsList');
    const countBadge = document.getElementById('reportCountBadge');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const loadMoreBtn = document.getElementById('loadMoreBtn');

    if (!append) {
        reportsLoaded = 0;
        reportsTotal = 0;
        listContainer.innerHTML = `<div class="text-center p-3 text-muted">Laddar rapporter...</div>`;
        loadMoreContainer.classList.add('d-none');
    } else {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = "Laddar...";
    }

    const from = reportsLoaded;
    const to = reportsLoaded + REPORTS_PAGE_SIZE - 1;

    const { data, error, count } = await buildReportsQuery('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) {
        if (!append) {
            listContainer.innerHTML = `<div class="p-3 text-danger">Kunde inte hämta lista: ${error.message}</div>`;
        } else {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = "Ladda fler rapporter";
            alert("Kunde inte hämta fler rapporter: " + error.message);
        }
        return;
    }

    if (typeof count === 'number') reportsTotal = count;

    if (!append) {
        if (!data || data.length === 0) {
            listContainer.innerHTML = `<div class="p-3 text-center text-muted">Inga rapporter inskickade än.</div>`;
            countBadge.innerText = "0 st";
            loadMoreContainer.classList.add('d-none');
            return;
        }
        listContainer.innerHTML = '';
    }

    data.forEach(rad => {
        const datum = new Date(rad.created_at).toLocaleString('sv-SE', {
            month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'
        });

        const mappIkon = rad.mapp_status === 'JA'
            ? '<span class="badge bg-success">Mapp OK</span>'
            : '<span class="badge bg-danger">Mapp Brist</span>';

        let bristHtml = '';
        if (rad.brister && rad.mapp_status === 'NEJ') {
            bristHtml = `<div class="small text-danger mt-1"><strong>Saknades:</strong> ${rad.brister}</div>`;
        }

        let fritextHtml = '';
        if (rad.fritext) {
            fritextHtml = `
                <div class="mt-2 p-2 bg-light border-start border-4 border-info rounded small">
                    <em>"${rad.fritext}"</em>
                </div>`;
        }

        const item = document.createElement('div');
        item.className = "list-group-item p-3";
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-start mb-1">
                <h6 class="mb-0 fw-bold">${rad.boende}</h6>
                <small class="text-muted" style="font-size:0.75rem;">${datum}</small>
            </div>

            <div class="mb-2">
                ${mappIkon}
                <span class="badge border text-dark ms-1">Prio ${rad.prio}</span>
                <span class="badge border text-dark ms-1">${rad.atgard}</span>
            </div>

            ${bristHtml}
            ${fritextHtml}
        `;
        listContainer.appendChild(item);
    });

    reportsLoaded += data.length;

    countBadge.innerText = `Visar ${reportsLoaded} av ${reportsTotal} st`;

    if (reportsLoaded < reportsTotal) {
        loadMoreContainer.classList.remove('d-none');
        loadMoreBtn.disabled = false;
        const remaining = reportsTotal - reportsLoaded;
        const nextChunk = Math.min(REPORTS_PAGE_SIZE, remaining);
        loadMoreBtn.textContent = `Ladda fler (${nextChunk} av ${remaining} kvar)`;
    } else {
        loadMoreContainer.classList.add('d-none');
    }
}

function loadMoreReports() {
    fetchReportsList(true);
}

function setupEventListeners() {
    const radioJa = document.getElementById('mappJa');
    const radioNej = document.getElementById('mappNej');
    if(radioJa) {
        radioJa.addEventListener('change', toggleMissing);
        radioNej.addEventListener('change', toggleMissing);
    }
    window.showTab = function(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('d-none'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.remove('d-none');
        
        const btns = document.querySelectorAll('.nav-btn');
        if(tabId === 'rapportTab') btns[0].classList.add('active');
        if(tabId === 'infoTab') btns[1].classList.add('active');
        if(tabId === 'adminTab') btns[2].classList.add('active');
    };
}

function setLoading(isLoading) {
    const btn = document.querySelector('button[type="submit"]');
    if (isLoading) { btn.disabled = true; btn.textContent = "Skickar..."; }
    else { btn.disabled = false; btn.textContent = "SKICKA RAPPORT"; }
}

function checkAdmin() {
    const passInput = document.getElementById('adminPass');
    const errorMsg = document.getElementById('loginError');
    errorMsg.classList.add('d-none');

    if (passInput.value.trim() === "nettan112") {
        document.getElementById('adminLogin').classList.add('d-none');
        document.getElementById('adminPanel').classList.remove('d-none');
        passInput.value = '';
        renderAdminList();
        renderAdminBoendeFilter();
        fetchStatistics();
        fetchReportsList();
    } else {
        errorMsg.classList.remove('d-none');
        passInput.select(); 
    }
}

function logoutAdmin() {
    document.getElementById('adminPass').value = '';
    document.getElementById('adminPanel').classList.add('d-none');
    document.getElementById('adminLogin').classList.remove('d-none');
}

// --- PDF-SAMMANFATTNING (via browserns utskrift) ---

async function fetchAllReportsForPrint() {
    const CHUNK = 1000;
    let all = [];
    let from = 0;
    while (true) {
        const { data, error } = await buildReportsQuery('*')
            .order('created_at', { ascending: false })
            .range(from, from + CHUNK - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < CHUNK) break;
        from += CHUNK;
    }
    return all;
}

function computeSummary(data) {
    const total = data.length;
    const komplett = data.filter(r => r.mapp_status === 'JA').length;
    const prio = { '1': 0, '2': 0, '3': 0 };
    const atgard = {};
    const brister = {};
    data.forEach(r => {
        if (prio[r.prio] !== undefined) prio[r.prio]++;
        if (r.atgard) atgard[r.atgard] = (atgard[r.atgard] || 0) + 1;
        if (r.mapp_status === 'NEJ' && r.brister) {
            r.brister.split(',').forEach(b => {
                const clean = b.trim();
                if (clean) brister[clean] = (brister[clean] || 0) + 1;
            });
        }
    });
    return {
        total,
        komplett,
        komplettPct: total ? Math.round((komplett / total) * 100) : 0,
        prio,
        atgard,
        topBrister: Object.entries(brister).sort((a, b) => b[1] - a[1])
    };
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function buildPrintHtml(data, title, filterInfo) {
    const s = computeSummary(data);
    const now = new Date().toLocaleString('sv-SE', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const atgardRows = Object.entries(s.atgard)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${v}</td></tr>`).join('');

    const bristRows = s.topBrister.length
        ? s.topBrister.map(([b, n]) => {
            const pct = s.total ? Math.round((n / s.total) * 100) : 0;
            return `<tr><td>${escapeHtml(b)}</td><td>${n}</td><td>${pct}%</td></tr>`;
        }).join('')
        : `<tr><td colspan="3">Inga brister registrerade.</td></tr>`;

    // Rendera en enskild rapport (utan boende-namn — det står i gruppens rubrik)
    const renderReport = r => {
        const datum = new Date(r.created_at).toLocaleString('sv-SE', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        const mappCls = r.mapp_status === 'JA' ? 'mapp-ok' : 'mapp-brist';
        const mappTxt = r.mapp_status === 'JA' ? 'Mapp OK' : 'Mapp Brist';
        const saknades = (r.mapp_status === 'NEJ' && r.brister)
            ? `<div class="saknades"><strong>Saknades:</strong> ${escapeHtml(r.brister)}</div>` : '';
        const fritext = r.fritext
            ? `<div class="fritext">"${escapeHtml(r.fritext)}"</div>` : '';
        return `
            <div class="print-report">
                <h3 class="report-datum">${datum}</h3>
                <div>
                    <span class="badge-print ${mappCls}">${mappTxt}</span>
                    <span class="badge-print">Prio ${escapeHtml(r.prio)}</span>
                    <span class="badge-print">${escapeHtml(r.atgard || '')}</span>
                </div>
                ${saknades}
                ${fritext}
            </div>`;
    };

    // Gruppera de detaljerade rapporterna per boende (A–Ö),
    // inom varje boende sorterat efter datum (nyast först).
    const grupper = {};
    data.forEach(r => {
        const key = (r.boende && r.boende.trim()) ? r.boende : 'Okänt boende';
        (grupper[key] = grupper[key] || []).push(r);
    });
    const sorteradeBoenden = Object.keys(grupper)
        .sort((a, b) => a.localeCompare(b, 'sv'));

    const reportRows = sorteradeBoenden.map(boende => {
        const rader = grupper[boende].sort(
            (a, b) => new Date(b.created_at) - new Date(a.created_at)
        );
        const komplett = rader.filter(r => r.mapp_status === 'JA').length;
        const komplettPct = rader.length ? Math.round((komplett / rader.length) * 100) : 0;
        return `
            <div class="boende-grupp">
                <h3 class="boende-rubrik">${escapeHtml(boende)}
                    <span class="meta">— ${rader.length} rapporter · ${komplettPct}% kompletta mappar</span>
                </h3>
                ${rader.map(renderReport).join('')}
            </div>`;
    }).join('');

    return `
        <h1>🚑 SÄBO-kollen — ${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(filterInfo)}</div>
        <div class="meta">Utskriven: ${now}</div>

        <h2>Sammanfattning</h2>
        <table>
            <tr><th>Totalt antal rapporter</th><td>${s.total}</td></tr>
            <tr><th>Helt kompletta mappar</th><td>${s.komplett} (${s.komplettPct}%)</td></tr>
            <tr><th>Prio 1 / 2 / 3</th><td>${s.prio['1']} / ${s.prio['2']} / ${s.prio['3']}</td></tr>
        </table>

        <h2>Åtgärd / destination</h2>
        <table>
            <thead><tr><th>Åtgärd</th><th>Antal</th></tr></thead>
            <tbody>${atgardRows || '<tr><td colspan="2">-</td></tr>'}</tbody>
        </table>

        <h2>Vanligaste bristerna</h2>
        <table>
            <thead><tr><th>Brist</th><th>Antal</th><th>Andel</th></tr></thead>
            <tbody>${bristRows}</tbody>
        </table>

        <h2>Detaljerade rapporter — sorterade per boende (${s.total} st)</h2>
        ${reportRows || '<p>Inga rapporter matchar filtret.</p>'}
    `;
}

async function printSummary(onlyBoende) {
    readFilterFromUI();
    if (onlyBoende && !currentFilter.boende) {
        alert("Välj ett boende i filtret först.");
        return;
    }

    // "Endast valt boende" ignorerar datumfilter — hela historiken för boendet.
    const savedFilter = { ...currentFilter };
    if (onlyBoende) {
        currentFilter = { boende: savedFilter.boende, fromDate: '', toDate: '' };
    }

    const printView = document.getElementById('printView');
    printView.innerHTML = `<h1>Förbereder utskrift...</h1>`;

    let data;
    try {
        data = await fetchAllReportsForPrint();
    } catch (e) {
        currentFilter = savedFilter;
        alert("Kunde inte hämta data för utskrift: " + e.message);
        return;
    }

    const title = currentFilter.boende
        ? `Sammanställning — ${currentFilter.boende}`
        : `Sammanställning (alla boenden)`;

    const parts = [];
    parts.push(currentFilter.boende ? `Boende: ${currentFilter.boende}` : "Boende: alla");
    if (currentFilter.fromDate || currentFilter.toDate) {
        parts.push(`Period: ${currentFilter.fromDate || '…'} till ${currentFilter.toDate || '…'}`);
    } else {
        parts.push("Period: alla datum");
    }
    const filterInfo = parts.join(" · ");

    printView.innerHTML = buildPrintHtml(data, title, filterInfo);
    window.print();

    currentFilter = savedFilter;
}
