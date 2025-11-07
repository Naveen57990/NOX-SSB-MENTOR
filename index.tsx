

import { GoogleGenAI, Type, LiveServerMessage, Modality, Blob, GenerateContentResponse } from "@google/genai";
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';

// Let TypeScript know that the 'firebase' global exists from the script tag
declare var firebase: any;

// Let TypeScript know about the webkitSpeechRecognition API
declare global {
    interface Window {
        webkitSpeechRecognition: any;
        SpeechRecognition: any;
    }
}


const API_KEY = process.env.API_KEY;

// --- Lazy Initializer for AI SDK ---
// This prevents the app from crashing on startup if the API_KEY is not set.
let ai;
const getAI = () => {
    if (!ai) {
        if (!API_KEY) {
            // This is a safeguard; the main App component will render an error message.
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
            // FIX: Check if Firebase app is initialized before trying to save.
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
            // FIX: Check if Firebase app is initialized before trying to listen.
            if (firebase && firebase.apps && firebase.apps.length > 0) {
                const dbRef = firebase.database().ref(DB_KEY);
                dbRef.on('value', (snapshot) => {
                    const data = snapshot.val();
                    const defaultData = getDefaultData();
                    if (data && typeof data === 'object') {
                        // Merge with default data to ensure schema consistency and prevent crashes
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
                        if (!data) { // Save default data only if DB is empty
                           db.save(defaultData); 
                        }
                    }
                }, (error) => {
                    console.error("Firebase listener error:", error);
                    // Fallback to default data on error to prevent app crash
                    callback(getDefaultData());
                });
                
                return () => dbRef.off('value');
            } else {
                // This path is taken when firebaseConfig is a placeholder.
                // Throw an error to be caught, which will log "Failed to connect" and fallback gracefully.
                throw new Error("Firebase app not initialized. Check your configuration in index.html.");
            }
        } catch(e) {
            console.error("Failed to connect to Firebase", e);
            // Fallback for offline or misconfigured firebase
            callback(getDefaultData());
        }
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
    { type: 'verbal', category: 'Odd One Out', question: 'Find the odd one out: ', options: ['Carrot', 'Ginger', 'Potato', 'Tomato'], answer: 'Tomato' },
    { type: 'verbal', category: 'Jumbled Words', question: 'Rearrange the letters "RTA M" to form a meaningful word.', options: ['MART', 'TRAM', 'ARMT', 'RAMT'], answer: 'MART' },
    { type: 'verbal', category: 'Series Completion', question: 'Find the next letters in the series: A, C, F, J, O, ?', options: ['U', 'V', 'T', 'S'], answer: 'U' },
    { type: 'verbal', category: 'Analogy', question: 'Moon is to Satellite as Earth is to ?', options: ['Sun', 'Planet', 'Solar System', 'Asteroid'], answer: 'Planet' },
    // Adding more questions to reach 50+
    ...Array.from({ length: 41 }, (_, i) => ({
      type: 'verbal',
      category: ['Series Completion', 'Analogy', 'Coding-Decoding', 'Odd One Out'][i % 4],
      question: `Sample Verbal Question ${i + 10} of a new category.`,
      options: [`Option A${i}`, `Option B${i}`, `Option C${i}`, `Correct Answer ${i}`],
      answer: `Correct Answer ${i}`
    }))
];

const OIR_NON_VERBAL_QUESTIONS_BANK = [
    { type: 'non-verbal', category: 'Figure Series', question: 'Which figure comes next in the series?', imageUrl: 'https://images.weserv.nl/?url=i.imgur.com/AFIsI5A.png', options: ['https://images.weserv.nl/?url=i.imgur.com/z1vA3qC.png', 'https://images.weserv.nl/?url=i.imgur.com/k9b8d7e.png', 'https://images.weserv.nl/?url=i.imgur.com/o3f4g5h.png', 'https://images.weserv.nl/?url=i.imgur.com/x6j7k8l.png'], answer: 'https://images.weserv.nl/?url=i.imgur.com/k9b8d7e.png' },
    { type: 'non-verbal', category: 'Figure Analogy', question: 'Find the relationship in the first pair and apply it to the second pair.', imageUrl: 'https://images.weserv.nl/?url=i.imgur.com/C5mJ1nB.png', options: ['https://images.weserv.nl/?url=i.imgur.com/T0b1c2D.png', 'https://images.weserv.nl/?url=i.imgur.com/E3f4g5H.png', 'https://images.weserv.nl/?url=i.imgur.com/A6h7i8J.png', 'https://images.weserv.nl/?url=i.imgur.com/L9k0l1M.png'], answer: 'https://images.weserv.nl/?url=i.imgur.com/A6h7i8J.png' },
    { type: 'non-verbal', category: 'Odd One Out', question: 'Which figure is the odd one out?', imageUrl: 'https://images.weserv.nl/?url=i.imgur.com/P4q5r6S.png', options: ['A', 'B', 'C', 'D'], answer: 'C' },
    { type: 'non-verbal', category: 'Mirror Image', question: 'Find the correct mirror image of the given figure.', imageUrl: 'https://images.weserv.nl/?url=i.imgur.com/W7x8y9Z.png', options: ['https://images.weserv.nl/?url=i.imgur.com/a1b2c3D.png', 'https://images.weserv.nl/?url=i.imgur.com/e4f5g6H.png', 'https://images.weserv.nl/?url=i.imgur.com/i7j8k9L.png', 'https://images.weserv.nl/?url=i.imgur.com/m0n1o2P.png'], answer: 'https://images.weserv.nl/?url=i.imgur.com/e4f5g6H.png' },
    // Adding more questions to reach 50+
    ...Array.from({ length: 46 }, (_, i) => ({
      type: 'non-verbal',
      category: ['Figure Series', 'Figure Analogy', 'Odd One Out', 'Mirror Image'][i % 4],
      question: `Which figure completes the pattern? (Sample ${i + 5})`,
      imageUrl: 'https://images.weserv.nl/?url=placehold.co/400x100.png?text=Problem+Figure+' + (i+5),
      options: ['https://images.weserv.nl/?url=placehold.co/150x150.png?text=A', 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=Correct', 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=C', 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=D'],
      answer: 'https://images.weserv.nl/?url=placehold.co/150x150.png?text=Correct'
    }))
];
const GPE_SCENARIOS_DEFAULT = [{
    title: "Flood Rescue Mission",
    mapImage: "https://images.weserv.nl/?url=i.imgur.com/kYqE1wS.png",
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


// --- AI INTEGRATION ---

// Helper to convert file to a Part for the Gemini API
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

const getWrittenAssessment = async (testType, questions, userInput: { typed?: any; file?: File }) => {
    let questionContext = "";
    switch (testType) {
        case 'TAT':
            questionContext = "The user was shown 12 standard Thematic Apperception Test pictures and wrote a story for each.";
            break;
        case 'WAT':
            questionContext = `The user was given the following words to write sentences for:\n${(questions as string[]).join(', ')}`;
            break;
        case 'SRT':
            questionContext = `The user was given the following situations to react to:\n${(questions as string[]).map((q, i) => `${i + 1}. ${q}`).join('\n')}`;
            break;
    }

    const systemInstruction = `You are an assessment evaluator for user-submitted answers for the SSB ${testType}. Users can either type their answers directly or upload an image/PDF of their handwritten answer sheet. Your task is to assess the answers based on the provided questions.

Strict Rules:
1. If the user typed the answers, read and assess the typed responses.
2. If the user uploaded a handwritten answer sheet, read the text from the image/file and assess those answers.
3. Do NOT rewrite, rephrase, or correct any part of the user’s answers, whether typed or handwritten. Maintain all content exactly as you see it.
4. Provide your assessment clearly and consistently for each question.
5. Handle either input mode (typed or uploaded) automatically.

Return your entire output as a single block of text in the following format:

Question Number: [Number]
Original Answer: [Exact text as typed or recognized from handwriting]
Assessment: [Your assessment based on meaning and content only]

... (repeat for all questions) ...

After listing all:
Final Summary: [Brief overall assessment of OLQs demonstrated, strengths, and weaknesses.]`;

    let userPrompt;
    let model = 'gemini-2.5-flash';
    const contents: any = { parts: [] };

    if (userInput.file) {
        const filePart = await fileToGenerativePart(userInput.file);
        userPrompt = `Here are the questions/context:\n${questionContext}\n\nPlease analyze the provided file containing the user's handwritten answers and provide your assessment according to the rules.`;
        contents.parts.push({ text: userPrompt });
        contents.parts.push(filePart);
    } else { // Typed answers
        let typedAnswers = "";
        if (testType === 'TAT') {
            typedAnswers = userInput.typed.map((story, index) => `Story ${index + 1}:\n${story}\n`).join('\n---\n');
        } else if (testType === 'WAT') {
            typedAnswers = Object.entries(userInput.typed).map(([word, sentence]) => `${word}: ${sentence}`).join('\n');
        } else if (testType === 'SRT') {
            typedAnswers = Object.entries(userInput.typed).map(([situation, response]) => `Situation: ${situation}\nResponse: ${response}\n`).join('\n---\n');
        }
        userPrompt = `Here are the questions/context:\n${questionContext}\n\nHere are the user's typed answers:\n${typedAnswers}\n\nPlease provide your assessment according to the rules.`;
        contents.parts.push({ text: userPrompt });
    }

    try {
        const response = await getAI().models.generateContent({
            model: model,
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
            },
        });
        return response.text;
    } catch (error) {
        console.error("Written assessment error:", error);
        return `Error: Failed to get AI assessment. ${error.message}`;
    }
};

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
    } | string;
    error?: string;
    // For Interview
    confidence_level?: string;
    power_of_expression?: string;
    areas_for_improvement?: string[];
    // For OIR
    score_percentage?: number;
    struggled_topics?: string[];
    improvement_topics?: string[];
}

const getAIAssessment = async (testType, data): Promise<AIAssessmentFeedback> => {
    const olqs = OLQ_LIST.join(', ');
    let content = "";
    let systemInstruction = "";

    const responseSchema: any = {
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
            systemInstruction = "You are an expert GTO. Assess this lecturerette performance based on the provided transcript. Analyze the candidate's tone, clarity, confidence, structure, and language usage. Provide detailed, constructive feedback.";
            content = `Topic: ${data.topic}\nTranscript:\n${data.transcript}\n\nProvide your assessment. Focus on the quality of delivery and content structure.`;
             responseSchema.properties.content_feedback = { type: Type.STRING, description: "Feedback on the structure (intro, body, conclusion) and quality/depth of the content." };
             responseSchema.properties.delivery_feedback = { type: Type.STRING, description: "Feedback on the delivery, including clarity, confidence, tone, and language proficiency." };
             break;
        case 'AIInterview':
            systemInstruction = `You are an expert SSB psychologist and Interviewing Officer. You have just conducted a personal interview with a candidate. Analyze the following interview transcript and provide a detailed, deep performance analysis of the candidate's personality and Officer Like Qualities (OLQs). Be specific and avoid generic advice.`;
            content = `Candidate's PIQ data:\n---\n${JSON.stringify(data.piq, null, 2)}\n---\n\nInterview Transcript:\n---\n${data.transcript.map(t => `${t.speaker === 'ai' ? 'IO' : 'Candidate'}: ${t.text}`).join('\n')}\n---\n\nBased on the PIQ and the transcript, provide your assessment. Focus on communication clarity, confidence, logical reasoning, and consistency of answers.`;
            
            const interviewResponseSchema = {
                type: Type.OBJECT,
                properties: {
                    overall_summary: { type: Type.STRING, description: "A brief summary of the candidate's performance, personality, and suitability." },
                    confidence_level: { type: Type.STRING, description: "Rate the candidate's confidence as Low, Medium, or High, and provide specific examples from the transcript to justify." },
                    power_of_expression: { type: Type.STRING, description: "Assess the clarity, coherence, logical reasoning, and impact of the candidate's communication." },
                    olqs_demonstrated: { type: Type.ARRAY, items: { type: Type.STRING }, description: `A list of OLQs that were clearly visible during the interview, e.g., 'Initiative', 'Self Confidence'. Use this list: ${olqs}` },
                    areas_for_improvement: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List specific OLQs or behavioral areas (e.g., consistency, depth of knowledge) where the candidate needs to improve." },
                    detailed_olq_assessment: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                olq: { type: Type.STRING },
                                assessment: { type: Type.STRING }
                            }
                        },
                        description: "Provide a detailed assessment for at least 5 key OLQs like Effective Intelligence, Reasoning Ability, Social Adaptability, Cooperation, and Sense of Responsibility, referencing their answers where possible."
                    },
                    actionable_advice: { type: Type.STRING, description: "Provide 2-3 concrete, specific tips for the candidate to improve before their actual SSB interview, based directly on their performance." }
                },
                required: ["overall_summary", "confidence_level", "power_of_expression", "olqs_demonstrated", "areas_for_improvement", "detailed_olq_assessment", "actionable_advice"]
            };

            try {
                const response = await getAI().models.generateContent({
                    model: 'gemini-2.5-pro',
                    contents: {parts: [{text: content}]},
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: interviewResponseSchema,
                        temperature: 0.5,
                    },
                });

                const jsonText = response.text.trim();
                return JSON.parse(jsonText);
            } catch (error) {
                console.error("AI assessment error for Interview:", error);
                return { error: `Failed to get AI assessment. The model returned an invalid response. Details: ${error.message}` };
            }
        case 'OIR':
            systemInstruction = `You are an expert SSB test evaluator. Analyze the user's performance on this Officer Intelligence Rating (OIR) test. The user has completed a 50-question test. I will provide the questions with their categories, and the user's answers. Your task is to calculate the score, identify areas of weakness, and suggest improvements.`;
            content = `Test Type: ${data.testType} OIR Test.\n\nHere are the results:\n${data.results.map((r, i) => `Q${i+1} (Category: ${r.question.category}): User answered "${r.userAnswer}", Correct answer was "${r.question.answer}".`).join('\n')}\n\nPlease provide your assessment in the required JSON format.`;

            const oirResponseSchema = {
                type: Type.OBJECT,
                properties: {
                    score_percentage: { type: Type.NUMBER, description: "The final score as a percentage." },
                    overall_summary: { type: Type.STRING, description: "A brief summary of the performance, commenting on speed and accuracy." },
                    struggled_topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of question categories where the user made the most mistakes (e.g., 'Series Completion', 'Figure Analogy')." },
                    improvement_topics: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List specific topics the user should practice to improve their score." }
                },
                required: ["score_percentage", "overall_summary", "struggled_topics", "improvement_topics"]
            };

            try {
                const response = await getAI().models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: {parts: [{text: content}]},
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json",
                        responseSchema: oirResponseSchema,
                    },
                });

                const jsonText = response.text.trim();
                return JSON.parse(jsonText);
            } catch (error) {
                console.error("AI assessment error for OIR:", error);
                return { error: `Failed to get AI assessment for OIR. Details: ${error.message}` };
            }

        default:
            return { error: 'Unknown test type' };
    }

    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: {parts: [{text: content}]},
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.6,
            },
        });

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);
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
        console.error("News update error:", error);
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
        console.error("Topic briefing error:", error);
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
        if (user) {
            setCurrentUser(user);
        } else {
            setError('Invalid Roll No. Please try again.');
        }
    };
    
    const logout = () => {
        setCurrentUser(null);
    };

    const signup = (newUser) => {
        setError('');
        if (data.users.find(u => u.rollNo === newUser.rollNo)) {
            setError('This Roll No is already registered.');
            return;
        }
        if (data.users.length >= 50) {
            setError('The roster is full. Cannot add more aspirants.');
            return;
        }
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
            setCurrentUser(updatedUserData); // Keep session in sync
        }
    };
    
    const sendFriendRequest = (fromUser, toUser) => {
        // Prevent duplicate requests
        if(toUser.friendRequests?.includes(fromUser.rollNo) || toUser.friends?.includes(fromUser.rollNo)) return;

        const updatedToUser = {
            ...toUser,
            friendRequests: [...(toUser.friendRequests || []), fromUser.rollNo]
        };
        const userIndex = data.users.findIndex(u => u.rollNo === toUser.rollNo);
        const updatedUsers = [...data.users];
        updatedUsers[userIndex] = updatedToUser;
        saveData({ ...data, users: updatedUsers });
    };

    const handleFriendRequest = (user, requesterRollNo, accept) => {
        const requester = data.users.find(u => u.rollNo === requesterRollNo);
        if (!requester) return;

        let updatedUser = {
            ...user,
            friendRequests: (user.friendRequests || []).filter(roll => roll !== requesterRollNo)
        };

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
        setCurrentUser(updatedUser); // Update current user's state
    };


    return { currentUser, login, logout, signup, updateUser, error, sendFriendRequest, handleFriendRequest };
};

