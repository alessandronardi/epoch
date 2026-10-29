import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { CardInspectModal } from '../components/card/CardInspectModal.js';
import { createDeckBuilderStore } from '../state/deck-builder-store.js';
import { createOnlineTutorialDemo, createTutorialReplay } from '../tutorial/tutorial-demo.js';
import { CardArchiveScreen, type CardArchiveFilterState } from './CardArchiveScreen.js';
import { DeckBuilderScreen } from './DeckBuilderScreen.js';
import { OnlineLobbyScreen } from './OnlineLobbyScreen.js';
import { ReplayViewerScreen } from './ReplayViewerScreen.js';

const TASKS = {
  archive: [
    ['search', 'Cerca “Cavaliere” nella ricerca.'],
    ['filter', 'Seleziona Era II e tipo Unità.'],
    ['inspect', 'Ispeziona una carta dei risultati e chiudila.'],
    ['reset', 'Ripristina tutti i filtri con il pulsante dell’Archivio.'],
  ],
  'deck-builder': [
    ['preset', 'Carica un preset per ottenere tre sotto-mazzi validi da venti carte.'],
    ['remove', 'Rimuovi una carta: la validazione segnala il sotto-mazzo incompleto.'],
    ['restore', 'Aggiungi nuovamente la carta rimossa e torna a sessanta carte valide.'],
    ['export', 'Esporta il mazzo JSON con il controllo del Deck Builder.'],
    ['import', 'Apri Importa JSON e reimporta il file esportato o il testo qui sotto.'],
  ],
  'online-replay': [
    ['connected', 'Osserva la connessione ospite alla lobby dimostrativa.'],
    ['quick', 'Premi Coda Veloce: in questa demo non viene cercato un avversario reale.'],
    ['room', 'Crea una stanza e leggi il codice EPOCH.'],
    ['error', 'Prova a entrare con il codice ERRATO e leggi l’errore recuperabile.'],
    ['joined', 'Correggi il codice in EPOCH e riprova l’ingresso.'],
    ['disconnected', 'Simula una disconnessione con il pulsante della dimostrazione.'],
    ['reconnected', 'Premi Connetti nella lobby per ristabilire la sessione.'],
    ['replay', 'Apri il Visualizzatore Replay dalla lobby.'],
    ['forward', 'Avanza di un passo nel replay.'],
    ['back', 'Torna indietro di un passo.'],
    ['play', 'Avvia la riproduzione.'],
    ['pause', 'Metti in pausa la riproduzione.'],
    ['end', 'Salta alla fine e leggi l’esito.'],
    ['p2', 'Passa alla prospettiva P2.'],
    ['public', 'Passa alla prospettiva Pubblico: le mani restano nascoste.'],
    ['reset', 'Riporta il replay all’inizio.'],
  ],
} as const;
type ToolsModuleId = keyof typeof TASKS;

