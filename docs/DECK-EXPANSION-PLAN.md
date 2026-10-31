# EPOCHS — Piano di sviluppo dei tre mazzi di civiltà

Data: 30 ottobre 2026. Stato: P0–P4 implementate; integrazione e verifiche P5 in corso;
prima calibrazione P6 eseguita, criteri di bilanciamento non ancora raggiunti.

## 1. Obiettivo e perimetro

Realizzare tre mazzi precostruiti da 60 carte, ciascuno con tre sotto-mazzi da
20 carte e massimo tre copie per carta:

- **Regni feudali / Equilibrio Tattico:** equilibrio fra economia ed esercito,
  composizione mista e adattamento. Nome della civiltà provvisorio.
- **Norreni / Assalto e Breccia:** pressione militare, fanteria e vantaggi ottenuti
  dalle brecce nelle prime due Ere.
- **Bizantini / Sviluppo Imperiale:** investimento economico, difesa e
  contrattacco con unità costose.

Ogni civiltà deve avere una peculiarità generale, carte caratteristiche,
strutture riconoscibili e una debolezza sfruttabile. Le tre Ere rappresentano
insediamento, consolidamento e apogeo, non date storiche identiche per tutti.
L'ambientazione della nuova versione precede le armi da fuoco.

Il risultato comprende catalogo, motore, mazzi, bot, selezione iniziale,
Deck Builder, archivio, tutorial, multiplayer, replay e funzionamento offline.
La prima versione giocabile interna può usare illustrazioni provvisorie;
il rilascio completo comprende anche le strutture descritte più avanti.

Questo documento è una proposta esecutiva. Le quantità, gli effetti e le soglie
indicati sono ipotesi iniziali da validare; non sostituiscono oggi il GDD v1.0.

## 2. Punto di partenza verificato

Esistono già i tre preset in `data/decks/`, tutti sul catalogo comune di 45 carte.
Le composizioni attuali, contando le copie, sono:

- `balanced-tactical.json`: Era I 4 Economia / 14 Unità / 2 Istantanee;
  Era II 3 / 15 / 2; Era III 16 Unità / 2 Istantanee / 2 Riconversioni.
- `aggro-breach.json`: Era I 2 Economia / 18 Unità / 0 Istantanee;
  Era II 2 / 14 / 4; Era III 14 Unità / 4 Istantanee / 2 Riconversioni.
- `boom-economy.json`: Era I 9 Economia / 8 Unità / 3 Istantanee;
  Era II 9 / 10 / 1; Era III 13 Unità / 1 Istantanea / 6 Riconversioni.

Questi sono riferimenti per misurare il cambiamento, non dimostrazioni di
bilanciamento. In particolare, molte carte Economia nel mazzo non implicano
che sia conveniente costruirle tutte: gli slot disponibili sono 4, 5 e 6.

Vincoli tecnici rilevati:

- `CardRules` e `DeckPayload` non hanno una civiltà. I tipi sono presenti sia
  negli schemi dati sia nel motore; il protocollo usa schemi rigorosi.
- Il generatore GDD impone esattamente 45 carte e 15 per Era; anche test e
  validatori contengono aspettative legate al catalogo originale.
- Gli edifici sono attualmente solo economici, persistono fra le Ere e restano
  nascosti all'avversario. Non esistono strutture attivabili o di supporto.
- La battaglia usa snapshot, danno simultaneo e bersagli FIFO; le nuove abilità
  devono rispettare queste regole, compresa la terminazione anticipata.
- Versioni `1.0` sono fissate in stato, eventi, protocollo e persistenza.
- I preset sono esportati da `HomeScreen.tsx` e importati da altre schermate;
  `App.tsx` usa anche la posizione nell'elenco per scegliere i default.
- Il simulatore alterna già P1/P2 e raccoglie vittorie, pareggi, brecce, razzie,
  stalli e utilizzo delle carte. Non va ricostruito da zero.

## 3. Regole di design proposte

### Appartenenza e costruzione dei mazzi

Una sola civiltà per mazzo e per tutta la partita, pubblica dalla preparazione.
Sono consentite carte comuni e carte della propria civiltà; sono vietate quelle
esclusive delle altre. Il limite di copie resta globale sul mazzo.
La civiltà non cambia la pesca, il cap logistico, le tre risorse o la condizione
di vittoria. Tutte le categorie fondamentali devono restare accessibili tramite
il nucleo comune: nessun archetipo perde completamente le contromisure.

