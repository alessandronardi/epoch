import type { Bot } from '@epochs/bots';
import { CARDS_RULES } from '@epochs/content';
import { autoDiscard, type ClientCommand, type EraNo, type PlayerView } from '@epochs/engine';
import { LocalGameController } from '../controllers/local-controller.js';
import type { ProjectionNotification } from '../controllers/types.js';
import type { GameStoreApi } from '../state/game-store.js';

export const TUTORIAL_SEED = 'epochs-tutorial-v1';

// Completa ciascun ordine didattico fino a un sotto-mazzo legale di 20 carte.
// Anche le carte non pescate rispettano Era e limite di tre copie.
function completeDeck(era: EraNo, opening: readonly string[]): string[] {
  const cards = [...opening];
  for (const card of Object.values(CARDS_RULES).filter((card) => card.era === era)) {
    while (cards.length < 20 && cards.filter((id) => id === card.id).length < 3) {
      cards.push(card.id);
    }
  }
  return cards;
}

export function createTutorialDecks() {
  return {
    P1: {
      1: completeDeck(1, [
        'u1_inf_l',
        'u1_spr_l',
        'u1_arc_l',
        'u1_cav_h',
        'i1_wall',
        'e1_farm',
        'e1_lumb',
        'i1_arr',
        'e1_mine',
      ]),
      2: completeDeck(2, ['e2_fnd', 'u2_cav_h', 'u2_inf_h', 'u2_arc_l', 'u2_sig_l']),
      3: completeDeck(3, ['e3_frn', 'e3_gld', 'u3_inf_l', 'u3_sig_l', 'i3_fir']),
    },
    P2: {
      1: completeDeck(1, [
        'e1_farm',
        'u1_spr_l',
        'u1_inf_h',
        'u1_cav_l',
        'i1_wall',
        'i1_arr',
        'e1_lumb',
        'e1_mine',
      ]),
      2: completeDeck(2, ['u2_inf_h', 'u2_arc_l', 'e2_fnd', 'i2_sab', 'i2_mor']),
      3: completeDeck(3, ['u3_inf_h', 'u3_arc_l', 'u3_sig_l', 'e3_gld', 'e3_frn']),
    },
  };
}

const opponentPlays: Record<EraNo, readonly string[]> = {
  1: ['e1_farm', 'u1_spr_l', 'u1_inf_h', 'u1_cav_l'],
  2: ['u2_inf_h', 'u2_arc_l'],
  3: [],
};

/** L'avversario didattico legge esclusivamente la propria PlayerView. */
const tutorialOpponent: Bot = {
  name: 'Avversario del tutorial',
  choose(view) {
    const legal = view.self.legal;
    if (legal.canSubmitMulligan) return { type: 'SubmitMulligan', cardUids: [] };
    if (legal.canSubmitDiscard) {
      return {
        type: 'SubmitDiscard',
        cardUids: autoDiscard(view.self.hand, CARDS_RULES, legal.mustDiscardCount),
      };
    }
    if (legal.canLockInstants) return { type: 'LockInstants', cardUids: [] };
    const cardId = opponentPlays[view.era][view.cycle - 1];
    const card = view.self.hand.find((item) => item.cardId === cardId);
    if (card !== undefined && legal.playableFieldCardUids.includes(card.uid)) {
      return { type: 'PlayCard', cardUid: card.uid };
    }
    return { type: 'Pass' };
  },
};

export function createTutorialController(
  store: GameStoreApi,
  onProjectionEmitted?: (notification: ProjectionNotification) => void,
): LocalGameController {
  return new LocalGameController({
    mode: 'bot',
    seed: TUTORIAL_SEED,
    fixedDecks: createTutorialDecks(),
    fixedInitiative: 'P1',
    bot: tutorialOpponent,
    store,
    onProjectionEmitted,
  });
}

export const TUTORIAL_LESSONS = [
  'Mulligan e risorse',
  'Edifici e rendite',
  'Unità e Cap Logistico',
  'Passo e Istantanee',
  'Il triangolo tattico',
  'Riconversioni e assedio',
] as const;

export type TutorialTarget = 'hand' | 'resources' | 'city' | 'slots' | 'battle' | 'walls';
type TutorialAction =
  | { readonly kind: 'mulligan'; readonly cardId: string }
  | { readonly kind: 'play'; readonly cardId: string }
  | { readonly kind: 'conversion'; readonly cardId: string; readonly sacrificeId: string }
  | { readonly kind: 'instants'; readonly cardIds: readonly string[] }
  | { readonly kind: 'pass' }
  | { readonly kind: 'read' };

