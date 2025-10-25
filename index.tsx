
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
const LECTURERETTE_TOPICS_DEFAULT = ['My Favourite Hobby', 'The Importance of Discipline in Life', 'India in 2047', 'Artificial Intelligence: A Boon or a Bane?', 'My Role Model'];
const SDT_PROMPTS = ["What do your parents think of you?", "What do your teachers/superiors think of you?", "What do your friends think of you?", "What do you think of yourself? (Your strengths and weaknesses)", "What kind of person would you like to become?"];
const OIR_QUESTIONS_DEFAULT = [
    { type: 'verbal', question: 'Which number should come next in the series? 1, 4, 9, 16, ?', options: ['20', '25', '30', '36'], answer: 1 },
    { type: 'verbal', question: 'DEF is to ABC as LMN is to ?', options: ['IJK', 'HIJ', 'OPQ', 'GHI'], answer: 0 },
    // NOTE: In a real app, these image URLs would be hosted properly. Using placeholders.
    { type: 'non-verbal', question: 'https://i.imgur.com/rGfAP83.png', options: ['https://i.imgur.com/8F2jQqg.png', 'https://i.imgur.com/L1n7Q3f.png', 'https://i.imgur.com/6XkY3Zf.png', 'https://i.imgur.com/P2tY7Xw.png'], answer: 2 },
    { type: 'verbal', question: 'If FRIEND is coded as HUMJTK, how is CANDLE written in that code?', options: ['EDRIRL', 'DCORHT', 'ESJFTM', 'DEQJQM'], answer: 0 },
];
const GPE_SCENARIOS_DEFAULT = [{
    title: "Flood Rescue Mission",
    mapImage: "https://i.imgur.com/kYqE1wS.png", // Placeholder map
    problemStatement: "You are a group of 8 college students on a hiking trip near the village of Rampur. A sudden cloudburst has caused flash floods. You are at point A. The bridge connecting Rampur to the main road has been washed away. You overhear on a villager's radio that a rescue team will arrive in 3 hours. You have the following information:\n- A group of 15 villagers, including elderly and children, are stranded at the village temple (Point B), which is on higher ground but isolated.\n- Two injured hikers are trapped in a cave at Point C, needing immediate first aid.\n- The local dispensary at Point D has a first aid box but the doctor is out of town.\n- A partially damaged boat is available at Point E.\nYou have a small first aid kit, a rope, and mobile phones with low battery. Your task is to make a plan to ensure the safety of everyone until the rescue team arrives."
}];

const OLQ_LIST = ["Effective Intelligence", "Reasoning Ability", "Organizing Ability", "Power of Expression", "Social Adaptability", "Cooperation", "Sense of Responsibility", "Initiative", "Self Confidence", "Speed of Decision", "Ability to Influence a Group", "Liveliness", "Determination", "Courage", "Stamina"];

