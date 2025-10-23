import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';

const API_KEY = process.env.API_KEY;

// --- DATA CONSTANTS ---
const TAT_IMAGES = [
  "https://images.unsplash.com/photo-1504221507732-5246c0db29e7?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1542856334-a1b635e48358?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];
const WAT_WORDS = ['Duty', 'Courage', 'Team', 'Defeat', 'Lead', 'Responsibility', 'Friend', 'Failure', 'Order', 'Discipline', 'Win', 'Challenge', 'Honest', 'Risk', 'Sacrifice', 'Plan', 'Execute', 'Alone', 'System', 'Cooperate', 'Attack', 'Love', 'Weapon', 'Peace', 'Fear', 'Brave', 'Help', 'Work', 'Difficult', 'Easy', 'Decision', 'Quick', 'Slow', 'Success', 'Mistake', 'Learn', 'Teach', 'Follow', 'Guide', 'Country', 'Home', 'Family', 'Self', 'Group', 'Enemy', 'Future', 'Past', 'Present', 'Time', 'Money', 'Health', 'Stamina', 'Mind', 'Body', 'Spirit', 'Moral', 'Ethics', 'Truth', 'Lie'];
const SRT_SCENARIOS = [
    'You are on your way to an important exam and you see an accident. You are the first person to arrive. What would you do?',
    'During a group task, your team members are not cooperating. What would you do?',
    'You find a wallet containing a large sum of money and important documents on a public bus. What do you do?',
    'You are captain of the college sports team, and your best player breaks a crucial team rule right before the final match. What actions would you take?',
    'While trekking with friends in a remote area, one of them sprains their ankle badly and cannot walk. Night is approaching and there is no mobile signal. What will you do?'
];
const SDT_PROMPTS = [
    "What do your parents think of you?",
    "What do your teachers/superiors think of you?",
    "What do your friends think of you?",
    "What do you think of yourself? (Your strengths and weaknesses)",
    "What kind of person would you like to become?"
];

// --- AI INTEGRATION ---
const ai = new GoogleGenAI({ apiKey: API_KEY });

const getAIAssessment = async (testType, responses) => {
    const olqs = "Effective Intelligence, Reasoning Ability, Organizing Ability, Power of Expression, Social Adaptability, Cooperation, Sense of Responsibility, Initiative, Self Confidence, Speed of Decision, Ability to Influence a Group, Liveliness, Determination, Courage, Stamina.";
    let content = "";
    if (testType === 'TAT') {
        content = `Analyze this story from a Thematic Apperception Test. Evaluate structure, protagonist's traits, and overall theme.\n\nStory: "${responses[0]}"`;
    } else if (testType === 'WAT') {
        content = `Analyze these sentences from a Word Association Test. Evaluate positivity, maturity, and thought process.\n\nResponses:\n${responses.map(r => `${r.word}: ${r.sentence}`).join('\n')}`;
    } else if (testType === 'SRT') {
        content = `Analyze these reactions from a Situation Reaction Test. Evaluate problem-solving, decision-making, and emotional stability.\n\nReactions:\n${responses.map(r => `${r.situation}: ${r.reaction}`).join('\n')}`;
    } else if (testType === 'SDT') {
        content = `Analyze these Self-Description Test paragraphs. Summarize self-awareness, honesty, and personality. Identify key strengths and weaknesses.\n\n${responses.map((r, i) => `${SDT_PROMPTS[i]}\n${r}\n`).join('\n')}`;
    }

    const prompt = `Act as an expert SSB psychologist. Your feedback must be encouraging, constructive, and professional, referencing the 15 Officer-Like Qualities (OLQs): ${olqs}. ${content}. Provide feedback in a JSON object with three keys: "olqs_demonstrated" (an array of strings), "areas_for_improvement" (an array of strings), and "suggestions" (an array of strings).`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING } },
                        areas_for_improvement: { type: Type.ARRAY, items: { type: Type.STRING } },
                        suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["olqs_demonstrated", "areas_for_improvement", "suggestions"]
                }
            }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("AI feedback generation failed:", error);
        return { error: "Failed to get feedback. Please try again." };
    }
};


// --- DATABASE (localStorage wrapper) ---
const db = {
    get: (key, defaultValue = null) => {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    },
    set: (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
    }
};

