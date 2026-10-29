# Epochs — ricognizione e piano del tutorial

Ricognizione iniziale e piano del 28 ottobre 2026. Le sezioni di inventario e criticità descrivono il punto di partenza; lo stato delle consegne è riportato qui sotto.

## Prima implementazione — A–C

La prima consegna applica A–C e include l’esercitazione di scarto prevista come alternativa nel piano. L’incremento D è descritto nella sezione seguente; E accompagna la verifica di ogni consegna.

- **A — Interfaccia comune.** `MatchTable.tsx` compone lo stesso tavolo, mano, controlli, barra di Pre-Battaglia e finestre in partita e tutorial. L’ispezione è montata una sola volta da `BattlefieldBoard`. La Città propria è una destinazione drag registrata, come i controlli. Il ventaglio mantiene raggiungibili le prime carte quando serve scorrere; Escape non viene sovrascritto dai listener del trascinamento.
- **B — Comandi reali.** `tutorial-controller.ts` riceve i comandi dei componenti, verifica l’obiettivo e li inoltra al controller locale. Un comando errato restituisce un suggerimento recuperabile; un comando accettato attende la proiezione e il completamento della coda prima del passo seguente. Il blocco usa lo stato sincrono, anche durante la pausa e contro input duplicati. I pulsanti della guida proseguono soltanto le spiegazioni.
- **C — Percorso principale.** Mulligan, Passo, Istantanee, Riconversioni e riepilogo usano l’interfaccia reale. Sono esercitati ispezione e chiusura, deselezione, motivo di fase non valida, annullamento di Passo e Riconversione e apertura del Registro. I consigli sono inclusi nel dialogo attivo; riavvio e uscita sono disponibili anche lì. Il riepilogo permette di esplorare e riaprire il tavolo; Nuova Partita avvia una partita libera contro un Bot.
- **Scarto senza alterazioni artificiali.** La partita principale conserva la sequenza e il bilanciamento verificati. Al termine, dopo Esplora Tavolo e Registro, si può avviare una breve esercitazione separata: mantenere otto carte, passare l’Era I, confermare zero Istantanee, pescare cinque carte in Era II e scartarne tre nella finestra normale. Selezione, deselezione, suggerimento FIFO e conferma sono quelli della partita libera.

### Verifica della consegna

I test integrati attraversano le tre Ere tramite i componenti reali e controllano esito ai punti, Breccia, DEM, danni al Centro Città e Razzia. Verificano anche lo scarto da 13 a 10, i tentativi fuori obiettivo, il riavvio, l’uscita e la pulizia della coda. I test del gateway confrontano stati ed eventi con quelli dello stesso controller senza guida e controllano rifiuto di input duplicati e azioni durante la pausa. I test browser verificano il percorso completo su desktop 1280×800, mobile orizzontale 800×360 e mobile verticale 360×800, incluse finestre, tastiera, ritorno del focus, pausa/ripresa e velocità. Il trascinamento sulla Città e sui controlli e l’avvio della partita libera sono verificati su desktop; le viste mobile percorrono le azioni con clic/tap. Le schermate di Mulligan, esito e scarto sono controllate anche attraverso screenshot.

Verifiche completate: 73 test web, quattro casi browser del tutorial e tre della partita libera sulle viste previste; build TypeScript/Vite e lint riusciti. Il drag pointer è verificato sul desktop, mentre le carte sono attivate con tocchi reali nei test mobile.

## Incremento D — esercitazioni complementari

Il pulsante **Esercitazioni** è disponibile dalla guida e dalle finestre reali. Apre un menu di tredici percorsi indipendenti, inclusi partita principale e scarto. I completamenti sono conservati soltanto nel browser e non mantengono una partita in corso; si può ripetere qualsiasi percorso.

