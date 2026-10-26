'use client';

import { memo, type ReactNode } from 'react';

type EasyReviewQueuePanelProps = Readonly<{
  id: string;
  panel: 'who' | 'collections' | 'document';
  visible: boolean;
  isolated: boolean;
  className?: string;
  children: ReactNode;
}>;

const containmentCss = `
@supports (content-visibility: auto) {
  [data-easy-review-panel='who'][data-easy-review-isolated='true'] article,
  [data-easy-review-panel='document'][data-easy-review-isolated='true'] [data-easy-review-card='document'] {
    content-visibility: auto;
    contain-intrinsic-size: auto 36rem;
    overflow-anchor: none;
  }
}
`;

/**
 * Frontera sólo de presentación para una cola ya montada.
 *
 * El atributo `data-easy-review-isolated` permite que CSS aplique contención
 * únicamente después de abandonar «Todos». La cola activa sigue presente y
 * visible; el navegador puede omitir sólo tarjetas que queden fuera del viewport.
 */
const EasyReviewQueuePanel = memo(function EasyReviewQueuePanel({ id, panel, visible, isolated, className, children }: EasyReviewQueuePanelProps) {
  return <>
    <style>{containmentCss}</style>
    <div
      id={id}
      hidden={!visible}
      data-easy-review-panel={panel}
      data-easy-review-isolated={isolated ? 'true' : 'false'}
      className={className}
    >
      {children}
    </div>
  </>;
});

export default EasyReviewQueuePanel;
