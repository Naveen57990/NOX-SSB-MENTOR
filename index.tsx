import { GoogleGenAI, Type, LiveServerMessage, Modality } from "@google/genai";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Let TypeScript know that the 'firebase' global exists from the script tag
declare var firebase: any;

const API_KEY = process.env.API_KEY;

// --- UNIFIED DATABASE (Firebase Realtime Database wrapper) ---
const DB_KEY = 'ssb_app_data';

const getDefaultData = () => ({
    users: [],
    chats: {},
    content: {
        tat_images: TAT_IMAGES_DEFAULT,
        wat_words: WAT_WORDS_DEFAULT,
        srt_scenarios: SRT_SCENARIOS_DEFAULT,
        lecturerette_topics: LECTURERETTE_TOPICS_DEFAULT,
    }
});

const db = {
    save: (data) => {
        try {
            // Check if firebase is initialized before trying to use it
            if (firebase && firebase.database) {
                firebase.database().ref(DB_KEY).set(data);
            }
        } catch (e) {
            console.error("Failed to save data to Firebase", e);
        }
    },
    listen: (callback) => {
        try {
             if (firebase && firebase.database) {
                const dbRef = firebase.database().ref(DB_KEY);
                dbRef.on('value', (snapshot) => {
                    const data = snapshot.val();
                    // If DB is empty, initialize with default data
                    if (data) {
                        callback(data);
                    } else {
                        const defaultData = getDefaultData();
                        callback(defaultData);
                        db.save(defaultData); // Save the initial structure to Firebase
                    }
                }, (error) => {
                    console.error("Firebase listener error:", error);
                });
                
                // Return a function to unsubscribe when the component unmounts
                return () => dbRef.off('value');
            }
        } catch(e) {
            console.error("Failed to connect to Firebase", e);
        }
        // Return an empty unsubscribe function if firebase is not available
        return () => {};
    }
};


