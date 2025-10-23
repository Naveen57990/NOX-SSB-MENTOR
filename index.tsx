
import { GoogleGenAI, Type } from "@google/genai";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';

const API_KEY = process.env.API_KEY;

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


// --- DEFAULT DATA CONSTANTS ---
const TAT_IMAGES_DEFAULT = [
  "https://images.unsplash.com/photo-1504221507732-5246c0db29e7?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1542856334-a1b635e48358?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?q=80&w=1920&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];
const WAT_WORDS_DEFAULT = ['Duty', 'Courage', 'Team', 'Defeat', 'Lead', 'Responsibility', 'Friend', 'Failure', 'Order', 'Discipline', 'Win', 'Challenge', 'Honest', 'Risk', 'Sacrifice', 'Plan', 'Execute', 'Alone', 'System', 'Cooperate', 'Attack', 'Love', 'Weapon', 'Peace', 'Fear', 'Brave', 'Help', 'Work', 'Difficult', 'Easy', 'Decision', 'Quick', 'Slow', 'Success', 'Mistake', 'Learn', 'Teach', 'Follow', 'Guide', 'Country', 'Home', 'Family', 'Self', 'Group', 'Enemy', 'Future', 'Past', 'Present', 'Time', 'Money', 'Health', 'Stamina', 'Mind', 'Body', 'Spirit', 'Moral', 'Ethics', 'Truth', 'Lie'];
const SRT_SCENARIOS_DEFAULT = [
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

const getAIAssessment = async (testType, data) => {
    const olqs = "Effective Intelligence, Reasoning Ability, Organizing Ability, Power of Expression, Social Adaptability, Cooperation, Sense of Responsibility, Initiative, Self Confidence, Speed of Decision, Ability to Influence a Group, Liveliness, Determination, Courage, Stamina.";
    let content = "";
    if (testType === 'TAT') {
        content = `Analyze this story from a Thematic Apperception Test. Evaluate structure, protagonist's traits, and overall theme.\n\nStory: "${data.responses[0]}"`;
    } else if (testType === 'WAT') {
        content = `Analyze these sentences from a Word Association Test. Evaluate positivity, maturity, and thought process.\n\nResponses:\n${data.responses.map(r => `${r.word}: ${r.sentence}`).join('\n')}`;
    } else if (testType === 'SRT') {
        content = `Analyze these reactions from a Situation Reaction Test. Evaluate problem-solving, decision-making, and emotional stability.\n\nReactions:\n${data.responses.map(r => `${r.situation}: ${r.reaction}`).join('\n')}`;
    } else if (testType === 'SDT') {
        content = `Analyze these Self-Description Test paragraphs. Summarize self-awareness, honesty, and personality. Identify key strengths and weaknesses.\n\n${data.responses.map((r, i) => `${SDT_PROMPTS[i]}\n${r}\n`).join('\n')}`;
    } else if (testType === 'Interview') {
         content = `Analyze this personal interview transcript, keeping the candidate's detailed PIQ data in mind. Evaluate for OLQs like self-confidence, power of expression, social adaptability, honesty, and determination. PIQ Data: ${JSON.stringify(data.piqData)}. Transcript: ${JSON.stringify(data.transcript)}.`;
    }

    const prompt = `Act as an expert SSB psychologist providing detailed, structured feedback. Your analysis must be encouraging, constructive, and professional, referencing the 15 Officer-Like Qualities (OLQs): ${olqs}. ${content}. Your response must be a JSON object conforming to the provided schema. Analyze the candidate's responses holistically to provide: 1. An overall summary. 2. A list of OLQs clearly demonstrated (for scoring). 3. Specific strengths with related OLQs. 4. Specific weaknesses with related OLQs. 5. A detailed assessment for several key OLQs. 6. Highly specific, actionable advice broken down into what to practice, how to improve, and what to avoid.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        overall_summary: { type: Type.STRING, description: "A brief, encouraging summary of the performance." },
                        olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Array of OLQ names clearly demonstrated." },
                        strengths: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } },
                                required: ["point", "example_olq"]
                            }
                        },
                        weaknesses: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } },
                                required: ["point", "example_olq"]
                            }
                        },
                        detailed_olq_assessment: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: { olq: { type: Type.STRING }, assessment: { type: Type.STRING } },
                                required: ["olq", "assessment"]
                            }
                        },
                        actionable_advice: {
                            type: Type.OBJECT,
                            properties: {
                                what_to_practice: { type: Type.ARRAY, items: { type: Type.STRING } },
                                how_to_improve: { type: Type.ARRAY, items: { type: Type.STRING } },
                                what_to_avoid: { type: Type.ARRAY, items: { type: Type.STRING } }
                            },
                            required: ["what_to_practice", "how_to_improve", "what_to_avoid"]
                        }
                    },
                    required: ["overall_summary", "olqs_demonstrated", "strengths", "weaknesses", "detailed_olq_assessment", "actionable_advice"]
                }
            }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("AI feedback generation failed:", error);
        return { error: "Failed to get feedback. Please try again." };
    }
};

const getNextInterviewQuestion = async (piqData, transcript) => {
    let prompt;
    if (transcript.length === 0) {
         prompt = `Act as an SSB Interviewing Officer. You will conduct a personal interview based on the candidate's PIQ form. Start with an introductory question to make the candidate comfortable. Here is the candidate's PIQ data: ${JSON.stringify(piqData)}. Ask one question only.`;
    } else {
        const lastAnswer = transcript[transcript.length -1].text;
        prompt = `You are an SSB Interviewing Officer continuing a personal interview. Here is the candidate's comprehensive PIQ data: ${JSON.stringify(piqData)}. Here is the interview transcript so far: ${JSON.stringify(transcript)}. The candidate's last answer was: "${lastAnswer}". Ask the next logical follow-up question. Keep it concise. Ask only one question. Do not repeat questions from the transcript.`
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });
        return response.text.trim();
    } catch (error) {
        console.error("AI question generation failed:", error);
        return "I'm having trouble thinking of a question. Let's try again. Tell me about your hobbies.";
    }
};


// --- COMPONENTS ---

const LoginPage = ({ onLogin }) => {
    const [name, setName] = useState('');
    return (
        <div className="login-container">
            <div className="card login-card">
                <h1>NOX SSB Prep</h1>
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

interface TestHistoryCardProps {
    testType: string;
    results: any;
    onViewFeedback: (feedback: any) => void;
}

const TestHistoryCard: React.FC<TestHistoryCardProps> = ({ testType, results, onViewFeedback }) => {
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

const ManageTatModal = ({ images, onAdd, onRemove, onClose }) => {
    const [newImageUrl, setNewImageUrl] = useState('');

    const handleAdd = (e) => {
        e.preventDefault();
        if (newImageUrl.trim()) {
            onAdd(newImageUrl.trim());
            setNewImageUrl('');
        }
    };
    
    return (
         <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Manage TAT Images</h2>
                <ul className="content-list">
                    {images.map((img, index) => (
                        <li key={index} className="content-list-item">
                            <img src={img} alt={`TAT Image ${index + 1}`} className="image-preview" />
                            <span className="item-text">{img}</span>
                            <button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button>
                        </li>
                    ))}
                </ul>
                <form className="add-item-form" onSubmit={handleAdd}>
                    <input 
                        type="text" 
                        value={newImageUrl}
                        onChange={e => setNewImageUrl(e.target.value)}
                        placeholder="Paste new image URL here"
                        style={{flex: 1}}
                    />
                    <button type="submit" className="btn btn-primary">Add Image</button>
                </form>
                <div className="text-center" style={{ marginTop: '2rem' }}>
                    <button onClick={onClose} className="btn btn-secondary">Close</button>
                </div>
            </div>
        </div>
    );
};

const ManageWatModal = ({ words, onAdd, onRemove, onClose }) => {
    const [newWord, setNewWord] = useState('');

    const handleAdd = (e) => {
        e.preventDefault();
        if (newWord.trim()) {
            onAdd(newWord.trim());
            setNewWord('');
        }
    };
    
    return (
         <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Manage WAT Words</h2>
                <ul className="content-list">
                    {words.map((word, index) => (
                        <li key={index} className="content-list-item">
                            <span className="item-text" style={{whiteSpace: 'normal'}}>{word}</span>
                            <button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button>
                        </li>
                    ))}
                </ul>
                <form className="add-item-form" onSubmit={handleAdd}>
                    <input 
                        type="text" 
                        value={newWord}
                        onChange={e => setNewWord(e.target.value)}
                        placeholder="Enter new word"
                        style={{flex: 1}}
                    />
                    <button type="submit" className="btn btn-primary">Add Word</button>
                </form>
                <div className="text-center" style={{ marginTop: '2rem' }}>
                    <button onClick={onClose} className="btn btn-secondary">Close</button>
                </div>
            </div>
        </div>
    );
};

const ManageSrtModal = ({ scenarios, onAdd, onRemove, onClose }) => {
    const [newScenario, setNewScenario] = useState('');

    const handleAdd = (e) => {
        e.preventDefault();
        if (newScenario.trim()) {
            onAdd(newScenario.trim());
            setNewScenario('');
        }
    };
    
    return (
         <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Manage SRT Scenarios</h2>
                <ul className="content-list">
                    {scenarios.map((scenario, index) => (
                        <li key={index} className="content-list-item">
                            <span className="item-text" style={{whiteSpace: 'normal'}}>{scenario}</span>
                            <button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button>
                        </li>
                    ))}
                </ul>
                <form className="add-item-form" onSubmit={handleAdd}>
                    <textarea 
                        value={newScenario}
                        onChange={e => setNewScenario(e.target.value)}
                        placeholder="Enter new scenario"
                        style={{flex: 1, minHeight: '60px'}}
                    />
                    <button type="submit" className="btn btn-primary">Add Scenario</button>
                </form>
                <div className="text-center" style={{ marginTop: '2rem' }}>
                    <button onClick={onClose} className="btn btn-secondary">Close</button>
                </div>
            </div>
        </div>
    );
};

const Dashboard = ({ user, onManage, onNavigate }) => {
    return (
        <div>
            <div className="page-header">
                <h1>Welcome, {user.name}</h1>
                <div className="header-actions">
                    <button className="btn btn-secondary" onClick={() => onManage('TAT')}>Manage TAT</button>
                    <button className="btn btn-secondary" onClick={() => onManage('WAT')}>Manage WAT</button>
                    <button className="btn btn-secondary" onClick={() => onManage('SRT')}>Manage SRT</button>
                </div>
            </div>
            <div className="progress-grid">
                {['TAT', 'WAT', 'SRT', 'SDT', 'Interview'].map(test => (
                    <TestHistoryCard
                        key={test}
                        testType={test}
                        results={user.testResults[test]}
                        onViewFeedback={(feedback) => onManage('ViewFeedback', feedback)}
                    />
                ))}
            </div>
        </div>
    );
};

const FeedbackModal = ({ feedback, onClose }) => {
    const [activeTab, setActiveTab] = useState('summary');
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
                                <div className="feedback-tabs">
                                    <button className={`feedback-tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>Summary</button>
                                    <button className={`feedback-tab ${activeTab === 'olq' ? 'active' : ''}`} onClick={() => setActiveTab('olq')}>OLQ Analysis</button>
                                    <button className={`feedback-tab ${activeTab === 'plan' ? 'active' : ''}`} onClick={() => setActiveTab('plan')}>Action Plan</button>
                                </div>
                                <div className="feedback-tab-content">
                                    {activeTab === 'summary' && (
                                        <>
                                            <p className="overall-summary">{feedback.overall_summary}</p>
                                            <div className="strengths-weaknesses-grid">
                                                <div className="feedback-column">
                                                    <h3><span className="strength-icon">✓</span> Strengths</h3>
                                                    {feedback.strengths?.map((item, i) => (
                                                        <div key={i} className="feedback-card">
                                                            <p className="point">{item.point}</p>
                                                            <p className="olq-tag">{item.example_olq}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="feedback-column">
                                                    <h3><span className="weakness-icon">✗</span> Weaknesses</h3>
                                                    {feedback.weaknesses?.map((item, i) => (
                                                         <div key={i} className="feedback-card">
                                                            <p className="point">{item.point}</p>
                                                            <p className="olq-tag">{item.example_olq}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    {activeTab === 'olq' && (
                                        <ul className="olq-assessment-list">
                                            {feedback.detailed_olq_assessment?.map((item, i) => (
                                                <li key={i} className="olq-assessment-item">
                                                    <strong>{item.olq}</strong>
                                                    <span>{item.assessment}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    {activeTab === 'plan' && (
                                        <>
                                            <div className="action-plan-section">
                                                <h4>What to Practice</h4>
                                                <ul>{feedback.actionable_advice?.what_to_practice.map((item, i) => <li key={i}>{item}</li>)}</ul>
                                            </div>
                                             <div className="action-plan-section">
                                                <h4>How to Improve</h4>
                                                <ul>{feedback.actionable_advice?.how_to_improve.map((item, i) => <li key={i}>{item}</li>)}</ul>
                                            </div>
                                             <div className="action-plan-section">
                                                <h4>What to Avoid</h4>
                                                <ul>{feedback.actionable_advice?.what_to_avoid.map((item, i) => <li key={i}>{item}</li>)}</ul>
                                            </div>
                                        </>
                                    )}
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
                     {data.length === 0 ? (
                        <p style={{color: 'var(--danger-color)'}}>No {testType} content found. Please add some via the dashboard.</p>
                     ) : (
                        <button className="btn btn-primary" onClick={() => setIsStarted(true)} style={{marginTop: '1rem'}} disabled={data.length === 0}>Start Test</button>
                     )}
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
};

const PIQForm = ({ onSave, initialData }) => {
    const [piqData, setPiqData] = useState(initialData || {});

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPiqData(prev => ({...prev, [name]: value}));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(piqData);
    };

    return (
        <div>
            <h1 className="page-header">Personal Information Questionnaire (PIQ)</h1>
            <div className="card">
                <p>Your responses here will be used by the AI to conduct a realistic interview. Please fill them out accurately.</p>
                <form onSubmit={handleSubmit} className="piq-form" style={{marginTop: '2rem'}}>
                    <fieldset>
                        <legend>Personal Details</legend>
                        <div className="piq-form-grid">
                            <div className="form-group"><label>Full Name</label><input type="text" name="fullName" value={piqData.fullName || ''} onChange={handleChange} required /></div>
                            <div className="form-group"><label>Date of Birth</label><input type="date" name="dob" value={piqData.dob || ''} onChange={handleChange} required /></div>
                            <div className="form-group"><label>Place of Birth (City, State)</label><input type="text" name="pob" value={piqData.pob || ''} onChange={handleChange} /></div>
                            <div className="form-group"><label>Height (cm)</label><input type="number" name="height" value={piqData.height || ''} onChange={handleChange} /></div>
                            <div className="form-group"><label>Weight (kg)</label><input type="number" name="weight" value={piqData.weight || ''} onChange={handleChange} /></div>
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend>Family Background</legend>
                        <div className="piq-form-grid">
                             <div className="form-group"><label>Father's Name & Occupation</label><input type="text" name="fatherInfo" value={piqData.fatherInfo || ''} onChange={handleChange} placeholder="e.g., Mr. Raj Singh, Farmer"/></div>
                             <div className="form-group"><label>Mother's Name & Occupation</label><input type="text" name="motherInfo" value={piqData.motherInfo || ''} onChange={handleChange} placeholder="e.g., Mrs. Sunita Singh, Homemaker"/></div>
                             <div className="form-group"><label>Number of Siblings</label><input type="number" name="siblings" value={piqData.siblings || ''} onChange={handleChange}/></div>
                        </div>
                         <div className="form-group"><label>Details about Siblings</label><textarea name="siblingsInfo" value={piqData.siblingsInfo || ''} onChange={handleChange} placeholder="e.g., Elder sister, 25, Software Engineer..."></textarea></div>
                    </fieldset>
                    <fieldset>
                        <legend>Education</legend>
                         <div className="piq-form-grid">
                            <div className="form-group"><label>10th Grade % & School</label><input type="text" name="edu_10" value={piqData.edu_10 || ''} onChange={handleChange} /></div>
                            <div className="form-group"><label>12th Grade % & School</label><input type="text" name="edu_12" value={piqData.edu_12 || ''} onChange={handleChange} /></div>
                            <div className="form-group"><label>Graduation Degree & %</label><input type="text" name="edu_grad" value={piqData.edu_grad || ''} onChange={handleChange} placeholder="e.g., B.Tech CSE, 75%" /></div>
                         </div>
                         <div className="form-group"><label>Academic Achievements</label><textarea name="achievements_academic" value={piqData.achievements_academic || ''} onChange={handleChange} placeholder="e.g., Topper in Maths Olympiad, Scholarship recipient..."></textarea></div>
                         <div className="form-group"><label>Favorite & Least Favorite Subjects</label><textarea name="subjects" value={piqData.subjects || ''} onChange={handleChange} placeholder="Why did you like/dislike them?"></textarea></div>
                    </fieldset>
                     <fieldset>
                        <legend>Hobbies, Sports & Responsibilities</legend>
                        <div className="form-group"><label>Your Hobbies & Interests</label><textarea name="hobbies" value={piqData.hobbies || ''} onChange={handleChange} placeholder="e.g., Playing guitar, reading sci-fi novels, trekking..."></textarea></div>
                        <div className="form-group"><label>Sports Played (Mention level of participation & achievements)</label><textarea name="sports" value={piqData.sports || ''} onChange={handleChange} placeholder="e.g., Football (Captain, University team), Chess (State level runner-up)"></textarea></div>
                        <div className="form-group"><label>Positions of Responsibility Held</label><textarea name="responsibility" value={piqData.responsibility || ''} onChange={handleChange} placeholder="e.g., School Captain, Event Coordinator in college fest, NCC Senior Under Officer"></textarea></div>
                    </fieldset>
                     <fieldset>
                        <legend>Previous Attempts</legend>
                        <div className="form-group"><label>Have you appeared for SSB before?</label><textarea name="previous_ssb" value={piqData.previous_ssb || ''} onChange={handleChange} placeholder="If yes, provide details: Board, Place, Batch No., Chest No., and Outcome (e.g., Screened Out, Conference Out)"></textarea></div>
                    </fieldset>
                    <button type="submit" className="btn btn-primary btn-block">Save PIQ</button>
                </form>
            </div>
        </div>
    )
};

const InterviewSimulator = ({ piqData, onComplete }) => {
    const [transcript, setTranscript] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const transcriptEndRef = useRef(null);

    useEffect(() => {
        const startInterview = async () => {
            const firstQuestion = await getNextInterviewQuestion(piqData, []);
            setTranscript([{ sender: 'AI', text: firstQuestion }]);
            setIsLoading(false);
        };
        startInterview();
    }, [piqData]);

     useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!userInput.trim() || isLoading) return;

        const newTranscript = [...transcript, { sender: 'User', text: userInput.trim() }];
        setTranscript(newTranscript);
        setUserInput('');
        setIsLoading(true);

        const nextQuestion = await getNextInterviewQuestion(piqData, newTranscript);
        setTranscript(prev => [...prev, { sender: 'AI', text: nextQuestion }]);
        setIsLoading(false);
    };
    
    return (
        <div>
             <div className="page-header">
                <h1>Personal Interview</h1>
                <button className="btn btn-danger" onClick={() => onComplete(transcript)}>Finish Interview</button>
            </div>
            <div className="card">
                <div className="interview-container">
                    <div className="interview-transcript">
                        {transcript.map((msg, index) => (
                            <div key={index} className={`chat-bubble ${msg.sender.toLowerCase()}`}>
                                {msg.text}
                            </div>
                        ))}
                        {isLoading && (
                            <div className="chat-bubble ai">
                                <div className="loading-spinner" style={{width: '20px', height: '20px', margin: 0}}></div>
                            </div>
                        )}
                        <div ref={transcriptEndRef} />
                    </div>
                    <form onSubmit={handleSubmit} className="interview-input-form">
                        <input 
                            type="text" 
                            value={userInput} 
                            onChange={e => setUserInput(e.target.value)} 
                            placeholder="Type your answer..." 
                            disabled={isLoading}
                            autoFocus
                        />
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>Send</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const InterviewPage = ({ user, onSavePiq, onStartInterview, onViewFeedback }) => {
     const hasPiq = user.piqData && Object.keys(user.piqData).length > 2; // Check for more than a couple of keys to ensure it's filled

    if (!hasPiq) {
        return <PIQForm onSave={onSavePiq} initialData={user.piqData}/>
    }

    return (
        <div>
            <div className="page-header">
                <h1>Interview Preparation</h1>
                <button className="btn btn-primary" onClick={onStartInterview}>Start New Interview</button>
            </div>
            <div className="card">
                <h3>Interview History</h3>
                 {user.testResults?.Interview && user.testResults.Interview.length > 0 ? (
                    <ul className="history-list">
                        {user.testResults.Interview.map((attempt, index) => (
                            <li key={index} className="history-item">
                                <div>
                                    <p className="date">{new Date(attempt.date).toLocaleDateString()}</p>
                                    <p className="score">OLQs: {attempt.feedback.olqs_demonstrated?.length || 0}</p>
                                </div>
                                <button className="btn btn-secondary" onClick={() => onViewFeedback(attempt.feedback)}>
                                    View Feedback
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="no-history">
                        <p>No interview attempts yet. Click "Start New Interview" to begin!</p>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- MAIN APP ---
const App = () => {
    const [currentUser, setCurrentUser] = useState(db.get('currentUser'));
    const [users, setUsers] = useState(db.get('users', []));
    const [view, setView] = useState('dashboard');
    const [viewedFeedback, setViewedFeedback] = useState(null);
    const [activeModal, setActiveModal] = useState(null);
    const [isInterviewing, setIsInterviewing] = useState(false);
    
    // Manageable content state
    const [tatImages, setTatImages] = useState(db.get('tat_images', TAT_IMAGES_DEFAULT));
    const [watWords, setWatWords] = useState(db.get('wat_words', WAT_WORDS_DEFAULT));
    const [srtScenarios, setSrtScenarios] = useState(db.get('srt_scenarios', SRT_SCENARIOS_DEFAULT));

    useEffect(() => { db.set('tat_images', tatImages); }, [tatImages]);
    useEffect(() => { db.set('wat_words', watWords); }, [watWords]);
    useEffect(() => { db.set('srt_scenarios', srtScenarios); }, [srtScenarios]);


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
            user = { name, testResults: {}, score: 0, piqData: {} };
        }
        setCurrentUser(user);
    };

    const handleLogout = () => {
        setCurrentUser(null);
    }
    
    const handleTestComplete = async (testType, responses) => {
        setView('dashboard');
        setViewedFeedback({ isLoading: true });
        
        const aiFeedback = await getAIAssessment(testType, {responses});
        setViewedFeedback(aiFeedback);

        setCurrentUser(prevUser => {
            const newTestResults = { ...prevUser.testResults };
            if (!newTestResults[testType]) {
                newTestResults[testType] = [];
            }
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
    
    const handleInterviewComplete = async (transcript) => {
        setIsInterviewing(false);
        setView('interview');
        if (transcript.length <= 1) return; // Ignore incomplete interviews

        setViewedFeedback({ isLoading: true });
        
        const aiFeedback = await getAIAssessment('Interview', { piqData: currentUser.piqData, transcript });
        setViewedFeedback(aiFeedback);

        setCurrentUser(prevUser => {
            const newTestResults = { ...prevUser.testResults };
            if (!newTestResults['Interview']) {
                newTestResults['Interview'] = [];
            }
            const score_gain = aiFeedback.olqs_demonstrated?.length * 10 || 0;
            
            const newAttempt = {
                transcript,
                feedback: aiFeedback,
                score: score_gain,
                date: new Date().toISOString()
            };
            
            newTestResults['Interview'].push(newAttempt);

            return { ...prevUser, testResults: newTestResults, score: (prevUser.score || 0) + score_gain };
        });
    };

    const handleSavePiq = (piqData) => {
        setCurrentUser(prev => ({...prev, piqData}));
    };
    
    const handleManage = (modalType, data = null) => {
        if (modalType === 'ViewFeedback') {
            setViewedFeedback(data);
        } else {
            setActiveModal(modalType);
        }
    };
    
    const handleContentChange = (type, action, value) => {
        const updaters = {
            'TAT': { add: (url) => setTatImages(p => [...p, url]), remove: (i) => setTatImages(p => p.filter((_, idx) => i !== idx)) },
            'WAT': { add: (word) => setWatWords(p => [...p, word]), remove: (i) => setWatWords(p => p.filter((_, idx) => i !== idx)) },
            'SRT': { add: (s) => setSrtScenarios(p => [...p, s]), remove: (i) => setSrtScenarios(p => p.filter((_, idx) => i !== idx)) },
        };
        updaters[type][action](value);
    };

    if (!currentUser) {
        return <LoginPage onLogin={handleLogin} />;
    }

    if(isInterviewing) {
        return <InterviewSimulator piqData={currentUser.piqData} onComplete={handleInterviewComplete}/>;
    }

    const renderView = () => {
        switch (view) {
            case 'dashboard': return <Dashboard user={currentUser} onManage={handleManage} onNavigate={setView}/>;
            case 'tat': return <TestRunner testType="TAT" data={tatImages} timeLimit={240} onComplete={(r) => handleTestComplete('TAT', r)} />;
            // FIX: Corrected typo `time-limit` to `timeLimit` for the WAT TestRunner component.
            case 'wat': return <TestRunner testType="WAT" data={watWords} timeLimit={15} onComplete={(r) => handleTestComplete('WAT', r)} />;
            case 'srt': return <TestRunner testType="SRT" data={srtScenarios} timeLimit={30} onComplete={(r) => handleTestComplete('SRT', r)} />;
            case 'sdt': return <SDTView onComplete={(r) => handleTestComplete('SDT', r)} />;
            case 'leaderboard': return <Leaderboard users={users}/>;
            case 'interview': return <InterviewPage user={currentUser} onSavePiq={handleSavePiq} onStartInterview={() => setIsInterviewing(true)} onViewFeedback={fb => setViewedFeedback(fb)} />;
            default: return <Dashboard user={currentUser} onManage={handleManage} onNavigate={setView}/>;
        }
    };

    return (
        <>
            <div className="app-layout">
                <aside className="sidebar">
                    <div className="sidebar-header">NOX SSB Prep</div>
                    <nav className="sidebar-nav">
                        <ul>
                            <li><a href="#" className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>Dashboard</a></li>
                            <li><a href="#" className={view === 'tat' ? 'active' : ''} onClick={() => setView('tat')}>TAT</a></li>
                            <li><a href="#" className={view === 'wat' ? 'active' : ''} onClick={() => setView('wat')}>WAT</a></li>
                            <li><a href="#" className={view === 'srt' ? 'active' : ''} onClick={() => setView('srt')}>SRT</a></li>
                            <li><a href="#" className={view === 'sdt' ? 'active' : ''} onClick={() => setView('sdt')}>SDT</a></li>
                             <li><a href="#" className={view === 'interview' ? 'active' : ''} onClick={() => setView('interview')}>Interview</a></li>
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
            
            {activeModal === 'TAT' && (
                <ManageTatModal 
                    images={tatImages}
                    onAdd={(url) => handleContentChange('TAT', 'add', url)}
                    onRemove={(index) => handleContentChange('TAT', 'remove', index)}
                    onClose={() => setActiveModal(null)}
                />
            )}
            {activeModal === 'WAT' && (
                <ManageWatModal 
                    words={watWords}
                    onAdd={(word) => handleContentChange('WAT', 'add', word)}
                    onRemove={(index) => handleContentChange('WAT', 'remove', index)}
                    onClose={() => setActiveModal(null)}
                />
            )}
            {activeModal === 'SRT' && (
                <ManageSrtModal 
                    scenarios={srtScenarios}
                    onAdd={(scenario) => handleContentChange('SRT', 'add', scenario)}
                    onRemove={(index) => handleContentChange('SRT', 'remove', index)}
                    onClose={() => setActiveModal(null)}
                />
            )}
        </>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
