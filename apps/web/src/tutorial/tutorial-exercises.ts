import type { Bot } from '@epochs/bots';
import { getPreset } from '../../../../packages/content/src/presets.js';
import type { EraNo } from '@epochs/engine';
import { LocalGameController } from '../controllers/local-controller.js';
import type { GameStoreApi } from '../state/game-store.js';
import {
  completeTutorialDeck,
  createTutorialController,
  createTutorialDecks,
  DISCARD_TUTORIAL_CUES,
  TUTORIAL_CUES,
  tutorialOpponent,
  type TutorialCue,
} from './tutorial-scenario.js';

export type MatchExerciseId =
  | 'civilizations'
  | 'main'
  | 'discard'
  | 'economy'
  | 'budget'
  | 'annihilation'
  | 'draw'
  | 'concession'
  | 'timeout'
  | 'hotseat'
  | 'playback';
export type TutorialModuleId = MatchExerciseId | 'archive' | 'deck-builder' | 'online-replay';
export interface TutorialModule {
  readonly id: TutorialModuleId;
  readonly title: string;
  readonly description: string;
}
export const TUTORIAL_MODULES: readonly TutorialModule[] = [
  {
    id: 'civilizations',
    title: 'Inizia da Equilibrio Tattico',
    description:
      'Regni feudali: Organizzazione, investimento e un esercito misto nel regolamento v2.',
  },
  {
    id: 'main',
    title: 'La partita sulle tre Ere',
    description: 'Economia, esercito, battaglia, assedio e vittoria ai punti.',
  },
  {
    id: 'discard',
    title: 'Limite di mano e FIFO',
    description: 'Conserva la mano e scegli gli scarti nella nuova Era.',
  },
  {
    id: 'economy',
    title: 'Magazzino e slot',
    description: 'Raggiungi il cap economico e prova una carta senza slot liberi.',
  },
  {
    id: 'budget',
    title: 'Costi e Istantanee',
    description: 'Riconosci risorse mancanti e costi combinati oltre il budget.',
  },
  {
    id: 'annihilation',
    title: 'Vittoria per distruzione',
    description: 'Una variante della partita culmina in un assedio decisivo.',
  },
  {
    id: 'draw',
    title: 'Pareggio a fine Era III',
    description: 'Conserva le carte e osserva il confronto dei Centri Città.',
  },
  {
    id: 'concession',
    title: 'Resa e uscita',
    description: 'Distingui la resa in partita dall’uscita dal tutorial.',
  },
  {
    id: 'timeout',
    title: 'Dimostrazione dei timeout',
    description: 'Tre scadenze accelerate, applicate automaticamente in locale.',
  },
  {
    id: 'hotseat',
    title: 'Privacy hot-seat',
    description: 'Passa il dispositivo e svela la mano soltanto dopo la conferma.',
  },
  {
    id: 'playback',
    title: 'Controlla la riproduzione',
    description: 'Esercita ripresa, pausa e velocità durante un combattimento reale.',
  },
  {
    id: 'archive',
    title: 'Tour dell’Archivio',
    description: 'Cerca, filtra e ispeziona le carte nei controlli dell’Archivio.',
  },
  {
    id: 'deck-builder',
    title: 'Tour del Deck Builder',
    description: 'Modifica e valida un mazzo di prova separato dalle tue bozze.',
  },
  {
    id: 'online-replay',
    title: 'Online e replay: demo locale',
    description: 'Prova lobby, errori, riconnessione e replay senza connessioni esterne.',
  },
];

function cue(
  title: string,
  text: string,
  action: TutorialCue['action'],
  phase: TutorialCue['phase'] = 'development',
  era: EraNo = 1,
  target: TutorialCue['target'] = 'hand',
): TutorialCue {
  return { title, text, action, phase, era, target, label: title, lesson: 1 };
}
const keep = () =>
  cue(
    'Mantieni le otto carte',
    'Premi Mantieni mano nella finestra del Mulligan.',
    { kind: 'keep' },
    'mulligan',
  );
const pass = (era: EraNo = 1) =>
  cue(
    'Dichiara Passo',
    'Premi Passo e conferma: conserverai le carte per il resto dell’Era.',
    { kind: 'pass' },
    'development',
    era,
  );
const instants = (era: EraNo = 1) =>
  cue(
    'Conferma senza Istantanee',
    'Lascia vuota la selezione e blocca le scelte nella barra reale di Pre-Battaglia.',
    { kind: 'instants', cardIds: [] },
    'prebattle',
    era,
  );
const play = (id: string, title: string, text: string) =>
  cue(title, text, { kind: 'play', cardId: id });
