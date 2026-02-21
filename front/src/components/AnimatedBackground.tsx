import type { ReactNode } from 'react';
import classes from './AnimatedBackground.module.css';

export function AnimatedBackground({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={classes['container']}>
      <div className={classes['blobsContainer']}>
        <div className={`${classes['blob']} ${classes['blob1']}`} />
        <div className={`${classes['blob']} ${classes['blob2']}`} />
        <div className={`${classes['blob']} ${classes['blob3']}`} />
        <div className={`${classes['blob']} ${classes['blob4']}`} />
      </div>
      <div className={classes['noise']} />
      <div className={classes['content']}>{children}</div>
    </div>
  );
}