export interface TutorialCue {
  readonly lesson: number;
  readonly title: string;
  readonly text: string;
  readonly target: TutorialTarget;
  readonly label: string;
  readonly action: TutorialAction;
  readonly era: EraNo;
  readonly phase: PlayerView['phase'];
}

export const TUTORIAL_CUES: readonly TutorialCue[] = [
  {
    lesson: 1,
    title: 'Scegli la tua mano iniziale',
    target: 'hand',
    era: 1,
    phase: 'mulligan',
    text: 'Inizi con 8 carte. Il Mulligan permette di cambiarne una parte una sola volta, in segreto. In questa esercitazione sostituisci la Milizia Cittadina: pescherai la Cava Grezza, utile per produrre Metallo.',
    label: 'Sostituisci la Milizia',
    action: { kind: 'mulligan', cardId: 'u1_inf_l' },
  },
  {
    lesson: 1,
    title: 'Il tuo magazzino',
    target: 'resources',
    era: 1,
    phase: 'development',
    text: 'Dotazione iniziale e Raccolto ti danno 4 Cibo, 4 Legno e 0 Metallo. In Era I puoi conservare al massimo 7 di ogni risorsa; le eccedenze vanno perdute. Il cap sale a 11 in Era II e a 16 in Era III.',
    label: 'Passa agli edifici',
    action: { kind: 'read' },
  },
  {
    lesson: 2,
    title: 'Costruisci la Cava Grezza',
    target: 'city',
    era: 1,
    phase: 'development',
    text: 'La Cava costa 2 Cibo e 2 Legno e produce 1 Metallo. Ogni opportunità consente una sola carta. Dopo la risposta avversaria inizierà il Ciclo 2: riceverai +1 Cibo, +1 Legno e la produzione della Cava.',
    label: 'Costruisci la Cava',
    action: { kind: 'play', cardId: 'e1_mine' },
  },
  {
    lesson: 2,
    title: 'La prima rendita è arrivata',
    target: 'resources',
    era: 1,
    phase: 'development',
    text: 'Ora hai 3 Cibo, 3 Legno e 1 Metallo. Una seconda rendita arriverà all’apertura del Ciclo 3, poi basta per questa Era. Gli edifici restano nelle Ere successive e producono anche al Raccolto d’apertura.',
    label: 'Passa allo schieramento',
    action: { kind: 'read' },
  },
  {
    lesson: 3,
    title: 'Proteggi il Fronte',
    target: 'city',
    era: 1,
    phase: 'development',
    text: 'Schiera il Picchiere di Leva. Le unità restano coperte all’avversario durante lo Sviluppo. Il Picchiere protegge dalla Cavalleria con Impalamento. Dopo questa opportunità arriverà la rendita del Ciclo 3.',
    label: 'Schiera il Picchiere',
    action: { kind: 'play', cardId: 'u1_spr_l' },
  },
  {
    lesson: 3,
    title: 'Prepara il Tiro',
    target: 'city',
    era: 1,
    phase: 'development',
    text: 'Il magazzino è ora a 3 Cibo, 3 Legno e 2 Metallo. Schiera il Cacciatore: gli Arcieri tirano prima degli altri e hanno un bonus contro i Lancieri.',
    label: 'Schiera il Cacciatore',
    action: { kind: 'play', cardId: 'u1_arc_l' },
  },
  {
    lesson: 3,
    title: 'Raggiungi il Cap Logistico',
    target: 'slots',
    era: 1,
    phase: 'development',
    text: 'Il Cavaliere Feudale usa il Metallo della Cava. Con lui avrai occupato tutti i 4 slot di Era I: un edificio e tre unità. Il limite sarà 5 in Era II e 6 in Era III; Istantanee e Riconversioni non occupano slot.',
    label: 'Schiera il Cavaliere',
    action: { kind: 'play', cardId: 'u1_cav_h' },
  },
  {
    lesson: 4,
    title: 'Passa e rivela gli eserciti',
    target: 'slots',
    era: 1,
    phase: 'development',
    text: 'Hai usato 4 slot su 4. Il Passo è definitivo per questa Era. Quando entrambi passano, le unità e le risorse vengono rivelate; gli edifici avversari restano coperti.',
    label: 'Dichiara Passo',
    action: { kind: 'pass' },
  },
  {
    lesson: 4,
    title: 'La scelta segreta delle Istantanee',
    target: 'hand',
    era: 1,
    phase: 'prebattle',
    text: 'Ora puoi osservare le linee avversarie. Nella Pre-Battaglia scegli zero o più Istantanee, pagando il costo complessivo. Useremo Palizzata Extra: 2 Legno per +3 Mura, senza slot. Le scelte si rivelano insieme.',
    label: 'Prepara Palizzata Extra',
    action: { kind: 'read' },
  },
  {
    lesson: 5,
    title: 'Osserva il triangolo tattico',
    target: 'battle',
    era: 1,
    phase: 'prebattle',
    text: 'Il Cacciatore tira contro i Lancieri; il tuo Picchiere impala la Cavalleria prima del suo attacco. La tua Cavalleria colpisce, poi i superstiti combattono in Mischia. Conferma Palizzata Extra e segui le fasi nel registro.',
    label: 'Conferma l’Istantanea e combatti',
    action: { kind: 'instants', cardIds: ['i1_wall'] },
  },
  {
    lesson: 5,
    title: 'Dalla battaglia all’Era II',
    target: 'battle',
    era: 2,
    phase: 'development',
    text: 'Hai vinto il campo: i superstiti hanno inflitto 1 DEM alle Mura, senza Breccia. Le unità vengono scartate, la Cava resta e il Cap Logistico riparte da zero. In Era II mostreremo l’Accerchiamento contro gli Arcieri.',
    label: 'Prepara la seconda Era',
    action: { kind: 'read' },
  },
  {
    lesson: 5,
    title: 'Sostieni il nuovo esercito',
    target: 'city',
    era: 2,
    phase: 'development',
    text: 'Puoi giocare carte conservate da un’Era precedente. Costruisci la Fattoria: il suo Cibo nelle rendite finanzierà la Cavalleria.',
    label: 'Costruisci la Fattoria',
    action: { kind: 'play', cardId: 'e1_farm' },
  },
  {
    lesson: 5,
    title: 'Aggiungi produzione di Legno',
    target: 'city',
    era: 2,
    phase: 'development',
    text: 'Costruisci la Segheria prima del Ciclo 3, così riceverai anche la sua produzione nell’ultima rendita di questa Era.',
    label: 'Costruisci la Segheria',
    action: { kind: 'play', cardId: 'e1_lumb' },
  },
  {
    lesson: 5,
    title: 'La Cavalleria al Centro',
    target: 'city',
    era: 2,
    phase: 'development',
    text: 'Schiera il Cavaliere Corazzato. Senza Lancieri nemici vivi, attaccherà dalla Retroguardia; se ci sono Arcieri nemici, otterrà anche il bonus di Accerchiamento stampato sulla carta.',
    label: 'Schiera il Cavaliere Corazzato',
    action: { kind: 'play', cardId: 'u2_cav_h' },
  },
  {
    lesson: 5,
    title: 'Combina Tiro e Cavalleria',
    target: 'city',
    era: 2,
    phase: 'development',
    text: 'L’Arciere Composto indebolirà il Fronte con il Tiro prima dell’attacco della Cavalleria. Le fasi successive si interrompono appena rimane un solo esercito con combattenti vivi.',
    label: 'Schiera l’Arciere Composto',
    action: { kind: 'play', cardId: 'u2_arc_l' },
  },
  {
    lesson: 5,
    title: 'Leggi la formazione nemica',
    target: 'battle',
    era: 2,
    phase: 'development',
    text: 'Dichiara Passo per scoprire la formazione. Potrai verificare che il nemico ha Fanteria e Arcieri, ma nessun Lanciere a proteggere la Retroguardia.',
    label: 'Rivela la formazione',
    action: { kind: 'pass' },
  },
  {
    lesson: 5,
    title: 'Accerchiamento in azione',
    target: 'battle',
    era: 2,
    phase: 'prebattle',
    text: 'Il Cavaliere Corazzato infliggerà 6 ATK + 2 di bonus contro gli Arcieri, iniziando dalla Retroguardia. Questa volta conferma senza Istantanee: anche scegliere zero carte è valido.',
    label: 'Combatti senza Istantanee',
    action: { kind: 'instants', cardIds: [] },
  },
  {
    lesson: 6,
    title: 'Riconverti un edificio',
    target: 'city',
    era: 3,
    phase: 'development',
    text: 'In Era III puoi sacrificare un edificio per una Riconversione. Altoforno Reale costa 2 Cibo: sacrifica la Cava, ottieni +2 Legno, +3 Metallo e +1 DEM per tutte le tue unità di questa Era. Non usa slot, ma occupa l’opportunità.',
    label: 'Riconverti la Cava nell’Altoforno',
    action: { kind: 'conversion', cardId: 'e3_frn', sacrificeId: 'e1_mine' },
  },
  {
    lesson: 6,
    title: 'La Gilda conta anche il sacrificio',
    target: 'city',
    era: 3,
    phase: 'development',
    text: 'Restano due edifici. La Gilda dei Mercanti costa 1 Legno e conta gli edifici prima del sacrificio: otterrai 2 di ogni risorsa sacrificando la Fattoria. Si applica sempre il cap di 16.',
    label: 'Riconverti la Fattoria nella Gilda',
    action: { kind: 'conversion', cardId: 'e3_gld', sacrificeId: 'e1_farm' },
  },
  {
    lesson: 6,
    title: 'Serve un combattente superstite',
    target: 'city',
    era: 3,
    phase: 'development',
    text: 'Schiera il Berserker d’Élite. L’assedio richiede una vittoria campale con almeno un combattente vivo: le macchine d’assedio da sole non possono conquistare il campo.',
    label: 'Schiera il Berserker',
    action: { kind: 'play', cardId: 'u3_inf_l' },
  },
  {
    lesson: 6,
    title: 'La DEM colpisce le strutture',
    target: 'city',
    era: 3,
    phase: 'development',
    text: 'La Torre d’Assedio non attacca le truppe. Somma 11 DEM ai 3 del Berserker, più 1 per ciascuna unità grazie all’Altoforno: totale 16 DEM se entrambi sopravvivono.',
    label: 'Schiera la Torre d’Assedio',
    action: { kind: 'play', cardId: 'u3_sig_l' },
  },
  {
    lesson: 6,
    title: 'Apri l’ultima Pre-Battaglia',
    target: 'walls',
    era: 3,
    phase: 'development',
    text: 'Il nostro avversario didattico ha lasciato il campo indifeso in questa Era. Passa: il Berserker garantirà la vittoria campale e la Torre potrà partecipare all’assedio.',
    label: 'Dichiara l’ultimo Passo',
    action: { kind: 'pass' },
  },
  {
    lesson: 6,
    title: 'Breccia e Razzia',
    target: 'walls',
    era: 3,
    phase: 'prebattle',
    text: 'Fuoco Greco costa 2 Legno e 3 Metallo e toglie 6 Mura al nemico. Con DEM positiva almeno pari alle Mura si apre una Breccia; la DEM in eccesso danneggia il Centro Città. Se resta in piedi, razzi fino a 1 Cibo e 1 Legno, nei limiti del magazzino.',
    label: 'Usa Fuoco Greco e risolvi l’assedio',
    action: { kind: 'instants', cardIds: ['i3_fir'] },
  },
  {
    lesson: 6,
    title: 'Tutorial completato',
    target: 'walls',
    era: 3,
    phase: 'finished',
    text: 'Hai attraversato tutte le tre Ere: economia, schieramento coperto, Istantanee, combattimento e assedio. Il registro mostra Breccia, danno al Centro Città e Razzia. Ora puoi provare una partita libera contro un Bot.',
    label: 'Torna alla Home',
    action: { kind: 'read' },
  },
];

