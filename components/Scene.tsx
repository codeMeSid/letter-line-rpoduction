'use client';

import { useEffect, useRef } from 'react';
import { hl } from '@/lib/hl';

/** Task 1 placeholder: one rounded prism on the dark ground. Replaced by the real scene later. */
export default function Scene() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const HL = hl();
    HL.inject(document);

    const C = HL.Cam(45, 0.5, 1);
    const P = HL.proj(C);
    const [ring, inner] = HL.rings(-30, -30, 30, 30, 8, 2);
    const el = HL.solid(svg);
    HL.put(el, HL.prism(P, HL.facing(C), ring, inner, 0, 60));

    // Frame the prism: centre it and give the world a viewBox around the origin.
    const [cx, cy] = P(0, 0, 30);
    svg.setAttribute('viewBox', `${cx - 200} ${cy - 160} 400 320`);

    return () => {
      el.g.remove();
    };
  }, []);

  return (
    <div data-hairline data-hairline-theme="dark" data-color="accent">
      <svg ref={svgRef} viewBox="0 0 400 320" preserveAspectRatio="xMidYMid meet" />
    </div>
  );
}
