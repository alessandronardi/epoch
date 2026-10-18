# The Epochs — Registro delle Decisioni Architetturali e di Regole (ADR)

Questo documento traccia le interpretazioni normative del GDD e le decisioni architetturali adottate secondo il formato della sezione 13.3 di `docs/TECH-SPEC.md`.

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