const BADGES = {
    first_step: { name: "First Step", desc: "Complete your very first test.", icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" },
    psych_initiate: { name: "Psych Initiate", desc: "Complete one of each psychological test (TAT, WAT, SRT, SDT).", icon: "https://cdn-icons-png.flaticon.com/512/1048/1048949.png" },
    consistent_cadet: { name: "Consistent Cadet", desc: "Practice for 3 days in a row.", icon: "https://cdn-icons-png.flaticon.com/512/2936/2936384.png" },
    story_weaver: { name: "Story Weaver", desc: "Complete 5 TAT tests.", icon: "https://cdn-icons-png.flaticon.com/512/3501/3501377.png" },
    word_warrior: { name: "Word Warrior", desc: "Complete 5 WAT tests.", icon: "https://cdn-icons-png.flaticon.com/512/1005/1005391.png" },
    orator_apprentice: { name: "Orator Apprentice", desc: "Complete your first Lecturerette.", icon: "https://cdn-icons-png.flaticon.com/512/3062/3062531.png" },
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
    content_feedback?: string;
    delivery_feedback?: string;
    actionable_advice?: {
        what_to_practice: string[];
        how_to_improve: string[];
        what_to_avoid: string[];
    };
    error?: string;
}

const getAIAssessment = async (testType, data, persona = 'psychologist'): Promise<AIAssessmentFeedback> => {
    const olqs = OLQ_LIST.join(', ');
    let content = "";
    let modelConfig: any = { responseMimeType: "application/json" };

    if (testType === 'TAT') content = `Analyze this story from a Thematic Apperception Test. Evaluate structure, protagonist's traits, and overall theme.\n\nStory: "${data.responses[0]}"`;
    else if (testType === 'WAT') content = `Analyze these sentences from a Word Association Test. Evaluate positivity, maturity, and thought process.\n\nResponses:\n${data.responses.map(r => `${r.word}: ${r.sentence}`).join('\n')}`;
    else if (testType === 'SRT') content = `Analyze these reactions from a Situation Reaction Test. Evaluate problem-solving, decision-making, and emotional stability.\n\nReactions:\n${data.responses.map(r => `${r.situation}: ${r.reaction}`).join('\n')}`;
    else if (testType === 'SDT') content = `Analyze these Self-Description Test paragraphs. Summarize self-awareness, honesty, and personality. Identify key strengths and weaknesses.\n\n${data.responses.map((r, i) => `${SDT_PROMPTS[i]}\n${r}\n`).join('\n')}`;
    else if (testType === 'Interview') content = `Analyze this personal interview transcript, keeping the candidate's detailed PIQ data in mind. Evaluate for OLQs like self-confidence, power of expression, social adaptability, honesty, and determination. PIQ Data: ${JSON.stringify(data.piqData)}. Transcript: ${JSON.stringify(data.transcript)}.`;
    else if (testType === 'Lecturerette') content = `Analyze this 3-minute lecturerette speech transcript. Evaluate the content for structure, relevance, and depth. Assess the delivery by inferring voice modulation, fluency, and confidence from the text. Identify key OLQs like Power of Expression, Self Confidence, and Effective Intelligence. Transcript: "${data.transcript}".`;
    else if (testType === 'GPE') content = `Analyze this Group Planning Exercise (GPE) solution. Evaluate the plan based on prioritization of tasks, utilization of resources, time management, logical structure, and identification of the core problem. Assess for OLQs like Organizing Ability, Reasoning Ability, Speed of Decision, and Initiative.\n\nProblem: ${JSON.stringify(data.scenario)}\n\nCandidate's Plan: "${data.plan}"`;
    
    let personaPrompt = "Act as an expert SSB psychologist";
    if (persona === 'coach') personaPrompt = "Act as a strict but fair SSB coaching expert";
    if (persona === 'friend') personaPrompt = "Act as a supportive and encouraging friend who is also preparing for the SSB";
    
    let baseSchema = { type: Type.OBJECT, properties: { overall_summary: { type: Type.STRING }, olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING } }, strengths: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } } } }, weaknesses: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } } } }, actionable_advice: { type: Type.OBJECT, properties: { what_to_practice: { type: Type.ARRAY, items: { type: Type.STRING } }, how_to_improve: { type: Type.ARRAY, items: { type: Type.STRING } }, what_to_avoid: { type: Type.ARRAY, items: { type: Type.STRING } } } } } };
    
    if(testType === 'Lecturerette') {
        modelConfig.responseSchema = { ...baseSchema, properties: { ...baseSchema.properties, content_feedback: { type: Type.STRING }, delivery_feedback: { type: Type.STRING }, }, required: ["overall_summary", "olqs_demonstrated", "strengths", "weaknesses", "actionable_advice", "content_feedback", "delivery_feedback"] };
    } else {
        modelConfig.responseSchema = { ...baseSchema, properties: { ...baseSchema.properties, detailed_olq_assessment: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { olq: { type: Type.STRING }, assessment: { type: Type.STRING } } } } }, required: ["overall_summary", "olqs_demonstrated", "strengths", "weaknesses", "detailed_olq_assessment", "actionable_advice"] };
    }

    const prompt = `${personaPrompt} providing detailed, structured feedback. Your analysis must be encouraging, constructive, and professional, referencing the 15 Officer-Like Qualities (OLQs): ${olqs}. ${content}. Your response must be a JSON object conforming to the provided schema. Analyze the candidate's responses holistically.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: modelConfig
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
// FIX: Changed component to use React.FC to handle the `key` prop correctly and updated `onViewFeedback` to accept a function returning `any` to match the inferred type at the call site.
const TestHistoryCard: React.FC<{ testType: string; results: any[]; onViewFeedback: (feedback: any) => any; }> = ({ testType, results, onViewFeedback }) => {
    const latestResult = results && results.length > 0 ? results[results.length - 1] : null;
    return (
        <div className="card test-history-card">
            <h3>{testType}</h3>
            {latestResult ? (
                <>
                    <p>Last attempt: {new Date(latestResult.date).toLocaleDateString()}</p>
                    <p>Score: {latestResult.score}</p>
                    {latestResult.feedback && <button className="btn btn-secondary" onClick={() => onViewFeedback(latestResult.feedback)}>View Feedback</button>}
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
                    {type === 'SRT' ? <textarea value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Enter new scenario" style={{flex: 1, minHeight: '60px'}}/> : <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Enter new word/topic" style={{flex: 1}}/> }
                    <button type="submit" className="btn btn-primary">Add</button>
                </form>
                <div className="upload-section"><h4>Or Upload from .txt file</h4><p style={{fontSize: '0.8rem', color: 'var(--neutral-light)', textAlign: 'center', marginBottom: '8px'}}>Each new line will be treated as a separate item.</p><input type="file" accept=".txt" onChange={handleFileChange} /></div>
                <div className="text-center" style={{ marginTop: '2rem' }}><button onClick={onClose} className="btn btn-secondary">Close</button></div>
            </div>
        </div>
    );
};

// FIX: Added explicit prop types to resolve conflict with React's 'key' prop.
// FIX: Changed component to use React.FC to ensure the `key` prop is handled correctly.
const Badge: React.FC<{ badgeId: string, unlocked: boolean }> = ({ badgeId, unlocked }) => {
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
                <div className="card" onClick={() => onNavigate('olq dashboard')} style={{cursor: 'pointer'}}>
                    <h2>View Detailed OLQ Dashboard</h2>
                    <p>Get a comprehensive analysis of your Officer-Like Qualities based on your performance.</p>
                </div>
                <div className="card badges-section">
                    <h2>Achievements</h2>
                    <div className="badges-grid">
                        {Object.keys(BADGES).map(id => <Badge key={id} badgeId={id} unlocked={user.unlockedBadges?.includes(id)} />)}
                    </div>
                </div>
            </div>
            <div className="progress-grid" style={{marginTop: 'var(--spacing-lg)'}}>
                {['TAT', 'WAT', 'SRT', 'SDT', 'OIR', 'GPE', 'Lecturerette', 'Interview'].map(test => <TestHistoryCard key={test} testType={test} results={user.testResults[test]} onViewFeedback={(feedback) => onManage('ViewFeedback', feedback)} />)}
            </div>
             <div className="page-header" style={{marginTop: 'var(--spacing-xl)', fontSize: '1.5rem', borderBottomWidth: '2px'}}>Admin Controls</div>
             <div className="header-actions" style={{flexWrap: 'wrap'}}>
                 <button className="btn btn-secondary" onClick={() => onManage('TAT')}>Manage TAT</button>
                 <button className="btn btn-secondary" onClick={() => onManage('WAT')}>Manage WAT</button>
                 <button className="btn btn-secondary" onClick={() => onManage('SRT')}>Manage SRT</button>
                 <button className="btn btn-secondary" onClick={() => onManage('Lecturerette')}>Manage Lecturerette</button>
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

                    {feedback.content_feedback && <><h4>Content Feedback</h4><p>{feedback.content_feedback}</p></>}
                    {feedback.delivery_feedback && <><h4>Delivery Feedback</h4><p>{feedback.delivery_feedback}</p></>}
                    
                    <h4>Strengths</h4>
                    <ul>{feedback.strengths?.map((s, i) => <li key={i}><strong>{s.point}</strong> ({s.example_olq})</li>)}</ul>
                    
                    <h4>Areas for Improvement</h4>
                    <ul>{feedback.weaknesses?.map((w, i) => <li key={i}><strong>{w.point}</strong> ({w.example_olq})</li>)}</ul>

                    {feedback.detailed_olq_assessment && <>
                        <h4>Detailed OLQ Assessment</h4>
                        {feedback.detailed_olq_assessment?.map((item, i) => (
                            <div key={i}>
                                <h5>{item.olq}</h5>
                                <p>{item.assessment}</p>
                            </div>
                        ))}
                    </>}
                    
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
    // FIX: Changed NodeJS.Timeout to number for browser compatibility.
    const timerRef = useRef<number | null>(null);

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

const CaptainNox = ({ user, calculateOLQScores }) => {
    const [messages, setMessages] = useState([{ sender: 'AI', text: `Welcome, ${user.name}. I am Captain Nox, your personal mentor. I have reviewed your performance data. How can I help you prepare today? You can also ask me to generate a dynamic training plan for you.` }]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const chatEndRef = useRef(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSendMessage = async (e, customPrompt = '') => {
        if(e) e.preventDefault();
        const userInput = customPrompt || input;
        if (!userInput.trim() || isLoading) return;

        const userMessage = { sender: 'User', text: userInput };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const prompt = `You are Captain Nox, a wise and experienced retired military officer mentoring an SSB aspirant. Your tone is encouraging but direct. You have access to the aspirant's full performance record. Use this data to provide insightful, personalized advice. Do not just list the data; interpret it to answer their questions. Here is the cadet's data: ${JSON.stringify(user)}. The conversation so far: ${JSON.stringify(messages)}. Now, answer the cadet's latest message: "${userInput}".`;
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: prompt,
            });
            const aiMessage = { sender: 'AI', text: response.text };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error("Captain Nox API error:", error);
            const errorMessage = { sender: 'AI', text: "I'm sorry, I encountered an error. Please try asking again." };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const generatePlan = () => {
        const olqScores = calculateOLQScores(user);
        const weakestOlqs = Object.entries(olqScores).sort(([,a],[,b]) => a-b).slice(0, 3).map(([name]) => name);
        const planPrompt = `Based on my performance data and my weakest OLQs (${weakestOlqs.join(', ')}), generate a personalized 7-day training plan for me. Suggest specific tests in the app and other offline activities.`;
        handleSendMessage(null, planPrompt);
    };

    return (
        <div>
            <div className="page-header"><h1>Captain Nox</h1><p style={{fontSize: '1rem', color: 'var(--neutral-light)', alignSelf: 'flex-end', marginBottom: '8px'}}>Your Personal AI Mentor</p></div>
            <div className="card">
                <div className="interview-container">
                    <div className="interview-transcript">
                        {messages.map((msg, index) => (<div key={index} className={`chat-bubble ${msg.sender.toLowerCase()}`}>{msg.text}</div>))}
                        {isLoading && <div className="chat-bubble ai">Thinking...</div>}
                        <div ref={chatEndRef} />
                    </div>
                     <div style={{padding: 'var(--spacing-md) 0'}}>
                        <button onClick={generatePlan} className="btn btn-secondary" disabled={isLoading}>Generate My Weekly Plan</button>
                    </div>
                    <form onSubmit={handleSendMessage} className="chat-input-form">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask Captain Nox anything..."
                            disabled={isLoading}
                        />
                        <button type="submit" className="btn btn-primary" disabled={isLoading}>Send</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

const LectureretteView = ({ topics, onComplete }) => {
    const [stage, setStage] = useState('idle'); // idle, preparing, speaking
    const [topic, setTopic] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');

    // FIX: Changed NodeJS.Timeout to number for browser compatibility.
    const timerRef = useRef<number | null>(null);
    const sessionPromiseRef = useRef(null);
    const audioContextRef = useRef(null);

    const pickTopic = () => {
        const randomTopic = topics[Math.floor(Math.random() * topics.length)];
        setTopic(randomTopic);
        setTimeLeft(120); // 2 minutes preparation
        setStage('preparing');
    };
    
    const startSpeaking = () => {
        setTimeLeft(180); // 3 minutes speaking
        setStage('speaking');
        toggleRecording(true); // Start recording immediately
    };
    
    const finishTest = useCallback(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (isRecording) toggleRecording(false);
        setStage('analyzing');
        onComplete(transcript);
    }, [transcript, onComplete, isRecording]);

    useEffect(() => {
        if (timeLeft > 0 && (stage === 'preparing' || stage === 'speaking')) {
            timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0 && stage === 'preparing') {
            startSpeaking();
        } else if (timeLeft === 0 && stage === 'speaking') {
            finishTest();
        }
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [timeLeft, stage, finishTest]);

    const toggleRecording = async (start) => {
        if (!start) {
            sessionPromiseRef.current?.then(session => session.close());
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            setIsRecording(false);
            return;
        }

        setIsRecording(true);
        try {
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: async () => {
                        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
                        audioContextRef.current = inputAudioContext;
                        const source = inputAudioContext.createMediaStreamSource(stream);
                        const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                        scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = { data: encode(new Uint8Array(new Int16Array(inputData.map(f => f * 32768)).buffer)), mimeType: 'audio/pcm;rate=16000' };
                            sessionPromiseRef.current?.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContext.destination);
                    },
                    onmessage: async (message) => {
                        if (message.serverContent?.inputTranscription) {
                            setTranscript(prev => prev + message.serverContent.inputTranscription.text);
                        }
                    },
                    onerror: (e) => { console.error('Live API Error:', e); },
                    onclose: () => {},
                },
                config: { inputAudioTranscription: {} },
            });
        } catch (err) {
            console.error("Mic error:", err);
            setIsRecording(false);
        }
    };
    
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

    return (
        <div>
            <div className="page-header"><h1>Lecturerette</h1></div>
            {stage === 'idle' && (
                <div className="card text-center">
                    <h2>Instructions</h2>
                    <p style={{maxWidth: '600px', margin: '1rem auto'}}>You will be given a random topic. You will have 2 minutes to prepare, followed by 3 minutes to speak on the topic. Your speech will be recorded and analyzed by AI.</p>
                    <button onClick={pickTopic} className="btn btn-primary" style={{marginTop: '1rem'}}>Get Topic</button>
                </div>
            )}
            {stage === 'preparing' && (
                <div className="card text-center">
                    <h2>Prepare Your Topic</h2>
                    <p style={{fontSize: '1.5rem', margin: '1rem 0', color: 'var(--accent-color)'}}><strong>{topic}</strong></p>
                    <div className="timer">{formatTime(timeLeft)}</div>
                    <p>Use this time to structure your thoughts.</p>
                </div>
            )}
            {stage === 'speaking' && (
                 <div className="card text-center">
                    <h2>Speak on: <span style={{color: 'var(--accent-color)'}}>{topic}</span></h2>
                    <div className="timer">{formatTime(timeLeft)}</div>
                    <button className={`mic-button ${isRecording ? 'active' : ''}`} disabled>
                        <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"></path></svg>
                    </button>
                    <p style={{marginTop: '1rem'}}>Recording in progress...</p>
                    <button onClick={finishTest} className="btn btn-danger" style={{marginTop: '1rem'}}>Finish Early</button>
                </div>
            )}
            {stage === 'analyzing' && (
                <div className="card text-center">
                    <h2>Analyzing your speech...</h2>
                    <div className="loading-spinner"></div>
                    <p>Please wait while AI generates your feedback.</p>
                </div>
            )}
        </div>
    );
};

