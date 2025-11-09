

import { GoogleGenAI, Type, Modality } from "@google/genai";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Let TypeScript know that the 'firebase' global exists from the script tag
declare var firebase: any;

// Let TypeScript know about the webkitSpeechRecognition API
declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
        webkitAudioContext: any;
    }
}


const API_KEY = process.env.API_KEY;

// --- Lazy Initializer for AI SDK ---
let ai;
const getAI = () => {
    if (!ai) {
        if (!API_KEY) {
            throw new Error("Gemini API key not configured.");
        }
        ai = new GoogleGenAI({ apiKey: API_KEY });
    }
    return ai;
};


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
        oir_verbal_questions: OIR_VERBAL_QUESTIONS_BANK,
        oir_non_verbal_questions: OIR_NON_VERBAL_QUESTIONS_BANK,
        gpe_scenarios: GPE_SCENARIOS_DEFAULT,
    }
});

const db = {
    save: (data) => {
        try {
            if (firebase && firebase.apps && firebase.apps.length > 0) {
                firebase.database().ref(DB_KEY).set(data);
            } else {
                console.warn("Firebase not initialized. Data was not saved.");
            }
        } catch (e) {
            console.error("Failed to save data to Firebase", e);
        }
    },
    listen: (callback) => {
        try {
            if (firebase && firebase.apps && firebase.apps.length > 0) {
                const dbRef = firebase.database().ref(DB_KEY);
                dbRef.on('value', (snapshot) => {
                    const data = snapshot.val();
                    const defaultData = getDefaultData();
                    if (data && typeof data === 'object') {
                        const mergedData = {
                            ...defaultData,
                            ...data,
                            users: data.users || defaultData.users,
                            chats: data.chats || defaultData.chats,
                            content: {
                                ...defaultData.content,
                                ...(data.content || {})
                            }
                        };
                        callback(mergedData);
                    } else {
                        callback(defaultData);
                        if (!data) { 
                           db.save(defaultData); 
                        }
                    }
                }, (error) => {
                    console.error("Firebase listener error:", error);
                    callback(getDefaultData());
                });
                
                return () => dbRef.off('value');
            } else {
                throw new Error("Firebase app not initialized. Check your configuration in index.html.");
            }
        } catch(e) {
            console.error("Failed to connect to Firebase", e);
            callback(getDefaultData());
        }
        return () => {};
    }
};


// --- DATA & CONFIG CONSTANTS ---
const TAT_IMAGES_DEFAULT = [
    "https://images.weserv.nl/?url=i.imgur.com/8os3v26.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/m4L35vC.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/T5a2F3s.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/y3J3f7Y.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/eYhPh2T.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/O0B8a4l.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/Jd1mJtL.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/bW3qY0f.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/wP0b6bB.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/c1g2g3H.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/k9f7b1s.jpeg",
    "https://images.weserv.nl/?url=i.imgur.com/5J3e2eF.png"
];
const WAT_WORDS_DEFAULT = ['Duty', 'Courage', 'Team', 'Defeat', 'Lead', 'Responsibility', 'Friend', 'Failure', 'Order', 'Discipline', 'Work', 'Army', 'Risk', 'Success', 'Challenge', 'Honour', 'Sacrifice', 'Tension', 'Brave', 'Win', 'Attack', 'Weapon', 'Strategy', 'Calm', 'Confidence', 'Obstacle', 'Cooperate', 'Help', 'Officer', 'System', 'Possible', 'Worry', 'Afraid', 'Nervous', 'Difficult', 'Obey', 'Command', 'Follow', 'Unity', 'Effort', 'Aim', 'Goal', 'Serious', 'Mature', 'Peace', 'War', 'Nation', 'Sports', 'Love', 'Death'];
const SRT_SCENARIOS_DEFAULT = [
    'You are on your way to an important exam and you see an accident. You are the first person to arrive. What would you do?', 
    'During a group task, your team members are not cooperating. What would you do?',
    'You are the captain of a sports team which is about to lose a crucial match. How will you motivate your team?',
    'While traveling by train, you notice a fellow passenger has left their bag behind. What steps will you take?',
    'You have been assigned a difficult task with a very tight deadline. What is your course of action?'
];
const LECTURERETTE_TOPICS_DEFAULT = ['My Favourite Hobby', 'The Importance of Discipline in Life', 'India in 2047', 'Artificial Intelligence: A Boon or a Bane?', 'My Role Model', 'Indo-China Relations', 'Cyber Security', 'Make in India Initiative'];
const SDT_PROMPTS = ["What do your parents think of you?", "What do your teachers/superiors think of you?", "What do your friends think of you?", "What do you think of yourself? (Your strengths and weaknesses)", "What kind of person would you like to become?"];
const OIR_VERBAL_QUESTIONS_BANK = [
    { type: 'verbal', category: 'Series Completion', question: 'Which number should come next in the series? 2, 6, 12, 20, 30, ?', options: ['42', '40', '36', '48'], answer: '42' },
    { type: 'verbal', category: 'Analogy', question: 'Doctor is to Patient as Lawyer is to ?', options: ['Client', 'Customer', 'Accused', 'Magistrate'], answer: 'Client' },
    { type: 'verbal', category: 'Coding-Decoding', question: 'If "EARTH" is written as "QPMZS", how is "HEART" written in that code?', options: ['SQPZM', 'SQMPZ', 'SPQZM', 'QSPZM'], answer: 'SQPZM' },
    { type: 'verbal', category: 'Direction Sense', question: 'A man facing North turns 90 degrees clockwise, then 180 degrees anti-clockwise. Which direction is he facing now?', options: ['West', 'East', 'North', 'South'], answer: 'West' },
    { type: 'verbal', category: 'Blood Relations', question: 'Pointing to a photograph, a man said, "I have no brother or sister but that man\'s father is my father\'s son." Whose photograph was it?', options: ['His own', 'His Son\'s', 'His Father\'s', 'His Nephew\'s'], answer: 'His Son\'s' },
    ...Array.from({ length: 45 }, (_, i) => ({
      type: 'verbal',
      category: ['Series Completion', 'Analogy', 'Coding-Decoding', 'Odd One Out'][i % 4],
      question: `Sample Verbal Question ${i + 6}.`,
      options: [`Option A`, `Option B`, `Correct Answer`, `Option D`],
      answer: `Correct Answer`
    }))
];
const OIR_NON_VERBAL_QUESTIONS_BANK = [
    { type: 'non-verbal', category: 'Figure Series', question: 'Which figure comes next in the series?', imageUrl: 'https://images.weserv.nl/?url=i.imgur.com/AFIsI5A.png', options: ['https://images.weserv.nl/?url=i.imgur.com/z1vA3qC.png', 'https://images.weserv.nl/?url=i.imgur.com/k9b8d7e.png', 'https://images.weserv.nl/?url=i.imgur.com/o3f4g5h.png', 'https://images.weserv.nl/?url=i.imgur.com/x6j7k8l.png'], answer: 'https://images.weserv.nl/?url=i.imgur.com/k9b8d7e.png' },
    { type: 'non-verbal', category: 'Figure Analogy', question: 'Find the relationship in the first pair and apply it to the second pair.', imageUrl: 'https://images.weserv.nl/?url=i.imgur.com/C5mJ1nB.png', options: ['https://images.weserv.nl/?url=i.imgur.com/T0b1c2D.png', 'https://images.weserv.nl/?url=i.imgur.com/E3f4g5H.png', 'https://images.weserv.nl/?url=i.imgur.com/A6h7i8J.png', 'https://images.weserv.nl/?url=i.imgur.com/L9k0l1M.png'], answer: 'https://images.weserv.nl/?url=i.imgur.com/A6h7i8J.png' },
    ...Array.from({ length: 48 }, (_, i) => ({
      type: 'non-verbal',
      category: ['Figure Series', 'Figure Analogy', 'Odd One Out', 'Mirror Image'][i % 4],
      question: `Which figure completes the pattern? (Sample ${i + 3})`,
      imageUrl: 'https://images.weserv.nl/?url=placehold.co/400x100.png?text=Problem+Figure+' + (i+3),
      options: ['https://images.weserv.nl/?url=placehold.co/150x150.png?text=A', 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=Correct', 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=C', 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=D'],
      answer: 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=Correct'
    }))
];
const GPE_SCENARIOS_DEFAULT = [{
    title: "Flood Rescue Mission",
    mapImage: "https://images.weserv.nl/?url=i.imgur.com/kYqE1wS.png",
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
    group_strategist: { name: "Group Strategist", desc: "Complete your first GPE.", icon: "https://cdn-icons-png.flaticon.com/512/330/330723.png" },
    perfect_oir: { name: "Perfect OIR", desc: "Score 100% in an OIR test.", icon: "https://cdn-icons-png.flaticon.com/512/1683/1683617.png" }
};

const DEFAULT_PROFILE_PIC = 'https://images.weserv.nl/?url=i.imgur.com/V4RclNb.png';

// --- AUDIO HELPERS for LIVE API ---
function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(data, ctx, sampleRate, numChannels) {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createBlob(data) {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


// --- AI INTEGRATION ---
async function fileToGenerativePart(file) {
    const base64EncodedDataPromise = new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
    });
    return {
        inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
    };
}

const getWrittenAssessment = async (testType, questions, userInput) => {
    let questionContext = "";
    switch (testType) {
        case 'TAT': questionContext = "The user was shown 12 standard Thematic Apperception Test pictures and wrote a story for each."; break;
        case 'WAT': questionContext = `The user was given the following words to write sentences for:\n${questions.join(', ')}`; break;
        case 'SRT': questionContext = `The user was given the following situations to react to:\n${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`; break;
    }

    const systemInstruction = `You are an assessment evaluator for user-submitted answers for the SSB ${testType}. Your task is to assess the answers based on the provided questions. Provide your assessment clearly and consistently for each question. Return your entire output as a single block of text in Markdown format. For each item, provide the Original Answer and a detailed Assessment of the demonstrated personality traits and OLQs. At the end, provide a Final Summary of overall strengths and weaknesses.`;
    
    const contents = { parts: [] };
    if (userInput.file) {
        const filePart = await fileToGenerativePart(userInput.file);
        contents.parts.push({ text: `Context: ${questionContext}\n\nPlease analyze the provided file containing handwritten answers.` });
        contents.parts.push(filePart);
    } else {
        let typedAnswers = "";
        if (testType === 'TAT') typedAnswers = userInput.typed.map((story, index) => `Story ${index + 1}:\n${story}\n`).join('\n---\n');
        else if (testType === 'WAT') typedAnswers = Object.entries(userInput.typed).map(([word, sentence]) => `${word}: ${sentence}`).join('\n');
        else if (testType === 'SRT') typedAnswers = Object.entries(userInput.typed).map(([situation, response]) => `Situation: ${situation}\nResponse: ${response}\n`).join('\n---\n');
        contents.parts.push({ text: `Context: ${questionContext}\n\nUser's typed answers:\n${typedAnswers}` });
    }

    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: { systemInstruction: systemInstruction },
        });
        return response.text;
    } catch (error) {
        console.error("Written assessment error:", error);
        return `Error: Failed to get AI assessment. ${error.message}`;
    }
};

