/**
 * Regelmäßige Aufgaben (im selben Prozess, Railway hält ihn am Laufen):
 *  - wiederkehrende Termine für die nächsten Wochen anlegen
 * Weitere Aufgaben werden in `jobs` eingetragen.
 */
type Job = { name: string; everyMs: number; run: () => Promise<void> };

export const jobs: Job[] = [];

export function registerJob(job: Job) {
  jobs.push(job);
}

export function startJobs() {
  for (const job of jobs) {
    const tick = () => job.run().catch((err) => console.error(`Job ${job.name} fehlgeschlagen`, err));
    setTimeout(tick, 5_000);
    setInterval(tick, job.everyMs).unref();
  }
}
