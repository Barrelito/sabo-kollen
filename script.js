// --- KONFIGURATION ---
// Byt ut dessa mot dina uppgifter från Supabase Project Settings > API
const SUPABASE_URL = 'https://seeahrjwakvyinwmndwa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZWFocmp3YWt2eWlud21uZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjUwOTcsImV4cCI6MjA4MDUwMTA5N30.xqMWlFIaOdqqKpGh_SFAmaT0rTEE7oy0muxFauW8SiY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Standardbrister (Dessa kan vi ha kvar i koden för enkelhets skull)
const defaultBrister = ["Läkemedelslista", "Medföljandeblankett", "ID-band", "0-HLR Beslut", "Bemötandeplan"];

// --- APP START ---
document.addEventListener('DOMContentLoaded', function() {
    renderDropdown(); // Hämta boenden från DB
    renderBrister();
    setupEventListeners();
    fetchStatistics(); // Hämta stats om man är inloggad admin

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
        document.querySelectorAll('#bristContainer input:checked').forEach((checkbox) => {
            bristerArr.push(checkbox.value);
        });
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
            toggleMissing();
        }
    });
});

// --- BOENDE-LISTA FRÅN DB ---

async function renderDropdown() {
    const select = document.getElementById('boende');
    // Behåll "Välj..." och "Laddar..." tills vi fått svar
    
    const { data, error } = await db
        .from('boenden')
        .select('*')
        .order('namn', { ascending: true });

    if (error) {
        console.error("Kunde inte hämta boenden:", error);
        return;
    }

    // Töm och fyll på
    select.innerHTML = '<option value="" selected disabled>Välj i listan...</option>';
    data.forEach(rad => {
        const opt = document.createElement('option');
        opt.value = rad.namn;
        opt.textContent = rad.namn;
        select.appendChild(opt);
    });
}

// --- ADMIN: HANTERA BOENDEN (DB) ---

async function renderAdminList() {
    const list = document.getElementById('adminBoendeList');
    list.innerHTML = '<li class="list-group-item">Laddar lista...</li>';

    const { data, error } = await db
        .from('boenden')
        .select('*')
        .order('namn', { ascending: true });
        
    if (data) {
        list.innerHTML = '';
        data.forEach(rad => {
            const li = document.createElement('li');
            li.className = "list-group-item d-flex justify-content-between align-items-center";
            // Vi skickar med ID för att kunna ta bort rätt rad
            li.innerHTML = `${rad.namn} <button class="btn btn-sm btn-outline-danger" onclick="removeBoende(${rad.id})">Ta bort</button>`;
            list.appendChild(li);
        });
    }
}

async function addBoende() {
    const input = document.getElementById('newBoendeInput');
    const namn = input.value.trim();
    
    if (!namn) {
        alert("Du måste skriva ett namn först!");
        return;
    }

    console.log("Försöker spara:", namn); // För felsökning (F12)

    // Notera: .select() på slutet hjälper ibland att bekräfta insättningen
    const { data, error } = await db
        .from('boenden')
        .insert([{ namn: namn }])
        .select();

    if (error) {
        console.error("Supabase Error:", error);
        alert("Kunde inte spara! Felkod: " + error.message + "\n(Tips: Kolla att RLS är avstängt i Supabase)");
    } else {
        console.log("Sparat lyckat:", data);
        alert("✅ Boendet '" + namn + "' är tillagt!");
        input.value = '';
        renderAdminList(); 
        renderDropdown(); 
    }
}

async function removeBoende(id) {
    if(!confirm("Är du säker på att du vill ta bort detta boende?")) return;

    const { error } = await db
        .from('boenden')
        .delete()
        .eq('id', id);

    if (error) {
        alert("Fel: " + error.message);
    } else {
        renderAdminList();
        renderDropdown();
    }
}

// --- ÖVRIGT (Stats & UI) ---

async function fetchStatistics() {
    // Bara kör om vi faktiskt ser admin-panelen
    if(document.getElementById('adminPanel').classList.contains('d-none')) return;

    const totalEl = document.getElementById('statTotal');
    const procentEl = document.getElementById('statKomplett');
    const listEl = document.getElementById('statBristerList');
    
    listEl.innerHTML = '<li class="list-group-item">Hämtar data...</li>';

    const { data, error } = await db.from('rapporter').select('*');

    if (!data || data.length === 0) {
        totalEl.innerText = "0";
        procentEl.innerText = "-";
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
    
    if (sorterade.length === 0) {
        listEl.innerHTML = '<li class="list-group-item text-success">Inga brister!</li>';
    } else {
        sorterade.forEach(([brist, antal]) => {
            const proc = Math.round((antal / totalCount) * 100);
            listEl.innerHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${brist} <span class="badge bg-danger rounded-pill">${antal} (${proc}%)</span>
                </li>`;
        });
    }
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

function toggleMissing() {
    const radioNej = document.getElementById('mappNej');
    const missingSection = document.getElementById('missingSection');
    if (radioNej && radioNej.checked) missingSection.classList.remove('d-none');
    else missingSection.classList.add('d-none');
}

function setLoading(isLoading) {
    const btn = document.querySelector('button[type="submit"]');
    if (isLoading) {
        btn.disabled = true;
        btn.textContent = "Skickar...";
    } else {
        btn.disabled = false;
        btn.textContent = "SKICKA RAPPORT";
    }
}

function checkAdmin() {
    const pass = document.getElementById('adminPass').value;
    if (pass === "nettan123") {
        document.getElementById('adminLogin').classList.add('d-none');
        document.getElementById('adminPanel').classList.remove('d-none');
        renderAdminList(); 
        fetchStatistics(); 
    } else {
        document.getElementById('loginError').classList.remove('d-none');
    }
}

function logoutAdmin() {
    document.getElementById('adminPass').value = '';
    document.getElementById('adminPanel').classList.add('d-none');
    document.getElementById('adminLogin').classList.remove('d-none');
    document.getElementById('loginError').classList.add('d-none');
}
