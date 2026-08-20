# WhatsApp Booking Assistant

MVP per `openspec/changes/whatsapp-booking-assistant` — vedi `proposal.md`, `design.md`,
`specs/` in quella cartella per cosa fa e perché. Questo file copre solo il setup.

## Stack

Next.js (TypeScript, App Router) + Postgres. Un solo servizio, nessuna coda —
vedi `design.md` → Architecture Overview per il quadro d'insieme.

## Setup locale

```bash
npm install
cp .env.example .env   # poi compila i valori, vedi sotto
npm run migrate         # applica db/schema.sql al DATABASE_URL configurato
npm run dev
```

## Cosa serve procurarsi prima di poter usare l'app per davvero

Questi sono i task 1.2, 1.3 e 7.1–7.3 di `tasks.md` — richiedono account reali
e dati reali degli host, quindi nessun agente può farli al posto tuo.

1. **Postgres** — un'istanza qualsiasi (locale, Supabase, Railway, RDS...).
   Deve avere l'estensione `btree_gist` disponibile (`db/schema.sql` la abilita
   da sé con `CREATE EXTENSION IF NOT EXISTS btree_gist`).
2. **Twilio** — crea un account su twilio.com, attiva il sandbox WhatsApp (o
   richiedi un numero WhatsApp Business reale) e prendi `Account SID`,
   `Auth Token`, e il numero WhatsApp. Metti tutto in `.env`.
   **Importante:** il numero WhatsApp Business per ogni host dev'essere
   **nuovo**, mai il numero personale dell'host — registrarlo sull'API
   cancella per sempre l'account WhatsApp consumer collegato (cronologia
   messaggi persa, non riusabile nell'app normale finché resta sull'API).
   Vedi `design.md` → Decisions per il perché. Serve anche un numero SMS
   separato (`TWILIO_SMS_NUMBER`) per le notifiche verso l'host — il numero
   WhatsApp business non ha un'app che possa riceverle.
   Infine, appena il numero è verificato, invia a Meta (via console Twilio)
   i template per i messaggi programmati (promemoria pre-arrivo, istruzioni
   check-in) — senza approvazione quei messaggi funzionano solo entro 24h
   dall'ultimo messaggio dell'ospite.
3. **Anthropic API key** — per le risposte FAQ e l'estrazione delle date dai
   messaggi (mai per decidere disponibilità/prenotazioni, quello resta sempre
   una query deterministica sul DB — vedi `design.md`).
4. **Deploy target** — qualsiasi host che esegua Next.js (Vercel, Railway,
   un VPS con `npm run build && npm run start`...). Serve un URL pubblico
   perché Twilio possa chiamare `/api/whatsapp/webhook`.
5. **Cron** — `vercel.json` è già configurato per chiamare `GET /api/cron/send-scheduled`
   una volta al giorno via Vercel Cron (limite del piano Hobby: 1 esecuzione/giorno —
   va benissimo qui, i promemoria hanno comunque una granularità di giorni, non
   di minuti). Basta impostare `CRON_SECRET` tra le env vars del progetto su
   Vercel: lo header `Authorization: Bearer $CRON_SECRET` lo manda Vercel da
   solo. Deploy altrove invece di Vercel → basta un `curl` con quello stesso
   header su uno scheduler qualsiasi (GitHub Actions, crontab...).

## Onboarding di un host pilota (7.1)

```bash
node --experimental-strip-types scripts/create-host.ts \
  "host@esempio.com" "password-scelta" "Nome Host" "+34600111222"
```

Poi aggiungi le sue proprietà direttamente via SQL (nessuno script serve, è
solo testo/numeri):

```sql
INSERT INTO properties (host_id, name, price_per_night, min_nights, house_rules, amenities, checkin_time, checkin_instructions)
VALUES ('<host-id>', 'Casa X', 180.00, 3, 'No fumo, no feste', 'Piscina, WiFi, AC', '15:00', 'Via ..., codice cancello 1234, host: +34...');
```

Poi punta il numero WhatsApp dell'host verso il webhook Twilio (7.2), e
monitora le prime conversazioni reali (7.3).

Da quando esiste il signup pubblico (`/signup`), un host può anche crearsi da
solo senza numero WhatsApp — lo aggiungi tu più tardi con un semplice
`UPDATE hosts SET whatsapp_number = '+34...' WHERE email = '...'` quando è
pronto l'onboarding Twilio sopra.

## Aggiornare un database già esistente

`npm run migrate` applica `db/schema.sql` da zero — su un database già
popolato va a sbattere contro le tabelle esistenti (nessun framework di
migrazioni, vedi commento in `scripts/migrate.ts`). Per portare un DB
esistente allo schema più recente, applica a mano il diff:

```sql
ALTER TABLE hosts ALTER COLUMN whatsapp_number DROP NOT NULL;
ALTER TABLE hosts ADD COLUMN calendar_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text;
ALTER TABLE hosts ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE hosts ADD COLUMN google_id TEXT UNIQUE;
```

## Login con Google

1. [Google Cloud Console](https://console.cloud.google.com) → crea/scegli un
   progetto → "APIs & Services" → "OAuth consent screen" (basta la
   configurazione minima, tipo "External"/"Internal" a seconda del caso).
2. "Credentials" → "Create Credentials" → "OAuth client ID" → tipo
   **Web application**.
   - **Authorized JavaScript origins**: solo schema+host, senza path —
     `http://localhost:3000` e `https://<tuo-dominio>`.
   - **Authorized redirect URIs**: con path completo —
     `http://localhost:3000/api/auth/google/callback` e
     `https://<tuo-dominio>/api/auth/google/callback`.
3. Copia `Client ID` e `Client secret` in `.env` (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`).

Il redirect URI usato dal codice è calcolato a runtime dall'host della
richiesta (stesso trucco del link calendario ICS) — non serve un env var in
più, ma deve combaciare esattamente con quanto registrato sopra.

## Test

```bash
npm test        # self-check delle funzioni pure (date, motore regole)
npm run typecheck
```

Non c'è un test end-to-end automatico: richiederebbe un Postgres reale e
credenziali Twilio/Anthropic reali, che non esistono in questo ambiente.
`npm run build` (Next.js) è il modo più veloce per verificare che tutto il
progetto — pagine, API route, tipi — sia coerente prima di un deploy.
