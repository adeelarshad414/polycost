import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Iris } from './Iris';
import { IRIS_POSES, type IrisPose } from './iris-art';

// Iris brand rules, encoded (docs: handover/DESIGN-SYSTEM.md, "Illustration: Iris").

const BEAM_TOKENS = ['--iris-beam-aws', '--iris-beam-azure', '--iris-beam-gcp'];
const EXIT_ORIGIN = 'M148,158';
const REFRACTION_ORIGIN = 'M94,158';

function svgFor(pose: IrisPose) {
  const { container } = render(<Iris pose={pose} />);
  const svg = container.querySelector('svg');
  if (!svg) throw new Error(`no svg for ${pose}`);
  return { container, svg };
}

function usesToken(element: Element, prefix: string) {
  return ['fill', 'stroke'].some((name) => element.getAttribute(name)?.includes(prefix));
}

/** Length of a single straight segment "Mx,y Lx,y". */
function segmentLength(d: string) {
  const match = d.match(/^M([\d.]+),([\d.]+) L([\d.]+),([\d.]+)$/);
  if (!match) throw new Error(`not a straight segment: ${d}`);
  const [x1, y1, x2, y2] = match.slice(1).map(Number);
  return Math.hypot(x2 - x1, y2 - y1);
}

describe.each(IRIS_POSES)('Iris pose %s', (pose) => {
  it('renders as decorative inline SVG with no inline styles', () => {
    const { container, svg } = svgFor(pose);

    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.getAttribute('viewBox')).toBe('0 0 240 240');
    expect(svg.getAttribute('data-iris-pose')).toBe(pose);
    // CSP: the build-generated policy forbids inline styles.
    expect(container.querySelectorAll('[style], style')).toHaveLength(0);
    // Decorative: nothing inside can take focus or carry a name.
    expect(container.querySelectorAll('a, button, [tabindex], title, desc')).toHaveLength(0);
  });

  it('splits one beam into three equal exit beams (Iris never picks a provider)', () => {
    const { svg } = svgFor(pose);
    const exits = [...svg.querySelectorAll('path')].filter((p) =>
      p.getAttribute('d')?.startsWith(`${EXIT_ORIGIN} `),
    );

    expect(exits).toHaveLength(3);
    expect(exits.map((p) => p.getAttribute('stroke'))).toEqual(
      BEAM_TOKENS.map((token) => `var(${token})`),
    );
    for (const attribute of ['stroke-width', 'stroke-linecap', 'stroke-dasharray', 'opacity']) {
      expect(new Set(exits.map((p) => p.getAttribute(attribute))).size).toBe(1);
    }
    for (const exit of exits) {
      expect(exit.getAttribute('stroke-opacity')).toBeNull();
    }
    const lengths = exits.map((p) => segmentLength(p.getAttribute('d') ?? ''));
    for (const length of lengths) {
      expect(length).toBeCloseTo(88, 1);
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThan(0.01);
  });

  it('uses provider colours on the beams and refraction lines only', () => {
    const { svg } = svgFor(pose);
    for (const element of svg.querySelectorAll('*')) {
      if (usesToken(element, '--iris-beam-')) {
        const d = element.getAttribute('d') ?? '';
        expect(
          element.tagName === 'path' &&
            (d.startsWith(`${EXIT_ORIGIN} `) || d.startsWith(`${REFRACTION_ORIGIN} `)),
        ).toBe(true);
      }
      // Provider and status tokens never reach the art directly.
      expect(usesToken(element, '--provider-') || usesToken(element, '--danger')).toBe(false);
    }
  });

  it('only celebrates with sparks', () => {
    const { svg } = svgFor(pose);
    const sparks = [...svg.querySelectorAll('*')].filter((e) => usesToken(e, '--iris-spark-'));
    expect(sparks.length > 0).toBe(pose === 'celebrating');
  });

  it('matches the published brand SVG exactly (apart from hex fallbacks)', () => {
    const published = readFileSync(
      path.join(__dirname, '../../../public/brand/iris', `iris-${pose}.svg`),
      'utf8',
    ).replace(/var\((--iris-[a-z0-9-]+),\s*#[0-9A-Fa-f]+\)/g, 'var($1)');
    const reference = new DOMParser().parseFromString(published, 'image/svg+xml').documentElement;
    const { svg } = svgFor(pose);

    const shape = (root: Element) =>
      [...root.querySelectorAll('*')].map((e) => [
        e.tagName,
        [...e.attributes].map((a) => `${a.name}=${a.value}`).sort(),
      ]);
    expect(shape(svg)).toEqual(shape(reference));
  });

  it('has no axe violations', async () => {
    const { container } = svgFor(pose);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe('Iris props', () => {
  it('defaults to 120px, never renders below 48px and follows the theme for the tile', () => {
    const { container, rerender } = render(<Iris pose="welcome" />);
    const svg = () => container.querySelector('svg');

    expect(svg()?.getAttribute('width')).toBe('120');
    expect(container.firstElementChild?.className).toBe('iris iris--tile-auto');

    rerender(<Iris pose="welcome" size={20} tile className="hero-iris" />);
    expect(svg()?.getAttribute('width')).toBe('48');
    expect(svg()?.getAttribute('height')).toBe('48');
    expect(container.firstElementChild?.className).toBe('iris iris--tile-on hero-iris');

    rerender(<Iris pose="welcome" tile={false} />);
    expect(container.firstElementChild?.className).toBe('iris iris--tile-off');
  });
});
