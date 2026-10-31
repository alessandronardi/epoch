export type ContentVersion = '1.0' | '2.0';
export type CivilizationId = 'feudal' | 'norse' | 'byzantine';
export type Affiliation = 'common' | CivilizationId;
export type CivilizationBonus =
  | { kind: 'organization'; foodDiscount: 1 }
  | { kind: 'war_loot'; food: 2; wood: 2 }
  | { kind: 'imperial_engineering'; walls: 2 };

export const CIVILIZATIONS = {
  feudal: {
    name: 'Regni feudali',
    bonus: { kind: 'organization', foodDiscount: 1 },
    description: 'La prima Unità di ogni Era costa 1 Cibo in meno (minimo 0).',
    weakness: 'Richiede un esercito misto ben composto.',
    difficulty: 'Accessibile',
  },
  norse: {
    name: 'Norreni',
    bonus: { kind: 'war_loot', food: 2, wood: 2 },
    description: 'Le razzie trasferiscono fino a 2 Cibo e 2 Legno.',
    weakness: 'Un attacco senza breccia lascia poco sviluppo.',
    difficulty: 'Intermedia',
  },
  byzantine: {
    name: 'Bizantini',
    bonus: { kind: 'imperial_engineering', walls: 2 },
    description: '+2 Mura a ogni apertura di Era, inclusa la prima.',
    weakness: 'Costi in Metallo e slot investiti nello sviluppo.',
    difficulty: 'Avanzata',
  },
} as const satisfies Record<
  CivilizationId,
  {
    name: string;
    bonus: CivilizationBonus;
    description: string;
    weakness: string;
    difficulty: string;
  }
>;
