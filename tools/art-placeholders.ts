import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CardsArtFileSchema,
  CardsRulesFileSchema,
  type CardRules,
  type EraNo,
} from '../data/schema/cards.schema.js';

interface EraPalette {
  readonly primary: string;
  readonly bgDeep: string;
  readonly bgMid: string;
  readonly accent: string;
  readonly highlight: string;
}

const ERA_PALETTES: Readonly<Record<EraNo, EraPalette>> = Object.freeze({
  1: {
    primary: '#A86F3C',
    bgDeep: '#1E1610',
    bgMid: '#36261B',
    accent: '#86A94C',
    highlight: '#D8A36C',
  },
  2: {
    primary: '#9FB1C2',
    bgDeep: '#141E27',
    bgMid: '#243546',
    accent: '#A8404D',
    highlight: '#DCE7F2',
  },
  3: {
    primary: '#D9B04A',
    bgDeep: '#18151C',
    bgMid: '#33261E',
    accent: '#C85A32',
    highlight: '#F5DA82',
  },
});

function renderCentralEmblem(card: CardRules, palette: EraPalette): string {
  const isHeavy = card.id.endsWith('_h');
  const isMedium = card.id.endsWith('_m');
  const strokeWidth = isHeavy ? 18 : isMedium ? 14 : 10;

  if (card.type === 'economy' || card.type === 'structure') {
    const resColor =
      card.production && card.production.food > 0
        ? '#86A94C'
        : card.production && card.production.wood > 0
          ? '#8A5A34'
          : '#6F7F91';
    return `
      <g transform="translate(768, 576)">
        <circle r="260" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="${strokeWidth}" opacity="0.9"/>
        <circle r="210" fill="none" stroke="${resColor}" stroke-width="12" stroke-dasharray="28 16"/>
        <polygon points="0,-180 156,-90 156,90 0,180 -156,90 -156,-90" fill="${resColor}" fill-opacity="0.28" stroke="${palette.highlight}" stroke-width="8"/>
        <path d="M-110,90 L-110,-30 L0,-115 L110,-30 L110,90 Z" fill="${palette.primary}" fill-opacity="0.75" stroke="${palette.highlight}" stroke-width="6"/>
        <rect x="-35" y="10" width="70" height="80" fill="${palette.bgDeep}" stroke="${palette.highlight}" stroke-width="4"/>
      </g>
    `;
  }

  if (card.type === 'conversion') {
    const isGuild = card.effect?.kind === 'gain_per_building';
    return `
      <g transform="translate(768, 576)">
        <circle r="270" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="16"/>
        <polygon points="0,-220 65,-65 220,0 65,65 0,220 -65,65 -220,0 -65,-65" fill="${palette.accent}" fill-opacity="0.45" stroke="${palette.highlight}" stroke-width="8"/>
        ${
          isGuild
            ? `<path d="M-140,-40 L140,-40 M0,-150 L0,130 M-140,-40 L-180,50 L-100,50 Z M140,-40 L100,50 L180,50 Z" fill="${palette.primary}" stroke="${palette.highlight}" stroke-width="10" stroke-linecap="round"/>`
            : `<path d="M-110,-120 L110,-120 L80,140 L-80,140 Z" fill="${palette.accent}" stroke="${palette.highlight}" stroke-width="10"/><circle cx="0" cy="-20" r="55" fill="${palette.highlight}" opacity="0.85"/>`
        }
      </g>
    `;
  }

  if (card.type === 'instant') {
    const isAtk = card.effect?.kind === 'atk_mod';
    return `
      <g transform="translate(768, 576)">
        <polygon points="0,-260 225,-130 225,130 0,260 -225,130 -225,-130" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="14"/>
        ${
          isAtk
            ? `<path d="M-150,140 L130,-140 M60,-140 L130,-140 L130,-70 M-90,170 L170,-90 M-170,90 L90,-170" stroke="${palette.highlight}" stroke-width="16" stroke-linecap="round" fill="none"/>`
            : `<path d="M-170,130 L-170,-80 L-100,-80 L-100,-20 L-35,-20 L-35,-80 L35,-80 L35,-20 L100,-20 L100,-80 L170,-80 L170,130 Z" fill="${palette.primary}" fill-opacity="0.65" stroke="${palette.highlight}" stroke-width="10"/>`
        }
      </g>
    `;
  }

  switch (card.category) {
    case 'infantry':
      return `
        <g transform="translate(768, 576)">
          <path d="M0,-240 L190,-150 C190,40 120,170 0,250 C-120,170 -190,40 -190,-150 Z" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="${strokeWidth}"/>
          <path d="M0,-195 L145,-120 C145,25 90,130 0,195 C-90,130 -145,25 -145,-120 Z" fill="${palette.accent}" fill-opacity="0.4" stroke="${palette.highlight}" stroke-width="6"/>
          <path d="M0,-230 L0,210 M-75,-70 L75,-70" stroke="${palette.highlight}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
        </g>
      `;
    case 'spearman':
      return `
        <g transform="translate(768, 576)">
          <circle r="240" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="${strokeWidth}"/>
          <path d="M-160,180 L140,-180 M-90,195 L185,-135 M-195,125 L85,-205" stroke="${palette.highlight}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
          <polygon points="140,-180 175,-225 110,-195" fill="${palette.primary}" stroke="${palette.highlight}" stroke-width="4"/>
          <polygon points="185,-135 220,-180 155,-150" fill="${palette.primary}" stroke="${palette.highlight}" stroke-width="4"/>
        </g>
      `;
    case 'cavalry':
      return `
        <g transform="translate(768, 576)">
          <polygon points="0,-250 240,0 0,250 -240,0" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="${strokeWidth}"/>
          <path d="M-150,90 L0,-130 L150,90 M-100,150 L0,0 L100,150" fill="none" stroke="${palette.highlight}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="0" cy="-145" r="24" fill="${palette.accent}" stroke="${palette.highlight}" stroke-width="5"/>
        </g>
      `;
    case 'archer':
      return `
        <g transform="translate(768, 576)">
          <circle r="245" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="${strokeWidth}"/>
          <path d="M-80,-200 C130,-130 130,130 -80,200" fill="none" stroke="${palette.primary}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
          <line x1="-80" y1="-200" x2="-80" y2="200" stroke="${palette.highlight}" stroke-width="6"/>
          <line x1="-160" y1="0" x2="175" y2="0" stroke="${palette.highlight}" stroke-width="12" stroke-linecap="round"/>
          <polygon points="195,0 145,-28 145,28" fill="${palette.accent}" stroke="${palette.highlight}" stroke-width="4"/>
        </g>
      `;
    case 'siege':
    default:
      return `
        <g transform="translate(768, 576)">
          <rect x="-230" y="-200" width="460" height="400" rx="28" fill="${palette.bgDeep}" stroke="${palette.primary}" stroke-width="${strokeWidth}"/>
          <path d="M-160,120 L160,120 L110,-90 L-110,-90 Z" fill="${palette.accent}" fill-opacity="0.45" stroke="${palette.highlight}" stroke-width="10"/>
          <circle cx="-105" cy="135" r="48" fill="${palette.bgMid}" stroke="${palette.highlight}" stroke-width="10"/>
          <circle cx="105" cy="135" r="48" fill="${palette.bgMid}" stroke="${palette.highlight}" stroke-width="10"/>
          <line x1="-140" y1="-20" x2="185" y2="-135" stroke="${palette.primary}" stroke-width="20" stroke-linecap="round"/>
        </g>
      `;
  }
}

