// --- KONFIGURATION ---
// Byt ut dessa mot dina uppgifter från Supabase Project Settings > API
const SUPABASE_URL = 'https://seeahrjwakvyinwmndwa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlZWFocmp3YWt2eWlud21uZHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5MjUwOTcsImV4cCI6MjA4MDUwMTA5N30.xqMWlFIaOdqqKpGh_SFAmaT0rTEE7oy0muxFauW8SiY';

// Initiera Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// Default listor (för fallback)
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
        setLoading(true); // Visa att vi jobbar
        
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
        // Gör om listan till en textsträng (t.ex. "ID-band, 0-HLR")
        const brister = bristerArr.join(", ");

        // 2. Skicka till Supabase
        const { data, error } = await db
            .from('rapporter')
            .insert([
                { boende, prio, atgard, mapp_status, brister, fritext }
            ]);

        setLoading(false);

        if (error) {
            console.error('Fel vid sparande:', error);
            alert("Något gick fel! Rapporten sparades inte. \nFelmeddelande: " + error.message);
        } else {
            alert("✅ Tack! Rapporten är sparad i databasen.");
            this.reset(); // Töm formuläret
            toggleMissing(); // Dölj brist-listan
        }
    });
});

// --- HJÄLPFUNKTIONER ---

function setupEventListeners() {
    const radioJa = document.getElementById('mappJa');
    const radioNej = document.getElementById('mappNej');
    
    radioJa.addEventListener('change', toggleMissing);
    radioNej.addEventListener('change', toggleMissing);
    
    // Hantera tabbar
    window.showTab = function(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.add('d-none'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(tabId).classList.remove('d-none');
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

// Fyll boende-listan (Här kan vi senare hämta från DB också)
function renderDropdown() {
    // För nu kör vi på de lokala listorna eller LocalStorage för admin-delen
    // Om du vill kan vi koppla även denna lista till Supabase senare.
    const saved = localStorage.getItem('sabo_boenden');
    const boenden = saved ? JSON.parse(saved) : defaultBoenden;
    
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

// (Admin-funktionerna ligger kvar lokalt tills vidare för att inte krångla till det)
// ... Lägg in din Admin-kod här igen om du vill ha kvar den funktionen ...