### Regni feudali

- **Organizzazione:** la prima Unità giocata con successo in ciascuna Era costa
  1 Cibo in meno, minimo zero. Anche un'unità d'assedio consuma il beneficio;
  una prima unità con costo Cibo zero lo consuma senza rimborso.
  Tentativi illegali non lo consumano; il contatore si azzera al cambio d'Era.
- Carte centrali: Fante con Scudo, Lancieri, Balestriere, Cavaliere feudale,
  Mulino e assedio comune. Il mazzo deve avere una fonte di Metallo in Era I
  oppure una curva iniziale che ne tolleri l'assenza.
- **Mercato**, struttura esclusiva di Era II: durante lo sviluppo spendi
  un'opportunità d'azione per scambiare 2 unità della stessa risorsa con 1 di
  un'altra. Massimo un'attivazione per giocatore per Era, anche con più Mercati;
  rispetta il cap di magazzino e non consente di agire dopo Passo.
- Debolezza: minore specializzazione; una composizione sbagliata non viene
  compensata dal bonus economico.

Composizione iniziale da provare: Era I 6 Economia / 11 Unità / 3 Istantanee;
Era II 4 edifici / 13 Unità / 3 Istantanee, con il Mercato che sostituisce una
carta Economia; Era III 14 Unità / 4 Istantanee / 2 Riconversioni.
Le quattro carte edificio di Era II non equivalgono a quattro produttori.

### Norreni

- **Bottino di guerra:** in una razzia legale, fino a 2 Cibo e 2 Legno invece
  di 1 ciascuno, entro disponibilità nemiche e cap dell'attaccante. Nessun
  Metallo; nessuna razzia senza breccia o dopo la distruzione del Centro Città.
- **Furia:** +2 ATK solo nel primo ciclo effettivamente eseguito della mischia;
  nessun bonus nel tiro, nell'impatto della cavalleria o alla DEM. Si applica
  solo alle carte che riportano l'attributo, non a tutta la civiltà.
- Nucleo: Razziatore costiero, Casa lunga, Huscarl, Approdo mercantile,
  Berserker, Chiamata del Thing. Casa lunga e Approdo sono edifici economici;
  l'Approdo non richiede l'introduzione di un sistema navale.
- La Chiamata è un'istantanea con bersaglio Fanteria da definire nel catalogo;
  non deve potenziare implicitamente tutti i Lancieri perché sono sul Fronte.
- Debolezza: assedio pesante e cavalleria meno efficienti, vulnerabilità quando
  l'investimento militare non produce brecce.

Composizione iniziale: Era I 3 Economia / 14 Unità / 3 Istantanee;
Era II 3 Economia / 14 Unità / 3 Istantanee;
Era III 14 Unità / 4 Istantanee / 2 Riconversioni.
La razzia in Era III non alimenta un'altra fase di sviluppo: il vantaggio finale
deve venire dalle carte e dagli investimenti precedenti. Non aumentare la DEM
automaticamente per compensare senza misurare le vittorie precoci.

### Bizantini

- **Ingegneria imperiale:** +2 HP Mura all'inizio di ogni Era, dopo la normale
  inizializzazione o formula di transizione. In Era I si parte quindi da 8 Mura.
  Non modifica HP massimi o danno accumulato del Centro Città.
- **Disciplina:** +1 ATK in mischia alle sole carte dotate dell'attributo se
  nello snapshot di inizio ciclo esiste un proprio Lanciere vivo. La morte del
  Lanciere nel ciclo rimuove il beneficio dal ciclo successivo, non retroattivamente.
- Nucleo: Lanciere di frontiera, Granaio imperiale, Skoutatos, Cisterna
  fortificata, Catafratto, Arsenale imperiale.
- **Cisterna**, struttura esclusiva di Era II: +2 HP Mura alle aperture d'Era
  successive alla costruzione, dopo il bonus di civiltà, una sola applicazione
  per giocatore anche con più copie. Questa proposta è un incremento, non una
  cura con un massimo da inventare; va descritta così anche sulla carta.
