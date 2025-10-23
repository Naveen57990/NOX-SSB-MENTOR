

import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob } from "@google/genai";
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

// --- DATA & CONFIG CONSTANTS ---
const TAT_IMAGES_DEFAULT = ["https://images.unsplash.com/photo-1504221507732-5246c0db29e7?q=80&w=1920&auto=format&fit=crop", "https://images.unsplash.com/photo-1542856334-a1b635e48358?q=80&w=1920&auto=format&fit=crop"];
const WAT_WORDS_DEFAULT = ['Duty', 'Courage', 'Team', 'Defeat', 'Lead', 'Responsibility', 'Friend', 'Failure', 'Order', 'Discipline'];
const SRT_SCENARIOS_DEFAULT = ['You are on your way to an important exam and you see an accident. You are the first person to arrive. What would you do?', 'During a group task, your team members are not cooperating. What would you do?'];
const SDT_PROMPTS = ["What do your parents think of you?", "What do your teachers/superiors think of you?", "What do your friends think of you?", "What do you think of yourself? (Your strengths and weaknesses)", "What kind of person would you like to become?"];
const BADGES = {
    first_step: { name: "First Step", desc: "Complete your very first test.", icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" },
    psych_initiate: { name: "Psych Initiate", desc: "Complete one of each psychological test (TAT, WAT, SRT, SDT).", icon: "https://cdn-icons-png.flaticon.com/512/1048/1048949.png" },
    consistent_cadet: { name: "Consistent Cadet", desc: "Practice for 3 days in a row.", icon: "https://cdn-icons-png.flaticon.com/512/2936/2936384.png" },
    story_weaver: { name: "Story Weaver", desc: "Complete 5 TAT tests.", icon: "https://cdn-icons-png.flaticon.com/512/3501/3501377.png" },
    word_warrior: { name: "Word Warrior", desc: "Complete 5 WAT tests.", icon: "https://cdn-icons-png.flaticon.com/512/1005/1005391.png" },
    interviewer_ace: { name: "Interviewer Ace", desc: "Complete your first AI voice interview.", icon: "https://cdn-icons-png.flaticon.com/512/10239/10239456.png" },
};

// --- AI INTEGRATION ---
const ai = new GoogleGenAI({ apiKey: API_KEY });

// FIX: Define a type for the AI assessment feedback to ensure type safety, resolving issues with accessing properties on 'unknown' types.
interface AIAssessmentFeedback {
    overall_summary?: string;
    olqs_demonstrated?: string[];
    strengths?: Array<{ point: string; example_olq: string; }>;
    weaknesses?: Array<{ point: string; example_olq: string; }>;
    detailed_olq_assessment?: Array<{ olq: string; assessment: string; }>;
    actionable_advice?: {
        what_to_practice: string[];
        how_to_improve: string[];
        what_to_avoid: string[];
    };
    error?: string;
}

const getAIAssessment = async (testType, data, persona = 'psychologist'): Promise<AIAssessmentFeedback> => {
    const olqs = "Effective Intelligence, Reasoning Ability, Organizing Ability, Power of Expression, Social Adaptability, Cooperation, Sense of Responsibility, Initiative, Self Confidence, Speed of Decision, Ability to Influence a Group, Liveliness, Determination, Courage, Stamina.";
    let content = "";
    if (testType === 'TAT') content = `Analyze this story from a Thematic Apperception Test. Evaluate structure, protagonist's traits, and overall theme.\n\nStory: "${data.responses[0]}"`;
    else if (testType === 'WAT') content = `Analyze these sentences from a Word Association Test. Evaluate positivity, maturity, and thought process.\n\nResponses:\n${data.responses.map(r => `${r.word}: ${r.sentence}`).join('\n')}`;
    else if (testType === 'SRT') content = `Analyze these reactions from a Situation Reaction Test. Evaluate problem-solving, decision-making, and emotional stability.\n\nReactions:\n${data.responses.map(r => `${r.situation}: ${r.reaction}`).join('\n')}`;
    else if (testType === 'SDT') content = `Analyze these Self-Description Test paragraphs. Summarize self-awareness, honesty, and personality. Identify key strengths and weaknesses.\n\n${data.responses.map((r, i) => `${SDT_PROMPTS[i]}\n${r}\n`).join('\n')}`;
    else if (testType === 'Interview') content = `Analyze this personal interview transcript, keeping the candidate's detailed PIQ data in mind. Evaluate for OLQs like self-confidence, power of expression, social adaptability, honesty, and determination. PIQ Data: ${JSON.stringify(data.piqData)}. Transcript: ${JSON.stringify(data.transcript)}.`;
    
    let personaPrompt = "Act as an expert SSB psychologist";
    if (persona === 'coach') personaPrompt = "Act as a strict but fair SSB coaching expert";
    if (persona === 'friend') personaPrompt = "Act as a supportive and encouraging friend who is also preparing for the SSB";

    const prompt = `${personaPrompt} providing detailed, structured feedback. Your analysis must be encouraging, constructive, and professional, referencing the 15 Officer-Like Qualities (OLQs): ${olqs}. ${content}. Your response must be a JSON object conforming to the provided schema. Analyze the candidate's responses holistically to provide: 1. An overall summary. 2. A list of OLQs clearly demonstrated (for scoring). 3. Specific strengths with related OLQs. 4. Specific weaknesses with related OLQs. 5. A detailed assessment for several key OLQs. 6. Highly specific, actionable advice broken down into what to practice, how to improve, and what to avoid.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: Type.OBJECT, properties: { overall_summary: { type: Type.STRING }, olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING } }, strengths: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } } } }, weaknesses: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } } } }, detailed_olq_assessment: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { olq: { type: Type.STRING }, assessment: { type: Type.STRING } } } }, actionable_advice: { type: Type.OBJECT, properties: { what_to_practice: { type: Type.ARRAY, items: { type: Type.STRING } }, how_to_improve: { type: Type.ARRAY, items: { type: Type.STRING } }, what_to_avoid: { type: Type.ARRAY, items: { type: Type.STRING } } } } }, required: ["overall_summary", "olqs_demonstrated", "strengths", "weaknesses", "detailed_olq_assessment", "actionable_advice"] }
            }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("AI feedback generation failed:", error);
        return { error: "Failed to get feedback. Please try again." };
    }
};

// --- FILE & AUDIO HELPERS ---
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});
const fileToTextArray = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(file);
    // FIX: Property 'split' does not exist on type 'string | ArrayBuffer'. Added type check to ensure reader.result is a string.
    reader.onload = () => {
        if (typeof reader.result === 'string') {
            resolve(reader.result.split('\n').map(line => line.trim()).filter(Boolean));
        } else {
            reject(new Error("File could not be read as text."));
        }
    };
    reader.onerror = error => reject(error);
});
function encode(bytes) { let binary = ''; const len = bytes.byteLength; for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); } return btoa(binary); }
function decode(base64) { const binaryString = atob(base64); const len = binaryString.length; const bytes = new Uint8Array(len); for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); } return bytes; }
async function decodeAudioData(data, ctx, sampleRate, numChannels) { const dataInt16 = new Int16Array(data.buffer); const frameCount = dataInt16.length / numChannels; const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate); for (let channel = 0; channel < numChannels; channel++) { const channelData = buffer.getChannelData(channel); for (let i = 0; i < frameCount; i++) { channelData[i] = dataInt16[i * numChannels + channel] / 32768.0; } } return buffer; }


// --- COMPONENTS ---
const LoginPage = ({ onLogin }) => {
    const [name, setName] = useState('');
    const [rollNumber, setRollNumber] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim() && rollNumber.trim()) {
            onLogin(name.trim(), rollNumber.trim());
        }
    };

    return (
        <div className="login-container">
            <div className="card login-card">
                <h1>NOX SSB Prep</h1>
                <p>Enter your details to begin your journey.</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="name">Full Name</label>
                        <input
                            type="text"
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="Enter your full name"
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="rollNumber">Roll Number</label>
                        <input
                            type="text"
                            id="rollNumber"
                            value={rollNumber}
                            onChange={(e) => setRollNumber(e.target.value)}
                            required
                            placeholder="Enter your assigned roll number"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary btn-block">
                        Enter Training Zone
                    </button>
                </form>
            </div>
        </div>
    );
};
// FIX: Implemented component to return JSX, resolving 'cannot be used as a JSX component' error.
const TestHistoryCard = ({ testType, results, onViewFeedback }: { testType: string; results: any[]; onViewFeedback: (feedback: any) => void; }) => {
    const latestResult = results && results.length > 0 ? results[results.length - 1] : null;
    return (
        <div className="card test-history-card">
            <h3>{testType}</h3>
            {latestResult ? (
                <>
                    <p>Last attempt: {new Date(latestResult.date).toLocaleDateString()}</p>
                    <p>Score: {latestResult.score}</p>
                    <button className="btn btn-secondary" onClick={() => onViewFeedback(latestResult.feedback)}>View Feedback</button>
                </>
            ) : (
                <p>No attempts yet.</p>
            )}
            <p>Total attempts: {results?.length || 0}</p>
        </div>
    );
};

const ManageTatModal = ({ images, onAdd, onAddMultiple, onRemove, onClose }) => {
    const [newImageUrl, setNewImageUrl] = useState('');
    const fileInputRef = useRef(null);
    const handleAddUrl = (e) => { e.preventDefault(); if (newImageUrl.trim()) { onAdd(newImageUrl.trim()); setNewImageUrl(''); } };
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) { try { const base64 = await fileToBase64(file); onAdd(base64); } catch (err) { console.error("Error reading file:", err); } }
    };
    return (
         <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Manage TAT Images</h2>
                <ul className="content-list">{images.map((img, index) => (<li key={index} className="content-list-item"><img src={img} alt={`TAT Image ${index + 1}`} className="image-preview" /><span className="item-text">{img.substring(0, 40)}...</span><button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button></li>))}</ul>
                <form className="add-item-form" onSubmit={handleAddUrl}><input type="text" value={newImageUrl} onChange={e => setNewImageUrl(e.target.value)} placeholder="Paste new image URL here" style={{flex: 1}}/><button type="submit" className="btn btn-primary">Add URL</button></form>
                <div className="upload-section"><h4>Or Upload an Image</h4><input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} /></div>
                <div className="text-center" style={{ marginTop: '2rem' }}><button onClick={onClose} className="btn btn-secondary">Close</button></div>
            </div>
        </div>
    );
};

const ManageContentModal = ({ title, items, onAdd, onAddMultiple, onRemove, onClose, type }) => {
    const [newItem, setNewItem] = useState('');
    const handleAddItem = (e) => { e.preventDefault(); if (newItem.trim()) { onAdd(newItem.trim()); setNewItem(''); } };
    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) { try { const contentArray = await fileToTextArray(file); onAddMultiple(contentArray); } catch (err) { console.error("Error reading file:", err); } }
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>{title}</h2>
                <ul className="content-list">{items.map((item, index) => (<li key={index} className="content-list-item"><span className="item-text" style={{whiteSpace: 'normal'}}>{item}</span><button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button></li>))}</ul>
                <form className="add-item-form" onSubmit={handleAddItem}>
                    {type === 'SRT' ? <textarea value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Enter new scenario" style={{flex: 1, minHeight: '60px'}}/> : <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Enter new word" style={{flex: 1}}/> }
                    <button type="submit" className="btn btn-primary">Add</button>
                </form>
                <div className="upload-section"><h4>Or Upload from .txt file</h4><p style={{fontSize: '0.8rem', color: 'var(--neutral-light)', textAlign: 'center', marginBottom: '8px'}}>Each new line will be treated as a separate item.</p><input type="file" accept=".txt" onChange={handleFileChange} /></div>
                <div className="text-center" style={{ marginTop: '2rem' }}><button onClick={onClose} className="btn btn-secondary">Close</button></div>
            </div>
        </div>
    );
};

// FIX: Added explicit prop types to resolve conflict with React's 'key' prop.
const Badge = ({ badgeId, unlocked }: { badgeId: string, unlocked: boolean }) => {
    const badge = BADGES[badgeId];
    return (
        <div className={`badge ${unlocked ? 'unlocked' : ''}`}>
            <img src={badge.icon} alt={badge.name} className="badge-icon" />
            <span className="badge-name">{badge.name}</span>
            <div className="badge-tooltip">{badge.desc}</div>
        </div>
    );
};

const Dashboard = ({ user, onManage, onNavigate, onPersonaChange }) => {
    return (
        <div>
            <div className="page-header">
                <h1>Welcome, {user.name}</h1>
                <div className="header-actions">
                     <div className="persona-selector"><label htmlFor="persona">AI Persona:</label><select id="persona" value={user.persona} onChange={(e) => onPersonaChange(e.target.value)}><option value="psychologist">Psychologist</option><option value="coach">Coach</option><option value="friend">Friend</option></select></div>
                </div>
            </div>
            <div className="dashboard-grid">
                <div className="card badges-section">
                    <h2>Achievements</h2>
                    <div className="badges-grid">
                        {Object.keys(BADGES).map(id => <Badge key={id} badgeId={id} unlocked={user.unlockedBadges?.includes(id)} />)}
                    </div>
                </div>
            </div>
            <div className="progress-grid" style={{marginTop: 'var(--spacing-lg)'}}>
                {['TAT', 'WAT', 'SRT', 'SDT', 'Interview'].map(test => <TestHistoryCard key={test} testType={test} results={user.testResults[test]} onViewFeedback={(feedback) => onManage('ViewFeedback', feedback)} />)}
            </div>
             <div className="page-header" style={{marginTop: 'var(--spacing-xl)', fontSize: '1.5rem', borderBottomWidth: '2px'}}>Admin Controls</div>
             <div className="header-actions">
                 <button className="btn btn-secondary" onClick={() => onManage('TAT')}>Manage TAT</button>
                 <button className="btn btn-secondary" onClick={() => onManage('WAT')}>Manage WAT</button>
                 <button className="btn btn-secondary" onClick={() => onManage('SRT')}>Manage SRT</button>
             </div>
        </div>
    );
};

// FIX: Implemented component to return JSX, resolving 'cannot be used as a JSX component' error.
const FeedbackModal = ({ feedback, onClose }) => {
    if (!feedback) return null;

    if (feedback.isLoading) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content">
                    <h2>Generating Feedback...</h2>
                    <p>Your AI assessment is being prepared. Please wait.</p>
                </div>
            </div>
        );
    }
    
    if (feedback.error) {
        return (
            <div className="modal-overlay" onClick={onClose}>
                <div className="modal-content">
                    <h2>Error</h2>
                    <p>{feedback.error}</p>
                    <button onClick={onClose} className="btn">Close</button>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content feedback-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>AI Feedback</h2>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    <h4>Overall Summary</h4>
                    <p>{feedback.overall_summary}</p>
                    
                    <h4>Strengths</h4>
                    <ul>{feedback.strengths?.map((s, i) => <li key={i}><strong>{s.point}</strong> ({s.example_olq})</li>)}</ul>
                    
                    <h4>Areas for Improvement</h4>
                    <ul>{feedback.weaknesses?.map((w, i) => <li key={i}><strong>{w.point}</strong> ({w.example_olq})</li>)}</ul>

                    <h4>Detailed OLQ Assessment</h4>
                    {feedback.detailed_olq_assessment?.map((item, i) => (
                        <div key={i}>
                            <h5>{item.olq}</h5>
                            <p>{item.assessment}</p>
                        </div>
                    ))}
                    
                    <h4>Actionable Advice</h4>
                    <h5>What to Practice:</h5>
                    <ul>{feedback.actionable_advice?.what_to_practice?.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    <h5>How to Improve:</h5>
                    <ul>{feedback.actionable_advice?.how_to_improve?.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    <h5>What to Avoid:</h5>
                    <ul>{feedback.actionable_advice?.what_to_avoid?.map((item, i) => <li key={i}>{item}</li>)}</ul>
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn">Close</button>
                </div>
            </div>
        </div>
    );
};
// FIX: Implemented component to return JSX, resolving 'cannot be used as a JSX component' error.
const TestRunner = ({ testType, data, timeLimit, onComplete }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState([]);
    const [currentResponse, setCurrentResponse] = useState('');
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const handleNext = useCallback(() => {
        let newResponse;
        if (testType === 'WAT') {
            newResponse = { word: data[currentIndex], sentence: currentResponse };
        } else if (testType === 'SRT') {
            newResponse = { situation: data[currentIndex], reaction: currentResponse };
        } else { // TAT
            newResponse = currentResponse;
        }

        const updatedResponses = [...responses, newResponse];
        setResponses(updatedResponses);
        setCurrentResponse('');

        if (currentIndex < data.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
            onComplete(updatedResponses);
        }
    }, [currentIndex, currentResponse, data, onComplete, responses, testType]);

    useEffect(() => {
        setTimeLeft(timeLimit);
        if (timerRef.current) clearInterval(timerRef.current);
        if (currentIndex >= data.length) return;

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    handleNext();
                    return timeLimit;
                }
                return prev - 1;
            });
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [currentIndex, data.length, handleNext, timeLimit]);

    const renderTestContent = () => {
        const item = data[currentIndex];
        switch(testType) {
            case 'TAT': return <img src={item} alt="TAT image" style={{maxWidth: '100%', maxHeight: '400px'}}/>;
            case 'WAT': return <h2>{item}</h2>;
            case 'SRT': return <p>{item}</p>;
            default: return null;
        }
    }

    const getResponsePlaceholder = () => {
        switch(testType) {
            case 'TAT': return "Write a story about this picture...";
            case 'WAT': return "Write a sentence using this word...";
            case 'SRT': return "Describe your reaction to this situation...";
            default: return "Your response...";
        }
    }

    return (
        <div>
            <h1>{testType} Test</h1>
            <p>Item {currentIndex + 1} of {data.length}</p>
            <div className="card">
                {renderTestContent()}
                <p>Time left: {timeLeft}s</p>
                <textarea
                    value={currentResponse}
                    onChange={(e) => setCurrentResponse(e.target.value)}
                    placeholder={getResponsePlaceholder()}
                    rows={testType === 'TAT' ? 10 : 5}
                    style={{width: '100%', marginTop: '1rem'}}
                />
                <button onClick={handleNext} className="btn btn-primary" style={{marginTop: '1rem'}}>
                    {currentIndex < data.length - 1 ? 'Next' : 'Finish Test'}
                </button>
            </div>
        </div>
    );
};
// FIX: Implemented component to return JSX, resolving 'cannot be used as a JSX component' error.
const SDTView = ({ onComplete }) => {
    const [responses, setResponses] = useState(Array(SDT_PROMPTS.length).fill(''));

    const handleResponseChange = (index, value) => {
        const newResponses = [...responses];
        newResponses[index] = value;
        setResponses(newResponses);
    };

    const handleSubmit = () => {
        if (responses.every(r => r.trim())) {
            onComplete(responses);
        } else {
            alert('Please answer all questions.');
        }
    };

    return (
        <div>
            <h1>Self-Description Test (SDT)</h1>
            <p>Answer the following questions honestly and thoughtfully.</p>
            <div className="card">
                {SDT_PROMPTS.map((prompt, index) => (
                    <div key={index} style={{marginBottom: '1.5rem'}}>
                        <label><strong>{prompt}</strong></label>
                        <textarea
                            value={responses[index]}
                            onChange={(e) => handleResponseChange(index, e.target.value)}
                            rows={5}
                            style={{width: '100%', marginTop: '0.5rem'}}
                            placeholder="Your description..."
                        />
                    </div>
                ))}
                <button onClick={handleSubmit} className="btn btn-primary">Submit Descriptions</button>
            </div>
        </div>
    );
};
const Leaderboard = ({ users }) => {
    const sortedUsers = useMemo(() => {
        return [...users].sort((a, b) => (b.score || 0) - (a.score || 0));
    }, [users]);

    return (
        <div>
            <div className="page-header">
                <h1>Leaderboard</h1>
            </div>
            <div className="card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th className="rank">Rank</th>
                            <th>Name</th>
                            <th>Roll Number</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedUsers.map((user, index) => (
                            <tr key={user.rollNumber || index}>
                                <td className="rank">{index + 1}</td>
                                <td>{user.name}</td>
                                <td>{user.rollNumber}</td>
                                <td>{user.score || 0}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
// FIX: Implemented component to return JSX, resolving 'cannot be used as a JSX component' error.
const PIQForm = ({ onSave, initialData }) => {
    const [formData, setFormData] = useState(initialData || {});

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
        alert('PIQ data saved!');
    };

    return (
        <form onSubmit={handleSubmit}>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                <input name="education" value={formData.education || ''} onChange={handleChange} placeholder="Education (e.g., B.Tech CSE)" />
                <input name="hobbies" value={formData.hobbies || ''} onChange={handleChange} placeholder="Hobbies & Interests" />
                <input name="sports" value={formData.sports || ''} onChange={handleChange} placeholder="Sports & Games Played" />
                <input name="achievements" value={formData.achievements || ''} onChange={handleChange} placeholder="Achievements" />
            </div>
            <button type="submit" className="btn" style={{marginTop: '1rem'}}>Save PIQ</button>
        </form>
    );
};

const VoiceInterviewSimulator = ({ piqData, onComplete }) => {
    const [transcript, setTranscript] = useState([]);
    const [status, setStatus] = useState('Connecting...');
    const [isRecording, setIsRecording] = useState(false);
    const transcriptEndRef = useRef(null);
    const sessionPromiseRef = useRef(null);
    const audioContextRef = useRef(null);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);

    const startInterview = useCallback(async () => {
        if (sessionPromiseRef.current) return;
        setStatus('Initializing...');
        
        // FIX: Cast window to 'any' to access vendor-prefixed webkitAudioContext.
        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const outputNode = outputAudioContext.createGain();
        const sources = new Set();
        let nextStartTime = 0;

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: async () => {
                    setStatus('Connected. Press Mic to start.');
                },
                onmessage: async (message) => {
                    if (message.serverContent?.inputTranscription) {
                        const text = message.serverContent.inputTranscription.text;
                        setTranscript(prev => {
                            const last = prev[prev.length - 1];
                            if (last?.sender === 'User') {
                                return [...prev.slice(0, -1), { ...last, text: last.text + text }];
                            }
                            return [...prev, { sender: 'User', text }];
                        });
                    }
                    if (message.serverContent?.outputTranscription) {
                        const text = message.serverContent.outputTranscription.text;
                        setTranscript(prev => {
                            const last = prev[prev.length - 1];
                            if (last?.sender === 'AI') {
                                return [...prev.slice(0, -1), { ...last, text: last.text + text }];
                            }
                            return [...prev, { sender: 'AI', text }];
                        });
                    }
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio) {
                        setStatus('AI Speaking...');
                        nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                        const source = outputAudioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNode);
                        source.addEventListener('ended', () => {
                            sources.delete(source);
                            if (sources.size === 0) setStatus('Your turn');
                        });
                        source.start(nextStartTime);
                        nextStartTime = nextStartTime + audioBuffer.duration;
                        sources.add(source);
                    }
                },
                onerror: (e) => { console.error('Live API Error:', e); setStatus('Error. Please refresh.'); },
                onclose: () => { setStatus('Session ended.'); },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: `You are an SSB Interviewing Officer conducting a personal interview. Use the candidate's PIQ data to ask relevant questions. Keep your questions concise and your tone professional. Start with a welcoming question. PIQ Data: ${JSON.stringify(piqData)}`,
            },
        });
    }, [piqData]);

    useEffect(() => {
        startInterview();
        return () => {
            sessionPromiseRef.current?.then(session => session.close());
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
        };
    }, [startInterview]);
    
    const toggleRecording = async () => {
        if (isRecording) {
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            setIsRecording(false);
            setStatus('Your turn');
            return;
        }

        try {
            setIsRecording(true);
            setStatus('Listening...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // FIX: Cast window to 'any' to access vendor-prefixed webkitAudioContext.
            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = inputAudioContext;
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const l = inputData.length; const int16 = new Int16Array(l);
                for (let i = 0; i < l; i++) { int16[i] = inputData[i] * 32768; }
                const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
                sessionPromiseRef.current.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
        } catch (err) {
            console.error("Mic error:", err);
            setStatus("Microphone access denied.");
            setIsRecording(false);
        }
    };
    
    const handleFinish = () => {
        sessionPromiseRef.current?.then(session => session.close());
        onComplete(transcript);
    };

    return (
        <div>
            <div className="page-header"><h1>Personal Interview</h1><button className="btn btn-danger" onClick={handleFinish}>Finish Interview</button></div>
            <div className="card">
                <div className="interview-container">
                    <div className="interview-transcript">
                        {transcript.map((msg, index) => (<div key={index} className={`chat-bubble ${msg.sender.toLowerCase()}`}>{msg.text}</div>))}
                        <div ref={transcriptEndRef} />
                    </div>
                    <div className="interview-controls">
                        <div className="interview-status">{status}</div>
                        <button onClick={toggleRecording} className={`mic-button ${isRecording ? 'active' : ''}`} disabled={status.startsWith('Connecting') || status.startsWith('Initializing')}>
                            <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg>
                        </button>
                        <div className="interview-status" style={{minWidth: '150px'}}/>
                    </div>
                </div>
            </div>
        </div>
    );
};

