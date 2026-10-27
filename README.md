# The Epochs

Gioco di carte tattico in italiano, con tre Ere, motore deterministico, partite
contro Bot, Hot-Seat locale e multiplayer online. Il client React è una PWA:
dopo il primo caricamento completo può essere riaperto offline per le modalità
locali. Il multiplayer richiede il backend raggiungibile.

## Architettura

- `packages/engine`: regole pure, comandi, eventi, proiezioni per giocatore e hash
  dello stato; nessun accesso a rete, clock o storage.
- `packages/content`: catalogo delle 45 carte, testi italiani e tooltip.
- `packages/protocol`: contratti e validazione dei messaggi client/server.
- `packages/bots`: strategie Random, Greedy e Rational.
- `packages/sim`: simulatore headless riproducibile tramite seed.
- `apps/web`: React, Zustand, Vite, tavolo di gioco, Deck Builder, tutorial e PWA.
- `apps/server`: Fastify, WebSocket `/ws`, sessioni ospite, matchmaking, mazzi,
  replay e persistenza SQLite con `better-sqlite3`.
- `data` e `tools`: catalogo, mazzi, scenari e pipeline delle illustrazioni.

Le specifiche normative sono [TECH-SPEC](docs/TECH-SPEC.md) e [GDD](docs/GDD.md).
Le decisioni sono registrate in [DECISIONS](docs/DECISIONS.md); lo stato del lavoro
è in [TASKS.md](docs/TASKS.md).

## Requisiti e primo avvio

Usare Node.js 24 LTS e pnpm **12.14.0**, la versione fissata in `packageManager`.
Per build native di SQLite senza binario precompilato servono Python e un
compilatore C/C++ (Build Tools su Windows). Per il container serve Docker con
BuildKit; gli strumenti nativi vengono installati nello stage di build.

```sh
npm install --global pnpm@12.14.0
pnpm install --frozen-lockfile
pnpm content:validate
pnpm art:placeholders
pnpm art:build
```

Avviare il frontend e, per il multiplayer, il backend in due terminali:

```sh
pnpm --filter @epochs/web dev --host 127.0.0.1 --port 5173
```

```sh
pnpm --filter @epochs/server dev
```

Aprire `http://127.0.0.1:5173`. La Lobby Online propone
`ws://127.0.0.1:3000/ws`; il campo URL consente di scegliere un altro server.
Il server avviato senza `DATABASE_PATH` usa un database in memoria.

## Configurazione del server

[.env.example](.env.example) documenta tutte le variabili lette dal backend:

- `PORT`: porta HTTP/WebSocket, default `3000`.
- `HOST`: interfaccia di ascolto, default `0.0.0.0`.
- `DATABASE_PATH`: percorso SQLite, default `:memory:`. La directory padre deve
  esistere ed essere scrivibile. Nel container il default è `/data/epochs.sqlite`.
- `ALLOWED_ORIGINS`: elenco di origini browser separate da virgole. Se omesso,
  sono ammesse le origini localhost/127.0.0.1 sulle porte 5173, 4173 e 3000.
- `LOG_LEVEL`: livello pino, default `warn` nel server e `info` nel container.

Per un server locale persistente, copiare `.env.example` in `.env` e impostare
`DATABASE_PATH=./epochs.sqlite`, oppure scegliere una directory già esistente.
Il file `.env` non viene caricato automaticamente. Dopo la compilazione:

```sh
pnpm --filter @epochs/server build
node --env-file=.env apps/server/dist/server.js
```

`GET /api/v1/healthz` verifica che il servizio risponda. Il backend offre REST
sotto `/api/v1` e WebSocket su `/ws`; i replay sono accessibili solo a partita
conclusa. `SIGINT` e `SIGTERM` attivano lo shutdown ordinato.

## Verifiche e build

```sh
pnpm content:validate
pnpm exec tsx tools/gdd-to-cards.ts --check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:scenarios
pnpm build
pnpm exec tsx tools/check-bundle-budget.ts
pnpm --filter @epochs/web exec playwright install chromium
pnpm test:e2e
```

