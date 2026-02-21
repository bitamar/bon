import { type ReactNode, useEffect, useRef } from 'react';
import classes from './AnimatedBackground.module.css';

const COLORS = [
  ['#7c3aed', '#4c1d95'],
  ['#8b5cf6', '#6d28d9'],
  ['#a78bfa', '#7c3aed'],
  ['#c4b5fd', '#8b5cf6'],
  ['#6d28d9', '#3b0764'],
  ['#a855f7', '#7e22ce'],
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function spawnBlob(container: HTMLElement) {
  const blob = document.createElement('div');
  const [c1, c2] = COLORS[Math.floor(Math.random() * COLORS.length)];
  const size = randomBetween(120, 800);
  const x = randomBetween(-10, 90);
  const y = randomBetween(-10, 90);
  const lifetime = randomBetween(18000, 35000);
  const driftX = randomBetween(-120, 120);
  const driftY = randomBetween(-120, 120);
  const scaleEnd = randomBetween(0.8, 2.2);

  const peakOpacity = randomBetween(0.3, 0.5);

  blob.className = classes['blob']!;
  Object.assign(blob.style, {
    width: `${size}px`,
    height: `${size}px`,
    left: `${x}%`,
    top: `${y}%`,
    background: `radial-gradient(circle, ${c1} 0%, ${c2} 60%, transparent 100%)`,
    opacity: '0',
    transform: 'scale(0.05)',
  });

  container.appendChild(blob);

  // Animate: start tiny and bright, grow large and faint
  const anim = blob.animate(
    [
      { opacity: 0, transform: 'scale(0.05)', offset: 0 },
      { opacity: peakOpacity, transform: 'scale(0.3)', offset: 0.2 },
      {
        opacity: peakOpacity * 0.4,
        transform: `translate(${driftX}px, ${driftY}px) scale(${scaleEnd})`,
        offset: 0.8,
      },
      {
        opacity: 0,
        transform: `translate(${driftX * 1.1}px, ${driftY * 1.1}px) scale(${scaleEnd * 1.05})`,
        offset: 1,
      },
    ],
    { duration: lifetime, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' },
  );

  anim.onfinish = () => blob.remove();
}

export function AnimatedBackground({ children }: Readonly<{ children: ReactNode }>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let timeout: ReturnType<typeof setTimeout>;

    function scheduleNext() {
      const delay = randomBetween(5000, 12000);
      timeout = setTimeout(() => {
        if (container) spawnBlob(container);
        scheduleNext();
      }, delay);
    }

    scheduleNext();

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className={classes['container']}>
      <div ref={containerRef} className={classes['blobsContainer']} />
      <div className={classes['noise']} />
      <div className={classes['content']}>{children}</div>
    </div>
  );
}
