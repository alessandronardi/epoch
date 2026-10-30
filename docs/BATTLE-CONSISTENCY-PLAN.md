# Piano di correzione della presentazione della battaglia

Data: 29 ottobre 2026. Stato: implementazione completata e verificata. Decisione architetturale: DEC-007.

## Obiettivo e confini

Far coincidere campo, indicatori e registro con il momento della battaglia riprodotto. Rendere consultabili gli esiti anche dopo il passaggio all'Era successiva. Le regole di combattimento e la simultaneità dei danni restano quelle attuali.

La correzione comprende la sincronizzazione e una scansione minima comprensibile. La direzione artistica delle animazioni, gli effetti cinematografici e la taratura definitiva dei tempi saranno oggetto della successiva discussione sulla qualità percepita.

## Invarianti di accettazione

- Era, fase, unità, modificatori ATK, mura e risorse mostrati appartengono allo stesso punto della riproduzione.
- `assignments.P1` descrive i danni prodotti da P1 contro P2; `casualties.P1` descrive invece i caduti di P1. La convenzione non viene modificata.
- I danni dei due lati si applicano insieme; i caduti vengono rimossi dopo aver mostrato il risultato, senza introdurre duelli sequenziali.
- Riproduzione completa e «Salta alla fine» portano allo stesso stato finale e allo stesso registro, senza duplicati.
- La pausa congela anche l'applicazione degli effetti e le transizioni visive. Il server può proseguire: la pausa resta una funzione locale.
- Le informazioni nascoste non vengono anticipate, anche cambiando giocatore in hot-seat o ricevendo nuovi aggiornamenti online.
- Registro e riepilogo della battaglia conclusa rimangono raggiungibili durante lo Sviluppo successivo.

## 1. Riproduzioni e test di regressione

**Priorità:** P0. **Dipendenze:** nessuna.

- Correggere gli eventi sintetici dei test web che usano `assignments` come elenco per difensore.
- Aggiungere una sequenza di riferimento generata dal motore e proiettata per ciascun giocatore, con danni non letali, eliminazioni simultanee, bonus da Istantanee e fine Era.
- Fissare test sui tre difetti riprodotti: HP 5 -> 3 dopo 2 danni; Era I ancora visibile durante la sua battaglia; registro popolato e accessibile dopo il ritorno allo Sviluppo.
- Coprire vittoria anticipata, annientamento reciproco, stallo al sesto ciclo e vittoria con Assedio/Razzia.

**Completamento:** i casi descrivono il comportamento atteso e falliscono sulle incongruenze attuali; le fixture rispettano il contratto reale degli eventi.

**File principali:** `apps/web/tests/event-player.test.ts`, `apps/web/tests/phase-board.test.tsx`, `apps/web/tests/local-controller.test.ts`, `packages/engine/tests/battle.test.ts`.

## 2. Contratto degli eventi e applicazione degli effetti

**Priorità:** P0. **Dipendenze:** 1.

- Correggere il playback: per aggiornare gli HP di un lato leggere le assegnazioni dell'attaccante opposto; continuare a leggere i caduti per proprietario.
- Esplicitare questa convenzione nei tipi e nei test del protocollo.
- Arricchire `BattleStarted` con uno snapshot pubblico delle unità dopo l'applicazione delle Istantanee. Il playback acquisisce così gli `atkMod` risolti dal motore, senza duplicare le formule sul client.
- Usare `WallsModified`, `SiegeResolved`, `RaidResolved` e gli eventi delle risorse per aggiornare la rappresentazione al momento corretto, senza applicare due volte gli stessi trasferimenti.
- Aggiornare schema Zod, proiezioni e controlli server/replay insieme al contratto. Prevedere il campo aggiuntivo opzionale in lettura per i replay precedenti; se manca, non inventare modificatori non disponibili.
- Per la spiegazione dei bonus, aggiungere a `BattlePhaseResolved` un dettaglio calcolato dal motore su contributi e bonus. Distinguere danno prodotto, danno assegnato ed eventuale eccesso: il totale prodotto non coincide sempre con gli HP persi.

