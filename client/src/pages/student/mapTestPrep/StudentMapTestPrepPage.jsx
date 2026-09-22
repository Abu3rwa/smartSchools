import { useEffect, useState } from 'react';
import api from '../../../config/api';
import './StudentMapTestPrepPage.css';

const StudentMapTestPrepPage = () => {
    const [quizzes, setQuizzes] = useState([]);
    const [quiz, setQuiz] = useState(null);
    const [attempt, setAttempt] = useState(null);
    const [answers, setAnswers] = useState({});
    const [message, setMessage] = useState('');

    useEffect(() => {
        api.get('/map-test-prep/student/quizzes').then((response) => {
            setQuizzes(response.data?.data?.quizzes || []);
        }).catch(() => setMessage('Unable to load MAP practice quizzes.'));
    }, []);

    const startQuiz = async (quizId) => {
        try {
            const response = await api.post(`/map-test-prep/student/quizzes/${quizId}/start`);
            setQuiz(response.data.data.quiz);
            setAttempt(response.data.data.attempt);
            setAnswers({});
            setMessage('');
        } catch (error) {
            setMessage(error.response?.data?.message || 'Unable to start quiz.');
        }
    };

    const submitAnswer = async (questionId, answer) => {
        setAnswers((previous) => ({ ...previous, [questionId]: answer }));
        try {
            await api.post(`/map-test-prep/student/attempts/${attempt._id}/answer`, { questionId, answer });
        } catch (error) {
            setMessage(error.response?.data?.message || 'Unable to save answer.');
        }
    };

    const submitQuiz = async () => {
        try {
            await api.post(`/map-test-prep/student/attempts/${attempt._id}/submit`);
            setMessage('Quiz submitted. Short answers will be reviewed by your teacher.');
            setQuiz(null);
            setAttempt(null);
        } catch (error) {
            setMessage(error.response?.data?.message || 'Unable to submit quiz.');
        }
    };

    return (
        <div className="student-map-prep-page">
            <header><p className="student-map-prep-eyebrow">MAP Test Prep</p><h1>My Practice</h1><p className="text-muted">Complete teacher-approved preparation rounds.</p></header>
            {message && <div className="student-map-prep-message">{message}</div>}
            {!quiz ? <section className="student-map-prep-list">
                <h2>Assigned Quizzes</h2>
                {quizzes.length === 0 ? <p className="text-muted">No MAP practice quizzes are assigned.</p> : quizzes.map((item) => <article key={item._id} className="student-map-prep-quiz">
                    <div><strong>{item.title}</strong><span>{item.questionCount} questions</span></div>
                    <button type="button" className="btn btn-primary" onClick={() => startQuiz(item._id)}>Start</button>
                </article>)}
            </section> : <section className="student-map-prep-quiz-stage">
                <h2>{quiz.title}</h2>
                <p className="text-muted">Answer all assigned questions before submitting.</p>
                {quiz.questions.map((question, index) => <article className="student-map-prep-question" key={question._id}>
                    <strong>{index + 1}. {question.questionText}</strong>
                    {question.questionType === 'multiple_choice' || question.questionType === 'true_false' ? <div className="student-map-prep-options">{(question.options || []).map((option) => <label key={option.label}><input type="radio" name={question._id} value={option.text} checked={answers[question._id] === option.text} onChange={() => submitAnswer(question._id, option.text)} />{option.label}. {option.text}</label>)}</div> : <textarea value={answers[question._id] || ''} onChange={(event) => submitAnswer(question._id, event.target.value)} placeholder="Write your answer" />}
                </article>)}
                <button type="button" className="btn btn-primary" onClick={submitQuiz}>Submit Quiz</button>
            </section>}
        </div>
    );
};

export default StudentMapTestPrepPage;