- **Magazzino e slot.** Tre Fattorie e una Segheria raggiungono legalmente il cap economico di 7 Cibo e i quattro slot dell’Era I. Il giocatore consulta il motivo reale `no_slot` su una seconda Segheria pur avendo Cibo sufficiente.
- **Costi e Istantanee.** Il Cavaliere Feudale mostra il Metallo mancante. Nella barra di Pre-Battaglia due Palizzate costano 4 Legno complessivi e rendono indisponibile la terza; la prova richiede di leggere il totale e cancellare la selezione con il controllo normale.
- **Esiti alternativi.** La variante per distruzione conserva le prime due Ere e schiera due Bombarde di Bronzo in Era III: 42 DEM, 14 Mura e 28 danni diretti contro 22 HP, senza Razzia dopo la distruzione. Il percorso del pareggio conserva le carte, esercita due scarti e arriva a Centri Città con gli stessi HP. La resa usa lo stesso pulsante della partita libera. I testi del riepilogo descrivono il confronto degli HP effettivamente applicato dal motore.
- **Timeout.** Una dimostrazione locale comprime l’attesa a 1,5 secondi per finestra e applica tre `ApplyTimeout` attraverso il controller ordinario: mano mantenuta, Passo automatico e abbandono alla terza scadenza. Il giocatore osserva la politica; nessun pulsante della guida decide un timeout al suo posto. Uscita e riavvio cancellano il timer.
- **Privacy hot-seat.** Il controller locale passa realmente da P1 a P2 e viceversa. Durante la consegna il tavolo e la mano non sono montati; la conferma privacy svela la nuova vista soltanto dopo il completamento degli eventi. Il pulsante resta disabilitato durante la transizione, anche nella partita libera. Il gateway impedisce comandi prima della consegna.
- **Controlli di riproduzione.** Un percorso dedicato arriva alla prima battaglia e parte in pausa. Richiede Riprendi, Pausa, 2× e Riprendi prima di poter completare le animazioni; se la riproduzione termina prima della prova, la guida indica di ricominciare. La partita principale resta completabile senza questa prova accessoria.
- **Archivio.** Ricerca, filtri Era/Tipo, apertura e chiusura di una sola ispezione e ripristino dei filtri sono osservati nei componenti dell’Archivio.
- **Deck Builder.** Un’istanza senza persistenza ospita una bozza di esercitazione. Il tour richiede preset valido, rimozione e ripristino di una carta, esportazione e reimportazione tramite file oppure testo JSON. La bozza e i mazzi personali non vengono modificati.
- **Online e replay.** Lobby, controller remoto e visualizzatore sono quelli ordinari, con trasporto e caricamento replay sostituiti da una demo locale dichiarata. Si provano coda veloce, stanza EPOCH, codice errato e correzione, disconnessione e riconnessione manuale dalla lobby. Il replay deriva da comandi legali del motore e permette avanzamento, passo indietro, Play/Pausa, Fine, P2, Pubblico e reset. Le mani e gli eventi privati sono oscurati nel replay pubblico. La demo non apre socket di gioco o richieste API esterne; non simula una partita pubblica né certifica il comportamento del server reale.

### Verifica dell’incremento D

I test confrontano le fasi attese con le transizioni legali, validano tutti i mazzi delle varianti e verificano esiti, risorse, slot e visibilità. Le prove UI usano i controlli reali, inclusi annullamento della selezione di Istantanee, passaggio dispositivo, resa, pulizia dei timer e salvataggio dei progressi. Le prove browser coprono anche import/export e demo online/replay senza rete.

Verifica finale: **95 test web** e **20 casi browser riusciti** (13 sull’incremento D e sette di regressione), su desktop, mobile orizzontale e mobile verticale. Le prove browser coprono l’importazione del file JSON realmente esportato; l’importazione del testo incollato è coperta dai test UI. I test del trasporto e del replay verificano assenza di socket esterni, pulizia dei timer e oscuramento degli eventi privati.

## Obiettivo

Accompagnare il giocatore attraverso una partita reale e commentata sulle tre Ere, usando gli stessi controlli delle partite libere. La guida spiega, evidenzia e verifica le azioni; il motore applica le regole. I pulsanti della guida servono a proseguire le spiegazioni, non a giocare carte o confermare decisioni al posto del giocatore.

Una partita principale insegna il percorso completo. Esercitazioni accessorie coprono le alternative incompatibili con un unico percorso: tenere tutta la mano oppure cambiarla, vincere per distruzione oppure arrivare al conteggio finale, resa, timeout e modalità hot-seat.

## Inventario delle interazioni

### 1. Preparazione e mano iniziale

- Dalla home: scelta bot Base/Tattico, mazzo proprio e avversario, avvio partita; oppure due mazzi per hot-seat. Seed nelle impostazioni partita.
- Mulligan: selezionare/deselezionare carte nella finestra dedicata, leggere il contatore, ispezionare le carte, confermare la sostituzione oppure tenere tutta la mano.
- Decisioni simultanee: comprendere il blocco della scelta e l'attesa dell'altro giocatore. La conferma non è un comando di annullamento.
- Scoprire le risorse, l'iniziativa, il turno, l'Era e il ciclo; distinguere il proprio stato dalle informazioni nascoste dell'avversario.