- Arsenale imperiale: riconversione di Era III, da definire usando inizialmente
  l'effetto esistente di risorse e bonus DEM; richiede un edificio economico.
- Debolezza: costi in Metallo e slot impegnati nello sviluppo. Le fortificazioni
  non danno punti direttamente e non devono rendere il pareggio la strategia migliore.

Composizione iniziale: Era I 7 Economia / 10 Unità / 3 Istantanee;
Era II 5 edifici / 12 Unità / 3 Istantanee, includendo la Cisterna;
Era III 13 Unità / 4 Istantanee / 3 Riconversioni.

### Strutture, visibilità e transizioni

Proposta: distinguere `economy` da un nuovo tipo `structure`. Entrambi consumano
uno slot alla costruzione e persistono fra le Ere. Gli edifici Economia restano
coperti; Mercato e Cisterna sono pubblici dalla costruzione, con un percorso UI
e una zona pubblica espliciti. Non hanno HP, non sono bersagli delle truppe e
non sono sacrificabili con le riconversioni economiche.
La Gilda conta solo gli edifici Economia: evitare un aumento implicito della resa.

L'uso del Mercato è pubblico, mentre risorse scambiate e saldi restano privati
durante lo sviluppo. Registrare eventi autorevoli completi e proiezioni filtrate.
Le variazioni pubbliche delle Mura della Cisterna non rivelano edifici coperti.
Nella fase interna senza strutture, i relativi slot dei preset sono occupati da
edifici Economia e non da carte prive di effetto.

## 4. Catalogo e coerenza storica

Budget iniziale di progettazione: nove carte esclusive norrene e nove bizantine,
tre per Era, più il Mercato dei Regni feudali. Si tratta di 19 schede da
specificare: alcune possono derivare da carte esistenti, quindi non si assume
automaticamente un catalogo finale di 64 carte.

In fase P0 produrre una scheda per ogni carta con ID, Era, appartenenza, tipo,
categoria, linea, costo, ATK/DEM/HP, produzione o effetto, timing, cumulabilità,
ruolo nel mazzo, contromisure, testo italiano e indicazioni artistiche.
Completare le tre carte per Era mancanti nei nuclei sopra: non lasciare slot
senza un ruolo. Redigere anche tutte le 180 occorrenze dei tre mazzi.

Il Berserker e il Catafratto già esistenti sono candidati all'esclusività nella
nuova versione. Prima di assegnarli verificare che gli altri mazzi abbiano
alternative comuni e che la migrazione dei mazzi precedenti sia esplicita.
Non duplicare una carta equivalente soltanto per aggirare il limite di tre copie.

Revisione obbligatoria del catalogo nuovo: Archibugiere, Bombarda di Bronzo,
Dragone Imperiale, Ussaro Alato e riferimenti ai cannoni nel flavor. Verificare
periodo, nome, illustrazione e testo; mantenere le statistiche solo dove coerenti
con il nuovo ruolo. Il Fuoco Greco può restare nel tema senza introdurre polvere
da sparo. Non aggiungere nuove risorse, navi combattenti, eroi o una quarta Era.

## 5. Sequenza di implementazione

Avanzamento dettagliato nel registro in fondo al documento. Ordine principale:
P0 → P1 → P2 → P3 → P4 → P5 → P6.

### P0 — Specifica delle civiltà e delle carte

- Consolidare le proposte della sezione 3, i nomi storici, i 19 slot di design,
  il nucleo comune e le tre liste complete con costi e copie.
- Registrare le decisioni nuove in `docs/DECISIONS.md` quando finalizzate;
  aggiornare GDD e TECH-SPEC per una nuova versione, conservando la v1.
- Definire un manifesto del catalogo con versione, ID attesi e conteggi per Era,
  comune ed esclusivi, usato da generatore e validatori.
- **Uscita:** nessun effetto ambiguo su timing, bersaglio, durata, visibilità,
  cumulabilità e consumo di azione; 20 carte per Era e max tre copie verificati
  su tutte le liste. Le statistiche restano etichettate come prima iterazione.

### P1 — Contratti, cataloghi e compatibilità

- Aggiungere `civilizationId` al mazzo e al giocatore; appartenenza comune o
  esclusiva alle carte; definizioni tipizzate delle tre peculiarità.
