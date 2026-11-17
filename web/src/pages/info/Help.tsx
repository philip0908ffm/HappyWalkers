import { PREMIUM } from '@happywalkers/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { Icon, type IconName } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { formatPrice } from '../../lib/format';
import { BlockBody, RichText, useInfoList, type InfoBlock } from './InfoParts';

/** Weiterführende Links je Frage (Ziel, Text-Schlüssel, Symbol). */
const LINKS: Record<string, { to: string; label: string; icon: IconName }[]> = {
  eintragen: [{ to: '/walk-eintragen', label: 'links.logWalk', icon: 'plus' }],
  einladen: [{ to: '/gruppen', label: 'links.groups', icon: 'group' }],
  premium: [{ to: '/premium', label: 'links.premium', icon: 'star' }],
  schrift: [{ to: '/profil/einstellungen', label: 'links.settings', icon: 'settings' }],
  melden: [{ to: '/wer-sieht-was', label: 'links.whoSeesWhat', icon: 'eye' }],
  loeschen: [{ to: '/profil/einstellungen#s-data', label: 'links.settings', icon: 'settings' }],
};

/** Hilfe in einfacher Sprache: aufklappbare Fragen (<details>, per Tastatur bedienbar). */
export default function Help() {
  const { t } = useTranslation('info');
  const { hash } = useLocation();
  const items = useInfoList<InfoBlock>('help.items', { price: formatPrice(PREMIUM.priceCents, PREMIUM.currency) });
  // Direktlink auf eine Frage (z. B. /hilfe#premium) öffnet sie gleich.
  const openId = decodeURIComponent(hash.replace(/^#/, ''));

  return (
    <div className="info-page">
      <PageHeader title={t('help.title')} lead={t('help.lead')} />

      {items.map((item) => (
        <details key={item.id} id={item.id} className="faq" open={item.id === openId || undefined}>
          <summary>{item.q}</summary>
          <div className="faq__answer">
            <BlockBody block={item}>
              {LINKS[item.id] ? (
                <p>
                  {LINKS[item.id].map((l) => (
                    <Link key={l.to + l.label} to={l.to}>
                      <Icon name={l.icon} className="inline-icon" /> {t(l.label)}
                    </Link>
                  ))}
                </p>
              ) : null}
            </BlockBody>
          </div>
        </details>
      ))}

      <section className="card" aria-labelledby="help-contact">
        <h2 id="help-contact">{t('help.contactTitle')}</h2>
        <p>
          <RichText text={t('help.contactText')} />
        </p>
        <p>
          <Link to="/wer-sieht-was">{t('links.whoSeesWhat')}</Link> · <Link to="/datenschutz">{t('links.privacy')}</Link> ·{' '}
          <Link to="/impressum">{t('links.imprint')}</Link>
        </p>
      </section>
    </div>
  );
}