const finish = (text: string, era: EraNo = 1, phase: TutorialCue['phase'] = 'development') =>
  cue('Esercitazione completata', text, { kind: 'read' }, phase, era);

export const ECONOMY_CUES: readonly TutorialCue[] = [
  keep(),
  play(
    'e1_farm',
    'Costruisci la prima Fattoria',
    'La Fattoria costa 2 Legno. Il nemico passerà; le tue opportunità continuano e aprono i cicli successivi.',
  ),
  play(
    'e1_farm',
    'Costruisci la seconda Fattoria',
    'Il prossimo raccolto aggiunge la produzione degli edifici. Confronta il Cibo con il cap di 7.',
  ),
  cue(
    'Osserva il limite del magazzino',
    'Il Raccolto del Ciclo 3 avrebbe portato il Cibo oltre 7: l’eccedenza è persa. le rendite non proseguono oltre il Ciclo 3.',
    { kind: 'read' },
    'development',
    1,
    'resources',
  ),
  play(
    'e1_farm',
    'Occupa il terzo slot',
    'Costruisci la terza Fattoria: possedere risorse non aumenta il numero di slot disponibili.',
  ),
  play(
    'e1_lumb',
    'Occupa il quarto slot',
    'Costruisci la Segheria. In Era I il Cap Logistico è 4: l’ultimo slot è ora occupato.',
  ),
  cue(
    'Prova una carta senza slot',
    'Tocca la seconda Segheria. Hai Cibo sufficiente, ma il motivo reale della mancata giocata è il Cap Logistico raggiunto.',
    { kind: 'unplayable', cardId: 'e1_lumb' },
    'development',
    1,
    'slots',
  ),
  finish(
    'Hai osservato cap di magazzino e limite degli slot. Le Ere successive aumentano entrambi, mentre le Riconversioni non richiedono slot.',
  ),
];
export const BUDGET_CUES: readonly TutorialCue[] = [
  keep(),
  cue(
    'Riconosci il Metallo mancante',
    'Tocca il Cavaliere Feudale: costa 1 Metallo e al momento ne hai zero. Il messaggio spiega la risorsa mancante senza consumare l’opportunità.',
    { kind: 'unplayable', cardId: 'u1_cav_h' },
  ),
  pass(),
  cue(
    'Confronta il costo combinato',
    'Seleziona due Palizzate Extra: costano insieme 4 Legno. La terza richiederebbe 6 e il suo pulsante è disabilitato. Leggi il totale e premi Cancella selezione nella barra di Pre-Battaglia.',
    { kind: 'instant-budget' },
    'prebattle',
  ),
  finish(
    'Il costo delle Istantanee si somma. Puoi correggere la selezione prima di bloccarla; la conferma è irrevocabile.',
    1,
    'prebattle',
  ),
];
const drawCues: TutorialCue[] = [keep()];
for (const era of [1, 2, 3] as const) {
  if (era > 1)
    drawCues.push(
      cue(
        'Riduci la mano a dieci',
        'Conservando le carte superi il limite. Scegli l’esatto numero di scarti oppure prova il suggerimento FIFO.',
        { kind: 'discard' },
        'hand_limit',
        era,
      ),
    );
  drawCues.push(pass(era), instants(era));
}
drawCues.push(
  finish(
    'I due Centri Città hanno gli stessi HP alla fine dell’Era III: il motore assegna un pareggio. Non basta vincere una battaglia per vincere la partita.',
    3,
    'finished',
  ),
);

const annihilationCues = TUTORIAL_CUES.filter((item) =>
  ['mulligan', 'play', 'conversion', 'pass', 'instants'].includes(item.action.kind),
).flatMap((item): TutorialCue[] => {
  if (item.action.kind === 'play' && item.action.cardId === 'u3_sig_l') {
    const heavy = {
      ...item,
      title: 'Schiera la prima Bombarda di Bronzo',
      text: 'La Bombarda di Bronzo fornisce 18 DEM. Il bonus dell’Altoforno vale anche per questa macchina.',
      action: { kind: 'play' as const, cardId: 'u3_sig_h' },
    };
    return [
      heavy,
      {
        ...heavy,
        title: 'Schiera la seconda Bombarda di Bronzo',
        text: 'La seconda Bombarda porta la DEM complessiva a 42, contando Berserker e bonus dell’Altoforno. Occorre sempre un combattente superstite.',
      },
    ];
  }
  if (item.era === 3 && item.action.kind === 'instants')
    return [
      {
        ...item,
        title: 'Risolvi l’assedio decisivo',
        text: 'Conferma senza Istantanee. Le due macchine e il Berserker infliggono 42 DEM contro 14 Mura: i 28 danni diretti distruggono il Centro Città da 22 HP.',
        action: { kind: 'instants', cardIds: [] },
      },
    ];
  return [item];
});
annihilationCues.push(
  finish(
    'Il Centro Città avversario è a zero o meno: vittoria immediata per distruzione, senza attendere il conteggio finale e senza Razzia successiva.',
    3,
    'finished',
  ),
);

