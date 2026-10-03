import React from 'react';
import usePracticeSessionData from './hooks/usePracticeSessionData';
import PracticeSessionHeader from './components/PracticeSessionHeader';
import StudentGuidanceCard from './components/StudentGuidanceCard';
import PracticeErrorState from './components/PracticeErrorState';
import PracticeInitialState from './components/PracticeInitialState';
import PracticeSessionComplete from './components/PracticeSessionComplete';
import PracticeQuestionCard from './components/PracticeQuestionCard';
import PracticeAnswerForm from './components/PracticeAnswerForm';
import PracticeLoadingState from './components/PracticeLoadingState';
import './PracticeSessionPage.css';

const PracticeSessionPage = () => {
    const {
        navigate,
        currentQuestion,
        lastResult,
        generating,
        submittingAnswer,
        sessionInfo,
        statusMessage,
        assignmentInstructions,
        suggestRemediation,
        sessionContext,
        practiceError,
        selectedAnswer,
        setSelectedAnswer,
        shortAnswer,
        setShortAnswer,
        difficulty,
        setDifficulty,
        questionType,
        setQuestionType,
        finalizingAssessment,
        handleGenerate,
        handleSubmit,
        handleFinalizeAssessment,
        isMasteredResult,
        isSessionComplete,
        isAssessmentSession,
        assessmentAutoClosed,
        showQuestion,
        displayName,
        combinedAsked,
        combinedCorrect,
        sessionAccuracy,
        streakValue,
        streakLabel,
        usableTopics,
        showContextHints,
        questionLimit,
        currentSessionStep,
        // activeQuestionGuidance — commented out with StudentGuidanceCard
    } = usePracticeSessionData();

    return (
        <div className="practice-session">
            <PracticeSessionHeader onBack={() => navigate('/portal/practice')} />

            {/* <StudentGuidanceCard 
                activeQuestionGuidance={activeQuestionGuidance}
                assignmentInstructions={assignmentInstructions}
            /> */}
            {/* <h2>{assignmentInstructions}</h2> */}
            {generating && !currentQuestion && <PracticeLoadingState />}

            {practiceError && !generating && (
                <PracticeErrorState
                    error={practiceError}
                    onRetry={handleGenerate}
                    showRetry={!currentQuestion}
                />
            )}

            {!currentQuestion && !lastResult && !generating && !practiceError && !isSessionComplete && !isMasteredResult && (
                <PracticeInitialState
                    displayName={displayName}
                    difficulty={difficulty}
                    onDifficultyChange={setDifficulty}
                    questionType={questionType}
                    onQuestionTypeChange={setQuestionType}
                    sessionInfo={sessionInfo}
                    combinedAsked={combinedAsked}
                    combinedCorrect={combinedCorrect}
                    sessionAccuracy={sessionAccuracy}
                    onGenerate={handleGenerate}
                    isGenerating={generating}
                    isAssessmentSession={isAssessmentSession}
                    onFinalizeAssessment={handleFinalizeAssessment}
                    isFinalizingAssessment={finalizingAssessment}
                />
            )}

            {(isMasteredResult || isSessionComplete) && !lastResult && !generating && (
                <PracticeSessionComplete
                    isMastered={isMasteredResult}
                    statusMessage={statusMessage}
                    sessionInfo={sessionInfo}
                    onNavigateToPractice={() => navigate('/portal/practice')}
                    onFinalizeAssessment={handleFinalizeAssessment}
                    finalizingAssessment={finalizingAssessment}
                    isAssessmentSession={isAssessmentSession}
                    showFinalizeAction={!assessmentAutoClosed}
                />
            )}

            {showQuestion && !generating && (
                <PracticeQuestionCard
                    currentQuestion={currentQuestion}
                    currentSessionStep={currentSessionStep}
                    questionLimit={questionLimit}
                    streakLabel={streakLabel}
                    streakValue={streakValue}
                    sessionAccuracy={sessionAccuracy}
                    suggestRemediation={suggestRemediation}
                    showContextHints={showContextHints}
                    usableTopics={usableTopics}
                    recentMistakes={sessionContext?.recentMistakes}
                >
                    <PracticeAnswerForm
                        questionType={currentQuestion.questionType}
                        options={currentQuestion.options}
                        selectedAnswer={selectedAnswer}
                        onSelectedAnswerChange={setSelectedAnswer}
                        shortAnswer={shortAnswer}
                        onShortAnswerChange={setShortAnswer}
                        submittingAnswer={submittingAnswer}
                        onSubmit={handleSubmit}
                    />
                </PracticeQuestionCard>
            )}

        </div>
    );
};

export default PracticeSessionPage;