- Aggiornare insieme `data/schema/`, `packages/engine/src/types.ts`,
  `view-types.ts`, `deck.ts`, `packages/protocol/src/index.ts` e persistenza server.
- Validare l'Era tramite catalogo, non tramite nuovi prefissi dell'ID; client
  e server devono rifiutare allo stesso modo carte di una civiltà diversa.
- Versionare regole, cataloghi e formati di salvataggio. Conservare catalogo e
  interpretazione v1 per i replay: un aggiornamento non deve reinterpretare
  retroattivamente vecchie partite con abilità nuove.
- Preservare i mazzi salvati v1; offrire una copia migrata con sostituzioni
  dichiarate e validazione, senza attribuire silenziosamente una civiltà.
  Le partite della nuova modalità richiedono mazzi compatibili della stessa versione.
- Estendere `tools/gdd-to-cards.ts`, `card-effects.ts`, `content-validate.ts`
  e relativi test: conteggi dal manifesto, completezza rigorosa e generazione
  idempotente. Non eliminare semplicemente i controlli sulle quantità.
- **Uscita:** vecchi dati leggibili, nuovi mazzi validati, round-trip del
  protocollo corretto e scelte di versione riproducibili in salvataggi e replay.

### P2 — Motore: peculiarità e attributi

- Implementare Organizzazione con una funzione condivisa per costo effettivo,
  legalità, pagamento, UI e bot; includere il contatore nello stato e nell'hash.
- Implementare Bottino e Ingegneria in `siege-and-era.ts`, `setup.ts` e nei
  punti di apertura d'Era; distinguere bonus Mura da danno al Centro Città.
- Implementare Furia e Disciplina in `battle.ts`, mantenendo snapshot, FIFO,
  simultaneità, sei cicli massimi e guardie di terminazione.
- Estendere gli effetti delle istantanee per il bersaglio Fanteria.
- Esporre bonus e costi corretti tramite eventi/proiezioni e contributi di
  battaglia: il playback deve mostrare ciò che il motore ha risolto.
- **Uscita:** scenari deterministici per ogni effetto e interazione, nessun
  cambiamento alle partite v1 eseguite con regole v1.

### P3 — Catalogo e tre preset giocabili internamente

- Inserire le carte e i testi della prima iterazione, riutilizzando gli effetti
  esistenti dove bastano; includere Casa lunga, Approdo e Granaio come Economia.
- Creare i preset di civiltà e registrare le sostituzioni rispetto ai tre
  originali. Usare Economia provvisoria al posto di Mercato e Cisterna.
- Estrarre i preset in un modulo di contenuti condiviso fra schermate; usare ID
  espliciti per i default. Il mazzo consigliato ai nuovi utenti è Equilibrio Tattico.
- Adeguare Greedy e Rational a costi effettivi, nuove abilità e bonus; Random
  serve soprattutto per verificare legalità e assenza di blocchi.
- **Uscita:** i tre mazzi completano partite headless e locali, sono esportabili
  e importabili e possiedono tutte le contromisure di base.

### P4 — Strutture caratteristiche

- Implementare il tipo `structure`, persistenza, zona pubblica e conteggio slot;
  separare i produttori e i bersagli di riconversione dalle strutture di supporto.
- Aggiungere il comando di attivazione del Mercato, controlli su turno/Passo,
  costo, cap e limite per Era; inserire il comando nelle azioni dei bot.
- Implementare il bonus della Cisterna nell'ordine previsto alla transizione;
  più copie non moltiplicano il bonus.
- Aggiornare i preset con le strutture definitive e ripetere la calibrazione
  della curva economica; un edificio di supporto non genera rendita.
- **Uscita:** strutture giocabili in locale e online, senza cicli infiniti di
  scambio, fughe di informazioni o conteggi impropri nelle riconversioni.

### P5 — Esperienza completa e contenuti visivi

- Home: tre scelte con civiltà, stile, peculiarità, difficoltà e debolezza;
  applicare la selezione a giocatore e avversario in Bot, Hot-Seat e Online.
- Deck Builder: scelta civiltà, filtri, motivazione delle carte escluse,
  riepilogo costi e avviso sugli edifici di supporto senza produzione.
- Archivio e carte: emblemi, attributi, timing e costo effettivo senza confondere
  il costo stampato con lo sconto ancora disponibile.
