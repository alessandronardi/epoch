# The Epochs — Game Design Document (GDD v1.0 Definitivo)

**Stato:** Specifica normativa congelata per l'implementazione del motore di gioco e del prototipo.

---

## 1. Concetto e Termini Normativi

The Epochs è un gioco di carte competitivo 1v1 articolato in 3 Ere (Round). Ogni Era comprende una Fase di Sviluppo a cicli condivisi, una Finestra Pre-Battaglia simultanea e una Battaglia Campale deterministica seguita, in caso di vittoria campale, dall'Assedio.

- **Ciclo di sviluppo:** giro condiviso durante la Fase di Sviluppo in cui ciascun giocatore che non abbia ancora dichiarato Passo dispone di una singola opportunità d'azione, nell'ordine d'iniziativa dell'Era.
- **Carta da campo:** carta Economia o Unità collocata coperta nella zona cittadina. Consuma 1 slot del Cap Logistico dell'Era in cui viene giocata.
- **Carta istantanea:** carta giocata nella Finestra Pre-Battaglia; consuma 0 slot del Cap Logistico.
- **Riconversione:** carta giocata durante la Fase di Sviluppo dell'Era III; consuma 0 slot del Cap Logistico, ma costituisce l'unica carta giocabile in quell'opportunità d'azione e richiede il sacrificio di un Edificio Economico attivo.
- **Unità combattente (`is_combatant = True`):** unità appartenente alle categorie Fanteria, Lanciere, Cavalleria o Arciere. Le unità d'Assedio (`is_combatant = False`), gli edifici e le altre carte non sono unità combattenti.
- **DEM:** danno strutturale applicato nella Fase 4 contro Mura e Centro Città; non infligge danni alle truppe.
- **Ordine di pesca (`drawn_order`) e Ordine di schieramento (`seq`):** contatori interi monotoni crescenti assegnati rispettivamente a ogni carta pescata e a ogni unità schierata per risolvere in modo deterministico (FIFO) gli spareggi di scarto e di bersaglio.

---

## 2. Mazzi, Pesca, Limite di Mano e Zone

### 2.1 Composizione del Mazzo
Ogni giocatore utilizza tre sotto-mazzi distinti da **20 carte ciascuno** (Era I, Era II, Era III), per un totale di **60 carte**, con un massimo di **3 copie** per singola carta. I tre sotto-mazzi vengono mescolati separatamente a inizio partita.
L'Era indicata sulla carta definisce il sotto-mazzo di appartenenza ma non impedisce di giocare una carta conservata in mano in un'Era successiva, salvo per le carte di **Riconversione**, giocabili esclusivamente durante lo sviluppo dell'Era III.

### 2.2 Pesca e Mulligan
- **Inizio Era I:** ciascun giocatore pesca 8 carte dal sotto-mazzo di Era I e può effettuare una sola volta un *mulligan* simultaneo e coperto di un numero qualsiasi di carte (messe in fondo al sotto-mazzo di Era I dopo aver pescato lo stesso numero di carte dalla cima).
- **Inizio Era II:** ciascun giocatore pesca 5 carte dal sotto-mazzo di Era II.
- **Inizio Era III:** ciascun giocatore pesca 5 carte dal sotto-mazzo di Era III.
- Non esiste pesca all'inizio dei singoli cicli o turni.

### 2.3 Limite di Mano (10 Carte) e Politica di Scarto
1. All'inizio di ciascuna Era il giocatore pesca tutte le carte previste (8 in Era I, 5 in Era II, 5 in Era III), che si sommano a quelle già in mano.
2. Se dopo la pesca la mano supera le **10 carte**, il giocatore deve scegliere quali carte scartare dalla mano fino a riportarla a 10 carte prima dell'inizio del Ciclo 1.
3. **Politica deterministica per IA, simulatore e timeout/disconnessione:** si scartano per prime le carte di Era inferiore; a parità di Era, quelle con costo totale inferiore (`Cibo + Legno + Metallo`); a parità ulteriore, quelle pescate prima (`drawn_order` inferiore, FIFO).

---

## 3. Preparazione, Iniziativa e Cronologia Economica

### 3.1 Limiti di Magazzino
Le risorse sono **Cibo** (🍖), **Legno** (🪵) e **Metallo** (⛏️). Ogni accredito viene troncato al cap dell'Era corrente; l'eccedenza viene registrata come *overflow* e perduta:
- **Era I:** Cap 7 per ciascuna risorsa.
- **Era II:** Cap 11 per ciascuna risorsa.
- **Era III:** Cap 16 per ciascuna risorsa.

