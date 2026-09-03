'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export function RevealText({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const block = ref.current;
    if (!block) return;
    block.classList.remove('is-shown', 'is-hiding');
    void block.offsetHeight;
    block.classList.add('is-shown');
  }, []);

  return (
    <div ref={ref} className={`t-stagger ${className}`.trim()}>
      {children}
    </div>
  );
}
