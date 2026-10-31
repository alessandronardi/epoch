# EPOCHS — GDD v2.0, iterazione 1

Specifica sperimentale del 30 ottobre 2026. Statistiche da calibrare; non è un rilascio bilanciato. La v1 resta in `GDD.md`.

## Regole normative

Valgono le regole v1 salvo le modifiche qui e nel piano. Regni feudali (`feudal`), Norreni (`norse`), Bizantini (`byzantine`); una civiltà pubblica per partita. Carte comuni o esclusive della propria civiltà.

Organizzazione: prima Unità legalmente giocata per Era, Assedio incluso, -1 Cibo minimo 0; un costo zero consuma il beneficio. Non è consumato da tentativi illegali.

Bottino di guerra: nella normale razzia dopo breccia, 2 Cibo e 2 Legno massimi entro disponibilità e cap; niente Metallo o razzia dopo annientamento.

Ingegneria imperiale: +2 Mura dopo la formula di apertura, inclusa Era I. Non cambia il Centro Città.

Furia: +2 ATK solo nel primo ciclo di mischia effettivamente eseguito. Disciplina: +1 ATK in ciascun ciclo di mischia con Lanciere proprio vivo nello snapshot iniziale. Ogni attributo si applica una volta per carta; Furia e Disciplina si sommano se entrambe presenti. Per Arcieri il bonus si aggiunge al contributo di mischia dopo il dimezzamento, non al Tiro. Nessun bonus alla DEM.

Istantanee: costo pagato alla risoluzione simultanea pre-battaglia; bonus ATK cumulabili con altre copie fino a fine battaglia, a tutte e sole le unità della categoria bersaglio. `own_infantry` esclude i Lancieri anche sul Fronte. Modificatori alle Mura simultanei come v1. Nessuna azione di sviluppo o slot consumati.

Economia e Strutture: un'azione e uno slot alla costruzione, persistono tra Ere. Economia coperta; Strutture pubbliche, senza HP, produzione o bersagliabilità. Solo Economia sacrificabile e conteggiata dalla Gilda prima del sacrificio. Riconversioni: un'azione, zero slot, solo Era III; costo e sacrificio come v1, guadagno entro cap e bonus DEM cumulabile fino a fine Era.

Mercato: dopo la costruzione, in un successivo turno di sviluppo, spendere un'azione per pagare 2 della stessa risorsa e ricevere 1 di un'altra. Vietato dopo Passo, fuori turno, senza fondi o se la destinazione è già al cap. Massimo una attivazione per giocatore per Era, condivisa fra copie; reset a ogni apertura. Pubblici giocatore e struttura, privati risorse e saldi.

Cisterna: a ogni apertura successiva alla costruzione, +2 Mura dopo Ingegneria, una volta per giocatore indipendentemente dalle copie; non cura né impone un nuovo massimo. Nessuna azione per questo effetto automatico.

## Revisione storica e nucleo comune

62 carte: 43 comuni, 1 feudale, 9 norrene, 9 bizantine. 21/22/19 nelle Ere. Berserker e Catafratto riutilizzano gli ID ma solo il catalogo v2 cambia appartenenza e abilità. Le altre civiltà mantengono fanteria pesante e Cavaliere Veterano comuni. Nessun duplicato equivalente per superare tre copie.

Archibugiere → Balestriere a Staffa; Dragone → Cavaliere Veterano; Ussaro Alato → Lanciere a Cavallo. Statistiche mantenute come astrazioni di gioco. Bombarda → Ariete da Breccia: costo 0/7/3, DEM 16, HP 9 per distinguere la macchina da urto dal Trabucco. Nuovi ID e nuova arte obbligatoria per queste quattro carte. Fuoco Greco resta incendiario senza polvere da sparo; Guardia Svizzera rappresenta picchieri medievali, senza uniformi moderne.

