import { useState } from 'react';
import {
    createDefaultAIRecipients,
    createDefaultGradeForm
} from '../constants';

const useGradebookPageState = (students = []) => {
    const [selectedSubject, setSelectedSubject] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
    const [grades, setGrades] = useState([]);
    const [gradingScale, setGradingScale] = useState(null);
    const [loading, setLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');

    const [showAIModal, setShowAIModal] = useState(false);
    const [selectedStudentForAI, setSelectedStudentForAI] = useState(null);
    const [aiReportContent, setAiReportContent] = useState('');
    const [generatingAI, setGeneratingAI] = useState(false);
    const [isEditingReport, setIsEditingReport] = useState(false);
    const [editedReportContent, setEditedReportContent] = useState('');
    const [aiPrimaryLanguage, setAiPrimaryLanguage] = useState('en');
    const [aiSecondaryLanguage, setAiSecondaryLanguage] = useState('');
    const [aiRecipients, setAiRecipients] = useState(createDefaultAIRecipients);
    const [aiSendEmail, setAiSendEmail] = useState(false);

    const [formData, setFormData] = useState(() => createDefaultGradeForm(students));

    const resetForm = () => {
        setFormData(createDefaultGradeForm(students));
        setAiReportContent('');
        setAiPrimaryLanguage('en');
        setAiSecondaryLanguage('');
        setAiRecipients(createDefaultAIRecipients());
        setAiSendEmail(false);
    };

    return {
        selectedSubject,
        setSelectedSubject,
        selectedMonth,
        setSelectedMonth,
        grades,
        setGrades,
        gradingScale,
        setGradingScale,
        loading,
        setLoading,
        showAddModal,
        setShowAddModal,
        selectedCategoryFilter,
        setSelectedCategoryFilter,
        showAIModal,
        setShowAIModal,
        selectedStudentForAI,
        setSelectedStudentForAI,
        aiReportContent,
        setAiReportContent,
        generatingAI,
        setGeneratingAI,
        isEditingReport,
        setIsEditingReport,
        editedReportContent,
        setEditedReportContent,
        aiPrimaryLanguage,
        setAiPrimaryLanguage,
        aiSecondaryLanguage,
        setAiSecondaryLanguage,
        aiRecipients,
        setAiRecipients,
        aiSendEmail,
        setAiSendEmail,
        formData,
        setFormData,
        resetForm
    };
};

export default useGradebookPageState;
