import { PREMIUM } from '@happywalkers/shared';
import { config } from '../config.js';
import { ApiError } from './http.js';

/**
 * Premium-Abrechnung hinter einer Anbieter-Schnittstelle (`BILLING_PROVIDER`).
 *
 * Grundsätze: Monatsabo zum klar angezeigten Preis, KEIN Probeabo, Kündigung mit einem Klick
 * (`cancelAtPeriodEnd`), Premium bleibt bis zum Ende der bezahlten Laufzeit aktiv.
 *
 * - `dev`: schaltet ohne Zahlung sofort frei und verlängert sich monatlich, solange nicht gekündigt
 *   (nur für Entwicklung/Tests).
 * - `none`: keine Abrechnung möglich → 503 `billing_unavailable`.
 * - Später: echter Anbieter (z. B. Stripe, Mollie) – `start` erzeugt dort eine Zahlung/ein Mandat,
 *   Verlängerungen kommen per Webhook; `renew` liefert dann einfach den gespeicherten Stand.
 */
export interface SubscriptionState {
  status: string;
  provider: string;
  providerRef: string | null;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface BillingProvider {
  readonly name: string;
  /** Startet ein Monatsabo. */
  start(userId: string): Promise<{ providerRef: string | null; priceCents: number; currentPeriodEnd: Date }>;
  /** Kündigung zum Laufzeitende beim Anbieter vormerken. */
  cancel(sub: SubscriptionState): Promise<void>;
  /** Kündigung zurücknehmen. */
  resume(sub: SubscriptionState): Promise<void>;
  /** Neues Laufzeitende, falls die Laufzeit abgelaufen ist und verlängert wird; sonst null. */
  renew(sub: SubscriptionState, now: Date): Promise<Date | null>;
}

/** Datum + n Monate (Monatsende wird abgeschnitten, z. B. 31.01. → 28./29.02.). */
export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const last = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, last));
  return r;
}

const devProvider: BillingProvider = {
  name: 'dev',
  async start() {
    return { providerRef: `dev_${crypto.randomUUID()}`, priceCents: PREMIUM.priceCents, currentPeriodEnd: addMonths(new Date(), 1) };
  },
  async cancel() {},
  async resume() {},
  async renew(sub, now) {
    if (sub.cancelAtPeriodEnd || sub.currentPeriodEnd > now) return null;
    let end = sub.currentPeriodEnd;
    for (let i = 0; i < 1200 && end <= now; i++) end = addMonths(end, 1);
    return end;
  },
};

const noneProvider: BillingProvider = {
  name: 'none',
  async start() {
    throw new ApiError(503, 'billing_unavailable');
  },
  async cancel() {},
  async resume() {},
  async renew() {
    return null;
  },
};

export function billingProvider(name: string = config.BILLING_PROVIDER): BillingProvider {
  return name === 'dev' ? devProvider : noneProvider;
}