const hotseatCues: readonly TutorialCue[] = [
  {
    ...keep(),
    viewer: 'P1',
    text: 'Sei P1. Mantieni la mano: apparirà subito la schermata privacy per il secondo giocatore.',
  },
  {
    ...cue(
      'Passa il dispositivo a P2',
      'La schermata copre il tavolo e la nuova mano. Soltanto P2 deve premere Tocca per svelare la tua mano.',
      { kind: 'handover' },
      'mulligan',
    ),
    viewer: 'P2',
  },
  { ...keep(), viewer: 'P2', title: 'Conferma la mano di P2' },
  {
    ...cue(
      'Torna a P1 in sicurezza',
      'Le scelte iniziali sono bloccate. Passa il dispositivo a P1 e conferma la rivelazione.',
      { kind: 'handover' },
    ),
    viewer: 'P1',
  },
  {
    ...play(
      'e1_farm',
      'Gioca con la mano di P1',
      'Costruisci la Fattoria: il turno passa a P2 e la privacy torna a coprire il tavolo.',
    ),
    viewer: 'P1',
  },
  {
    ...cue(
      'Consegna il turno a P2',
      'Conferma il passaggio prima di leggere la mano del nuovo giocatore.',
      { kind: 'handover' },
    ),
    viewer: 'P2',
  },
  {
    ...finish(
      'La vista ora appartiene a P2. Le carte e le risorse nascoste di P1 restano segrete. Ogni cambio di giocatore richiede lo stesso passaggio.',
    ),
    viewer: 'P2',
  },
];

const firstBattle = TUTORIAL_CUES.findIndex((item) => item.action.kind === 'instants');
const playbackCues = TUTORIAL_CUES.slice(0, firstBattle + 1)
  .filter((item) => ['mulligan', 'play', 'pass', 'instants'].includes(item.action.kind))
  .map((item) =>
    item.action.kind === 'instants'
      ? {
          ...item,
          text: 'Blocca le Istantanee indicate. La riproduzione parte in pausa: apri il Registro, premi Riprendi, poi Pausa, scegli 2× e premi ancora Riprendi. Queste quattro azioni sono necessarie per completare la prova.',
        }
      : item,
  );
playbackCues.push(
  finish(
    'Hai controllato la riproduzione senza impartire ordini di attacco: il motore risolve automaticamente i bersagli e i danni.',
    2,
  ),
);

export const MATCH_EXERCISE_CUES: Readonly<Record<MatchExerciseId, readonly TutorialCue[]>> = {
  civilizations: [
    keep(),
    play(
      'e1_farm',
      'Investi uno slot',
      'Costruisci la Fattoria: spenderai 2 Legno e uno dei quattro slot. Organizzazione resta disponibile perché non hai giocato una Unità.',
    ),
    play(
      'u1_spr_l',
      'Usa Organizzazione',
      'Gioca il Picchiere di Leva: il costo stampato è 1 Cibo e 1 Legno, ma paghi solo 1 Legno. Il beneficio si consuma anche sulle Unità con costo Cibo zero.',
    ),
    play(
      'u1_arc_l',
      'Copri il tuo fronte',
      'Gioca il Cacciatore al costo stampato. Il Lanciere contrasta la cavalleria; l’Arciere minaccia i Lancieri nemici. Le categorie contano più della sola forza.',
    ),
    play(
      'u1_inf_h',
      'Completa l’esercito',
      'Gioca il Fante con Scudo: con un produttore e tre unità hai occupato tutti e quattro gli slot. Non costruire ogni edificio che peschi.',
    ),
    finish(
      'I Regni adattano l’esercito; i Norreni cercano brecce per ottenere bottino; i Bizantini investono e ottengono +2 Mura a ogni apertura. Mercato e Cisterna sono pubblici, consumano slot e non producono. Inizia una partita libera con Equilibrio Tattico.',
    ),
  ],
  main: TUTORIAL_CUES,
  discard: DISCARD_TUTORIAL_CUES,
  economy: ECONOMY_CUES,
  budget: BUDGET_CUES,
  annihilation: annihilationCues,
  draw: drawCues,
  concession: [
    keep(),
    cue(
      'Dichiara la resa',
      'Apri il Menu partita dal tavolo e premi Resa nel pannello di partita. Questo assegna la vittoria all’avversario; Esci dal tutorial invece chiude soltanto l’esercitazione.',
      { kind: 'concede' },
    ),
    finish('Il riepilogo indica una resa, non una distruzione del Centro Città.', 1, 'finished'),
  ],
  timeout: [
    cue(
      'Scadenza del Mulligan',
      'Demo locale con tempi compressi: nessuna connessione online. La prima scadenza mantiene automaticamente tutta la mano. Non devi premere un comando tattico.',
      { kind: 'timeout' },
      'mulligan',
    ),
    cue(
      'Scadenza dello Sviluppo',
      'La seconda scadenza dichiara automaticamente Passo. Una scelta manuale valida interromperebbe la serie di timeout consecutivi.',
      { kind: 'timeout' },
    ),
    cue(
      'Terza scadenza consecutiva',
      'La terza scadenza applica la politica ordinaria: abbandono per timeout e vittoria dell’avversario. Nelle partite online il tempo è deciso dal server.',
      { kind: 'timeout' },
      'prebattle',
    ),
    finish(
      'Il riepilogo distingue il timeout dalla resa volontaria. Nella demo le tre scadenze sono state accelerate, senza modificare la regola dei tre timeout.',
      1,
      'finished',
    ),
  ],
  hotseat: hotseatCues,
  playback: playbackCues,
};

