# EPOCHS — TECH-SPEC v2.0, iterazione 1

La v1 resta in TECH-SPEC.md e nei cataloghi data/cards.*.json. La specifica
nuova è in GDD-v2.md; i dati canonici v2 in data/v2/catalog.source.json.

## Contratti e versioni

Un mazzo v2 dichiara schemaVersion 2, rulesetVersion e catalogVersion 2.0 e
civilizationId feudal/norse/byzantine. I mazzi senza questi campi sono v1;
non ricevono una civiltà implicita. I protocolli restano strict. I campi
di estensione sono assenti dagli stati v1 per preservarne gli hash.

L'appartenenza delle carte v2 è common o una civiltà. L'Era proviene sempre
dal catalogo selezionato, mai da un prefisso ID. Una partita richiede mazzi
della stessa versione, catalogo e regole corrispondenti. Le impostazioni
fisse per gli scenari devono dichiarare le civiltà quando usano regole v2.

I cataloghi sono scelti per versione, incluso il replay. Nessun ID storico
viene reinterpretato usando la definizione v2. I salvataggi canonici conservano
catalogo, versioni e contatori. La migrazione crea una copia, con civiltà
scelta esplicitamente, sostituzioni dichiarate e lista di errori residui.

## Motore e visibilità

Organizzazione usa un contatore per giocatore per Era e una funzione condivisa
di costo effettivo. Il contatore è privato durante sviluppo (rivelarlo
permetterebbe di distinguere una Unità da un edificio coperto). Civiltà e
Strutture sono pubbliche. Furia e Disciplina sono contributi calcolati dal
motore sullo snapshot; il client non ricostruisce i bonus.

La zona structures è separata da buildings, conta nel cap alla costruzione,
persiste alle transizioni e non partecipa a produzione, Gilda o sacrifici.
Il Mercato ha un contatore condiviso per Era; comando con struttura, risorsa
ceduta e ricevuta. L'evento pubblico annuncia soltanto l'attivazione; i dettagli
e ResourcesChanged restano privati. L'attivazione avanza normalmente il turno.

## Generazione e verifiche

Il manifesto stabilisce ID esatti, conteggi per Era e appartenenza. Generatore
e validatore verificano insiemi, schemi, testi e liste: togliere un controllo
numerico senza sostituirlo non è consentito. La generazione --check confronta
gli output senza scrivere. I valori v2 sono prima iterazione, non bilanciamento.