/** Risolve gli UID dalla vista corrente e impedisce di saltare una precondizione. */
export function resolveTutorialCommand(cue: TutorialCue, view: PlayerView): ClientCommand | null {
  if (view.era !== cue.era || view.phase !== cue.phase) {
    throw new Error('La partita non è nella fase prevista. Riavvia il tutorial.');
  }
  const action = cue.action;
  const legal = view.self.legal;
  const handUid = (id: string): string => {
    const card = view.self.hand.find((item) => item.cardId === id);
    if (!card) throw new Error('La carta guidata non è disponibile. Riavvia il tutorial.');
    return card.uid;
  };
  const requireLegal = (condition: boolean): void => {
    if (!condition) throw new Error('L’azione guidata non è disponibile. Riavvia il tutorial.');
  };
  switch (action.kind) {
    case 'read':
      return null;
    case 'mulligan':
      requireLegal(legal.canSubmitMulligan);
      return { type: 'SubmitMulligan', cardUids: [handUid(action.cardId)] };
    case 'play': {
      const uid = handUid(action.cardId);
      requireLegal(legal.canAct && legal.playableFieldCardUids.includes(uid));
      return { type: 'PlayCard', cardUid: uid };
    }
    case 'conversion': {
      const uid = handUid(action.cardId);
      const building = view.self.buildings.find((item) => item.cardId === action.sacrificeId);
      requireLegal(legal.canAct && legal.playableConversionUids.includes(uid));
      if (!building || !legal.sacrificableBuildingUids.includes(building.uid)) {
        throw new Error('L’edificio da riconvertire non è disponibile. Riavvia il tutorial.');
      }
      return { type: 'PlayConversion', cardUid: uid, sacrificeUid: building.uid };
    }
    case 'pass':
      requireLegal(legal.canPass);
      return { type: 'Pass' };
    case 'instants': {
      const uids = action.cardIds.map(handUid);
      requireLegal(
        legal.canLockInstants && uids.every((uid) => legal.playableInstantUids.includes(uid)),
      );
      return { type: 'LockInstants', cardUids: uids };
    }
  }
}