- Battaglia, registro e replay: contributi di Furia/Disciplina, bonus Mura,
  razzie e attivazioni coerenti con gli eventi e con la privacy.
- Tutorial e regole: partire dall'equilibrato e spiegare slot, investimento,
  eserciti misti e peculiarità con esempi guidati.
- Generare arte coerente per civiltà dopo aver stabilizzato le schede; aggiornare
  testi alternativi, manifesti, cache PWA e verificare desktop/mobile/offline.
- **Uscita:** tutte le modalità usano gli stessi preset e regole; nessuna
  schermata mantiene selezioni basate su indici o cataloghi obsoleti.

### P6 — Bilanciamento e candidato al rilascio

- Eseguire il protocollo della sezione 6 e modificare una famiglia di parametri
  alla volta: copie, costi, statistiche, poi eventuali valori delle peculiarità.
- Salvare per ogni iterazione liste, versioni, seed, bot, report e motivazione.
- Eseguire i controlli della sezione 7 sulla versione definitiva.
- **Uscita:** tre mazzi completi e distinti, esiti documentati, nessuna regressione
  bloccante; limiti di bilanciamento residui dichiarati nel rapporto finale.

## 6. Protocollo di bilanciamento

Prima misurare i preset originali con regole v1, conservandone i report. Poi
confrontare i tre nuovi mazzi fra loro, con regole nuove: non mescolare versioni
per costruire una percentuale aggregata fuorviante.

Per ogni iterazione:

1. Verifica rapida: 100 partite per ciascuno dei tre abbinamenti distinti,
   Greedy contro Greedy, P1/P2 alternati, seed registrati.
2. Calibrazione: 1.000 partite per abbinamento e per configurazione Greedy/Greedy
   e Rational/Rational, distribuite su cinque seed master distinti. Totale
   6.000 partite; posti bilanciati dal simulatore già esistente.
3. Controlli: 200 partite per ciascuno dei tre mirror Rational/Rational;
   confronto incrociato Greedy/Rational in entrambe le assegnazioni dei bot
   quando i risultati delle due strategie divergono.
4. Playtest umano: almeno 12 partite per abbinamento, alternando civiltà e
   iniziativa fra i partecipanti. Servono a verificare decisioni e leggibilità,
   non a stimare da sole un tasso di vittoria preciso.

Metriche esistenti da conservare: vittorie/sconfitte/pareggi, esito per Era,
breccia e razzia, stalli, danni e frequenza di pesca/giocata delle carte.
Estendere il report con score `(vittorie + 0,5 × pareggi) / partite`, risorse
prodotte/spese/perse per overflow, slot Economia/Strutture/Unità, attivazioni dei
bonus e passi con slot residui per mancanza di risorse. Distinguere correlazione
fra carta giocata e vittoria da un effetto causale della carta.

Obiettivi iniziali, da valutare per abbinamento e separatamente per bot:

- Score fra 45% e 55% come fascia desiderata; fuori 40–60% richiede una revisione
  prima del rilascio. Affiancare intervalli d'incertezza al 95%, calcolati sui
  punteggi 0/0,5/1, e risultati per seed; non dedurre equilibrio dal solo totale.
- Pareggi entro il 20% come obiettivo provvisorio; superarlo richiede analisi
  degli stalli e delle difese, anche se lo score è vicino al 50%.
- Differenza di score P1/P2 oltre cinque punti percentuali da investigare,
  insieme all'incertezza e alla differenza osservata nella baseline.
- Norreni distinguibili per pressione e brecce iniziali; Bizantini per maggiore
  investimento e tenuta; Regni per composizioni miste efficaci. Verificare
  queste caratteristiche nelle giocate, non solo nelle descrizioni dei mazzi.
- Zero comandi illegali, blocchi, fughe di dati o divergenze di replay. I bot
  devono saper usare gli effetti prima di giudicare deboli le relative carte.

Il numero di partite non garantisce da solo il bilanciamento. Se un obiettivo
non è raggiunto, registrare il motivo e iterare; non dichiarare il mazzo
bilanciato sulla sola base dell'avvenuta simulazione.

## 7. Verifiche e definizione di completamento

