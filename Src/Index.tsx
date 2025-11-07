
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
const ai = new GoogleGenAI({ apiKey: API_KEY });

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
        const response = await ai.models.generateContent({
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
            w