export function TutorialToolsTour({
  moduleId,
  onBack,
  onBackHome,
  onComplete,
}: {
  readonly moduleId: ToolsModuleId;
  readonly onBack: () => void;
  readonly onBackHome: () => void;
  readonly onComplete: () => void;
}): ReactElement {
  const [flags, setFlags] = useState<ReadonlySet<string>>(new Set());
  const flagsRef = useRef(new Set<string>());
  const mark = useCallback((id: string): void => {
    if (flagsRef.current.has(id)) return;
    flagsRef.current.add(id);
    setFlags(new Set(flagsRef.current));
  }, []);
  const [deckStore] = useState(() => createDeckBuilderStore({ storage: null }));
  const [exported, setExported] = useState('');
  const [inspectedCardId, setInspectedCardId] = useState<string | null>(null);
  const [demo, setDemo] = useState<ReturnType<typeof createOnlineTutorialDemo> | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const tasks = TASKS[moduleId];
  const complete = tasks.every(([id]) => flags.has(id));

  useEffect(() => {
    if (complete) onComplete();
  }, [complete]);
  useEffect(() => {
    if (moduleId !== 'online-replay') return;
    const next = createOnlineTutorialDemo(mark);
    setDemo(next);
    return () => next.dispose();
  }, [moduleId, mark]);
  useEffect(() => {
    if (moduleId !== 'deck-builder') return;
    return deckStore.subscribe((state, previous) => {
      if (state.isValid && state.statistics.total === 60) mark('preset');
      if (previous.statistics.total === 60 && state.statistics.total === 59) mark('remove');
      if (previous.statistics.total === 59 && state.statistics.total === 60 && state.isValid)
        mark('restore');
    });
  }, [moduleId, deckStore, mark]);
  const filtersChanged = useCallback(
    (filters: CardArchiveFilterState): void => {
      if (filters.searchQuery.trim().toLocaleLowerCase('it').includes('cavaliere')) mark('search');
      if (filters.era === 2 && filters.type === 'unit') mark('filter');
      if (
        flagsRef.current.has('inspect') &&
        filters.era === 'all' &&
        filters.type === 'all' &&
        filters.category === 'all' &&
        filters.line === 'all' &&
        filters.searchQuery === ''
      )
        mark('reset');
    },
    [mark],
  );

  return (
    <div
      className="tutorial-screen tutorial-tools"
      data-testid="tutorial-tools"
      data-module={moduleId}
    >
      <section className="tutorial-guide" aria-label="Guida dell’esercitazione">
        <p className="tutorial-guide__eyebrow">Esercitazioni complementari</p>
        <h1>
          {moduleId === 'archive'
            ? 'Scopri l’Archivio'
            : moduleId === 'deck-builder'
              ? 'Costruisci un mazzo di prova'
              : 'Online e replay: dimostrazione locale'}
        </h1>
        {moduleId === 'deck-builder' && (
          <p>Questa bozza è separata dai tuoi mazzi e non viene salvata sul dispositivo.</p>
        )}
        {moduleId === 'online-replay' && (
          <p>
            Il trasporto è simulato in locale: nessuna connessione esterna e nessuna coda pubblica.
            In una partita reale il server gestisce le scadenze e il riallineamento automatico dopo
            la riconnessione.
          </p>
        )}
        <ol className="tutorial-checklist">
          {tasks.map(([id, text]) => (
            <li key={id} data-completed={flags.has(id)}>
              <span aria-hidden="true">{flags.has(id) ? '✓ ' : '○ '}</span>
              {text}
              <span className="sr-only">{flags.has(id) ? ' Completato' : ' Da completare'}</span>
            </li>
          ))}
        </ol>
        {complete && (
          <p role="status" data-testid="tutorial-tour-completed">
            Esercitazione completata
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {moduleId === 'online-replay' && !replayOpen && (
          <button
            type="button"
            data-testid="tutorial-demo-disconnect"
            onClick={() => demo?.disconnect()}
          >
            Simula disconnessione
          </button>
        )}
        {exported && (
          <details>
            <summary>JSON esportato da copiare</summary>
            <textarea aria-label="JSON del mazzo di prova" readOnly value={exported} rows={6} />
          </details>
        )}
        <div className="tutorial-guide__navigation">
          <button type="button" onClick={onBack}>
            Esercitazioni
          </button>
        </div>
      </section>
      {moduleId === 'archive' && (
        <CardArchiveScreen
          onBackHome={onBackHome}
          onFiltersChange={filtersChanged}
          onInspectCard={setInspectedCardId}
        />
      )}
      {moduleId === 'archive' && (
        <CardInspectModal
          cardId={inspectedCardId}
          onClose={() => {
            if (inspectedCardId) mark('inspect');
            setInspectedCardId(null);
          }}
        />
      )}
      {moduleId === 'deck-builder' && (
        <>
          <DeckBuilderScreen
            store={deckStore}
            onBackHome={onBackHome}
            onInspectCard={setInspectedCardId}
            onJsonExport={(json) => {
              setExported(json);
              mark('export');
            }}
            onJsonImport={(success) => {
              if (success) mark('import');
            }}
          />
          <CardInspectModal cardId={inspectedCardId} onClose={() => setInspectedCardId(null)} />
        </>
      )}
      {moduleId === 'online-replay' &&
        demo &&
        (replayOpen ? (
          <>
            <ReplayViewerScreen
              initialGameId="tutorial-local"
              initialReplayPayload={createTutorialReplay('P1')}
              loadReplay={async (_id, perspective) => createTutorialReplay(perspective)}
              onInteraction={(action) => mark(action === 'P2' ? 'p2' : action)}
              onInspectCard={setInspectedCardId}
              onBack={onBack}
            />
            <CardInspectModal cardId={inspectedCardId} onClose={() => setInspectedCardId(null)} />
          </>
        ) : (
          <OnlineLobbyScreen
            defaultWsUrl="ws://tutorial.invalid/ws"
            createController={demo.createController}
            onBackHome={onBackHome}
            onMatchReady={() => {}}
            onOpenReplayViewer={() => {
              if (
                ![
                  'connected',
                  'quick',
                  'room',
                  'error',
                  'joined',
                  'disconnected',
                  'reconnected',
                ].every((id) => flagsRef.current.has(id))
              ) {
                setNotice('Completa prima le prove della lobby indicate nella guida.');
                return;
              }
              mark('replay');
              setNotice('');
              setReplayOpen(true);
            }}
          />
        ))}
    </div>
  );
}
