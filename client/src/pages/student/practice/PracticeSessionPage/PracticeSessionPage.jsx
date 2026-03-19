import React from 'react';
import usePracticeSessionData from './hooks/usePracticeSessionData';
import PracticeSessionHeader from './components/PracticeSessionHeader';
import PracticeSessionStats from './components/PracticeSessionStats';
import StudentGuidanceCard from './components/StudentGuidanceCard';
import PracticeErrorState from './components/PracticeErrorState';
import PracticeInitialState from './components/PracticeInitialState';
import PracticeLoadingState from './components/PracticeLoadingState';
import PracticeSessionComplete from './components/PracticeSessionComplete';
import PracticeQuestionCard from './components/PracticeQuestionCard';
import PracticeAnswerForm from './components/PracticeAnswerForm';
import PracticeResultFeedback from './components/PracticeResultFeedback';
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
        sessionProgressPercent,
        sessionAccuracy,
        streakValue,
        streakLabel,
        usableTopics,
        showContextHints,
        questionLimit,
        currentSessionStep,
        activeQuestionGuidance
    } = usePracticeSessionData();

    return (
        <div className="practice-session">
            <PracticeSessionHeader onBack={() => navigate('/portal/practice')} />

            <PracticeSessionStats 
                currentQuestion={currentQuestion}
                currentSessionStep={currentSessionStep}
                questionLimit={questionLimit}
                questionsAnswered={sessionInfo?.questionsAnswered}
                combinedAsked={combinedAsked}
                sessionProgressPercent={sessionProgressPercent}
                streakLabel={streakLabel}
                streakValue={streakValue}
                confidenceHint={sessionContext?.confidenceHint}
                sessionAccuracy={sessionAccuracy}
                combinedCorrect={combinedCorrect}
            />

            <StudentGuidanceCard 
                activeQuestionGuidance={activeQuestionGuidance}
                assignmentInstructions={assignmentInstructions}
            />

            {practiceError && !generating && (
                <PracticeErrorState 
                    error={practiceError} 
                    onRetry={handleGenerate} 
                    showRetry={!currentQuestion} 
                />
            )}

            {!currentQuestion && !lastResult && !isSessionComplete && !isMasteredResult && (
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

            {generating && <PracticeLoadingState />}

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

            {lastResult && (
                <PracticeResultFeedback 
                    lastResult={lastResult}
                    displayName={displayName}
                    onNextQuestion={handleGenerate}
                    onNavigateToPractice={() => navigate('/portal/practice')}
                    isGenerating={generating}
                />
            )}
        </div>
    );
};

export default PracticeSessionPage;
