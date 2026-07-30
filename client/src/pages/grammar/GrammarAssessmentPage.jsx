import { useTranslation } from 'react-i18next';
import StandardAssignPage from '../standards/StandardAssignPage';

const GrammarAssessmentPage = () => {
    const { t } = useTranslation(['grammarAssessment']);

    return (
        <StandardAssignPage
            grammarOnly
            headerTitle={t('grammarAssessment:header.title', {
                defaultValue: 'Grammar Assessments'
            })}
            headerSubtitle={t('grammarAssessment:header.subtitle', {
                defaultValue:
                    'Create level-based grammar tests, regenerate questions, and track progress over time.'
            })}
            createButtonLabel={t('grammarAssessment:actions.newTest', {
                defaultValue: 'New Grammar Test'
            })}
            modalCreateTitle={t('grammarAssessment:modal.createTitle', {
                defaultValue: 'Create Grammar Test'
            })}
            modalEditTitle={t('grammarAssessment:modal.editTitle', {
                defaultValue: 'Edit Grammar Test'
            })}
            modalCreateActionLabel={t('grammarAssessment:actions.createTest', {
                defaultValue: 'Create Grammar Test'
            })}
            modalEditActionLabel={t('grammarAssessment:actions.saveTestChanges', {
                defaultValue: 'Save Test Changes'
            })}
        />
    );
};

export default GrammarAssessmentPage;