const useBadges = (currentUser, updateUser) => {
    const unlockBadge = useCallback((badgeId) => {
        if (currentUser && (!currentUser.badges || !currentUser.badges.includes(badgeId))) {
            const updatedUser = {
                ...currentUser,
                badges: [...(currentUser.badges || []), badgeId]
            };
            updateUser(updatedUser);
            // Could add a toast notification here for better UX
        }
    }, [currentUser, updateUser]);
    return { unlockBadge };
};


// --- UI COMPONENTS ---
const LoadingSpinner = ({ text }) => (
    <div className="loading-container">
        <div className="loading-spinner"></div>
        {text && <p>{text}</p>}
    </div>
);

const App = () => {
    // CRITICAL: Check for API Key before rendering the app.
    // This prevents the app from crashing with a blank screen if the key is missing.
    if (!API_KEY) {
        return (
            <div className="app-loading-screen">
                <h2 style={{ color: 'var(--danger-color)' }}>Configuration Error</h2>
                <p style={{ color: 'var(--neutral-light)', maxWidth: '500px', margin: '1rem' }}>
                    The Gemini API Key is missing. Please add it as an environment variable named <strong>API_KEY</strong> in your hosting provider's settings (e.g., Vercel).
                </p>
            </div>
        );
    }

    const { data, saveData } = useData();
    const { currentUser, login, logout, signup, updateUser, error, sendFriendRequest, handleFriendRequest } = useAuth(data, saveData);
    const [currentPage, setCurrentPage] = useState('dashboard');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    const { unlockBadge } = useBadges(currentUser, updateUser);

    useEffect(() => {
      if (mobileNavOpen) {
        document.body.classList.add('mobile-nav-is-open');
      } else {
        document.body.classList.remove('mobile-nav-is-open');
      }
    }, [mobileNavOpen]);

    if (!data) {
        return (
            <div className="app-loading-screen">
                <div className="loading-spinner"></div>
                <h2>Loading NOX SSB Prep...</h2>
            </div>
        );
    }

    if (!currentUser) {
        return <LoginScreen onLogin={login} onSignup={signup} error={error} existingUsers={data.users || []} />;
    }

    const PageComponent = {
        'dashboard': () => <Dashboard user={currentUser} setPage={setCurrentPage} />,
        'tat': () => <TATRunner user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} images={data.content.tat_images} setPage={setCurrentPage} />,
        'wat': () => <WATRunner user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} words={data.content.wat_words} setPage={setCurrentPage} />,
        'srt': () => <SRTRunner user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} scenarios={data.content.srt_scenarios} setPage={setCurrentPage} />,
        'sdt': () => <SDTRunner user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} setPage={setCurrentPage} />,
        'oir': () => <OIRTestRunner user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} verbalQuestions={data.content.oir_verbal_questions} nonVerbalQuestions={data.content.oir_non_verbal_questions} setPage={setCurrentPage} />,
        'lecturerette': () => <Lecturerette user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} topics={data.content.lecturerette_topics} setPage={setCurrentPage} />,
        'gpe': () => <GPERunner user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} scenario={data.content.gpe_scenarios[0]} setPage={setCurrentPage} />,
        'ai_interview': () => <AIInterviewSimulator user={currentUser} updateUser={updateUser} unlockBadge={unlockBadge} setPage={setCurrentPage} />,
        'piq': () => <PIQForm user={currentUser} onSave={updateUser} setPage={setCurrentPage} />,
        'profile': () => <ProfilePage user={currentUser} onSave={updateUser} />,
        'olq_dashboard': () => <OLQDashboard user={currentUser} />,
        'current_affairs': () => <CurrentAffairs />,
        'topic_briefer': () => <TopicBriefer />,
        'community': () => <CommunityPage currentUser={currentUser} allUsers={data.users} chats={data.chats} data={data} saveData={saveData} sendFriendRequest={sendFriendRequest} handleFriendRequest={handleFriendRequest} />,
        'leaderboard': () => <Leaderboard users={data.users} currentUser={currentUser}/>,
        'admin': () => <AdminPanel data={data} saveData={saveData} />,
    }[currentPage];

    const handleSetPage = (page) => {
        setCurrentPage(page);
        setMobileNavOpen(false);
    };

    return (
        <div className="app-layout">
             {mobileNavOpen && <div className="nav-overlay" onClick={() => setMobileNavOpen(false)}></div>}
            <Sidebar 
                user={currentUser} 
                onLogout={logout} 
                currentPage={currentPage} 
                setPage={handleSetPage} 
                isAdmin={currentUser.isAdmin}
                friendRequests={currentUser.friendRequests?.length || 0}
                isOpen={mobileNavOpen}
                setIsOpen={setMobileNavOpen}
            />
            <main className="main-content">
                <MobileHeader onMenuClick={() => setMobileNavOpen(true)} />
                {PageComponent ? <PageComponent /> : <Dashboard user={currentUser} setPage={setCurrentPage} />}
            </main>
        </div>
    );
};

const MobileHeader = ({ onMenuClick }) => (
    <div className="mobile-header">
        <button className="hamburger-btn" onClick={onMenuClick} aria-label="Open navigation menu">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18v2H3V6m0 5h18v2H3v-2m0 5h18v2H3v-2Z"/></svg>
        </button>
        <div className="mobile-header-title">NOX SSB</div>
    </div>
);

const LoginScreen = ({ onLogin, onSignup, error, existingUsers }) => {
    const [isLogin, setIsLogin] = useState(true);
    const [rollNo, setRollNo] = useState('');
    const [name, setName] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLogin) {
            onLogin(rollNo);
        } else {
            const newUser = {
                rollNo,
                name,
                piq: {},
                tests: {},
                badges: [],
                isAdmin: rollNo === 'Naveen@5799', // Specific admin roll number check
                createdAt: new Date().toISOString(),
                profilePic: DEFAULT_PROFILE_PIC
            };
            onSignup(newUser);
        }
    };
    
    return (
        <div className="login-container">
            <div className="card login-card">
                 <h1>{isLogin ? 'Welcome Back' : 'Join the Squad'}</h1>
                 <p>Your journey to the forces starts here.</p>
                 
                 {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="rollNo">Roll No</label>
                        <input
                            type="text"
                            id="rollNo"
                            value={rollNo}
                            onChange={(e) => setRollNo(e.target.value)}
                            placeholder="Enter your assigned Roll No"
                            required
                        />
                    </div>
                    {!isLogin && (
                         <div className="form-group">
                            <label htmlFor="name">Full Name</label>
                            <input
                                type="text"
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Enter your full name"
                                required
                            />
                        </div>
                    )}
                    <button type="submit" className="btn btn-primary btn-block">
                        {isLogin ? 'Login' : 'Sign Up'}
                    </button>
                </form>
                
                <p style={{ marginTop: '24px', fontSize: '0.9rem' }}>
                    {isLogin ? "Don't have an account?" : "Already have an account?"}
                    <button onClick={() => setIsLogin(!isLogin)} style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontWeight: 'bold', marginLeft: '8px' }}>
                        {isLogin ? 'Sign Up' : 'Login'}
                    </button>
                </p>
            </div>
        </div>
    );
};