Scenari necessari: sconto su costo zero e costo uno; tentativo illegale e reset
d'Era; razzia con cap pieno, risorse nemiche insufficienti e Centro Città
distrutto; bonus Mura nell'Era I e nelle transizioni; Furia senza accesso alla
mischia; Disciplina con morte simultanea del Lanciere; attivazione Mercato dopo
Passo o ripetuta; Cisterna duplicata; strutture escluse da sacrifici e Gilda;
eventi pubblici/privati; replay v1 e nuova versione; errori di appartenenza.

Verifiche end-to-end: scelta dei tre mazzi, import/export e migrazione, partita
Bot e Hot-Seat, multiplayer con riconnessione, replay completo e saltato,
aggiornamento PWA e avvio offline con le nuove illustrazioni.

Controlli del repository da eseguire durante l'implementazione, non già eseguiti
come parte di questa pianificazione:

```sh
pnpm content:validate
pnpm exec tsx tools/gdd-to-cards.ts --check
pnpm lint
pnpm typecheck
pnpm test
pnpm validate:scenarios
pnpm art:placeholders
pnpm art:build
pnpm build
pnpm exec tsx tools/check-bundle-budget.ts
pnpm test:e2e
```

Completamento: tre preset da 60 carte legali e selezionabili in tutte le
modalità, peculiarità e strutture operative, catalogo senza armi da fuoco nella
nuova versione, vecchi dati gestiti esplicitamente, arte e tutorial aggiornati,
controlli superati e rapporto di bilanciamento riproducibile allegato.

## 8. Prima attività eseguibile

P0 completata: specifica in `GDD-v2.md` e `TECH-SPEC-v2.md`, decisione DEC-008.
Il catalogo v2 contiene 62 carte: 43 comuni, 1 feudale, 9 norrene, 9 bizantine;
21/22/19 carte nelle Ere. Tutte le 180 occorrenze sono in `data/v2/decks/`.
Le schede includono costo, statistiche, effetti, ruolo, contromisure e direzione
artistica. Timing e cumulabilità sono normativi nel GDD v2; statistiche e copie
sono prima iterazione. I file v1 rimangono la fonte dei contenuti storici.

## 9. Registro di implementazione e verifiche

### 30 ottobre 2026 — P0 e fondazioni P1

- Workspace iniziale con modifiche UI e documenti non committati: preservati.
  Nessun AGENTS.md trovato nel repository.
- Baseline prima delle modifiche: `pnpm test`, 34 file / 283 test superati.
- P0: definite le 19 schede, nucleo comune, liste finali e sostituzioni storiche.
  Le quattro carte fuori periodo hanno nuovi ID; Berserker e Catafratto
  cambiano appartenenza solo nella v2. Non sono aggiunti duplicati equivalenti.
- Decisioni aggiuntive: Disciplina dopo dimezzamento Arcieri; Mercato vietato
  a destinazione piena; Organizzazione privata durante sviluppo per evitare
  di rivelare il tipo delle carte coperte; collisioni delle copie in migrazione
  segnalate, senza tagli automatici.
- Manifesti v1/v2 controllano ID esatti, totali, Ere e appartenenze. Generatore
  v2 deterministico dalla specifica JSON; GDD v1 conserva il generatore originale.
- Prima generazione verificata: 62 schede e tre mazzi legali da 60 carte,
  20 per Era e massimo tre copie. La disponibilità dei dati non implica ancora
  giocabilità: motore, selezione UI e strutture v2 sono fasi successive.

### 30 ottobre 2026 — P1–P4 implementate, integrazione P5

- Contratti v2 con metadati espliciti e civiltà obbligatoria; cataloghi v1 e v2
  separati. Validazione condivisa dell'Era e dell'appartenenza. Persistenza,
  matchmaking e replay scelgono la versione corretta; il replay usa il catalogo
  salvato nella partita, anche se il catalogo corrente è diverso.
- Migrazione pura ed esplicita: crea un nuovo ID, elenca sostituzioni ed eventuali
  collisioni oltre tre copie. Il salvataggio originale resta disponibile.
- Organizzazione con costo condiviso fra legalità, pagamento, bot e UI; Bottino,
  Ingegneria, Furia, Disciplina e bersaglio Fanteria implementati. Test sui
  contatori, snapshot simultanei, limiti di risorse e contributi autorevoli.
