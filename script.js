// --- KONFIGURATION ---
// Byt ut dessa mot dina uppgifter från Supabase Project Settings > API
const SUPABASE_URL = 'https://seeahrjwakvyinwmndwa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZWFocmp3YWt2eWlud21uZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjUwOTcsImV4cCI6MjA4MDUwMTA5N30.xqMWlFIaOdqqKpGh_SFAmaT0rTEE7oy0muxFauW8SiY';

// Initiera Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Default listor
const defaultBoenden = ["Solbacken", "Bergshöjden", "Enebacken", "Rosengården", "Annat"];
const defaultBrister = ["Läkemedelslista", "Medföljandeblankett", "ID-band", "0-HLR Beslut", "Bemötandeplan"];

// --- APP LOGIK ---
document.addEventListener('DOMContentLoaded', function() {
    
    // UI Setup
    renderDropdown();
    renderBrister();
    setupEventListeners();

    // Hantera formulär-submit
    document.getElementById('reportForm').addEventListener('submit', async function(event) {
        event.preventDefault();
        setLoading(true); 
        
        // 1. Samla in data
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

        // 2. Skicka till Supabase
        const { data, error } = await db
            .from('rapporter') // Kontrollera att tabellen heter exakt så här i Supabase
            .insert([
                { boende, prio, atgard, mapp_status, brister, fritext }
            ]);

        setLoading(false);

        if (error) {
            console.error('Fel vid sparande:', error);
            alert("Fel: " + error.message);
        } else {
            alert("✅ Tack! Rapporten är sparad.");
            this.reset();
            toggleMissing();
        }
    });
});

// --- STATISTIK-LOGIK (NYTT!) ---

async function fetchStatistics() {
    const totalEl = document.getElementById('statTotal');
    const procentEl = document.getElementById('statKomplett');
    const listEl = document.getElementById('statBristerList');
    
    listEl.innerHTML = '<li class="list-group-item">Hämtar data...</li>';

    // Hämta ALL data från tabellen
    const { data, error } = await db
        .from('rapporter')
        .select('*');

    if (error) {
        alert("Kunde inte hämta statistik: " + error.message);
        return;
    }

    if (data.length === 0) {
        totalEl.innerText = "0";
        procentEl.innerText = "-";
        listEl.innerHTML = '<li class="list-group-item">Inga rapporter än.</li>';
        return;
    }

    // 1. Räkna totalt
    const totalCount = data.length;
    totalEl.innerText = totalCount;

    // 2. Räkna hur många som var kompletta (JA)
    const komplettaCount = data.filter(rad => rad.mapp_status === 'JA').length;
    const procent = Math.round((komplettaCount / totalCount) * 100);
    procentEl.innerText = procent + "%";

    // 3. Räkna vanligaste bristerna
    let bristRaknare = {};

    data.forEach(rad => {
        // Om det finns brister och det inte är tomt
        if (rad.brister && rad.mapp_status === 'NEJ') {
            // Dela upp strängen "ID-band, 0-HLR" till en lista
            let items = rad.brister.split(','); 
            items.forEach(item => {
                let cleanItem = item.trim(); // Ta bort mellanslag
                if (cleanItem) {
                    bristRaknare[cleanItem] = (bristRaknare[cleanItem] || 0) + 1;
                }
            });
        }
    });

    // Sortera listan (Högst antal först)
    // Object.entries gör om { "ID-band": 5, "Annat": 2 } till [["ID-band", 5], ["Annat", 2]]
    const sorteradeBrister = Object.entries(bristRaknare).sort((a, b) => b[1] - a[1]);

    // Rendera listan
    listEl.innerHTML = '';
    if (sorteradeBrister.length === 0) {
        listEl.innerHTML = '<li class="list-group-item text-success">Inga brister rapporterade!</li>';
    } else {
        sorteradeBrister.forEach(([brist, antal]) => {
            // Räkna ut procent av alla rapporter som hade denna brist
            const bristProcent = Math.round((antal / totalCount) * 100);
            
            listEl.innerHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    ${brist}
                    <span class="badge bg-danger rounded-pill">${antal} st (${bristProcent}%)</span>
                </li>
            `;
        });
    }
}

// --- STANDARD UI FUNKTIONER ---

function setupEventListeners() {
    const radioJa = document.getElementById('mappJa');
    const radioNej = document.getElementById('mappNej');
    
    if(radioJa && radioNej) {
        radioJa.addEventListener('change', toggleMissing);
        radioNej.addEventListener('change', toggleMissing);
    }

    window.showTab = function(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('d-none'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.remove('d-none');
        
        // Sätt aktiv knapp
        const navBtns = document.querySelectorAll('.nav-btn');
        if(tabId === 'rapportTab') navBtns[0].classList.add('active');
        if(tabId === 'infoTab') navBtns[1].classList.add('active');
        if(tabId === 'adminTab') navBtns[2].classList.add('active');
    };
}

function toggleMissing() {
    const radioNej = document.getElementById('mappNej');
    const missingSection = document.getElementById('missingSection');
    if (radioNej && radioNej.checked) {
        missingSection.classList.remove('d-none');
    } else {
        missingSection.classList.add('d-none');
    }
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

// --- ADMIN FUNKTIONER ---

function checkAdmin() {
    const pass = document.getElementById('adminPass').value;
    if (pass === "nettan123") {
        document.getElementById('adminLogin').classList.add('d-none');
        document.getElementById('adminPanel').classList.remove('d-none');
        renderAdminList();
        
        // HÄMTA STATISTIK DIREKT VID LOGIN!
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

// Listor och Admin-boenden (Local Storage)
function getData(key, defaultData) {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
}
function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function renderDropdown() {
    const boenden = getData('sabo_boenden', defaultBoenden);
    const select = document.getElementById('boende');
    select.innerHTML = '<option value="" selected disabled>Välj i listan...</option>';
    boenden.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        select.appendChild(opt);
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

function renderAdminList() {
    const boenden = getData('sabo_boenden', defaultBoenden);
    const list = document.getElementById('adminBoendeList');
    list.innerHTML = '';
    boenden.forEach((b, index) => {
        const li = document.createElement('li');
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `${b} <button class="btn btn-sm btn-outline-danger" onclick="removeBoende(${index})">Ta bort</button>`;
        list.appendChild(li);
    });
}

function addBoende() {
    const input = document.getElementById('newBoendeInput');
    const val = input.value.trim();
    if (val) {
        const boenden = getData('sabo_boenden', defaultBoenden);
        boenden.push(val);
        saveData('sabo_boenden', boenden);
        input.value = '';
        renderAdminList();
        renderDropdown();
    }
}

function removeBoende(index) {
    if(confirm("Är du säker?")) {
        const boenden = getData('sabo_boenden', defaultBoenden);
        boenden.splice(index, 1);
        saveData('sabo_boenden', boenden);
        renderAdminList();
        renderDropdown();
    }
}