const getAIAssessment = async (testType, data) => {
    const olqs = OLQ_LIST.join(', ');
    let content = "";
    let systemInstruction = "";

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            overall_summary: { type: Type.STRING, description: "A brief summary of the performance." },
            olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING }, description: `A list of OLQs demonstrated from this list: ${olqs}` },
            strengths: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } } }, description: "List 2-3 key strengths with examples and the OLQ they relate to." },
            weaknesses: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { point: { type: Type.STRING }, example_olq: { type: Type.STRING } } }, description: "List 2-3 areas for improvement and the OLQ they relate to." },
            actionable_advice: {
                type: Type.OBJECT,
                properties: {
                    what_to_practice: { type: Type.ARRAY, items: { type: Type.STRING } },
                    how_to_improve: { type: Type.ARRAY, items: { type: Type.STRING } },
                    what_to_avoid: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }
        },
        required: ["overall_summary", "olqs_demonstrated", "strengths", "weaknesses", "actionable_advice"]
    };

    switch (testType) {
        case 'SDT':
             systemInstruction = `You are an expert SSB psychologist. Analyze this Self-Description Test (SDT) to assess the candidate's self-awareness and alignment with Officer Like Qualities (OLQs).`;
             content = `Here is the candidate's SDT:\n${Object.entries(data).map(([prompt, description]) => `${prompt}\n- ${description}\n`).join('\n')}\n\nPlease provide your assessment in the required JSON format.`;
             break;
        case 'GPE':
             systemInstruction = `You are an expert GTO (Group Testing Officer). Analyze this solution to a Group Planning Exercise (GPE). Assess planning, resource management, and leadership qualities.`;
             content = `Problem: ${data.problemStatement}\n\nCandidate's Solution:\n${data.solution}\n\nPlease provide your assessment in the required JSON format.`;
             break;
        case 'Lecturerette':
            systemInstruction = "You are an expert GTO. Assess this lecturerette performance based on the provided transcript. Analyze tone, clarity, confidence, structure, and language usage.";
            content = `Topic: ${data.topic}\nTranscript:\n${data.transcript}\n\nProvide your assessment.`;
            (responseSchema.properties as any).content_feedback = { type: Type.STRING, description: "Feedback on the structure and quality/depth of the content." };
            (responseSchema.properties as any).delivery_feedback = { type: Type.STRING, description: "Feedback on delivery, including clarity, confidence, and language." };
            break;
        case 'AIInterview':
            systemInstruction = `You are an expert SSB psychologist and Interviewing Officer. Analyze the following interview transcript and provide a detailed performance analysis of the candidate's personality and Officer Like Qualities (OLQs).`;
            content = `Candidate's PIQ data:\n---\n${JSON.stringify(data.piq, null, 2)}\n---\n\nInterview Transcript:\n---\n${data.transcript.map(t => `${t.speaker === 'ai' ? 'IO' : 'Candidate'}: ${t.text}`).join('\n')}\n---\n\nBased on the PIQ and the transcript, provide your assessment. Focus on communication, confidence, reasoning, and consistency.`;
            const interviewResponseSchema = {
                type: Type.OBJECT,
                properties: {
                    overall_summary: { type: Type.STRING, description: "A brief summary of the candidate's performance, personality, and suitability." },
                    confidence_level: { type: Type.STRING, description: "Rate the candidate's confidence as Low, Medium, or High, and provide specific examples." },
                    power_of_expression: { type: Type.STRING, description: "Assess the clarity, coherence, and impact of the candidate's communication." },
                    olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING }, description: `A list of OLQs that were clearly visible. Use this list: ${olqs}` },
                    areas_for_improvement: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List specific OLQs or behavioral areas where the candidate needs to improve." },
                    detailed_olq_assessment: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { olq: { type: Type.STRING }, assessment: { type: Type.STRING } } }, description: "Provide a detailed assessment for at least 5 key OLQs, referencing their answers where possible." },
                    actionable_advice: { type: Type.STRING, description: "Provide 2-3 concrete tips for the candidate to improve before their actual SSB interview." }
                },
                required: ["overall_summary", "confidence_level", "power_of_expression", "olqs_demonstrated", "areas_for_improvement", "detailed_olq_assessment", "actionable_advice"]
            };
            try {
                const response = await getAI().models.generateContent({
                    model: 'gemini-2.5-pro', contents: {parts: [{text: content}]},
                    config: { systemInstruction, responseMimeType: "application/json", responseSchema: interviewResponseSchema, temperature: 0.5 }
                });
                return JSON.parse(response.text.trim());
            } catch (error) { return { error: `Failed to get AI assessment. Details: ${error.message}` }; }
        case 'OIR':
            systemInstruction = `You are an expert SSB test evaluator. Analyze the user's performance on this Officer Intelligence Rating (OIR) test. Calculate the score, identify weak areas, and suggest improvements.`;
            content = `Test Type: ${data.testType} OIR Test.\n\nResults:\n${data.results.map((r, i) => `Q${i+1} (Category: ${r.question.category}): User answered "${r.userAnswer}", Correct answer was "${r.question.answer}".`).join('\n')}\n\nPlease provide your assessment.`;
            const oirResponseSchema = {
                type: Type.OBJECT,
                properties: {
                    score_percentage: { type: Type.NUMBER, description: "The final score as a percentage." },
                    overall_summary: { type: Type.STRING, description: "A brief summary of the performance, commenting on speed and accuracy." },
                    struggled_topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of question categories where the user made the most mistakes." },
                    improvement_topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List specific topics the user should practice." }
                },
                required: ["score_percentage", "overall_summary", "struggled_topics", "improvement_topics"]
            };
            try {
                const response = await getAI().models.generateContent({
                    model: 'gemini-2.5-flash', contents: {parts: [{text: content}]},
                    config: { systemInstruction, responseMimeType: "application/json", responseSchema: oirResponseSchema }
                });
                return JSON.parse(response.text.trim());
            } catch (error) { return { error: `Failed to get AI assessment. Details: ${error.message}` }; }
        default: return { error: 'Unknown test type' };
    }

    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-pro', contents: {parts: [{text: content}]},
            config: { systemInstruction, responseMimeType: "application/json", responseSchema, temperature: 0.6 }
        });
        return JSON.parse(response.text.trim());
    } catch (error) {
        console.error("AI assessment error:", error);
        return { error: `Failed to get AI assessment. Details: ${error.message}` };
    }
};