Fonti di controllo del periodo: [National Army Museum, dragoni](https://www.nam.ac.uk/explore/british-civil-wars), [Badisches Landesmuseum, ussari](https://www.landesmuseum.de/videoguide-kaiser-und-sultan), [Fitzwilliam, balestra medievale](https://www.fitzmuseum.cam.ac.uk/index.php/explore-our-collection/highlights/context/stories-and-histories/the-crossbow-in-battle). Il catalogo è evocativo, non una simulazione di un singolo anno.

## Schede caratteristiche

Costi e produzione nell'ordine Cibo/Legno/Metallo. Le regole comuni sopra definiscono timing, visibilità, cumulabilità e consumo azioni per ogni tipo.

### Razziatore Costiero — n1_raider

Era 1; norse; unit; categoria infantry; linea front. Costo 2/0/0; ATK/DEM/HP 2/1/2.

Effetto: [{"kind":"fury","amount":2}].

Ruolo e testo italiano: Pressione precoce, fragile al tiro. Contromisure: Arcieri e fronti resistenti. Arte: guerriero con ascia e scudo rotondo sulla costa.

### Casa Lunga — n1_longhouse

Era 1; norse; economy; categoria —; linea —. Costo 1/2/0; ATK/DEM/HP —/—/—.

Effetto: {"food":1,"wood":0,"metal":0}.

Ruolo e testo italiano: Sostiene la fanteria con un investimento iniziale. Contromisure: Occupa uno dei quattro slot iniziali. Arte: sala in legno con tetto erboso.

### Chiamata del Thing — n1_thing

Era 1; norse; instant; categoria —; linea —. Costo 1/1/0; ATK/DEM/HP —/—/—.

Effetto: {"kind":"atk_mod","target":"own_infantry","amount":1}.

Ruolo e testo italiano: Rafforza soltanto la Fanteria per questa battaglia. Contromisure: Non sostiene Lancieri, Cavalleria o Assedio. Arte: assemblea di guerrieri presso pietre erette.

### Huscarl — n2_huscarl

Era 2; norse; unit; categoria infantry; linea front. Costo 3/1/1; ATK/DEM/HP 5/2/6.

Effetto: [{"kind":"fury","amount":2}].

Ruolo e testo italiano: Punta offensiva del fronte norreno. Contromisure: Tiro e resistenza oltre il primo ciclo. Arte: guardia in cotta di maglia con ascia lunga.

### Approdo Mercantile — n2_landing

Era 2; norse; economy; categoria —; linea —. Costo 2/3/0; ATK/DEM/HP —/—/—.

Effetto: {"food":1,"wood":1,"metal":0}.

Ruolo e testo italiano: Produzione mista senza introdurre combattimento navale. Contromisure: Consuma uno slot militare e non produce Metallo. Arte: magazzini in legno e merci su un molo.

### Portascudo del Jarl — n2_axeman

Era 2; norse; unit; categoria spearman; linea front. Costo 2/2/1; ATK/DEM/HP 2/1/7.

Effetto: [{"kind":"impale","damage":5}].

Ruolo e testo italiano: Contromisura difensiva alla cavalleria. Contromisure: Tiro e basso ATK contro fanteria. Arte: lancia e scudo rotondo dipinto.

### Berserker d'Élite — u3_inf_l

Era 3; norse; unit; categoria infantry; linea front. Costo 4/0/2; ATK/DEM/HP 8/3/8.

Effetto: [{"kind":"fury","amount":2}].

Ruolo e testo italiano: Conclude lo scontro con una prima mischia violenta. Contromisure: Tiro e difensori capaci di sopravvivere. Arte: guerriero con ascia, lana e maglia, elmo senza corna.

### Guardia del Jarl — n3_guard

Era 3; norse; unit; categoria infantry; linea front. Costo 4/2/2; ATK/DEM/HP 6/2/11.

Effetto: [].

Ruolo e testo italiano: Protegge i Berserker più fragili. Contromisure: Investimento di risorse e ATK moderato. Arte: scudi sovrapposti e cotte di maglia.

### Giuramento del Seguito — n3_oath

Era 3; norse; instant; categoria —; linea —. Costo 2/0/1; ATK/DEM/HP —/—/—.

Effetto: {"kind":"atk_mod","target":"own_infantry","amount":2}.

Ruolo e testo italiano: Premia un fronte di fanteria superstite. Contromisure: Non migliora DEM né le altre categorie. Arte: seguito del jarl raccolto attorno a uno stendardo.

### Lanciere di Frontiera — b1_spearman

Era 1; byzantine; unit; categoria spearman; linea front. Costo 1/2/0; ATK/DEM/HP 1/1/5.

Effetto: [{"kind":"impale","damage":3}].

Ruolo e testo italiano: Ancora difensiva e supporto alla Disciplina. Contromisure: Arcieri con Tiro e pressione economica. Arte: soldato con lancia e scudo ovale presso una fortificazione.

### Granaio Imperiale — b1_granary

Era 1; byzantine; economy; categoria —; linea —. Costo 0/3/0; ATK/DEM/HP —/—/—.

Effetto: {"food":2,"wood":0,"metal":0}.

Ruolo e testo italiano: Investimento di Legno in Cibo per le Ere successive. Contromisure: Slot consumato e vulnerabilità iniziale. Arte: magazzino in pietra con anfore di cereali.

### Guardia di Frontiera — b1_watch

Era 1; byzantine; unit; categoria infantry; linea front. Costo 2/1/0; ATK/DEM/HP 1/1/5.

Effetto: [{"kind":"discipline","amount":1}].

Ruolo e testo italiano: Difende il Lanciere e beneficia della sua presenza. Contromisure: Eliminare i Lancieri interrompe Disciplina. Arte: fante con scudo ovale e tunica sotto la maglia.

### Skoutatos — b2_skoutatos

Era 2; byzantine; unit; categoria infantry; linea front. Costo 3/1/2; ATK/DEM/HP 4/2/9.

Effetto: [{"kind":"discipline","amount":1}].

Ruolo e testo italiano: Fanteria resistente ma costosa in Metallo. Contromisure: Rimuovere il Lanciere e sfruttare il costo elevato. Arte: fante in maglia con grande scudo e lancia.

### Cisterna Fortificata — b2_cistern

Era 2; byzantine; structure; categoria —; linea —. Costo 1/3/1; ATK/DEM/HP —/—/—.

Effetto: {"kind":"era_walls","amount":2}.

Ruolo e testo italiano: Aumenta le Mura delle aperture successive, senza produzione. Contromisure: Consuma uno slot e non aiuta nella battaglia corrente. Arte: cisterna in muratura dietro una cinta difensiva.

### Arciere dei Temi — b2_archer

Era 2; byzantine; unit; categoria archer; linea rear. Costo 2/2/1; ATK/DEM/HP 4/0/4.

Effetto: [{"kind":"volley","bonusVsSpearman":2},{"kind":"discipline","amount":1}].

Ruolo e testo italiano: Tiro resistente con supporto in mischia. Contromisure: Cavalleria e perdita dei Lancieri alleati. Arte: arco composito, faretra e scudo appeso.

### Catafratto — u3_cav_h

Era 3; byzantine; unit; categoria cavalry; linea center. Costo 5/0/4; ATK/DEM/HP 9/3/8.

Effetto: [{"kind":"flank","bonusVsArcher":3},{"kind":"discipline","amount":1}].

Ruolo e testo italiano: Contrattacco pesante sostenuto dallo sviluppo. Contromisure: Impalamento e costo elevato in Metallo. Arte: cavaliere con armatura lamellare e cavallo protetto.

### Arsenale Imperiale — b3_arsenal

Era 3; byzantine; conversion; categoria —; linea —. Costo 1/1/0; ATK/DEM/HP —/—/—.

Effetto: {"kind":"gain_and_dem_bonus","gain":{"food":0,"wood":1,"metal":4},"demBonus":1}.

Ruolo e testo italiano: Trasforma un produttore in Metallo e DEM fino a fine Era III. Contromisure: Richiede un edificio Economia attivo da sacrificare. Arte: officina con armi, incudini e travi, senza cannoni.

### Ordine Imperiale — b3_standard

Era 3; byzantine; instant; categoria —; linea —. Costo 2/1/1; ATK/DEM/HP —/—/—.

Effetto: {"kind":"walls_mod","target":"own","amount":4}.

Ruolo e testo italiano: Sostiene le Mura durante la battaglia finale. Contromisure: Non protegge le truppe né ripara il Centro Città. Arte: stendardo imperiale sopra difensori sulle mura.

### Mercato — f2_market

Era 2; feudal; structure; categoria —; linea —. Costo 1/2/0; ATK/DEM/HP —/—/—.

Effetto: {"kind":"market"}.

Ruolo e testo italiano: Converte eccedenze a costo di una azione, senza produzione. Contromisure: Rapporto 2:1 e una sola attivazione per Era per giocatore. Arte: banchi di mercato, sacchi e bilance in una città medievale.

## Liste definitive di progetto (180 occorrenze)

Le liste JSON in `data/v2/decks/` espandono esplicitamente ogni copia; i costi qui sono stampati, prima di Organizzazione.

### Equilibrio Tattico — feudal

Era 1:

- 2 × Fattoria (e1_farm), costo 0/2/0.
- 2 × Segheria (e1_lumb), costo 2/0/0.
- 2 × Cava Grezza (e1_mine), costo 2/2/0.
- 2 × Fante con Scudo (u1_inf_h), costo 2/1/0.
- 2 × Picchiere di Leva (u1_spr_l), costo 1/1/0.
- 1 × Lanciere Pesante (u1_spr_h), costo 1/2/0.
- 2 × Cacciatore (u1_arc_l), costo 1/1/0.
- 1 × Arciere d'Ordinanza (u1_arc_h), costo 1/2/0.
- 1 × Esploratore a Cavallo (u1_cav_l), costo 3/0/0.
- 1 × Cavaliere Feudale (u1_cav_h), costo 2/0/1.
- 1 × Squadra Genieri (u1_sig_l), costo 1/2/0.
- 2 × Pioggia di Frecce (i1_arr), costo 0/2/0.
- 1 × Palizzata Extra (i1_wall), costo 0/2/0.

Era 2:

- 1 × Mulino Idraulico (e2_mill), costo 1/3/1.
- 1 × Segheria Grande (e2_saw), costo 3/1/1.
- 1 × Fonderia (e2_fnd), costo 2/3/0.
- 1 × Mercato (f2_market), costo 1/2/0.
- 2 × Spadaccino Scelto (u2_inf_l), costo 3/0/1.
- 2 × Uomo d'Arme (u2_inf_h), costo 3/1/1.
- 2 × Alabardiere (u2_spr_l), costo 2/2/0.
- 1 × Guardia Svizzera (u2_spr_h), costo 2/3/1.
- 1 × Arciere Composto (u2_arc_l), costo 1/3/0.
- 2 × Balestriere Pesante (u2_arc_h), costo 1/3/1.
- 1 × Lanciere a Cavallo (u2_lancer), costo 3/1/1.
- 1 × Cavaliere Corazzato (u2_cav_h), costo 3/0/2.
- 1 × Scorpione d'Assedio (u2_sig_l), costo 0/3/1.
- 1 × Mina Sotterranea (i2_sab), costo 1/0/2.
- 2 × Grido di Guerra (i2_mor), costo 2/0/1.

Era 3:

- 3 × Campione Imperiale (u3_inf_h), costo 4/1/3.
- 2 × Picchiere Reale (u3_spr_l), costo 3/3/1.
- 2 × Falange Imperiale (u3_spr_h), costo 3/4/2.
- 2 × Arciere Lungo Reale (u3_arc_l), costo 2/4/1.
- 1 × Balestriere a Staffa (u3_crossbow), costo 2/3/3.
- 2 × Cavaliere Veterano (u3_knight), costo 4/1/2.
- 1 × Torre d'Assedio (u3_sig_l), costo 0/5/2.
- 1 × Trabucco Gigante (u3_sig_m), costo 0/6/3.
- 2 × Fuoco Greco (i3_fir), costo 0/2/3.
- 2 × Carica Eroica (i3_ral), costo 3/0/2.
- 1 × Gilda dei Mercanti (e3_gld), costo 0/1/0.
- 1 × Altoforno Reale (e3_frn), costo 2/0/0.

### Assalto e Breccia — norse

Era 1:

- 1 × Casa Lunga (n1_longhouse), costo 1/2/0.
- 1 × Segheria (e1_lumb), costo 2/0/0.
- 1 × Cava Grezza (e1_mine), costo 2/2/0.
- 3 × Razziatore Costiero (n1_raider), costo 2/0/0.
- 2 × Fante con Scudo (u1_inf_h), costo 2/1/0.
- 1 × Milizia Cittadina (u1_inf_l), costo 2/0/0.
- 2 × Picchiere di Leva (u1_spr_l), costo 1/1/0.
- 2 × Cacciatore (u1_arc_l), costo 1/1/0.
- 1 × Esploratore a Cavallo (u1_cav_l), costo 3/0/0.
- 2 × Squadra Genieri (u1_sig_l), costo 1/2/0.
- 1 × Ariete Batteria (u1_sig_h), costo 0/3/1.
- 2 × Chiamata del Thing (n1_thing), costo 1/1/0.
- 1 × Pioggia di Frecce (i1_arr), costo 0/2/0.

Era 2:

- 1 × Approdo Mercantile (n2_landing), costo 2/3/0.
- 1 × Mulino Idraulico (e2_mill), costo 1/3/1.
- 1 × Fonderia (e2_fnd), costo 2/3/0.
- 3 × Huscarl (n2_huscarl), costo 3/1/1.
- 2 × Portascudo del Jarl (n2_axeman), costo 2/2/1.
- 2 × Spadaccino Scelto (u2_inf_l), costo 3/0/1.
- 2 × Arciere Composto (u2_arc_l), costo 1/3/0.
- 1 × Lanciere a Cavallo (u2_lancer), costo 3/1/1.
- 1 × Alabardiere (u2_spr_l), costo 2/2/0.
- 2 × Scorpione d'Assedio (u2_sig_l), costo 0/3/1.
- 1 × Mangano Pesante (u2_sig_h), costo 0/4/2.
- 2 × Mina Sotterranea (i2_sab), costo 1/0/2.
- 1 × Grido di Guerra (i2_mor), costo 2/0/1.

Era 3:

- 3 × Berserker d'Élite (u3_inf_l), costo 4/0/2.
- 2 × Guardia del Jarl (n3_guard), costo 4/2/2.
- 2 × Picchiere Reale (u3_spr_l), costo 3/3/1.
- 2 × Arciere Lungo Reale (u3_arc_l), costo 2/4/1.
- 1 × Cavaliere Veterano (u3_knight), costo 4/1/2.
- 2 × Torre d'Assedio (u3_sig_l), costo 0/5/2.
- 2 × Trabucco Gigante (u3_sig_m), costo 0/6/3.
- 2 × Giuramento del Seguito (n3_oath), costo 2/0/1.
- 2 × Fuoco Greco (i3_fir), costo 0/2/3.
- 2 × Altoforno Reale (e3_frn), costo 2/0/0.

### Sviluppo Imperiale — byzantine

Era 1:

- 2 × Granaio Imperiale (b1_granary), costo 0/3/0.
- 3 × Segheria (e1_lumb), costo 2/0/0.
- 2 × Cava Grezza (e1_mine), costo 2/2/0.
- 3 × Lanciere di Frontiera (b1_spearman), costo 1/2/0.
- 2 × Guardia di Frontiera (b1_watch), costo 2/1/0.
- 1 × Fante con Scudo (u1_inf_h), costo 2/1/0.
- 2 × Cacciatore (u1_arc_l), costo 1/1/0.
- 1 × Esploratore a Cavallo (u1_cav_l), costo 3/0/0.
- 1 × Squadra Genieri (u1_sig_l), costo 1/2/0.
- 2 × Palizzata Extra (i1_wall), costo 0/2/0.
- 1 × Pioggia di Frecce (i1_arr), costo 0/2/0.

Era 2:

- 1 × Cisterna Fortificata (b2_cistern), costo 1/3/1.
- 1 × Mulino Idraulico (e2_mill), costo 1/3/1.
- 1 × Segheria Grande (e2_saw), costo 3/1/1.
- 2 × Fonderia (e2_fnd), costo 2/3/0.
- 3 × Skoutatos (b2_skoutatos), costo 3/1/2.
- 2 × Arciere dei Temi (b2_archer), costo 2/2/1.
- 2 × Alabardiere (u2_spr_l), costo 2/2/0.
- 1 × Guardia Svizzera (u2_spr_h), costo 2/3/1.
- 2 × Cavaliere Corazzato (u2_cav_h), costo 3/0/2.
- 1 × Scorpione d'Assedio (u2_sig_l), costo 0/3/1.
- 1 × Mangano Pesante (u2_sig_h), costo 0/4/2.
- 2 × Grido di Guerra (i2_mor), costo 2/0/1.
- 1 × Mina Sotterranea (i2_sab), costo 1/0/2.

Era 3:

- 3 × Catafratto (u3_cav_h), costo 5/0/4.
- 2 × Campione Imperiale (u3_inf_h), costo 4/1/3.
- 2 × Picchiere Reale (u3_spr_l), costo 3/3/1.
- 2 × Falange Imperiale (u3_spr_h), costo 3/4/2.
- 2 × Arciere Lungo Reale (u3_arc_l), costo 2/4/1.
- 1 × Trabucco Gigante (u3_sig_m), costo 0/6/3.
- 1 × Torre d'Assedio (u3_sig_l), costo 0/5/2.
- 2 × Ordine Imperiale (b3_standard), costo 2/1/1.
- 1 × Carica Eroica (i3_ral), costo 3/0/2.
- 1 × Fuoco Greco (i3_fir), costo 0/2/3.
- 2 × Arsenale Imperiale (b3_arsenal), costo 1/1/0.
- 1 × Gilda dei Mercanti (e3_gld), costo 0/1/0.

## Compatibilità e migrazione

`data/v2/migration.json` elenca le sostituzioni; il chiamante sceglie la civiltà. Una copia migrata può essere illegale se una sostituzione supera tre copie: mostrare gli errori e richiedere una correzione nel builder, mai cancellare carte o sovrascrivere il mazzo v1. Nella fase interna P3 Mercato → Segheria Grande e Cisterna → Mulino; P4 ripristina le strutture.