// --- NEW COMPONENTS ---
const OIRTestRunner = ({ questions, onComplete }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [selectedOption, setSelectedOption] = useState(null);
    const [timeLeft, setTimeLeft] = useState(30 * 60);
    const [stage, setStage] = useState('instructions'); // instructions, running, results

    useEffect(() => {
        if (stage !== 'running') return;
        const timer = setTimeout(() => {
            if (timeLeft > 0) setTimeLeft(t => t - 1);
            else handleFinish();
        }, 1000);
        return () => clearTimeout(timer);
    }, [timeLeft, stage]);

    const handleNext = () => {
        const newAnswers = {...answers, [currentIndex]: selectedOption};
        setAnswers(newAnswers);
        setSelectedOption(answers[currentIndex + 1] ?? null);
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(i => i + 1);
        }
    };

    const handlePrev = () => {
        const newAnswers = {...answers, [currentIndex]: selectedOption};
        setAnswers(newAnswers);
        setSelectedOption(answers[currentIndex - 1] ?? null);
        if (currentIndex > 0) {
            setCurrentIndex(i => i - 1);
        }
    };

    const handleFinish = () => {
        const finalAnswers = {...answers, [currentIndex]: selectedOption};
        setAnswers(finalAnswers);
        let score = 0;
        for (let i = 0; i < questions.length; i++) {
            if (finalAnswers[i] === questions[i].answer) {
                score++;
            }
        }
        onComplete(score, finalAnswers);
        setStage('results');
    };
    
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    const currentQuestion = questions[currentIndex];

    if (stage === 'instructions') {
        return <div className="card text-center">
            <h2>Officer Intelligence Rating (OIR) Test Instructions</h2>
            <p style={{maxWidth: '600px', margin: '1rem auto'}}>You will have {questions.length} questions to answer in 30 minutes. The test contains both verbal and non-verbal reasoning questions. Click "Start Test" when you are ready.</p>
            <button onClick={() => setStage('running')} className="btn btn-primary">Start Test</button>
        </div>
    }

    return (
        <div>
            <div className="page-header">
                <h1>OIR Test</h1>
                <div className="timer">{formatTime(timeLeft)}</div>
            </div>
            <div className="card">
                <p>Question {currentIndex + 1} of {questions.length}</p>
                <div className="oir-question-container">
                    <h4>{currentQuestion.type === 'verbal' ? currentQuestion.question : <img src={currentQuestion.question} alt="Non-verbal question"/>}</h4>
                </div>
                <div className="oir-options">
                    {currentQuestion.options.map((option, index) => (
                        <label key={index} className={`oir-option ${selectedOption === index ? 'selected' : ''}`}>
                            <input type="radio" name="option" value={index} checked={selectedOption === index} onChange={() => setSelectedOption(index)} />
                             {currentQuestion.type === 'verbal' ? option : <img src={option} alt={`Option ${index+1}`} />}
                        </label>
                    ))}
                </div>
                <div className="oir-controls">
                    <button onClick={handlePrev} className="btn btn-secondary" disabled={currentIndex === 0}>Previous</button>
                    {currentIndex < questions.length - 1 
                        ? <button onClick={handleNext} className="btn btn-primary">Next</button>
                        : <button onClick={handleFinish} className="btn btn-danger">Finish Test</button>
                    }
                </div>
            </div>
        </div>
    );
};