// --- DATA & CONFIG CONSTANTS ---
const TAT_IMAGES_DEFAULT = [
    "https://images.weserv.nl/?url=i.imgur.com/8os3v26.jpeg", // Boy looking out window
    "https://images.weserv.nl/?url=i.imgur.com/m4L35vC.jpeg", // Man at desk
    "https://images.weserv.nl/?url=i.imgur.com/T5a2F3s.jpeg", // Field scene with person down
    "https://images.weserv.nl/?url=i.imgur.com/y3J3f7Y.jpeg", // Bedroom scene
    "https://images.weserv.nl/?url=i.imgur.com/eYhPh2T.jpeg", // Lab/workshop scene
    "https://images.weserv.nl/?url=i.imgur.com/O0B8a4l.jpeg", // Rock climbing
    "https://images.weserv.nl/?url=i.imgur.com/Jd1mJtL.jpeg", // Group planning
    "https://images.weserv.nl/?url=i.imgur.com/bW3qY0f.jpeg", // Formal couple
    "https://images.weserv.nl/?url=i.imgur.com/wP0b6bB.jpeg", // Stormy sea
    "https://images.weserv.nl/?url=i.imgur.com/c1g2g3H.jpeg", // Lone person in desert
    "https://images.weserv.nl/?url=i.imgur.com/k9f7b1s.jpeg", // Rescue scene
    "https://images.weserv.nl/?url=i.imgur.com/5J3e2eF.png"  // Blank card
];
const WAT_WORDS_DEFAULT = ['Duty', 'Courage', 'Team', 'Defeat', 'Lead', 'Responsibility', 'Friend', 'Failure', 'Order', 'Discipline'];
const SRT_SCENARIOS_DEFAULT = ['You are on your way to an important exam and you see an accident. You are the first person to arrive. What would you do?', 'During a group task, your team members are not cooperating. What would you do?'];
const LECTURERETTE_TOPICS_DEFAULT = ['My Favourite Hobby', 'The Importance of Discipline in Life', 'India in 2047', 'Artificial Intelligence: A Boon or a Bane?', 'My Role Model'];
const SDT_PROMPTS = ["What do your parents think of you?", "What do your teachers/superiors think of you?", "What do your friends think of you?", "What do you think of yourself? (Your strengths and weaknesses)", "What kind of person would you like to become?"];
const OIR_QUESTIONS_DEFAULT = [
    { type: 'verbal', question: 'Which number should come next in the series? 1, 4, 9, 16, ?', options: ['20', '25', '30', '36'], answer: 1 },
    { type: 'verbal', question: 'DEF is to ABC as LMN is to ?', options: ['IJK', 'HIJ', 'OPQ', 'GHI'], answer: 0 },
    // NOTE: In a real app, these image URLs would be hosted properly. Using placeholders.
    { type: 'non-verbal', question: 'https://images.weserv.nl/?url=i.imgur.com/rGfAP83.png', options: ['https://images.weserv.nl/?url=i.imgur.com/8F2jQqg.png', 'https://images.weserv.nl/?url=i.imgur.com/L1n7Q3f.png', 'https://images.weserv.nl/?url=i.imgur.com/6XkY3Zf.png', 'https://images.weserv.nl/?url=i.imgur.com/P2tY7Xw.png'], answer: 2 },
    { type: 'verbal', question: 'If FRIEND is coded as HUMJTK, how is CANDLE written in that code?', options: ['EDRIRL', 'DCORHT', 'ESJFTM', 'DEQJQM'], answer: 0 },
];
const GPE_SCENARIOS_DEFAULT = [{
    title: "Flood Rescue Mission",
    mapImage: "https://images.weserv.nl/?url=i.imgur.com/kYqE1wS.png", // Placeholder map
    problemStatement: "You are a group of 8 college students on a hiking trip near the village of Rampur. A sudden cloudburst has caused flash floods. You are at a point A. The bridge connecting Rampur to the main road has been washed away. You overhear on a villager's radio that a rescue team will arrive in 3 hours. You have the following information:\n- A group of 15 villagers, including elderly and children, are stranded at the village temple (Point B), which is on higher ground but isolated.\n- Two injured hikers are trapped in a cave at Point C, needing immediate first aid.\n- The local dispensary at Point D has a first aid box but the doctor is out of town.\n- A partially damaged boat is available at Point E.\nYou have a small first aid kit, a rope, and mobile phones with low battery. Your task is to make a plan to ensure the safety of everyone until the rescue team arrives."
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

const DEFAULT_PROFILE_PIC = 'https://images.weserv.nl/?url=i.imgur.com/V4RclNb.png';

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
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        if (name.trim() && rollNumber.trim()) {
            if (rollNumber.trim() === '1') {
                if (password === 'Naveen@5799') {
                    onLogin(name.trim(), rollNumber.trim());
                } else {
                    setError('Incorrect admin password.');
                }
            } else {
                onLogin(name.trim(), rollNumber.trim());
            }
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
                    {rollNumber === '1' && (
                        <div className="form-group">
                            <label htmlFor="password">Admin Password</label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="Enter admin password"
                            />
                        </div>
                    )}
                    {error && <p className="login-error">{error}</p>}
                    <button type="submit" className="btn btn-primary btn-block">
                        Enter Training Zone
                    </button>
                </form>
            </div>
        </div>
    );
};

const TestHistoryCard: React.FC<{ testType: string; results: any[]; onViewFeedback: (feedback: any) => any; }> = ({ testType, results, onViewFeedback }) => {
    const latestResult = results && results.length > 0 ? results[results.length - 1] : null;
    return (
        <div className="card test-history-card">
            <h3>{testType}</h3>
            {latestResult ? (
                <>
                    <p>Last attempt: {new Date(latestResult.date).toLocaleDateString()}</p>
                    {typeof latestResult.score === 'number' && !isNaN(latestResult.score) && <p>Score: {latestResult.score}</p>}
                    {latestResult.feedback && <button className="btn btn-secondary" onClick={() => onViewFeedback(latestResult.feedback)}>View Feedback</button>}
                </>
            ) : (
                <p>No attempts yet.</p>
            )}
            <p>Total attempts: {results?.length || 0}</p>
        </div>
    );
};

// FIX: Property 'onAddMultiple' is missing... but required...
// Removed unused 'onAddMultiple' prop which was causing a type error at the call site.
const ManageTatModal = ({ images, onAdd, onRemove, onClose }) => {
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
                <ul className="content-list">
                    {images.length > 0 ? images.map((img, index) => (
                        <li key={index} className="content-list-item">
                            <img src={img} alt={`TAT Image ${index + 1}`} className="image-preview" />
                            <span className="item-text">{img.substring(0, 40)}...</span>
                            <button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button>
                        </li>
                    )) : (
                        <li className="content-list-item-empty">
                            <p>No images found. Add new images using the options below.</p>
                        </li>
                    )}
                </ul>
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
                <ul className="content-list">
                    {items.length > 0 ? items.map((item, index) => (
                        <li key={index} className="content-list-item">
                            <span className="item-text" style={{whiteSpace: 'normal'}}>{item}</span>
                            <button className="btn btn-danger btn-secondary" onClick={() => onRemove(index)}>Remove</button>
                        </li>
                    )) : (
                         <li className="content-list-item-empty">
                             <p>No items found. Add new items using the options below.</p>
                        </li>
                    )}
                </ul>
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
            {user.warnings && user.warnings.length > 0 && (
                <div className="card admin-warning-card">
                    <h2><svg viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"></path></svg> Admin Warnings</h2>
                    <ul>
                        {user.warnings.map((warning, index) => (
                            <li key={index}>
                                <p>{warning.message}</p>
                                <span>{new Date(warning.date).toLocaleString()}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
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
                {['TAT', 'WAT', 'SRT', 'SDT', 'OIR', 'GPE', 'Lecturerette', 'Interview'].map(test => <TestHistoryCard key={test} testType={test} results={user.testResults?.[test] || []} onViewFeedback={(feedback) => onManage('ViewFeedback', feedback)} />)}
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
const TestRunner = ({ testType, data, timeLimit, onComplete }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState([]);
    const [currentResponse, setCurrentResponse] = useState('');
    const [timeLeft, setTimeLeft] = useState(timeLimit);
    // FIX: Initialize useRef with null instead of itself to fix "used before its declaration" error.
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

const PIQForm = ({ onSave, initialData }) => {
    const [formData, setFormData] = useState(initialData || {});

    const handleChange = (e) => {
        const { name, value } = e.target;
        // handle nested objects for education
        if (name.includes('.')) {
            const [section, field] = name.split('.');
            setFormData(prev => ({
                ...prev,
                [section]: {
                    ...prev[section],
                    [field]: value
                }
            }));
        } else {
            setFormData({ ...formData, [name]: value });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
        alert('PIQ data saved!');
    };

    return (
        <form onSubmit={handleSubmit} className="piq-form">
            <fieldset>
                <legend>Personal Details</legend>
                <div className="piq-form-grid">
                    <input name="dateOfBirth" type="date" value={formData.dateOfBirth || ''} onChange={handleChange} placeholder="Date of Birth" />
                    <input name="placeOfBirth" value={formData.placeOfBirth || ''} onChange={handleChange} placeholder="Place of Birth" />
                    <input name="state" value={formData.state || ''} onChange={handleChange} placeholder="State of Domicile" />
                    <input name="religion" value={formData.religion || ''} onChange={handleChange} placeholder="Religion" />
                </div>
            </fieldset>

            <fieldset>
                <legend>Family Background</legend>
                <div className="piq-form-grid">
                    <input name="fatherName" value={formData.fatherName || ''} onChange={handleChange} placeholder="Father's Name" />
                    <input name="fatherOccupation" value={formData.fatherOccupation || ''} onChange={handleChange} placeholder="Father's Occupation" />
                    <input name="motherName" value={formData.motherName || ''} onChange={handleChange} placeholder="Mother's Name" />
                    <input name="motherOccupation" value={formData.motherOccupation || ''} onChange={handleChange} placeholder="Mother's Occupation" />
                    <textarea name="siblings" value={formData.siblings || ''} onChange={handleChange} placeholder="Details of Siblings (Age, Occupation)" style={{gridColumn: '1 / -1'}} rows={3}/>
                </div>
            </fieldset>
            
            <fieldset>
                <legend>Educational Background</legend>
                 <p style={{fontSize: '0.9rem', color: 'var(--neutral-light)', marginBottom: 'var(--spacing-md)'}}>Enter details for Class 10, Class 12, and Graduation.</p>
                 <div className="piq-form-grid" style={{gridTemplateColumns: '1fr 1fr 1fr'}}>
                    <input name="education10.school" value={formData.education10?.school || ''} onChange={handleChange} placeholder="Class 10 School" />
                    <input name="education10.year" value={formData.education10?.year || ''} onChange={handleChange} placeholder="Class 10 Year" />
                    <input name="education10.percentage" value={formData.education10?.percentage || ''} onChange={handleChange} placeholder="Class 10 %" />

                    <input name="education12.school" value={formData.education12?.school || ''} onChange={handleChange} placeholder="Class 12 School/College" />
                    <input name="education12.year" value={formData.education12?.year || ''} onChange={handleChange} placeholder="Class 12 Year" />
                    <input name="education12.percentage" value={formData.education12?.percentage || ''} onChange={handleChange} placeholder="Class 12 %" />
                    
                    <input name="graduation.college" value={formData.graduation?.college || ''} onChange={handleChange} placeholder="Graduation College" />
                    <input name="graduation.degree" value={formData.graduation?.degree || ''} onChange={handleChange} placeholder="Degree (e.g. B.Tech CSE)" />
                    <input name="graduation.percentage" value={formData.graduation?.percentage || ''} onChange={handleChange} placeholder="Graduation %" />
                 </div>
            </fieldset>
            
            <fieldset>
                <legend>Extra-Curriculars & Previous Attempts</legend>
                <div className="piq-form-grid">
                     <textarea name="hobbies" value={formData.hobbies || ''} onChange={handleChange} placeholder="Hobbies & Interests" rows={3}/>
                     <textarea name="sports" value={formData.sports || ''} onChange={handleChange} placeholder="Sports & Games Played (mention level of participation)" rows={3}/>
                     <textarea name="achievements" value={formData.achievements || ''} onChange={handleChange} placeholder="Achievements in academics, sports, etc." rows={3}/>
                     <textarea name="ncc" value={formData.ncc || ''} onChange={handleChange} placeholder="NCC Experience (Wing, Certificate, Rank)" rows={3}/>
                     <textarea name="previousAttempts" value={formData.previousAttempts || ''} onChange={handleChange} placeholder="Previous SSB Attempts (Entry, Place, Batch/Chest No., Result)" rows={3}/>
                </div>
            </fieldset>
            
            <button type="submit" className="btn btn-primary btn-block" style={{marginTop: '1.5rem'}}>Save PIQ Data</button>
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
                                Interview on {new Date(item.date).toLocaleString()}
                                {typeof item.score === 'number' && ` - Score: ${item.score}`}
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
    const [messages, setMessages] = useState([{ sender: 'AI', text: `Welcome, ${user.name}. I am Captain Nox, your personal mentor. I have reviewed your performance data. How can I help you prepare today? You can also ask me to generate a dynamic training plan for you.`, timestamp: new Date().toISOString() }]);
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

        const userMessage = { sender: 'User', text: userInput, timestamp: new Date().toISOString() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        const prompt = `You are Captain Nox, a wise and experienced retired military officer mentoring an SSB aspirant. Your tone is encouraging but direct. You have access to the aspirant's full performance record. Use this data to provide insightful, personalized advice. Do not just list the data; interpret it to answer their questions. Here is the cadet's data: ${JSON.stringify(user)}. The conversation so far: ${JSON.stringify(messages)}. Now, answer the cadet's latest message: "${userInput}".`;
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: prompt,
            });
            const aiMessage = { sender: 'AI', text: response.text, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, aiMessage]);
        } catch (error) {
            console.error("Captain Nox API error:", error);
            const errorMessage = { sender: 'AI', text: "I'm sorry, I encountered an error. Please try asking again.", timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };
    
    const generatePlan = () => {
        const olqScores = calculateOLQScores(user);
        const weakestOlqs = Object.entries(olqScores).sort(([,a],[,b]) => (a as number) - (b as number)).slice(0, 3).map(([name]) => name);
        const planPrompt = `Based on my performance data and my weakest OLQs (${weakestOlqs.join(', ')}), generate a personalized 7-day training plan for me. Suggest specific tests in the app and other offline activities.`;
        handleSendMessage(null, planPrompt);
    };

    return (
        <div>
            <div className="page-header"><h1>Captain Nox</h1><p style={{fontSize: '1rem', color: 'var(--neutral-light)', alignSelf: 'flex-end', marginBottom: '8px'}}>Your Personal AI Mentor</p></div>
            <div className="card">
                <div className="interview-container">
                    <div className="interview-transcript">
                        {messages.map((msg, index) => (
                             <div key={index} className={`chat-bubble ${msg.sender.toLowerCase()}`}>
                                {msg.text}
                                {msg.timestamp && <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                            </div>
                        ))}
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
                            const l = inputData.length; const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) { int16[i] = inputData[i] * 32768; }
                            const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
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

const CurrentAffairsView = ({ onGetBriefing, briefingData }) => {
    const { briefing, isLoading } = briefingData;
    const [quizMode, setQuizMode] = useState(false);
    const [answers, setAnswers] = useState({});
    const [score, setScore] = useState(null);

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
            <button onClick={onGetBriefing} className="btn btn-primary">Fetch Today's News</button>
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
        <div className="page-header"><h1>Daily Briefing</h1> <button onClick={onGetBriefing} className="btn btn-secondary">Refresh News</button></div>
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
    const numLevels = 5;
    const radius = size * 0.4;
    const numAxes = data.length;
    const angleSlice = (2 * Math.PI) / numAxes;

    if (numAxes === 0) return null;

    const getPoint = (level, angle) => ({
        x: center + radius * level * Math.cos(angle - Math.PI / 2),
        y: center + radius * level * Math.sin(angle - Math.PI / 2),
    });

    const dataPoints = data.map((d, i) => getPoint(d.value, angleSlice * i));
    const dataPath = dataPoints.map(p => `${p.x},${p.y}`).join(' ');

    return (
        <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart-svg">
            {/* Levels */}
            {[...Array(numLevels)].map((_, levelIndex) => {
                const levelRadius = radius * ((levelIndex + 1) / numLevels);
                return <circle key={levelIndex} cx={center} cy={center} r={levelRadius} className="radar-chart-level" fill="none" />;
            })}

            {/* Axes and Labels */}
            {data.map((d, i) => {
                const angle = angleSlice * i;
                const p1 = getPoint(0, angle);
                const p2 = getPoint(1.1, angle);
                const labelPoint = getPoint(1.2, angle);
                
                let textAnchor = "middle";
                let dy = "0.3em";
                const angleDeg = (angle * 180) / Math.PI;

                if (angleDeg > 10 && angleDeg < 170) {
                    textAnchor = "start";
                } else if (angleDeg > 190 && angleDeg < 350) {
                    textAnchor = "end";
                }
                
                if (angleDeg > 260 && angleDeg < 280) dy = "-0.5em";
                
                return (
                    <g key={i}>
                        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="radar-chart-axis" />
                        <text x={labelPoint.x} y={labelPoint.y} dy={dy} className="radar-chart-label" style={{ textAnchor }}>
                            {d.name}
                        </text>
                    </g>
                );
            })}

            {/* Data Area */}
            <polygon points={dataPath} className="radar-chart-area" />
        </svg>
    );
};
;

const OLQDashboard = ({ user, calculateOLQScores }) => {
    const olqScores = calculateOLQScores(user);
    const chartData = useMemo(() => {
        return OLQ_LIST.map(olq => ({ name: olq, value: olqScores[olq] || 0 }));
    }, [user]);

    const interpretations = {
        "Effective Intelligence": "Ability to solve practical problems.",
        "Reasoning Ability": "Grasping essentials well and arriving at logical conclusions.",
        "Organizing Ability": "Putting resources to best use to achieve a goal.",
        "Power of Expression": "Putting across one's ideas with ease and clarity.",
        "Social Adaptability": "Ability to adapt to the social environment and get along with others.",
        "Cooperation": "Working with others in harmony towards a common goal.",
        "Sense of Responsibility": "Understanding and fulfilling one's duty.",
        "Initiative": "Taking the first step in an unfamiliar situation.",
        "Self Confidence": "Faith in one's own abilities to meet stressful situations.",
        "Speed of Decision": "Ability to arrive at workable decisions quickly.",
        "Ability to Influence a Group": "Enabling others to willingly work towards a common goal.",
        "Liveliness": "A cheerful and optimistic outlook on life.",
        "Determination": "A sustained effort to achieve objectives in spite of obstacles.",
        "Courage": "The ability to appreciate and take calculated risks.",
        "Stamina": "The capacity to withstand sustained physical and mental strain."
    };

    return (
        <div>
            <div className="page-header"><h1>OLQ Dashboard</h1></div>
            <div className="olq-dashboard-container">
                <div className="card">
                    <div className="radar-chart-container">
                        <RadarChart data={chartData} />
                    </div>
                </div>
                <div className="card">
                     <h2>Your OLQ Analysis</h2>
                     <p>This chart visualizes your Officer-Like Qualities based on an analysis of all your completed tests. A higher value indicates that the quality was demonstrated more frequently in your responses.</p>
                     <table className="olq-interpretation-table">
                         <tbody>
                            {OLQ_LIST.map(olq => (
                                <tr key={olq}>
                                    <td><strong>{olq}</strong></td>
                                    <td>{interpretations[olq]}</td>
                                </tr>
                            ))}
                         </tbody>
                     </table>
                </div>
            </div>
        </div>
    )
};
const ProfilePage = ({ user, onUpdateUser }) => {
    const [name, setName] = useState(user.name);
    const [rollNumber, setRollNumber] = useState(user.rollNumber);
    const [profilePic, setProfilePic] = useState(user.profilePic || DEFAULT_PROFILE_PIC);
    const fileInputRef = useRef(null);

    const handleSave = () => {
        onUpdateUser({ name, rollNumber, profilePic });
        alert('Profile updated!');
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                setProfilePic(base64);
            } catch (err) {
                console.error("Error converting file to base64:", err);
                alert("Failed to upload image.");
            }
        }
    };
    
    const triggerFileSelect = () => fileInputRef.current.click();

    return (
        <div>
            <div className="page-header"><h1>Your Profile</h1></div>
            <div className="card">
                <div className="profile-edit-container">
                    <div className="profile-photo-section">
                        <img src={profilePic} alt="Profile" className="profile-picture" />
                        <div className="profile-photo-actions">
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                            <button className="btn btn-secondary" onClick={triggerFileSelect}>Upload New Photo</button>
                            <button className="btn btn-danger" onClick={() => setProfilePic(DEFAULT_PROFILE_PIC)}>Remove Photo</button>
                        </div>
                    </div>
                    <div className="profile-details-section">
                        <h2>Edit Your Details</h2>
                        <p>This information is used across the app.</p>
                        <div className="form-group">
                            <label htmlFor="profileName">Full Name</label>
                            <input id="profileName" type="text" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="profileRoll">Roll Number</label>
                            <input id="profileRoll" type="text" value={rollNumber} disabled />
                             <p style={{fontSize: '0.8rem', color: 'var(--neutral-light)', marginTop: '4px'}}>Roll number cannot be changed.</p>
                        </div>
                        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CommunityPage = ({ user, users, chats, onSendMessage }) => {
    const [activeTab, setActiveTab] = useState('friends'); // friends, requests, all
    const [selectedChat, setSelectedChat] = useState(null); // roll number of chat partner
    const friendList = useMemo(() => users.filter(u => user.friends?.includes(u.rollNumber)), [user, users]);
    const friendRequests = useMemo(() => users.filter(u => user.friendRequests?.includes(u.rollNumber)), [user, users]);
    const allUsers = useMemo(() => users.filter(u => u.rollNumber !== user.rollNumber), [user, users]);
    
    const handleSendMessage = (text) => {
        if (!selectedChat) return;
        const message = {
            sender: user.rollNumber,
            text: text,
            timestamp: new Date().toISOString()
        };
        onSendMessage(user.rollNumber, selectedChat, message);
    };
    
    const ChatView = ({ chatPartner, chatHistory }) => {
        const [input, setInput] = useState('');
        const chatEndRef = useRef(null);

        useEffect(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, [chatHistory]);

        const handleSubmit = (e) => {
            e.preventDefault();
            if(input.trim()) {
                handleSendMessage(input.trim());
                setInput('');
            }
        };

        return (
            <div className="chat-view">
                 <div className="interview-transcript">
                    {chatHistory.map((msg, index) => {
                        const senderIsUser = msg.sender === user.rollNumber;
                        return (
                           <div key={index} className={`chat-bubble ${senderIsUser ? 'user' : 'ai'}`}>
                                {msg.text}
                                {msg.timestamp && <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>}
                            </div>
                        );
                    })}
                    <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSubmit} className="chat-input-form">
                    <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Message ${chatPartner.name}`}/>
                    <button type="submit" className="btn btn-primary">Send</button>
                </form>
            </div>
        );
    };

    const selectedChatPartner = users.find(u => u.rollNumber === selectedChat);
    const chatHistory = chats[`${[user.rollNumber, selectedChat].sort().join('_')}`] || [];

    return (
        <div>
            <div className="page-header"><h1>Community Hub</h1></div>
            <div className="community-container">
                <div className="community-sidebar">
                    <div className="community-tabs">
                        <button className={activeTab === 'friends' ? 'active' : ''} onClick={() => setActiveTab('friends')}>Friends</button>
                        <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}>
                            Requests {friendRequests.length > 0 && <span className="notification-badge">{friendRequests.length}</span>}
                        </button>
                        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>All Cadets</button>
                    </div>
                    <div className="community-list">
                        {activeTab === 'friends' && friendList.map(f => (
                            <div key={f.rollNumber} className={`community-list-item ${selectedChat === f.rollNumber ? 'active' : ''}`} onClick={() => setSelectedChat(f.rollNumber)}>
                                <img src={f.profilePic || DEFAULT_PROFILE_PIC} alt={f.name}/>
                                <span>{f.name}</span>
                            </div>
                        ))}
                         {activeTab === 'all' && allUsers.map(f => (
                            <div key={f.rollNumber} className="community-list-item request">
                                <img src={f.profilePic || DEFAULT_PROFILE_PIC} alt={f.name}/>
                                <span>{f.name}</span>
                                <div className="request-actions">
                                    <button className="btn btn-secondary">Add Friend</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="community-main">
                    {!selectedChat ? (
                        <div className="card text-center" style={{height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
                            <p>Select a friend to start chatting.</p>
                        </div>
                    ) : (
                        <div className="chat-and-profile-layout">
                            <ChatView chatPartner={selectedChatPartner} chatHistory={chatHistory} />
                            <div className="card friend-profile-view">
                                {/* Placeholder for Friend Profile View */}
                                <h2>{selectedChatPartner.name}</h2>
                                <img src={selectedChatPartner.profilePic || DEFAULT_PROFILE_PIC} alt={selectedChatPartner.name} style={{width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', margin: '1rem auto', display: 'block'}}/>
                                <p><strong>Roll No:</strong> {selectedChatPartner.rollNumber}</p>
                                <p><strong>Score:</strong> {selectedChatPartner.score || 0}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
const AdminPanel = ({ users, chats, onDeleteUser, onSendWarning }) => {
    const [selectedUser, setSelectedUser] = useState(null);
    const [activeTab, setActiveTab] = useState('data'); // data, chats
    const [selectedChatPartner, setSelectedChatPartner] = useState(null);
    const [warningMessage, setWarningMessage] = useState('');

    const handleSelectUser = (user) => {
        setSelectedUser(user);
        setSelectedChatPartner(null); // Reset chat selection when user changes
        setWarningMessage('');
    };

    const confirmAndDelete = (rollNumber) => {
        onDeleteUser(rollNumber);
        setSelectedUser(null);
    };
    
    const sendWarning = () => {
        onSendWarning(selectedUser.rollNumber, warningMessage);
        setWarningMessage('');
    };

    const chatHistory = selectedUser && selectedChatPartner ? chats[`${[selectedUser.rollNumber, selectedChatPartner].sort().join('_')}`] || [] : [];
    const chatPartners = selectedUser && chats ? Object.keys(chats)
        .filter(key => key.includes(selectedUser.rollNumber))
        .map(key => key.split('_').find(rn => rn !== selectedUser.rollNumber))
        : [];
        
    return (
        <div>
            <div className="page-header"><h1>Admin Panel</h1></div>
            <div className="admin-container">
                <div className="admin-user-list">
                    <h3>All Users ({users.length})</h3>
                    <ul>
                        {users.map(user => (
                            <li key={user.rollNumber} onClick={() => handleSelectUser(user)} className={selectedUser?.rollNumber === user.rollNumber ? 'active' : ''}>
                                {user.name} ({user.rollNumber})
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="card admin-user-details">
                    {!selectedUser ? (
                        <p>Select a user to view their details.</p>
                    ) : (
                        <>
                            <div className="community-tabs">
                                <button className={activeTab === 'data' ? 'active' : ''} onClick={() => setActiveTab('data')}>User Data & Actions</button>
                                <button className={activeTab === 'chats' ? 'active' : ''} onClick={() => setActiveTab('chats')}>View Chats</button>
                            </div>
                            <div className="admin-tab-content">
                                {activeTab === 'data' && (
                                    <>
                                        <div className="admin-actions">
                                            <div className="warning-section">
                                                <h3>Send Warning</h3>
                                                <textarea 
                                                    value={warningMessage}
                                                    onChange={(e) => setWarningMessage(e.target.value)}
                                                    placeholder={`Write a warning for ${selectedUser.name}...`}
                                                />
                                                <button onClick={sendWarning} className="btn btn-secondary">Send Warning</button>
                                            </div>
                                            <div className="delete-section">
                                                <h3>Danger Zone</h3>
                                                <button onClick={() => confirmAndDelete(selectedUser.rollNumber)} className="btn btn-danger">
                                                    Delete {selectedUser.name}
                                                </button>
                                            </div>
                                        </div>
                                        <h2>Data for {selectedUser.name}</h2>
                                        <pre>{JSON.stringify(selectedUser, null, 2)}</pre>
                                    </>
                                )}
                                {activeTab === 'chats' && (
                                    <>
                                        <h2>Chats for {selectedUser.name}</h2>
                                        <div className="admin-chat-selector">
                                            {chatPartners.map(chatPartnerRoll => (
                                                <button key={chatPartnerRoll} className={`btn btn-secondary ${selectedChatPartner === chatPartnerRoll ? 'active' : ''}`} onClick={() => setSelectedChatPartner(chatPartnerRoll)}>
                                                    Chat with {users.find(u => u.rollNumber === chatPartnerRoll)?.name || 'Unknown'}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="interview-transcript admin-chat-view">
                                            {chatHistory.map((msg, index) => {
                                                 const sender = users.find(u => u.rollNumber === msg.sender);
                                                 return (
                                                    <div key={index} className={`chat-bubble ${msg.sender === selectedUser.rollNumber ? 'user' : 'ai'}`}>
                                                         <strong>{sender?.name || 'Unknown'}: </strong>{msg.text}
                                                         {msg.timestamp && <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleString()}</span>}
                                                    </div>
                                                 );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};



// --- MAIN APP COMPONENT ---
const App = () => {
    const [appData, setAppData] = useState(null);
    const [currentUser, setCurrentUser] = useState(null);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [currentTest, setCurrentTest] = useState(null);
    const [currentModal, setCurrentModal] = useState(null);
    const [modalData, setModalData] = useState(null);
    const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
    const [currentAffairsData, setCurrentAffairsData] = useState({ briefing: null, isLoading: false });
    const [openNavSections, setOpenNavSections] = useState({ psychology: true, gto: true, knowledge: true });

    useEffect(() => {
        const unsubscribe = db.listen(setAppData);
        return () => unsubscribe();
    }, []);
    
    // Derived state, memoized for performance
    const users = useMemo(() => appData?.users || [], [appData]);
    const chats = useMemo(() => appData?.chats || {}, [appData]);
    // FIX: Provide fallbacks for content arrays to prevent crashes if they are missing from the database.
    const content = useMemo(() => ({
        tat_images: appData?.content?.tat_images || [],
        wat_words: appData?.content?.wat_words || [],
        srt_scenarios: appData?.content?.srt_scenarios || [],
        lecturerette_topics: appData?.content?.lecturerette_topics || [],
    }), [appData]);
    
    // Find current user object from appData whenever it changes
    useEffect(() => {
        if(appData && currentUser) {
            const potentialCurrentUser = appData.users.find(u => u.rollNumber === currentUser.rollNumber);
            if (potentialCurrentUser) {
                setCurrentUser(potentialCurrentUser);
            } else {
                // User was deleted by admin, log them out
                handleLogout();
            }
        }
    }, [appData]);

    const handleLogin = (name, rollNumber) => {
        const existingUser = users.find(u => u.rollNumber === rollNumber);
        if (existingUser) {
            setCurrentUser(existingUser);
        } else {
            const newUser = {
                name,
                rollNumber,
                profilePic: DEFAULT_PROFILE_PIC,
                persona: 'psychologist',
                joinDate: new Date().toISOString(),
                testResults: {},
                unlockedBadges: [],
                piqData: {},
                score: 0,
            };
            const updatedUsers = [...users, newUser];
            setAppData(prev => ({...prev, users: updatedUsers}));
            db.save({...appData, users: updatedUsers});
            setCurrentUser(newUser);
        }
    };
    
    const handleLogout = () => {
        setCurrentUser(null);
        setCurrentPage('dashboard');
    };

    const updateAppData = useCallback((newAppData) => {
        setAppData(newAppData);
        db.save(newAppData);
    }, []);

    const updateUser = useCallback((updatedData) => {
        if (!currentUser || !appData) return;
        const newAppData = { ...appData };
        const userIndex = newAppData.users.findIndex(u => u.rollNumber === currentUser.rollNumber);
        if (userIndex !== -1) {
            newAppData.users[userIndex] = { ...newAppData.users[userIndex], ...updatedData };
            setCurrentUser(newAppData.users[userIndex]);
            updateAppData(newAppData);
        }
    }, [currentUser, appData, updateAppData]);
    
    const handleDeleteUser = useCallback((rollNumberToDelete) => {
        if (window.confirm(`Are you sure you want to delete user with Roll Number ${rollNumberToDelete}? This action cannot be undone.`)) {
            const updatedUsers = appData.users.filter(user => user.rollNumber !== rollNumberToDelete);
            updateAppData({ ...appData, users: updatedUsers });
        }
    }, [appData, updateAppData]);

    const handleSendWarning = useCallback((rollNumber, message) => {
        if (!message.trim()) {
            alert("Warning message cannot be empty.");
            return;
        }
        const newWarning = {
            message,
            date: new Date().toISOString()
        };
        const updatedUsers = appData.users.map(user => {
            if (user.rollNumber === rollNumber) {
                const existingWarnings = user.warnings || [];
                return { ...user, warnings: [...existingWarnings, newWarning] };
            }
            return user;
        });
        updateAppData({ ...appData, users: updatedUsers });
        alert("Warning sent successfully!");
    }, [appData, updateAppData]);


    const calculateUserScore = (user) => {
        let totalScore = 0;
        let testCount = 0;
        if (!user || !user.testResults) return 0;
        
        Object.values(user.testResults).forEach((results: any[]) => {
            results.forEach(result => {
                if (typeof result.score === 'number' && !isNaN(result.score)) {
                    totalScore += result.score;
                    testCount++;
                }
            });
        });

        return testCount > 0 ? Math.round(totalScore / testCount) : 0;
    };

    const checkAndAwardBadges = (user, testType, testResults) => {
        let newBadges = [];
        const {unlockedBadges = [], testResults: allResults = {}} = user;

        if (!unlockedBadges.includes('first_step')) newBadges.push('first_step');

        const completedPsychTests = ['TAT', 'WAT', 'SRT', 'SDT'].filter(t => allResults[t]?.length > 0);
        if (completedPsychTests.length === 4 && !unlockedBadges.includes('psych_initiate')) newBadges.push('psych_initiate');

        if (allResults.TAT?.length >= 5 && !unlockedBadges.includes('story_weaver')) newBadges.push('story_weaver');
        if (allResults.WAT?.length >= 5 && !unlockedBadges.includes('word_warrior')) newBadges.push('word_warrior');
        if (testType === 'Lecturerette' && !unlockedBadges.includes('orator_apprentice')) newBadges.push('orator_apprentice');
        if (testType === 'Interview' && !unlockedBadges.includes('interviewer_ace')) newBadges.push('interviewer_ace');

        if (newBadges.length > 0) {
            updateUser({ unlockedBadges: [...unlockedBadges, ...newBadges] });
        }
    };
    
    const handleCompleteTest = async (testType, data) => {
        setCurrentTest(null);
        setCurrentPage('dashboard');
        
        const result = {
            date: new Date().toISOString(),
            ...data
        };
        
        const existingResults = currentUser.testResults?.[testType] || [];
        const newResults = [...existingResults, result];
        const updatedTestResults = {...currentUser.testResults, [testType]: newResults};

        updateUser({ testResults: updatedTestResults });

        setIsFeedbackLoading(true);
        setCurrentModal('ViewFeedback');
        setModalData({ isLoading: true });

        const feedback = await getAIAssessment(testType, data, currentUser.persona);
        
        const latestUser = appData.users.find(u => u.rollNumber === currentUser.rollNumber);
        
        // FIX: Add a guard clause to prevent crash if user is not found after async operation.
        if (!latestUser) {
            console.error("User not found after AI feedback generation. Aborting test completion.");
            setModalData({ error: "Your user data could not be found after the test. Please check your results on the dashboard." });
            setIsFeedbackLoading(false);
            return;
        }

        // FIX: Safely access test results to prevent crashes.
        const testResultsForType = latestUser.testResults?.[testType] || [];
        const finalResultsForTest = testResultsForType.map(r => r.date === result.date ? { ...r, feedback } : r);
        const finalTestResults = { ...(latestUser.testResults || {}), [testType]: finalResultsForTest };
        
        const updatedUserWithFeedback = { ...latestUser, testResults: finalTestResults };
        const score = calculateUserScore(updatedUserWithFeedback);
        checkAndAwardBadges(updatedUserWithFeedback, testType, finalTestResults);
        
        updateUser({ testResults: finalTestResults, score });

        setModalData(feedback);
        setIsFeedbackLoading(false);
    };
    
     const calculateOLQScores = (user) => {
        // FIX: Argument of type 'unknown' is not assignable to parameter of type 'number'.
        // Explicitly cast the initial value of the reduce function to ensure olqCounts is correctly typed.
        const olqCounts = OLQ_LIST.reduce((acc, olq) => ({ ...acc, [olq]: 0 }), {} as Record<string, number>);
        if (!user || !user.testResults) return olqCounts;

        Object.values(user.testResults).forEach((results: any[]) => {
            results.forEach(result => {
                if (result.feedback && Array.isArray(result.feedback.olqs_demonstrated)) {
                    result.feedback.olqs_demonstrated.forEach(olq => {
                        if (olqCounts[olq] !== undefined) {
                            olqCounts[olq]++;
                        }
                    });
                }
            });
        });

        const maxCount = Math.max(1, ...Object.values(olqCounts));
        
        const normalizedScores = OLQ_LIST.reduce((acc, olq) => ({
            ...acc,
            [olq]: olqCounts[olq] / maxCount
        }), {} as Record<string, number>);
        
        return normalizedScores;
    };
    
    const handleUpdateContent = (type, newContent) => {
        const newAppData = { ...appData, content: { ...appData.content, [type]: newContent }};
        setAppData(newAppData);
        db.save(newAppData);
    };

    const handleManageContent = (type) => {
        setCurrentModal(`Manage${type}`);
    };
    
    const handleGetBriefing = async () => {
        setCurrentAffairsData({ briefing: null, isLoading: true });
        const prompt = `Provide a current affairs briefing for today. The response must be a single JSON object inside a markdown code block. The JSON object should contain: 1. A "summaries" key with an array of 5 objects, each with a "headline" and a short "summary" of a major national or international news story. 2. A "quiz" key with an array of 5 multiple-choice questions based on these summaries. Each question object should have a "question", an array of 4 "options", and the correct "answer" string.`;
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });
            const jsonString = response.text.match(/```json\n([\s\S]*?)\n```/)?.[1];
            if (jsonString) {
                const parsedData = JSON.parse(jsonString);
                setCurrentAffairsData({ briefing: parsedData, isLoading: false });
            } else {
                throw new Error("Failed to parse JSON from AI response.");
            }
        } catch (error) {
            console.error("Current affairs briefing error:", error);
            setCurrentAffairsData({ briefing: null, isLoading: false });
            alert("Failed to fetch news. Please try again.");
        }
    };
    
    const handleSavePiq = (piqData) => updateUser({ piqData });

    const handleInterviewComplete = (transcript) => {
         handleCompleteTest('Interview', {
            transcript,
            piqData: currentUser.piqData,
            score: 0 // Placeholder, will be updated by feedback
        });
    };
    
    const handleSendMessage = (senderRoll, receiverRoll, message) => {
        const chatKey = [senderRoll, receiverRoll].sort().join('_');
        const newAppData = { ...appData };
        if (!newAppData.chats[chatKey]) {
            newAppData.chats[chatKey] = [];
        }
        newAppData.chats[chatKey].push(message);
        setAppData(newAppData);
        db.save(newAppData);
    };
    
    const toggleNavSection = (sectionId) => {
        setOpenNavSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
    };

    const renderPage = () => {
        if (currentTest) {
            switch(currentTest.type) {
                case 'TAT': return <TestRunner testType="TAT" data={content.tat_images} timeLimit={270} onComplete={(responses) => handleCompleteTest('TAT', { responses, score: 0 })} />;
                case 'WAT': return <TestRunner testType="WAT" data={content.wat_words} timeLimit={15} onComplete={(responses) => handleCompleteTest('WAT', { responses, score: 0 })} />;
                case 'SRT': return <TestRunner testType="SRT" data={content.srt_scenarios} timeLimit={30} onComplete={(responses) => handleCompleteTest('SRT', { responses, score: 0 })} />;
                case 'SDT': return <SDTView onComplete={(responses) => handleCompleteTest('SDT', { responses, score: 0 })} />;
                case 'Lecturerette': return <LectureretteView topics={content.lecturerette_topics} onComplete={(transcript) => handleCompleteTest('Lecturerette', { transcript, score: 0 })} />;
                case 'OIR': return <OIRTestRunner questions={OIR_QUESTIONS_DEFAULT} onComplete={(score, answers) => handleCompleteTest('OIR', { score, answers })} />;
                case 'GPE': return <GPEView scenario={GPE_SCENARIOS_DEFAULT[0]} onComplete={(plan) => handleCompleteTest('GPE', { plan, scenario: GPE_SCENARIOS_DEFAULT[0], score: 0 })} />;
                case 'Interview': return <VoiceInterviewSimulator piqData={currentUser.piqData} onComplete={handleInterviewComplete} />;
            }
        }

        switch(currentPage) {
            case 'dashboard': return <Dashboard user={currentUser} onManage={handleManageContent} onNavigate={setCurrentPage} onPersonaChange={(persona) => updateUser({ persona })} />;
            case 'leaderboard': return <Leaderboard users={users} />;
            case 'profile': return <ProfilePage user={currentUser} onUpdateUser={updateUser} />;
            case 'interview': return <InterviewPage user={currentUser} onSavePiq={handleSavePiq} onStartInterview={() => setCurrentTest({ type: 'Interview' })} onViewFeedback={(fb) => { setCurrentModal('ViewFeedback'); setModalData(fb); }}/>;
            case 'captain nox': return <CaptainNox user={currentUser} calculateOLQScores={calculateOLQScores} />;
            case 'olq dashboard': return <OLQDashboard user={currentUser} calculateOLQScores={calculateOLQScores} />;
            case 'current affairs': return <CurrentAffairsView onGetBriefing={handleGetBriefing} briefingData={currentAffairsData} />;
            case 'topic briefer': return <TopicBrieferView />;
            case 'community': return <CommunityPage user={currentUser} users={users} chats={chats} onSendMessage={handleSendMessage} />;
            case 'admin': return <AdminPanel users={users} chats={chats} onDeleteUser={handleDeleteUser} onSendWarning={handleSendWarning} />;
            
            // Test start pages
            case 'tat':
            case 'wat':
            case 'srt':
            case 'sdt':
            case 'oir':
            case 'gpe':
            case 'lecturerette':
                return (
                    <div className="card text-center">
                        <h2>{currentPage.toUpperCase()} Test</h2>
                        <p>Ready to begin?</p>
                        <button className="btn btn-primary" onClick={() => setCurrentTest({ type: currentPage.toUpperCase() })}>Start Test</button>
                    </div>
                );
            default: return <Dashboard user={currentUser} onManage={handleManageContent} onNavigate={setCurrentPage} onPersonaChange={(persona) => updateUser({ persona })} />;
        }
    };
    
    const renderModal = () => {
        switch(currentModal) {
            case 'ViewFeedback': return <FeedbackModal feedback={modalData} onClose={() => setCurrentModal(null)} />;
            case 'ManageTAT': return <ManageTatModal images={content.tat_images} onClose={() => setCurrentModal(null)} onAdd={(url) => handleUpdateContent('tat_images', [...content.tat_images, url])} onRemove={(index) => handleUpdateContent('tat_images', content.tat_images.filter((_, i) => i !== index))} />;
            case 'ManageWAT': return <ManageContentModal title="Manage WAT Words" items={content.wat_words} type="WAT" onClose={() => setCurrentModal(null)} onAdd={(item) => handleUpdateContent('wat_words', [...content.wat_words, item])} onRemove={(index) => handleUpdateContent('wat_words', content.wat_words.filter((_, i) => i !== index))} onAddMultiple={(items) => handleUpdateContent('wat_words', [...content.wat_words, ...items])} />;
            case 'ManageSRT': return <ManageContentModal title="Manage SRT Scenarios" items={content.srt_scenarios} type="SRT" onClose={() => setCurrentModal(null)} onAdd={(item) => handleUpdateContent('srt_scenarios', [...content.srt_scenarios, item])} onRemove={(index) => handleUpdateContent('srt_scenarios', content.srt_scenarios.filter((_, i) => i !== index))} onAddMultiple={(items) => handleUpdateContent('srt_scenarios', [...content.srt_scenarios, ...items])} />;
            case 'ManageLecturerette': return <ManageContentModal title="Manage Lecturerette Topics" items={content.lecturerette_topics} type="Lecturerette" onClose={() => setCurrentModal(null)} onAdd={(item) => handleUpdateContent('lecturerette_topics', [...content.lecturerette_topics, item])} onRemove={(index) => handleUpdateContent('lecturerette_topics', content.lecturerette_topics.filter((_, i) => i !== index))} onAddMultiple={(items) => handleUpdateContent('lecturerette_topics', [...content.lecturerette_topics, ...items])} />;
            default: return null;
        }
    };
    
    if (!appData) {
        return <div className="app-loading-screen"><div className="loading-spinner"></div><h2>Initializing NOX...</h2></div>;
    }

    if (!currentUser) {
        return <LoginPage onLogin={handleLogin} />;
    }
    
    const navLinks = [
        { id: 'dashboard', name: 'Dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
        { id: 'psychology', name: 'Psychology Tests', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6.14-2.88C7.55 15.8 9.68 15 12 15s4.45.8 6.14 2.12C16.43 19.18 14.03 20 12 20z', children: [
            { id: 'tat', name: 'TAT' },
            { id: 'wat', name: 'WAT' },
            { id: 'srt', name: 'SRT' },
            { id: 'sdt', name: 'SDT' },
        ]},
        { id: 'gto', name: 'GTO Tasks', icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V18h14v-1.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V18h6v-1.5c0-2.33-4.67-3.5-7-3.5z', children: [
            { id: 'gpe', name: 'GPE' },
            { id: 'lecturerette', name: 'Lecturerette' },
        ]},
        { id: 'interview', name: 'Interview', icon: 'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z' },
        { id: 'oir', name: 'OIR Test', icon: 'M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z' },
        { id: 'knowledge', name: 'Knowledge Base', icon: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z', children: [
            { id: 'current affairs', name: 'Current Affairs' },
            { id: 'topic briefer', name: 'Topic Briefer' },
        ]},
        { id: 'leaderboard', name: 'Leaderboard', icon: 'M10 20H4V4h6v16zm2 0h6V4h-6v16zm8-16v16h6V4h-6z' },
        { id: 'community', name: 'Community Hub', icon: 'M16.5 12c1.38 0 2.5-1.12 2.5-2.5S17.88 7 16.5 7C15.12 7 14 8.12 14 9.5s1.12 2.5 2.5 2.5zM9 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm7.5 3c-1.83 0-5.5.92-5.5 2.75V18h11v-1.25c0-1.83-3.67-2.75-5.5-2.75zM9 13c-2.33 0-7 1.17-7 3.5V18h7v-1.5c0-.83.43-1.58 1.12-2.09-.9-.33-1.95-.51-3.12-.51z' },
    ];
    
    return (
        <div className="app-layout">
            <nav className="sidebar">
                <div className="sidebar-header">NOX</div>
                <div className="sidebar-nav">
                     <ul className="sidebar-nav-list">
                        {navLinks.map(link => (
                            <li key={link.id} className="nav-item">
                                <a href="#" onClick={(e) => {
                                    e.preventDefault();
                                    if (link.children) {
                                        toggleNavSection(link.id);
                                    } else {
                                        setCurrentPage(link.id);
                                        setCurrentTest(null);
                                    }
                                }} className={`nav-link ${(currentPage === link.id || link.children?.some(c => c.id === currentPage)) ? 'active' : ''}`}>
                                    <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d={link.icon}></path></svg>
                                    <span className="nav-text">{link.name}</span>
                                    {link.children && <svg className={`nav-chevron ${openNavSections[link.id] ? 'open' : ''}`} viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"></path></svg>}
                                </a>
                                {link.children && (
                                    <ul className={`submenu ${openNavSections[link.id] ? 'open' : ''}`}>
                                        {link.children.map(child => (
                                            <li key={child.id} className="nav-item-child">
                                                <a href="#" onClick={(e) => {e.preventDefault(); setCurrentPage(child.id); setCurrentTest(null);}} className={`nav-link-child ${currentPage === child.id ? 'active' : ''}`}>
                                                    {child.name}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                        ))}
                         {currentUser.rollNumber === "1" && (
                             <li className="nav-item">
                                <a href="#" onClick={(e) => { e.preventDefault(); setCurrentPage('admin'); }} className={`nav-link ${currentPage === 'admin' ? 'active' : ''}`}>
                                     <svg className="nav-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69-.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"></path></svg>
                                    <span className="nav-text">Admin Panel</span>
                                </a>
                            </li>
                        )}
                    </ul>
                </div>
                <div className="sidebar-footer">
                    <div className="sidebar-user-profile">
                         <img src={currentUser.profilePic || DEFAULT_PROFILE_PIC} alt="Profile" className="sidebar-profile-pic" onClick={() => setCurrentPage('profile')} />
                         <p className="sidebar-user-name">{currentUser.name}</p>
                         <p className="sidebar-user-roll">Roll: {currentUser.rollNumber}</p>
                    </div>
                    <button onClick={handleLogout} className="btn-danger">Logout</button>
                </div>
            </nav>
            <main className="main-content">
                {renderPage()}
            </main>
            {renderModal()}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);