// FIX: Implemented component to return JSX, resolving 'cannot be used as a JSX component' error.
const InterviewPage = ({ user, onSavePiq, onStartInterview, onViewFeedback }) => {
    return (
        <div>
            <div className="page-header">
                <h1>AI Voice Interview</h1>
            </div>
            <div className="card">
                <h2>Step 1: Fill Your Personal Information Questionnaire (PIQ)</h2>
                <p>Your PIQ data helps the AI Interviewing Officer ask relevant questions. This information is confidential and used only for this interview simulation.</p>
                <PIQForm onSave={onSavePiq} initialData={user.piqData} />
            </div>

            <div className="card" style={{marginTop: '2rem'}}>
                <h2>Step 2: Start the Interview</h2>
                <p>When you're ready, click the button below to start your live voice interview with the AI. Make sure your microphone is enabled.</p>
                <button className="btn btn-primary" onClick={onStartInterview}>Start AI Interview</button>
            </div>

            <div className="card" style={{marginTop: '2rem'}}>
                <h2>Interview History</h2>
                {user.testResults?.Interview?.length > 0 ? (
                    <ul>
                        {user.testResults.Interview.map((item, index) => (
                            <li key={index}>
                                Interview on {new Date(item.date).toLocaleString()} - Score: {item.score}
                                <button onClick={() => onViewFeedback(item.feedback)} style={{marginLeft: '1rem'}}>View Feedback</button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p>No interview attempts recorded yet.</p>
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
    
    const [tatImages, setTatImages] = useState(db.get('tat_images', TAT_IMAGES_DEFAULT));
    const [watWords, setWatWords] = useState(db.get('wat_words', WAT_WORDS_DEFAULT));
    const [srtScenarios, setSrtScenarios] = useState(db.get('srt_scenarios', SRT_SCENARIOS_DEFAULT));

    useEffect(() => { db.set('tat_images', tatImages); }, [tatImages]);
    useEffect(() => { db.set('wat_words', watWords); }, [watWords]);
    useEffect(() => { db.set('srt_scenarios', srtScenarios); }, [srtScenarios]);

    const checkAndAwardBadges = (user) => {
        const testResults = user.testResults || {};
        let newBadges = [];
        
        // FIX: Add Array.isArray check to prevent error on 'length' property of 'unknown' type.
        if (Object.values(testResults).some(arr => Array.isArray(arr) && arr.length > 0)) newBadges.push('first_step');
        if (testResults.TAT?.length > 0 && testResults.WAT?.length > 0 && testResults.SRT?.length > 0 && testResults.SDT?.length > 0) newBadges.push('psych_initiate');
        if (testResults.TAT?.length >= 5) newBadges.push('story_weaver');
        if (testResults.WAT?.length >= 5) newBadges.push('word_warrior');
        if (testResults.Interview?.length >= 1) newBadges.push('interviewer_ace');
        // NOTE: 'consistent_cadet' requires tracking login dates, which is a more complex implementation.

        const allNewBadges = [...new Set([...(user.unlockedBadges || []), ...newBadges])];
        return {...user, unlockedBadges: allNewBadges };
    };

    useEffect(() => {
        db.set('currentUser', currentUser);
        if (currentUser) {
            setUsers(prevUsers => {
                const userExists = prevUsers.some(u => u.rollNumber === currentUser.rollNumber);
                if (userExists) return prevUsers.map(u => u.rollNumber === currentUser.rollNumber ? currentUser : u);
                return [...prevUsers, currentUser];
            });
        }
    }, [currentUser]);

    useEffect(() => { db.set('users', users); }, [users]);

    const handleLogin = (name, rollNumber) => {
        let user = users.find(u => u.rollNumber === rollNumber);
        if (!user) {
            user = { name, rollNumber, testResults: {}, score: 0, piqData: {}, persona: 'psychologist', unlockedBadges: [] };
        } else {
            user.name = name; // Update name in case it's different
        }
        setCurrentUser(user);
    };

    const handleLogout = () => setCurrentUser(null);
    
    const handleTestComplete = async (testType, responses) => {
        setView('dashboard');
        setViewedFeedback({ isLoading: true });
        
        const aiFeedback = await getAIAssessment(testType, {responses}, currentUser.persona);
        setViewedFeedback(aiFeedback);

        setCurrentUser(prevUser => {
            const newTestResults = { ...prevUser.testResults };
            if (!newTestResults[testType]) newTestResults[testType] = [];
            const score_gain = aiFeedback.olqs_demonstrated?.length * 10 || 0;
            newTestResults[testType].push({ responses, feedback: aiFeedback, score: score_gain, date: new Date().toISOString() });
            const userWithNewScore = { ...prevUser, testResults: newTestResults, score: (prevUser.score || 0) + score_gain };
            return checkAndAwardBadges(userWithNewScore);
        });
    };
    
    const handleInterviewComplete = async (transcript) => {
        setIsInterviewing(false);
        setView('interview');
        if (transcript.length <= 1) return;

        setViewedFeedback({ isLoading: true });
        const aiFeedback = await getAIAssessment('Interview', { piqData: currentUser.piqData, transcript }, currentUser.persona);
        setViewedFeedback(aiFeedback);

        setCurrentUser(prevUser => {
            const newTestResults = { ...prevUser.testResults };
            if (!newTestResults['Interview']) newTestResults['Interview'] = [];
            const score_gain = aiFeedback.olqs_demonstrated?.length * 10 || 0;
            newTestResults['Interview'].push({ transcript, feedback: aiFeedback, score: score_gain, date: new Date().toISOString() });
            const userWithNewScore = { ...prevUser, testResults: newTestResults, score: (prevUser.score || 0) + score_gain };
            return checkAndAwardBadges(userWithNewScore);
        });
    };

    const handleSavePiq = (piqData) => setCurrentUser(prev => ({...prev, piqData}));
    const handlePersonaChange = (persona) => setCurrentUser(prev => ({...prev, persona}));
    const handleManage = (modalType, data = null) => { if (modalType === 'ViewFeedback') setViewedFeedback(data); else setActiveModal(modalType); };
    
    const handleContentChange = (type, action, value) => {
        const updaters = {
            'TAT': { add: (url) => setTatImages(p => [...p, url]), addMultiple: (urls) => setTatImages(p => [...p, ...urls]), remove: (i) => setTatImages(p => p.filter((_, idx) => i !== idx)) },
            'WAT': { add: (word) => setWatWords(p => [...p, word]), addMultiple: (words) => setWatWords(p => [...p, ...words]), remove: (i) => setWatWords(p => p.filter((_, idx) => i !== idx)) },
            'SRT': { add: (s) => setSrtScenarios(p => [...p, s]), addMultiple: (scenarios) => setSrtScenarios(p => [...p, ...scenarios]), remove: (i) => setSrtScenarios(p => p.filter((_, idx) => i !== idx)) },
        };
        updaters[type][action](value);
    };

    if (!currentUser) return <LoginPage onLogin={handleLogin} />;
    if (isInterviewing) return <VoiceInterviewSimulator piqData={currentUser.piqData} onComplete={handleInterviewComplete}/>;

    const renderView = () => {
        switch (view) {
            case 'dashboard': return <Dashboard user={currentUser} onManage={handleManage} onNavigate={setView} onPersonaChange={handlePersonaChange}/>;
            case 'tat': return <TestRunner testType="TAT" data={tatImages} timeLimit={240} onComplete={(r) => handleTestComplete('TAT', r)} />;
            case 'wat': return <TestRunner testType="WAT" data={watWords} timeLimit={15} onComplete={(r) => handleTestComplete('WAT', r)} />;
            case 'srt': return <TestRunner testType="SRT" data={srtScenarios} timeLimit={30} onComplete={(r) => handleTestComplete('SRT', r)} />;
            case 'sdt': return <SDTView onComplete={(r) => handleTestComplete('SDT', r)} />;
            case 'leaderboard': return <Leaderboard users={users}/>;
            case 'interview': return <InterviewPage user={currentUser} onSavePiq={handleSavePiq} onStartInterview={() => setIsInterviewing(true)} onViewFeedback={fb => setViewedFeedback(fb)} />;
            default: return <Dashboard user={currentUser} onManage={handleManage} onNavigate={setView} onPersonaChange={handlePersonaChange}/>;
        }
    };

    return (
        <>
            <div className="app-layout">
                <aside className="sidebar"><div className="sidebar-header">NOX SSB Prep</div><nav className="sidebar-nav"><ul>{['dashboard', 'tat', 'wat', 'srt', 'sdt', 'interview', 'leaderboard'].map(v => <li key={v}><a href="#" className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</a></li>)}</ul></nav><div className="sidebar-footer"><p>Logged in as: <strong>{currentUser.name}</strong><br/>({currentUser.rollNumber})</p><button onClick={handleLogout}>Logout</button></div></aside>
                <main className="main-content">{renderView()}</main>
            </div>
            <FeedbackModal feedback={viewedFeedback} onClose={() => setViewedFeedback(null)} />
            {activeModal === 'TAT' && <ManageTatModal images={tatImages} onAdd={(url) => handleContentChange('TAT', 'add', url)} onAddMultiple={(urls) => handleContentChange('TAT', 'addMultiple', urls)} onRemove={(index) => handleContentChange('TAT', 'remove', index)} onClose={() => setActiveModal(null)} />}
            {activeModal === 'WAT' && <ManageContentModal title="Manage WAT Words" items={watWords} onAdd={(word) => handleContentChange('WAT', 'add', word)} onAddMultiple={(words) => handleContentChange('WAT', 'addMultiple', words)} onRemove={(index) => handleContentChange('WAT', 'remove', index)} onClose={() => setActiveModal(null)} type="WAT" />}
            {activeModal === 'SRT' && <ManageContentModal title="Manage SRT Scenarios" items={srtScenarios} onAdd={(scenario) => handleContentChange('SRT', 'add', scenario)} onAddMultiple={(scenarios) => handleContentChange('SRT', 'addMultiple', scenarios)} onRemove={(index) => handleContentChange('SRT', 'remove', index)} onClose={() => setActiveModal(null)} type="SRT" />}
        </>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