const Sidebar = ({ user, onLogout, currentPage, setPage, isAdmin, friendRequests, isOpen, setIsOpen }) => {
    const [openSubmenus, setOpenSubmenus] = useState({
        psych: false,
        gto: false,
        tools: false,
    });

    const toggleSubmenu = (menu) => {
        setOpenSubmenus(prev => ({ ...prev, [menu]: !prev[menu] }));
    };

    const NavLink = ({ page, name, icon = null, isChild = false, hasSubmenu = false, submenuKey = '' }) => (
        <a 
            href="#" 
            className={`${isChild ? 'nav-link-child' : 'nav-link'} ${currentPage === page ? 'active' : ''}`}
            onClick={(e) => {
                e.preventDefault();
                if (hasSubmenu) {
                    toggleSubmenu(submenuKey);
                } else {
                    setPage(page);
                }
            }}
        >
            {icon && <svg className="nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">{icon}</svg>}
            <span className="nav-text">{name}</span>
            {hasSubmenu && (
                <svg className={`nav-chevron ${openSubmenus[submenuKey] ? 'open' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
                </svg>
            )}
        </a>
    );

    useEffect(() => {
      // Open submenu if a child is active
      if (['tat', 'wat', 'srt', 'sdt'].includes(currentPage)) {
        if (!openSubmenus.psych) setOpenSubmenus(prev => ({...prev, psych: true}));
      }
      if (['oir', 'lecturerette', 'gpe', 'ai_interview'].includes(currentPage)) {
        if (!openSubmenus.gto) setOpenSubmenus(prev => ({...prev, gto: true}));
      }
      if (['current_affairs', 'topic_briefer'].includes(currentPage)) {
        if (!openSubmenus.tools) setOpenSubmenus(prev => ({...prev, tools: true}));
      }
    }, [currentPage]);
    
    return (
        <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header">
                NOX SSB
                <button className="close-nav-btn" onClick={() => setIsOpen(false)}>&times;</button>
            </div>
            <nav className="sidebar-nav">
                <ul className="sidebar-nav-list">
                    <li className="nav-header">Main</li>
                    <li className="nav-item"><NavLink page="dashboard" name="Dashboard" icon={<path d="M13,3V9H21V3M13,21H21V11H13M3,21H11V15H3M3,13H11V3H3V13Z" />} /></li>
                    <li className="nav-item"><NavLink page="piq" name="PIQ Form" icon={<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M8,12V14H16V12H8M8,16V18H13V16H8Z" />} /></li>
                    <li className="nav-item"><NavLink page="profile" name="My Profile" icon={<path d="M12,12A5,5 0 0,1 7,7A5,5 0 0,1 12,2A5,5 0 0,1 17,7A5,5 0 0,1 12,12M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z" />} /></li>
                    
                    <li className="nav-divider"></li>
                    <li className="nav-header">Practice Arena</li>
                    <li className="nav-item">
                        <NavLink page="" name="Psychological Tests" icon={<path d="M12,6.5A2.5,2.5 0 0,1 14.5,9A2.5,2.5 0 0,1 12,11.5A2.5,2.5 0 0,1 9.5,9A2.5,2.5 0 0,1 12,6.5M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,13.5C14.67,13.5 18,15.42 18,17.95V19H6V17.95C6,15.42 9.33,13.5 12,13.5Z" />} hasSubmenu={true} submenuKey="psych" />
                        <ul className={`submenu ${openSubmenus.psych ? 'open' : ''}`}>
                            <li className="nav-item"><NavLink page="tat" name="TAT" isChild={true} /></li>
                            <li className="nav-item"><NavLink page="wat" name="WAT" isChild={true} /></li>
                            <li className="nav-item"><NavLink page="srt" name="SRT" isChild={true} /></li>
                            <li className="nav-item"><NavLink page="sdt" name="SDT" isChild={true} /></li>
                        </ul>
                    </li>
                    <li className="nav-item">
                        <NavLink page="" name="GTO & Interview" icon={<path d="M17.5,12A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,12M17.5,13C15.83,13 13,13.83 13,15.5V17H22V15.5C22,13.83 19.17,13 17.5,13M6.5,12A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,12M6.5,13C4.83,13 2,13.83 2,15.5V17H11V15.5C11,13.83 8.17,13 6.5,13M12,8A1.5,1.5 0 0,1 13.5,6.5A1.5,1.5 0 0,1 12,5A1.5,1.5 0 0,1 10.5,6.5A1.5,1.5 0 0,1 12,8M12,9C10.33,9 7.5,9.83 7.5,11.5V13H16.5V11.5C16.5,9.83 13.67,9 12,9Z" />} hasSubmenu={true} submenuKey="gto" />
                        <ul className={`submenu ${openSubmenus.gto ? 'open' : ''}`}>
                            <li className="nav-item"><NavLink page="oir" name="OIR Test" isChild={true} /></li>
                            <li className="nav-item"><NavLink page="lecturerette" name="Lecturerette" isChild={true} /></li>
                            <li className="nav-item"><NavLink page="gpe" name="GPE" isChild={true} /></li>
                            <li className="nav-item"><NavLink page="ai_interview" name="AI Interview Simulator" isChild={true} /></li>
                        </ul>
                    </li>

                    <li className="nav-divider"></li>
                    <li className="nav-header">Analysis & Growth</li>
                    <li className="nav-item"><NavLink page="olq_dashboard" name="OLQ Analysis" icon={<path d="M22,21H2V3H4V19H6V10H10V19H12V6H16V19H18V14H22V21Z" />} /></li>
                    <li className="nav-item"><NavLink page="leaderboard" name="Leaderboard" icon={<path d="M16,11V3H8V11H2V21H22V11H16M4,13H8V19H4V13M10,5H14V19H10V5M16,13H20V19H16V13Z" />} /></li>
                     <li className="nav-item">
                        <NavLink page="" name="Intel Tools" icon={<path d="M9.5,2A7.5,7.5 0 0,1 17,9.5C17,11.28 16.3,12.91 15.19,14.12L21.3,20.22L20.22,21.3L14.12,15.19C12.91,16.3 11.28,17 9.5,17A7.5,7.5 0 0,1 2,9.5A7.5,7.5 0 0,1 9.5,2M9.5,4A5.5,5.5 0 0,0 4,9.5A5.5,5.5 0 0,0 9.5,15A5.5,5.5 0 0,0 15,9.5A5.5,5.5 0 0,0 9.5,4Z" />} hasSubmenu={true} submenuKey="tools" />
                        <ul className={`submenu ${openSubmenus.tools ? 'open' : ''}`}>
                             <li className="nav-item"><NavLink page="current_affairs" name="Current Affairs" isChild={true}/></li>
                             <li className="nav-item"><NavLink page="topic_briefer" name="Topic Briefer" isChild={true}/></li>
                        </ul>
                    </li>
                    

                    <li className="nav-divider"></li>
                    <li className="nav-header">Connect</li>
                    <li className="nav-item">
                         <a href="#" className={`nav-link ${currentPage === 'community' ? 'active' : ''}`} onClick={(e) => { e.preventDefault(); setPage('community'); }}>
                            <svg className="nav-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.64,12.33C6.7,13.2 5.36,13.5 4,13.5A1,1 0 0,1 3,12.5V12A4,4 0 0,1 7,8H5M19,8H17A4,4 0 0,1 21,12V12.5A1,1 0 0,1 20,13.5C18.64,13.5 17.3,13.2 16.36,12.33C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M12,14.5C15.31,14.5 20,15.94 20,18V19H4V18C4,15.94 8.69,14.5 12,14.5Z" /></svg>
                             <span className="nav-text">Community</span>
                             {friendRequests > 0 && <span className="notification-badge">{friendRequests}</span>}
                        </a>
                    </li>
                    
                     {isAdmin && (
                        <>
                            <li className="nav-divider"></li>
                            <li className="nav-header">Administration</li>
                            <li className="nav-item"><NavLink page="admin" name="Admin Panel" icon={<path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,12.17L14.12,14.29L15.54,12.88L13.41,10.76L15.53,8.64L14.12,7.23L12,9.35L9.88,7.23L8.47,8.64L10.59,10.76L8.47,12.88L9.88,14.29L12,12.17Z" />} /></li>
                        </>
                    )}
                </ul>
            </nav>
            <div className="sidebar-footer">
                <div className="sidebar-user-profile" onClick={() => setPage('profile')}>
                    <img src={user.profilePic || DEFAULT_PROFILE_PIC} alt="Profile" className="sidebar-profile-pic"/>
                    <div className="sidebar-user-name">{user.name}</div>
                    <div className="sidebar-user-roll">Roll No: {user.rollNo}</div>
                </div>
                <button onClick={onLogout}>Logout</button>
            </div>
        </aside>
    );
};

const Dashboard = ({ user, setPage }) => {
    const tests = user.tests || {};
    const testTypes = ['TAT', 'WAT', 'SRT', 'SDT', 'OIR', 'Lecturerette', 'GPE', 'AIInterview'];
    const totalTests = testTypes.length;
    const completedTestsCount = testTypes.filter(t => tests[t.toLowerCase()]?.length > 0).length;
    const progress = totalTests > 0 ? Math.round((completedTestsCount / totalTests) * 100) : 0;

    const recentActivity = Object.entries(tests)
        .flatMap(([type, results]) => (results as any[]).map(r => ({ ...r, type: type.toUpperCase() })))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 5);

    return (
        <div>
            <h1 className="page-header">Dashboard</h1>
            <div className="dashboard-grid">
                <div className="card">
                     <div className="dashboard-card-header">
                        <svg className="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.1,12.5L22.5,13.91L15.97,20.44L12.5,17L13.91,15.59L15.97,17.64L21.1,12.5M11,4A4,4 0 0,1 15,8A4,4 0 0,1 11,12A4,4 0 0,1 7,8A4,4 0 0,1 11,4M11,6A2,2 0 0,0 9,8A2,2 0 0,0 11,10A2,2 0 0,0 13,8A2,2 0 0,0 11,6M11,13C11.68,13 12.5,13.09 13.4,13.26L11.73,14.93L11,14.9C8.03,14.9 4.9,16.36 4.9,17V18H13.1L11.1,20H4.9V17C4.9,16.72 5.5,15.36 11,14.9Z" /></svg>
                        <div>
                            <h2>Welcome, {user.name}</h2>
                             <p>This is your central hub for all SSB preparation activities. Select a test from the sidebar to begin your practice. Stay consistent, stay focused.</p>
                        </div>
                    </div>
                </div>
                <div className="card">
                    <div className="dashboard-card-header">
                        <svg className="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M16,11.78L20.24,4.45L21.97,5.45L16.74,14.5L10.23,10.75L11.96,9.75M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z" /></svg>
                        <div>
                            <h2>Overall Progress</h2>
                            <p>You have attempted at least one of each of these test types.</p>
                        </div>
                    </div>
                    <div className="progress-bar-container">
                        <div className="progress-bar-fill" style={{width: `${progress}%`}}></div>
                    </div>
                    <p className="progress-label">{progress}% Complete ({completedTestsCount}/{totalTests})</p>
                </div>
                <div className="card">
                    <h3>Recent Activity</h3>
                    {recentActivity.length > 0 ? (
                        <ul className="history-list">
                            {recentActivity.map((item, index) => (
                                <li key={index} className="history-item">
                                    <p>Completed a <strong>{item.type}</strong> test.</p>
                                    <span className="date">{new Date(item.date).toLocaleDateString()}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="no-history">No recent activity. Start a test to begin!</div>
                    )}
                </div>
                <BadgesSection user={user} />
            </div>
        </div>
    );
};

const BadgesSection = ({ user }) => {
    const unlockedBadges = user.badges || [];
    return (
        <div className="card badges-section">
            <h2>My Badges</h2>
            <div className="badges-grid">
                {Object.entries(BADGES).map(([id, badge]) => (
                    <div key={id} className={`badge ${unlockedBadges.includes(id) ? 'unlocked' : ''}`}>
                        <img src={badge.icon} alt={badge.name} className="badge-icon" />
                        <span className="badge-name">{badge.name}</span>
                        <div className="badge-tooltip">
                            <strong>{badge.name}</strong>
                            <p>{badge.desc}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const AssessmentFeedbackViewer = ({ feedbackText, onClose }) => {
    return (
        <div className="assessment-feedback-container">
            <h3>AI Assessment</h3>
            <pre className="assessment-feedback-content">{feedbackText}</pre>
            <button onClick={onClose} className="btn btn-primary" style={{marginTop: '1.5rem'}}>Back to Dashboard</button>
        </div>
    );
};


const TATRunner = ({ user, updateUser, unlockBadge, images, setPage }) => {
    const [step, setStep] = useState('instructions'); // instructions, running, upload, finished
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [stories, setStories] = useState(Array(images.length).fill(''));
    const [timeLeft, setTimeLeft] = useState(240); // 4 min per story
    const [showImageTime, setShowImageTime] = useState(30);
    const [isImageVisible, setIsImageVisible] = useState(true);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [inputMode, setInputMode] = useState<'type' | 'upload' | null>(null);
    const [answerFile, setAnswerFile] = useState<File | null>(null);
    const [assessmentText, setAssessmentText] = useState('');

    const timerRef = useRef(null);

    const runAssessment = async () => {
        setStep('finished');
        setLoadingFeedback(true);
        
        let feedbackResult: string;
        let testResultPayload: any;

        if (inputMode === 'upload') {
            if (!answerFile) {
                alert("Please select a file to upload.");
                setStep('upload'); // Go back to upload step
                setLoadingFeedback(false);
                return;
            }
            feedbackResult = await getWrittenAssessment('TAT', null, { file: answerFile });
            testResultPayload = {
                type: 'TAT',
                date: new Date().toISOString(),
                uploadMethod: 'file',
                fileName: answerFile.name,
            };
        } else { // 'type' mode
            feedbackResult = await getWrittenAssessment('TAT', null, { typed: stories });
            testResultPayload = {
                type: 'TAT',
                date: new Date().toISOString(),
                stories: stories,
                uploadMethod: 'typed',
            };
        }
        
        setAssessmentText(feedbackResult);
        setLoadingFeedback(false);

        const updatedUser = {
            ...user,
            tests: {
                ...user.tests,
                tat: [...(user.tests?.tat || []), { ...testResultPayload, assessmentText: feedbackResult }]
            }
        };
        updateUser(updatedUser);
        
        unlockBadge('first_step');
        if (user.tests?.tat?.length >= 4) unlockBadge('story_weaver');
        if(user.tests?.wat && user.tests?.srt && user.tests?.sdt) unlockBadge('psych_initiate');
    };

    const finishTest = () => {
        clearInterval(timerRef.current);
        if (inputMode === 'type') {
            runAssessment();
        } else {
            setStep('upload');
        }
    };

    const handleNext = useCallback(() => {
        clearInterval(timerRef.current);
        if (currentImageIndex < images.length - 1) {
            setCurrentImageIndex(prev => prev + 1);
            setTimeLeft(240);
            setShowImageTime(30);
            setIsImageVisible(true);
        } else {
            finishTest();
        }
    }, [currentImageIndex, images.length, stories, inputMode]);

    useEffect(() => {
        if (step === 'running') {
            timerRef.current = setInterval(() => {
                if (isImageVisible) {
                    setShowImageTime(prev => {
                        if (prev <= 1) {
                            setIsImageVisible(false);
                            return 0;
                        }
                        return prev - 1;
                    });
                } else {
                    setTimeLeft(prev => {
                        if (prev <= 1) {
                            handleNext();
                            return 240; 
                        }
                        return prev - 1;
                    });
                }
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [step, isImageVisible, handleNext]);

    if (step === 'instructions') {
        return (
            <div>
                <h1 className="page-header">Thematic Apperception Test (TAT)</h1>
                <div className="card test-instructions">
                    <h2>Instructions</h2>
                    <p>You will be shown a series of 12 pictures, one after another. The last slide will be blank.</p>
                    <p>Your story should include: What led up to the situation, what is currently happening, and what the final outcome will be. Also, describe the feelings and thoughts of the characters.</p>
                    <hr style={{margin: '1rem 0', borderColor: 'var(--primary-light)'}}/>
                    <h3>Choose Your Input Method</h3>
                    <p>You can either type your stories directly in the app, or write them on paper and upload a single file (image or PDF) at the end.</p>
                    <div className="input-method-choice">
                        <button onClick={() => { setInputMode('type'); setStep('running'); }} className="btn btn-primary">Type Answers in App</button>
                        <button onClick={() => { setInputMode('upload'); setStep('running'); }} className="btn btn-secondary">Use Handwritten Sheet</button>
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'upload') {
        return (
            <div>
                <h1 className="page-header">TAT: Upload Answer Sheet</h1>
                <div className="card text-center">
                    <h2>Test Complete. Upload Your Answer Sheet Now.</h2>
                    <p>Please upload a single image (PNG, JPEG) or a PDF file containing your stories for all 12 pictures.</p>
                    <div className="form-group" style={{maxWidth: '400px', margin: '1rem auto'}}>
                        <input type="file" className="form-control" accept=".png,.jpeg,.jpg,.pdf" onChange={(e) => setAnswerFile(e.target.files ? e.target.files[0] : null)} />
                        {answerFile && <p style={{marginTop: '1rem'}}>Selected file: <strong>{answerFile.name}</strong></p>}
                    </div>
                    <button onClick={runAssessment} className="btn btn-primary" disabled={!answerFile || loadingFeedback}>
                        {loadingFeedback ? 'Analyzing...' : 'Submit for Assessment'}
                    </button>
                </div>
            </div>
        );
    }
    
     if (step === 'finished') {
        return (
            <div>
                <h1 className="page-header">Test Complete</h1>
                <div className="card">
                    <h2>Thank you for completing the TAT.</h2>
                    {loadingFeedback ? <LoadingSpinner text="Analyzing your submission..." /> : 
                        <AssessmentFeedbackViewer feedbackText={assessmentText} onClose={() => setPage('dashboard')} />
                    }
                </div>
            </div>
        );
    }

    return (
        <div className="test-runner-container">
            <h1 className="page-header">TAT: Picture {currentImageIndex + 1} of {images.length}</h1>
            <div className="test-progress-bar">
                <div className="test-progress-bar-inner" style={{ width: `${((currentImageIndex + 1) / images.length) * 100}%` }}></div>
            </div>
            <div className="timer">
                {isImageVisible ? `Observe: ${showImageTime}s` : `Write: ${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
            </div>
            
            <div className="test-stimulus">
                {isImageVisible && <img id="tat-image" src={images[currentImageIndex]} alt="TAT stimulus" />}
            </div>

            <div className="card">
                <textarea
                    value={stories[currentImageIndex]}
                    onChange={(e) => {
                        const newStories = [...stories];
                        newStories[currentImageIndex] = e.target.value;
                        setStories(newStories);
                    }}
                    placeholder={inputMode === 'upload' ? "Write your story on paper." : "Start writing your story here..."}
                    disabled={isImageVisible || inputMode === 'upload'}
                />
                 {inputMode === 'upload' && !isImageVisible && <p className="upload-reminder">Write on paper. You will upload your answer sheet after the test.</p>}
                 <button onClick={handleNext} className="btn btn-primary" style={{marginTop: '1rem'}}>
                    {currentImageIndex < images.length - 1 ? 'Next Picture' : 'Finish Test'}
                </button>
            </div>
        </div>
    );
};

const WATRunner = ({ user, updateUser, unlockBadge, words, setPage }) => {
    const [step, setStep] = useState('instructions');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState({});
    const [currentSentence, setCurrentSentence] = useState('');
    const [timeLeft, setTimeLeft] = useState(15);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [inputMode, setInputMode] = useState<'type' | 'upload' | null>(null);
    const [answerFile, setAnswerFile] = useState<File | null>(null);
    const [assessmentText, setAssessmentText] = useState('');
    const timerRef = useRef(null);
    const inputRef = useRef(null);
    
    const runAssessment = async () => {
        setStep('finished');
        setLoadingFeedback(true);
        
        let feedbackResult: string;
        let testResultPayload: any;

        if (inputMode === 'upload') {
            if (!answerFile) {
                alert("Please select a file to upload.");
                setStep('upload');
                setLoadingFeedback(false);
                return;
            }
            feedbackResult = await getWrittenAssessment('WAT', words, { file: answerFile });
            testResultPayload = { date: new Date().toISOString(), uploadMethod: 'file', fileName: answerFile.name };
        } else { // 'type' mode
            const finalResponses = { ...responses, [words[currentIndex]]: currentSentence };
            feedbackResult = await getWrittenAssessment('WAT', words, { typed: finalResponses });
            testResultPayload = { date: new Date().toISOString(), responses: finalResponses, uploadMethod: 'typed' };
        }

        setAssessmentText(feedbackResult);
        setLoadingFeedback(false);

        const updatedUser = {
            ...user,
            tests: { ...user.tests, wat: [...(user.tests?.wat || []), { ...testResultPayload, assessmentText: feedbackResult }] }
        };
        updateUser(updatedUser);

        unlockBadge('first_step');
        if (user.tests?.wat?.length >= 4) unlockBadge('word_warrior');
        if(user.tests?.tat && user.tests?.srt && user.tests?.sdt) unlockBadge('psych_initiate');
    };

    const finishTest = () => {
        clearInterval(timerRef.current);
        if (inputMode === 'type') {
            runAssessment();
        } else {
            setStep('upload');
        }
    };
    
    const handleNext = useCallback(() => {
        setResponses(prev => ({ ...prev, [words[currentIndex]]: currentSentence }));
        setCurrentSentence('');
        if (currentIndex < words.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setTimeLeft(15);
        } else {
            finishTest();
        }
    }, [currentIndex, words, currentSentence, inputMode]);
    
    useEffect(() => { if(inputRef.current) inputRef.current.focus(); }, [currentIndex])

    useEffect(() => {
        if (step === 'running') {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) { handleNext(); return 15; }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [step, handleNext]);


    if (step === 'instructions') {
        return (
            <div>
                <h1 className="page-header">Word Association Test (WAT)</h1>
                <div className="card test-instructions">
                    <h2>Instructions</h2>
                    <p>You will be shown a series of words, one after another. For each word, you will have <strong>15 seconds</strong> to see the word and write a meaningful sentence using it.</p>
                     <hr style={{margin: '1rem 0', borderColor: 'var(--primary-light)'}}/>
                    <h3>Choose Your Input Method</h3>
                    <div className="input-method-choice">
                        <button onClick={() => { setInputMode('type'); setStep('running'); }} className="btn btn-primary">Type Answers in App</button>
                        <button onClick={() => { setInputMode('upload'); setStep('running'); }} className="btn btn-secondary">Use Handwritten Sheet</button>
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'upload') {
        return (
            <div>
                <h1 className="page-header">WAT: Upload Answer Sheet</h1>
                <div className="card text-center">
                    <h2>Test Complete. Upload Your Answer Sheet Now.</h2>
                    <p>Please upload a single image (PNG, JPEG) or a PDF file containing your sentences for all {words.length} words.</p>
                    <div className="form-group" style={{maxWidth: '400px', margin: '1rem auto'}}>
                        <input type="file" className="form-control" accept=".png,.jpeg,.jpg,.pdf" onChange={(e) => setAnswerFile(e.target.files ? e.target.files[0] : null)} />
                        {answerFile && <p style={{marginTop: '1rem'}}>Selected file: <strong>{answerFile.name}</strong></p>}
                    </div>
                    <button onClick={runAssessment} className="btn btn-primary" disabled={!answerFile || loadingFeedback}>
                        {loadingFeedback ? 'Analyzing...' : 'Submit for Assessment'}
                    </button>
                </div>
            </div>
        );
    }

    if (step === 'finished') {
        return (
            <div>
                <h1 className="page-header">Test Complete</h1>
                <div className="card">
                    <h2>Thank you for completing the WAT.</h2>
                     {loadingFeedback ? <LoadingSpinner text="Analyzing your responses..." /> : 
                        <AssessmentFeedbackViewer feedbackText={assessmentText} onClose={() => setPage('dashboard')} />
                     }
                </div>
            </div>
        );
    }
    
    return (
        <div className="test-runner-container">
            <h1 className="page-header">WAT: Word {currentIndex + 1} of {words.length}</h1>
            <div className="test-progress-bar">
                <div className="test-progress-bar-inner" style={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}></div>
            </div>
            <div className="timer">{timeLeft}s</div>
            <div className="test-stimulus"><h2 id="wat-word">{words[currentIndex]}</h2></div>
            <div className="card">
                <form onSubmit={(e) => { e.preventDefault(); handleNext(); }}>
                    <input 
                        ref={inputRef} 
                        type="text" 
                        value={currentSentence} 
                        onChange={(e) => setCurrentSentence(e.target.value)} 
                        placeholder={inputMode === 'upload' ? "Write your sentence on paper." : "Write your sentence here..."}
                        disabled={inputMode === 'upload'}
                    />
                    {inputMode === 'upload' && <p className="upload-reminder">Write on paper. You will upload your answer sheet after the test.</p>}
                    <button type="submit" className="btn btn-primary" style={{marginTop: '1rem'}}>Next</button>
                </form>
            </div>
        </div>
    );
};

const SRTRunner = ({ user, updateUser, unlockBadge, scenarios, setPage }) => {
    const [step, setStep] = useState('instructions');
    const [currentIndex, setCurrentIndex] = useState(0);
    const [responses, setResponses] = useState({});
    const [currentReaction, setCurrentReaction] = useState('');
    const [timeLeft, setTimeLeft] = useState(30);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    const [inputMode, setInputMode] = useState<'type' | 'upload' | null>(null);
    const [answerFile, setAnswerFile] = useState<File | null>(null);
    const [assessmentText, setAssessmentText] = useState('');
    const timerRef = useRef(null);

    const runAssessment = async () => {
        setStep('finished');
        setLoadingFeedback(true);
        
        let feedbackResult: string;
        let testResultPayload: any;

        if (inputMode === 'upload') {
             if (!answerFile) {
                alert("Please select a file to upload.");
                setStep('upload');
                setLoadingFeedback(false);
                return;
            }
            feedbackResult = await getWrittenAssessment('SRT', scenarios, { file: answerFile });
            testResultPayload = { date: new Date().toISOString(), uploadMethod: 'file', fileName: answerFile.name };
        } else { // 'type' mode
            const finalResponses = { ...responses, [scenarios[currentIndex]]: currentReaction };
            feedbackResult = await getWrittenAssessment('SRT', scenarios, { typed: finalResponses });
            testResultPayload = { date: new Date().toISOString(), responses: finalResponses, uploadMethod: 'typed' };
        }
        
        setAssessmentText(feedbackResult);
        setLoadingFeedback(false);
        
        const updatedUser = {
            ...user,
            tests: { ...user.tests, srt: [...(user.tests?.srt || []), { ...testResultPayload, assessmentText: feedbackResult }] }
        };
        updateUser(updatedUser);

        unlockBadge('first_step');
        if(user.tests?.tat && user.tests?.wat && user.tests?.sdt) unlockBadge('psych_initiate');
    };

    const finishTest = () => {
        clearInterval(timerRef.current);
        if (inputMode === 'type') {
            runAssessment();
        } else {
            setStep('upload');
        }
    };

    const handleNext = useCallback(() => {
        setResponses(prev => ({ ...prev, [scenarios[currentIndex]]: currentReaction }));
        setCurrentReaction('');
        if (currentIndex < scenarios.length - 1) {
            setCurrentIndex(prev => prev + 1);
            setTimeLeft(30);
        } else {
            finishTest();
        }
    }, [currentIndex, scenarios, currentReaction, inputMode]);

    useEffect(() => {
        if (step === 'running') {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) { handleNext(); return 30; }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(timerRef.current);
    }, [step, handleNext]);

    if (step === 'instructions') {
        return (
            <div>
                <h1 className="page-header">Situation Reaction Test (SRT)</h1>
                <div className="card test-instructions">
                    <h2>Instructions</h2>
                    <p>You will be presented with a series of everyday situations. For each situation, you have <strong>30 seconds</strong> to write down your immediate reaction or solution.</p>
                    <hr style={{margin: '1rem 0', borderColor: 'var(--primary-light)'}}/>
                    <h3>Choose Your Input Method</h3>
                    <div className="input-method-choice">
                        <button onClick={() => { setInputMode('type'); setStep('running'); }} className="btn btn-primary">Type Answers in App</button>
                        <button onClick={() => { setInputMode('upload'); setStep('running'); }} className="btn btn-secondary">Use Handwritten Sheet</button>
                    </div>
                </div>
            </div>
        );
    }
    
    if (step === 'upload') {
        return (
            <div>
                <h1 className="page-header">SRT: Upload Answer Sheet</h1>
                <div className="card text-center">
                    <h2>Test Complete. Upload Your Answer Sheet Now.</h2>
                    <p>Please upload a single image (PNG, JPEG) or a PDF file containing your reactions for all {scenarios.length} situations.</p>
                    <div className="form-group" style={{maxWidth: '400px', margin: '1rem auto'}}>
                        <input type="file" className="form-control" accept=".png,.jpeg,.jpg,.pdf" onChange={(e) => setAnswerFile(e.target.files ? e.target.files[0] : null)} />
                        {answerFile && <p style={{marginTop: '1rem'}}>Selected file: <strong>{answerFile.name}</strong></p>}
                    </div>
                    <button onClick={runAssessment} className="btn btn-primary" disabled={!answerFile || loadingFeedback}>
                        {loadingFeedback ? 'Analyzing...' : 'Submit for Assessment'}
                    </button>
                </div>
            </div>
        );
    }
    
    if (step === 'finished') {
        return (
            <div>
                <h1 className="page-header">Test Complete</h1>
                <div className="card">
                    <h2>Thank you for completing the SRT.</h2>
                    {loadingFeedback ? <LoadingSpinner text="Analyzing your reactions..." /> : 
                        <AssessmentFeedbackViewer feedbackText={assessmentText} onClose={() => setPage('dashboard')} />
                    }
                </div>
            </div>
        );
    }

    return (
        <div className="test-runner-container">
            <h1 className="page-header">SRT: Situation {currentIndex + 1} of {scenarios.length}</h1>
            <div className="test-progress-bar"><div className="test-progress-bar-inner" style={{ width: `${((currentIndex + 1) / scenarios.length) * 100}%` }}></div></div>
            <div className="timer">{timeLeft}s</div>
            <div className="test-stimulus"><p className="srt-situation">{scenarios[currentIndex]}</p></div>
            <div className="card">
                <textarea 
                    value={currentReaction} 
                    onChange={(e) => setCurrentReaction(e.target.value)} 
                    placeholder={inputMode === 'upload' ? "Write your reaction on paper." : "Your reaction..."}
                    disabled={inputMode === 'upload'} 
                />
                 {inputMode === 'upload' && <p className="upload-reminder">Write on paper. You will upload your answer sheet after the test.</p>}
                <button onClick={handleNext} className="btn btn-primary" style={{marginTop: '1rem'}}>
                    {currentIndex < scenarios.length - 1 ? 'Next Situation' : 'Finish Test'}
                </button>
            </div>
        </div>
    );
};

const SDTRunner = ({ user, updateUser, unlockBadge, setPage }) => {
    const [step, setStep] = useState('instructions');
    const [responses, setResponses] = useState(
        SDT_PROMPTS.reduce((acc, prompt) => ({ ...acc, [prompt]: '' }), {})
    );
    const [feedback, setFeedback] = useState(null);
    const [loadingFeedback, setLoadingFeedback] = useState(false);

    const handleInputChange = (prompt, value) => {
        setResponses(prev => ({ ...prev, [prompt]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStep('finished');
        setLoadingFeedback(true);
        
        const feedbackResult = await getAIAssessment('SDT', responses);
        setFeedback(feedbackResult);
        setLoadingFeedback(false);

        const testResult = {
            date: new Date().toISOString(),
            responses: responses,
            feedback: feedbackResult
        };

        const updatedUser = {
            ...user,
            tests: { ...user.tests, sdt: [...(user.tests?.sdt || []), testResult] }
        };
        updateUser(updatedUser);
        
        unlockBadge('first_step');
        if(user.tests?.tat && user.tests?.wat && user.tests?.srt) unlockBadge('psych_initiate');
    };
    
    if (step === 'instructions') {
        return (
            <div>
                <h1 className="page-header">Self-Description Test (SDT)</h1>
                <div className="card test-instructions">
                    <h2>Instructions</h2>
                    <p>You are required to write your opinion about yourself based on a few prompts.</p>
                    <p>There is no time limit for this test. Write honestly and thoughtfully.</p>
                    <p>Your responses will provide insight into your self-awareness.</p>
                    <button onClick={() => setStep('running')} className="btn btn-primary">Begin Test</button>
                </div>
            </div>
        );
    }
    
    if (step === 'finished') {
        return (
            <div className="text-center">
                <h1 className="page-header">Test Complete</h1>
                <div className="card">
                    <h2>Thank you for completing the SDT.</h2>
                    {loadingFeedback ? <LoadingSpinner text="Analyzing your self-description..." /> : 
                        <FeedbackModal feedback={feedback} testType="SDT" onClose={() => setPage('dashboard')} />
                    }
                </div>
            </div>
        );
    }
    
    return (
        <div>
            <h1 className="page-header">Self-Description Test</h1>
            <div className="card">
                <form onSubmit={handleSubmit}>
                    {SDT_PROMPTS.map(prompt => (
                        <div key={prompt} className="form-group">
                            <label>{prompt}</label>
                            <textarea
                                value={responses[prompt]}
                                onChange={(e) => handleInputChange(prompt, e.target.value)}
                                required
                            />
                        </div>
                    ))}
                    <button type="submit" className="btn btn-primary btn-block">Submit Description</button>
                </form>
            </div>
        </div>
    );
};

const OIRTestRunner = ({ user, updateUser, unlockBadge, verbalQuestions, nonVerbalQuestions, setPage }) => {
    const [stage, setStage] = useState('instructions'); // instructions, verbal, verbal-result, non-verbal, non-verbal-result
    const [currentQuestions, setCurrentQuestions] = useState([]);
    const [currentQIndex, setCurrentQIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [timeLeft, setTimeLeft] = useState(1800); // 30 minutes
    const [verbalResult, setVerbalResult] = useState(null);
    const [nonVerbalResult, setNonVerbalResult] = useState(null);
    const [isAssessing, setIsAssessing] = useState(false);
    
    const timerRef = useRef(null);

    const startTest = (type) => {
        const fullQuestionBank = type === 'verbal' ? verbalQuestions : nonVerbalQuestions;
        const shuffled = [...fullQuestionBank].sort(() => 0.5 - Math.random());
        const selectedQuestions = shuffled.slice(0, 50);
        
        setCurrentQuestions(selectedQuestions);
        setAnswers(Array(50).fill(null));
        setCurrentQIndex(0);
        setTimeLeft(1800);
        setStage(type);
    };

    const handleAnswerSelect = (option) => {
        const newAnswers = [...answers];
        newAnswers[currentQIndex] = option;
        setAnswers(newAnswers);
    };

    const handleSubmit = useCallback(async () => {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setIsAssessing(true);

        const currentTestType = stage;
        const results = currentQuestions.map((q, i) => ({
            question: q,
            userAnswer: answers[i] || 'Not Answered',
        }));

        const score = results.reduce((acc, r) => acc + (r.userAnswer === r.question.answer ? 1 : 0), 0) / results.length * 100;

        const assessment = await getAIAssessment('OIR', {
            testType: currentTestType,
            results: results
        });
        
        const resultPayload = {
            date: new Date().toISOString(),
            score: score,
            assessment: assessment,
            type: currentTestType,
        };

        if (currentTestType === 'verbal') {
            setVerbalResult(resultPayload);
            setStage('verbal-result');
        } else {
            setNonVerbalResult(resultPayload);
            setStage('non-verbal-result');
        }
        
        setIsAssessing(false);

        // Save after each part
        const updatedUser = {
            ...user,
            tests: { ...user.tests, oir: [...(user.tests?.oir || []), resultPayload] }
        };
        updateUser(updatedUser);
        unlockBadge('first_step');
        if (score === 100) unlockBadge('perfect_oir');

    }, [stage, currentQuestions, answers, user, updateUser, unlockBadge]);

    useEffect(() => {
        if (stage === 'verbal' || stage === 'non-verbal') {
            timerRef.current = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        handleSubmit();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [stage, handleSubmit]);
    
    if (stage === 'instructions') {
        return (
            <div>
                <h1 className="page-header">Officer Intelligence Rating (OIR) Test</h1>
                <div className="card test-instructions">
                    <h2>Instructions</h2>
                    <p>This test consists of two parts: Verbal Reasoning and Non-Verbal Reasoning.</p>
                    <p>Each part contains <strong>50 questions</strong> and you will have <strong>30 minutes</strong> to complete each part.</p>
                    <p>You can navigate between questions within a test. Your results and an AI assessment will be shown after each part.</p>
                    <button onClick={() => startTest('verbal')} className="btn btn-primary">Begin Verbal Test</button>
                </div>
            </div>
        );
    }

    if (isAssessing) {
        return <div className="card text-center"><LoadingSpinner text={`Analyzing your ${stage} test performance...`} /></div>;
    }
    
    if (stage === 'verbal-result' || stage === 'non-verbal-result') {
        const result = stage === 'verbal-result' ? verbalResult : nonVerbalResult;
        return (
            <div>
                <h1 className="page-header">OIR {result.type} Test Result</h1>
                <div className="card">
                    <h2 className="text-center">Your Score: {result.score.toFixed(2)}%</h2>
                    {result.assessment && !result.assessment.error ? (
                         <FeedbackModal feedback={result.assessment} testType={`OIR ${result.type}`} onClose={() => {}} />
                    ) : <p className="login-error text-center">{result.assessment?.error || "Could not generate assessment."}</p>}
                    <div className="text-center" style={{marginTop: '2rem'}}>
                        {stage === 'verbal-result' ? (
                            <button onClick={() => startTest('non-verbal')} className="btn btn-primary">Start Non-Verbal Test</button>
                        ) : (
                            <button onClick={() => setPage('dashboard')} className="btn btn-primary">Back to Dashboard</button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    const q = currentQuestions[currentQIndex];
    
    return (
        <div className="test-runner-container">
            <h1 className="page-header">OIR {stage} Test</h1>
            <div className="timer">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
            <div className="card">
                <div className="oir-question-container">
                    <h4>Question {currentQIndex + 1} of 50</h4>
                    <p>{q.question}</p>
                    {q.imageUrl && <img src={q.imageUrl} alt="OIR Question Figure" />}
                    <div className="oir-options">
                        {q.options.map((option, i) => (
                            <label key={i} className={`oir-option ${answers[currentQIndex] === option ? 'selected' : ''}`}>
                                <input type="radio" name={`q${currentQIndex}`} checked={answers[currentQIndex] === option} onChange={() => handleAnswerSelect(option)} />
                                {stage === 'non-verbal' ? <img src={option} alt={`Option ${i+1}`} /> : <span>{option}</span>}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="oir-controls">
                    <button className="btn btn-secondary" onClick={() => setCurrentQIndex(p => p - 1)} disabled={currentQIndex === 0}>Previous</button>
                    <span>{currentQIndex + 1} / 50</span>
                    {currentQIndex < 49 ?
                        <button className="btn btn-secondary" onClick={() => setCurrentQIndex(p => p + 1)}>Next</button>
                        :
                        <button className="btn btn-primary" onClick={handleSubmit}>Submit Test</button>
                    }
                </div>
            </div>
        </div>
    );
};

const GPERunner = ({ user, updateUser, unlockBadge, scenario, setPage }) => {
    const [step, setStep] = useState('instructions');
    const [solution, setSolution] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [loadingFeedback, setLoadingFeedback] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setStep('finished');
        setLoadingFeedback(true);

        const dataToAssess = {
            problemStatement: scenario.problemStatement,
            solution: solution
        };

        const feedbackResult = await getAIAssessment('GPE', dataToAssess);
        setFeedback(feedbackResult);
        setLoadingFeedback(false);

        const testResult = {
            date: new Date().toISOString(),
            solution: solution,
            scenarioTitle: scenario.title,
            feedback: feedbackResult
        };

        const updatedUser = {
            ...user,
            tests: { ...user.tests, gpe: [...(user.tests?.gpe || []), testResult] }
        };
        updateUser(updatedUser);
        
        unlockBadge('first_step');
        unlockBadge('group_strategist');
    };
    
    if (step === 'instructions') {
        return (
            <div>
                <h1 className="page-header">Group Planning Exercise (GPE)</h1>
                <div className="card test-instructions">
                    <h2>Instructions</h2>
                    <p>You will be presented with a problem scenario, usually accompanied by a map.</p>
                    <p>Your task is to analyze the situation, prioritize problems, and write a comprehensive plan to tackle them using the available resources.</p>
                    <p>Structure your plan clearly. There is no time limit, but aim to be efficient.</p>
                    <button onClick={() => setStep('running')} className="btn btn-primary">Begin Exercise</button>
                </div>
            </div>
        );
    }

    if (step === 'finished') {
         return (
            <div className="text-center">
                <h1 className="page-header">Exercise Complete</h1>
                <div className="card">
                    <h2>Thank you for completing the GPE.</h2>
                    {loadingFeedback ? <LoadingSpinner text="Assessing your plan..." /> : 
                        <FeedbackModal feedback={feedback} testType="GPE" onClose={() => setPage('dashboard')} />
                    }
                </div>
            </div>
        );
    }

    return (
        <div>
            <h1 className="page-header">{scenario.title}</h1>
            <form onSubmit={handleSubmit}>
                <div className="gpe-container">
                    <div className="gpe-problem-pane card">
                        <img src={scenario.mapImage} alt="GPE Map" className="gpe-map" />
                        <div className="gpe-problem-statement">
                            <p style={{whiteSpace: 'pre-wrap'}}>{scenario.problemStatement}</p>
                        </div>
                    </div>
                    <div className="gpe-solution-pane card">
                        <h3>Your Solution</h3>
                        <textarea
                            value={solution}
                            onChange={(e) => setSolution(e.target.value)}
                            placeholder="Write your detailed plan here..."
                            required
                        />
                        <button type="submit" className="btn btn-primary">Submit Plan</button>
                    </div>
                </div>
            </form>
        </div>
    );
};

const Lecturerette = ({ user, updateUser, unlockBadge, topics, setPage }) => {
    const [step, setStep] = useState('instructions'); // instructions, prepare, speak, finished
    const [chosenTopic, setChosenTopic] = useState('');
    const [timeLeft, setTimeLeft] = useState(150); // 2.5 mins for prep
    const [transcript, setTranscript] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const [loadingFeedback, setLoadingFeedback] = useState(false);
    
    const recognitionRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        // Setup speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = true;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.onresult = (event) => {
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }
                setTranscript(prev => prev + finalTranscript);
            };
        }
    }, []);
    
    const startTimer = (duration, onEnd) => {
        setTimeLeft(duration);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    onEnd();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleStart = () => {
        const shuffled = [...topics].sort(() => 0.5 - Math.random());
        setChosenTopic(shuffled[0]);
        setStep('prepare');
        startTimer(150, () => { // 2.5 minutes
            setStep('speak');
            startSpeaking();
        });
    };
    
    const startSpeaking = () => {
        if (recognitionRef.current) {
            setIsRecording(true);
            setTranscript('');
            recognitionRef.current.start();
            startTimer(180, handleEndSpeaking); // 3 minutes
        } else {
            alert("Speech recognition not supported in this browser.");
        }
    };
    
    const handleEndSpeaking = useCallback(async () => {
        if (isRecording) {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsRecording(false);
        }
        if(timerRef.current) clearInterval(timerRef.current);
        setStep('finished');
        setLoadingFeedback(true);

        // A slight delay to ensure final transcript is captured
        setTimeout(async () => {
            const dataToAssess = { topic: chosenTopic, transcript };
            const feedbackResult = await getAIAssessment('Lecturerette', dataToAssess);
            setFeedback(feedbackResult);
            setLoadingFeedback(false);
    
            const testResult = {
                date: new Date().toISOString(),
                topic: chosenTopic,
                transcript: transcript,
                feedback: feedbackResult
            };
    
            const updatedUser = {
                ...user,
                tests: { ...user.tests, lecturerette: [...(user.tests?.lecturerette || []), testResult] }
            };
            updateUser(updatedUser);
            
            unlockBadge('first_step');
            unlockBadge('orator_apprentice');
        }, 500);

    }, [chosenTopic, transcript, user, updateUser, unlockBadge, isRecording]);
    
    const renderContent = () => {
        switch(step) {
            case 'instructions':
                return (
                     <div className="text-center test-instructions">
                        <h2>Lecturerette</h2>
                        <p>When you begin, you will be given a random topic.</p>
                        <p>You will have <strong>2 minutes and 30 seconds</strong> to prepare your thoughts.</p>
                        <p>Immediately after, you will have <strong>3 minutes</strong> to speak on the topic.</p>
                        <button onClick={handleStart} className="btn btn-primary">Start</button>
                    </div>
                );
            case 'prepare':
                 return (
                    <div className="text-center">
                        <h2>Prepare Your Talk</h2>
                        <p>Your Topic:</p>
                        <h3 style={{color: 'var(--accent-color)', margin: '1rem 0'}}>{chosenTopic}</h3>
                        <div className="timer">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
                        <p>Use this time to structure your thoughts. The speaking phase will begin automatically.</p>
                         <LoadingSpinner text="Preparing..."/>
                    </div>
                 );
            case 'speak':
                 return (
                    <div className="text-center">
                        <h2>Speak Now</h2>
                        <p>Topic: <strong>{chosenTopic}</strong></p>
                        <div className="timer">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
                        <div className="mic-button active" style={{margin: '1rem auto'}}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" /></svg>
                        </div>
                        <button onClick={handleEndSpeaking} className="btn btn-danger">End Speaking Now</button>
                    </div>
                 );
            case 'finished':
                return (
                    <div className="text-center">
                        <h2>Lecturerette Complete</h2>
                        {loadingFeedback ? <LoadingSpinner text="Analyzing your speech..." /> : 
                            <FeedbackModal feedback={feedback} testType="Lecturerette" onClose={() => setPage('dashboard')} />
                        }
                    </div>
                );
        }
    };
    
    return (
        <div>
            <h1 className="page-header">Lecturerette</h1>
            <div className="card">
                {renderContent()}
            </div>
        </div>
    );
};

const PIQForm = ({ user, onSave, setPage }) => {
    const [piqData, setPiqData] = useState(user.piq || {});

    const handleChange = (e) => {
        const { name, value } = e.target;
        const keys = name.split('.');
        if (keys.length > 1) {
            setPiqData(prev => ({
                ...prev,
                [keys[0]]: {
                    ...prev[keys[0]],
                    [keys[1]]: value
                }
            }));
        } else {
            setPiqData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({ ...user, piq: piqData });
        alert('PIQ data saved successfully!');
        setPage('dashboard');
    };

    return (
        <div>
            <h1 className="page-header">Personal Information Questionnaire (PIQ)</h1>
            <form className="piq-form" onSubmit={handleSubmit}>
                <div className="card">
                    <fieldset>
                        <legend>Personal Details</legend>
                        <div className="piq-form-grid">
                            <div className="form-group">
                                <label>Date of Birth</label>
                                <input type="date" name="personal.dob" value={piqData.personal?.dob || ''} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Place of Birth (District & State)</label>
                                <input type="text" name="personal.pob" value={piqData.personal?.pob || ''} onChange={handleChange} />
                            </div>
                            <div className="form-group">
                                <label>Hobbies & Interests</label>
                                <textarea name="personal.hobbies" value={piqData.personal?.hobbies || ''} onChange={handleChange}></textarea>
                            </div>
                        </div>
                    </fieldset>
                    
                    <fieldset>
                        <legend>Family Background</legend>
                         <div className="piq-form-grid">
                             <div className="form-group">
                                <label>Father's Occupation</label>
                                <input type="text" name="family.father_occupation" value={piqData.family?.father_occupation || ''} onChange={handleChange} />
                            </div>
                             <div className="form-group">
                                <label>Mother's Occupation</label>
                                <input type="text" name="family.mother_occupation" value={piqData.family?.mother_occupation || ''} onChange={handleChange} />
                            </div>
                             <div className="form-group">
                                <label>Number of Siblings</label>
                                <input type="number" name="family.siblings" value={piqData.family?.siblings || ''} onChange={handleChange} />
                            </div>
                        </div>
                    </fieldset>
                    
                    <fieldset>
                        <legend>Education & Achievements</legend>
                         <div className="piq-form-grid">
                            <div className="form-group">
                                <label>Highest Qualification</label>
                                <input type="text" name="education.qualification" value={piqData.education?.qualification || ''} onChange={handleChange} />
                            </div>
                             <div className="form-group">
                                <label>Sports / Games Played (mention level)</label>
                                <textarea name="education.sports" value={piqData.education?.sports || ''} onChange={handleChange}></textarea>
                            </div>
                             <div className="form-group">
                                <label>Leadership Roles (e.g., Captain, Prefect)</label>
                                <textarea name="education.leadership" value={piqData.education?.leadership || ''} onChange={handleChange}></textarea>
                            </div>
                         </div>
                    </fieldset>
                    <button type="submit" className="btn btn-primary btn-block">Save PIQ</button>
                </div>
            </form>
        </div>
    );
};

const ProfilePage = ({ user, onSave }) => {
    const [name, setName] = useState(user.name);
    const [profilePic, setProfilePic] = useState(user.profilePic || DEFAULT_PROFILE_PIC);
    const [isEditing, setIsEditing] = useState(false);

    const handleSave = () => {
        onSave({ ...user, name, profilePic });
        setIsEditing(false);
    };

    return (
        <div>
            <h1 className="page-header">My Profile</h1>
            <div className="card">
                <div className="profile-edit-container">
                    <div className="profile-photo-section">
                        <img src={profilePic} alt="Profile" className="profile-picture" />
                        {isEditing && (
                            <div className="form-group">
                                <label>Profile Picture URL</label>
                                <input type="text" value={profilePic} onChange={e => setProfilePic(e.target.value)} />
                            </div>
                        )}
                    </div>
                    <div className="profile-details-section">
                        {isEditing ? (
                            <div className="form-group">
                                <label>Full Name</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} style={{fontSize: '1.5rem', fontWeight: 'bold'}} />
                            </div>
                        ) : (
                            <>
                                <h2>{name}</h2>
                                <p>Roll No: {user.rollNo}</p>
                            </>
                        )}
                        <BadgesSection user={user} />
                        {isEditing ? (
                             <button onClick={handleSave} className="btn btn-primary">Save Changes</button>
                        ) : (
                             <button onClick={() => setIsEditing(true)} className="btn btn-secondary">Edit Profile</button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const OLQDashboard = ({ user }) => {
    const olqScores = useMemo(() => {
        const scores = OLQ_LIST.reduce((acc, olq) => ({ ...acc, [olq]: 0 }), {});
        const tests = user.tests || {};
        let count = 0;

        Object.values(tests).forEach((testResults: any[]) => {
            testResults.forEach(result => {
                if (result.feedback && !result.feedback.error) {
                    count++;
                    const { olqs_demonstrated = [], strengths = [], weaknesses = [] } = result.feedback;
                    olqs_demonstrated.forEach(olq => {
                        if (scores[olq] !== undefined) scores[olq] += 2;
                    });
                    strengths.forEach(s => {
                         if (scores[s.example_olq] !== undefined) scores[s.example_olq] += 1;
                    });
                    weaknesses.forEach(w => {
                         if (scores[w.example_olq] !== undefined) scores[w.example_olq] -= 1;
                    });
                }
            });
        });
        
        // Normalize scores
        Object.keys(scores).forEach(olq => {
            scores[olq] = Math.max(0, scores[olq]); // Ensure no negative scores
            if (count > 0) {
                 scores[olq] = Math.min(10, (scores[olq] / (count * 2)) * 10); // Normalize to a 0-10 scale
            }
        });

        return scores;
    }, [user.tests]);
    
    const RadarChart = ({ data }) => {
        const size = 300;
        const center = size / 2;
        const numLevels = 5;
        const radius = center * 0.8;
        const angleSlice = (Math.PI * 2) / OLQ_LIST.length;

        const points = OLQ_LIST.map((olq, i) => {
            const value = data[olq] || 0;
            const angle = angleSlice * i - Math.PI / 2;
            const x = center + (radius * value / 10) * Math.cos(angle);
            const y = center + (radius * value / 10) * Math.sin(angle);
            return `${x},${y}`;
        }).join(' ');
        
        return (
            <div className="radar-chart-container">
                <svg viewBox={`0 0 ${size} ${size}`} className="radar-chart-svg">
                    {[...Array(numLevels)].map((_, level) => (
                        <circle key={level} cx={center} cy={center} r={(radius / numLevels) * (level + 1)} fill="none" className="radar-chart-level" />
                    ))}
                    {OLQ_LIST.map((olq, i) => {
                        const angle = angleSlice * i - Math.PI / 2;
                        return (
                            <g key={olq}>
                                <line x1={center} y1={center} x2={center + radius * Math.cos(angle)} y2={center + radius * Math.sin(angle)} className="radar-chart-axis" />
                                <text x={center + (radius + 15) * Math.cos(angle)} y={center + (radius + 15) * Math.sin(angle)} textAnchor="middle" alignmentBaseline="middle" className="radar-chart-label">
                                    {olq.split(' ').map(w => w[0]).join('')}
                                </text>
                            </g>
                        )
                    })}
                    <polygon points={points} className="radar-chart-area" />
                </svg>
            </div>
        )
    };
    
    return (
        <div>
            <h1 className="page-header">OLQ Analysis Dashboard</h1>
            <div className="card">
                <div className="olq-dashboard-container">
                    <div>
                        <h3>Your OLQ Radar</h3>
                        <p>This chart visualizes your Officer-Like Qualities based on AI feedback from all your completed tests.</p>
                        <RadarChart data={olqScores} />
                    </div>
                    <div>
                        <h3>Interpretation</h3>
                        <p>A score of 10 indicates a consistent demonstration of the quality.</p>
                        <table className="olq-interpretation-table">
                            <tbody>
                            {OLQ_LIST.map(olq => (
                                <tr key={olq}>
                                    <td><strong>{olq}</strong></td>
                                    <td>
                                        <div className="progress-bar-container" style={{height: '16px'}}>
                                            <div className="progress-bar-fill" style={{width: `${olqScores[olq] * 10}%`}}>
                                                <span style={{paddingLeft: '5px', color: 'black', fontSize:'0.8rem', fontWeight:'bold'}}>{olqScores[olq].toFixed(1)}</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

const CurrentAffairs = () => {
    const topics = ["Indo-China Relations", "Defense Modernization", "Indian Economy", "Science & Technology in India"];
    const [news, setNews] = useState({});
    const [loadingTopic, setLoadingTopic] = useState(null);
    const [generalNews, setGeneralNews] = useState('');
    const [isGeneralLoading, setIsGeneralLoading] = useState(false);

    const fetchNews = async (topic) => {
        setLoadingTopic(topic);
        const update = await getNewsUpdate(topic);
        setNews(prev => ({ ...prev, [topic]: update }));
        setLoadingTopic(null);
    };

    const fetchGeneralNews = async () => {
        setIsGeneralLoading(true);
        setGeneralNews('');
        try {
            const response = await getAI().models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts: [{ text: `Summarize the top 5 most important recent news headlines (national and international) that are relevant for an Indian Armed Forces (SSB) aspirant. For each headline, provide a 2-3 sentence summary. Format the entire response nicely using Markdown.`}]},
            });
            setGeneralNews(response.text || '');
        } catch (error) {
            console.error("General news fetch error:", error);
            setGeneralNews("Could not fetch the latest news at this time. Please try again later.");
        }
        setIsGeneralLoading(false);
    };

    return (
        <div>
            <h1 className="page-header">Current Affairs Briefing</h1>
            <div className="news-grid">
                <div className="card news-card current-affairs-general">
                    <h3>Top Headlines Briefing</h3>
                    <p>Get a summary of the most recent and relevant news for defense aspirants.</p>
                    <button onClick={fetchGeneralNews} disabled={isGeneralLoading} className="btn btn-primary">
                        {isGeneralLoading ? 'Fetching News...' : 'Fetch Recent News'}
                    </button>
                    {isGeneralLoading && <LoadingSpinner />}
                    {generalNews && <div className="general-news-content">{generalNews}</div>}
                </div>

                {topics.map(topic => (
                    <div className="card news-card" key={topic}>
                        <h3>{topic}</h3>
                        {news[topic] ? 
                            <p style={{whiteSpace: 'pre-wrap', flexGrow: 1}}>{news[topic]}</p> : 
                            <p style={{flexGrow: 1}}>Click to get the latest AI-powered summary on this topic.</p>
                        }
                        <button onClick={() => fetchNews(topic)} disabled={loadingTopic === topic} className="btn btn-secondary">
                            {loadingTopic === topic ? 'Loading...' : 'Get Update'}
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

const TopicBriefer = () => {
    const [topic, setTopic] = useState('');
    const [briefing, setBriefing] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!topic) return;
        setIsLoading(true);
        setBriefing('');
        const result = await getTopicBriefing(topic);
        setBriefing(result);
        setIsLoading(false);
    };

    return (
        <div>
            <h1 className="page-header">AI Topic Briefer</h1>
            <div className="card">
                <p>Enter any topic for a lecturerette, group discussion, or interview, and the AI will generate a structured briefing for you.</p>
                <form className="topic-briefer-form" onSubmit={handleSubmit}>
                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., Artificial Intelligence" required />
                    <button type="submit" className="btn btn-primary" disabled={isLoading}>
                        {isLoading ? 'Generating...' : 'Get Briefing'}
                    </button>
                </form>
                {isLoading && <LoadingSpinner text="Preparing your briefing..."/>}
                {briefing && <div className="briefer-content">{briefing}</div>}
            </div>
        </div>
    );
};

const CommunityPage = ({ currentUser, allUsers, chats, data, saveData, sendFriendRequest, handleFriendRequest }) => {
    const [activeTab, setActiveTab] = useState('friends');
    const [selectedUser, setSelectedUser] = useState(null);
    const [message, setMessage] = useState('');
    const chatHistoryRef = useRef(null);

    const friends = useMemo(() => allUsers.filter(u => currentUser.friends?.includes(u.rollNo)), [allUsers, currentUser]);
    const friendRequesters = useMemo(() => allUsers.filter(u => currentUser.friendRequests?.includes(u.rollNo)), [allUsers, currentUser]);
    const otherUsers = useMemo(() => allUsers.filter(u => u.rollNo !== currentUser.rollNo && !currentUser.friends?.includes(u.rollNo) && !currentUser.friendRequests?.includes(u.rollNo)), [allUsers, currentUser]);

    const chatId = useMemo(() => {
        if (!selectedUser) return null;
        return [currentUser.rollNo, selectedUser.rollNo].sort().join('-');
    }, [currentUser, selectedUser]);
    
    const chatHistory = chats?.[chatId] || [];
    
    useEffect(() => {
        // Auto-scroll to bottom of chat
        if (chatHistoryRef.current) {
            chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!message.trim() || !chatId) return;
        
        const newMessage = {
            sender: currentUser.rollNo,
            text: message,
            timestamp: new Date().toISOString()
        };
        
        const updatedChats = {
            ...chats,
            [chatId]: [...(chats[chatId] || []), newMessage]
        };
        
        saveData({ ...data, chats: updatedChats });
        setMessage('');
    };

    return (
        <div>
            <h1 className="page-header">Community Hub</h1>
            <div className="community-container">
                <div className="community-sidebar">
                    <div className="community-tabs">
                        <button className={activeTab === 'friends' ? 'active' : ''} onClick={() => setActiveTab('friends')}>Friends ({friends.length})</button>
                        <button className={activeTab === 'requests' ? 'active' : ''} onClick={() => setActiveTab('requests')}>Requests ({friendRequesters.length})</button>
                        <button className={activeTab === 'all' ? 'active' : ''} onClick={() => setActiveTab('all')}>Find Aspirants</button>
                    </div>
                    <div className="community-list">
                        {activeTab === 'friends' && (
                            friends.length > 0 ? friends.map(u => (
                                <div key={u.rollNo} className={`community-list-item ${selectedUser?.rollNo === u.rollNo ? 'active' : ''}`} onClick={() => setSelectedUser(u)}>
                                    <img src={u.profilePic || DEFAULT_PROFILE_PIC} alt={u.name} />
                                    <span>{u.name}</span>
                                </div>
                            )) : <div className="content-list-item-empty">You have no friends yet.</div>
                        )}
                        {activeTab === 'requests' && (
                             friendRequesters.length > 0 ? friendRequesters.map(u => (
                                <div key={u.rollNo} className="community-list-item request">
                                    <img src={u.profilePic || DEFAULT_PROFILE_PIC} alt={u.name} />
                                    <span>{u.name}</span>
                                    <div className="request-actions">
                                        <button className="btn btn-primary" onClick={() => handleFriendRequest(currentUser, u.rollNo, true)}>Accept</button>
                                        <button className="btn btn-secondary" onClick={() => handleFriendRequest(currentUser, u.rollNo, false)}>Decline</button>
                                    </div>
                                </div>
                            )) : <div className="content-list-item-empty">No pending friend requests.</div>
                        )}
                        {activeTab === 'all' && (
                            otherUsers.length > 0 ? otherUsers.map(u => {
                                const isRequestSent = u.friendRequests?.includes(currentUser.rollNo);
                                return (
                                    <div key={u.rollNo} className="community-list-item">
                                        <img src={u.profilePic || DEFAULT_PROFILE_PIC} alt={u.name} />
                                        <span>{u.name}</span>
                                        <button className="btn btn-secondary" onClick={() => sendFriendRequest(currentUser, u)} disabled={isRequestSent}>
                                            {isRequestSent ? 'Request Sent' : 'Add Friend'}
                                        </button>
                                    </div>
                                );
                            }) : <div className="content-list-item-empty">No other aspirants to show.</div>
                        )}
                    </div>
                </div>
                <div className="community-main">
                    {selectedUser ? (
                        <div className="chat-and-profile-layout">
                            <div className="chat-view">
                                <div className="chat-history" ref={chatHistoryRef}>
                                     {chatHistory.map((msg, i) => (
                                         <div key={i} className={`chat-bubble ${msg.sender === currentUser.rollNo ? 'user' : 'friend'}`}>
                                            {msg.text}
                                            <span className="chat-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                         </div>
                                     ))}
                                </div>
                                <form className="chat-input-form" onSubmit={handleSendMessage}>
                                    <input type="text" value={message} onChange={e => setMessage(e.target.value)} placeholder={`Message ${selectedUser.name}...`}/>
                                    <button type="submit" className="btn btn-primary">Send</button>
                                </form>
                            </div>
                            <div className="friend-profile-view card">
                                <ProfilePage user={selectedUser} onSave={() => {}}/>
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                            <p>Select a friend to start chatting or find new aspirants to connect with.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Leaderboard = ({ users, currentUser }) => {
    const rankedUsers = useMemo(() => {
        if (!users) return [];
        return users.map(user => {
            const testsCompleted = Object.values(user.tests || {}).flat().length;
            const badgesEarned = (user.badges || []).length;
            const score = (testsCompleted * 10) + (badgesEarned * 25);
            return { ...user, score, testsCompleted, badgesEarned };
        }).sort((a, b) => b.score - a.score);
    }, [users]);
    
    return (
        <div>
            <h1 className="page-header">Leaderboard</h1>
            <div className="card">
                <table className="leaderboard-table">
                    <thead>
                        <tr>
                            <th className="rank">Rank</th>
                            <th>Name</th>
                            <th>Tests Done</th>
                            <th>Badges</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rankedUsers.map((user, index) => (
                            <tr key={user.rollNo} className={user.rollNo === currentUser.rollNo ? 'current-user' : ''}>
                                <td className="rank">{index + 1}</td>
                                <td>{user.name}</td>
                                <td>{user.testsCompleted}</td>
                                <td>{user.badgesEarned}</td>
                                <td>{user.score}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ContentEditor = ({ title, items, onAdd, onDelete, inputType, inputPlaceholder, renderItem }) => {
    const [newItem, setNewItem] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onAdd(newItem);
        setNewItem('');
    };
    
    return (
        <div>
            <h3>{title}</h3>
            <div className="content-list">
                {(items && items.length > 0) ? items.map((item, index) => (
                    <div key={index} className="content-list-item">
                        {renderItem ? renderItem(item, index) : <span className="item-text">{item}</span>}
                        <button onClick={() => onDelete(index)} className="btn btn-danger" style={{padding: '4px 8px', fontSize: '0.8rem', marginLeft: 'auto'}}>Delete</button>
                    </div>
                )) : <div className="content-list-item-empty">No items yet.</div>}
            </div>
             <form onSubmit={handleSubmit} className="add-item-form">
                {inputType === 'textarea' ? (
                     <textarea value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={inputPlaceholder} required style={{minHeight: '60px'}}/>
                ) : (
                    <input type={inputType === 'url' ? 'url' : inputType} value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder={inputPlaceholder} required />
                )}
                <button type="submit" className="btn btn-primary">Add</button>
            </form>
        </div>
    );
};

const TATImageEditor = ({ items, onAdd, onDelete }) => {
    const [urlInput, setUrlInput] = useState('');
    const [fileInput, setFileInput] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        const file = e.target.files ? e.target.files[0] : null;
        if (file) {
            setFileInput(file);
            setUrlInput(''); // Clear URL if a file is selected
        }
    };
    
    const handleUrlChange = (e) => {
        setUrlInput(e.target.value);
        if (e.target.value) {
            setFileInput(null); // Clear file if URL is typed
            if (fileInputRef.current) (fileInputRef.current as any).value = '';
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!urlInput.trim() && !fileInput) {
            alert('Please provide a URL or select a file.');
            return;
        }

        setIsUploading(true);
        let newItemUrl;

        if (fileInput) {
            try {
                // FIX: Add robust check for Firebase initialization before using storage.
                if (!firebase || !firebase.apps || firebase.apps.length === 0 || !firebase.storage) {
                    throw new Error("Firebase Storage is not initialized. Please configure Firebase in index.html.");
                }
                const storageRef = firebase.storage().ref();
                const fileName = `tat_images/${Date.now()}_${fileInput.name}`;
                const imageRef = storageRef.child(fileName);
                const snapshot = await imageRef.put(fileInput);
                newItemUrl = await snapshot.ref.getDownloadURL();
            } catch (error) {
                console.error("Error uploading image:", error);
                alert(`Image upload failed: ${error.message}`);
                setIsUploading(false);
                return;
            }
        } else {
            newItemUrl = urlInput;
        }

        onAdd(newItemUrl);
        
        // Reset form
        setUrlInput('');
        setFileInput(null);
        if (fileInputRef.current) {
            (fileInputRef.current as any).value = '';
        }
        setIsUploading(false);
    };

    return (
        <div>
            <h3>Thematic Apperception Test (TAT) Images</h3>
            <div className="content-list">
                {(items && items.length > 0) ? items.map((item, index) => (
                    <div key={index} className="content-list-item">
                        <img src={item} alt="TAT Preview" className="image-preview"/>
                        <span className="item-text">{item}</span>
                        <button onClick={() => onDelete(index)} className="btn btn-danger" style={{padding: '4px 8px', fontSize: '0.8rem', marginLeft: 'auto'}} disabled={isUploading}>Delete</button>
                    </div>
                )) : <div className="content-list-item-empty">No images yet. Add one below.</div>}
            </div>
            <form onSubmit={handleSubmit} className="add-item-form-stacked">
                <div className="form-group">
                    <label>Add by URL</label>
                    <input type="url" value={urlInput} onChange={handleUrlChange} placeholder="Enter Image URL..." disabled={isUploading} />
                </div>
                <div className="form-or-divider">OR</div>
                <div className="form-group">
                    <label>Upload from Device</label>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" className="form-control" disabled={isUploading} />
                    {fileInput && <p className="file-preview-text">Selected: {fileInput.name}</p>}
                </div>
                <button type="submit" className="btn btn-primary" disabled={isUploading}>
                    {isUploading ? 'Uploading...' : 'Add Image'}
                </button>
            </form>
        </div>
    );
};

const ContentManagementPanel = ({ content, onUpdate }) => {
    const [activeContentTab, setActiveContentTab] = useState('tat_images');

    const handleAddItem = (type, item) => {
        if (!item || (typeof item === 'string' && !item.trim())) return;
        const currentContent = content[type] || [];
        onUpdate(type, [...currentContent, item]);
    };

    const handleDeleteItem = (type, index) => {
        if (window.confirm('Are you sure you want to delete this item?')) {
            const currentContent = content[type] || [];
            onUpdate(type, currentContent.filter((_, i) => i !== index));
        }
    };
    
    const renderContentEditor = () => {
        switch (activeContentTab) {
            case 'tat_images':
                return <TATImageEditor 
                            items={content.tat_images}
                            onAdd={(itemUrl) => handleAddItem('tat_images', itemUrl)}
                            onDelete={(index) => handleDeleteItem('tat_images', index)}
                        />;
            case 'wat_words':
                 return <ContentEditor 
                            title="Word Association Test (WAT) Words"
                            items={content.wat_words}
                            onAdd={(item) => handleAddItem('wat_words', item)}
                            onDelete={(index) => handleDeleteItem('wat_words', index)}
                            inputType="text"
                            inputPlaceholder="Enter new word..."
                            renderItem={(item, index) => <span className="item-text">{item}</span>}
                        />;
            case 'srt_scenarios':
                 return <ContentEditor 
                            title="Situation Reaction Test (SRT) Scenarios"
                            items={content.srt_scenarios}
                            onAdd={(item) => handleAddItem('srt_scenarios', item)}
                            onDelete={(index) => handleDeleteItem('srt_scenarios', index)}
                            inputType="textarea"
                            inputPlaceholder="Enter new scenario..."
                            renderItem={(item, index) => <span className="item-text">{item}</span>}
                        />;
            default:
                return null;
        }
    };
    
    return (
        <div className="card">
             <div className="community-tabs">
                <button className={activeContentTab === 'tat_images' ? 'active' : ''} onClick={() => setActiveContentTab('tat_images')}>TAT Images</button>
                <button className={activeContentTab === 'wat_words' ? 'active' : ''} onClick={() => setActiveContentTab('wat_words')}>WAT Words</button>
                <button className={activeContentTab === 'srt_scenarios' ? 'active' : ''} onClick={() => setActiveContentTab('srt_scenarios')}>SRT Scenarios</button>
            </div>
            <div className="admin-tab-content">
                {renderContentEditor()}
            </div>
        </div>
    );
};


const AdminPanel = ({ data, saveData }) => {
    const [activeTab, setActiveTab] = useState('users');
    const [selectedRollNo, setSelectedRollNo] = useState(null);
    const selectedUser = useMemo(() => data.users.find(u => u.rollNo === selectedRollNo), [data, selectedRollNo]);
    
    const handleContentUpdate = (contentType, newContent) => {
        const updatedContent = { ...data.content, [contentType]: newContent };
        saveData({ ...data, content: updatedContent });
        // Could add a "toast" notification here for better UX
    };

    return (
        <div>
            <h1 className="page-header">Admin Panel</h1>
            <div className="card" style={{marginBottom: '1rem', padding: 'var(--spacing-md) var(--spacing-xl)'}}>
                 <div className="community-tabs" style={{borderBottom: 'none'}}>
                    <button className={activeTab === 'users' ? 'active' : ''} onClick={() => setActiveTab('users')}>User Management</button>
                    <button className={activeTab === 'content' ? 'active' : ''} onClick={() => setActiveTab('content')}>Content Management</button>
                </div>
            </div>

            {activeTab === 'users' && (
                 <div className="admin-container">
                    <div className="admin-user-list card">
                        <h4>All Users ({data.users.length})</h4>
                        <ul>
                            {data.users.map(u => (
                                <li key={u.rollNo} className={selectedRollNo === u.rollNo ? 'active' : ''} onClick={() => setSelectedRollNo(u.rollNo)}>
                                    {u.name} ({u.rollNo})
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="admin-user-details card">
                        {selectedUser ? (
                            <>
                                <h3>Details for {selectedUser.name}</h3>
                                <pre>{JSON.stringify(selectedUser, null, 2)}</pre>
                            </>
                        ) : (
                            <p>Select a user to view their details.</p>
                        )}
                    </div>
                </div>
            )}
            
            {activeTab === 'content' && (
                <ContentManagementPanel 
                    content={data.content} 
                    onUpdate={handleContentUpdate} 
                />
            )}
        </div>
    );
};


const FeedbackModal = ({ feedback, testType, onClose }) => {
    if (!feedback) return null;

    if (feedback.error) {
        return (
            <div className="modal-overlay">
                <div className="modal-content feedback-modal">
                    <div className="modal-header">
                        <h2>Feedback Error</h2>
                        <button onClick={onClose} className="close-button">&times;</button>
                    </div>
                    <div className="login-error">{feedback.error}</div>
                    <button onClick={onClose} className="btn btn-primary" style={{marginTop: '1rem', alignSelf: 'center'}}>Close</button>
                </div>
            </div>
        );
    }

    // For OIR test
    if (testType.startsWith('OIR')) {
        return (
             <div className="modal-overlay">
                <div className="modal-content feedback-modal">
                    <div className="modal-header">
                        <h2>{testType} AI Feedback</h2>
                    </div>
                    <h4>Overall Summary</h4>
                    <p>{feedback.overall_summary}</p>

                    <h4>Score</h4>
                    <p>{feedback.score_percentage?.toFixed(2)}%</p>

                    <h4>Topics You Struggled With</h4>
                    <ul>{feedback.struggled_topics?.map((topic, i) => <li key={i}>{topic}</li>)}</ul>

                    <h4>Suggested Improvement Areas</h4>
                    <ul>{feedback.improvement_topics?.map((topic, i) => <li key={i}>{topic}</li>)}</ul>
                </div>
            </div>
        )
    }

    return (
        <div className="modal-overlay">
            <div className="modal-content feedback-modal">
                <div className="modal-header">
                    <h2>{testType} AI Feedback</h2>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                
                <h4>Overall Summary</h4>
                <p>{feedback.overall_summary}</p>
                
                {feedback.confidence_level && (
                    <>
                        <h4>Confidence Level</h4>
                        <p>{feedback.confidence_level}</p>
                    </>
                )}

                {feedback.power_of_expression && (
                    <>
                        <h4>Power of Expression</h4>
                        <p>{feedback.power_of_expression}</p>
                    </>
                )}
                
                <h4>OLQs Demonstrated</h4>
                {feedback.olqs_demonstrated && feedback.olqs_demonstrated.length > 0 ? (
                    <ul>
                        {feedback.olqs_demonstrated.map((olq, i) => <li key={i}>{olq}</li>)}
                    </ul>
                ) : <p>None specifically identified in this test.</p>}

                <h4>Strengths</h4>
                 {feedback.strengths && feedback.strengths.length > 0 ? (
                    <ul>
                        {feedback.strengths.map((s, i) => <li key={i}><strong>({s.example_olq})</strong> {s.point}</li>)}
                    </ul>
                ) : <p>No specific strengths highlighted.</p>}

                <h4>Areas for Improvement</h4>
                {feedback.weaknesses && feedback.weaknesses.length > 0 ? (
                    <ul>
                        {feedback.weaknesses.map((w, i) => <li key={i}><strong>({w.example_olq})</strong> {w.point}</li>)}
                    </ul>
                ): <p>No specific weaknesses highlighted.</p>}

                {feedback.actionable_advice && (
                    <>
                        <h4>Actionable Advice</h4>
                        {typeof feedback.actionable_advice === 'string' ? <p>{feedback.actionable_advice}</p> : (
                            <>
                                {feedback.actionable_advice.how_to_improve && (
                                    <>
                                        <h5>How to Improve:</h5>
                                        <ul>{feedback.actionable_advice.how_to_improve.map((adv, i) => <li key={i}>{adv}</li>)}</ul>
                                    </>
                                )}
                                {feedback.actionable_advice.what_to_practice && (
                                    <>
                                        <h5>What to Practice:</h5>
                                        <ul>{feedback.actionable_advice.what_to_practice.map((adv, i) => <li key={i}>{adv}</li>)}</ul>
                                    </>
                                )}
                                {feedback.actionable_advice.what_to_avoid && (
                                     <>
                                        <h5>What to Avoid:</h5>
                                        <ul>{feedback.actionable_advice.what_to_avoid.map((adv, i) => <li key={i}>{adv}</li>)}</ul>
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}

                <button onClick={onClose} className="btn btn-primary" style={{marginTop: '1.5rem', alignSelf: 'center'}}>Close</button>
            </div>
        </div>
    );
};

// --- NEW AI INTERVIEW SIMULATOR ---
const AIInterviewSimulator = ({ user, updateUser, unlockBadge, setPage }) => {
    const [status, setStatus] = useState('idle'); // idle, running, assessing, finished
    const [transcript, setTranscript] = useState<{speaker: string; text: string}[]>([]);
    const [assessment, setAssessment] = useState(null);
    const [error, setError] = useState('');
    
    const sessionRef = useRef(null);
    const inputAudioContextRef = useRef(null);
    const outputAudioContextRef = useRef(null);
    const scriptProcessorRef = useRef(null);
    const mediaStreamSourceRef = useRef(null);
    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
    
    // Refs for transcription handling
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    const isPIQEmpty = !user.piq || Object.keys(user.piq).length === 0;

    const cleanup = useCallback(() => {
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
         if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    }, []);

    useEffect(() => {
        // Cleanup on component unmount
        return () => cleanup();
    }, [cleanup]);

    const startInterview = async () => {
        if (isPIQEmpty) {
            setError("Please fill out your PIQ form before starting the interview.");
            return;
        }
        setError('');
        setStatus('starting');
        setTranscript([]);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

            const systemInstruction = `You are a strict, fair, and experienced Interviewing Officer (IO) for the Indian Armed Forces Services Selection Board (SSB). Your goal is to conduct a realistic personal interview to assess the candidate's Officer Like Qualities (OLQs). Here is the candidate's Personal Information Questionnaire (PIQ):
---
${JSON.stringify(user.piq, null, 2)}
---
Your task:
1.  **Ask one question at a time.** Wait for the candidate to finish speaking before you ask the next question.
2.  **Be dynamic and conversational.** Do not ask questions in a robotic, fixed order. Your follow-up questions should be based on the candidate's previous answers to probe deeper.
3.  **Cover a wide range of topics**: education, family, hobbies, interests, responsibilities, current affairs, decision-making, and self-perception.
4.  **Maintain a professional tone.** Your tone should be formal. Do not provide feedback or encouragement.
5.  **Vary your questioning style.** Use a mix of direct questions, situational questions, and follow-ups. Ensure each interview session feels unique and does not repeat the same question patterns.
6.  **Start the interview** by saying: "Alright ${user.name}, let's begin. Tell me something about yourself, your background, and your education."
7.  After about 10-15 questions covering various aspects, **conclude the interview** by saying: "That will be all. Thank you."`;

            const sessionPromise = getAI().live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                callbacks: {
                    onopen: () => {
                         setStatus('running');
                         mediaStreamSourceRef.current = inputAudioContextRef.current.createMediaStreamSource(stream);
                         scriptProcessorRef.current = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
                         
                         scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
// Fix: Corrected audio processing logic to prevent clipping and updated the comment to be more accurate.
// Replaced the direct multiplication with a safer method that clamps the values to the valid 16-bit integer range.
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                            }
                            const pcmBlob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            sessionPromise.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current.destination);
                    },
                    onmessage: async (message) => {
                        if (message.serverContent?.outputTranscription?.text) {
                            currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                        }
                        if (message.serverContent?.inputTranscription?.text) {
                            currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        }
                        
                        if (message.serverContent?.turnComplete) {
                            const userInput = currentInputTranscriptionRef.current.trim();
                            const aiOutput = currentOutputTranscriptionRef.current.trim();
                            
// Fix: Added explicit checks to ensure that only non-empty transcript entries are added to the state.
// This prevents malformed {} objects from being pushed to the transcript array, resolving the TypeScript error.
                            setTranscript(prev => {
                                const newEntries: { speaker: string, text: string }[] = [];
                                if (userInput) {
                                    newEntries.push({ speaker: 'user', text: userInput });
                                }
                                if (aiOutput) {
                                    newEntries.push({ speaker: 'ai', text: aiOutput });
                                }
                                return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
                            });
                            
                            currentInputTranscriptionRef.current = '';
                            currentOutputTranscriptionRef.current = '';
                        }

                        // Handle audio playback
                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                        if (base64Audio) {
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, 24000, 1);
                            const source = outputAudioContextRef.current.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputAudioContextRef.current.destination);
                            source.addEventListener('ended', () => sourcesRef.current.delete(source));
                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            sourcesRef.current.add(source);
                        }
                    },
                    onerror: (e) => {
                        console.error("Live session error:", e);
                        setError("A connection error occurred. Please try again.");
                        setStatus('idle');
                        cleanup();
                    },
                    onclose: (e) => {
                         if(status !== 'assessing' && status !== 'finished') {
                            setStatus('idle');
                        }
                        cleanup();
                    },
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
                    systemInstruction: systemInstruction,
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                },
            });
            sessionRef.current = await sessionPromise;

        } catch (err) {
            console.error("Error starting interview:", err);
            setError("Could not access microphone. Please check permissions and try again.");
            setStatus('idle');
        }
    };

    const endInterview = async () => {
        setStatus('assessing');
        cleanup();
        
        // Ensure final transcript parts are added
        const finalUserInput = currentInputTranscriptionRef.current.trim();
        const finalAiOutput = currentOutputTranscriptionRef.current.trim();
        let finalTranscript = [...transcript];
        if (finalUserInput) finalTranscript.push({ speaker: 'user', text: finalUserInput });
        if (finalAiOutput) finalTranscript.push({ speaker: 'ai', text: finalAiOutput });
        setTranscript(finalTranscript);

        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';

        const feedbackResult = await getAIAssessment('AIInterview', { piq: user.piq, transcript: finalTranscript });
        setAssessment(feedbackResult);
        
        const testResult = {
            type: 'AIInterview',
            date: new Date().toISOString(),
            transcript: finalTranscript,
            feedback: feedbackResult,
        };
        const updatedUser = {
            ...user,
            tests: {
                ...user.tests,
                ai_interview: [...(user.tests?.ai_interview || []), testResult]
            }
        };
        updateUser(updatedUser);
        
        unlockBadge('first_step');
        unlockBadge('interviewer_ace');
        setStatus('finished');
    };
    
    const renderStatusIndicator = () => {
        switch(status) {
            case 'idle': return <span className="interview-status-text idle">Ready to Start</span>;
            case 'starting': return <span className="interview-status-text starting">Initializing...</span>;
            case 'running': return <span className="interview-status-text running">Interview in Progress...</span>;
            case 'assessing': return <span className="interview-status-text assessing">Generating Assessment...</span>;
            case 'finished': return <span className="interview-status-text finished">Assessment Complete</span>;
            default: return '';
        }
    };
    
    if (isPIQEmpty) {
         return (
             <div>
                <h1 className="page-header">AI Interview Simulator</h1>
                <div className="card text-center">
                    <h2>PIQ Form Required</h2>
                    <p>The AI Interviewer uses your Personal Information Questionnaire (PIQ) to ask relevant questions. Please complete your PIQ form before starting the interview.</p>
                    <button className="btn btn-primary" onClick={() => setPage('piq')}>Go to PIQ Form</button>
                </div>
            </div>
         );
    }

    if (status === 'assessing' || status === 'finished') {
        return (
             <div>
                <h1 className="page-header">Interview Complete</h1>
                <div className="card text-center">
                    <h2>Thank you for completing the Interview.</h2>
                    {status === 'assessing' && <LoadingSpinner text="Analyzing your performance..." />}
                    {status === 'finished' && assessment && (
                        <FeedbackModal feedback={assessment} testType="AI Interview" onClose={() => setPage('dashboard')} />
                    )}
                </div>
            </div>
        );
    }
    
    return (
        <div>
            <h1 className="page-header">AI Interview Simulator</h1>
            <div className="card">
                <div className="interview-container">
                    <div className="interview-transcript">
                         {transcript.length === 0 && status !== 'running' && (
                             <div className="transcript-placeholder">
                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z" /></svg>
                                 <p>Your interview transcript will appear here.</p>
                             </div>
                         )}
                        {transcript.map((entry, index) => (
                            <div key={index} className={`chat-bubble ${entry.speaker}`}>
                                {entry.text}
                            </div>
                        ))}
                         {(status === 'running' || status === 'starting') && (
                            <div className="chat-bubble ai typing-indicator">
                                <span></span><span></span><span></span>
                            </div>
                         )}
                    </div>
                    <div className="interview-controls">
                        {renderStatusIndicator()}
                        {status === 'idle' && (
                            <button className="btn btn-primary" onClick={startInterview}>Start Interview</button>
                        )}
                        {status === 'running' && (
                             <button className="btn btn-danger" onClick={endInterview}>End Interview</button>
                        )}
                    </div>
                    {error && <p className="login-error text-center">{error}</p>}
                </div>
            </div>
        </div>
    );
};


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);