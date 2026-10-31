# The Epochs — Registro delle Decisioni Architetturali e di Regole (ADR)

Questo documento traccia le interpretazioni normative del GDD e le decisioni architetturali adottate secondo il formato della sezione 13.3 di `docs/TECH-SPEC.md`.

## DEC-008 — Espansione versionata delle civiltà

- **Stato:** SPECIFICA P0 FINALIZZATA; implementazione tracciata in DECK-EXPANSION-PLAN.md.
- **Data:** 2026-10-30, su richiesta dell'utente.
- **Scelta:** Regni feudali, Norreni e Bizantini; catalogo v2 separato di 62 carte (43 comuni e 19 caratteristiche). Regole, schede, arte da produrre e 180 occorrenze sono in GDD-v2.md e data/v2/.
- **Compatibilità:** nessuna sovrascrittura del catalogo o dei mazzi v1. Migrazione esplicita in copia; collisioni del limite di tre copie sono errori da correggere, mai tagli automatici. Replay selezionato per versione e catalogo originario.
- **Timing:** Disciplina si applica dopo il dimezzamento ATK degli Arcieri in mischia. Mercato vietato se la risorsa ricevuta è al cap. Organizzazione è privata durante sviluppo per non rivelare il tipo delle carte coperte. Cisterna non cumulabile fra copie.
- **Revisione storica:** quattro nuovi ID sostituiscono Archibugiere, Dragone, Ussaro Alato e Bombarda; quest'ultima diventa Ariete da Breccia con statistiche diverse. Berserker e Catafratto diventano esclusivi soltanto in v2. Restano alternative comuni con ruoli distinti.
- **Verifica iniziale:** suite pre-modifiche, 34 file e 283 test superati. Statistiche e copie v2 restano sperimentali fino a P6.

## DEC-007 — Separazione fra vista autorevole e presentazione della battaglia

- **Stato:** IMPLEMENTATA
- **Riferimento:** TECH-SPEC §4.5, §5.4, §9.5; `docs/BATTLE-CONSISTENCY-PLAN.md`.
- **Problema:** la vista finale sostituiva immediatamente il contesto della battaglia; il playback leggeva le assegnazioni dei danni con una convenzione opposta al motore e non riceveva i modificatori ATK risolti. Il registro diventava inaccessibile al ritorno allo Sviluppo.
- **Scelta:** mantenere `view` autorevole e una `presentationView` separata, filtrata per il giocatore che sta osservando lo scontro. Applicare gli eventi pubblici in ordine e adottare la vista finale alla conclusione o al salto. Controller e versioni dei comandi continuano a usare `view`.
- **Contratto:** `assignments` resta indicizzato per attaccante e `casualties` per proprietario. Il motore aggiunge snapshot delle unità a `BattleStarted` e contributi al danno a `BattlePhaseResolved`; il client non ricalcola combattimento o bonus.
- **Riproduzione:** annuncio, impatto simultaneo con registrazione e risultato con rimozione dei caduti condividono l'applicazione degli effetti usata dal salto. Pausa e velocità mantengono il tempo residuo. In hot-seat la presentazione pubblica termina prima del passaggio di dispositivo; i cambi ordinari di giocatore proteggono subito la nuova mano.
- **Riallineamento:** uno snapshot online senza eventi interrompe la riproduzione in corso con un messaggio esplicito. Non si ricostruiscono eventi mancanti.
- **Compatibilità:** i nuovi campi sono opzionali in lettura per i replay precedenti; in loro assenza non si inventano contributi o modificatori. L'introduzione dei campi richiede l'aggiornamento coordinato di client e server, poiché gli schemi precedenti sono strict. Gli hash dello stato e le regole di combattimento non cambiano.
- **Autore e data:** agente, su richiesta dell'utente (2026-10-29).

---

## DEC-001 — Scaling per Era basato sul valore stampato sulla carta (`D1`)
- **Stato:** CONFERMATA
- **Riferimento GDD:** §5.3 Fase 1 / Fase 2A / Fase 2B vs §7
- **Contesto:** Determinare se il bonus `+Era` (Tiro, Accerchiamento) e il danno `1 + 2×Era` (Impalamento) sulle carte conservate in mano e giocate in Ere successive debbano usare l'Era corrente della partita oppure il valore fisso stampato sulla carta nel catalogo §7.
- **Scelta adottata:** Vale sempre il valore stampato sulla carta (es. un *Cacciatore* di Era I infligge sempre `+1` contro i Lancieri anche se schierato in Era III; un *Picchiere di Leva* infligge sempre `3` danni in Impalamento). Il testo sulla carta corrisponde sempre esattamente all'effetto in battaglia.
- **Flag RulesConfig:** `rules.eraScalingSource = 'card'`
- **Autore e data:** umano / agente (2026-10-18)