`pnpm test:coverage` misura la copertura. `validate:scenarios` esegue gli scenari
deterministici di `data/scenarios`; il controllo bundle applica il limite di
250 KB gzip al JavaScript iniziale. Le illustrazioni vanno generate prima della
build web. `pnpm build` produce `apps/web/dist` (PWA e service worker) e
`apps/server/dist/server.js` (backend con i package interni incorporati e
dipendenze npm esterne, incluso SQLite nativo).

Per controllare localmente la PWA prodotta:

```sh
pnpm --filter @epochs/web preview --host 127.0.0.1 --port 4173
```

I test Playwright avviano Vite in sviluppo sulla porta 5173 e la PWA compilata
in anteprima sulla porta 4173. In locale la build viene rigenerata automaticamente;
in CI viene usata quella prodotta dal gate precedente. Per verificare solo
il riavvio senza rete e le partite complete contro GreedyBot e in Hot-Seat:

```sh
pnpm exec playwright test apps/web/e2e/pwa-offline.spec.ts
```

I test offline controllano anche il caricamento di illustrazioni, font, CSS e
JavaScript dal service worker su desktop e sulle due viewport mobile.
La pipeline `.github/workflows/ci.yml`, eseguita su push, pull request e avvio
manuale, applica in sequenza i gate di qualità, l'idempotenza del generatore di
carte, la build con generazione delle illustrazioni, il budget JS e tutti i test
E2E. In caso di errore conserva per 7 giorni trace e screenshot Playwright.

## Simulatore headless

```sh
pnpm sim --deckA data/decks/aggro-breach.json --deckB data/decks/boom-economy.json --botA greedy --botB rational --games 100 --seed epochs-v1 --workers 4 --out simulation.json
```

Le strategie ammesse sono `random`, `greedy` e `rational`. Con gli stessi mazzi,
seed e parametri il report è riproducibile. Un percorso `--out` con estensione
`.csv` produce il formato CSV; `.json` produce JSON. Il comando non richiede
browser né server online.

## Deploy Docker

Dalla radice del repository:

```sh
docker build --target runtime -t the-epochs:local .
docker run --detach --name the-epochs --restart unless-stopped --env-file .env.example --publish 3000:3000 --mount type=volume,source=epochs-data,target=/data the-epochs:local
```

Lo stage di build installa dal lockfile, genera le illustrazioni, verifica i
tipi, compila frontend e backend e controlla il budget JS. Lo stage runtime usa
Node.js 24 su Debian slim, esegue il backend compilato con l'utente `node` e
contiene le sole dipendenze di produzione preparate da `pnpm deploy`.
Il database persiste nel volume `epochs-data`; con un bind mount, la directory
deve essere scrivibile dall'utente `node` del container (UID 1000).

```sh
docker inspect --format='{{.State.Health.Status}}' the-epochs
docker logs the-epochs
docker stop the-epochs
```

Il controllo di salute interroga `/api/v1/healthz` sulla porta interna `PORT`.
Se si cambia `PORT`, adeguare anche il lato destro di `--publish`.

Il container runtime espone API e WebSocket. Per pubblicare la PWA, esportare gli
asset dallo stage `web` e distribuirli tramite un host statico HTTPS:

```sh
docker build --target web --output type=local,dest=./web-dist .
```

Il servizio statico deve pubblicare `web-dist` alla radice del sito, fornire il
fallback a `index.html` per la navigazione SPA e consentire l'aggiornamento di
`sw.js` e HTML senza cache permanente. In produzione configurare
`ALLOWED_ORIGINS=https://gioco.example.com` e un reverse proxy HTTPS che inoltri
`/api/v1/*` e `/ws` al container, preservando l'upgrade WebSocket. Nella Lobby
Online impostare `wss://gioco.example.com/ws`. Service worker e installazione
PWA richiedono HTTPS, con l'eccezione dello sviluppo su localhost.

L'immagine viene costruita per la piattaforma Docker selezionata: il modulo
SQLite nativo è installato nello stage Linux e non viene copiato dal sistema
host. `.dockerignore` esclude dipendenze locali, build precedenti, database e
file `.env` dal contesto.
