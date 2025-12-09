// --- DATA & KONFIGURATION ---
// Vi sätter standardlistor om inget finns sparat sen innan
const defaultBoenden = ["Solbacken", "Bergshöjden", "Enebacken", "Rosengården", "Annat"];
const defaultBrister = ["Läkemedelslista", "Medföljandeblankett", "ID-band", "0-HLR Beslut", "Bemötandeplan"];

// Funktion för att hämta data (från LocalStorage eller default)
function getData(key, defaultData) {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
}

function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// --- APP LOGIK ---
document.addEventListener('DOMContentLoaded', function() {
    
    // Ladda in listor
    renderDropdown();
    renderBrister();

    // Hantera Röda Mappen visa/dölj
    const radioJa = document.getElementById('mappJa');
    const radioNej = document.getElementById('mappNej');
    const missingSection = document.getElementById('missingSection');

    function toggleMissing() {
        if (radioNej.checked) {
            missingSection.classList.remove('d-none');
        } else {
            missingSection.classList.add('d-none');
        }
    }
    radioJa.addEventListener('change', toggleMissing);
    radioNej.addEventListener('change', toggleMissing);

    // Hantera Formulär
    document.getElementById('reportForm').addEventListener('submit', function(event) {
        event.preventDefault();
        
        // Hämta värden
        const boende = document.getElementById('boende').value;
        const prio = document.querySelector('input[name="prioDit"]:checked').value;
        const atgard = document.getElementById('atgard').value;
        const rodMapp = document.querySelector('input[name="rodMapp"]:checked').value;
        const fritext = document.getElementById('fritext').value;
        
        let valdaBrister = [];
        document.querySelectorAll('#bristContainer input:checked').forEach((checkbox) => {
            valdaBrister.push(checkbox.value);
        });

        // Simulera sparande
        console.log("Rapport:", { boende, prio, atgard, rodMapp, valdaBrister, fritext });
        alert("Tack! Rapporten sparad.");
        
        // Återställ
        this.reset();
        toggleMissing();
    });
});

// --- UI FUNKTIONER ---

// Fyll boende-listan i formuläret
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

// Skapa checkboxar för brister dynamiskt
function renderBrister() {
    const brister = defaultBrister; // Kan göras redigerbart i framtiden
    const container = document.getElementById('bristContainer');
    container.innerHTML = '';

    brister.forEach((brist, index) => {
        const div = document.createElement('div');
        div.className = "form-check py-2 border-bottom";
        div.innerHTML = `
            <input class="form-check-input scale-check" type="checkbox" value="${brist}" id="brist${index}">
            <label class="form-check-label ms-2" for="brist${index}">${brist}</label>
        `;
        container.appendChild(div);
    });
}

// Byt flik
function showTab(tabId) {
    // Dölj alla flikar
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('d-none'));
    // Avmarkera knappar
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    
    // Visa vald flik
    document.getElementById(tabId).classList.remove('d-none');
    
    // Markera rätt knapp (lite fulhack men funkar)
    const btnIndex = tabId === 'rapportTab' ? 0 : tabId === 'infoTab' ? 1 : 2;
    document.querySelectorAll('.nav-btn')[btnIndex].classList.add('active');
}

// --- ADMIN FUNKTIONER ---

function checkAdmin() {
    const pass = document.getElementById('adminPass').value;
    // HÄR SÄTTER VI LÖSENORDET (Enkelt för prototyp)
    if (pass === "nettan123") {
        document.getElementById('adminLogin').classList.add('d-none');
        document.getElementById('adminPanel').classList.remove('d-none');
        renderAdminList();
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

// Visa lista i admin-läget
function renderAdminList() {
    const boenden = getData('sabo_boenden', defaultBoenden);
    const list = document.getElementById('adminBoendeList');
    list.innerHTML = '';

    boenden.forEach((b, index) => {
        const li = document.createElement('li');
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
            ${b}
            <button class="btn btn-sm btn-outline-danger" onclick="removeBoende(${index})">Ta bort</button>
        `;
        list.appendChild(li);
    });
}

// Lägg till nytt boende
function addBoende() {
    const input = document.getElementById('newBoendeInput');
    const val = input.value.trim();
    if (val) {
        const boenden = getData('sabo_boenden', defaultBoenden);
        boenden.push(val);
        saveData('sabo_boenden', boenden);
        
        input.value = '';
        renderAdminList(); // Uppdatera admin-listan
        renderDropdown(); // Uppdatera "riktiga" dropdownen direkt
    }
}

// Ta bort boende
function removeBoende(index) {
    if(confirm("Är du säker?")) {
        const boenden = getData('sabo_boenden', defaultBoenden);
        boenden.splice(index, 1);
        saveData('sabo_boenden', boenden);
        
        renderAdminList();
        renderDropdown();
    }
}
