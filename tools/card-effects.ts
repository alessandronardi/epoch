import type {
  Ability,
  CardEffect,
  Resources,
} from '../data/schema/cards.schema.js';

export interface CardEffectMapping {
  readonly production?: Resources;
  readonly abilities: readonly Ability[];
  readonly effect?: CardEffect;
}

export const CARD_EFFECTS_MAP: Readonly<Record<string, CardEffectMapping>> =
  Object.freeze({
    // === ERA I ===
    e1_farm: {
      production: { food: 1, wood: 0, metal: 0 },
      abilities: [],
    },
    e1_lumb: {
      production: { food: 0, wood: 1, metal: 0 },
      abilities: [],
    },
    e1_mine: {
      production: { food: 0, wood: 0, metal: 1 },
      abilities: [],
    },
    u1_inf_l: {
      abilities: [],
    },
    u1_inf_h: {
      abilities: [],
    },
    u1_spr_l: {
      abilities: [{ kind: 'impale', damage: 3 }],
    },
    u1_spr_h: {
      abilities: [{ kind: 'impale', damage: 3 }],
    },
    u1_arc_l: {
      abilities: [{ kind: 'volley', bonusVsSpearman: 1 }],
    },
    u1_arc_h: {
      abilities: [{ kind: 'volley', bonusVsSpearman: 1 }],
    },
    u1_cav_l: {
      abilities: [{ kind: 'flank', bonusVsArcher: 1 }],
    },
    u1_cav_h: {
      abilities: [{ kind: 'flank', bonusVsArcher: 1 }],
    },
    u1_sig_l: {
      abilities: [],
    },
    u1_sig_h: {
      abilities: [],
    },
    i1_arr: {
      abilities: [],
      effect: { kind: 'atk_mod', target: 'own_archers', amount: 2 },
    },
    i1_wall: {
      abilities: [],
      effect: { kind: 'walls_mod', target: 'own', amount: 3 },
    },

    // === ERA II ===
    e2_mill: {
      production: { food: 2, wood: 0, metal: 0 },
      abilities: [],
    },
    e2_saw: {
      production: { food: 0, wood: 2, metal: 0 },
      abilities: [],
    },
    e2_fnd: {
      production: { food: 0, wood: 0, metal: 2 },
      abilities: [],
    },
    u2_inf_l: {
      abilities: [],
    },
    u2_inf_h: {
      abilities: [],
    },
    u2_spr_l: {
      abilities: [{ kind: 'impale', damage: 5 }],
    },
    u2_spr_h: {
      abilities: [{ kind: 'impale', damage: 5 }],
    },
    u2_arc_l: {
      abilities: [{ kind: 'volley', bonusVsSpearman: 2 }],
    },
    u2_arc_h: {
      abilities: [{ kind: 'volley', bonusVsSpearman: 2 }],
    },
    u2_cav_l: {
      abilities: [{ kind: 'flank', bonusVsArcher: 2 }],
    },
    u2_cav_h: {
      abilities: [{ kind: 'flank', bonusVsArcher: 2 }],
    },
    u2_sig_l: {
      abilities: [],
    },
    u2_sig_h: {
      abilities: [],
    },
    i2_sab: {
      abilities: [],
      effect: { kind: 'walls_mod', target: 'enemy', amount: -4 },
    },
    i2_mor: {
      abilities: [],
      effect: { kind: 'atk_mod', target: 'own_front', amount: 2 },
    },

    // === ERA III ===
    e3_gld: {
      abilities: [],
      effect: {
        kind: 'gain_per_building',
        perBuilding: { food: 1, wood: 1, metal: 1 },
      },
    },
    e3_frn: {
      abilities: [],
      effect: {
        kind: 'gain_and_dem_bonus',
        gain: { food: 0, wood: 2, metal: 3 },
        demBonus: 1,
      },
    },
    u3_inf_l: {
      abilities: [],
    },
    u3_inf_h: {
      abilities: [],
    },
    u3_spr_l: {
      abilities: [{ kind: 'impale', damage: 7 }],
    },
    u3_spr_h: {
      abilities: [{ kind: 'impale', damage: 7 }],
    },
    u3_arc_l: {
      abilities: [{ kind: 'volley', bonusVsSpearman: 3 }],
    },
    u3_arc_h: {
      abilities: [{ kind: 'volley', bonusVsSpearman: 3 }],
    },
    u3_cav_l: {
      abilities: [{ kind: 'flank', bonusVsArcher: 3 }],
    },
    u3_cav_h: {
      abilities: [{ kind: 'flank', bonusVsArcher: 3 }],
    },
    u3_sig_l: {
      abilities: [],
    },
    u3_sig_m: {
      abilities: [],
    },
    u3_sig_h: {
      abilities: [],
    },
    i3_fir: {
      abilities: [],
      effect: { kind: 'walls_mod', target: 'enemy', amount: -6 },
    },
    i3_ral: {
      abilities: [],
      effect: { kind: 'atk_mod', target: 'own_front', amount: 2 },
    },
  });

export function getCardEffectMapping(cardId: string): CardEffectMapping {
  const entry = CARD_EFFECTS_MAP[cardId];
  if (!entry) {
    throw new Error(
      `Card ID "${cardId}" is not registered in CARD_EFFECTS_MAP (tools/card-effects.ts).`,
    );
  }
  return entry;
}