**Completamento:** danni, caduti e ATK visualizzati corrispondono agli eventi reali nelle prospettive P1 e P2; i nuovi dati pubblici attraversano il protocollo senza esporre informazioni segrete; i vecchi payload continuano a essere leggibili.

**File principali:** `packages/engine/src/events.ts`, `packages/engine/src/battle.ts`, `packages/engine/src/siege-and-era.ts`, `packages/engine/src/projection.ts`, `packages/protocol/src/index.ts`, `apps/web/src/state/game-store.ts`.

## 3. Stato autorevole e stato di presentazione

**Priorità:** P0. **Dipendenze:** 2.

- Conservare separatamente l'ultima vista autorevole e la vista presentata. I controller e le versioni dei comandi usano sempre la prima; il tavolo usa la seconda durante il playback.
- Aggiornare normalmente la vista fuori dalla riproduzione. Durante una sequenza mantenere il contesto dell'Era corrente e applicare soltanto gli effetti dell'evento raggiunto.
- Non limitarsi a ritardare `targetView`: gestire anche il punto intermedio `UnitsRevealed` e gli eventi di fine/inizio Era, comprese sequenze consecutive già accodate.
- Impedire che nuovi messaggi online sovrascrivano il contesto mostrato o perdano gli eventi in attesa. Gestire esplicitamente snapshot iniziale, riallineamento e deduplicazione.
- Se il riallineamento non offre gli eventi necessari, sincronizzare allo snapshot e segnalare l'interruzione della riproduzione, senza ricostruire una battaglia ipotetica.
- Applicare la vista finale a coda conclusa o al salto. Non anticipare mano della nuova Era, indicazione «Tocca a te», risultato finale o modali.
- In hot-seat completare la presentazione pubblica prima del cambio di posto, conservando la corretta prospettiva e la protezione delle mani.
- Condividere la stessa funzione di applicazione degli eventi fra avanzamento normale e salto, evitando due implementazioni divergenti.

**Completamento:** durante una battaglia di Era I nessun elemento del tavolo mostra dati dell'Era II; pausa, ripresa, salto e nuovi messaggi mantengono una rappresentazione coerente; la conclusione coincide con la vista autorevole.

**File principali:** `apps/web/src/state/game-store.ts`, `apps/web/src/controllers/local-controller.ts`, `apps/web/src/controllers/remote-controller.ts`, `apps/web/src/components/board/BattlefieldBoard.tsx`, `apps/web/src/components/board/MatchTable.tsx`, `apps/web/src/components/board/CityAndLines.tsx`.

## 4. Ciclo di vita delle fasi e registro persistente nella partita

**Priorità:** P1. **Dipendenze:** 3.

- Identificare ogni battaglia tramite Era ed evento di avvio; mantenere separati storico e avanzamento della battaglia corrente.
- Azzerare gli indicatori alla nuova preparazione/rivelazione; distinguere fasi in attesa, in corso, concluse e saltate.
- All'esito anticipato indicare perché le fasi successive non vengono eseguite. Trattare esplicitamente l'Assedio non previsto in caso di stallo o annientamento reciproco.
- Una fase eseguita senza danni rimane «conclusa», distinta da una fase mai eseguita.
- Conservare tutti gli eventi, ma mostrare di default quelli della battaglia corrente o dell'ultima conclusa, raggruppati per Era e fase. Rendere consultabili gli eventi di Sviluppo separatamente.
- Rendere il registro apribile anche durante lo Sviluppo successivo; rimuovere la dipendenza che ne annulla il contenuto fuori dalla scena di battaglia.
- Seguire automaticamente le nuove voci solo se il lettore è già in fondo; altrimenti mostrare un'indicazione di nuovi eventi senza spostare il punto di lettura.
- Mostrare un riepilogo conclusivo con esito, perdite ed eventuali effetti sulla città.

**Completamento:** le Ere successive partono con indicatori corretti; le fasi saltate sono comprensibili; registro e riepilogo restano consultabili su desktop e mobile dopo la battaglia.

**File principali:** `apps/web/src/state/game-store.ts`, `apps/web/src/components/board/use-battle-presentation.ts`, `apps/web/src/components/board/BattlePlaybackAndLog.tsx`, `apps/web/src/components/board/BattlefieldBoard.tsx`, `apps/web/src/components/board/board.css`.

