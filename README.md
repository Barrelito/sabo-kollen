# SÄBO-kollen

SÄBO-kollen är en statisk svensk webbklient med Vercel Functions och Neon PostgreSQL. Besökare kan hämta boendelistan och skicka rapporter. Rapporter, statistik och boendeadministration kräver en signerad servercookie.

Webbplats: [sabo-kollen.vercel.app](https://sabo-kollen.vercel.app/). Den tidigare GitHub Pages-adressen leder vidare till Vercel via en kontroll av värdnamnet i `index.html`.

## Lokal utveckling

Kräver Node.js 22.

```sh
npm install
npm test
npm run dev
```

`npm run dev` använder en isolerad PGlite-databas i minnet med två syntetiska boenden. Den ansluter aldrig till Neon. Lokal administratör är `demo-admin-password`; datan försvinner när processen avslutas.

## Miljövariabler

Vercel Production och Development ska ha följande hemligheter. Preview ska inte kopplas till produktionsdatabasen.

- `DATABASE_URL`: anslutningssträng till den dedikerade Neon-databasen.
- `SESSION_SECRET`: minst 32 slumpmässiga byte/tecken för HMAC-signering.
- `ADMIN_PASSWORD_HASH`: scrypt-hash från verktyget nedan.

Skapa en hash utan att skriva lösenordet i kommandoraden eller skalhistoriken:

```sh
read -rs "ADMIN_PASSWORD?Nytt administratörslösenord: "; printf '\n'
printf '%s' "$ADMIN_PASSWORD" | npm run hash-password
unset ADMIN_PASSWORD
```

Spara bara hashvärdet i Vercel. Det gamla hårdkodade lösenordet används inte längre och ska inte återanvändas.

## Backupinspektion och import

Verktyget läser endast `COPY`-data för `public.boenden` och `public.rapporter`. Det kör ingen SQL ur backupen och ignorerar roller, auth, storage och övriga tabeller. Kör alltid dry-run först:

```sh
npm run migrate -- --dry-run /absolut/sökväg/db_cluster.backup.gz
```

Dry-run visar endast tabeller, kolumner, radantal, ID-intervall, tidsintervall och sekvensvärden. Den skriver inte ut datarader. Importera därefter till en uttryckligen vald tom databas:

```sh
DATABASE_URL='postgresql://…' npm run migrate -- /absolut/sökväg/db_cluster.backup.gz
```

Importen skapar schemat, vägrar fortsätta om någon apptabell innehåller data, infogar allt i en transaktion, återställer sekvensernas high-water marks och jämför varje importerad kolumn inklusive ID, nullvärden, tidsstämplar och text innan commit. Ett fel rullar tillbaka hela importen.

## Distribution

`npm run build` tömmer och bygger `public/` med endast `index.html`, `script.js` och `style.css`. Backupfiler, verktyg, tester och serverkod kan därför inte bli statiska filer. Vercel kör funktionerna i `fra1` på Node 22.

Rekommenderad ordning:

1. Kör tester och build lokalt.
2. Skapa en dedikerad tom Neon-databas i EU-region och sätt hemligheterna.
3. Kör backup dry-run och import mot just den nya databasen.
4. Verifiera klientflöden lokalt med syntetiska data. Distribuera sedan till Vercel Production med `--skip-domain` så att produktionsvariablerna finns utan att flytta domänen ännu.
5. Verifiera driftsättningen, inklusive login, datumfilter, sidindelning och utskrift av alla sidor. Publicera den därefter med `vercel promote`.
6. Uppdatera GitHub Pages först när Vercel fungerar. Behåll Supabase-projektet och originalbackupen. Vid en kodregression används Vercels rollback till en tidigare fungerande Neon-version; den gamla Supabase-versionen kräver återstart av Supabase och hantering av eventuella nya rapporter innan den kan användas igen.

API: `GET /api/residences`, `POST /api/reports`, `GET|POST|DELETE /api/admin/session`, `GET /api/admin/reports`, `GET /api/admin/statistics`, samt `GET|POST|DELETE /api/admin/residences`.