// --- COMPONENTS ---

const LoginPage = ({ onLogin }) => {
    const [name, setName] = useState('');
    return (
        <div className="login-container">
            <div className="card login-card">
                <h1>SSB Prep Portal</h1>
                <p>Enter your name to begin your assessment journey.</p>
                <form onSubmit={(e) => { e.preventDefault(); name.trim() && onLogin(name.trim()); }}>
                    <div className="form-group">
                        <label htmlFor="name">Aspirant Name</label>
                        <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Vikram Batra" required/>
                    </div>
                    <button type="submit" className="btn btn-primary btn-block">Start Training</button>
                </form>
            </div>
        </div>
    );
};

// Fix: Add explicit JSX.Element return type to help TypeScript recognize this as a React component, which allows the use of the special 'key' prop.
const TestHistoryCard = ({ testType, results, onViewFeedback }): JSX.Element => {
    const MAX_SCORE = 150; // 15 OLQs * 10 points
    const avgScore = useMemo(() => {
        if (!results || results.length === 0) return 0;
        const totalScore = results.reduce((sum, result) => sum + (result.score || 0), 0);
        return Math.round(totalScore / results.length);
    }, [results]);

    return (
        <div className="card test-history-card">
            <h3>{testType}</h3>
            <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${(avgScore / MAX_SCORE) * 100}%` }}></div>
            </div>
            <p className="progress-label">Average Score: {avgScore} / {MAX_SCORE}</p>
            {results && results.length > 0 ? (
                <ul className="history-list">
                    {results.map((attempt, index) => (
                        <li key={index} className="history-item">
                            <div>
                                <p className="date">{new Date(attempt.date).toLocaleDateString()}</p>
                                <p className="score">Score: {attempt.score}</p>
                            </div>
                            <button className="btn btn-secondary" onClick={() => onViewFeedback(attempt.feedback)}>
                                View Feedback
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <div className="no-history">
                    <p>No attempts yet. Take the test to see your progress!</p>
                </div>
            )}
        </div>
    );
};


const Dashboard = ({ user, onViewFeedback }) => {
    return (
        <div>
            <h1 className="page-header">Welcome, {user.name}</h1>
            <div className="progress-grid">
                {['TAT', 'WAT', 'SRT', 'SDT'].map(test => (
                    <TestHistoryCard
                        key={test}
                        testType={test}
                        results={user.testResults[test]}
                        onViewFeedback={onViewFeedback}
                    />
                ))}
            </div>
        </div>
    );
};

const FeedbackModal = ({ feedback, onClose }) => {
    if (!feedback) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                {feedback.isLoading ? (
                    <div className="text-center">
                        <div className="loading-spinner"></div>
                        <p>Analyzing your responses... This may take a moment.</p>
                    </div>
                ) : (
                    <>
                        <h2>AI Assessment Feedback</h2>
                        {feedback.error ? <p>{feedback.error}</p> : (
                            <>
                                <div className="feedback-section">
                                    <h3>Officer-Like Qualities Demonstrated</h3>
                                    <ul>{feedback.olqs_demonstrated?.map((item, i) => <li key={i}>{item}</li>)}</ul>
                                </div>
                                <div className="feedback-section">
                                    <h3>Areas for Improvement</h3>
                                    <ul>{feedback.areas_for_improvement?.map((item, i) => <li key={i}>{item}</li>)}</ul>
                                </div>
                                <div className="feedback-section">
                                    <h3>Actionable Suggestions</h3>
                                    <ul>{feedback.suggestions?.map((item, i) => <li key={i}>{item}</li>)}</ul>
                                </div>
                            </>
                        )}
                        <div className="text-center" style={{ marginTop: '2rem' }}>
                            <button onClick={onClose} className="btn btn-primary">Close</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const TestRunner = ({ testType, data, timeLimit, onComplete }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState([]);
    const [currentResponse, setCurrentResponse] = useState('');
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const [isStarted, setIsStarted] = useState(false);

    const handleNext = useCallback(() => {
        const newResponse = testType === 'WAT' ? { word: data[currentIndex], sentence: currentResponse } :
                              testType === 'SRT' ? { situation: data[currentIndex], reaction: currentResponse } :
                              { image: data[currentIndex], story: currentResponse };
        
        const updatedResponses = [...responses, newResponse];
        setResponses(updatedResponses);
        setCurrentResponse('');

        if (currentIndex < data.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setTimeLeft(timeLimit);
        } else {
            onComplete(updatedResponses);
        }
    }, [currentIndex, currentResponse, responses, data, onComplete, timeLimit, testType]);

    useEffect(() => {
        if (!isStarted) return;
        if (timeLeft > 0) {
            const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
            return () => clearTimeout(timer);
        } else {
            handleNext();
        }
    }, [timeLeft, isStarted, handleNext]);

    if (!isStarted) {
        return (
            <div className="text-center">
                <div className="card test-instructions">
                    <h2>{testType} Instructions</h2>
                    {testType === 'TAT' && <p>You will be shown {data.length} pictures. For each picture, you will have {timeLimit / 60} minutes to write a story.</p>}
                    {testType === 'WAT' && <p>You will be shown {data.length} words. For each word, you will have {timeLimit} seconds to write a sentence.</p>}
                    {testType === 'SRT' && <p>You will be shown {data.length} situations. For each, you will have {timeLimit} seconds to write your reaction.</p>}
                    <button className="btn btn-primary" onClick={() => setIsStarted(true)} style={{marginTop: '1rem'}}>Start Test</button>
                </div>
            </div>
        );
    }

    const progress = (currentIndex / data.length) * 100;

    return (
        <div className="test-runner-container">
            <h1 className="page-header">{testType}</h1>
            <p>Item {currentIndex + 1} of {data.length}</p>
            <div className="test-progress-bar"><div className="test-progress-bar-inner" style={{ width: `${progress}%` }}></div></div>
            <div className="timer">{timeLeft}s</div>
            <div className="card">
                <div className="test-stimulus">
                    {testType === 'TAT' && <img id="tat-image" src={data[currentIndex]} alt="Thematic Apperception Test Stimulus" />}
                    {testType === 'WAT' && <p id="wat-word">{data[currentIndex]}</p>}
                    {testType === 'SRT' && <p id="srt-situation">{data[currentIndex]}</p>}
                </div>
                <form onSubmit={e => { e.preventDefault(); handleNext(); }}>
                    {testType === 'TAT' ? (
                        <textarea value={currentResponse} onChange={e => setCurrentResponse(e.target.value)} placeholder="Write your story here..." required></textarea>
                    ) : (
                        <input type="text" value={currentResponse} onChange={e => setCurrentResponse(e.target.value)} placeholder={testType === 'WAT' ? "Write your sentence here..." : "Write your reaction here..."} autoFocus required />
                    )}
                    <button type="submit" className="btn btn-primary" style={{marginTop: '1.5rem'}}>Next</button>
                </form>
            </div>
        </div>
    );
};

const SDTView = ({ onComplete }) => {
    const [responses, setResponses] = useState(Array(SDT_PROMPTS.length).fill(''));

    const handleChange = (index, value) => {
        const newResponses = [...responses];
        newResponses[index] = value;
        setResponses(newResponses);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onComplete(responses);
    };

    return (
        <div>
            <h1 className="page-header">Self-Description Test (SDT)</h1>
            <div className="card">
                <p>Take your time to write a thoughtful response for each prompt. There is no time limit.</p>
                <form onSubmit={handleSubmit} style={{marginTop: '2rem'}}>
                    {SDT_PROMPTS.map((prompt, index) => (
                        <div className="form-group" key={index}>
                            <label>{prompt}</label>
                            <textarea value={responses[index]} onChange={(e) => handleChange(index, e.target.value)} required />
                        </div>
                    ))}
                    <button type="submit" className="btn btn-primary btn-block">Submit for Analysis</button>
                </form>
            </div>
        </div>
    );
};

const Leaderboard = ({ users }) => {
    const sortedUsers = useMemo(() => {
        return [...users].sort((a,b) => (b.score || 0) - (a.score || 0));
    }, [users]);

    return (
        <div>
            <h1 className="page-header">Leaderboard</h1>
            <div className="card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Name</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user, index) => (
                            <tr key={user.name}>
                                <td className="rank">#{index + 1}</td>
                                <td>{user.name}</td>
                                <td>{user.score || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

// --- MAIN APP ---
const App = () => {
    const [currentUser, setCurrentUser] = useState(db.get('currentUser'));
    const [users, setUsers] = useState(db.get('users', []));
    const [view, setView] = useState('dashboard');
    const [viewedFeedback, setViewedFeedback] = useState(null);

    useEffect(() => {
        db.set('currentUser', currentUser);
        if (currentUser) {
            setUsers(prevUsers => {
                const userExists = prevUsers.some(u => u.name === currentUser.name);
                if (userExists) {
                    return prevUsers.map(u => u.name === currentUser.name ? currentUser : u);
                }
                return [...prevUsers, currentUser];
            });
        }
    }, [currentUser]);

    useEffect(() => {
        db.set('users', users);
    }, [users]);

    const handleLogin = (name) => {
        let user = users.find(u => u.name === name);
        if (!user) {
            user = { name, testResults: {}, score: 0 };
        }
        setCurrentUser(user);
    };

    const handleLogout = () => {
        setCurrentUser(null);
    }
    
    const handleTestComplete = async (testType, responses) => {
        setView('dashboard');
        setViewedFeedback({ isLoading: true });
        
        const aiFeedback = await getAIAssessment(testType, responses);
        setViewedFeedback(aiFeedback);

        setCurrentUser(prevUser => {
            const newTestResults = { ...prevUser.testResults };
            if (!newTestResults[testType]) {
                newTestResults[testType] = [];
            }
            // Simple scoring: +10 for each OLQ demonstrated
            const score_gain = aiFeedback.olqs_demonstrated?.length * 10 || 0;
            
            const newAttempt = {
                responses,
                feedback: aiFeedback,
                score: score_gain,
                date: new Date().toISOString()
            };
            
            newTestResults[testType].push(newAttempt);

            return { ...prevUser, testResults: newTestResults, score: (prevUser.score || 0) + score_gain };
        });
    };
    
    const handleViewFeedback = (feedback) => {
        setViewedFeedback(feedback);
    };

    if (!currentUser) {
        return <LoginPage onLogin={handleLogin} />;
    }

    const renderView = () => {
        switch (view) {
            case 'dashboard': return <Dashboard user={currentUser} onViewFeedback={handleViewFeedback} />;
            case 'tat': return <TestRunner testType="TAT" data={TAT_IMAGES} timeLimit={240} onComplete={(r) => handleTestComplete('TAT', r)} />;
            case 'wat': return <TestRunner testType="WAT" data={WAT_WORDS} timeLimit={15} onComplete={(r) => handleTestComplete('WAT', r)} />;
            case 'srt': return <TestRunner testType="SRT" data={SRT_SCENARIOS} timeLimit={30} onComplete={(r) => handleTestComplete('SRT', r)} />;
            case 'sdt': return <SDTView onComplete={(r) => handleTestComplete('SDT', r)} />;
            case 'leaderboard': return <Leaderboard users={users}/>;
            default: return <Dashboard user={currentUser} onViewFeedback={handleViewFeedback} />;
        }
    };

    return (
        <>
            <div className="app-layout">
                <aside className="sidebar">
                    <div className="sidebar-header">SSB PREP</div>
                    <nav className="sidebar-nav">
                        <ul>
                            <li><a href="#" className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</a></li>
                            <li><a href="#" className={view === 'tat' ? 'active' : ''} onClick={() => setView('tat')}>TAT</a></li>
                            <li><a href="#" className={view === 'wat' ? 'active' : ''} onClick={() => setView('wat')}>WAT</a></li>
                            <li><a href="#" className={view === 'srt' ? 'active' : ''} onClick={() => setView('srt')}>SRT</a></li>
                            <li><a href="#" className={view === 'sdt' ? 'active' : ''} onClick={() => setView('sdt')}>SDT</a></li>
                            <li><a href="#" className={view === 'leaderboard' ? 'active' : ''} onClick={() => setView('leaderboard')}>Leaderboard</a></li>
                        </ul>
                    </nav>
                    <div className="sidebar-footer">
                        <p>Logged in as: <strong>{currentUser.name}</strong></p>
                        <button onClick={handleLogout}>Logout</button>
                    </div>
                </aside>
                <main className="main-content">
                    {renderView()}
                </main>
            </div>
            <FeedbackModal feedback={viewedFeedback} onClose={() => setViewedFeedback(null)} />
        </>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