Riferimenti: `HomeScreen.tsx`, `MulliganAndDiscardModals.tsx`, `BattlefieldBoard.tsx`, `view-types.ts`.

### 2. Consultazione e controllo della mano

- Mano a ventaglio: selezione/deselezione di una carta; anteprima della selezione e pulsante di giocata.
- Consultazione tramite doppio clic/doppio tap, pressione prolungata di 250 ms, tasto I o menu contestuale da tastiera; pulsante Ispeziona nei controlli.
- Finestra di ispezione: carta, regole, testo narrativo e spiegazioni delle parole chiave; chiusura dal pulsante, sfondo o Escape.
- Navigazione della mano con frecce, Home/End; selezione con Invio/Spazio; Escape pulisce selezione e avviso.
- Carte già sul campo e scarti pubblici consultabili attraverso i rispettivi controlli. Le informazioni coperte restano nascoste.

Riferimenti: `PlayerHand.tsx`, `Card.tsx`, `CardToken.tsx`, `CardInspectModal.tsx`, `CityAndLines.tsx`, `BattlePlaybackAndLog.tsx`.

### 3. Sviluppo: giocare e comprendere i limiti

- Selezionare un edificio o un'unità e premere Gioca Carta; alternativa tramite trascinamento nell'area dei controlli d'azione.
- Leggere costo, risorse residue, disponibilità di slot e turno; una giocata consuma l'opportunità prevista dalle regole.
- Vedere la carta collocata nella propria Città durante lo Sviluppo e la risposta dell'avversario. La linea è definita dalla carta: non esiste un comando per scegliere o spostare liberamente Fronte/Centro/Retroguardia.
- Osservare Raccolto, rendite e limiti di magazzino come effetti automatici; confrontare risorse prima/dopo.
- Tentare un'azione non disponibile e leggere il motivo: risorse insufficienti, slot esauriti, fase errata, assenza di edifici sacrificabili, Passo già dichiarato, scelta già bloccata.
- Annullare la selezione o un trascinamento senza giocare. Non risulta un comando di annullamento di una giocata già applicata.

Riferimenti: `ActionControls.tsx`, `PlayerHand.tsx`, `legal.ts`, `development.ts`.

### 4. Passo e rivelazione

- Premere Passo nei controlli normali, leggere la conferma, annullarla oppure confermare.
- Conoscere l'impostazione che disabilita la conferma per utenti esperti.
- Comprendere che il Passo vale per il resto dell'Era, l'attesa dell'avversario e la rivelazione successiva.
- Osservare le unità passare alle linee e le risorse avversarie diventare visibili; gli edifici avversari non diventano liberamente consultabili.

Riferimenti: `ActionControls.tsx`, `CityAndLines.tsx`, `view-types.ts`.

### 5. Pre-Battaglia e Istantanee

- Usare la barra reale di Pre-Battaglia, selezionare/deselezionare Istantanee e cancellare la selezione.
- Leggere costo complessivo, sostenibilità economica e anteprime degli effetti su Mura e attacco.
- Confermare più Istantanee oppure nessuna; comprendere che la scelta è segreta e si blocca dopo la conferma.
- Consultare le carte, ridurre/espandere la barra e attendere la decisione avversaria/rivelazione.

Riferimento: `PrebattleInstantsBar.tsx`.

### 6. Combattimento, registro e assedio

- Seguire Tiro, Impalamento, Impatto e Mischia; collegare statistiche, parole chiave, danni e cadute alle carte sul campo.
- Il combattimento sceglie bersagli e risolve attacchi automaticamente: il giocatore controlla la riproduzione, non impartisce ordini di attacco.
- Usare pausa/ripresa, velocità 1×/2× e completamento della riproduzione.
- Aprire/chiudere il cassetto Registro sui dispositivi compatti; leggere eventi, contatori dei tre sotto-mazzi, scarti e carte pubbliche consultabili.
- Osservare assedio, DEM, Mura, Breccia, danno al Centro Città e Razzia come conseguenze della battaglia.
- Leggere ciò che persiste e ciò che viene scartato nel passaggio d'Era.

Riferimenti: `BattlePlaybackAndLog.tsx`, `BattlefieldBoard.tsx`, `battle.ts`, `siege-and-era.ts`, `game-store.ts`.

### 7. Nuove Ere e limite di mano

- Osservare pesca d'apertura, nuove capacità, risorse e iniziativa secondo le regole del motore.
- Quando si supera il limite di 10: usare la finestra Scarto, selezionare/deselezionare l'esatto numero di carte richiesto e confermare.
- Provare il suggerimento automatico FIFO e ispezionare le carte prima della conferma.
- Comprendere la disponibilità delle carte conservate dalle Ere precedenti.

