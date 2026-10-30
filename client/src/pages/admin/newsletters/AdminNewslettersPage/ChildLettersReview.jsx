import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

import api from '../../../../config/api';

const STATUS_CLASS = {
  draft: 'is-draft',
  submitted: 'is-submitted',
  approved: 'is-approved',
  rejected: 'is-rejected',
};

/**
 * Admin send screen for per-child letters. Teachers sign their own letters off,
 * so there is no approve step here — admins preview and send what is ready.
 */
export default function ChildLettersReview({ issueId }) {
  const { t } = useTranslation(['newsletters']);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');

  const load = useCallback(async () => {
    if (!issueId) return;
    try {
      setLoading(true);
      const res = await api.get('/newsletters/child-letters', { params: { issueId } });
      setLetters(res.data.data.letters || []);
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [issueId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const ready = letters.filter((row) => row.status === 'approved' && !row.sentAt).length;
    return { ready, total: letters.length, pending: letters.length - ready };
  }, [letters]);

  const send = async () => {
    try {
      setSending(true);
      const res = await api.post(`/newsletters/admin/issues/${issueId}/child-letters/send`);
      const stats = res.data.data.stats;
      toast.success(t('newsletters:childLetters.admin.sent', {
        sent: stats.sentCount,
        skipped: stats.skippedCount,
        failed: stats.failureCount,
      }));
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.admin.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const preview = async (letter) => {
    try {
      const res = await api.get(`/newsletters/child-letters/${letter._id}/preview`);
      setPreviewHtml(res.data.data.htmlContent);
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.previewFailed'));
    }
  };

  const downloadPdf = async (letter) => {
    try {
      const res = await api.get(`/newsletters/child-letters/${letter._id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `weekly-letter-${(letter.studentName || 'student').replace(/\s+/g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.response?.data?.message || t('newsletters:childLetters.toasts.pdfFailed'));
    }
  };

  return (
    <div className="clr">
      <h4>{t('newsletters:childLetters.admin.title')}</h4>

      {loading ? (
        <div className="an-muted">{t('newsletters:admin.common.loading')}</div>
      ) : letters.length === 0 ? (
        <div className="an-muted">{t('newsletters:childLetters.admin.empty')}</div>
      ) : (
        <>
          <div className="an-subtext">
            {t('newsletters:childLetters.admin.statusLine', { ready: counts.ready, total: counts.total })}
          </div>
          {counts.pending > 0 ? (
            <div className="an-subtext">{t('newsletters:childLetters.admin.partial', { pending: counts.pending })}</div>
          ) : null}

          <div className="clr-list">
            {letters.map((letter) => (
              <div key={letter._id} className="clr-item">
                <div className="clr-head">
                  <strong>{letter.studentName || t('newsletters:childLetters.list.studentFallback')}</strong>
                  <span className={`clr-status ${letter.sentAt ? 'is-sent' : STATUS_CLASS[letter.status] || ''}`}>
                    {t(`newsletters:childLetters.status.${letter.sentAt ? 'sent' : letter.status}`)}
                  </span>
                  <span className="an-subtext">{t('newsletters:admin.sections.words', { count: letter.wordCount || 0 })}</span>
                </div>
                <p className="clr-body">{letter.previewContent}</p>
                <div className="an-section-actions">
                  <button type="button" className="an-btn" onClick={() => preview(letter)}>
                    {t('newsletters:childLetters.admin.preview')}
                  </button>
                  <button type="button" className="an-btn" onClick={() => downloadPdf(letter)}>
                    {t('newsletters:childLetters.actions.pdf')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="an-inline-actions">
            <button
              type="button"
              className="an-btn primary"
              onClick={send}
              disabled={counts.ready === 0 || sending}
              title={counts.ready === 0 ? t('newsletters:childLetters.admin.notReady') : undefined}
            >
              {sending ? t('newsletters:childLetters.admin.sending') : t('newsletters:childLetters.admin.send')}
            </button>
          </div>
        </>
      )}

      {previewHtml ? (
        <div className="chl-preview-backdrop" role="dialog" aria-modal="true">
          <div className="chl-preview">
            <div className="chl-preview-head">
              <strong>{t('newsletters:childLetters.preview.title')}</strong>
              <button type="button" className="an-btn" onClick={() => setPreviewHtml('')}>
                {t('newsletters:childLetters.preview.close')}
              </button>
            </div>
            <iframe title={t('newsletters:childLetters.preview.title')} srcDoc={previewHtml} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
