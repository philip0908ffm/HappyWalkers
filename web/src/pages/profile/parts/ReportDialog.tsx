import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api/client';
import { Field } from '../../../components/Field';
import { useAction } from '../../../hooks/useAction';
import { ConfirmDialogE } from './ConfirmDialogE';

const REASONS = ['harassment', 'spam', 'inappropriate', 'fake', 'other'] as const;

/** „Melden“: Grund wählen, freiwillig beschreiben, deutlich bestätigen. Die gemeldete Person erfährt nicht, wer gemeldet hat. */
export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  name,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'user' | 'post' | 'comment' | 'group' | 'photo' | 'walk';
  targetId: string;
  name: string;
}) {
  const { t } = useTranslation('people');
  const [reason, setReason] = useState<(typeof REASONS)[number] | ''>('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const report = useAction({
    fn: () =>
      api.post('/reports', {
        targetType,
        targetId,
        reason: `${t(`report.reason_${reason}`)}${text.trim() ? `: ${text.trim()}` : ''}`,
      }),
    success: t('report.done'),
    onSuccess: () => {
      setReason('');
      setText('');
      onClose();
    },
  });
  return (
    <ConfirmDialogE
      open={open}
      title={t('report.title', { name })}
      confirmLabel={t('report.confirm')}
      pending={report.isPending}
      onClose={onClose}
      onConfirm={() => {
        if (!reason) return setError(t('report.reasonRequired'));
        setError(null);
        report.mutate(undefined);
      }}
    >
      <p>{t('report.intro')}</p>
      <fieldset className="field">
        <legend>{t('report.reason')}</legend>
        <div className="choice-list">
          {REASONS.map((r) => (
            <label key={r} className="choice">
              <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} />
              {t(`report.reason_${r}`)}
            </label>
          ))}
        </div>
        {error ? (
          <p className="field__error" role="alert">
            {error}
          </p>
        ) : null}
      </fieldset>
      <Field label={t('report.details')} optional>
        <textarea className="textarea" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
    </ConfirmDialogE>
  );
}