const peaceful: Bot = {
  name: 'Avversario delle esercitazioni',
  choose(view) {
    if (view.self.legal.canSubmitMulligan) return { type: 'SubmitMulligan', cardUids: [] };
    if (view.self.legal.canSubmitDiscard)
      return {
        type: 'SubmitDiscard',
        cardUids: view.self.hand.slice(0, view.self.legal.mustDiscardCount).map((card) => card.uid),
      };
    if (view.self.legal.canLockInstants) return { type: 'LockInstants', cardUids: [] };
    return { type: 'Pass' };
  },
};

export function createExerciseDecks(id: MatchExerciseId) {
  const decks = createTutorialDecks();
  if (id === 'economy')
    decks.P1[1] = completeTutorialDeck(1, [
      'e1_farm',
      'e1_farm',
      'e1_farm',
      'e1_lumb',
      'e1_lumb',
      'i1_wall',
      'i1_wall',
      'i1_wall',
    ]);
  if (id === 'budget')
    decks.P1[1] = completeTutorialDeck(1, [
      'u1_cav_h',
      'i1_wall',
      'i1_wall',
      'i1_wall',
      'e1_farm',
      'e1_lumb',
      'u1_inf_l',
      'u1_spr_l',
    ]);
  if (id === 'annihilation')
    decks.P1[3] = completeTutorialDeck(3, ['e3_frn', 'e3_gld', 'u3_inf_l', 'u3_sig_h', 'u3_sig_h']);
  return decks;
}

export function createExerciseController(
  id: MatchExerciseId,
  store: GameStoreApi,
): LocalGameController {
  if (id === 'civilizations') {
    const p1 = getPreset('balanced-tactical-v2', '2.0');
    const p2 = getPreset('boom-economy-v2', '2.0');
    const opening = ['e1_farm', 'u1_spr_l', 'u1_arc_l', 'u1_inf_h'];
    const remaining = [...p1.subdecks['1']];
    for (const id of opening) remaining.splice(remaining.indexOf(id), 1);
    return new LocalGameController({
      mode: 'bot',
      seed: 'epochs-tutorial-v2',
      decks: { P1: p1, P2: p2 },
      fixedDecks: {
        P1: { 1: [...opening, ...remaining], 2: p1.subdecks['2'], 3: p1.subdecks['3'] },
        P2: { 1: p2.subdecks['1'], 2: p2.subdecks['2'], 3: p2.subdecks['3'] },
      },
      fixedInitiative: 'P1',
      bot: peaceful,
      store,
    });
  }
  if (['main', 'discard', 'playback'].includes(id)) return createTutorialController(store);
  const decks = createExerciseDecks(id);
  if (id === 'annihilation') {
    // Mantiene il medesimo avversario e le prime due Ere della partita principale.
    return new LocalGameController({
      mode: 'bot',
      seed: 'epochs-tutorial-v1',
      fixedDecks: decks,
      fixedInitiative: 'P1',
      bot: tutorialOpponent,
      store,
    });
  }
  return new LocalGameController({
    mode: id === 'hotseat' ? 'hotseat' : 'bot',
    seed: `epochs-exercise-${id}`,
    fixedDecks: decks,
    fixedInitiative: 'P1',
    bot: peaceful,
    store,
  });
}
