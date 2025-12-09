// --- KONFIGURATION ---
const SUPABASE_URL = 'DIN_SUPABASE_URL_HÄR';
const SUPABASE_KEY = 'DIN_ANON_KEY_HÄR';

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
    }
}

async function removeBoende(id) {
    if(!confirm("Ta bort detta boende?")) return;
    const { error } = await db.from('boenden').delete().eq('id', id);
    if (!error) { renderAdminList(); renderDropdown(); }
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

// NYTT: Hämta lista med rapporter
async function fetchReportsList() {
    const listContainer = document.getElementById('individualReportsList');
    const countBadge = document.getElementById('reportCountBadge');
    
    const { data, error } = await db
        .from('rapporter')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        listContainer.innerHTML = `<div class="p-3 text-danger">Kunde inte hämta lista: ${error.message}</div>`;
        return;
    }

    if (!data || data.length === 0) {
        listContainer.innerHTML = `<div class="p-3 text-center text-muted">Inga rapporter inskickade än.</div>`;
        countBadge.innerText = "0 st";
        return;
    }

    countBadge.innerText = data.length + " st (Visar 50 senaste)";
    listContainer.innerHTML = '';

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
        fetchStatistics();
        fetchReportsList(); // Hämta individuella rapporter
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
