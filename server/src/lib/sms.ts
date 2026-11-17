import { config, isTest } from '../config.js';

/** Für Tests: zuletzt „gesendete“ SMS-Codes. */
export const sentSms: { phoneNumber: string; code: string }[] = [];

export const smsEnabled = () => config.SMS_PROVIDER !== 'none';

/**
 * SMS-Versand. Ein echter Anbieter (z. B. seven.io, sipgate, Twilio) wird hier angebunden.
 * 'console' schreibt den Code nur ins Protokoll (Entwicklung).
 */
export async function sendSmsCode(phoneNumber: string, code: string): Promise<void> {
  if (config.SMS_PROVIDER === 'none') throw new Error('sms_disabled');
  sentSms.push({ phoneNumber, code });
  if (!isTest) console.info(`[SMS an ${phoneNumber}] Ihr ${config.APP_NAME}-Code: ${code}`);
}
