# The Epochs — Piano di Esecuzione Atomico (`TASKS.md`)

> **Documento generato secondo le regole di `orchestrazione.md` a partire da `tech_spec.md` (v2.0) e `GDD.md` (v1.0).**  
> **Ordine di esecuzione obbligatorio:** `M0 -> M1 -> M2 -> M3 -> M4 -> M5 -> M6 -> M7` (DAG topologico dai contratti e dati base fino al rilascio PWA e CI).

---

## Task M0-01: Configurazione root del monorepo pnpm e TypeScript strict [COMPLETATO]

* **Stato:** [COMPLETATO] — Configurato il workspace pnpm monorepo con script radice, dipendenze fissate e TypeScript strict con target ES2022.
* **Tier:** [TIER: LOW]
* **Dipendenze:** Nessuna
* **File target:**
  * `package.json`
  * `pnpm-workspace.yaml`
  * `tsconfig.base.json`
* **Context minimo (file da leggere):**
  * `tech_spec.md`
* **Spec di riferimento:** `tech_spec.md` §2 (righe 64–88), §3 (righe 91–131)
* **Obiettivo implementativo:** Definire la configurazione del workspace `pnpm` (`packages/*`, `apps/*`) e gli script principali (`content:validate`, `validate:scenarios`, `art:placeholders`, `art:build`, `sim`) in `package.json` con dipendenze fissate senza range `latest`. Configurare `tsconfig.base.json` con `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true` e target ES2022.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsc --showConfig --project tsconfig.base.json`
  * Condizione di successo: 0 errori di parsing JSON/TSConfig, flag `strict`, `noUncheckedIndexedAccess` ed `exactOptionalPropertyTypes` attivi, nessun file extra modificato.


---

## Task M0-02: Configurazione ESLint flat config, Prettier e registro ADR `docs/DECISIONS.md` [COMPLETATO]

* **Stato:** [COMPLETATO] — Configurato ESLint flat config con divieto di any e confini architetturali, Prettier e registro ADR docs/DECISIONS.md con le decisioni DEC-001..DEC-006.
* **Tier:** [TIER: LOW]
* **Dipendenze:** M0-01
* **File target:**
  * `eslint.config.mjs`
  * `.prettierrc`
  * `docs/DECISIONS.md`
* **Context minimo (file da leggere):**
  * `package.json`
  * `tech_spec.md`
* **Spec di riferimento:** `tech_spec.md` §0.1–0.2 (righe 11–23), §2 (righe 70, 87), §3 (righe 125–130), §4.1 (riga 138), §13.3 (righe 949–959)
* **Obiettivo implementativo:** Creare `eslint.config.mjs` con regola bloccante `@typescript-eslint/no-explicit-any: "error"`, confini architetturali `no-restricted-imports` tra `packages/*` e `apps/*`, e divieto di `Math.random`, `Date.now`, `new Date`, `setTimeout`, `fetch`, `process` dentro `packages/engine`. Inizializzare `docs/DECISIONS.md` registrando le decisioni consolidate `DEC-001`..`DEC-006` (`D1`–`D6`) nel formato normativo §13.3.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec eslint --print-config eslint.config.mjs`
  * Condizione di successo: Configurazione ESLint risolta con successo (exit code 0), `docs/DECISIONS.md` conforme al template §13.3, nessun file extra modificato.


---

## Task M0-03: Allineamento documenti normativi in `docs/` e configurazione Vitest [COMPLETATO]

* **Stato:** [COMPLETATO] — Allineati in docs/ i documenti normativi GDD.md e TECH-SPEC.md e configurato Vitest con soglie di coverage V8 per tutti i package.
* **Tier:** [TIER: LOW]
* **Dipendenze:** M0-01
* **File target:**
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
  * `vitest.config.ts`
* **Context minimo (file da leggere):**
  * `GDD.md`
  * `tech_spec.md`
  * `tsconfig.base.json`
* **Spec di riferimento:** `tech_spec.md` §0.1 (righe 11–16), §3 (righe 95–98), §10.3 (riga 885)
* **Obiettivo implementativo:** Copiare fedelmente senza alcuna alterazione `GDD.md` in `docs/GDD.md` e `tech_spec.md` in `docs/TECH-SPEC.md` per rispettare la struttura directory della sezione 3. Configurare `vitest.config.ts` con soglie di coverage V8 (`>= 95%` statements/branches su `packages/engine`, `>= 85%` su `packages/protocol`, `packages/content`, `packages/bots`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsc --noEmit vitest.config.ts`
  * Condizione di successo: 0 errori typecheck su `vitest.config.ts`, contenuto di `docs/GDD.md` identico byte per byte a `GDD.md`.


---

## Task M0-04: Schemi Zod dei file dati (`cards`, `deck`, `scenario`) [COMPLETATO]

* **Stato:** [COMPLETATO] — Implementati in Zod gli schemi rigorosi e tipizzati per carte (regole, testi, arte), mazzi da 60 carte e scenari di test deterministico.
* **Tier:** [TIER: LOW]
* **Dipendenze:** M0-01
* **File target:**
  * `data/schema/cards.schema.ts`
  * `data/schema/deck.schema.ts`
  * `data/schema/scenario.schema.ts`
* **Context minimo (file da leggere):**
  * `tsconfig.base.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §3 (riga 106), §4.3 (righe 154–192), §7.3 (righe 650–667), §8.1–8.5 (righe 674–741)
* **Obiettivo implementativo:** Implementare in Zod gli schemi rigorosi per `CardRules`, `CardText`, `CardArt` (in `cards.schema.ts`), per `DeckPayload` (3 sotto-mazzi da 20 carte, max 3 copie per carta in `deck.schema.ts`) e per gli scenari di test deterministico `ScenarioPayload` (in `scenario.schema.ts`). Garantire i vincoli condizionali su `category`, `line`, `isCombatant` e `production` in base a `type`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsc --noEmit data/schema/cards.schema.ts data/schema/deck.schema.ts data/schema/scenario.schema.ts`
  * Condizione di successo: 0 errori typecheck, esportazione dei tipi inferiti e degli schemi Zod completata senza alcun uso di `any`.


---

## Task M0-05: Tabella di mapping deterministico effetti e abilità (`tools/card-effects.ts`) [COMPLETATO]

* **Stato:** [COMPLETATO] — Creata la mappa esplicita e immutabile degli effetti, produzioni e abilità di combattimento per tutte le 45 carte secondo l'Appendice C.1.
* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-04
* **File target:**
  * `tools/card-effects.ts`
* **Context minimo (file da leggere):**
  * `data/schema/cards.schema.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.2 (righe 684–693), Appendice C.1 (righe 1069–1080)
* **Obiettivo implementativo:** Codificare in `tools/card-effects.ts` la mappa immutabile ed esplicita che associa a ciascuno dei 45 `cardId` del catalogo ufficiale i campi `production`, `abilities` (`impale`, `volley`, `flank` con i valori stampati sulla carta secondo `D1`) ed `effect` (`atk_mod`, `walls_mod`, `gain_per_building`, `gain_and_dem_bonus`). Fornire una funzione di lookup che solleva errore bloccante se un `cardId` non è censito.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsc --noEmit tools/card-effects.ts`
  * Condizione di successo: 0 errori typecheck e corrispondenza esatta con la tabella dell'Appendice C.1.


---

## Task M0-06: Parser `tools/gdd-to-cards.ts` e generazione di `data/cards.rules.json` [COMPLETATO]

* **Stato:** [COMPLETATO] — Implementato il parser idempotente tools/gdd-to-cards.ts che estrae le 45 carte dal GDD e genera data/cards.rules.json validato.
* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-04, M0-05
* **File target:**
  * `tools/gdd-to-cards.ts`
  * `data/cards.rules.json`
* **Context minimo (file da leggere):**
  * `docs/GDD.md`
  * `tools/card-effects.ts`
  * `data/schema/cards.schema.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.2 (righe 684–693), Appendice C.2 (righe 1082–1102), `GDD.md` §7 (righe 142–199)
* **Obiettivo implementativo:** Implementare lo script idempotente `tools/gdd-to-cards.ts` che effettua il parsing delle 3 tabelle Markdown di `docs/GDD.md` §7, deduce `type` esclusivamente dalla colonna `"Tipo / Cat."` (mai dal prefisso dell'ID, così che `e3_gld` ed `e3_frn` siano `'conversion'`), mappa `—` a `undefined`, unisce i dati di `tools/card-effects.ts`, valida con `cards.schema.ts` e scrive `data/cards.rules.json` ordinato per chiave.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx tools/gdd-to-cards.ts --check`
  * Condizione di successo: Exit code 0, esattamente 45 carte (15 per Era) validate in `data/cards.rules.json`, 0 diff in esecuzione ripetuta.


---

## Task M0-07: Creazione di `data/cards.text.it.json` e `data/cards.art.json` [COMPLETATO]

* **Stato:** [COMPLETATO] — Creati e validati data/cards.text.it.json (nomi, typeLine e flavor) e data/cards.art.json (prompt stile pittura a olio e metadati segnaposto) per tutte le 45 carte.
* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-06
* **File target:**
  * `data/cards.text.it.json`
  * `data/cards.art.json`
* **Context minimo (file da leggere):**
  * `data/cards.rules.json`
  * `data/schema/cards.schema.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.1 (righe 674–683), §8.3–8.4 (righe 694–737), Appendice B (righe 1001–1064), Appendice C.3 (righe 1104–1114)
* **Obiettivo implementativo:** Popolare `data/cards.text.it.json` con `name` (<= 24 caratteri), `typeLine` formattata secondo §8.3 (es. `Unità — Cavalleria · Centro`, `Economia`, `Istantanea`, `Riconversione`) e `flavor` originale dell'Appendice B (<= 120 caratteri) per tutte le 45 carte. Popolare `data/cards.art.json` con `file`, `alt.it` (>= 20 caratteri), `prompt` (preceduto dallo stile pittorico comune §8.4), `negative`, `status: "placeholder"` e `credit`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx -e "import { CardsTextFileSchema, CardsArtFileSchema } from './data/schema/cards.schema'; import fs from 'node:fs'; CardsTextFileSchema.parse(JSON.parse(fs.readFileSync('data/cards.text.it.json','utf8'))); CardsArtFileSchema.parse(JSON.parse(fs.readFileSync('data/cards.art.json','utf8')));"`
  * Condizione di successo: Validazione Zod di entrambi i file JSON superata con exit code 0 per tutte le 45 carte.


---

## Task M0-08: Package `@epochs/content` — Generazione testo regole, tooltip e loader catalogo [COMPLETATO]

* **Stato:** [COMPLETATO] — Implementato il package @epochs/content esportando loader del catalogo, generazione pura del testo regole con i 10 template normativi e tooltip delle 6 parole chiave.
* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-06, M0-07
* **File target:**
  * `packages/content/package.json`
  * `packages/content/tsconfig.json`
  * `packages/content/src/index.ts`
* **Context minimo (file da leggere):**
  * `data/schema/cards.schema.ts`
  * `data/cards.rules.json`
  * `data/cards.text.it.json`
  * `data/cards.art.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.3 (righe 694–725), Appendice C.1 (riga 1080)
* **Obiettivo implementativo:** Implementare `@epochs/content` esportando il loader tipizzato del catalogo completo (regole + testi IT + metadati arte), la funzione pura `generateRulesText(card: CardRules, locale: 'it'): string` che applica i 10 template esatti della tabella §8.3 (incluso il calcolo `max(1, floor(atk/2))` per gli Arcieri in Mischia) e il dizionario dei 6 reminder text (tooltip) per le parole chiave (`Tiro`, `Impalamento`, `Accerchiamento`, `Demolizione (DEM)`, `Riconversione`, `Istantanea`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/content exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck, zero dipendenze verso `apps/*`.


---

## Task M0-09: Validatore CLI `tools/content-validate.ts` e test unitari `@epochs/content` [COMPLETATO]

* **Stato:** [COMPLETATO] — Implementato il validatore CLI tools/content-validate.ts con exit code bloccante e suite di test unitari con copertura V8 del 99% su @epochs/content.
* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-08
* **File target:**
  * `tools/content-validate.ts`
  * `packages/content/tests/content.test.ts`
* **Context minimo (file da leggere):**
  * `packages/content/src/index.ts`
  * `data/cards.rules.json`
  * `data/cards.text.it.json`
  * `data/cards.art.json`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.5 (righe 738–741), §10.1 Livello G (riga 869), Appendice C.1 (riga 1080)
* **Obiettivo implementativo:** Creare `tools/content-validate.ts` che termina con exit code `1` se le carte non sono 45 (15 per Era), se gli ID non coincidono perfettamente tra i 3 file JSON, se `name > 24` char, se `flavor` è vuoto o `> 120` char, se `alt.it < 20` char, se il testo regole generato diverge dalla tabella §7 del GDD (inclusi i valori Mischia degli Arcieri `1, 1, 2, 2, 3, 4`), o se una carta `final` non ha file immagine. Scrivere i test unitari in `packages/content/tests/content.test.ts` per coprire anche i casi di errore del validatore.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx tools/content-validate.ts && pnpm exec vitest run packages/content/tests/content.test.ts`
  * Condizione di successo: Validatore CLI verde (exit code 0) e tutti i test unitari di `@epochs/content` verdi con coverage >= 85%.


---

## Task M0-10: Generatore SVG segnaposto per le 45 carte (`tools/art-placeholders.ts`) [COMPLETATO]

* **Stato:** [COMPLETATO] — Implementato tools/art-placeholders.ts generando 45 SVG segnaposto 4:3 distinti per palette d'Era e iconografia di tipo/categoria in apps/web/public/cards/placeholders/.
* **Tier:** [TIER: LOW]
* **Dipendenze:** M0-07
* **File target:**
  * `tools/art-placeholders.ts`
* **Context minimo (file da leggere):**
  * `data/cards.rules.json`
  * `data/cards.art.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.4 (righe 726–737), §9.1 (righe 748–763)
* **Obiettivo implementativo:** Implementare `tools/art-placeholders.ts` per generare per ciascuna delle 45 carte prive di master PNG un file SVG segnaposto in rapporto `4:3` (`1536x1152` viewBox) in `apps/web/public/cards/placeholders/{id}.svg`, differenziato per palette d'Era (Bronzo `#A86F3C`, Acciaio `#9FB1C2`, Oro `#D9B04A`) e iconografia della categoria/tipo, senza testo né watermark.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx tools/art-placeholders.ts`
  * Condizione di successo: 45 file SVG validi generati correttamente in `apps/web/public/cards/placeholders/`, exit code 0.


---

## Task M0-11: Mazzi preset ufficiali (`aggro-breach`, `balanced-tactical`, `boom-economy`) [COMPLETATO]

* **Stato:** [COMPLETATO] — Creati e validati i 3 mazzi preset ufficiali da 60 carte (aggro-breach, balanced-tactical, boom-economy) rispettando i limiti di copia e le identità strategiche.
* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-04, M0-06
* **File target:**
  * `data/decks/aggro-breach.json`
  * `data/decks/balanced-tactical.json`
  * `data/decks/boom-economy.json`
* **Context minimo (file da leggere):**
  * `data/cards.rules.json`
  * `data/schema/deck.schema.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §2.1 (righe 23–26), `tech_spec.md` §7.1 (righe 626–631), §12 M0 (riga 922)
* **Obiettivo implementativo:** Creare i 3 mazzi preset ufficiali in `data/decks/`, ciascuno composto da esattamente 60 carte suddivise in 3 sotto-mazzi da 20 carte per Era I, Era II ed Era III, rispettando il limite massimo di 3 copie per singola carta e l'identità strategica richiesta (pressione campale/Assedio per `aggro-breach`, equilibrio contromisure/Istantanee per `balanced-tactical`, massima densità Edifici/Riconversioni per `boom-economy`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx -e "import { DeckPayloadSchema } from './data/schema/deck.schema'; import fs from 'node:fs'; for (const f of ['aggro-breach','balanced-tactical','boom-economy']) DeckPayloadSchema.parse(JSON.parse(fs.readFileSync('data/decks/'+f+'.json','utf8')));"`
  * Condizione di successo: Tutti e 3 i mazzi superano la validazione dello schema `DeckPayloadSchema` (20+20+20 carte, <= 3 copie per carta, Era congruente).


---

## Task M1-01: Scheletro `@epochs/engine` e tipi canonici di stato e `RulesConfig`

* **Tier:** [TIER: LOW]
* **Dipendenze:** M0-02
* **File target:**
  * `packages/engine/package.json`
  * `packages/engine/tsconfig.json`
  * `packages/engine/src/types.ts`
* **Context minimo (file da leggere):**
  * `tsconfig.base.json`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §0.3 (righe 25–44), §4.1 (righe 136–145), §4.3 (righe 152–250), §11 (righe 891–912), Appendice C.4 (righe 1116–1141)
* **Obiettivo implementativo:** Configurare il package `@epochs/engine` (unica dipendenza runtime consentita: `immer`) e definire in `src/types.ts` tutti i tipi canonici JSON-safe (`PlayerId`, `EraNo`, `Resource`, `Resources`, `Line`, `CardType`, `UnitCategory`, `CardRules`, `Ability`, `InstantEffect`, `ConversionEffect`, `CardInstance`, `UnitInstance`, `PlayerState`, `Phase`, `PendingCommit`, `GameState`, `GameResult`, `RulesConfig` e costante `DEFAULT_RULES_CONFIG` conforme all'Appendice C.4).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/engine exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 violazioni ESLint su `packages/engine/src/types.ts`.

---

## Task M1-02: Tipi per Comandi, Eventi, Errori di Dominio, `LegalCommands` e `PlayerView`

* **Tier:** [TIER: LOW]
* **Dipendenze:** M1-01
* **File target:**
  * `packages/engine/src/commands.ts`
  * `packages/engine/src/events.ts`
  * `packages/engine/src/view-types.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §4.5 (righe 287–317), §4.6 (righe 318–333), §5.2 (righe 452–500), §6.2 (riga 568)
* **Obiettivo implementativo:** Definire in `commands.ts` l'unione discriminata `Command` (`SubmitMulligan`, `SubmitDiscard`, `PlayCard`, `PlayConversion`, `Pass`, `LockInstants`, `ApplyTimeout`, `Concede`), `ClientCommand`, `RuleError`, `ErrorCode` e il tipo `Result<T, E>`. Definire in `events.ts` tutti i payload di `GameEvent` con indice sequenziale monotono `n` secondo §4.5, e in `view-types.ts` i contratti `PlayerView`, `PublicUnitView`, `LegalCommands`, `UnplayableReason`, `DeckPayload`, `ValidationIssue` e `NewGameConfig`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/engine exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 violazioni ESLint sui 3 file creati.

---

## Task M1-03: PRNG deterministico (`xmur3` + `sfc32`), mescolamento Fisher-Yates e `stateHash`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M1-01
* **File target:**
  * `packages/engine/src/rng.ts`
  * `packages/engine/src/hash.ts`
  * `packages/engine/tests/rng-hash.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §4.1 (righe 138–140), §4.2 (righe 146–151), §4.6 (riga 327)
* **Obiettivo implementativo:** Implementare in `rng.ts` l'hash di seed `xmur3`, il generatore `sfc32` che opera su una tupla immutabile `[number, number, number, number]` a 32 bit senza segno e il mescolamento puro Fisher-Yates da `n - 1` a `1`. Implementare in `hash.ts` la serializzazione JSON canonica (chiavi d'oggetto ordinate ricorsivamente) e il calcolo puro di `stateHash(state: GameState): string` (SHA-256 esadecimale puro senza dipendenze I/O native Node, così che giri identico in browser e server), corredato da test unitari di determinismo.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/rng-hash.test.ts`
  * Condizione di successo: Tutti i test di riproducibilità `sfc32`, Fisher-Yates e `stateHash` verdi, 0 usi di `Math.random` o moduli Node I/O.

---

## Task M1-04: Validazione mazzo (`validateDeck`) e politica di scarto FIFO (`autoDiscard` — TV-09)

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M1-02
* **File target:**
  * `packages/engine/src/deck.ts`
  * `packages/engine/src/discard-policy.ts`
  * `packages/engine/tests/deck-discard.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/view-types.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §2.1 e §2.3.3 (righe 23–37), `tech_spec.md` §4.6 (righe 322, 328, 332), Appendice A `TV-09` (riga 980)
* **Obiettivo implementativo:** Implementare `validateDeck(deck, catalog)` verificando che ciascuno dei 3 sotto-mazzi (Era I, II, III) contenga esattamente 20 carte esistenti nel catalogo per quell'Era e che nessuna carta superi 3 copie totali. Implementare `autoDiscard(hand, catalog, countToDiscard)` che ordina le carte per `era` crescente, a parità per costo totale (`food + wood + metal`) crescente, e a ulteriore parità per `drawnOrder` crescente (FIFO), testando esplicitamente il vettore `TV-09`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/deck-discard.test.ts`
  * Condizione di successo: Test `TV-09` e test di validazione mazzo verdi al 100%, 0 errori typecheck.

---

## Task M1-05: Modulo Economia — Cap di magazzino, Raccolto d'apertura e Rendite periodiche (TV-01, TV-02, TV-03)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-02
* **File target:**
  * `packages/engine/src/economy.ts`
  * `packages/engine/tests/economy.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/events.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §3.1, §3.3, §3.4 (righe 42–69), `tech_spec.md` §4.4 (righe 258–275), Appendice A `TV-01`, `TV-02`, `TV-03` (righe 969–971)
* **Obiettivo implementativo:** Implementare in `economy.ts` le funzioni di supporto per cap di magazzino per Era (`7` in Era I, `11` in Era II, `16` in Era III), accredito risorse con troncamento al cap ed emissione di `ResourcesChanged` e `ResourcesOverflowed`, calcolo del Raccolto d'apertura d'Era (`+2/+2/+0` in Era I; `+2/+2/+1` più `2x` la produzione degli edifici attivi in Era II e III) e delle Rendite periodiche all'apertura dei Cicli 2 e 3 (`+1/+1/+0` più `1x` la produzione degli edifici attivi). Verificare nei test i vettori `TV-01`, `TV-02` e `TV-03`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/economy.test.ts`
  * Condizione di successo: Test `TV-01`, `TV-02`, `TV-03` verdi, invariante `0 <= resources[r] <= cap(era)` verificato.

---

## Task M1-06: Avvio partita (`createGame`), pesca iniziale e risoluzione `mulligan` (TV-08, R6)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-03, M1-04, M1-05
* **File target:**
  * `packages/engine/src/setup.ts`
  * `packages/engine/tests/setup-mulligan.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/events.ts`
  * `packages/engine/src/rng.ts`
  * `packages/engine/src/economy.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §2.2, §3.2, §3.3.1 (righe 27–58), `tech_spec.md` §4.4 (righe 258–260, 272), §4.5 (righe 293, 303–307), §11.2 `R6` (riga 911), Appendice A `TV-08` (riga 979)
* **Obiettivo implementativo:** Implementare `createGame(config)` (assegnazione iniziativa P1/P2 da PRNG o `fixedInitiative`, mescolamento separato dei 3 sotto-mazzi o `fixedDecks`, Mura `6`, Centro Città `10/10`, dotazione iniziale `2/2/0`, pesca di 8 carte da Era I con `drawnOrder` monotono, ingresso in `mulligan`). Implementare la gestione di `SubmitMulligan` con commit simultaneo in `pending`, pesca delle `N` carte sostitutive dalla cima prima di porre le `N` carte rese in fondo ordinate per `drawnOrder` crescente (`R6`), seguita automaticamente dal Raccolto d'apertura Era I e dall'apertura del Ciclo 1 di `development`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/setup-mulligan.test.ts`
  * Condizione di successo: Test `TV-08`, test `DECISION_ALREADY_LOCKED` e transizione automatica a `development` (saldo `4/4/0`) verdi.

---

## Task M1-07: Calcolo delle mosse legali (`legalCommands`) e motivi di non giocabilità

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-04, M1-05
* **File target:**
  * `packages/engine/src/legal.ts`
  * `packages/engine/tests/legal.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/commands.ts`
  * `packages/engine/src/view-types.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §3.4, §4.1, §5.1 (righe 65–80, 96–97), `tech_spec.md` §4.4 (righe 277–285), §4.6 (righe 324, 331), §11 `D6` (riga 902)
* **Obiettivo implementativo:** Implementare `legalCommands(state, player)` restituendo le azioni consentite nella fase corrente (`mulligan`, `hand_limit`, `development`, `prebattle`, `finished`) e per ciascuna carta nella mano del giocatore lo stato di giocabilità o il motivo esatto di blocco (`no_slot`, `insufficient_resources`, `no_building_to_sacrifice`, `wrong_phase`, `already_passed`, `already_committed`). Verificare che le carte di Ere precedenti conservate in mano siano giocabili in Ere successive, mentre le Riconversioni siano giocabili solo in `development` di Era III con almeno 1 edificio attivo.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/legal.test.ts`
  * Condizione di successo: Tutti i test sui motivi di blocco e sulle finestre simultanee verdi, 0 errori typecheck.

---

## Task M1-08: Transizioni `hand_limit` e `development` (Cicli, Carte da campo, Riconversioni, Passo — TV-15..TV-20)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-05, M1-06, M1-07
* **File target:**
  * `packages/engine/src/development.ts`
  * `packages/engine/tests/development.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/events.ts`
  * `packages/engine/src/economy.ts`
  * `packages/engine/src/legal.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §3.3.3–7, §3.4, §4.1 (righe 59–80), `tech_spec.md` §4.4 (righe 262–285), §4.7.1 (riga 336), §11 `D5`, `D6`, `R1`, `R4` (righe 901–910), Appendice A `TV-15`–`TV-20` (righe 986–992)
* **Obiettivo implementativo:** Implementare la risoluzione di `SubmitDiscard` in `hand_limit` e l'intera macchina a stati di `development`: gestione di `PlayCard` (incremento `slotsUsed`, assegnazione `seq` alle unità al momento della giocata secondo `D5`), `PlayConversion` in Era III (*Gilda dei Mercanti* con calcolo di `N` pre-sacrificio e *Altoforno Reale* con incremento cumulabile di `demBonus` secondo `R4`, spostamento edificio sacrificato e carta in `discard`, `0` slot consumati), `Pass`, avanzamento cicli in ordine d'iniziativa con rendite ai Cicli 2 e 3 solo se almeno un giocatore non ha passato, ed emissione immediata di `DevelopmentEnded` + `UnitsRevealed` all'ingresso in `prebattle` (`R1`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/development.test.ts`
  * Condizione di successo: Test `TV-15`, `TV-16`, `TV-17`, `TV-18`, `TV-19`, `TV-19b`, `TV-20` tutti verdi.

---

## Task M1-09: Risoluzione deterministica della Battaglia Campale (Fasi 1, 2A, 2B, 3 e Guardia — TV-10..TV-13, TV-21, TV-22, TV-24)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-02
* **File target:**
  * `packages/engine/src/battle.ts`
  * `packages/engine/tests/battle.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/events.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §5.2–5.3 (righe 99–117), `tech_spec.md` §4.8 (righe 348–413), §11 `D1`, `D4`, `R2`, `R5` (righe 897–910), Appendice A `TV-10`–`TV-13`, `TV-21`, `TV-22`, `TV-24` (righe 981–984, 993–996)
* **Obiettivo implementativo:** Implementare `orderTargets`, `assignDamage`, la Guardia Pre-Fase (prima di Fase 1, 2A, 2B, di ciascuno dei 6 cicli di Fase 3 e subito dopo la rimozione dei caduti del 6° ciclo secondo `R5`) e la sequenza in 4 passaggi (Snapshot, Calcolo, Applicazione Simultanea, Rimozione in `discard`) per Fase 1 (Tiro), Fase 2A (Impalamento solo vs Cavalleria), Fase 2B (Impatto/Accerchiamento con priorità `['rear', 'front', 'center']` se non ci sono Lancieri vivi) e Fase 3 (Mischia max 6 cicli con Arcieri a `max(1, floor(effAtk / 2))` secondo `D4`). Escludere sempre le unità d'Assedio (`isCombatant === false`) dai combattenti e dai bersagli.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/battle.test.ts`
  * Condizione di successo: Test `TV-10`, `TV-11`, `TV-12`, `TV-13`, `TV-21`, `TV-22`, `TV-24` tutti verdi al 100%.

---

## Task M1-10: Finestra `prebattle`, Fase 4 (Assedio, Breccia, Razzia) e Transizione d'Era / Vittoria (TV-04..TV-07c, TV-14, TV-23)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-05, M1-09
* **File target:**
  * `packages/engine/src/siege-and-era.ts`
  * `packages/engine/tests/siege-and-era.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/events.ts`
  * `packages/engine/src/battle.ts`
  * `packages/engine/src/economy.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §5.1, §5.3 Fase 4, §6 (righe 96–98, 118–139), `tech_spec.md` §4.7 (righe 334–346), §4.8 Fase 4 (righe 414–425), §4.9 (righe 426–443), §11.2 `R1`–`R3` (righe 906–908), Appendice A `TV-04`–`TV-07c`, `TV-14`, `TV-23` (righe 972–978, 985, 995)
* **Obiettivo implementativo:** Implementare la gestione di `LockInstants` in `prebattle` (validazione costo aggregato, rivelazione simultanea `InstantsRevealed`, applicazione `atk_mod` e somma algebrica `walls_mod` con clamp finale a `0` secondo `R3`), l'esecuzione automatica della battaglia campale seguita in caso di vincitore campale dalla Fase 4 (`breach = (D > 0) && (D >= W)`, danno diretto a `cityDamage`, vittoria immediata `annihilation` senza razzia se `cityHp <= 0`, altrimenti razzia di max 1 Cibo e 1 Legno entro il cap) e la transizione di Fine Era (scarto superstiti, riporto Mura `Base + floor(W/2)`, aggiornamento `cityMax`, pesca 5 carte della nuova Era con eventuale ingresso in `hand_limit`, oppure verdetto finale `points`/`draw` a fine Era III).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/siege-and-era.test.ts`
  * Condizione di successo: Test `TV-04`, `TV-04b`, `TV-05`, `TV-06`, `TV-07`, `TV-07b`, `TV-07c`, `TV-14`, `TV-23` tutti verdi.

---

## Task M1-11: Proiezione di visibilità `playerView` e redazione eventi `projectEvent` (Matrice §5.3–5.4, D3, TV-25)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-02, M1-07
* **File target:**
  * `packages/engine/src/projection.ts`
  * `packages/engine/tests/projection.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/events.ts`
  * `packages/engine/src/view-types.ts`
  * `packages/engine/src/legal.ts`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §4.2 (righe 82–91), `tech_spec.md` §5.1–5.5 (righe 446–535), §11 `D3` (riga 899), Appendice A `TV-25` (riga 997)
* **Obiettivo implementativo:** Implementare `playerView(state, viewer)` e `projectEvent(event, viewer)` rispettando rigorosamente le tabelle 5.3 e 5.4: nascondere risorse e unità avversarie prima di `prebattle`, esporre `coveredCount` (`units.length + buildings.length` in sviluppo, `buildings.length` da `prebattle`), non rivelare mai gli edifici economici avversari né l'identità dell'edificio sacrificato da Riconversione o delle carte scartate per `hand_limit` (`D3`), e popolare `publicDiscard` solo con carte pubblicamente rivelate. Scrivere il test di redazione esaustiva per ogni singolo tipo di `GameEvent`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/projection.test.ts`
  * Condizione di successo: Test di redazione esaustiva per tutti gli eventi e verifiche di visibilità `D3` verdi al 100%.

---

## Task M1-12: Orchestratore immutabile `apply` (inclusi `ApplyTimeout` D2 e `Concede`) ed export API pubblica

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-06, M1-08, M1-10, M1-11
* **File target:**
  * `packages/engine/src/apply.ts`
  * `packages/engine/src/index.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/commands.ts`
  * `packages/engine/src/setup.ts`
  * `packages/engine/src/development.ts`
  * `packages/engine/src/siege-and-era.ts`
  * `packages/engine/src/projection.ts`
  * `packages/engine/src/discard-policy.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §4.1 (righe 136–145), §4.4–4.6 (righe 252–333), §6.3 (righe 570–581), §11 `D2` (riga 898)
* **Obiettivo implementativo:** Implementare in `apply.ts` la funzione pura `apply(state, cmd)` con Immer che incrementa `stateVersion` a ogni transizione valida, gestisce `ApplyTimeout` (applicando la politica deterministica `D2` per la finestra attiva: keep in `mulligan`, `autoDiscard` in `hand_limit`, `Pass` in `development`, `[]` in `prebattle`) e `Concede`, e restituisce `Result<{ state, events }, RuleError>` senza mai mutare lo stato in ingresso in caso di errore. Esportare in `src/index.ts` l'intera API pubblica della sezione 4.6.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/engine exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck, tutte le 8 funzioni dell'API pubblica 4.6 correttamente esportate da `packages/engine/src/index.ts`.

---

## Task M1-13: Suite completa dei 25 Vettori di Test Nominali (`TV-01` – `TV-25`)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M0-06, M1-12
* **File target:**
  * `packages/engine/tests/test-vectors.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/index.ts`
  * `data/cards.rules.json`
  * `docs/GDD.md`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §10.1 Livello B (riga 864), Appendice A `TV-01` – `TV-25` (righe 963–998)
* **Obiettivo implementativo:** Implementare la suite normativa `test-vectors.test.ts` che verifica end-to-end attraverso l'API pubblica (`createGame`, `apply`, `playerView`, `projectEvent`, `autoDiscard`) tutti i 25 vettori di test dell'Appendice A (`TV-01`..`TV-25`, inclusi `TV-04b`, `TV-07b`, `TV-07c`, `TV-19b`) con i valori numerici esatti attesi.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests/test-vectors.test.ts`
  * Condizione di successo: Tutti i 25+ vettori di test nominali passano senza errori.

---

## Task M1-14: Property-based testing (`fast-check`), invarianti 10.2, anti-leak 5.5 e determinismo 1000 partite

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-13
* **File target:**
  * `packages/engine/tests/invariants.property.test.ts`
  * `packages/engine/tests/anti-leak.property.test.ts`
  * `packages/engine/tests/determinism.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/index.ts`
  * `data/cards.rules.json`
  * `data/decks/balanced-tactical.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §5.5 (righe 531–535), §10.1 Livelli C, D, E (righe 865–867), §10.2 Invarianti 1–6 (righe 872–882), §10.3 (riga 885)
* **Obiettivo implementativo:** Implementare con `fast-check` i test property-based per verificare i 6 invarianti formali §10.2 (dominio risorse, limiti mano/slot, integrità strutturale, legge di conservazione delle 60 carte senza duplicati né perdite di `uid`, immutabilità con `deepFreeze`, terminazione finita), il Property-based Leak Test §5.5 (assenza assoluta di `uid`/`cardId` segreti dell'avversario in `playerView` e `projectEvent` serializzati in JSON) e il test di determinismo bit-per-bit di `stateHash` ed eventi su 1000 partite.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/engine/tests --coverage`
  * Condizione di successo: Tutti i test di `packages/engine` verdi e coverage >= 95% su statements e branches.

---

## Task M2-01: Interfaccia `Bot` e implementazione di `RandomBot` in `@epochs/bots`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M1-12
* **File target:**
  * `packages/bots/package.json`
  * `packages/bots/tsconfig.json`
  * `packages/bots/src/random-bot.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/index.ts`
  * `packages/engine/src/view-types.ts`
  * `packages/engine/src/commands.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §7.1 (righe 609–619)
* **Obiettivo implementativo:** Creare il package `@epochs/bots` definendo l'interfaccia `Bot { readonly name: string; choose(view: PlayerView, rng: () => number): ClientCommand }` (che accetta esclusivamente `PlayerView` senza mai leggere `GameState`) e implementare `RandomBot` con probabilità di `Pass` configurabile quando esistono carte giocabili (default `0.15`), selezione uniforme tra le mosse in `view.self.legal` e gestione di `mulligan`, `hand_limit`, `development` e `prebattle`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/bots exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck, zero import proibiti.

---

## Task M2-02: Implementazione di `GreedyBot`, `RationalBot` e test suite `@epochs/bots`

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M0-06, M2-01
* **File target:**
  * `packages/bots/src/greedy-bot.ts`
  * `packages/bots/src/index.ts`
  * `packages/bots/tests/bots.test.ts`
* **Context minimo (file da leggere):**
  * `packages/bots/src/random-bot.ts`
  * `packages/engine/src/index.ts`
  * `data/cards.rules.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §7.1 (righe 620–625), §10.3 (riga 885)
* **Obiettivo implementativo:** Implementare `GreedyBot` con le euristiche della sezione 7.1 (mulligan orientato agli edifici economici di Era I; priorità agli Edifici Economici nei Cicli 1 e 2; schieramento unità per rapporto `(ATK + DEM + HP) / costoTotale` e bilanciamento linee; uso di *Gilda dei Mercanti* con >= 3 edifici e *Altoforno Reale* con più unità; selezione Istantanee in `prebattle` basata sulle unità rivelate e calcolo breccia) e `RationalBot` (che spende Cibo/Legno residui se prevede di subire breccia). Scrivere i test unitari verificando che ogni mossa prodotta dai 3 bot su centinaia di stati sia sempre accettata da `apply`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/bots/tests/bots.test.ts --coverage`
  * Condizione di successo: Tutti i test verdi, 0 comandi illegali emessi dai bot, coverage su `packages/bots` >= 85%.

---

## Task M2-03: Scenari JSON normativi ed esecutore standalone `tools/validate-scenarios.ts`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-04, M0-06, M1-12
* **File target:**
  * `data/scenarios/tv-nominal-suite.json`
  * `tools/validate-scenarios.ts`
* **Context minimo (file da leggere):**
  * `data/schema/scenario.schema.ts`
  * `packages/engine/src/index.ts`
  * `data/cards.rules.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §7.3 (righe 644–668), Appendice A (righe 963–998)
* **Obiettivo implementativo:** Creare in `data/scenarios/tv-nominal-suite.json` la collezione di scenari dichiarativi JSON (incluso `scenario-tv13-flank-mutual-annihilation` e gli scenari di combattimento/assedio dell'Appendice A) e implementare `tools/validate-scenarios.ts` che carica tutti i file `data/scenarios/*.json`, li valida con Zod, esegue le partite/battaglie sul motore e verifica esito, superstiti, HP Mura, danno Centro Città, risorse e assenza di leak.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx tools/validate-scenarios.ts`
  * Condizione di successo: Tutti gli scenari JSON eseguiti e verificati con exit code 0.

---

## Task M2-04: Worker di simulazione partite per `@epochs/sim`

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M0-11, M2-02
* **File target:**
  * `packages/sim/package.json`
  * `packages/sim/tsconfig.json`
  * `packages/sim/src/worker.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/index.ts`
  * `packages/bots/src/index.ts`
  * `data/cards.rules.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §7.2 (righe 632–642)
* **Obiettivo implementativo:** Creare il package `@epochs/sim` e implementare `src/worker.ts` che esegue un batch di partite assegnate (ciascuna con seed deterministico derivato da `${masterSeed}:${gameIndex}` così che l'esito della partita `gameIndex` sia indipendente dal worker che la esegue) raccogliendo tutte le metriche richieste in §7.2: vincitore, tipo di esito (`annihilation`, `points`, `draw`), cicli per Era, brecce, danno diretto al Centro Città, HP Mura, risorse razziate, frequenza di `stalemate`/`mutual_annihilation` e statistiche per singola carta.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/sim exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 violazioni ESLint.

---

## Task M2-05: Aggregatore multi-worker, CLI `packages/sim` e test di riproducibilità

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M2-04
* **File target:**
  * `packages/sim/src/index.ts`
  * `packages/sim/src/cli.ts`
  * `packages/sim/tests/sim.test.ts`
* **Context minimo (file da leggere):**
  * `packages/sim/src/worker.ts`
  * `data/decks/aggro-breach.json`
  * `data/decks/boom-economy.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §7.2 (righe 632–642), §12 M2 (riga 924)
* **Obiettivo implementativo:** Implementare in `src/index.ts` l'orchestratore `runSimulation` basato su `worker_threads` che ripartisce le partite e aggrega i risultati in ordine di `gameIndex`, garantendo un report identico al 100% a parità di `--seed` indipendentemente dal numero di `--workers`. Esporre la CLI `src/cli.ts` (`--deckA`, `--deckB`, `--botA`, `--botB`, `--games`, `--seed`, `--workers`, `--out`) e verificare nei test l'identità perfetta del report tra `workers: 1` e `workers: 4` e la velocità di esecuzione.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/sim/tests/sim.test.ts`
  * Condizione di successo: Report con 1 worker e 4 worker identici bit per bit a parità di seed, tutti i test verdi.

---

## Task M3-01: Scheletro `@epochs/web` e sistema di design CSS "Il Tavolo del Cartografo"

* **Tier:** [TIER: LOW]
* **Dipendenze:** M0-08, M1-12
* **File target:**
  * `apps/web/package.json`
  * `apps/web/tsconfig.json`
  * `apps/web/src/styles/theme.css`
* **Context minimo (file da leggere):**
  * `tsconfig.base.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §2 (righe 68–87), §9.1 (righe 746–769), §9.6 (righe 830–839)
* **Obiettivo implementativo:** Configurare `apps/web/package.json` con React, Zustand, Motion, `@dnd-kit/core`, `lucide-react` e i font self-hosted `@fontsource/cinzel` (o `@fontsource/im-fell-english-sc`), `@fontsource/alegreya` e `@fontsource/barlow-condensed`. Definire in `theme.css` tutti i token colore della tabella §9.1 (`--table-deep`, `--table`, `--surface-card`, `--chalk`, `--chalk-muted`, `--brass`, `--crimson`, `--era1..3`, `--food`, `--wood`, `--metal`), le regole tipografiche, il layout `100dvh` senza scroll accidentale e il supporto a `prefers-reduced-motion: reduce`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e presenza di tutti i token CSS della sezione 9.1.

---

## Task M3-02: Configurazione Vite, `index.html` e icone SVG di dominio (`DomainIcons.tsx`)

* **Tier:** [TIER: LOW]
* **Dipendenze:** M3-01
* **File target:**
  * `apps/web/vite.config.ts`
  * `apps/web/index.html`
  * `apps/web/src/components/icons/DomainIcons.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/package.json`
  * `apps/web/src/styles/theme.css`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §2 (riga 86), §9.1 (righe 748–763), §9.3 (righe 800–807), §9.6 (riga 838)
* **Obiettivo implementativo:** Creare `apps/web/vite.config.ts` e `apps/web/index.html` (lingua `it`, meta viewport mobile-first). Implementare in `DomainIcons.tsx` le icone SVG accessibili (`aria-hidden` + label di supporto) per le 3 risorse (`food`, `wood`, `metal`), le 3 Ere (`I`, `II`, `III`), le 3 linee (`front`, `center`, `rear`), le 5 categorie unità e le statistiche (`atk`, `dem`, `hp`, `walls`, `cityCenter`), garantendo che nessuna informazione sia veicolata solo dal colore.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 errori ESLint su `DomainIcons.tsx`.

---

## Task M3-03: Componente `<Card>` (rapporto 5:7, Container Queries, 5 fasce) e `<CardToken>` compatto

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-08, M3-02
* **File target:**
  * `apps/web/src/components/card/Card.tsx`
  * `apps/web/src/components/card/CardToken.tsx`
  * `apps/web/src/components/card/card.css`
* **Context minimo (file da leggere):**
  * `packages/content/src/index.ts`
  * `packages/engine/src/types.ts`
  * `apps/web/src/components/icons/DomainIcons.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.3 (righe 797–807), §9.6 (righe 832–837)
* **Obiettivo implementativo:** Implementare `<Card>` con rapporto fisso `5:7`, CSS Container Queries (`cqw`) e griglia interna a 5 fasce (`9fr 47fr 6fr 29fr 9fr`: Header nome + pip risorse con costo > 0; Illustrazione 4:3; Riga del Tipo + icona Era; Box Testo regole + filetto in ottone + flavor in corsivo; Footer Statistiche `ATK/DEM/HP` con evidenziazione `--brass` per bonus e `--crimson` per danni). Implementare `<CardToken>` compatto per le linee di battaglia su viewport mobile con area di tocco minima `44x44px`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck, rispetto della griglia `9fr 47fr 6fr 29fr 9fr` e touch target >= 44px.

---

## Task M3-04: Modale d'ispezione carta a schermo intero con tooltip parole chiave e test componente

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M3-03
* **File target:**
  * `apps/web/src/components/card/CardInspectModal.tsx`
  * `apps/web/tests/card-component.test.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/components/card/Card.tsx`
  * `packages/content/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.3 (righe 715–725), §9.3 (riga 799), §9.6 (righe 836–838)
* **Obiettivo implementativo:** Implementare `<CardInspectModal>` (apribile tramite pressione prolungata di 250ms, doppio tap o tasto dedicato, chiudibile con `Esc` o tap esterno) che mostra la carta ingrandita e i box di richiamo (*reminder text*) per tutte le parole chiave presenti sulla carta (`Tiro`, `Impalamento`, `Accerchiamento`, `Demolizione (DEM)`, `Riconversione`, `Istantanea`). Scrivere i test unitari in `card-component.test.tsx` per verificare il rendering di carte Economia, Unità (sane, buffate, danneggiate), Istantanee, Riconversioni e dei relativi tooltip.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/card-component.test.tsx`
  * Condizione di successo: Tutti i test di rendering `<Card>` e `<CardInspectModal>` verdi.

---

## Task M3-05: Descrittore eventi in italiano (`describeEvent`), coda `EventPlayer` e store Zustand

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M1-12, M3-01
* **File target:**
  * `apps/web/src/state/event-describer.ts`
  * `apps/web/src/state/game-store.ts`
  * `apps/web/tests/event-player.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/events.ts`
  * `packages/engine/src/view-types.ts`
  * `packages/content/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.1 (riga 772), §9.4 (righe 819–822), §9.5 (righe 823–829)
* **Obiettivo implementativo:** Implementare `describeEvent(event, 'it')` per generare le voci leggibili del Registro di Battaglia in sentence case italiano per ogni tipo di `GameEvent`. Implementare in `game-store.ts` lo store Zustand contenente l'ultima `PlayerView`, lo stato UI effimero e la macchina di riproduzione deterministica `EventPlayer` (coda ordinata di eventi, velocità `1x` e `2x`, `Pausa`, `Salta alla fine`, cadenza di rivelazione a cascata `120ms` per `UnitsRevealed` e scansione fasi `1`, `2A`, `2B`, `3`, `4`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/event-player.test.ts`
  * Condizione di successo: Tutti i test sulla coda `EventPlayer` (`1x`, `2x`, `Pausa`, `Salta alla fine`) e su `describeEvent` verdi.

---

## Task M3-06: Interfaccia `GameController` e `LocalGameController` (vs Bot e Hot-Seat)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M2-02, M3-05
* **File target:**
  * `apps/web/src/controllers/types.ts`
  * `apps/web/src/controllers/local-controller.ts`
  * `apps/web/tests/local-controller.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/index.ts`
  * `packages/bots/src/index.ts`
  * `apps/web/src/state/game-store.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §5.1 (righe 448–451), §9.8 (righe 848–853)
* **Obiettivo implementativo:** Definire l'interfaccia unificata `GameController` e implementare `LocalGameController` che esegue `@epochs/engine` nel browser filtrando **sempre** ogni stato ed evento attraverso `playerView` e `projectEvent` (zero accesso diretto a `GameState` dalla UI). Gestire l'invocazione automatica di `bot.choose` nelle partite contro Bot e il flusso di passaggio dispositivo con schermo di blocco privacy (`awaitingHotSeatHandover`) a ogni cambio di giocatore attivo o finestra segreta in modalità Hot-Seat.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/local-controller.test.ts`
  * Condizione di successo: Partita completa simulata tramite `LocalGameController` (vs Bot e Hot-Seat) verde, verifica che solo `PlayerView` raggiunga lo store.

---

## Task M3-07: Layout del Tavolo di Partita (`BattlefieldBoard`, `CityAndLines`) Desktop e Mobile

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M3-03, M3-05
* **File target:**
  * `apps/web/src/components/board/BattlefieldBoard.tsx`
  * `apps/web/src/components/board/CityAndLines.tsx`
  * `apps/web/src/components/board/board.css`
* **Context minimo (file da leggere):**
  * `apps/web/src/components/card/Card.tsx`
  * `apps/web/src/components/card/CardToken.tsx`
  * `apps/web/src/state/game-store.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.1 (riga 772), §9.2 (righe 774–796), §9.6 (righe 830–839)
* **Obiettivo implementativo:** Implementare il layout responsive del Tavolo del Cartografo per Desktop (`>= 1100px`) e Mobile (`360px–1099px` Landscape/Portrait): barre stato di Giocatore e Avversario (HP Mura, HP Centro Città, Slot Cap usati, Risorse o stato nascosto, conteggio mano/mazzi/scarti), zona "Città" (carte coperte con badge per il proprietario, dorsi impilati con `coveredCount` per l'avversario) e le 3 linee di battaglia (`Fronte`, `Centro`, `Retroguardia`) con animazione di schieramento alla rivelazione `UnitsRevealed`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 violazioni ESLint sui componenti del tavolo.

---

## Task M3-08: Mano a ventaglio interattiva (Drag & Drop + Tap-to-Play) e controlli d'azione

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M3-04, M3-07
* **File target:**
  * `apps/web/src/components/board/PlayerHand.tsx`
  * `apps/web/src/components/board/ActionControls.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/components/card/Card.tsx`
  * `apps/web/src/state/game-store.ts`
  * `packages/engine/src/view-types.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.4 `development` (righe 812–816), §9.6 (righe 830–839)
* **Obiettivo implementativo:** Implementare `<PlayerHand>` (fino a 10 carte con navigazione da tastiera tramite frecce/`Tab`/`Invio`, bordo illuminato `--brass` per le carte giocabili, attenuazione e banner esplicativo in italiano per i codici `UnplayableReason` quando si tocca una carta non giocabile) e `<ActionControls>` con doppio metodo di giocata (*Drag & Drop* con `@dnd-kit/core` oppure *Tap carta -> anteprima -> pulsante `"Gioca Carta"`*) e pulsante `"Passo"` con dialogo di conferma rapida disattivabile.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck, presenza di entrambi i flussi (Drag & Drop e Tap-to-Play) e banner per tutti i motivi di blocco.

---

## Task M3-09: Modali e barre di fase (`MulliganModal`, `HandLimitModal`, `ConversionModal`, `PrebattleInstantsBar`)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M3-08
* **File target:**
  * `apps/web/src/components/modals/MulliganAndDiscardModals.tsx`
  * `apps/web/src/components/modals/ConversionModal.tsx`
  * `apps/web/src/components/board/PrebattleInstantsBar.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/state/game-store.ts`
  * `packages/engine/src/index.ts`
  * `apps/web/src/components/card/Card.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.4 (righe 808–820)
* **Obiettivo implementativo:** Implementare la modale `mulligan` (`"Conferma Mulligan (N carte)"` / `"Mantieni mano"`), la modale `hand_limit` (`"Seleziona N carte da scartare"`, `"Conferma Scarto"` abilitato solo a esattamente `N` carte, e pulsante `"Suggerisci (FIFO)"` collegato a `autoDiscard`), il selettore `ConversionModal` per *Gilda dei Mercanti* / *Altoforno Reale* con anteprima del guadagno netto post-cap 16, e la barra non bloccante `PrebattleInstantsBar` che lascia esplorabili le 3 linee rivelate mostrando costo aggregato e anteprima bonus prima di `"Blocca Scelte Pre-Battaglia"`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 violazioni ESLint sui 3 file.

---

## Task M3-10: Barra `EventPlayer`, Registro di Battaglia (`aria-live`), drawer mobile e modali Hot-Seat / Fine Partita

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M3-06, M3-07
* **File target:**
  * `apps/web/src/components/board/BattlePlaybackAndLog.tsx`
  * `apps/web/src/components/modals/HotSeatAndGameOverModal.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/state/game-store.ts`
  * `apps/web/src/state/event-describer.ts`
  * `apps/web/src/controllers/local-controller.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.4–9.6 (righe 821–839), §9.8 (riga 852)
* **Obiettivo implementativo:** Implementare `<BattlePlaybackAndLog>` con l'indicatore della fase di battaglia attiva (*Fase 1: Tiro*, *Fase 2A: Impalamento*, *Fase 2B: Impatto/Accerchiamento*, *Fase 3: Mischia Ciclo X/6*, *Fase 4: Assedio e Razzia*), i pulsanti `1x`, `2x`, `Pausa`, `"Salta alla fine"`, il Registro di Battaglia con regione `aria-live="polite"` e il drawer laterale per viewport mobile. Implementare `<HotSeatAndGameOverModal>` con la schermata interstiziale *"Passa il dispositivo al Giocatore X — Tocca per svelare la tua mano"* e il riepilogo di fine partita (`annihilation`, `points`, `draw`, `concession`, `timeout`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e presenza degli attributi di accessibilità `aria-live="polite"` e `role="dialog"`.

---

## Task M3-11: Schermata Home, routing dell'applicazione e montaggio in `App.tsx`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-11, M3-09, M3-10
* **File target:**
  * `apps/web/src/screens/HomeScreen.tsx`
  * `apps/web/src/App.tsx`
  * `apps/web/src/main.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/components/board/BattlefieldBoard.tsx`
  * `apps/web/src/controllers/local-controller.ts`
  * `data/decks/aggro-breach.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.7 (righe 840–847)
* **Obiettivo implementativo:** Implementare `<HomeScreen>` con selezione modalità (Partita contro Bot `RandomBot` / `GreedyBot` con scelta dei mazzi preset, Partita Locale Hot-Seat, ed entry point per Multiplayer Online, Deck Builder, Archivio Carte e Regolamento Rapido) e collegare in `App.tsx` e `main.tsx` la navigazione tra Home e Tavolo di Partita con l'ispezione carte globale.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web build`
  * Condizione di successo: Build di produzione Vite completata con 0 errori TypeScript o di bundling.

---

## Task M3-12: Configurazione Playwright + `axe-core` e test E2E partita completa vs Bot (Desktop e Mobile)

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M3-11
* **File target:**
  * `playwright.config.ts`
  * `apps/web/e2e/local-match-and-a11y.spec.ts`
* **Context minimo (file da leggere):**
  * `apps/web/src/App.tsx`
  * `apps/web/src/screens/HomeScreen.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §10.1 Livello H (riga 870), §12 M3 (riga 925)
* **Obiettivo implementativo:** Configurare `playwright.config.ts` con avvio automatico del dev server web e progetti per Desktop (`1280x800`), Mobile Landscape (`800x360`) e Mobile Portrait (`360x800`). Scrivere il test E2E `local-match-and-a11y.spec.ts` che avvia e porta a termine fino a stato `finished` una partita completa contro Bot usando il flusso UI (mulligan, sviluppo, pre-battaglia, battaglia/salta alla fine su tutte le Ere) sia su Desktop sia su Mobile, verificando con `@axe-core/playwright` zero violazioni `critical` o `serious`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec playwright test apps/web/e2e/local-match-and-a11y.spec.ts`
  * Condizione di successo: Partita E2E completata fino a `finished` su Desktop e Mobile e 0 violazioni `axe` critical/serious.

---

## Task M4-01: Pipeline immagini `tools/art-build.ts` (`sharp` WebP/AVIF) e componente `<CardArtPicture>`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-10, M3-03
* **File target:**
  * `tools/art-build.ts`
  * `apps/web/src/components/card/CardArtPicture.tsx`
  * `packages/content/tests/art-pipeline.test.ts`
* **Context minimo (file da leggere):**
  * `tools/art-placeholders.ts`
  * `data/cards.art.json`
  * `apps/web/src/components/card/Card.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.4 (righe 726–737), §9.3 (riga 802), §12 M4 (riga 926)
* **Obiettivo implementativo:** Implementare `tools/art-build.ts` con `sharp` che converte i master in `data/art/src/{id}.png` (o fallback SVG placeholder se il master non è ancora presente) in file WebP e AVIF alle 3 larghezze `256`, `512` e `1024 px` in `apps/web/public/cards/` generando `apps/web/public/cards/art-manifest.json`. Creare `<CardArtPicture>` con `<picture>` (`srcset` AVIF/WebP + fallback SVG e `alt` localizzato da `cards.art.json`) e integrarlo in `<Card>`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx tools/art-build.ts && pnpm exec vitest run packages/content/tests/art-pipeline.test.ts`
  * Condizione di successo: Manifesto `art-manifest.json` generato per tutte le 45 carte e test della pipeline grafica verdi.

---

## Task M4-02: Schermata Archivio Carte esplorabile e Schermata Regolamento Rapido

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M3-11, M4-01
* **File target:**
  * `apps/web/src/screens/CardArchiveScreen.tsx`
  * `apps/web/src/screens/QuickRulesScreen.tsx`
  * `apps/web/tests/archive-rules.test.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/components/card/Card.tsx`
  * `apps/web/src/components/card/CardInspectModal.tsx`
  * `packages/content/src/index.ts`
  * `apps/web/src/App.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §8.3 (righe 715–725), §9.7 punti 1 e 3 (righe 842, 844), §12 M4 (riga 926)
* **Obiettivo implementativo:** Implementare `<CardArchiveScreen>` con griglia responsive delle 45 carte, filtri combinabili per Era (`I`, `II`, `III`), Tipo (`Economia`, `Unità`, `Istantanea`, `Riconversione`), Categoria, Linea e ricerca testuale per nome/regole, con apertura di `<CardInspectModal>` e tooltip parole chiave. Implementare `<QuickRulesScreen>` con il riepilogo strutturato del regolamento GDD (Ere, Raccolto e Rendite, Cap Logistico, 4 Fasi di Battaglia e Assedio) e scrivere i test unitari in `archive-rules.test.tsx`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/archive-rules.test.tsx`
  * Condizione di successo: Tutti i test di filtro sulle 45 carte e rendering del regolamento rapido verdi.

---

## Task M5-01: Package `@epochs/protocol` — Schemi Zod dei messaggi WebSocket/REST e `ErrorCode`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M0-04, M1-02
* **File target:**
  * `packages/protocol/package.json`
  * `packages/protocol/tsconfig.json`
  * `packages/protocol/src/index.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/types.ts`
  * `packages/engine/src/commands.ts`
  * `packages/engine/src/view-types.ts`
  * `data/schema/deck.schema.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.2 (righe 546–569)
* **Obiettivo implementativo:** Creare `@epochs/protocol` definendo gli schemi Zod e i tipi TypeScript per tutti i messaggi Client -> Server (`hello`, `queue.join`, `room.create`, `game.command` con `commandId`, `expectedStateVersion` e `ClientCommand` privo del campo `player`, `game.resync`) e Server -> Client (`welcome`, `match.found`, `game.snapshot`, `game.events`, `game.error`, `game.deadline`, `game.ended`), più tutti i 15 codici `ErrorCode` normativi della sezione 6.2.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/protocol exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck, zero uso di `any`.

---

## Task M5-02: Test unitari di validazione e sicurezza per `@epochs/protocol`

* **Tier:** [TIER: LOW]
* **Dipendenze:** M5-01
* **File target:**
  * `packages/protocol/tests/protocol.test.ts`
* **Context minimo (file da leggere):**
  * `packages/protocol/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.2 (righe 546–569), §10.3 (riga 885)
* **Obiettivo implementativo:** Scrivere la suite di test unitari per `@epochs/protocol` verificando la validazione positiva e negativa di ciascun messaggio C->S e S->C, il rifiuto di payload malformati o con campi non autorizzati (es. tentativo di iniettare `player` o `expectedStateVersion` negativo) e la mappatura dei 15 `ErrorCode`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run packages/protocol/tests/protocol.test.ts --coverage`
  * Condizione di successo: Tutti i test verdi e coverage su `packages/protocol` >= 85%.

---

## Task M5-03: Scheletro `@epochs/server` e interfaccia `GameRepository`

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M1-12, M5-01
* **File target:**
  * `apps/server/package.json`
  * `apps/server/tsconfig.json`
  * `apps/server/src/db/repository.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/index.ts`
  * `packages/protocol/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §2 (righe 80–85), §6.4 (righe 582–597)
* **Obiettivo implementativo:** Configurare `apps/server/package.json` (Fastify, `@fastify/websocket`, `better-sqlite3`, `pino`, `zod`) e definire in `src/db/repository.ts` l'interfaccia astratta `GameRepository` (pronta per SQLite e PostgreSQL) per la gestione di `players`, `decks`, `games` e `game_commands`, inclusa l'operazione transazionale atomica `saveTransition(gameUpdate, commandLogRecord)`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/server exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck su `apps/server/src/db/repository.ts`.

---

## Task M5-04: Implementazione `SqliteRepository` (`better-sqlite3`) con persistenza ibrida e test DB

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M5-03
* **File target:**
  * `apps/server/src/db/sqlite-repository.ts`
  * `apps/server/tests/repository.test.ts`
* **Context minimo (file da leggere):**
  * `apps/server/src/db/repository.ts`
  * `packages/engine/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.4 (righe 582–596), §10.1 Livello F (riga 868)
* **Obiettivo implementativo:** Implementare `SqliteRepository` creando le 4 tabelle della sezione 6.4 (`players`, `decks`, `games`, `game_commands` con vincolo `UNIQUE (game_id, command_id)` e `PRIMARY KEY (game_id, idx)`), la transazione atomica che aggiorna `canonical_state_json` + `state_hash` e accoda il comando in `game_commands`, e il caricamento delle partite `ACTIVE` con verifica di integrità `stateHash(state) === state_hash`. Scrivere i test in `repository.test.ts`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/server/tests/repository.test.ts`
  * Condizione di successo: Tutti i test di atomicità transazionale, vincolo univoco `command_id` e ripristino con verifica `stateHash` verdi.

---

## Task M5-05: Attore `GameRoom` — Coda sequenziale, concorrenza ottimistica, idempotenza e timer

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M5-04
* **File target:**
  * `apps/server/src/rooms/game-room.ts`
  * `apps/server/tests/game-room.test.ts`
* **Context minimo (file da leggere):**
  * `apps/server/src/db/repository.ts`
  * `packages/engine/src/index.ts`
  * `packages/protocol/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.1–6.3 (righe 540–581), §10.1 Livello F (riga 868)
* **Obiettivo implementativo:** Implementare `GameRoom` che serializza i comandi per partita, risolve il giocatore dalla sessione (rifiutando estranei con `MATCH_NOT_ACCESSIBLE`), gestisce l'idempotenza su `commandId` (stesso payload -> restituisce esito confermato; payload diverso -> `IDEMPOTENCY_KEY_REUSED`), verifica `expectedStateVersion === state.stateVersion` (altrimenti rifiuta con `STALE_STATE_VERSION` `retryable: true` e invia `game.snapshot`), persiste ogni transizione su `GameRepository`, invia a ciascun client solo la rispettiva `PlayerView` ed eventi filtrati da `projectEvent`, e gestisce i timer di finestra (`30s/30s/45s/30s`), il grace period di disconnessione (`60s`) e il `Concede` automatico dopo 3 timeout consecutivi.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/server/tests/game-room.test.ts`
  * Condizione di successo: Tutti i test su `STALE_STATE_VERSION`, `IDEMPOTENCY_KEY_REUSED`, isolamento seat, timer/3 timeout e assenza di leak tra P1 e P2 verdi.

---

## Task M5-06: Autenticazione ospite (SHA-256 token) e `RoomManager` (matchmaking e ripristino)

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M5-05
* **File target:**
  * `apps/server/src/auth/guest-session.ts`
  * `apps/server/src/rooms/room-manager.ts`
  * `apps/server/tests/room-manager.test.ts`
* **Context minimo (file da leggere):**
  * `apps/server/src/rooms/game-room.ts`
  * `apps/server/src/db/repository.ts`
  * `packages/protocol/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.2 (righe 548–557), §6.4 (riga 594), §6.5 (riga 600)
* **Obiettivo implementativo:** Implementare `guest-session.ts` per emettere token opachi ad alta entropia salvando solo l'hash SHA-256 in `players.token_hash`. Implementare `RoomManager` che valida i mazzi con `validateDeck` (`INVALID_DECK` se non valido), gestisce la coda rapida (`mode: 'quick'`), la creazione e l'ingresso in stanze private tramite `roomCode`, il `game.resync` alla riconnessione e la ricostruzione in memoria di tutte le partite `ACTIVE` all'avvio del server.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/server/tests/room-manager.test.ts`
  * Condizione di successo: Test di matchmaking rapido, stanza privata, rifiuto mazzo invalido e ripristino post-riavvio verdi.

---

## Task M5-07: Server Fastify + WebSocket, `/api/v1/healthz`, CRUD mazzi e Replay deterministico

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M5-06
* **File target:**
  * `apps/server/src/routes/replay-and-decks.ts`
  * `apps/server/src/server.ts`
  * `apps/server/tests/server-ws-replay.test.ts`
* **Context minimo (file da leggere):**
  * `apps/server/src/rooms/room-manager.ts`
  * `apps/server/src/db/sqlite-repository.ts`
  * `packages/protocol/src/index.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.2 (righe 546–569), §6.4 (righe 595–596), §6.5 (righe 598–604)
* **Obiettivo implementativo:** Implementare in `replay-and-decks.ts` l'endpoint `GET /api/v1/healthz`, gli endpoint REST per salvare/elencare i mazzi dell'utente e `GET /api/v1/games/:id/replay?as=P1|P2|public` (consentito solo per partite `FINISHED`, negato durante partite `ACTIVE` per non esporre mai segreti né `seed`, ricostruendo la partita da `seed` + `rules_json` + `game_commands` e verificando `stateHash`). Configurare in `server.ts` il gateway WebSocket (limite payload `16 KB`, controllo `Origin`, rate limiting, logger `pino` privo di dati segreti e graceful shutdown).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/server/tests/server-ws-replay.test.ts`
  * Condizione di successo: Partita completa via WebSocket, blocco replay su partita `ACTIVE`, verifica replay deterministico su partita `FINISHED` e `/api/v1/healthz` tutti verdi.

---

## Task M5-08: `RemoteGameController`, schermata Lobby Online e Visualizzatore Replay nel client

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M3-11, M5-07
* **File target:**
  * `apps/web/src/controllers/remote-controller.ts`
  * `apps/web/src/screens/OnlineLobbyScreen.tsx`
  * `apps/web/src/screens/ReplayViewerScreen.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/controllers/types.ts`
  * `apps/web/src/state/game-store.ts`
  * `packages/protocol/src/index.ts`
  * `apps/web/src/App.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.2–6.4 (righe 546–596), §9.7 punti 1 e 5 (righe 842, 846), §9.8 (riga 853)
* **Obiettivo implementativo:** Implementare `RemoteGameController` con gestione del token ospite, generazione di `commandId` univoci, invio di `expectedStateVersion`, riallineamento automatico su `STALE_STATE_VERSION`, calcolo dell'offset `serverTime` per la barra del conto alla rovescia `deadline` e riconnessione automatica con `game.resync`. Creare `<OnlineLobbyScreen>` (Coda Veloce, Crea/Entra in Stanza Privata con codice) e `<ReplayViewerScreen>` con controlli *Play / Pausa / Passo Avanti* e selettore del punto di vista (`P1`, `P2`, `Pubblico`).
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web exec tsc --noEmit`
  * Condizione di successo: 0 errori typecheck e 0 violazioni ESLint sui 3 file.

---

## Task M5-09: Test E2E Playwright multiplayer online con 2 browser context, riconnessione e replay

* **Tier:** [TIER: ARGON-HIGH]
* **Dipendenze:** M3-12, M5-08
* **File target:**
  * `apps/web/e2e/online-multiplayer.spec.ts`
* **Context minimo (file da leggere):**
  * `playwright.config.ts`
  * `apps/server/src/server.ts`
  * `apps/web/src/controllers/remote-controller.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §10.1 Livello H (riga 870), §12 M5 (riga 927)
* **Obiettivo implementativo:** Scrivere il test E2E `online-multiplayer.spec.ts` che avvia il server Fastify, apre 2 `BrowserContext` isolati (Giocatore 1 e Giocatore 2), li fa incontrare tramite stanza privata, simula una disconnessione/riconnessione con `game.resync` durante la partita, porta a termine la partita fino a `finished` e verifica il caricamento del replay nel Visualizzatore Replay.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec playwright test apps/web/e2e/online-multiplayer.spec.ts`
  * Condizione di successo: Test E2E multiplayer a 2 client, riconnessione e replay completato con exit code 0.

---

## Task M6-01: Store e persistenza del Deck Builder (validazione live, import/export JSON, sync)

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M1-04, M5-07
* **File target:**
  * `apps/web/src/state/deck-builder-store.ts`
  * `apps/web/tests/deck-builder-store.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/deck.ts`
  * `data/schema/deck.schema.ts`
  * `data/cards.rules.json`
  * `apps/server/src/routes/replay-and-decks.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `GDD.md` §2.1 (righe 23–26), `tech_spec.md` §4.6 (riga 322), §9.7 punto 2 (riga 843), §12 M6 (riga 928)
* **Obiettivo implementativo:** Implementare `deck-builder-store.ts` per gestire la creazione e modifica di mazzi personalizzati: aggiunta/rimozione carte nei 3 sotto-mazzi (Era I, Era II, Era III) con blocco a massimo 3 copie per carta e 20 carte per Era, validazione live tramite `validateDeck`, calcolo delle statistiche (curva dei costi Cibo/Legno/Metallo e ripartizione Edifici/Unità/Istantanee/Riconversioni), import/export JSON validato con Zod e salvataggio in `localStorage` con sincronizzazione opzionale verso il server.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/deck-builder-store.test.ts`
  * Condizione di successo: Tutti i test su limiti `3x20`, max 3 copie, curva costi e import/export JSON verdi.

---

## Task M6-02: Schermata Deck Builder (`DeckBuilderScreen.tsx`), integrazione in `App.tsx` e test E2E

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M4-02, M6-01
* **File target:**
  * `apps/web/src/screens/DeckBuilderScreen.tsx`
  * `apps/web/src/App.tsx`
  * `apps/web/e2e/deck-builder.spec.ts`
* **Context minimo (file da leggere):**
  * `apps/web/src/state/deck-builder-store.ts`
  * `apps/web/src/components/card/Card.tsx`
  * `apps/web/src/screens/HomeScreen.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §9.6 (riga 832), §9.7 punto 2 (riga 843), §12 M6 (riga 928)
* **Obiettivo implementativo:** Implementare `<DeckBuilderScreen>` con indicatori visivi di completamento per Era (`Era I: 20/20`, `Era II: 18/20`, `Era III: 20/20`), grafici della curva dei costi Cibo/Legno/Metallo, conteggio per tipo, pulsanti Importa/Esporta JSON e Salva (con touch target `>= 44x44px`), e collegare i mazzi salvati al selettore mazzo della `<HomeScreen>` e della `<OnlineLobbyScreen>`. Scrivere il test E2E `deck-builder.spec.ts` che crea, valida, salva e utilizza in partita un mazzo personalizzato verificando che i mazzi incompleti siano bloccati.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec playwright test apps/web/e2e/deck-builder.spec.ts`
  * Condizione di successo: Test E2E di creazione, blocco mazzo invalido, salvataggio e avvio partita con mazzo custom verde.

---

## Task M7-01: Effetti sonori sintetici Web Audio API (`sound-effects.ts`) e controlli audio

* **Tier:** [TIER: LOW]
* **Dipendenze:** M3-05
* **File target:**
  * `apps/web/src/audio/sound-effects.ts`
  * `apps/web/tests/sound-effects.test.ts`
* **Context minimo (file da leggere):**
  * `packages/engine/src/events.ts`
  * `apps/web/src/state/game-store.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §12 M7 (riga 929)
* **Obiettivo implementativo:** Implementare in `sound-effects.ts` un sintetizzatore procedurale leggero basato su Web Audio API (zero file audio pesanti nel bundle) che riproduce feedback sonori distinti per giocata carta, dichiarazione Passo, rivelazione `UnitsRevealed`, fasi di combattimento (`Tiro`, `Impalamento`, `Accerchiamento`, `Mischia`), `Breccia` sulle Mura e fine partita, con stato mute/volume persistito nelle preferenze utente.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/sound-effects.test.ts`
  * Condizione di successo: Tutti i test unitari del modulo audio (incluso fallback graceful quando `AudioContext` non è disponibile) verdi.

---

## Task M7-02: Tutorial guidato interattivo a seed fisso in 6 passi

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M3-06, M3-11
* **File target:**
  * `apps/web/src/tutorial/tutorial-scenario.ts`
  * `apps/web/src/screens/TutorialOverlay.tsx`
  * `apps/web/tests/tutorial.test.tsx`
* **Context minimo (file da leggere):**
  * `apps/web/src/controllers/local-controller.ts`
  * `apps/web/src/components/board/BattlefieldBoard.tsx`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §12 M7 (riga 929)
* **Obiettivo implementativo:** Definire in `tutorial-scenario.ts` una partita didattica con `fixedDecks` e `fixedInitiative` articolata in 6 passi guidati (1. Mulligan e Risorse/Cap; 2. Costruzione Edifici Economici e Rendite Cicli 2–3; 3. Schieramento coperto Unità e Cap Logistico; 4. Passo, Rivelazione `UnitsRevealed` e scelta Istantanee in Pre-Battaglia; 5. Triangolo tattico Tiro/Impalamento/Accerchiamento e Mischia; 6. Demolizione DEM, Breccia, Razzia e Riconversioni in Era III) e implementare `<TutorialOverlay>` con callout contestuali sul tavolo di gioco.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec vitest run apps/web/tests/tutorial.test.tsx`
  * Condizione di successo: Avanzamento deterministico lungo tutti i 6 passi del tutorial verificato con successo.

---

## Task M7-03: Configurazione PWA offline (`vite-plugin-pwa`) e controllo budget bundle (`<= 250 KB` gzip)

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M6-02, M7-01, M7-02
* **File target:**
  * `apps/web/vite.config.ts`
  * `apps/web/public/manifest.webmanifest`
  * `tools/check-bundle-budget.ts`
* **Context minimo (file da leggere):**
  * `apps/web/package.json`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §2 (riga 83), §10.3 (riga 887), §12 M7 (riga 929)
* **Obiettivo implementativo:** Configurare `vite-plugin-pwa` in `apps/web/vite.config.ts` e il `manifest.webmanifest` ("The Epochs", tema `#141E27`, orientamento consigliato `any`, caching Workbox completo di asset statici, font `@fontsource` e illustrazioni carte per il funzionamento 100% offline contro Bot e in Hot-Seat). Implementare `tools/check-bundle-budget.ts` che calcola la dimensione gzip del bundle JS iniziale in `apps/web/dist/assets` e fallisce con exit code `1` se supera `250 KB`.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm --filter @epochs/web build && pnpm exec tsx tools/check-bundle-budget.ts`
  * Condizione di successo: Build PWA generata con Service Worker e `check-bundle-budget.ts` verde con JS iniziale <= 250 KB gzip.

---

## Task M7-04: Containerizzazione Docker multi-stage, `.env.example` e documentazione `README.md`

* **Tier:** [TIER: LOW]
* **Dipendenze:** M2-05, M5-07, M7-03
* **File target:**
  * `Dockerfile`
  * `.env.example`
  * `README.md`
* **Context minimo (file da leggere):**
  * `package.json`
  * `apps/server/src/server.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §6.5 (riga 603), §10.3 (riga 886), §12 M7 (riga 929)
* **Obiettivo implementativo:** Creare il `Dockerfile` multi-stage (stage di build con `pnpm install --frozen-lockfile`, generazione arte e compilazione di `packages/*` e `apps/*`; stage runtime minimale Node LTS con healthcheck su `/api/v1/healthz`), documentare tutte le variabili d'ambiente in `.env.example` (`PORT`, `DATABASE_PATH`, `ALLOWED_ORIGINS`, `LOG_LEVEL`) e redigere `README.md` con architettura, comandi di sviluppo, validazione scenari, simulatore headless e deploy.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec tsx -e "import fs from 'node:fs'; for (const f of ['Dockerfile','.env.example','README.md']) if (!fs.existsSync(f) || fs.statSync(f).size < 100) process.exit(1);"`
  * Condizione di successo: Tutti e 3 i file presenti, completi e coerenti con gli script di `package.json`.

---

## Task M7-05: Pipeline CI GitHub Actions e test E2E di funzionamento PWA Offline

* **Tier:** [TIER: STANDARD]
* **Dipendenze:** M5-09, M7-03, M7-04
* **File target:**
  * `.github/workflows/ci.yml`
  * `apps/web/e2e/pwa-offline.spec.ts`
* **Context minimo (file da leggere):**
  * `package.json`
  * `playwright.config.ts`
  * `apps/web/vite.config.ts`
  * `docs/TECH-SPEC.md`
* **Spec di riferimento:** `tech_spec.md` §2 (riga 83), §10.3 (riga 886), §12 M7 (riga 929)
* **Obiettivo implementativo:** Creare `.github/workflows/ci.yml` con la sequenza bloccante prescritta dalla sezione 10.3 (`pnpm install --frozen-lockfile` -> `pnpm content:validate` -> `pnpm lint` -> `pnpm typecheck` -> `pnpm test` -> `pnpm validate:scenarios` -> `pnpm build` -> `pnpm test:e2e`) più verifica d'idempotenza di `gdd-to-cards.ts` e budget JS. Scrivere il test E2E `pwa-offline.spec.ts` che carica l'app, attiva `context.setOffline(true)` e verifica che una partita contro `GreedyBot` e una partita Hot-Seat funzionino integralmente offline.
* **Criteri di stop / Gate di validazione:**
  * Comando: `pnpm exec playwright test apps/web/e2e/pwa-offline.spec.ts`
  * Condizione di successo: Partita offline contro Bot e Hot-Seat completata con successo con `context.setOffline(true)`.
