import ImageUploader from '../../../../components/shared/ImageUploader';
import { useTranslation } from 'react-i18next';

const BrandingTab = ({
  schoolName,
  logoUrl,
  loading,
  onUploadLogo,
  onRemoveLogo
}) => {
  const { t } = useTranslation(['schoolSettings']);

  return (
    <div className="tab-content">
      <div className="card branding-card">
        <div className="card-header">
          <h3 className="card-title">{t('schoolSettings:branding.title')}</h3>
        </div>
        <div className="branding-body">
          <div className="branding-meta">
            <p className="text-muted">
              {t('schoolSettings:branding.uploadHelpPrefix')} <strong>{schoolName || t('schoolSettings:branding.yourSchool')}</strong>. {t('schoolSettings:branding.uploadHelpSuffix')}
            </p>
          </div>
          <ImageUploader
            currentImageUrl={logoUrl || null}
            onUpload={onUploadLogo}
            onDelete={onRemoveLogo}
            isUploading={loading}
            label={t('schoolSettings:branding.logoLabel')}
            shape="rounded"
          />
        </div>
      </div>
    </div>
  );
};

export default BrandingTab;