---

## DEC-002 — Politica di timeout e disconnessione fuori dallo scarto (`D2`)
- **Stato:** CONFERMATA
- **Riferimento GDD:** §2.3.3
- **Contesto:** Definire il comportamento deterministico del motore/server in caso di scadenza del timer nelle fasi diverse dallo scarto per limite di mano (`hand_limit`).
- **Scelta adottata:** In `mulligan`: nessun cambio (`0` carte); in `hand_limit`: politica deterministica FIFO §2.3.3 (`autoDiscard`); in `development`: `Pass` automatico; in `prebattle`: nessuna Istantanea (`0` carte). Dopo `3` timeout consecutivi: `Concede` automatico.
- **Flag RulesConfig:** `rules.timeoutPolicy`
- **Autore e data:** umano / agente (2026-10-18)

---

## DEC-003 — Visibilità degli scarti per limite di mano e dell'edificio sacrificato (`D3`)
- **Stato:** CONFERMATA
- **Riferimento GDD:** §2.3.3, §3.4, §4.2
- **Contesto:** Stabilire se le carte scartate per il limite di mano a inizio Era e l'Edificio Economico sacrificato per *Gilda dei Mercanti* o *Altoforno Reale* siano visibili all'avversario.
- **Scelta adottata:** Coperto / Nascosto per l'avversario fino a fine partita. L'avversario vede solo il conteggio totale degli scarti (`discardCount`) e il decremento di `coveredCount`, così da non svelare mai la mano né il bluff economico.
- **Flag RulesConfig:** `rules.discardVisibility = 'hidden'`, `rules.sacrificeVisibility = 'hidden'`
- **Autore e data:** umano / agente (2026-10-18)

---

## DEC-004 — Calcolo ATK degli Arcieri in Mischia con modificatori da Istantanee (`D4`)
- **Stato:** CONFERMATA
- **Riferimento GDD:** §5.3 Fase 3
- **Contesto:** Stabilire se la formula di dimezzamento dell'attacco degli Arcieri in Mischia Generale `max(1, floor(ATK / 2))` si applichi all'ATK base della carta o all'ATK effettivo comprensivo dei modificatori da Istantanee (`atkMod`).
- **Scelta adottata:** Si dimezza l'ATK effettivo (`effAtk = atkBase + atkMod`), premiando l'investimento di *Pioggia di Frecce* anche nei cicli di Mischia Generale (es. *Cacciatore* con ATK base `2` + *Pioggia di Frecce* `+2 = 4` -> Mischia `floor(4/2) = 2 ATK`).
- **Flag RulesConfig:** `rules.archerMeleeUsesEffectiveAtk = true`
- **Autore e data:** umano / agente (2026-10-18)

---

## DEC-005 — Momento di assegnazione del contatore `seq` alle unità (`D5`)
- **Stato:** CONFERMATA
- **Riferimento GDD:** §1, §5.3
- **Contesto:** Definire in quale istante venga assegnato il numero d'ordine `seq` (usato per la priorità FIFO di bersagliamento all'interno della stessa linea) alle unità schierate coperte.
- **Scelta adottata:** Assegnato al momento della giocata coperta in `development` (`PlayCard`), tramite contatore monotono globale. L'ordine relativo FIFO di schieramento viene così preservato fedelmente alla rivelazione.
- **Flag RulesConfig:** `rules.seqAssignedAt = 'play'`
- **Autore e data:** umano / agente (2026-10-18)

---

## DEC-006 — Comportamento quando il giocatore di turno non ha mosse legali in `development` (`D6`)
- **Stato:** CONFERMATA
- **Riferimento GDD:** §4.1
- **Contesto:** Stabilire se il motore debba passare automaticamente il turno quando il giocatore attivo in `development` non ha alcuna carta legalmente giocabile (per risorse o cap logistico).
- **Scelta adottata:** Default configurabile: `autoPassWhenNoLegalPlay: false` nelle partite contro umani (il pulsante `"Passo"` viene evidenziato come unica azione disponibile, così da non rivelare istantaneamente per via del tempo di risposta zero che il giocatore non ha mosse legali; il giocatore clicca `"Passo"`), mentre i Bot e `ApplyTimeout` passano automaticamente.
- **Flag RulesConfig:** `rules.autoPassWhenNoLegalPlay = false`
- **Autore e data:** umano / agente (2026-10-18)