const GPEView = ({ scenario, onComplete }) => {
    const [plan, setPlan] = useState('');
    const [timeLeft, setTimeLeft] = useState(10 * 60);
    const timerRef = useRef(null);

    const handleSubmit = () => {
        if(timerRef.current) clearInterval(timerRef.current);
        onComplete(plan);
    };

    useEffect(() => {
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    handleSubmit();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timerRef.current);
    }, []);
    
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    
    return (
        <div>
            <div className="page-header"><h1>Group Planning Exercise (GPE)</h1><div className="timer">{formatTime(timeLeft)}</div></div>
            <div className="card">
                <div className="gpe-container">
                    <div className="gpe-problem-pane">
                        <h3>{scenario.title}</h3>
                        <img src={scenario.mapImage} alt="GPE Map" className="gpe-map"/>
                        <div className="gpe-problem-statement">
                            <p style={{whiteSpace: 'pre-wrap'}}>{scenario.problemStatement}</p>
                        </div>
                    </div>
                    <div className="gpe-solution-pane">
                        <h3>Your Plan</h3>
                        <textarea value={plan} onChange={e => setPlan(e.target.value)} placeholder="Write your detailed plan here. Define your priorities, form groups, and allocate resources and time effectively."/>
                        <button onClick={handleSubmit} className="btn btn-primary">Submit Plan</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CurrentAffairsView = () => {
    const [briefing, setBriefing] = useState(db.get('dailyBriefing', null));
    const [isLoading, setIsLoading] = useState(false);
    const [quizMode, setQuizMode] = useState(false);
    const [answers, setAnswers] = useState({});
    const [score, setScore] = useState(null);

    const getBriefing = async () => {
        setIsLoading(true);
        const prompt = `Generate 5 top national and international news headlines from today, relevant for a military aspirant in India. For each, provide a 2-3 sentence summary. Then, create a 5-question multiple-choice quiz based ONLY on these summaries. Return a valid JSON object with the schema: { "summaries": [{ "headline": "string", "summary": "string" }], "quiz": [{ "question": "string", "options": ["string", "string", "string", "string"], "answer": "string" }] }`;
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: { responseMimeType: "application/json" }
            });
            const data = JSON.parse(response.text);
            setBriefing(data);
            db.set('dailyBriefing', data);
        } catch (error) {
            console.error("Failed to fetch daily briefing:", error);
            alert("Could not fetch today's briefing. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleQuizSubmit = () => {
        let correct = 0;
        briefing.quiz.forEach((q, index) => {
            if(answers[index] === q.answer) correct++;
        });
        setScore(correct);
    };

    if (isLoading) return <div className="loading-spinner"></div>;
    
    if (!briefing) {
        return <div className="card text-center">
            <h2>Daily Current Affairs</h2>
            <p>Get today's top news summaries and test your knowledge with a short quiz.</p>
            <button onClick={getBriefing} className="btn btn-primary">Fetch Today's News</button>
        </div>
    }

    if(quizMode) {
        return <div>
            <div className="page-header"><h1>Current Affairs Quiz</h1></div>
            <div className="card">
            {score !== null ? (
                <div className="text-center">
                    <h2>Your score: {score} / {briefing.quiz.length}</h2>
                    <button onClick={() => setQuizMode(false)} className="btn btn-primary" style={{marginTop: '1rem'}}>Back to News</button>
                </div>
            ) : (
                <>
                {briefing.quiz.map((q, i) => (
                    <div key={i} style={{marginBottom: '1.5rem'}}>
                        <p><strong>{i+1}. {q.question}</strong></p>
                        {q.options.map((opt, j) => (
                            <label key={j} style={{display: 'block', margin: '0.5rem 0'}}>
                                <input type="radio" name={`q${i}`} value={opt} onChange={(e) => setAnswers({...answers, [i]: e.target.value})} /> {opt}
                            </label>
                        ))}
                    </div>
                ))}
                <button onClick={handleQuizSubmit} className="btn btn-primary">Submit Quiz</button>
                </>
            )}
            </div>
        </div>
    }

    return <div>
        <div className="page-header"><h1>Daily Briefing</h1> <button onClick={getBriefing} className="btn btn-secondary">Refresh News</button></div>
        <div className="news-grid">
            {briefing.summaries.map((item, index) => (
                <div key={index} className="card news-card">
                    <h3>{item.headline}</h3>
                    <p>{item.summary}</p>
                </div>
            ))}
        </div>
        <div className="text-center" style={{marginTop: '2rem'}}>
            <button onClick={() => { setQuizMode(true); setScore(null); setAnswers({}); }} className="btn btn-primary">Start Quiz</button>
        </div>
    </div>
};