## 5. Scansione minima e spiegazione degli esiti

**Priorità:** P1. **Dipendenze:** 2, 3 e 4.

- Suddividere la presentazione della fase in annuncio, applicazione simultanea dei danni e lettura del risultato. Registrare ciascun evento una sola volta al momento dell'applicazione; l'annuncio preliminare non deve registrare danni non ancora mostrati.
- Sostituire il tempo unico di 480 ms con durate distinte e centralizzate per questi momenti. La taratura definitiva seguirà una prova giocata; non fissarla come correzione puramente tecnica.
- Mantenere velocità 1x/2x, pausa e salto coerenti con tutte le sottosequenze e con l'audio.
- Rendere fase attiva e pausa accessibili sul campo anche a cassetto mobile chiuso.
- Nel registro usare nomi delle carte, HP prima/dopo, caduti e bonus ricevuti dal motore; chiarire la relazione fra danno aggregato e bersagli colpiti, senza attribuire duelli non presenti nelle regole.
- Presentare attaccanti e bersagli in modo riconoscibile e mantenere un breve momento leggibile prima della rimozione dei caduti. Con movimento ridotto usare evidenziazioni statiche o dissolvenze.

**Completamento:** il giocatore può riconoscere la fase, osservare gli effetti e consultarne la causa; la pausa ferma il momento mostrato senza cambiare i risultati della partita.

## 6. Verifica integrata e documentazione

**Priorità:** condizione di chiusura. **Dipendenze:** tutte le precedenti.

- Eseguire test mirati di motore, protocollo, store, componenti e controller; quindi typecheck, lint, build e suite di regressione previste dal progetto.
- Verificare con E2E una battaglia completa desktop e mobile, il registro dopo il cambio Era e l'equivalenza fra playback normale e salto.
- Includere modalità bot, hot-seat e online, con un aggiornamento ricevuto in pausa, una riconnessione durante il playback e la consultazione del replay nelle prospettive disponibili.
- Confrontare a ogni fase i valori visibili con gli eventi del motore, oltre allo stato finale: una vittoria corretta non basta a dimostrare una presentazione corretta.
- Verificare focus, annunci accessibili, lettura del registro e movimento ridotto.
- Aggiornare TECH-SPEC e registro delle decisioni per il contratto degli eventi e la separazione delle viste; descrivere le limitazioni dei replay precedenti.

**Completamento:** tutte le invarianti iniziali sono coperte; nessuna regressione delle regole o della riservatezza; prova giocata finale senza anticipazioni di stato, HP incoerenti o registro irraggiungibile.

## Ordine di consegna

1. Fixture reali e regressioni riproducibili.
2. Contratto degli eventi, HP e modificatori ATK.
3. Sincronizzazione completa del tavolo e gestione delle modalità.
4. Indicatori di fase e registro consultabile dopo lo scontro.
5. Scansione minima, spiegazioni e verifica integrata.

Ogni consegna comprende i propri test. Le prime tre costituiscono la correzione della coerenza; le successive rendono verificabile e comprensibile il risultato al giocatore. I tempi introdotti sono un punto di partenza tecnico: la taratura percettiva definitiva rimane una fase successiva.

## Verifiche eseguite

- Suite Vitest completa: 34 file, 283 test superati; regressioni mirate su HP, bonus, simultaneità, pausa, salto, fine Era, stallo, riallineamento, privacy hot-seat e consultazione del registro.
- 13 scenari E2E distinti superati fra desktop, mobile orizzontale e mobile verticale: battaglia con HP non letali, partita locale completa con audit accessibilità, multiplayer con riconnessione e replay, esercitazioni e finali alternativi. I due finali alternativi vengono eseguiti solo su desktop, come previsto dai test.
- Verifica visiva delle schermate e controllo geometrico della visibilità degli HP sulle carte compatte; supporto al movimento ridotto verificato nello scenario di battaglia.
- Typecheck dell'intero workspace, lint e build superati.
- I test di interazione attendono lo stato di presentazione e usano il tocco sui dispositivi mobili. I conteggi dei test sopra indicano i casi distinti, senza sommare le ripetizioni durante la correzione.
