/*
  Iris, the PolyCost mascot: line art v1. GENERATED from the brand spec SVGs
  (also published verbatim in apps/web/public/brand/iris/). Do not hand-edit a
  pose; regenerate it, and keep the equal-beams rule (see iris.spec.tsx).

  Colours are CSS custom properties only (defined in styles/tokens.css), so
  this file holds no hex values and the theme guard stays green. No `style`
  attributes anywhere: the build-generated CSP stays strict.
*/
export type IrisPose = 'welcome' | 'analysing' | 'verdict' | 'warning' | 'celebrating';

type IrisAttrs = Record<string, string>;
export type IrisNode = [tag: string, attrs: IrisAttrs, children?: IrisNode[]];

export const IRIS_POSES = ['welcome', 'analysing', 'verdict', 'warning', 'celebrating'] as const;

export const IRIS_WELCOME: IrisNode[] = [
  [
    'path',
    { d: 'M6,166 L92,158', stroke: 'var(--iris-accent)', strokeWidth: '5', strokeLinecap: 'round' },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,135.2',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L236,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,180.8',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M66,118 Q30,100 34,58 Q56,70 76,104 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M174,112 Q200,142 182,178 Q166,168 162,146 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M72,48 L98,70 Q120,63 142,70 L168,48 Q184,92 178,134 L154,190 Q120,199 86,190 L62,134 Q56,92 72,48 Z',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M98,70 L120,84 L142,70',
      fill: 'none',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2',
      strokeOpacity: '.45',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M90,158 L120,133 L150,158 L120,184 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,149',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,167',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '100',
      cy: '100',
      r: '17',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '100', cy: '100', r: '7', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '102.5', cy: '97', r: '2', fill: 'var(--iris-body)' }],
  [
    'circle',
    {
      cx: '140',
      cy: '100',
      r: '17',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '140', cy: '100', r: '7', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '142.5', cy: '97', r: '2', fill: 'var(--iris-body)' }],
  [
    'path',
    {
      d: 'M114,115 L126,115 L120,125 Z',
      fill: 'var(--iris-accent)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '2',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M104,192 l-3,9 M110,193 l0,9 M130,193 l0,9 M136,192 l3,9',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
];

export const IRIS_ANALYSING: IrisNode[] = [
  [
    'path',
    { d: 'M6,166 L92,158', stroke: 'var(--iris-accent)', strokeWidth: '5', strokeLinecap: 'round' },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,135.2',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L236,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,180.8',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M66,112 Q40,142 58,178 Q74,168 78,146 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M174,112 Q200,142 182,178 Q166,168 162,146 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M72,48 L98,70 Q120,63 142,70 L168,48 Q184,92 178,134 L154,190 Q120,199 86,190 L62,134 Q56,92 72,48 Z',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M98,70 L120,84 L142,70',
      fill: 'none',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2',
      strokeOpacity: '.45',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M90,158 L120,133 L150,158 L120,184 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,149',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,167',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '100',
      cy: '100',
      r: '17',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '105', cy: '106', r: '7', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '107.5', cy: '103', r: '2', fill: 'var(--iris-body)' }],
  [
    'circle',
    {
      cx: '140',
      cy: '100',
      r: '17',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '145', cy: '106', r: '7', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '147.5', cy: '103', r: '2', fill: 'var(--iris-body)' }],
  [
    'path',
    {
      d: 'M114,115 L126,115 L120,125 Z',
      fill: 'var(--iris-accent)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '2',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M104,192 l-3,9 M110,193 l0,9 M130,193 l0,9 M136,192 l3,9',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'g',
    { transform: 'translate(176,188) rotate(-8)' },
    [
      [
        'rect',
        {
          x: '0',
          y: '0',
          width: '50',
          height: '38',
          rx: '6',
          fill: 'var(--iris-body)',
          stroke: 'var(--iris-ink)',
          strokeWidth: '3',
        },
      ],
      [
        'path',
        {
          d: 'M12,30 v-8 M25,30 v-14 M38,30 v-20',
          stroke: 'var(--iris-ink)',
          strokeWidth: '5',
          strokeLinecap: 'round',
        },
      ],
    ],
  ],
];

export const IRIS_VERDICT: IrisNode[] = [
  [
    'path',
    { d: 'M6,166 L92,158', stroke: 'var(--iris-accent)', strokeWidth: '5', strokeLinecap: 'round' },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,135.2',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L236,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,180.8',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M66,112 Q40,142 58,178 Q74,168 78,146 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M174,118 Q210,100 206,58 Q184,70 164,104 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M72,48 L98,70 Q120,63 142,70 L168,48 Q184,92 178,134 L154,190 Q120,199 86,190 L62,134 Q56,92 72,48 Z',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M98,70 L120,84 L142,70',
      fill: 'none',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2',
      strokeOpacity: '.45',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M90,158 L120,133 L150,158 L120,184 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,149',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,167',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '100',
      cy: '100',
      r: '17',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '104', cy: '96', r: '7', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '106.5', cy: '93', r: '2', fill: 'var(--iris-body)' }],
  [
    'circle',
    {
      cx: '140',
      cy: '100',
      r: '17',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '144', cy: '96', r: '7', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '146.5', cy: '93', r: '2', fill: 'var(--iris-body)' }],
  [
    'path',
    {
      d: 'M114,115 L126,115 L120,125 Z',
      fill: 'var(--iris-accent)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '2',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M104,192 l-3,9 M110,193 l0,9 M130,193 l0,9 M136,192 l3,9',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '204',
      cy: '56',
      r: '20',
      fill: 'var(--iris-accent)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3',
    },
  ],
  [
    'path',
    {
      d: 'M194,56 l7,7 l13,-14',
      fill: 'none',
      stroke: 'var(--iris-body)',
      strokeWidth: '4.5',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
  ],
];

export const IRIS_WARNING: IrisNode[] = [
  [
    'path',
    {
      d: 'M6,166 L92,158',
      stroke: 'var(--iris-accent)',
      strokeWidth: '5',
      strokeLinecap: 'round',
      strokeDasharray: '2 9',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,135.2',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '5',
      strokeLinecap: 'round',
      strokeDasharray: '2 9',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L236,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '5',
      strokeLinecap: 'round',
      strokeDasharray: '2 9',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,180.8',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '5',
      strokeLinecap: 'round',
      strokeDasharray: '2 9',
    },
  ],
  [
    'path',
    {
      d: 'M66,112 Q40,142 58,178 Q74,168 78,146 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M174,112 Q200,142 182,178 Q166,168 162,146 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M72,48 L98,70 Q120,63 142,70 L168,48 Q184,92 178,134 L154,190 Q120,199 86,190 L62,134 Q56,92 72,48 Z',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M98,70 L120,84 L142,70',
      fill: 'none',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2',
      strokeOpacity: '.45',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M90,158 L120,133 L150,158 L120,184 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,149',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,167',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '100',
      cy: '100',
      r: '19',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '100', cy: '100', r: '5', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '102.5', cy: '97', r: '2', fill: 'var(--iris-body)' }],
  [
    'path',
    {
      d: 'M88,74 Q100,68 112,74',
      fill: 'none',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'circle',
    {
      cx: '140',
      cy: '100',
      r: '19',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
    },
  ],
  ['circle', { cx: '140', cy: '100', r: '5', fill: 'var(--iris-ink)' }],
  ['circle', { cx: '142.5', cy: '97', r: '2', fill: 'var(--iris-body)' }],
  [
    'path',
    {
      d: 'M128,74 Q140,68 152,74',
      fill: 'none',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M114,115 L126,115 L120,125 Z',
      fill: 'var(--iris-accent)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '2',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M104,192 l-3,9 M110,193 l0,9 M130,193 l0,9 M136,192 l3,9',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M204,32 L228,74 L180,74 Z',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    { d: 'M204,46 v14', stroke: 'var(--iris-ink)', strokeWidth: '4.5', strokeLinecap: 'round' },
  ],
  ['circle', { cx: '204', cy: '67', r: '2.6', fill: 'var(--iris-ink)' }],
];

export const IRIS_CELEBRATING: IrisNode[] = [
  [
    'path',
    { d: 'M6,166 L92,158', stroke: 'var(--iris-accent)', strokeWidth: '5', strokeLinecap: 'round' },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,135.2',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L236,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M148,158 L233,180.8',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M66,118 Q30,100 34,58 Q56,70 76,104 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M174,118 Q210,100 206,58 Q184,70 164,104 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M72,48 L98,70 Q120,63 142,70 L168,48 Q184,92 178,134 L154,190 Q120,199 86,190 L62,134 Q56,92 72,48 Z',
      fill: 'var(--iris-body)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M98,70 L120,84 L142,70',
      fill: 'none',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2',
      strokeOpacity: '.45',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M90,158 L120,133 L150,158 L120,184 Z',
      fill: 'var(--iris-tint)',
      stroke: 'var(--iris-accent)',
      strokeWidth: '2.5',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,149',
      stroke: 'var(--iris-beam-aws)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,158',
      stroke: 'var(--iris-beam-azure)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M94,158 L146,167',
      stroke: 'var(--iris-beam-gcp)',
      strokeWidth: '2.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M89,104 Q100,90 111,104',
      fill: 'none',
      stroke: 'var(--iris-ink)',
      strokeWidth: '4',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M129,104 Q140,90 151,104',
      fill: 'none',
      stroke: 'var(--iris-ink)',
      strokeWidth: '4',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M114,115 L126,115 L120,125 Z',
      fill: 'var(--iris-accent)',
      stroke: 'var(--iris-ink)',
      strokeWidth: '2',
      strokeLinejoin: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M104,192 l-3,9 M110,193 l0,9 M130,193 l0,9 M136,192 l3,9',
      stroke: 'var(--iris-ink)',
      strokeWidth: '3.5',
      strokeLinecap: 'round',
    },
  ],
  [
    'path',
    {
      d: 'M30,30 Q30,40 40,40 Q30,40 30,50 Q30,40 20,40 Q30,40 30,30 Z',
      fill: 'var(--iris-spark-1)',
    },
  ],
  [
    'path',
    {
      d: 'M212,22 Q212,34 224,34 Q212,34 212,46 Q212,34 200,34 Q212,34 212,22 Z',
      fill: 'var(--iris-spark-2)',
    },
  ],
  [
    'path',
    {
      d: 'M222,89 Q222,96 229,96 Q222,96 222,103 Q222,96 215,96 Q222,96 222,89 Z',
      fill: 'var(--iris-spark-3)',
    },
  ],
  [
    'path',
    {
      d: 'M20,90 Q20,96 26,96 Q20,96 20,102 Q20,96 14,96 Q20,96 20,90 Z',
      fill: 'var(--iris-spark-3)',
    },
  ],
];

export const IRIS_ART: Record<IrisPose, IrisNode[]> = {
  welcome: IRIS_WELCOME,
  analysing: IRIS_ANALYSING,
  verdict: IRIS_VERDICT,
  warning: IRIS_WARNING,
  celebrating: IRIS_CELEBRATING,
};