Riferimenti: `MulliganAndDiscardModals.tsx`, `discard-policy.ts`, `development.ts`.

### 8. Riconversioni in Era III

- Selezionare la Riconversione dalla mano e avviare la giocata normale.
- Nella finestra dedicata scegliere l'edificio da sacrificare, leggere guadagni netti, cap, eccedenze ed eventuale bonus DEM.
- Cambiare edificio, ispezionare le carte, annullare/chiudere oppure confermare.
- Osservare costo, sacrificio, risorse e consumo dell'opportunità dopo la conferma.

Riferimento: `ConversionModal.tsx`.

### 9. Fine partita e comandi di servizio

- Leggere esito e statistiche finali; chiudere il riepilogo per ispezionare il tavolo e riaprirlo; rivincita o ritorno alla home.
- Esiti supportati dal motore: distruzione, punti, pareggio, resa e timeout. Lo scenario attuale del tutorial termina con vittoria ai punti, pur mostrando Breccia e Razzia.
- Resa dal pannello di partita; ritorno alla home. Il tutorial deve distinguere chiaramente uscire dall'esercitazione da arrendersi in partita.
- Audio: silenziamento e volume sono controlli di servizio disponibili durante il gioco.

Riferimenti: `HotSeatAndGameOverModal.tsx`, `App.tsx`, `AudioControls.tsx`, `types.ts`.

### 10. Modalità e strumenti complementari

- Hot-seat: schermata privacy e conferma del passaggio dispositivo prima di mostrare la mano del nuovo giocatore.
- Online: connessione, coda veloce, creazione stanza, ingresso con codice, errori e riconnessione. Deadline e politiche di timeout appartengono a questa modalità; non sono una decisione tattica da far eseguire con un pulsante nel percorso locale.
- Replay: caricamento per identificativo, scelta prospettiva, riproduzione/pausa, passo avanti/indietro, reset e salto alla fine.
- Deck Builder: composizione dei sotto-mazzi, aggiunta/rimozione carte, validazione, import/export. Archivio: ricerca, filtri e consultazione carte.
- Queste funzionalità completano la scoperta del videogioco ma richiedono moduli dedicati; non devono interrompere le decisioni della prima partita.

Riferimenti: `OnlineLobbyScreen.tsx`, `remote-controller.ts`, `ReplayViewerScreen.tsx`, `DeckBuilderScreen.tsx`, `CardArchiveScreen.tsx`.

## Stato iniziale e punti individuati nella ricognizione

1. Esistono già un controller locale reale, mazzi deterministici e un avversario didattico. La sequenza attraversa le tre Ere e le quattro fasi di combattimento, con Riconversioni, Breccia e Razzia verificati dai test.
2. I passaggi di edificio/unità usano la mano e i controlli reali. Mulligan, Passo, Istantanee e Riconversioni sono ancora eseguiti da `advance()` attraverso `resolveTutorialCommand()`.
3. Il percorso non propone l'interazione di scarto al limite di mano e non riusa le finestre finali della partita.
4. La progressione è ancora un indice incrementato localmente. Serve riconoscere comando accettato, transizione del motore e completamento degli eventi visibili, evitando che il commento anticipi l'animazione.
5. La guida non verifica l'uso di ispezione, registro, controlli di riproduzione o annullamento. Alcune possibilità sono nominate ma non esercitate.
6. Destinazioni drag: il provider riconosce gli ID di campo e controlli; solo i controlli risultano registrati con `useDroppable`. La Città mostra un suggerimento di trascinamento ma non registra la destinazione. Occorre allineare comportamento e testo anche nella partita libera.
7. L'ispezione è già montata dentro `BattlefieldBoard`; `TutorialScreen` ne monta una seconda. Rimuovere la duplicazione prima di aggiungere altre finestre.
8. Nei passaggi di lettura `inspectOnly` presenta le carte come consultabili e salta la normale gestione di giocabilità: nella nuova versione mantenere i motivi reali, aggiungendo soltanto il vincolo didattico esplicito.
9. In `playTutorialCard()` il blocco delle animazioni usa il valore React `busy`; il gateway dei comandi dovrà controllare lo stato corrente in modo sincrono contro input rapidi o duplicati.
10. Con finestre modali aperte, il commento del tutorial deve essere visibile e associato al controllo attivo senza creare un secondo dialogo modale o alterare il focus previsto.

## Proposta del percorso principale

