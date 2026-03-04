import ImageUploader from '../../../../components/shared/ImageUploader';

const BrandingTab = ({
  schoolName,
  logoUrl,
  loading,
  onUploadLogo,
  onRemoveLogo
}) => {
  return (
    <div className="tab-content">
      <div className="card branding-card">
        <div className="card-header">
          <h3 className="card-title">School Branding</h3>
        </div>
        <div className="branding-body">
          <div className="branding-meta">
            <p className="text-muted">
              Upload a logo for <strong>{schoolName || 'your school'}</strong>. This logo can be used across the portal and reports.
            </p>
          </div>
          <ImageUploader
            currentImageUrl={logoUrl || null}
            onUpload={onUploadLogo}
            onDelete={onRemoveLogo}
            isUploading={loading}
            label="School Logo (PNG/JPG, up to 5MB)"
            shape="rounded"
          />
        </div>
      </div>
    </div>
  );
};

export default BrandingTab;
