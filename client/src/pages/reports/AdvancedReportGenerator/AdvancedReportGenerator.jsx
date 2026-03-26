import {
  LANGUAGE_OPTIONS,
  REPORT_TYPE_OPTIONS
} from './constants';
import ReportGeneratorHeader from './components/ReportGeneratorHeader';
import StudentSelectionSection from './components/StudentSelectionSection';
import ReportConfigurationSection from './components/ReportConfigurationSection';
import EmailRecipientsSection from './components/EmailRecipientsSection';
import CustomPromptSection from './components/CustomPromptSection';
import ReportGeneratorActions from './components/ReportGeneratorActions';
import ReportSuccessMessage from './components/ReportSuccessMessage';
import ReportErrorMessage from './components/ReportErrorMessage';
import ReportPreview from './components/ReportPreview';
import useAdvancedReportGenerator from './hooks/useAdvancedReportGenerator';
import './AdvancedReportGenerator.css';

const AdvancedReportGenerator = () => {
  const {
    students,
    formData,
    generating,
    sending,
    report,
    error,
    success,
    handleInputChange,
    handleGeneratePreview,
    handleGenerateAndSend,
    sanitizedReportHtml
  } = useAdvancedReportGenerator();

  return (
    <div className="report-generator-container">
      <ReportGeneratorHeader />

      <div className="report-generator-form">
        <StudentSelectionSection
          students={students}
          value={formData.studentId}
          onChange={handleInputChange}
        />

        <ReportConfigurationSection
          reportTypes={REPORT_TYPE_OPTIONS}
          languages={LANGUAGE_OPTIONS}
          formData={formData}
          onChange={handleInputChange}
        />

        <EmailRecipientsSection formData={formData} onChange={handleInputChange} />

        <CustomPromptSection value={formData.customPrompt} onChange={handleInputChange} />

        <ReportGeneratorActions
          onPreview={handleGeneratePreview}
          onSend={handleGenerateAndSend}
          generating={generating}
          sending={sending}
          disabled={!formData.studentId}
        />
      </div>

      {success && <ReportSuccessMessage success={success} />}

      {error && <ReportErrorMessage message={error} />}

      {report && (
        <ReportPreview
          generating={generating}
          sanitizedHtml={sanitizedReportHtml}
        />
      )}
    </div>
  );
};

export default AdvancedReportGenerator;
