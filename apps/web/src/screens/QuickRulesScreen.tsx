import { KEYWORD_TOOLTIPS_IT, type KeywordName } from '@epochs/content';
import type { ReactElement } from 'react';
import './rules.css';
import {
  EraIcon,
  ResourceIcon,
  StatIcon,
} from '../components/icons/DomainIcons.js';

export interface QuickRulesScreenProps {
  readonly onBackHome?: (() => void) | undefined;
}

const KEYWORD_NAMES = Object.keys(KEYWORD_TOOLTIPS_IT) as KeywordName[];

export function QuickRulesScreen({
  onBackHome,
}: QuickRulesScreenProps): ReactElement {
  return (
    <main
      className="cartographer-table quick-rules-screen"
      data-testid="screen-rules"
      style={{
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: 'clamp(12px, 2.5vw, 24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <div
        style={{
          width: 'min(1080px, 100%)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Intestazione Regolamento Rapido */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            padding: '14px 18px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.92)',
            border: '1.5px solid var(--brass, #B58E48)',
          }}
        >
          <div>
            <h1
              className="font-display"
              style={{ margin: 0, fontSize: '1.45rem', color: 'var(--brass)' }}
            >
              Regolamento
            </h1>
            <p
              style={{
                margin: '4px 0 0 0',
                fontSize: '0.9rem',
                color: 'var(--chalk-muted, #A7B4C2)',
              }}
            >
              Tutto ciò che serve per giocare a The Epochs, dalla preparazione alla vittoria.
            </p>
          </div>

          {onBackHome && (
            <button
              type="button"
              className="touch-target"
              data-testid="back-to-home-btn"
              onClick={onBackHome}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid var(--brass, #B58E48)',
                backgroundColor: 'var(--surface-card, #223444)',
                color: 'var(--chalk, #E9E5D6)',
                fontFamily: 'var(--font-numeric)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Torna alla Home
            </button>
          )}
        </header>

        <nav aria-label="Indice del regolamento" className="rules-index">
          <a href="#rules-sec-settings">Impostazioni partita</a>
          <a href="#rules-sec-eras">Preparazione</a>
          <a href="#rules-sec-economy">Economia</a>
          <a href="#rules-sec-development">Sviluppo</a>
          <a href="#rules-sec-battle">Battaglia</a>
          <a href="#rules-sec-siege">Assedio e vittoria</a>
          <a href="#rules-sec-keywords">Glossario</a>
        </nav>

        <section
          aria-labelledby="rules-sec-settings"
          data-testid="rules-section-settings"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            lineHeight: 1.55,
          }}
        >
          <h2 id="rules-sec-settings" className="font-display" style={{ margin: '0 0 10px', fontSize: '1.2rem', color: 'var(--brass, #B58E48)' }}>
            Impostazioni partita nella home
          </h2>
          <p>
            Apri <strong>Impostazioni partita</strong> nella home per modificare il
            <strong> seed</strong>, una parola o sequenza di caratteri che determina
            le scelte casuali iniziali, come l&apos;iniziativa e il mescolamento dei mazzi.
            Chiudi la finestra: il valore inserito viene usato quando avvii una
            partita contro il bot o una partita locale Hot-Seat.
          </p>
          <p>
            Con lo stesso seed e gli stessi mazzi si ottiene la stessa preparazione
            iniziale; per riprodurre anche lo svolgimento servono le stesse scelte
            durante la partita. Cambiare seed permette di ottenere una preparazione diversa.
            Il valore iniziale è <code>epochs-cartographer-seed-1</code>. Se lasci
            il campo vuoto, il gioco usa un valore predefinito per la modalità scelta.
          </p>
          <p style={{ marginBottom: 0 }}>
            Il valore resta disponibile mentre sei nella home, ma torna a quello
            iniziale quando esci dalla home e vi ritorni. Una rivincita genera un
            seed diverso a partire da quello della partita precedente. Il campo
            non imposta il seed delle partite online.
          </p>
        </section>

        {/* Sezione 1: Le 3 Ere, Mazzi, Pesca, Limite di Mano e Iniziativa */}
        <section
          aria-labelledby="rules-sec-eras"
          data-testid="rules-section-eras"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            lineHeight: 1.55,
          }}
        >
          <h2
            id="rules-sec-eras"
            className="font-display"
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.2rem',
              color: 'var(--brass, #B58E48)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <EraIcon era={1} size={18} />
            <EraIcon era={2} size={18} />
            <EraIcon era={3} size={18} />
            <span>1. Struttura in 3 Ere, Mazzi (3×20) e Limite di Mano</span>
          </h2>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
            <li>
              <strong>Obiettivo e preparazione:</strong> due giocatori si sfidano
              in tre Ere. Ciascuno inizia con 6 HP alle Mura e 10 HP al Centro
              Città, senza edifici o unità in campo. Porta il Centro Città
              avversario a 0 HP per vincere subito, oppure termina la terza Era
              con più HP al tuo Centro Città.
            </li>
            <li>
              <strong>Composizione del Mazzo:</strong> 60 carte totali divise in
              3 sotto-mazzi da <strong>20 carte per Era</strong> (Era I, Era II,
              Era III), con massimo <strong>3 copie</strong> per singola carta.
              Le carte conservate in mano restano giocabili anche nelle Ere
              successive (le Riconversioni sono giocabili solo in Era III).
            </li>
            <li>
              <strong>Pesca e Mulligan:</strong> a inizio Era I ciascun giocatore
              pesca <strong>8 carte</strong> da Era I ed effettua un singolo{' '}
              <em>Mulligan</em> simultaneo (pescando prima le carte sostitutive
              dalla cima e riponendo quelle scartate in fondo). All&apos;inizio
              di Era II ed Era III si pescano <strong>5 carte</strong> dal
              rispettivo sotto-mazzo. Non si pesca a ogni ciclo.
            </li>
            <li>
              <strong>Limite di Mano (10 carte):</strong> se dopo la pesca d&apos;apertura
              la mano supera <strong>10 carte</strong>, il giocatore scarta fino a
              riportarla a 10 prima del Ciclo 1 scegliendo le carte da scartare.
              Per IA e in caso di timeout o disconnessione lo scarto è automatico:
              prima le carte di Era inferiore, poi quelle di costo totale inferiore
              e, a parità, quelle pescate prima.
            </li>
            <li>
              <strong>Iniziativa:</strong> P1 agisce per primo in{' '}
              <strong>Era I</strong> e in <strong>Era III</strong>; P2 agisce per
              primo in <strong>Era II</strong>.
            </li>
          </ul>
        </section>

        {/* Sezione 2: Economia, Cap di Magazzino, Raccolto d'apertura e Rendite */}
        <section
          aria-labelledby="rules-sec-economy"
          data-testid="rules-section-economy"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            lineHeight: 1.55,
          }}
        >
          <h2
            id="rules-sec-economy"
            className="font-display"
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.2rem',
              color: 'var(--brass, #B58E48)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <ResourceIcon resource="food" size={16} />
            <ResourceIcon resource="wood" size={16} />
            <ResourceIcon resource="metal" size={16} />
            <span>2. Economia: Cap di Magazzino, Raccolto e Rendite Periodiche</span>
          </h2>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
            <li>
              <strong>Cap di Magazzino per risorsa (Cibo, Legno, Metallo):</strong>{' '}
              <strong>7</strong> in Era I, <strong>11</strong> in Era II,{' '}
              <strong>16</strong> in Era III. Ogni eccedenza oltre il cap viene
              troncata come <em>overflow</em>.
            </li>
            <li>
              <strong>Dotazione iniziale + Raccolto d&apos;apertura Era I:</strong>{' '}
              dotazione di avvio <code>2 Cibo, 2 Legno, 0 Metallo</code> +
              Raccolto d&apos;apertura Era I (<code>+2 Cibo, +2 Legno, +0 Metallo</code>) ={' '}
              <strong>4 Cibo, 4 Legno, 0 Metallo</strong> disponibili al Ciclo 1
              di Era I.
            </li>
            <li>
              <strong>Raccolto d&apos;apertura Era II ed Era III:</strong>{' '}
              <code>+2 Cibo, +2 Legno, +1 Metallo</code> più{' '}
              <strong>2× la produzione</strong> di ciascun Edificio Economico
              attivo.
            </li>
            <li>
              <strong>Rendite periodiche (Ciclo 2 e Ciclo 3):</strong> all&apos;apertura
              del Ciclo 2 e del Ciclo 3 (se almeno un giocatore non ha passato),
              entrambi i giocatori ricevono{' '}
              <code>+1 Cibo, +1 Legno</code> più{' '}
              <strong>1× la produzione</strong> di tutti gli edifici attivi in
              quel momento (inclusi quelli appena costruiti). Dal Ciclo 4 in poi
              non ci sono rendite aggiuntive.
            </li>
          </ul>
        </section>

        {/* Sezione 3: Fase di Sviluppo, Cap Logistico e Riconversioni */}
        <section
          aria-labelledby="rules-sec-development"
          data-testid="rules-section-development"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            lineHeight: 1.55,
          }}
        >
          <h2
            id="rules-sec-development"
            className="font-display"
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.2rem',
              color: 'var(--brass, #B58E48)',
            }}
          >
            3. Fase di Sviluppo, Cap Logistico e Riconversioni
          </h2>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
            <li>
              <strong>Cap Logistico d&apos;Era:</strong> numero massimo di nuove
              carte da campo (Economia + Unità) giocabili nell&apos;Era:{' '}
              <strong>4 slot in Era I</strong>, <strong>5 slot in Era II</strong>,{' '}
              <strong>6 slot in Era III</strong>. Gli edifici delle Ere
              precedenti restano attivi senza occupare slot delle Ere successive.
            </li>
            <li>
              <strong>Una sola azione per opportunità:</strong> ad ogni turno di
              un ciclo il giocatore deve giocare <strong>al massimo 1 carta</strong>{' '}
              dalla mano oppure dichiarare <strong>Passo</strong> (irrevocabile
              per il resto dell&apos;Era). Se non ha carte giocabili deve passare;
              chi ha passato viene saltato, ma riceve comunque le rendite finché
              l&apos;avversario continua a giocare.
            </li>
            <li>
              <strong>Schieramento coperto e bluff economico:</strong> durante la
              Fase di Sviluppo, saldo risorse, Edifici e Unità sono segreti per
              l&apos;avversario (che vede solo il conteggio totale delle carte
              coperte nella città). Gli Edifici Economici non vengono mai
              rivelati all&apos;avversario.
            </li>
            <li>
              <strong>Riconversioni (Era III, 0 Slot):</strong> richiedono il
              pagamento del costo e il sacrificio di 1 proprio Edificio Economico attivo:{' '}
              <em>Gilda dei Mercanti</em> accredita{' '}
              <code>+1 Cibo, +1 Legno, +1 Metallo</code> per ogni tuo edificio
              attivo pre-sacrificio; <em>Altoforno Reale</em> accredita{' '}
              <code>+2 Legno, +3 Metallo</code> e conferisce{' '}
              <strong>+1 DEM cumulabile</strong> a tutte le tue unità in Era III.
            </li>
          </ul>
        </section>

        {/* Sezione 4: Pre-Battaglia e le 4 Fasi della Battaglia Campale */}
        <section
          aria-labelledby="rules-sec-battle"
          data-testid="rules-section-battle"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            lineHeight: 1.55,
          }}
        >
          <h2
            id="rules-sec-battle"
            className="font-display"
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.2rem',
              color: 'var(--brass, #B58E48)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <StatIcon stat="atk" size={16} />
            <StatIcon stat="hp" size={16} />
            <span>4. Pre-Battaglia e le 4 Fasi della Battaglia Deterministica</span>
          </h2>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' }}>
            <li>
              <strong>Finestra Pre-Battaglia simultanea:</strong> quando entrambi
              i giocatori passano, tutte le Unità vengono rivelate sulle 3 linee
              (<em>Fronte</em>, <em>Centro</em>, <em>Retroguardia</em>) e i saldi
              risorse diventano pubblici. I giocatori scelgono segretamente 0 o
              più carte <strong>Istantanee (0 Slot)</strong>; i bonus ad ATK e
              Mura si applicano simultaneamente.
            </li>
            <li>
              <strong>Come si risolvono i danni:</strong> in ogni fase i due lati
              calcolano gli attacchi dalle unità vive all&apos;inizio della fase e
              infliggono i danni simultaneamente. Il danno in eccesso passa al
              bersaglio successivo; le unità a 0 HP vengono rimosse prima della
              fase seguente. ATK indica l&apos;attacco, HP la resistenza e DEM la
              demolizione contro le strutture.
            </li>
            <li>
              <strong>Guardia Pre-Fase e Bersagli FIFO:</strong> prima di Fase 1,
              2A, 2B e di ciascuno dei 6 cicli di Fase 3, se un solo lato ha
              unità combattenti vive ottiene subito la{' '}
              <strong>vittoria campale</strong> e passa alla Fase 4; se nessuno
              ne ha, la battaglia termina in{' '}
              <strong>Annientamento Reciproco</strong>. Le unità d&apos;Assedio
              non combattono e non sono bersagliabili. Dentro ogni linea i danni
              colpiscono in ordine FIFO di schieramento (<code>seq</code>).
            </li>
            <li>
              <strong>Fase 1 — Tiro degli Arcieri:</strong> ogni Arciere vivo
              infligge il proprio ATK, aggiungendo <code>+Era</code> (stampato
              sulla carta) se il nemico ha almeno un Lanciere vivo. Priorità:{' '}
              <code>Fronte → Centro → Retroguardia</code>.
            </li>
            <li>
              <strong>Fase 2A — Impalamento:</strong> ogni Lanciere vivo infligge{' '}
              <code>1 + 2×Era</code> danni (<code>3 / 5 / 7</code>) solo alla{' '}
              <strong>Cavalleria</strong> nemica, rimuovendo i caduti prima della
              carica.
            </li>
            <li>
              <strong>Fase 2B — Impatto e Accerchiamento:</strong> la Cavalleria
              superstite attacca. Se il nemico <strong>non ha Lancieri vivi</strong>,
              attiva <strong>Accerchiamento</strong>: colpisce con priorità{' '}
              <code>Retroguardia → Fronte → Centro</code> e ottiene{' '}
              <code>+Era</code> ATK se c&apos;è almeno un Arciere nemico vivo.
              Altrimenti attacca con priorità standard{' '}
              <code>Fronte → Centro → Retroguardia</code>.
            </li>
            <li>
              <strong>Fase 3 — Mischia Generale (max 6 cicli):</strong> tutte le
              unità combattenti vive sommano il proprio ATK (gli Arcieri
              contribuiscono con <code>max(1, floor(ATK / 2))</code>). Se dopo il
              6° ciclo entrambi i lati hanno ancora almeno 1 combattente vivo, la
              battaglia finisce in <strong>Stallo</strong> (nessun assedio).
            </li>
          </ul>
        </section>

        {/* Sezione 5: Fase 4 Assedio, Riporto Mura e Condizioni di Vittoria */}
        <section
          aria-labelledby="rules-sec-siege"
          data-testid="rules-section-siege"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
            lineHeight: 1.55,
          }}
        >
          <h2
            id="rules-sec-siege"
            className="font-display"
            style={{
              margin: '0 0 10px 0',
              fontSize: '1.2rem',
              color: 'var(--brass, #B58E48)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <StatIcon stat="dem" size={16} />
            <StatIcon stat="walls" size={16} />
            <StatIcon stat="cityCenter" size={16} />
            <span>5. Fase 4 (Assedio, Breccia e Razzia) e Vittoria</span>
          </h2>
          <ul style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '6px' }}>
            <li>
              <strong>Demolizione e Breccia:</strong> solo il vincitore campale
              somma la <strong>DEM</strong> (<code>D</code>) di tutte le sue
              unità superstiti (combattenti + Assedio) contro le Mura (
              <code>W</code>) del difensore. Si ha{' '}
              <strong>Breccia</strong> se <code>D &gt; 0</code> e{' '}
              <code>D &gt;= W</code>. Le Mura scendono a{' '}
              <code>max(0, W - D)</code> e il danno in eccesso{' '}
              <code>max(0, D - W)</code> colpisce il <strong>Centro Città</strong>.
            </li>
            <li>
              <strong>Annientamento o Razzia:</strong> se il Centro Città scende
              a <code>&lt;= 0 HP</code>, l&apos;attaccante vince immediatamente
              per <strong>Annientamento</strong>. Altrimenti, se c&apos;è stata
              Breccia, razzia fino a <strong>1 Cibo</strong> e{' '}
              <strong>1 Legno</strong> dal magazzino nemico, nei limiti delle
              risorse disponibili e dello spazio nel proprio magazzino (il Metallo
              non è razziabile).
            </li>
            <li>
              <strong>Transizione di Fine Era (I → II → III):</strong> tutte le
              unità superstiti vengono congedate negli scarti; gli Edifici
              Economici restano attivi. Le Mura si aggiornano a{' '}
              <code>Base nuova Era + floor(Mura residue / 2)</code> (Base Era I:{' '}
              <code>6</code>, Era II: <code>8</code>, Era III: <code>10</code>).
              Gli HP massimi del Centro Città salgono da <code>10</code> (Era I) a{' '}
              <code>16</code> (Era II) e <code>22</code> (Era III) meno il danno
              diretto accumulato.
            </li>
            <li>
              <strong>Vittoria ai Punti / Pareggio (fine Era III):</strong> se al
              termine dell&apos;Era III entrambi i Centri Città sono ancora in
              piedi, vince il giocatore con più HP residui sul proprio Centro
              Città (o <strong>Pareggio</strong> in caso di parità).
            </li>
          </ul>
        </section>

        {/* Sezione 6: Glossario delle 6 Parole Chiave */}
        <section
          aria-labelledby="rules-sec-keywords"
          data-testid="rules-section-keywords"
          style={{
            padding: '16px 20px',
            borderRadius: '10px',
            backgroundColor: 'rgba(20, 30, 39, 0.88)',
            border: '1px solid rgba(181, 142, 72, 0.4)',
          }}
        >
          <h2
            id="rules-sec-keywords"
            className="font-display"
            style={{
              margin: '0 0 12px 0',
              fontSize: '1.2rem',
              color: 'var(--brass, #B58E48)',
            }}
          >
            6. Glossario Ufficiale delle Parole Chiave
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '10px',
            }}
          >
            {KEYWORD_NAMES.map((kw) => (
              <div
                key={kw}
                data-testid={`rules-keyword-${kw}`}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: 'var(--surface-card, #223444)',
                  border: '1px solid rgba(181, 142, 72, 0.35)',
                }}
              >
                <h3
                  className="font-display"
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '0.98rem',
                    color: 'var(--brass, #B58E48)',
                  }}
                >
                  {kw}
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.88rem',
                    color: 'var(--chalk, #E9E5D6)',
                    lineHeight: 1.45,
                  }}
                >
                  {KEYWORD_TOOLTIPS_IT[kw]}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