const getNewsUpdate = async (topic) => {
    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Provide a concise summary of the latest news and key developments on the topic: "${topic}". Include 3-4 important bullet points. Format it nicely for display using Markdown.`,
        });
        return response.text;
    } catch (error) {
        return "Could not fetch news update at this time.";
    }
};

const getTopicBriefing = async (topic) => {
    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: `Provide a structured briefing on the topic: "${topic}". The briefing should be suitable for a 3-minute talk (lecturerette). Structure it with an introduction, main body with 3-4 key points, and a conclusion.`,
        });
        return response.text;
    } catch (error) {
        return `Error generating briefing for "${topic}".`;
    }
};


// --- HOOKS ---
const useData = () => {
    const [data, setData] = useState(null);
    useEffect(() => {
        const unsubscribe = db.listen(setData);
        return () => unsubscribe();
    }, []);
    const saveData = useCallback((newData) => {
        setData(newData);
        db.save(newData);
    }, []);
    return { data, saveData };
};

const useAuth = (data, saveData) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [error, setError] = useState('');

    const login = (rollNo) => {
        setError('');
        const user = data.users.find(u => u.rollNo === rollNo);
        if (user) setCurrentUser(user);
        else setError('Invalid Roll No.');
    };
    
    const logout = () => setCurrentUser(null);

    const signup = (newUser) => {
        setError('');
        if (data.users.find(u => u.rollNo === newUser.rollNo)) { setError('This Roll No is already registered.'); return; }
        if (data.users.length >= 50) { setError('The roster is full.'); return; }
        const updatedUsers = [...data.users, newUser];
        saveData({ ...data, users: updatedUsers });
        setCurrentUser(newUser);
    };

    const updateUser = (updatedUserData) => {
        const userIndex = data.users.findIndex(u => u.rollNo === updatedUserData.rollNo);
        if (userIndex !== -1) {
            const updatedUsers = [...data.users];
            updatedUsers[userIndex] = updatedUserData;
            saveData({ ...data, users: updatedUsers });
            setCurrentUser(updatedUserData);
        }
    };
    
    const sendFriendRequest = (fromUser, toUser) => {
        if(toUser.friendRequests?.includes(fromUser.rollNo) || toUser.friends?.includes(fromUser.rollNo)) return;
        const updatedToUser = { ...toUser, friendRequests: [...(toUser.friendRequests || []), fromUser.rollNo] };
        const userIndex = data.users.findIndex(u => u.rollNo === toUser.rollNo);
        const updatedUsers = [...data.users];
        updatedUsers[userIndex] = updatedToUser;
        saveData({ ...data, users: updatedUsers });
    };

    const handleFriendRequest = (user, requesterRollNo, accept) => {
        const requester = data.users.find(u => u.rollNo === requesterRollNo);
        if (!requester) return;
        let updatedUser = { ...user, friendRequests: (user.friendRequests || []).filter(roll => roll !== requesterRollNo) };
        let updatedRequester = { ...requester };
        if (accept) {
            updatedUser.friends = [...(updatedUser.friends || []), requesterRollNo];
            updatedRequester.friends = [...(updatedRequester.friends || []), user.rollNo];
        }
        const userIndex = data.users.findIndex(u => u.rollNo === user.rollNo);
        const requesterIndex = data.users.findIndex(u => u.rollNo === requesterRollNo);
        const updatedUsers = [...data.users];
        updatedUsers[userIndex] = updatedUser;
        updatedUsers[requesterIndex] = updatedRequester;
        saveData({ ...data, users: updatedUsers });
        setCurrentUser(updatedUser);
    };

    return { currentUser, login, logout, signup, updateUser, error, sendFriendRequest, handleFriendRequest };
};

const useBadges = (currentUser, updateUser) => {
    const unlockBadge = useCallback((badgeId) => {
        if (currentUser && !currentUser.badges?.includes(badgeId)) {
            const updatedUser = { ...currentUser, badges: [...(currentUser.badges || []), badgeId] };
            updateUser(updatedUser);
        }
    }, [currentUser, updateUser]);
    return { unlockBadge };
};


// --- UI COMPONENTS ---
// FIX: Added type for the 'text' prop to help TypeScript's type inference.
const LoadingSpinner = ({ text }: { text?: string }) => (
    React.createElement("div", { className: "loading-container" },
        React.createElement("div", { className: "loading-spinner" }),
        text && React.createElement("p", null, text)
    )
);

// FIX: Added types for component props using React.PropsWithChildren to correctly handle the 'children' prop.
const Modal = ({ children, onClose, title }: React.PropsWithChildren<{ onClose: any, title: string }>) => (
    React.createElement("div", { className: "modal-overlay", onClick: onClose },
        React.createElement("div", { className: "modal-content", onClick: e => e.stopPropagation() },
            React.createElement("div", { className: "modal-header" },
                React.createElement("h2", null, title),
                React.createElement("button", { className: "close-button", onClick: onClose }, "×")
            ),
            children
        )
    )
);

const FeedbackModal = ({ feedback, testType, onClose }) => {
    if (!feedback) return null;

    const renderContent = () => {
        if (feedback.error) {
            return React.createElement("div", { className: "card" },
                React.createElement("h3", null, testType, " Assessment Failed"),
                React.createElement("p", { className: "login-error" }, feedback.error)
            );
        }
        
        const renderSection = (title, content) => {
            if (!content || (Array.isArray(content) && content.length === 0)) return null;
            return React.createElement("div", { style: { marginBottom: '1rem' } },
                React.createElement("h4", null, title),
                content
            );
        };
        
        return React.createElement(React.Fragment, null,
            renderSection("Overall Summary", React.createElement("p", null, feedback.overall_summary)),
            renderSection("Score", feedback.score_percentage !== undefined && React.createElement("p", null, `You scored ${feedback.score_percentage.toFixed(2)}%`)),
            renderSection("OLQs Demonstrated", React.createElement("div", { className: "olq-tags" }, feedback.olqs_demonstrated?.map((olq, i) => React.createElement("span", { key: i, className: "olq-tag" }, olq)))),
            renderSection("Strengths", React.createElement("ul", null, feedback.strengths?.map((s, i) => React.createElement("li", { key: i }, s.point, s.example_olq ? ` (${s.example_olq})` : '')))),
            renderSection("Areas for Improvement", React.createElement("ul", null, feedback.weaknesses?.map((w, i) => React.createElement("li", { key: i }, w.point, w.example_olq ? ` (${w.example_olq})` : '')))),
            renderSection("Struggled Topics", React.createElement("ul", null, feedback.struggled_topics?.map((topic, i) => React.createElement("li", { key: i }, topic)))),
            renderSection("Topics to Practice", React.createElement("ul", null, feedback.improvement_topics?.map((topic, i) => React.createElement("li", { key: i }, topic)))),
            feedback.actionable_advice && typeof feedback.actionable_advice === 'object' && renderSection("Actionable Advice",
                Object.entries(feedback.actionable_advice).map(([key, value]) => (
                    Array.isArray(value) && value.length > 0 && React.createElement("div", { key: key },
                        React.createElement("h5", null, key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())),
                        React.createElement("ul", null, value.map((item, i) => React.createElement("li", { key: i }, item)))
                    )
                ))
            ),
             feedback.actionable_advice && typeof feedback.actionable_advice === 'string' && renderSection("Actionable Advice", React.createElement("p", null, feedback.actionable_advice))
        );
    };

    return (
        React.createElement(Modal, { onClose, title: `${testType} Feedback`},
            React.createElement("div", { className: "feedback-modal" },
                renderContent(),
                React.createElement("button", { onClick: onClose, className: "btn btn-primary", style: { marginTop: '1.5rem', display: 'block', marginLeft: 'auto', marginRight: 'auto' } }, "Close")
            )
        )
    );
};

const WrittenAssessmentViewer = ({ assessment, onClose }) => (
    React.createElement(Modal, { onClose, title: "Detailed Assessment" },
        React.createElement("div", { className: "assessment-feedback-container" },
            React.createElement("div", { className: "assessment-feedback-content" }, assessment || "No assessment available."),
            React.createElement("button", { onClick: onClose, className: "btn btn-primary", style: { marginTop: '1.5rem' } }, "Close")
        )
    )
);

const AIInterviewSimulator = ({ user, updateUser, unlockBadge, setPage }) => {
    const [status, setStatus] = useState('idle'); // idle, requesting, connecting, running, assessing, complete, error
    const [error, setError] = useState('');
    const [transcript, setTranscript] = useState([]);
    const [finalAssessment, setFinalAssessment] = useState(null);

    const sessionPromiseRef = useRef(null);
    const inputAudioContextRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const streamRef = useRef(null);
    // FIX: Typed the Set to hold AudioBufferSourceNode to allow calling .stop()
    const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef(0);

    const isPiqFilled = useMemo(() => user.piq && Object.keys(user.piq).length > 0 && user.piq.personal?.dob, [user.piq]);

    const cleanup = useCallback(() => {
        if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
        if (mediaStreamSourceRef.current) mediaStreamSourceRef.current.disconnect();
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        if (inputAudioContextRef.current?.state !== 'closed') inputAudioContextRef.current?.close();
        if (outputAudioContextRef.current?.state !== 'closed') outputAudioContextRef.current?.close();
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    }, []);

    const endInterview = useCallback(async () => {
        if (sessionPromiseRef.current) {
            const session = await sessionPromiseRef.current;
            session.close();
        }
        cleanup();
        setStatus('assessing');
        if (transcript.length === 0) {
            setFinalAssessment({ error: "Interview was too short for feedback." });
            setStatus('complete');
            return;
        }
        const feedbackResult = await getAIAssessment('AIInterview', { piq: user.piq, transcript });
        setFinalAssessment(feedbackResult);
        setStatus('complete');
        const testResult = { date: new Date().toISOString(), transcript, feedback: feedbackResult };
        const updatedUser = { ...user, tests: { ...user.tests, aiinterview: [...(user.tests?.aiinterview || []), testResult] } };
        updateUser(updatedUser);
        unlockBadge('first_step');
        unlockBadge('interviewer_ace');
    }, [transcript, user, updateUser, unlockBadge, cleanup]);


    const startInterview = async () => {
        if (!isPiqFilled) return;
        setStatus('requesting');
        setError('');
        try {
            streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            setStatus('connecting');
            inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
            let currentInputTranscription = '', currentOutputTranscription = '';
            sessionPromiseRef.current = getAI().live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                        setStatus('running');
                        const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
                        mediaStreamSourceRef.current = source;
                        const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current = scriptProcessor;
                        scriptProcessor.onaudioprocess = (e) => {
                            const pcmBlob = createBlob(e.inputBuffer.getChannelData(0));
                            sessionPromiseRef.current.then((s) => s.sendRealtimeInput({ media: pcmBlob }));
                        };
                        source.connect(scriptProcessor);
                        scriptProcessor.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message) => {
                        if (message.serverContent?.inputTranscription) currentInputTranscription += message.serverContent.inputTranscription.text;
                        if (message.serverContent?.outputTranscription) currentOutputTranscription += message.serverContent.outputTranscription.text;
                        if (message.serverContent?.turnComplete) {
                            if (currentInputTranscription.trim()) setTranscript(p => [...p, { speaker: 'user', text: currentInputTranscription.trim() }]);
                            if (currentOutputTranscription.trim()) setTranscript(p => [...p, { speaker: 'ai', text: currentOutputTranscription.trim() }]);
                            currentInputTranscription = '';
                            currentOutputTranscription = '';
                        }
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            const ctx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                            const source = ctx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(ctx.destination);
                            source.addEventListener('ended', () => { sourcesRef.current.delete(source); });
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }
                        if (message.serverContent?.interrupted) {
                            sourcesRef.current.forEach(s => s.stop());
                            sourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e) => { setError('A connection error occurred.'); cleanup(); setStatus('error'); },
                    onclose: () => {},
                },
                config: {
                    responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
                    systemInstruction: `You are an expert SSB Interviewing Officer (IO), Colonel Sharma. Greet the candidate, ${user.name}, and start a standard personal interview based on their PIQ data. Ask follow-up questions to test honesty, clarity, and reasoning. Maintain a formal but conversational tone. Do not provide feedback. The interview should last 5-10 minutes. End by thanking the candidate.`,
                },
            });
        } catch (err) {
            setError("Could not access microphone. Check permissions.");
            setStatus('error');
        }
    };
    
    useEffect(() => {
        return () => {
            if (sessionPromiseRef.current) sessionPromiseRef.current.then(s => s.close());
            cleanup();
        };
    }, [cleanup]);

    const renderContent = () => {
        if (!isPiqFilled) {
            return React.createElement("div", { className: "text-center" },
                React.createElement("h2", null, "PIQ Form Required"),
                React.createElement("p", { style: { margin: '1rem 0' } }, "Complete your Personal Information Questionnaire (PIQ) before starting."),
                React.createElement("button", { onClick: () => setPage('piq'), className: "btn btn-primary" }, "Go to PIQ Form")
            );
        }

        switch (status) {
            case 'idle':
                return React.createElement("div", { className: "text-center" },
                    React.createElement("h2", null, "AI Interview Simulator"),
                    React.createElement("p", { style: { margin: '1rem 0' } }, "Practice with an AI Interviewing Officer based on your PIQ form."),
                    React.createElement("button", { onClick: startInterview, className: "btn btn-primary" }, "Start Interview")
                );
            case 'requesting':
            case 'connecting':
            case 'running':
                return React.createElement("div", { className: "interview-container" },
                    React.createElement("div", { className: "interview-transcript" },
                        transcript.length > 0 ? transcript.map((t, i) => (
                             React.createElement("div", { key: i, className: `chat-bubble ${t.speaker}` }, t.text)
                        )) : React.createElement("div", { className: "transcript-placeholder" }, 
                              React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24" }, React.createElement("path", { fill:"currentColor", d:"M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" })),
                              React.createElement("h4", null, status === 'running' ? "Start speaking..." : "Please wait...")
                        )
                    ),
                    React.createElement("div", { className: "interview-controls" },
                        React.createElement("span", { className: `interview-status-text ${status}`}, { requesting: "Requesting mic...", connecting: "Connecting...", running: "Interview in progress..." }[status]),
                        React.createElement("button", { onClick: endInterview, className: "btn btn-danger" }, "End Interview")
                    )
                );
            case 'assessing': return React.createElement(LoadingSpinner, { text: "Analyzing your interview performance..." });
            case 'complete': return React.createElement(FeedbackModal, { feedback: finalAssessment, testType: "AI Interview", onClose: () => setPage('dashboard') });
            case 'error':
                 return React.createElement("div", { className: "text-center" },
                    React.createElement("h2", { style: {color: 'var(--danger-color)'} }, "An Error Occurred"),
                    React.createElement("p", { className: "login-error" }, error),
                    React.createElement("button", { onClick: () => setStatus('idle'), className: "btn btn-secondary" }, "Try Again")
                );
            default: return null;
        }
    };
    
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "AI Interview Simulator"),
        React.createElement("div", { className: "card" }, renderContent())
    );
};

const Leaderboard = ({ users, currentUser }) => {
    const sortedUsers = useMemo(() => [...users].sort((a, b) => (b.badges?.length || 0) - (a.badges?.length || 0)), [users]);
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Leaderboard"),
        React.createElement("div", { className: "card" },
            React.createElement("p", { style: { marginBottom: '1.5rem' } }, "Rankings are based on badges earned."),
            React.createElement("table", { className: "leaderboard-table" },
                React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Rank"), React.createElement("th", null, "Aspirant"), React.createElement("th", null, "Badges"))),
                React.createElement("tbody", null,
                    sortedUsers.map((user, index) => (
                        React.createElement("tr", { key: user.rollNo, className: user.rollNo === currentUser.rollNo ? 'current-user' : '' },
                            React.createElement("td", { className: 'rank' }, index + 1),
                            React.createElement("td", null, user.name),
                            React.createElement("td", null, user.badges?.length || 0)
                        )
                    ))
                )
            )
        )
    );
};

const AdminPanel = ({ data, saveData }) => {
    const [currentTab, setCurrentTab] = useState('users');
    const [selectedUser, setSelectedUser] = useState(null);

    const handleContentUpdate = (category, newItems) => {
        const newData = { ...data, content: { ...data.content, [category]: newItems } };
        saveData(newData);
    };

    const renderContentManager = (category, items) => {
        const [newItem, setNewItem] = useState('');
        const handleAdd = () => {
            if (newItem.trim()) {
                handleContentUpdate(category, [...items, newItem.trim()]);
                setNewItem('');
            }
        };
        const handleRemove = (index) => {
            handleContentUpdate(category, items.filter((_, i) => i !== index));
        };
        return React.createElement("div", null,
            React.createElement("ul", { className: 'content-list' }, items.map((item, i) => React.createElement("li", { key: i, className: 'content-list-item' }, React.createElement("span", { className: 'item-text' }, item), React.createElement("button", { onClick: () => handleRemove(i) }, "Remove")))),
            React.createElement("div", { className: 'add-item-form' }, React.createElement("input", { type: 'text', value: newItem, onChange: e => setNewItem(e.target.value), placeholder: `New ${category.replace('_', ' ')}...` } as any), React.createElement("button", { onClick: handleAdd }, "Add"))
        );
    };

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Admin Panel"),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "community-tabs" },
                React.createElement("button", { className: currentTab === 'users' ? 'active' : '', onClick: () => setCurrentTab('users') }, "Users"),
                React.createElement("button", { className: currentTab === 'content' ? 'active' : '', onClick: () => setCurrentTab('content') }, "Content Management")
            ),
            currentTab === 'users' && React.createElement("div", { className: 'admin-container' },
                React.createElement("div", { className: "admin-user-list" },
                    React.createElement("h4", null, "All Users"),
                    React.createElement("ul", null, data.users.map(u => React.createElement("li", { key: u.rollNo, className: selectedUser?.rollNo === u.rollNo ? 'active' : '', onClick: () => setSelectedUser(u) }, u.name)))
                ),
                React.createElement("div", null,
                    React.createElement("h4", null, "User Details"),
                    selectedUser ? React.createElement("div", { className: 'admin-user-details' }, React.createElement("pre", null, JSON.stringify(selectedUser, null, 2))) : React.createElement("p", null, "Select a user to view details.")
                )
            ),
            currentTab === 'content' && React.createElement("div", { className: 'admin-tab-content' },
                React.createElement("h3", null, "Manage Test Content"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", null, React.createElement("h4", null, "WAT Words"), renderContentManager('wat_words', data.content.wat_words)),
                    React.createElement("div", null, React.createElement("h4", null, "SRT Scenarios"), renderContentManager('srt_scenarios', data.content.srt_scenarios)),
                    React.createElement("div", null, React.createElement("h4", null, "Lecturerette Topics"), renderContentManager('lecturerette_topics', data.content.lecturerette_topics))
                )
            )
        )
    )
};

const Dashboard = ({ user, setPage }) => {
    const testTypes = ['tat', 'wat', 'srt', 'sdt', 'oir', 'lecturerette', 'gpe', 'ai_interview'];
    const completedTests = testTypes.filter(type => user.tests && user.tests[type]?.length > 0);
    const overallProgress = (completedTests.length / testTypes.length) * 100;
    
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Welcome, ", user.name, "!"),
        React.createElement("div", { className: "dashboard-grid" },
            React.createElement("div", { className: "card" },
                React.createElement("h2", null, "Overall Progress"),
                React.createElement("div", { className: "progress-bar-container" },
                    React.createElement("div", { className: "progress-bar-fill", style: { width: `${overallProgress}%` } })
                ),
                React.createElement("p", { className: "progress-label" }, `${completedTests.length} of ${testTypes.length} test types attempted`)
            ),
            React.createElement("div", { className: "card badges-section" },
                React.createElement("h2", null, "My Badges"),
                React.createElement("div", { className: "badges-grid" }, 
                    Object.entries(BADGES).map(([id, badge]) => 
                        React.createElement("div", { key: id, className: `badge ${user.badges?.includes(id) ? 'unlocked' : ''}` },
                            React.createElement("img", { src: badge.icon, alt: badge.name, className: "badge-icon" }),
                            React.createElement("span", { className: "badge-name" }, badge.name),
                            React.createElement("div", { className: "badge-tooltip" }, 
                                React.createElement("strong", null, badge.name),
                                React.createElement("p", null, badge.desc)
                            )
                        )
                    )
                )
            ),
            React.createElement("div", { className: "card" },
                React.createElement("h2", null, "Recent Activity"),
                /* Placeholder for recent activity feed */
                React.createElement("p", {className: 'no-history' }, "Your recent test attempts will appear here.")
            )
        )
    );
};

const PsychTestRunner = ({ user, updateUser, unlockBadge, setPage, testType, items, stimulus, timerDuration, itemDuration }) => {
    const [status, setStatus] = useState('idle'); // idle, running, finished
    const [currentItem, setCurrentItem] = useState(0);
    const [timeLeft, setTimeLeft] = useState(itemDuration);
    const [responses, setResponses] = useState({});
    const [inputType, setInputType] = useState('type'); // 'type' or 'upload'
    const [uploadedFile, setUploadedFile] = useState(null);
    const [showAssessment, setShowAssessment] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (status !== 'running') return;
        if (timeLeft <= 0) {
            if (currentItem < items.length - 1) {
                setCurrentItem(prev => prev + 1);
                setTimeLeft(itemDuration);
            } else {
                setStatus('finished');
            }
        }
        const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [status, timeLeft, currentItem, items.length, itemDuration]);

    const handleResponseChange = (e) => {
        setResponses(prev => ({...prev, [items[currentItem]]: e.target.value }));
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        // FIX: Changed to `const` and typed as `any` to allow adding the `assessment` property.
        const testResult: any = {
            date: new Date().toISOString(),
            responses: inputType === 'type' ? responses : { file: uploadedFile.name },
            inputType
        };
        
        let assessment;
        if (inputType === 'upload') {
            assessment = await getWrittenAssessment(testType.toUpperCase(), items, { file: uploadedFile });
        } else {
            assessment = await getWrittenAssessment(testType.toUpperCase(), items, { typed: responses });
        }
        
        testResult.assessment = assessment;
        setAssessmentResult(assessment);
        
        const updatedUser = {
            ...user,
            tests: {
                ...user.tests,
                [testType]: [...(user.tests?.[testType] || []), testResult]
            }
        };
        updateUser(updatedUser);
        unlockBadge('first_step');
        setIsLoading(false);
        setShowAssessment(true);
    };

    if (isLoading) return React.createElement(LoadingSpinner, { text: `Generating your ${testType.toUpperCase()} assessment...` });
    if (showAssessment) return React.createElement(WrittenAssessmentViewer, { assessment: assessmentResult, onClose: () => setPage('dashboard') });

    if (status === 'idle') {
        return React.createElement("div", { className: "test-runner-container" },
            React.createElement("h1", null, `${testType.toUpperCase()} Test`),
            React.createElement("p", { className: 'test-instructions' }, `You will be shown ${items.length} ${stimulus.type}. You will have ${itemDuration} seconds for each.`),
            React.createElement("h3", null, "Choose your input method:"),
            React.createElement("div", { className: 'input-method-choice' },
                React.createElement("button", { className: `btn ${inputType === 'type' ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setInputType('type') }, "Type Answers"),
                React.createElement("button", { className: `btn ${inputType === 'upload' ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setInputType('upload') }, "Upload Handwritten Sheet")
            ),
            React.createElement("button", { className: "btn btn-primary", style: { marginTop: '2rem' }, onClick: () => setStatus('running') }, "Start Test")
        );
    }
    
    if (status === 'finished') {
        return React.createElement("div", { className: "test-runner-container" },
            React.createElement("h1", null, "Test Complete"),
            inputType === 'type' 
                ? React.createElement("p", null, "Review your answers and submit for assessment.")
                : React.createElement("div", null, 
                    React.createElement("p", null, "Upload your answer sheet to get an AI assessment."),
                    React.createElement("input", { type: "file", accept: "image/*,.pdf", onChange: (e) => setUploadedFile(e.target.files[0]) } as any)
                  ),
            React.createElement("button", { className: "btn btn-primary", onClick: handleSubmit, disabled: inputType === 'upload' && !uploadedFile }, "Submit for Assessment")
        );
    }

    const currentStimulus = items[currentItem];
    return React.createElement("div", { className: "test-runner-container" },
        React.createElement("div", { className: "timer" }, timeLeft),
        React.createElement("div", { className: "test-progress-bar" }, React.createElement("div", { className: "test-progress-bar-inner", style: { width: `${((currentItem + 1) / items.length) * 100}%` } })),
        React.createElement("div", { className: "test-stimulus" },
            stimulus.type === 'image' && React.createElement("img", { id: 'tat-image', src: currentStimulus, alt: `TAT Image ${currentItem + 1}` }),
            stimulus.type === 'word' && React.createElement("h2", { id: 'wat-word' }, currentStimulus),
            stimulus.type === 'scenario' && React.createElement("p", { className: 'srt-situation' }, currentStimulus)
        ),
        inputType === 'type' && React.createElement("textarea", {
            placeholder: stimulus.placeholder,
            value: responses[currentStimulus] || '',
            onChange: handleResponseChange
        } as any)
    );
};

const TATRunner = (props) => React.createElement(PsychTestRunner, { ...props, testType: 'tat', items: props.images, stimulus: { type: 'image', placeholder: "Write your story here..." }, timerDuration: 270, itemDuration: 240 });
const WATRunner = (props) => React.createElement(PsychTestRunner, { ...props, testType: 'wat', items: props.words, stimulus: { type: 'word', placeholder: "Write your sentence here..." }, timerDuration: 900, itemDuration: 15 });
const SRTRunner = (props) => React.createElement(PsychTestRunner, { ...props, testType: 'srt', items: props.scenarios, stimulus: { type: 'scenario', placeholder: "Write your reaction here..." }, timerDuration: 1800, itemDuration: 30 });

const SDTRunner = ({ user, updateUser, unlockBadge, setPage }) => {
    const [responses, setResponses] = useState(user.tests?.sdt?.slice(-1)[0]?.responses || {});
    const [feedback, setFeedback] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (prompt, value) => setResponses(prev => ({...prev, [prompt]: value}));
    
    const handleSubmit = async () => {
        setIsLoading(true);
        const feedbackResult = await getAIAssessment('SDT', responses);
        setFeedback(feedbackResult);
        const testResult = { date: new Date().toISOString(), responses, feedback: feedbackResult };
        const updatedUser = { ...user, tests: { ...user.tests, sdt: [...(user.tests?.sdt || []), testResult] } };
        updateUser(updatedUser);
        unlockBadge('first_step');
        setIsLoading(false);
    };

    if (isLoading) return React.createElement(LoadingSpinner, { text: "Generating SDT feedback..." });
    if (feedback) return React.createElement(FeedbackModal, { feedback, testType: "SDT", onClose: () => setPage('dashboard') });

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Self-Description Test (SDT)"),
        React.createElement("div", { className: "card" },
            React.createElement("p", { style: { marginBottom: '1.5rem' } }, "Provide honest and concise descriptions for each prompt."),
            SDT_PROMPTS.map(prompt => (
                React.createElement("div", { key: prompt, className: 'form-group' },
                    React.createElement("label", null, prompt),
                    React.createElement("textarea", { value: responses[prompt] || '', onChange: e => handleChange(prompt, e.target.value) } as any)
                )
            )),
            React.createElement("button", { onClick: handleSubmit, className: "btn btn-primary" }, "Submit for AI Assessment")
        )
    );
};

const OIRTestRunner = ({ user, updateUser, unlockBadge, setPage, verbalQuestions, nonVerbalQuestions }) => {
    // Component logic here...
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "OIR Test"),
        React.createElement("div", { className: "card" }, React.createElement("p", null, "OIR Test Runner is under construction."))
    );
};

const Lecturerette = ({ user, updateUser, unlockBadge, setPage, topics }) => {
    // Component logic here...
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Lecturerette"),
        React.createElement("div", { className: "card" }, React.createElement("p", null, "Lecturerette is under construction."))
    );
};

const GPERunner = ({ user, updateUser, unlockBadge, setPage, scenario }) => {
    const [solution, setSolution] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async () => {
        setIsLoading(true);
        const feedbackResult = await getAIAssessment('GPE', { problemStatement: scenario.problemStatement, solution });
        setFeedback(feedbackResult);
        const testResult = { date: new Date().toISOString(), solution, feedback: feedbackResult };
        const updatedUser = { ...user, tests: { ...user.tests, gpe: [...(user.tests?.gpe || []), testResult] } };
        updateUser(updatedUser);
        unlockBadge('first_step');
        unlockBadge('group_strategist');
        setIsLoading(false);
    };
    
    if (!scenario) return React.createElement("div", null, React.createElement("h1", { className: "page-header" }, "Group Planning Exercise"), React.createElement("div", { className: "card" }, "No GPE scenario available."));
    if (isLoading) return React.createElement(LoadingSpinner, { text: "Generating GPE feedback..." });
    if (feedback) return React.createElement(FeedbackModal, { feedback, testType: "GPE", onClose: () => setPage('dashboard') });

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Group Planning Exercise"),
        React.createElement("div", { className: 'gpe-container' },
            React.createElement("div", { className: "card gpe-problem-pane" },
                React.createElement("h3", null, scenario.title),
                React.createElement("img", { src: scenario.mapImage, alt: "GPE Map", className: 'gpe-map' }),
                React.createElement("div", { className: "gpe-problem-statement" }, React.createElement("p", null, scenario.problemStatement))
            ),
            React.createElement("div", { className: "card gpe-solution-pane" },
                React.createElement("h3", null, "Your Solution"),
                React.createElement("textarea", { placeholder: "Write your detailed plan here...", value: solution, onChange: e => setSolution(e.target.value) } as any),
                React.createElement("button", { onClick: handleSubmit, disabled: !solution, className: "btn btn-primary" }, "Submit for Assessment")
            )
        )
    );
};

const PIQForm = ({ user, onSave, setPage }) => {
    const [piqData, setPiqData] = useState(user.piq || {});
    const handleSave = () => { onSave({ ...user, piq: piqData }); setPage('dashboard'); };
    const handleChange = (section, field, value) => {
        setPiqData(prev => ({...prev, [section]: { ...(prev[section] || {}), [field]: value } }));
    };
    
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Personal Information Questionnaire (PIQ)"),
        React.createElement("div", { className: "card piq-form" },
            React.createElement("p", { style: { marginBottom: '1.5rem' } }, "Fill this form accurately. It's used by the AI for your interview."),
            /* Abridged PIQ form for brevity */
            React.createElement("fieldset", null,
                React.createElement("legend", null, "Personal Details"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Date of Birth"), React.createElement("input", { type: 'date', value: piqData.personal?.dob || '', onChange: e => handleChange('personal', 'dob', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Place of Birth"), React.createElement("input", { type: 'text', placeholder: "City, State", value: piqData.personal?.pob || '', onChange: e => handleChange('personal', 'pob', e.target.value) } as any))
                )
            ),
            React.createElement("fieldset", null,
                React.createElement("legend", null, "Education"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Highest Qualification"), React.createElement("input", { type: 'text', placeholder: "e.g., B.Tech CSE", value: piqData.education?.qualification || '', onChange: e => handleChange('education', 'qualification', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Hobbies"), React.createElement("input", { type: 'text', placeholder: "e.g., Reading, Football", value: piqData.education?.hobbies || '', onChange: e => handleChange('education', 'hobbies', e.target.value) } as any))
                )
            ),
            React.createElement("button", { onClick: handleSave, className: "btn btn-primary" }, "Save PIQ")
        )
    );
};

const ProfilePage = ({ user, onSave }) => {
    const [name, setName] = useState(user.name);
    const [profilePic, setProfilePic] = useState(user.profilePic || DEFAULT_PROFILE_PIC);
    
    const handleSave = () => { onSave({ ...user, name, profilePic }); };
    
    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const storageRef = firebase.storage().ref();
        const fileRef = storageRef.child(`profile_pics/${user.rollNo}`);
        fileRef.put(file).then(() => {
            fileRef.getDownloadURL().then(url => setProfilePic(url));
        });
    };

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "My Profile"),
        React.createElement("div", { className: "card profile-edit-container" },
            React.createElement("div", { className: 'profile-photo-section' },
                React.createElement("img", { src: profilePic, className: "profile-picture", alt: "Profile" }),
                React.createElement("input", { type: 'file', id: 'photo-upload', hidden: true, accept: "image/*", onChange: handlePhotoUpload } as any),
                React.createElement("label", { htmlFor: 'photo-upload', className: "btn btn-secondary" }, "Upload New Photo")
            ),
            React.createElement("div", { className: "profile-details-section" },
                React.createElement("div", { className: 'form-group' },
                    React.createElement("label", null, "Full Name"),
                    React.createElement("input", { type: 'text', value: name, onChange: e => setName(e.target.value) } as any)
                ),
                React.createElement("div", { className: 'form-group' },
                    React.createElement("label", null, "Roll No"),
                    React.createElement("input", { type: 'text', value: user.rollNo, disabled: true } as any)
                ),
                React.createElement("button", { onClick: handleSave, className: "btn btn-primary" }, "Save Changes")
            )
        )
    );
};

const OLQDashboard = ({ user }) => {
    // Basic aggregation logic, would be more complex in a real app
    const olqScores = useMemo(() => {
        const scores = OLQ_LIST.reduce((acc, olq) => ({...acc, [olq]: 0}), {});
        let count = 0;
        // FIX: Added type annotation for testType to resolve forEach error on unknown type.
        Object.values(user.tests || {}).forEach((testType: any[]) => {
            testType.forEach(test => {
                if(test.feedback && !test.feedback.error && test.feedback.olqs_demonstrated) {
                    test.feedback.olqs_demonstrated.forEach(olq => {
                        if (scores[olq] !== undefined) scores[olq]++;
                    });
                    count++;
                }
            });
        });
        // Normalize scores
        Object.keys(scores).forEach(olq => scores[olq] = count > 0 ? (scores[olq] / count) * 5 : 0);
        return scores;
    }, [user.tests]);

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "OLQ Analysis"),
        React.createElement("div", { className: "card" }, "OLQ Dashboard is under construction. It will feature a radar chart visualizing your strengths.")
    );
};

const CurrentAffairs = () => {
    const [news, setNews] = useState({});
    const [loading, setLoading] = useState({});
    const topics = ["National Security", "Indo-Pacific Region", "Defence Technology", "International Relations"];

    const fetchNews = useCallback(async (topic) => {
        setLoading(prev => ({ ...prev, [topic]: true }));
        const update = await getNewsUpdate(topic);
        setNews(prev => ({ ...prev, [topic]: update }));
        setLoading(prev => ({ ...prev, [topic]: false }));
    }, []);

    useEffect(() => {
        fetchNews("General");
    }, [fetchNews]);

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Current Affairs Briefing"),
        React.createElement("div", { className: 'news-grid' },
            /* General news card, etc. */
            topics.map(topic => React.createElement("div", { key: topic, className: 'card news-card' },
                React.createElement("h3", null, topic),
                loading[topic] ? React.createElement(LoadingSpinner, {}) : React.createElement("p", null, news[topic] || "Click to load latest updates."),
                React.createElement("button", { className: 'btn btn-secondary', onClick: () => fetchNews(topic) }, "Refresh")
            ))
        )
    );
};

const TopicBriefer = () => {
    const [topic, setTopic] = useState('');
    const [briefing, setBriefing] = useState('');
    const [loading, setLoading] = useState(false);

    const handleGenerate = async (e) => {
        e.preventDefault();
        if (!topic) return;
        setLoading(true);
        const result = await getTopicBriefing(topic);
        setBriefing(result);
        setLoading(false);
    };

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Topic Briefer"),
        React.createElement("div", { className: 'card' },
            React.createElement("form", { onSubmit: handleGenerate, className: 'topic-briefer-form' },
                React.createElement("input", { type: 'text', value: topic, onChange: e => setTopic(e.target.value), placeholder: "Enter a topic for your lecturerette..." } as any),
                React.createElement("button", { type: "submit", className: 'btn btn-primary', disabled: loading }, "Generate Briefing")
            ),
            loading ? React.createElement(LoadingSpinner, { text: "Generating briefing..." }) :
            briefing && React.createElement("div", { className: 'briefer-content' }, briefing)
        )
    );
};

const CommunityPage = ({ currentUser, allUsers, chats, data, saveData, sendFriendRequest, handleFriendRequest }) => {
    // Component logic here...
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Community Hub"),
        React.createElement("div", { className: "card" }, React.createElement("p", null, "Community features are under construction."))
    );
};

const App = () => {
    if (!API_KEY) {
        return React.createElement("div", { className: "app-loading-screen" },
            React.createElement("h2", { style: { color: 'var(--danger-color)' } }, "Configuration Error"),
            React.createElement("p", { style: { color: 'var(--neutral-light)', maxWidth: '500px', margin: '1rem' } }, "Gemini API Key is missing. Please add it as an environment variable named ", React.createElement("strong", null, "API_KEY"), ".")
        );
    }

    const { data, saveData } = useData();
    const { currentUser, login, logout, signup, updateUser, error, sendFriendRequest, handleFriendRequest } = useAuth(data, saveData);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const { unlockBadge } = useBadges(currentUser, updateUser);

    useEffect(() => {
        document.body.classList.toggle('mobile-nav-is-open', mobileNavOpen);
    }, [mobileNavOpen]);

    if (!data) return React.createElement("div", { className: "app-loading-screen" }, React.createElement(LoadingSpinner, {}), React.createElement("h2", null, "Loading NOX SSB Prep..."));
    // FIX: Removed the `existingUsers` prop as it is not defined on the `LoginScreen` component.
    if (!currentUser) return React.createElement(LoginScreen, { onLogin: login, onSignup: signup, error: error });

    const PageComponent = {
        'dashboard': () => React.createElement(Dashboard, { user: currentUser, setPage: setCurrentPage }),
        'tat': () => React.createElement(TATRunner, { user: currentUser, updateUser, unlockBadge, images: data.content.tat_images, setPage: setCurrentPage }),
        'wat': () => React.createElement(WATRunner, { user: currentUser, updateUser, unlockBadge, words: data.content.wat_words, setPage: setCurrentPage }),
        'srt': () => React.createElement(SRTRunner, { user: currentUser, updateUser, unlockBadge, scenarios: data.content.srt_scenarios, setPage: setCurrentPage }),
        'sdt': () => React.createElement(SDTRunner, { user: currentUser, updateUser, unlockBadge, setPage: setCurrentPage }),
        'oir': () => React.createElement(OIRTestRunner, { user: currentUser, updateUser, unlockBadge, verbalQuestions: data.content.oir_verbal_questions, nonVerbalQuestions: data.content.oir_non_verbal_questions, setPage: setCurrentPage }),
        'lecturerette': () => React.createElement(Lecturerette, { user: currentUser, updateUser, unlockBadge, topics: data.content.lecturerette_topics, setPage: setCurrentPage }),
        'gpe': () => React.createElement(GPERunner, { user: currentUser, updateUser, unlockBadge, scenario: data.content.gpe_scenarios?.[0], setPage: setCurrentPage }),
        'ai_interview': () => React.createElement(AIInterviewSimulator, { user: currentUser, updateUser, unlockBadge, setPage: setCurrentPage }),
        'piq': () => React.createElement(PIQForm, { user: currentUser, onSave: updateUser, setPage: setCurrentPage }),
        'profile': () => React.createElement(ProfilePage, { user: currentUser, onSave: updateUser }),
        'olq_dashboard': () => React.createElement(OLQDashboard, { user: currentUser }),
        'current_affairs': () => React.createElement(CurrentAffairs, null),
        'topic_briefer': () => React.createElement(TopicBriefer, null),
        'community': () => React.createElement(CommunityPage, { currentUser, allUsers: data.users, chats: data.chats, data, saveData, sendFriendRequest, handleFriendRequest }),
        'leaderboard': () => React.createElement(Leaderboard, { users: data.users, currentUser: currentUser }),
        'admin': () => React.createElement(AdminPanel, { data, saveData }),
    }[currentPage];

    const handleSetPage = (page) => { setCurrentPage(page); setMobileNavOpen(false); };

    return React.createElement("div", { className: "app-layout" },
        mobileNavOpen && React.createElement("div", { className: "nav-overlay", onClick: () => setMobileNavOpen(false) }),
        React.createElement(Sidebar, { user: currentUser, onLogout: logout, currentPage, setPage: handleSetPage, isAdmin: currentUser.isAdmin, friendRequests: currentUser.friendRequests?.length || 0, isOpen: mobileNavOpen, setIsOpen: setMobileNavOpen }),
        React.createElement("main", { className: "main-content" },
            React.createElement(MobileHeader, { onMenuClick: () => setMobileNavOpen(true) }),
            React.createElement(PageComponent, null)
        )
    );
};

const MobileHeader = ({ onMenuClick }) => (
    React.createElement("header", { className: "mobile-header" },
        React.createElement("button", { className: "hamburger-btn", onClick: onMenuClick, "aria-label": "Open navigation menu" }, React.createElement("svg", { xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24" }, React.createElement("path", { d: "M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2Z" }))),
        React.createElement("div", { className: "mobile-header-title" }, "NOX SSB")
    )
);

const LoginScreen = ({ onLogin, onSignup, error }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [rollNo, setRollNo] = useState('');
    const [name, setName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLogin) onLogin(rollNo);
        else onSignup({ rollNo, name, piq: {}, tests: {}, badges: [], isAdmin: rollNo === 'Naveen@5799', createdAt: new Date().toISOString(), profilePic: DEFAULT_PROFILE_PIC });
    };
    
    return React.createElement("div", { className: "login-container" },
        React.createElement("div", { className: "card login-card" },
            React.createElement("h1", null, isLogin ? 'Welcome Back' : 'Join the Squad'),
            React.createElement("p", null, "Your journey to the forces starts here."),
            error && React.createElement("div", { className: "login-error" }, error),
            React.createElement("form", { onSubmit: handleSubmit },
                React.createElement("div", { className: "form-group" },
                    React.createElement("label", { htmlFor: "rollNo" }, "Roll No"),
                    React.createElement("input", { type: "text", id: "rollNo", value: rollNo, onChange: (e) => setRollNo(e.target.value), required: true } as any)
                ),
                !isLogin && React.createElement("div", { className: "form-group" },
                    React.createElement("label", { htmlFor: "name" }, "Full Name"),
                    React.createElement("input", { type: "text", id: "name", value: name, onChange: (e) => setName(e.target.value), required: true } as any)
                ),
                React.createElement("button", { type: "submit", className: "btn btn-primary btn-block" }, isLogin ? 'Login' : 'Sign Up')
            ),
            React.createElement("button", { onClick: () => setIsLogin(!isLogin), style: { background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', marginTop: '1rem'} },
                isLogin ? 'Need an account? Sign Up' : 'Already have an account? Login'
            )
        )
    );
};

const Sidebar = ({ user, onLogout, currentPage, setPage, isAdmin, friendRequests, isOpen, setIsOpen }) => {
    // FIX: Typed the state to allow for string keys, fixing property access errors.
    const [openSubmenus, setOpenSubmenus] = useState<{ [key: string]: boolean }>({});
    const toggleSubmenu = (menu) => setOpenSubmenus(prev => ({ ...prev, [menu]: !prev[menu] }));

    // FIX: Made the `icon` prop optional with a default value of null.
    const NavLink = ({ page, name, icon = null, isChild = false, hasSubmenu = false, submenuKey = '' }) => (
        React.createElement("a", { href: "#", className: `${isChild ? 'nav-link-child' : 'nav-link'} ${currentPage === page ? 'active' : ''}`, onClick: (e) => { e.preventDefault(); if (hasSubmenu) toggleSubmenu(submenuKey); else setPage(page); } } as any,
            icon && React.createElement("svg", { className: "nav-icon", viewBox: "0 0 24 24", fill: "currentColor" }, icon),
            React.createElement("span", { className: "nav-text" }, name),
            hasSubmenu && React.createElement("svg", { className: `nav-chevron ${openSubmenus[submenuKey] ? 'open' : ''}`, viewBox: "0 0 24 24" }, React.createElement("path", { d: "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" }))
        )
    );

    useEffect(() => {
        if (['tat', 'wat', 'srt', 'sdt'].includes(currentPage)) if (!openSubmenus.psych) toggleSubmenu('psych');
        if (['oir', 'lecturerette', 'gpe', 'ai_interview'].includes(currentPage)) if (!openSubmenus.gto) toggleSubmenu('gto');
        if (['current_affairs', 'topic_briefer'].includes(currentPage)) if (!openSubmenus.tools) toggleSubmenu('tools');
    }, [currentPage]);
    
    return React.createElement("aside", { className: `sidebar ${isOpen ? 'mobile-open' : ''}` },
        React.createElement("div", { className: "sidebar-header" }, "NOX SSB", React.createElement("button", { className: "close-nav-btn", onClick: () => setIsOpen(false) }, "×")),
        React.createElement("nav", { className: "sidebar-nav" },
            React.createElement("ul", { className: "sidebar-nav-list" },
                React.createElement("li", { className: "nav-header" }, "Main"),
                React.createElement("li", null, React.createElement(NavLink, { page: "dashboard", name: "Dashboard", icon: React.createElement("path", { d: "M13,3V9H21V3M13,21H21V11H13M3,21H11V15H3M3,13H11V3H3V13Z" }) })),
                React.createElement("li", null, React.createElement(NavLink, { page: "piq", name: "PIQ Form", icon: React.createElement("path", { d: "M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M8,12V14H16V12H8M8,16V18H13V16H8Z" }) })),
                React.createElement("li", null, React.createElement(NavLink, { page: "profile", name: "My Profile", icon: React.createElement("path", { d: "M12,12A5,5 0 0,1 7,7A5,5 0 0,1 12,2A5,5 0 0,1 17,7A5,5 0 0,1 12,12M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" }) })),
                React.createElement("li", { className: "nav-divider" }),
                React.createElement("li", { className: "nav-header" }, "Practice Arena"),
                React.createElement("li", null, React.createElement(NavLink, { page: "", name: "Psychological Tests", icon: React.createElement("path", { d: "M12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,13.5C14.67,13.5 18,15.42 18,17.95V19H6V17.95C6,15.42 9.33,13.5 12,13.5Z" }), hasSubmenu: true, submenuKey: "psych" }),
                    React.createElement("ul", { className: `submenu ${openSubmenus.psych ? 'open' : ''}` },
                        React.createElement("li", null, React.createElement(NavLink, { page: "tat", name: "TAT", isChild: true })),
                        React.createElement("li", null, React.createElement(NavLink, { page: "wat", name: "WAT", isChild: true })),
                        React.createElement("li", null, React.createElement(NavLink, { page: "srt", name: "SRT", isChild: true })),
                        React.createElement("li", null, React.createElement(NavLink, { page: "sdt", name: "SDT", isChild: true }))
                )),
                React.createElement("li", null, React.createElement(NavLink, { page: "", name: "GTO & Interview", icon: React.createElement("path", { d: "M17.5,12A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12M17.5,13C15.83,13 13,13.83 13,15.5V17H22V15.5C22,13.83 19.17,13 17.5,13M6.5,12A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,12M6.5,13C4.83,13 2,13.83 2,15.5V17H11V15.5C11,13.83 8.17,13 6.5,13M12,8A1.5,1.5 0 0,1 13.5,6.5A1.5,1.5 0 0,1 12,5A1.5,1.5 0 0,1 10.5,6.5A1.5,1.5 0 0,1 12,8M12,9C10.33,9 7.5,9.83 7.5,11.5V13H16.5V11.5C16.5,9.83 13.67,9 12,9Z" }), hasSubmenu: true, submenuKey: "gto" }),
                    React.createElement("ul", { className: `submenu ${openSubmenus.gto ? 'open' : ''}` },
                        React.createElement("li", null, React.createElement(NavLink, { page: "oir", name: "OIR Test", isChild: true })),
                        React.createElement("li", null, React.createElement(NavLink, { page: "lecturerette", name: "Lecturerette", isChild: true })),
                        React.createElement("li", null, React.createElement(NavLink, { page: "gpe", name: "GPE", isChild: true })),
                        React.createElement("li", null, React.createElement(NavLink, { page: "ai_interview", name: "AI Interview", isChild: true }))
                )),
                React.createElement("li", { className: "nav-divider" }),
                React.createElement("li", { className: "nav-header" }, "Analysis & Growth"),
                React.createElement("li", null, React.createElement(NavLink, { page: "olq_dashboard", name: "OLQ Analysis", icon: React.createElement("path", { d: "M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" }) })),
                React.createElement("li", null, React.createElement(NavLink, { page: "leaderboard", name: "Leaderboard", icon: React.createElement("path", { d: "M16,11.75V13.25L22.25,12L16,10.75V12.25H12V10.75L6,12L12,13.25V11.75H16M12,2L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,2Z" }) })),
                React.createElement("li", null, React.createElement(NavLink, { page: "community", name: "Community", icon: React.createElement("path", { d: "M16 17V19H21V17H16M3 17V19H8V17H3M12 2C9.24 2 7 4.24 7 7S9.24 12 12 12 17 9.76 17 7 14.76 2 12 2M16 7C16 5.34 14.66 4 13 4V10C14.66 10 16 8.66 16 7M8 7C8 8.66 9.34 10 11 10V4C9.34 4 8 5.34 8 7M3 14V16H21V14H3Z" }) })),
                React.createElement("li", { className: "nav-divider" }),
                React.createElement("li", { className: "nav-header" }, "AI Tools"),
                React.createElement("li", null, React.createElement(NavLink, { page: "current_affairs", name: "Current Affairs", icon: React.createElement("path", { d: "M16.5,12A2.5,2.5 0 0,0 19,9.5A2.5,2.5 0 0,0 16.5,7A2.5,2.5 0 0,0 14,9.5A2.5,2.5 0 0,0 16.5,12M9,11A1,1 0 0,0 10,10A1,1 0 0,0 9,9A1,1 0 0,0 8,10A1,1 0 0,0 9,11M20,6L18.5,4.5L19.5,3.5L21,5M19.13,8.87C19.63,8.37 20,7.7 20,7V3H4V7C4,7.7 4.37,8.37 4.87,8.87L6,10V15H8V10L10,8H14L16,10V21H18V10L19.13,8.87Z" }) })),
                React.createElement("li", null, React.createElement(NavLink, { page: "topic_briefer", name: "Topic Briefer", icon: React.createElement("path", { d: "M12,2C6.48,2 2,6.48 2,12C2,17.52 6.48,22 12,22C17.52,22 22,17.52 22,12C22,6.48 17.52,2 12,2M13,17H11V15H13V17M13,13H11V7H13V13Z" }) })),
                isAdmin && React.createElement(React.Fragment, null,
                    React.createElement("li", { className: "nav-divider" }),
                    React.createElement("li", { className: "nav-header" }, "Admin"),
                    React.createElement("li", null, React.createElement(NavLink, { page: "admin", name: "Admin Panel", icon: React.createElement("path", { d: "M12,2L14.39,5.42L18.5,6.13L15.42,9.28L16.36,13.88L12,11.67L7.64,13.88L8.58,9.28L5.5,6.13L9.61,5.42L12,2M12,5.27L10.36,8.75L6.6,9.25L9.5,12.23L8.8,16.25L12,14.27L15.2,16.25L14.5,12.23L17.4,9.25L13.64,8.75L12,5.27Z" }) }))
                )
            )
        ),
        React.createElement("div", { className: "sidebar-footer" },
            React.createElement("div", { className: 'sidebar-user-profile', onClick: () => setPage('profile') },
                React.createElement("img", { src: user.profilePic || DEFAULT_PROFILE_PIC, alt: "Profile", className: 'sidebar-profile-pic' }),
                React.createElement("div", { className: "sidebar-user-name" }, user.name),
                React.createElement("div", { className: "sidebar-user-roll" }, user.rollNo)
            ),
            React.createElement("button", { onClick: onLogout }, "Logout")
        )
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));