document.addEventListener('DOMContentLoaded', function() {
    
    const radioJa = document.getElementById('mappJa');
    const radioNej = document.getElementById('mappNej');
    const missingSection = document.getElementById('missingSection');
    const form = document.getElementById('reportForm');

    // 1. Visa/Dölj sektionen för "Vad saknas?"
    function toggleMissing() {
        if (radioNej.checked) {
            missingSection.classList.remove('d-none');
        } else {
            missingSection.classList.add('d-none');
        }
    }

    // Lyssna på klick på Ja/Nej-knapparna
    radioJa.addEventListener('change', toggleMissing);
    radioNej.addEventListener('change', toggleMissing);

    // 2. Hantera när man klickar på SKICKA
    form.addEventListener('submit', function(event) {
        event.preventDefault(); // Stoppa sidan från att ladda om

        // Samla in data (Här skulle vi skicka den till en databas sen)
        const boende = document.getElementById('boende').value;
        const prio = document.querySelector('input[name="prioDit"]:checked').value;
        const atgard = document.getElementById('atgard').value;
        const rodMapp = document.querySelector('input[name="rodMapp"]:checked').value;
        
        // Hämta vilka brister som kryssats i
        let brister = [];
        document.querySelectorAll('#missingSection input:checked').forEach((checkbox) => {
            brister.push(checkbox.value);
        });

        // Simulera att vi sparar
        console.log("Rapport skickad:", { boende, prio, atgard, rodMapp, brister });
        
        // Ge feedback till användaren
        alert("Tack! Rapporten för " + boende + " är registrerad.");
        
        // Rensa formuläret så man kan göra en ny
        form.reset();
        toggleMissing(); // Dölj brist-listan igen
    });
});