1. **Orientarsi e scegliere la mano.** Ispezione di una carta, risorse e turno, selezione nel vero Mulligan e conferma.
2. **Costruire l'economia.** Giocata di un edificio dalla mano, risposta avversaria, lettura delle rendite; annullamento della selezione e spiegazione di una giocata non disponibile.
3. **Preparare l'esercito.** Unità, occupazione degli slot e schieramento coperto. Insegnare selezione + pulsante e consentire il trascinamento come alternativa.
4. **Passare e preparare la battaglia.** Conferma/annullamento del Passo, rivelazione, scelta e conferma delle Istantanee con la barra reale.
5. **Leggere il combattimento.** Pausa/ripresa, velocità, registro, parole chiave e relazione tra danni e linee. Verifica dello stato dopo la battaglia.
6. **Affrontare l'Era II.** Pesca e scarto al limite con finestra reale, carte conservate e combinazioni tattiche; conferma di una Pre-Battaglia senza Istantanee.
7. **Riconvertire e assediare in Era III.** Scelta del sacrificio, anteprima, annullamento e conferma; DEM, Fuoco Greco, Breccia e Razzia.
8. **Comprendere l'esito e proseguire.** Riepilogo reale, ispezione del tavolo finale, avvio partita libera e accesso alle esercitazioni complementari.

Lo scarto nell'Era II richiede ricalibrare i mazzi/la sequenza con transizioni legali. Se renderlo parte della partita principale compromette chiarezza e durata, proporre subito dopo una breve esercitazione dedicata: non simulare carte o risorse con modifiche arbitrarie allo stato.

## Ordine di sviluppo proposto

### A. Rendere comune l'interfaccia di partita

Estrarre una composizione condivisa di mano, controlli, Pre-Battaglia, finestre e ispezione da usare in partita e tutorial. Sistemare destinazioni drag, duplicazione ispezione e visibilità della guida nelle finestre. Criterio: la stessa azione usa lo stesso controllo in entrambe le modalità.

### B. Collegare la guida alle azioni reali

Introdurre un adattatore del controller e obiettivi dichiarativi per i passi: interazione attesa, vincoli, condizione di successo, testo di aiuto, condizione di disponibilità del commento successivo. Intercettare tutti i comandi della UI; validarli prima di inoltrarli al controller e far avanzare soltanto dopo accettazione e allineamento della riproduzione. La guida non deve costruire ed eseguire i comandi al clic su Continua.

Le azioni fuori obiettivo producono un suggerimento recuperabile e non alterano lo stato. Consultazione, selezione, deselezione, annullamento, registro e impostazioni restano accessibili quando compatibili con la fase. Reset e uscita puliscono selezioni, modali, evidenziazioni, eventi e controller.

### C. Completare il percorso sulle tre Ere

Collegare Mulligan, Passo, Istantanee e Riconversioni ai componenti reali, integrare scarto e riepilogo, rivedere i commenti e verificare il bilanciamento dei mazzi. Ogni capitolo deve avere azioni del giocatore, conseguenze osservabili e spiegazioni brevi contestuali.

### D. Aggiungere esercitazioni e scoperta delle modalità

Varianti del Mulligan, scarto/FIFO, costi combinati e limiti, errori di fase, diversi esiti, resa, privacy hot-seat. Tour di Archivio e Deck Builder. Online/replay in un modulo dedicato, usando una sessione di test controllata o una dimostrazione dichiarata, senza richiedere una partita pubblica reale per completare il tutorial.

### E. Verificare il percorso completo

- Test integrati del tutorial attraverso i componenti UI reali, senza scorciatoie che chiamino il risolutore della guida per giocare.
- Confronto degli stessi comandi/stati tra partita normale e tutorial; preservare segretezza e legalità del motore.
- Casi di annullamento, scelta errata, input duplicato, pausa, ripresa, riavvio ed uscita da ogni finestra.
- Test browser per drag reale nella Città e nei controlli, alternativa clic/tap, tastiera, scorrimento e finestre su desktop e viewport stretta.
- Confermare che la guida non copra mano, pulsanti o modali e che il focus torni nel punto corretto.
- Verifica degli eventi mostrati, delle condizioni di vittoria e dello scarto, non soltanto della comparsa dei titoli dei capitoli.

## Decisione proposta

Sviluppare prima A–C come prima consegna completa della partita commentata. Pianificare D come percorso complementare con copertura esplicita, e applicare E durante ogni incremento. Prima di stimare tempi, chiudere la verifica delle destinazioni drag e la ricalibrazione dello scenario che deve raggiungere lo scarto.