### 3.2 Iniziativa
Gli identificativi Giocatore 1 (P1) e Giocatore 2 (P2) sono assegnati casualmente all'avvio della partita. P1 agisce per primo in **Era I** e in **Era III**; P2 agisce per primo in **Era II**.

### 3.3 Valori Iniziali di Avvio Partita e Cronologia delle Risorse
1. **Inizializzazione di avvio partita (prima dell'Era I):**
   - **Strutture iniziali:** ciascun giocatore inizia la partita con `HP Mura = 6`, `HP Massimi Centro Città = 10`, `Danno diretto accumulato = 0` e `HP Correnti Centro Città = 10`.
   - **Zone iniziali:** 0 Edifici Economici in campo, 0 Unità in campo, 0 carte negli scarti.
   - **Dotazione iniziale di risorse:** ciascun giocatore riceve `2 Cibo, 2 Legno, 0 Metallo`.
2. **Raccolto d'apertura d'Era (all'inizio di ogni Era, prima del Ciclo 1):**
   - **Era I:** `+2 Cibo, +2 Legno, +0 Metallo` (sommandosi alla dotazione iniziale, porta il saldo effettivo prima della prima azione di Era I a **4 Cibo, 4 Legno, 0 Metallo**).
   - **Era II ed Era III:** `+2 Cibo, +2 Legno, +1 Metallo` più **due volte** il vettore di produzione di ciascun Edificio Economico già attivo.
3. **Ciclo di sviluppo 1:** si svolge senza rendita periodica aggiuntiva.
4. **Prima rendita periodica (all'apertura del Ciclo 2):** se almeno un giocatore non ha passato, entrambi i giocatori (incluso chi avesse già passato al Ciclo 1) ricevono `+1 Cibo, +1 Legno` più **una volta** il vettore di produzione degli edifici attivi in quel momento (inclusi gli edifici costruiti nel Ciclo 1).
5. **Ciclo di sviluppo 2:** svolgimento delle opportunità d'azione dei giocatori non passati.
6. **Seconda rendita periodica (all'apertura del Ciclo 3):** se almeno un giocatore non ha passato alla fine del Ciclo 2, entrambi i giocatori ricevono `+1 Cibo, +1 Legno` più **una volta** il vettore di produzione degli edifici attivi in quel momento (inclusi gli edifici costruiti nel Ciclo 2).
7. **Cicli 4 e successivi:** si svolgono senza ulteriori rendite periodiche fino al Passo di entrambi i giocatori.

### 3.4 Riconversioni in Era III
Giocabili solo durante la propria opportunità d'azione nello sviluppo di Era III; consumano 0 slot del Cap Logistico ma richiedono di pagare il costo e sacrificare 1 proprio Edificio Economico attivo:
- **Gilda dei Mercanti:** calcola il numero `N` di edifici attivi **prima** del sacrificio (l'edificio sacrificato è incluso in `N`), rimuove l'edificio scelto e accredita `+N Cibo, +N Legno, +N Metallo` entro il cap di 16.
- **Altoforno Reale:** rimuove l'edificio scelto, accredita `+2 Legno, +3 Metallo` entro il cap e conferisce `+1 DEM` a tutte le unità del giocatore in Era III (sia già schierate sia schierate successivamente nell'Era; cumulabile).

---

## 4. Fase di Sviluppo, Opportunità d'Azione, Cap Logistico e Visibilità

### 4.1 Cicli, Limite di Una Carta per Opportunità e Passo
- **Cap Logistico d'Era:** il numero massimo di nuove carte da campo (Economia + Unità) giocabili da ciascun giocatore in un'Era è **4 in Era I**, **5 in Era II** e **6 in Era III**. Gli edifici costruiti in Ere precedenti non occupano slot delle Ere successive. Istantanee e Riconversioni consumano `0 slot`.
- **Vincolo di esclusività dell'opportunità d'azione:** durante ciascuna opportunità d'azione all'interno di un ciclo, un giocatore che non abbia ancora dichiarato Passo **DEVE** scegliere esattamente una sola opzione:
  1. **Giocare al massimo una (1) carta** legalmente giocabile dalla propria mano (una carta Economia/Unità se dispone di slot del Cap Logistico, oppure una carta Riconversione in Era III se possiede almeno un edificio sacrificabile).
  2. **Dichiarare Passo** per l'Era corrente.
- Non è mai consentito giocare più di una carta nella medesima opportunità d'azione (neanche combinando una Riconversione a 0 slot con una carta da campo nello stesso turno).
- Se un giocatore non dispone di alcuna carta legalmente giocabile, deve dichiarare Passo. Il Passo è irrevocabile per l'Era corrente; il giocatore che ha passato viene saltato nei cicli successivi fino al Passo dell'avversario.

### 4.2 Matrice di Visibilità delle Informazioni
| Elemento di Gioco | Durante la Fase di Sviluppo | Dalla Finestra Pre-Battaglia a Fine Era |
| :--- | :--- | :--- |
| **HP Mura, HP Centro Città, Slot Cap usati, N° carte in mano** | **Pubblico** | **Pubblico** |
| **Saldo risorse e variazioni del magazzino** | **Privato** *(Nascosto)* | **Pubblico** |
| **Carte Unità schierate** | **Privato** *(Coperte nella città)* | **Pubblico** *(Rivelate sulle linee)* |
| **Carte Edificio Economico schierate** | **Privato** *(Coperte nella città)* | **Privato** *(Restano coperte)* |
| **Riconversioni (Era III)** | **Pubblico** al momento dell'attivazione | **Pubblico** *(Negli scarti)* |
| **Carte Istantanee** | **Privato** *(In mano)* | **Pubblico** alla rivelazione simultanea |

---

## 5. Finestra Pre-Battaglia e Risoluzione Deterministica del Combattimento

### 5.1 Finestra Pre-Battaglia Simultanea
Quando entrambi i giocatori hanno passato, tutte le Unità vengono rivelate e collocate sulle rispettive linee (*Fronte*, *Centro*, *Retroguardia*). Ciascun giocatore seleziona segretamente zero o più carte Istantanee dalla mano pagandone i costi. Le scelte vengono bloccate e rivelate simultaneamente: tutti i modificatori di ATK e di HP delle Mura vengono sommati e applicati insieme (gli HP delle Mura non possono scendere sotto 0).

### 5.2 Regola di Guardia Pre-Fase e Architettura di Risoluzione (Fasi 1, 2A, 2B, 3)
Prima di eseguire la **Fase 1**, la **Fase 2A**, la **Fase 2B** e ciascuno dei **6 cicli della Fase 3**, il motore verifica la presenza di unità combattenti vive (`is_combatant = True` e `HP > 0`):
- **Controllo di terminazione anticipata:**
  1. Se **nessuno** dei due giocatori ha unità combattenti vive (perché non ne sono state schierate o perché sono state tutte eliminate nella fase precedente), la battaglia campale termina immediatamente con **Annientamento Reciproco / Nessun Vincitore**: tutte le fasi di combattimento successive e la Fase 4 vengono saltate (eventuali unità d'Assedio superstiti non effettuano assedio).
  2. Se **uno solo** dei due giocatori ha almeno un'unità combattente viva e l'avversario ne ha zero, la battaglia campale termina immediatamente con la **vittoria campale** di quel giocatore: tutte le restanti fasi/cicli di combattimento tra truppe (2A, 2B o 3) vengono saltate e si passa direttamente alla **Fase 4 (Demolizione, Breccia e Razzia)**.
- **Esecuzione della fase (se entrambi i giocatori hanno almeno 1 combattente vivo):** ogni fase/ciclo applica la sequenza in 4 passaggi:
  1. **Snapshot:** lettura dello stato delle unità vive all'inizio della fase/ciclo.
  2. **Calcolo:** determinazione dei bonus condizionati e del danno totale di ciascun lato sullo snapshot, senza mutare lo stato.
  3. **Applicazione Simultanea:** assegnazione contemporanea dei danni ai bersagli ordinati per priorità di linea e, dentro la linea, per ordine di schieramento `seq` crescente (FIFO), con trasferimento del danno in eccesso al bersaglio successivo. Le unità d'Assedio (`is_combatant = False`) sono sempre escluse dai bersagli nelle Fasi 1, 2A, 2B e 3.
  4. **Rimozione:** eliminazione simultanea di tutte le unità con `HP <= 0` prima del controllo della fase/ciclo successivo.

### 5.3 Dettaglio delle 4 Fasi della Battaglia
- **Fase 1 — Tiro degli Arcieri:** ogni Arciere vivo infligge il proprio ATK, aggiungendo `+Era` se lo snapshot nemico contiene almeno un Lanciere vivo. Priorità bersagli: `Fronte → Centro → Retroguardia`.
- **Fase 2A — Impalamento:** ogni Lanciere vivo infligge `1 + (2 × Era)` danni solo alla `Cavalleria` nemica (in ordine FIFO `seq`). Le Cavallerie ridotte a 0 HP vengono rimosse prima della Fase 2B.
- **Fase 2B — Impatto e Accerchiamento:** sullo snapshot post-2A, ogni Cavalleria superstite somma il proprio ATK:
  - *Se lo snapshot nemico NON ha Lancieri vivi:* **Accerchiamento**. Ogni Cavalleria aggiunge `+Era` se lo snapshot nemico ha almeno un Arciere vivo; priorità bersagli: `Retroguardia → Fronte → Centro`.
  - *Se lo snapshot nemico ha almeno un Lanciere vivo:* nessun bonus; priorità bersagli: `Fronte → Centro → Retroguardia`.
- **Fase 3 — Mischia Generale (Max 6 Cicli):** si eseguono fino a 6 cicli (interrotti anticipatamente se si attiva la condizione di guardia pre-ciclo del paragrafo 5.2). Ad ogni ciclo tutte le unità combattenti vive sommano il proprio ATK (gli Arcieri contribuiscono con `max(1, floor(ATK / 2))`). Priorità bersagli: `Fronte → Centro → Retroguardia`.
  - **Stallo al 6° ciclo:** se dopo la rimozione dei caduti del 6° ciclo entrambi i giocatori conservano ancora almeno un'unità combattente viva, la battaglia termina in **Stallo** (nessun vincitore campale; la Fase 4 viene saltata).
- **Fase 4 — Demolizione, Breccia e Razzia:**
  - Si esegue esclusivamente se un giocatore ha ottenuto la vittoria campale (conserva almeno 1 unità combattente viva mentre l'avversario ne ha 0, sia per terminazione anticipata nelle Fasi 1/2A/2B sia durante la Fase 3).
  - Sia `D` la somma della DEM di tutte le unità superstiti del vincitore (combattenti superstiti + unità d'Assedio) e `W` gli HP correnti delle Mura del difensore:
    1. `breach = (D > 0) and (D >= W)`
    2. `HP Mura finali = max(0, W - D)`
    3. `Danno diretto al Centro Città = max(0, D - W)` (sommato al contatore di danno accumulato del difensore).
    4. Se `HP Centro Città <= 0`, la partita termina immediatamente con la vittoria dell'attaccante (senza eseguire la razzia).
    5. Altrimenti, se `breach == True`, l'attaccante razzia fino a **1 Cibo** e **1 Legno** dal difensore: per ciascuna delle due risorse trasferisce `min(1, risorsa_difensore, cap_attaccante - risorsa_attaccante)`. Il Metallo non può essere razziato.

---

## 6. Transizione d'Era e Condizioni di Vittoria

Alla fine dell'Era I e dell'Era II, se nessun Centro Città è a `<= 0 HP`:
1. Tutte le Unità superstiti (combattenti e d'Assedio) vengono scartate; gli Edifici Economici restano in campo.
2. Si aggiornano le Mura per la nuova Era: `HP Mura nuova Era = Base nuova Era + floor(HP residui Mura / 2)` (dove Base Era II = `8`, Base Era III = `10`).
3. Si aggiorna il Centro Città per la nuova Era: `HP Centro Città = Max nuova Era - Danno diretto accumulato` (dove Max Era II = `16`, Max Era III = `22`).

**Condizioni di Fine Partita:**
- **Annientamento:** vince immediatamente chi porta a `<= 0 HP` il Centro Città nemico.
- **Vittoria ai Punti / Pareggio:** se al termine della Fase 4 dell'Era III entrambi i Centri Città hanno `HP > 0`, vince il giocatore con più HP residui sul proprio Centro Città. In caso di parità di HP residui, la partita termina in **Pareggio**.

---

## 7. Catalogo Carte Ufficiale (45 Carte: 15 per Era)

### Era I
| ID | Nome Carta | Tipo / Cat. | Linea | Costo (🍖/🪵/⛏️) | ATK | DEM | HP | Effetto / Produzione |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `e1_farm` | **Fattoria** | Economia | — | 0 / 2 / 0 | — | — | — | Produzione: +1 Cibo |
| `e1_lumb` | **Segheria** | Economia | — | 2 / 0 / 0 | — | — | — | Produzione: +1 Legno |
| `e1_mine` | **Cava Grezza** | Economia | — | 2 / 2 / 0 | — | — | — | Produzione: +1 Metallo |
| `u1_inf_l` | **Milizia Cittadina** | Fanteria | Fronte | 2 / 0 / 0 | 2 | 1 | 3 | Unità combattente |
| `u1_inf_h` | **Fante con Scudo** | Fanteria | Fronte | 2 / 1 / 0 | 2 | 1 | 5 | Unità combattente |
| `u1_spr_l` | **Picchiere di Leva** | Lanciere | Fronte | 1 / 1 / 0 | 1 | 0 | 3 | Impalamento: 3 danni vs Cavalleria |
| `u1_spr_h` | **Lanciere Pesante** | Lanciere | Fronte | 1 / 2 / 0 | 2 | 1 | 4 | Impalamento: 3 danni vs Cavalleria |
| `u1_arc_l` | **Cacciatore** | Arciere | Retro | 1 / 1 / 0 | 2 | 0 | 1 | Tiro (+1 vs Lancieri); Mischia: 1 ATK |
| `u1_arc_h` | **Arciere d'Ordinanza** | Arciere | Retro | 1 / 2 / 0 | 3 | 0 | 2 | Tiro (+1 vs Lancieri); Mischia: 1 ATK |
| `u1_cav_l` | **Esploratore a Cavallo** | Cavalleria | Centro | 3 / 0 / 0 | 2 | 1 | 3 | Accerchiamento (+1 ATK vs Arcieri) |
| `u1_cav_h` | **Cavaliere Feudale** | Cavalleria | Centro | 2 / 0 / 1 | 4 | 1 | 3 | Accerchiamento (+1 ATK vs Arcieri) |
| `u1_sig_l` | **Squadra Genieri** | Assedio | Retro | 1 / 2 / 0 | 0 | 2 | 2 | Non combattente; solo Demolizione |
| `u1_sig_h` | **Ariete Batteria** | Assedio | Retro | 0 / 3 / 1 | 0 | 6 | 3 | Non combattente; solo Demolizione |
| `i1_arr` | **Pioggia di Frecce** | Istantanea | — | 0 / 2 / 0 | — | — | — | Pre-Battaglia (0 Slot): +2 ATK ai tuoi Arcieri |
| `i1_wall` | **Palizzata Extra** | Istantanea | — | 0 / 2 / 0 | — | — | — | Pre-Battaglia (0 Slot): +3 HP alle tue Mura |

### Era II
| ID | Nome Carta | Tipo / Cat. | Linea | Costo (🍖/🪵/⛏️) | ATK | DEM | HP | Effetto / Produzione |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `e2_mill` | **Mulino Idraulico** | Economia | — | 1 / 3 / 1 | — | — | — | Produzione: +2 Cibo |
| `e2_saw` | **Segheria Grande** | Economia | — | 3 / 1 / 1 | — | — | — | Produzione: +2 Legno |
| `e2_fnd` | **Fonderia** | Economia | — | 2 / 3 / 0 | — | — | — | Produzione: +2 Metallo |
| `u2_inf_l` | **Spadaccino Scelto** | Fanteria | Fronte | 3 / 0 / 1 | 5 | 2 | 5 | Unità combattente |
| `u2_inf_h` | **Uomo d'Arme** | Fanteria | Fronte | 3 / 1 / 1 | 4 | 2 | 8 | Unità combattente |
| `u2_spr_l` | **Alabardiere** | Lanciere | Fronte | 2 / 2 / 0 | 3 | 1 | 5 | Impalamento: 5 danni vs Cavalleria |
| `u2_spr_h` | **Guardia Svizzera** | Lanciere | Fronte | 2 / 3 / 1 | 3 | 2 | 6 | Impalamento: 5 danni vs Cavalleria |
| `u2_arc_l` | **Arciere Composto** | Arciere | Retro | 1 / 3 / 0 | 4 | 0 | 2 | Tiro (+2 vs Lancieri); Mischia: 2 ATK |
| `u2_arc_h` | **Balestriere Pesante** | Arciere | Retro | 1 / 3 / 1 | 5 | 0 | 3 | Tiro (+2 vs Lancieri); Mischia: 2 ATK |
| `u2_cav_l` | **Ussaro Alato** | Cavalleria | Centro | 3 / 1 / 1 | 5 | 2 | 4 | Accerchiamento (+2 ATK vs Arcieri) |
| `u2_cav_h` | **Cavaliere Corazzato** | Cavalleria | Centro | 3 / 0 / 2 | 6 | 2 | 6 | Accerchiamento (+2 ATK vs Arcieri) |
| `u2_sig_l` | **Scorpione d'Assedio** | Assedio | Retro | 0 / 3 / 1 | 0 | 6 | 3 | Non combattente; solo Demolizione |
| `u2_sig_h` | **Mangano Pesante** | Assedio | Retro | 0 / 4 / 2 | 0 | 10 | 5 | Non combattente; solo Demolizione |
| `i2_sab` | **Mina Sotterranea** | Istantanea | — | 1 / 0 / 2 | — | — | — | Pre-Battaglia (0 Slot): -4 HP alle Mura nemiche |
| `i2_mor` | **Grido di Guerra** | Istantanea | — | 2 / 0 / 1 | — | — | — | Pre-Battaglia (0 Slot): +2 ATK alle tue unità sul Fronte |

### Era III
| ID | Nome Carta | Tipo / Cat. | Linea | Costo (🍖/🪵/⛏️) | ATK | DEM | HP | Effetto / Produzione |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| `e3_gld` | **Gilda dei Mercanti** | Riconversione | — | 0 / 1 / 0 | — | — | — | 0 Slot. Sacrifica 1 tuo Edificio: +1 🍖, +1 🪵, +1 ⛏️ per tuo edificio pre-sacrificio |
| `e3_frn` | **Altoforno Reale** | Riconversione | — | 2 / 0 / 0 | — | — | — | 0 Slot. Sacrifica 1 tuo Edificio: +2 🪵, +3 ⛏️ e +1 DEM alle tue unità in Era III |
| `u3_inf_l` | **Berserker d'Élite** | Fanteria | Fronte | 4 / 0 / 2 | 8 | 3 | 8 | Unità combattente |
| `u3_inf_h` | **Campione Imperiale** | Fanteria | Fronte | 4 / 1 / 3 | 6 | 3 | 12 | Unità combattente |
| `u3_spr_l` | **Picchiere Reale** | Lanciere | Fronte | 3 / 3 / 1 | 4 | 2 | 7 | Impalamento: 7 danni vs Cavalleria |
| `u3_spr_h` | **Falange Imperiale** | Lanciere | Fronte | 3 / 4 / 2 | 5 | 2 | 9 | Impalamento: 7 danni vs Cavalleria |
| `u3_arc_l` | **Arciere Lungo Reale** | Arciere | Retro | 2 / 4 / 1 | 6 | 0 | 4 | Tiro (+3 vs Lancieri); Mischia: 3 ATK |
| `u3_arc_h` | **Archibugiere** | Arciere | Retro | 2 / 3 / 3 | 8 | 1 | 4 | Tiro (+3 vs Lancieri); Mischia: 4 ATK |
| `u3_cav_l` | **Dragone Imperiale** | Cavalleria | Centro | 4 / 1 / 2 | 7 | 2 | 6 | Accerchiamento (+3 ATK vs Arcieri) |
| `u3_cav_h` | **Catafratto Reale** | Cavalleria | Centro | 5 / 0 / 4 | 9 | 3 | 8 | Accerchiamento (+3 ATK vs Arcieri) |
| `u3_sig_l` | **Torre d'Assedio** | Assedio | Retro | 0 / 5 / 2 | 0 | 11 | 8 | Non combattente; solo Demolizione |
| `u3_sig_m` | **Trabucco Gigante** | Assedio | Retro | 0 / 6 / 3 | 0 | 15 | 5 | Non combattente; solo Demolizione |
| `u3_sig_h` | **Bombarda di Bronzo** | Assedio | Retro | 0 / 5 / 5 | 0 | 18 | 4 | Non combattente; solo Demolizione |
| `i3_fir` | **Fuoco Greco** | Istantanea | — | 0 / 2 / 3 | — | — | — | Pre-Battaglia (0 Slot): -6 HP alle Mura nemiche |
| `i3_ral` | **Carica Eroica** | Istantanea | — | 3 / 0 / 2 | — | — | — | Pre-Battaglia (0 Slot): +2 ATK alle tue unità sul Fronte |