export function generatePlaceholderSvg(card: CardRules): string {
  const palette = ERA_PALETTES[card.era];
  const emblem = renderCentralEmblem(card, palette);

  const eraRings = Array.from({ length: card.era }, (_, idx) => {
    const radius = 330 + idx * 34;
    return `<circle cx="768" cy="576" r="${radius}" fill="none" stroke="${palette.primary}" stroke-width="3" stroke-opacity="${(0.45 - idx * 0.1).toFixed(2)}"/>`;
  }).join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1536 1152" width="1536" height="1152">
  <defs>
    <radialGradient id="bg-${card.id}" cx="50%" cy="45%" r="70%">
      <stop offset="0%" stop-color="${palette.bgMid}" />
      <stop offset="100%" stop-color="${palette.bgDeep}" />
    </radialGradient>
    <linearGradient id="accent-${card.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.primary}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0.15" />
    </linearGradient>
  </defs>
  <rect width="1536" height="1152" fill="url(#bg-${card.id})" />
  <rect x="96" y="72" width="1344" height="1008" rx="24" fill="url(#accent-${card.id})" stroke="${palette.primary}" stroke-width="4" stroke-opacity="0.5" />
  <g>
    ${eraRings}
    ${emblem}
  </g>
</svg>
`;
}

function main(): void {
  const rootDir = process.cwd();
  const rulesPath = path.join(rootDir, 'data', 'cards.rules.json');
  const artPath = path.join(rootDir, 'data', 'cards.art.json');
  const outDir = path.join(rootDir, 'apps', 'web', 'public', 'cards', 'placeholders');

  const rulesMap = CardsRulesFileSchema.parse(JSON.parse(fs.readFileSync(rulesPath, 'utf8')));
  const artMap = CardsArtFileSchema.parse(JSON.parse(fs.readFileSync(artPath, 'utf8')));
  const expansionRules = CardsRulesFileSchema.parse(
    JSON.parse(fs.readFileSync(path.join(rootDir, 'data/v2/cards.rules.json'), 'utf8')),
  );
  const expansionArt = CardsArtFileSchema.parse(
    JSON.parse(fs.readFileSync(path.join(rootDir, 'data/v2/cards.art.json'), 'utf8')),
  );
  for (const [id, card] of Object.entries(expansionRules))
    if (!rulesMap[id]) {
      rulesMap[id] = card;
      artMap[id] = expansionArt[id]!;
    }

  fs.mkdirSync(outDir, { recursive: true });

  let generatedCount = 0;
  for (const id of Object.keys(rulesMap).sort()) {
    const card = rulesMap[id]!;
    const art = artMap[id];
    const masterPath = path.join(rootDir, 'data', 'art', 'src', `${id}.png`);
    if (art?.status === 'final' && fs.existsSync(masterPath)) {
      continue;
    }

    const svgContent = generatePlaceholderSvg(card);
    const svgPath = path.join(outDir, `${id}.svg`);
    fs.writeFileSync(svgPath, svgContent, 'utf8');
    generatedCount += 1;
  }

  console.log(`Generated ${generatedCount} SVG placeholders in ${outDir}.`);
}

const isDirectRun =
  process.argv[1] !== undefined && path.basename(process.argv[1]) === 'art-placeholders.ts';

if (isDirectRun) {
  main();
}