const TopicBrieferView = () => {
    const [topic, setTopic] = useState('');
    const [brief, setBrief] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const getBrief = async (e) => {
        e.preventDefault();
        if (!topic.trim()) return;
        setIsLoading(true);
        setBrief('');
        const prompt = `Generate a structured brief on the topic: "${topic}". The brief should be suitable for an SSB aspirant and include: 1. A concise summary. 2. Key arguments for. 3. Key arguments against. 4. Important facts and figures. 5. Potential future implications. Structure the output clearly with markdown-style headings.`;
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt });
            setBrief(response.text);
        } catch (error) {
            console.error("Topic briefer error:", error);
            setBrief("Error generating brief. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };
    
    return <div>
        <div className="page-header"><h1>Topic Briefer</h1></div>
        <div className="card">
            <p>Enter any topic to get a structured brief for Lecturerette or Group Discussion preparation.</p>
            <form onSubmit={getBrief} className="topic-briefer-form">
                <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g., Indo-Pacific Relations" disabled={isLoading} />
                <button type="submit" className="btn btn-primary" disabled={isLoading}>Generate Brief</button>
            </form>
            {isLoading && <div className="loading-spinner"></div>}
            {brief && <div className="briefer-content">{brief}</div>}
        </div>
    </div>
};

const RadarChart = ({ data }) => {
    const size = 500;
    const center = size / 2;
    const radius = center * 0.8;
    const levels = 5;
    const numAxes = data.length;
    const angleSlice = (2 * Math.PI) / numAxes;

    const points = data.map((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const r = radius * (d.value / 100); // Assuming max score is 100 for normalization
        return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
    }).join(' ');

    const axes = data.map((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return <line key={i} x1={center} y1={center} x2={x} y2={y} className="radar-chart-axis" />;
    });

    const levelLines = Array.from({length: levels}).map((_, l) => {
        const r = (radius / levels) * (l + 1);
        const levelPoints = data.map((_, i) => {
            const angle = angleSlice * i - Math.PI / 2;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
        }).join(' ');
        return <polygon key={l} points={levelPoints} fill="none" className="radar-chart-level" />;
    });

    const labels = data.map((d, i) => {
        const angle = angleSlice * i - Math.PI / 2;
        const r = radius * 1.1;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return <text key={i} x={x} y={y} className="radar-chart-label">{d.label}</text>;
    });

    return (
        <div className="radar-chart-container">
            <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart-svg">
                <g>
                    {levelLines}
                    {axes}
                    {labels}
                    <polygon points={points} className="radar-chart-area" />
                </g>
            </svg>
        </div>
    );
};

const OLQDashboard = ({ user, calculateOLQScores }) => {
    const [interpretation, setInterpretation] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const olqScores = useMemo(() => calculateOLQScores(user), [user, calculateOLQScores]);
    
    const chartData = useMemo(() => {
        const maxScore = Math.max(...Object.values(olqScores), 1); // Avoid division by zero
        return OLQ_LIST.map(olq => ({
            label: olq.split(' ').map(s => s[0]).join(''),
            value: ((olqScores[olq] || 0) / maxScore) * 100
        }));
    }, [olqScores]);

    const getInterpretation = async () => {
        if (!Object.values(olqScores).some(v => v > 0)) return;
        setIsLoading(true);
        const prompt = `Given these aggregated Officer-Like Quality (OLQ) scores for an SSB aspirant: ${JSON.stringify(olqScores)}. Provide a brief, encouraging interpretation for each OLQ that has a score greater than zero. Also provide a summary of their overall officer potential based on this profile. Format the response as a simple text string.`;
        try {
            const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: prompt });
            setInterpretation(response.text);
        } catch (error) {
            console.error("OLQ interpretation error:", error);
            setInterpretation("Could not generate interpretation.");
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => { getInterpretation() }, [olqScores]);
    
    return (
        <div>
            <div className="page-header"><h1>OLQ Dashboard</h1></div>
            <div className="card">
                <div className="olq-dashboard-container">
                    <RadarChart data={chartData} />
                    <div>
                        <h3>Detailed Scores</h3>
                        <table className="olq-interpretation-table">
                            <tbody>
                                {OLQ_LIST.map(olq => <tr key={olq}><td><strong>{olq}</strong></td><td>{olqScores[olq] || 0}</td></tr>)}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div style={{marginTop: '2rem'}}>
                    <h3>AI Interpretation</h3>
                    {isLoading ? <div className="loading-spinner"></div> : <p style={{whiteSpace: 'pre-wrap'}}>{interpretation || 'No data to interpret yet. Complete some tests to see your analysis.'}</p>}
                </div>
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
    const [lectureretteTopics, setLectureretteTopics] = useState(db.get('lecturerette_topics', LECTURERETTE_TOPICS_DEFAULT));

    useEffect(() => { db.set('tat_images', tatImages); }, [tatImages]);
    useEffect(() => { db.set('wat_words', watWords); }, [watWords]);
    useEffect(() => { db.set('srt_scenarios', srtScenarios); }, [srtScenarios]);
    useEffect(() => { db.set('lecturerette_topics', lectureretteTopics); }, [lectureretteTopics]);

    const checkAndAwardBadges = (user) => {
        const testResults = user.testResults || {};
        let newBadges = [];
        
        // FIX: Add Array.isArray check to prevent error on 'length' property of 'unknown' type.
        if (Object.values(testResults).some(arr => Array.isArray(arr) && arr.length > 0)) newBadges.push('first_step');
        if (testResults.TAT?.length > 0 && testResults.WAT?.length > 0 && testResults.SRT?.length > 0 && testResults.SDT?.length > 0) newBadges.push('psych_initiate');
        if (testResults.TAT?.length >= 5) newBadges.push('story_weaver');
        if (testResults.WAT?.length >= 5) newBadges.push('word_warrior');
        if (testResults.Lecturerette?.length >= 1) newBadges.push('orator_apprentice');
        if (testResults.Interview?.length >= 1) newBadges.push('interviewer_ace');
        // NOTE: 'consistent_cadet' requires tracking login dates, which is a more complex implementation.

        const allNewBadges = [...new Set([...(user.unlockedBadges || []), ...newBadges])];
        return {...user, unlockedBadges: allNewBadges };
    };
    
    const calculateOLQScores = useCallback((user) => {
        // FIX: Explicitly type `scores` to ensure values are treated as numbers, resolving multiple downstream type errors.
        const scores: { [key: string]: number } = {};
        OLQ_LIST.forEach(olq => scores[olq] = 0);
        if (!user || !user.testResults) return scores;
        
        Object.values(user.testResults).forEach(resultsArray => {
            if (Array.isArray(resultsArray)) {
                resultsArray.forEach(result => {
                    if (result.feedback && Array.isArray(result.feedback.olqs_demonstrated)) {
                        result.feedback.olqs_demonstrated.forEach(olq => {
                            if (scores[olq] !== undefined) scores[olq]++;
                        });
                    }
                });
            }
        });
        return scores;
    }, []);

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
    
    const handleTestComplete = async (testType, data) => {
        setView('dashboard');
        
        let feedback = null;
        let score_gain = 0;
        let payload = {};

        if (testType === 'OIR') {
            const { score } = data;
            score_gain = score * 2; // OIR score contribution
            payload = { responses: data.answers, score, feedback: null };
        } else {
            setViewedFeedback({ isLoading: true });
            let dataPayload;
            if (testType === 'GPE') dataPayload = { scenario: GPE_SCENARIOS_DEFAULT[0], plan: data };
            else if (testType === 'Lecturerette') dataPayload = { transcript: data };
            else dataPayload = { responses: data };
            
            feedback = await getAIAssessment(testType, dataPayload, currentUser.persona);
            setViewedFeedback(feedback);
            score_gain = feedback.olqs_demonstrated?.length * 10 || 0;
            payload = { responses: data, feedback, score: score_gain };
        }

        setCurrentUser(prevUser => {
            const newTestResults = { ...prevUser.testResults };
            if (!newTestResults[testType]) newTestResults[testType] = [];
            newTestResults[testType].push({ ...payload, date: new Date().toISOString() });
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
            'Lecturerette': { add: (s) => setLectureretteTopics(p => [...p, s]), addMultiple: (scenarios) => setLectureretteTopics(p => [...p, ...scenarios]), remove: (i) => setLectureretteTopics(p => p.filter((_, idx) => i !== idx)) },
        };
        updaters[type][action](value);
    };

    if (!currentUser) return <LoginPage onLogin={handleLogin} />;
    if (isInterviewing) return <VoiceInterviewSimulator piqData={currentUser.piqData} onComplete={handleInterviewComplete}/>;

    const renderView = () => {
        switch (view) {
            case 'dashboard': return <Dashboard user={currentUser} onManage={handleManage} onNavigate={setView} onPersonaChange={handlePersonaChange}/>;
            case 'captain nox': return <CaptainNox user={currentUser} calculateOLQScores={calculateOLQScores} />;
            case 'olq dashboard': return <OLQDashboard user={currentUser} calculateOLQScores={calculateOLQScores} />;
            case 'current affairs': return <CurrentAffairsView />;
            case 'topic briefer': return <TopicBrieferView />;
            case 'oir': return <OIRTestRunner questions={OIR_QUESTIONS_DEFAULT} onComplete={(score, answers) => handleTestComplete('OIR', {score, answers})} />;
            case 'gpe': return <GPEView scenario={GPE_SCENARIOS_DEFAULT[0]} onComplete={(plan) => handleTestComplete('GPE', plan)} />;
            case 'tat': return <TestRunner testType="TAT" data={tatImages} timeLimit={240} onComplete={(r) => handleTestComplete('TAT', r)} />;
            case 'wat': return <TestRunner testType="WAT" data={watWords} timeLimit={15} onComplete={(r) => handleTestComplete('WAT', r)} />;
            case 'srt': return <TestRunner testType="SRT" data={srtScenarios} timeLimit={30} onComplete={(r) => handleTestComplete('SRT', r)} />;
            case 'sdt': return <SDTView onComplete={(r) => handleTestComplete('SDT', r)} />;
            case 'lecturerette': return <LectureretteView topics={lectureretteTopics} onComplete={(r) => handleTestComplete('Lecturerette', r)} />;
            case 'leaderboard': return <Leaderboard users={users}/>;
            case 'interview': return <InterviewPage user={currentUser} onSavePiq={handleSavePiq} onStartInterview={() => setIsInterviewing(true)} onViewFeedback={fb => setViewedFeedback(fb)} />;
            default: return <Dashboard user={currentUser} onManage={handleManage} onNavigate={setView} onPersonaChange={handlePersonaChange}/>;
        }
    };

    const navLinks = [
      'dashboard', 'olq dashboard', 'captain nox', 'current affairs', 'topic briefer', '|', 'oir', 'gpe', 'tat', 'wat', 'srt', 'sdt', 'lecturerette', 'interview', '|', 'leaderboard'
    ];

    return (
        <>
            <div className="app-layout">
                <aside className="sidebar">
                    <div className="sidebar-header">NOX SSB Prep</div>
                    <nav className="sidebar-nav">
                        <ul>
                            {navLinks.map((v, i) => {
                                if (v === '|') return <hr key={i} style={{border: 'none', borderTop: '1px solid var(--primary-light)', margin: 'var(--spacing-md) 0'}}/>;
                                return <li key={v}><a href="#" className={view === v ? 'active' : ''} onClick={() => setView(v)}>{v.charAt(0).toUpperCase() + v.slice(1).replace(' nox', ' Nox').replace('olq', 'OLQ')}</a></li>
                            })}
                        </ul>
                    </nav>
                    <div className="sidebar-footer"><p>Logged in as: <strong>{currentUser.name}</strong><br/>({currentUser.rollNumber})</p><button onClick={handleLogout}>Logout</button></div>
                </aside>
                <main className="main-content">{renderView()}</main>
            </div>
            <FeedbackModal feedback={viewedFeedback} onClose={() => setViewedFeedback(null)} />
            {activeModal === 'TAT' && <ManageTatModal images={tatImages} onAdd={(url) => handleContentChange('TAT', 'add', url)} onAddMultiple={(urls) => handleContentChange('TAT', 'addMultiple', urls)} onRemove={(index) => handleContentChange('TAT', 'remove', index)} onClose={() => setActiveModal(null)} />}
            {activeModal === 'WAT' && <ManageContentModal title="Manage WAT Words" items={watWords} onAdd={(word) => handleContentChange('WAT', 'add', word)} onAddMultiple={(words) => handleContentChange('WAT', 'addMultiple', words)} onRemove={(index) => handleContentChange('WAT', 'remove', index)} onClose={() => setActiveModal(null)} type="WAT" />}
            {activeModal === 'SRT' && <ManageContentModal title="Manage SRT Scenarios" items={srtScenarios} onAdd={(scenario) => handleContentChange('SRT', 'add', scenario)} onAddMultiple={(scenarios) => handleContentChange('SRT', 'addMultiple', scenarios)} onRemove={(index) => handleContentChange('SRT', 'remove', index)} onClose={() => setActiveModal(null)} type="SRT" />}
            {activeModal === 'Lecturerette' && <ManageContentModal title="Manage Lecturerette Topics" items={lectureretteTopics} onAdd={(topic) => handleContentChange('Lecturerette', 'add', topic)} onAddMultiple={(topics) => handleContentChange('Lecturerette', 'addMultiple', topics)} onRemove={(index) => handleContentChange('Lecturerette', 'remove', index)} onClose={() => setActiveModal(null)} type="Lecturerette" />}
        </>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);