- Mercato e Cisterna persistenti nella zona pubblica. Mercato usa un'azione,
  non uno slot aggiuntivo; scambi privati, attivazione pubblica. Strutture escluse
  da produzione, sacrifici e conteggio della Gilda. Copie della Cisterna non
  cumulano il bonus; reset del Mercato al cambio d'Era.
- Preset condivisi e default per ID esplicito; tre mazzi selezionabili in locale
  e online. Archivio v2 con filtro civiltà, Deck Builder con esclusioni motivate,
  migrazione e riepilogo strutture. Controllo preventivo delle versioni in Home.
- Tutorial introduttivo v2 con Equilibrio Tattico, Organizzazione e investimento
  di uno slot economico prima di un esercito misto; mantenute le esercitazioni v1.
- Pipeline immagini estesa all'unione dei cataloghi: 66 ID, 21 nuovi placeholder
  SVG e relative varianti AVIF/WebP. Le illustrazioni finali restano da produrre
  dopo stabilizzazione delle schede, come richiesto da P5.

### 30 ottobre 2026 — Verifiche e calibrazione iniziale P6

- Baseline v1: 300 partite Greedy in `balance/1.0/greedy/`.
- Smoke v2: 300 partite senza strutture (`balance/2.0-internal/greedy/`),
  300 con strutture Greedy e 300 Random. I preset interni sostituiscono davvero
  Mercato/Cisterna con Economia; nessuna carta con effetto mancante.
- Calibrazione: `tools/expansion-calibration.ts`, 6.000 partite sui cinque seed,
  600 mirror Rational e 600 controlli incrociati. Dati, liste e catalogo congelati
  in `balance/2.0/calibration-01e581b903b4/inputs.json`; report separati per seed,
  abbinamento e strategia. Zero eccezioni o comandi illegali durante l'esecuzione.
- Aggiunte metriche di score con intervallo 95% sui punteggi 0/0,5/1, risultati
  per posto, produzione/spesa/overflow, slot e attivazioni. I passi per risorse
  misurano le decisioni esplicite di Passo con slot residui.
- **Esito non approvato per rilascio:** pareggi fra 57% e 76,5% nei singoli
  campioni di calibrazione; Norreni/Bizantini Greedy scende sotto score 40%.
  Il campione non dimostra equilibrio. Le battaglie spesso hanno un vincitore,
  ma non causano danni al Centro Città: analizzare accesso all'assedio e curva
  delle risorse prima di modificare automaticamente DEM o peculiarità.
- Verificati finora: contenuti e generatore `--check`, lint, typecheck,
  18 scenari storici, pipeline arte, build e budget JS (205,32 KiB gzip / 250).
  Suite completa ed E2E sono in revisione; non considerarli ancora superati.
- Restano obbligatori: chiusura dei test UI/E2E, verifica nuova modalità offline
  e riconnessione, iterazione del bilanciamento, illustrazioni finali e almeno
  36 partite di playtest umano (12 per abbinamento). Non sostituire questi
  playtest con partite simulate e non segnare P5/P6 complete in loro assenza.

### 30 ottobre 2026 — Ripetizione delle verifiche

- Playwright su codice stabile: 53 test superati e 4 esclusi intenzionalmente;
  desktop, mobile orizzontale e verticale, inclusi migrazione, tutorial v2,
  partita online con riconnessione e replay, avvio e partite offline.
- Build e typecheck superati; budget JS 205,44 KiB gzip su 250 KiB. Generatore,
  validazione contenuti e 18 scenari superati. Il lint dei sorgenti passa con
  `pnpm exec eslint . --ignore-pattern 'test-results/**'`: il comando standard
  include le tracce Playwright generate e richiede un'esclusione in configurazione.
- Una prima suite Vitest eseguita sotto carico ha completato 306/308 test, con
  due timeout nell'Archivio a 5 secondi; la ripetizione isolata è passata
  integralmente: 38 file e 308 test superati.
- Due esperimenti sulle sole copie, con 100 partite per abbinamento e bot, sono
  conservati sotto `balance/2.0/experiment-*`: più economia norrena migliora
  lo score contro i Bizantini nel campione rapido ma lascia molti pareggi;
  più assedio sbilancia Regni/Norreni. Nessuno è promosso a preset definitivo.
