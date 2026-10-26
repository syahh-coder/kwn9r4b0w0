import styles from "./hero-atmosphere.module.css";

/** Purely decorative; no timers, canvas loop, or client-side JavaScript. */
export function HeroAtmosphere() {
  return <div className={styles.atmosphere} aria-hidden="true">
    <div className={styles.stars} />
    <span className={`${styles.comet} ${styles.first}`} />
    <span className={`${styles.comet} ${styles.second}`} />
    <span className={`${styles.comet} ${styles.third}`} />
    <div className={styles.horizon} />
  </div>;
}
