import { type ReactNode } from 'react';
import classes from './AnimatedBackground.module.css';

export function AnimatedBackground({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={classes['container']}>
      <div className={classes['noise']} />
      <div className={classes['content']}>{children}</div>
    </div>
  );
}
