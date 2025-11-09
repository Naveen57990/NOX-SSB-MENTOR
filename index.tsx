

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

// Fix: Define an interface for chat messages to resolve typing errors.
interface ChatMessage {
    sender: string;
    text: string;
    timestamp: string;
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
        lecturerette_topics_geopolitics: LECTURERETTE_TOPICS_GEOPOLITICS,
        lecturerette_topics_india: LECTURERETTE_TOPICS_INDIA,
        lecturerette_topics_general: LECTURERETTE_TOPICS_GENERAL,
        lecturerette_topics_personal: LECTURERETTE_TOPICS_PERSONAL,
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
const WAT_WORDS_DEFAULT = ['Duty', 'Courage', 'Team', 'Defeat', 'Lead', 'Responsibility', 'Friend', 'Failure', 'Order', 'Discipline', 'Work', 'Army', 'Risk', 'Success', 'Challenge', 'Honour', 'Sacrifice', 'Tension', 'Brave', 'Win', 'Attack', 'Weapon', 'Strategy', 'Calm', 'Confidence', 'Obstacle', 'Cooperate', 'Help', 'Officer', 'System', 'Possible', 'Worry', 'Afraid', 'Nervous', 'Difficult', 'Obey', 'Command', 'Follow', 'Unity', 'Effort', 'Aim', 'Goal', 'Serious', 'Mature', 'Peace', 'War', 'Nation', 'Sports', 'Love', 'Death', 'Society', 'Future', 'Choice', 'Pressure', 'Mistake', 'Greed', 'Time', 'Money', 'Power', 'Health'];
const SRT_SCENARIOS_DEFAULT = [
    "You are on your way to an important exam and you see an accident. You are the first person to arrive. What would you do?",
    "During a group task, your team members are not cooperating. What would you do?",
    "You are the captain of a sports team which is about to lose a crucial match. How will you motivate your team?",
    "While traveling by train, you notice a fellow passenger has left their bag behind. What steps will you take?",
    "You have been assigned a difficult task with a very tight deadline. What is your course of action?",
    "You find out your close friend is involved in illegal activities. What would you do?",
    "You are in a crowded place and you see someone pickpocketing another person. What would you do?",
    "Your superior gives you an order that you believe is morally wrong. How do you handle this?",
    "You are lost in a forest with limited supplies. What is your plan for survival?",
    "In a debate, your opponent makes a personal attack instead of arguing logically. How do you respond?",
    "You have two important commitments at the same time. How do you decide which one to attend?",
    "You are offered a bribe to overlook a mistake made by a contractor. What would you do?",
    "You see a building on fire before the fire brigade has arrived. What is your immediate action?",
    "You are in charge of a project and a key member falls sick just before the deadline. How do you manage?",
    "You are being ragged by your seniors in college. How do you react?",
    "You are on a trek and one of your group members gets injured and cannot walk. What do you do?",
    "You witness a road rage incident where one person is getting violent. How do you intervene?",
    "You are given the responsibility to organize a college fest with a very small budget. What is your approach?",
    "Your friend is feeling depressed and showing suicidal tendencies. What steps will you take?",
    "You are in a remote area with no network and your vehicle breaks down. What do you do?",
    "You accidentally damage a valuable item belonging to your friend. How do you handle it?",
    "During an outdoor camp, you realize a snake has entered your tent. What would you do?",
    "You are the only person who knows the password to a critical system, and you are going on leave. What precautions do you take?",
    "You get selected for a job, but you realize the company's values do not align with yours. What do you do?",
    "While on duty, you catch your colleague breaking an important rule. What is your course of action?",
    "You are on a boat that capsizes in the middle of a lake. You are a good swimmer. What do you do?",
    "You are asked to lead a team where most members are more experienced than you. How do you build rapport?",
    "You receive a large sum of money credited to your bank account by mistake. What would you do?",
    "A junior colleague is struggling with their work. How do you help them without doing the work for them?",
    "You are in a foreign country and lose your passport and wallet. What are your immediate steps?",
    "You are part of a rescue team during a natural disaster. You have to choose between saving a child or an elderly person. What do you do?",
    "You are driving and a person suddenly comes in front of your car. You brake hard and avoid them, but they start abusing you. How do you react?",
    "You are given confidential information and are being pressured to reveal it. What do you do?",
    "You see your friend cheating in an exam. What would you do?",
    "You are leading a group discussion, and two members get into a heated argument. How do you control the situation?",
    "Your parents want you to pursue a different career path than the one you are passionate about. How do you convince them?",
    "You are stuck in an elevator with a few other people and the power goes off. What would you do?",
    "You are in a situation where you have to lie to save someone from getting into serious trouble. What do you do?",
    "You are chosen to represent your country at an international event. How do you prepare?",
    "You find a rumor spreading about you in your workplace. How do you address it?",
    "You are managing a team and you notice a decline in morale. What steps do you take?",
    "You are a soldier on patrol and you get separated from your unit. What is your plan?",
    "You have to give a presentation to a large audience and you have a fear of public speaking. How do you cope?",
    "You are on a tight budget and an unexpected, essential expense comes up. How do you manage your finances?",
    "You are being followed by a suspicious person at night. What would you do?",
    "You are asked to work on a weekend to complete an urgent task. How do you react?",
    "You see someone littering in a public place. What would you do?",
    "You are in a leadership position and have to make an unpopular decision that is for the greater good. How do you communicate it to your team?",
    "You have failed in multiple attempts to clear an exam. How do you keep yourself motivated?",
    "You are negotiating a deal and the other party is being very aggressive and unreasonable. How do you proceed?",
    "You are having a meal at a restaurant and you are served substandard food. How do you complain?",
    "You are in a group where everyone else has a different opinion than you on an important matter. How do you put your point across?",
    "You have to cross a river with your team, but the bridge is broken. What are the possible solutions you would consider?",
    "You are playing a game and you see the opponent team is cheating. What do you do?",
    "You are given the task of training a new batch of recruits. What will be your approach?",
    "You are attending a party and you see your friend being forced to drink alcohol. What would you do?",
    "You are on a public transport and it is overcrowded. You see an elderly person standing. What would you do?",
    "You are in a position of authority and one of your subordinates is underperforming. How do you handle it?",
    "You are faced with a sudden and unexpected change in your plans. How do you adapt?"
];
const LECTURERETTE_TOPICS_GEOPOLITICS = ['Indo-China Relations', 'Russia-Ukraine Conflict', 'The Quad Alliance', 'India\'s Role in Afghanistan', 'G20 Presidency of India', 'Climate Change and Global Politics'];
const LECTURERETTE_TOPICS_INDIA = ['Make in India Initiative', 'Agnipath Scheme', 'Digital India', 'Challenges to Internal Security of India', 'India\'s Space Program', 'Uniform Civil Code'];
const LECTURERETTE_TOPICS_GENERAL = ['Artificial Intelligence: A Boon or a Bane?', 'The Importance of Discipline in Life', 'Social Media\'s Impact on Youth', 'Electric Vehicles: The Future of Transport?', 'Is Democracy the Best Form of Government?'];
const LECTURERETTE_TOPICS_PERSONAL = ['My Favourite Hobby', 'My Role Model', 'A Memorable Journey I Have Had', 'The Book That Changed My Life', 'If I Were a Superhero', 'The Importance of Friendship'];
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
      question: `Sample Verbal Question ${i + 6}. This is a placeholder. What is 2+${i}?`,
      options: [`${i+1}`, `${i+3}`, `${i+2}`, `${i+4}`],
      answer: `${i+2}`
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

// --- Utility Functions ---
const shuffleArray = (array) => [...array].sort(() => Math.random() - 0.5);

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

const getNewsUpdate = async () => {
    try {
        const response = await getAI().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Provide a concise but comprehensive summary of the latest news and key developments covering Geopolitics, Indian National Affairs, Defence, and International Relations. Structure the response with clear Markdown headings for each section and use bullet points for key information.`,
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
const LoadingSpinner = ({ text }: { text?: string }) => (
    // FIX: Add `as any` to the props object to bypass a TypeScript error where `className` is not recognized.
    React.createElement("div", { className: "loading-container" } as any,
        React.createElement("div", { className: "loading-spinner" }),
        text && React.createElement("p", null, text)
    )
);

const Modal = ({ children, onClose, title }: React.PropsWithChildren<{ onClose: () => void, title: string }>) => (
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
    
    const statusTextMap = { requesting: "Requesting mic...", connecting: "Connecting...", running: "Interview in progress..." };

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
                        React.createElement("span", { className: `interview-status-text ${status}`}, statusTextMap[status]),
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
    const [uploading, setUploading] = useState(false);

    const handleContentUpdate = (category, newItems) => {
        const newData = { ...data, content: { ...data.content, [category]: newItems } };
        saveData(newData);
    };

    const handleFileUpload = async (file, path, category) => {
        if (!file) return;
        setUploading(true);
        try {
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`${path}/${file.name}_${Date.now()}`);
            await fileRef.put(file);
            const url = await fileRef.getDownloadURL();

            if (category === 'gpe_scenarios') {
                 const updatedScenarios = [{ ...data.content.gpe_scenarios[0], mapImage: url }];
                 handleContentUpdate(category, updatedScenarios);
            } else {
                handleContentUpdate(category, [...data.content[category], url]);
            }
        } catch (e) {
            console.error("Upload failed", e);
            alert("File upload failed.");
        }
        setUploading(false);
    };

    const AddNonVerbalQuestionForm = () => {
        const [formData, setFormData] = useState({ category: 'Figure Series', question: '', imageUrl: null, options: [null, null, null, null], answer: 0 });
        const [isSubmitting, setIsSubmitting] = useState(false);

        const uploadFileAndGetUrl = async (file, path) => {
            if (!file) return null;
            const storageRef = firebase.storage().ref();
            const fileRef = storageRef.child(`${path}/${file.name}_${Date.now()}`);
            await fileRef.put(file);
            return await fileRef.getDownloadURL();
        };

        const handleSubmit = async (e) => {
            e.preventDefault();
            setIsSubmitting(true);
            try {
                if (!formData.imageUrl || formData.options.some(opt => !opt)) {
                    alert("Please provide all 5 images.");
                    setIsSubmitting(false);
                    return;
                }

                const mainImageUrl = await uploadFileAndGetUrl(formData.imageUrl, 'oir_non_verbal');
                const optionUrls = await Promise.all(formData.options.map(opt => uploadFileAndGetUrl(opt, 'oir_non_verbal')));

                const newQuestion = {
                    type: 'non-verbal',
                    category: formData.category,
                    question: formData.question,
                    imageUrl: mainImageUrl,
                    options: optionUrls,
                    answer: optionUrls[formData.answer]
                };

                const updatedQuestions = [...data.content.oir_non_verbal_questions, newQuestion];
                handleContentUpdate('oir_non_verbal_questions', updatedQuestions);
                alert("Question added successfully!");
                setFormData({ category: 'Figure Series', question: '', imageUrl: null, options: [null, null, null, null], answer: 0 });
            } catch (err) {
                console.error("Failed to add OIR question", err);
                alert("Failed to add question.");
            }
            setIsSubmitting(false);
        };

        const handleFileChange = (e, field, index = -1) => {
            const file = e.target.files[0];
            if (!file) return;
            if (field === 'imageUrl') {
                setFormData(prev => ({ ...prev, imageUrl: file }));
            } else if (field === 'options') {
                const newOptions = [...formData.options];
                newOptions[index] = file;
                setFormData(prev => ({ ...prev, options: newOptions }));
            }
        };

        return React.createElement("form", { onSubmit: handleSubmit, className: 'add-item-form-stacked' },
            React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Category"), React.createElement("select", { value: formData.category, onChange: e => setFormData(p => ({ ...p, category: e.target.value })) } as any, ['Figure Series', 'Figure Analogy', 'Odd One Out', 'Mirror Image'].map(c => React.createElement("option", { key: c, value: c } as any, c)))),
            React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Question Text"), React.createElement("input", { type: 'text', value: formData.question, onChange: e => setFormData(p => ({ ...p, question: e.target.value })), required: true } as any)),
            React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Problem Figure Image"), React.createElement("input", { type: 'file', accept: "image/*", onChange: e => handleFileChange(e, 'imageUrl'), required: true } as any)),
            React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Option Images (4 required)")),
            React.createElement("div", { className: 'piq-form-grid' },
                [0, 1, 2, 3].map(i => React.createElement("div", { key: i }, React.createElement("input", { type: 'file', accept: "image/*", onChange: e => handleFileChange(e, 'options', i), required: true } as any)))
            ),
            React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Correct Answer"),
                React.createElement("div", { className: 'oir-options', style: { gridTemplateColumns: '1fr 1fr 1fr 1fr' } },
                    [0, 1, 2, 3].map(i => React.createElement("label", { key: i, className: `oir-option ${formData.answer === i ? 'selected' : ''}` },
                        React.createElement("input", { type: "radio", name: "correctAnswer", checked: formData.answer === i, onChange: () => setFormData(p => ({ ...p, answer: i })) } as any),
                        `Option ${i + 1}`
                    ))
                )
            ),
            React.createElement("button", { type: 'submit', className: 'btn btn-primary', disabled: isSubmitting }, isSubmitting ? "Submitting..." : "Add Question")
        );
    };

    const renderTextContentManager = (category, items) => {
        const [newItem, setNewItem] = useState('');
        const handleAdd = () => {
            if (newItem.trim()) {
                handleContentUpdate(category, [...items, newItem.trim()]);
                setNewItem('');
            }
        };
        const handleRemove = (index) => handleContentUpdate(category, items.filter((_, i) => i !== index));
        return React.createElement("div", null,
            React.createElement("ul", { className: 'content-list' }, items.map((item, i) => React.createElement("li", { key: i, className: 'content-list-item' }, React.createElement("span", { className: 'item-text' }, item), React.createElement("button", { className: 'btn-danger btn', onClick: () => handleRemove(i) }, "Remove")))),
            React.createElement("div", { className: 'add-item-form' }, React.createElement("input", { type: 'text', value: newItem, onChange: e => setNewItem(e.target.value), placeholder: `New ${category.replace(/_/g, ' ')}...` } as any), React.createElement("button", { onClick: handleAdd }, "Add"))
        );
    };

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Admin Panel"),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "community-tabs" },
                React.createElement("button", { className: currentTab === 'users' ? 'active' : '', onClick: () => setCurrentTab('users') }, "Users"),
                React.createElement("button", { className: currentTab === 'content' ? 'active' : '', onClick: () => setCurrentTab('content') }, "Content Management")
            ),
            uploading && React.createElement(LoadingSpinner, { text: "Uploading file..." }),
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
                React.createElement("div", { className: 'piq-form-grid', style: { gridTemplateColumns: '1fr 1fr' } },
                    React.createElement("div", null, React.createElement("h4", null, "WAT Words"), renderTextContentManager('wat_words', data.content.wat_words)),
                    React.createElement("div", null, React.createElement("h4", null, "SRT Scenarios"), renderTextContentManager('srt_scenarios', data.content.srt_scenarios))
                ),
                React.createElement("hr", { style: { border: '1px solid var(--primary-light)', margin: '1.5rem 0' } }),
                React.createElement("h3", null, "Manage File Content"),
                React.createElement("div", { className: 'piq-form-grid', style: { gridTemplateColumns: '1fr 1fr' } },
                    React.createElement("div", null,
                        React.createElement("h4", null, "TAT Images"),
                        React.createElement("div", { className: 'content-list' }, data.content.tat_images.map((img, i) => React.createElement("li", { key: i, className: 'content-list-item' }, React.createElement("img", { src: img, className: 'image-preview' }), React.createElement("span", { className: 'item-text' }, img.split('/').pop().split('?')[0]), React.createElement("button", { className: 'btn-danger btn', onClick: () => handleContentUpdate('tat_images', data.content.tat_images.filter(url => url !== img)) }, "Del")))),
                        React.createElement("input", { type: 'file', accept: "image/*", onChange: e => handleFileUpload(e.target.files[0], 'tat_images', 'tat_images') } as any)
                    ),
                    React.createElement("div", null,
                        React.createElement("h4", null, "GPE Map"),
                        React.createElement("img", { src: data.content.gpe_scenarios[0].mapImage, className: 'gpe-map', style: { marginBottom: '1rem' } }),
                        React.createElement("input", { type: 'file', accept: "image/*", onChange: e => handleFileUpload(e.target.files[0], 'gpe_maps', 'gpe_scenarios') } as any)
                    )
                ),
                React.createElement("hr", { style: { border: '1px solid var(--primary-light)', margin: '1.5rem 0' } }),
                React.createElement("h3", null, "Add OIR Non-Verbal Question"),
                React.createElement(AddNonVerbalQuestionForm, null)
            )
        )
    );
};


const Dashboard = ({ user, setPage }) => {
    const testTypes = ['tat', 'wat', 'srt', 'sdt', 'oir', 'lecturerette', 'gpe', 'ai_interview'];
    const completedTests = testTypes.filter(type => user.tests && user.tests[type]?.length > 0);
    const overallProgress = (completedTests.length / testTypes.length) * 100;

    const recentActivity = useMemo(() => {
        if (!user.tests) return [];
        const allTests = Object.entries(user.tests).flatMap(([testType, tests]) =>
            (tests as any[]).map(test => ({...test, testType}))
        );
        allTests.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return allTests.slice(0, 5);
    }, [user.tests]);
    
    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Welcome, ", user.name, "!"),
        React.createElement("div", { className: "dashboard-grid", style: { gridTemplateColumns: '2fr 1fr', gap: 'var(--spacing-lg)'} },
           React.createElement("div", { style: { display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)'}},
             React.createElement("div", { className: "card" },
                React.createElement("h2", null, "Overall Progress"),
                React.createElement("div", { className: "progress-bar-container" },
                    React.createElement("div", { className: "progress-bar-fill", style: { width: `${overallProgress}%` } })
                ),
                React.createElement("p", { className: "progress-label" }, `${completedTests.length} of ${testTypes.length} test types attempted`)
            ),
             React.createElement("div", { className: "card" },
                React.createElement("h2", null, "Recent Activity"),
                 recentActivity.length > 0 ? (
                    React.createElement("ul", { className: 'history-list' },
                        recentActivity.map((activity, index) => (
                            React.createElement("li", { key: index, className: 'history-item' },
                                React.createElement("p", null, 
                                    React.createElement("strong", null, activity.testType.toUpperCase()), " test completed"
                                ),
                                React.createElement("span", { className: 'date' }, new Date(activity.date).toLocaleDateString())
                            )
                        ))
                    )
                 ) : (
                    React.createElement("p", {className: 'no-history' }, "Your recent test attempts will appear here.")
                 )
            )
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
            )
        )
    );
};

const PsychTestRunner = ({ user, updateUser, unlockBadge, setPage, testType, items, stimulus, itemDuration }) => {
    const [status, setStatus] = useState('idle'); // idle, running, finished
    const [activeItems, setActiveItems] = useState([]);
    const [currentItem, setCurrentItem] = useState(0);
    const [timeLeft, setTimeLeft] = useState(itemDuration);
    const [phase, setPhase] = useState('observing'); // For TAT: 'observing', 'writing'
    const [responses, setResponses] = useState({});
    const [inputType, setInputType] = useState('type'); // 'type' or 'upload'
    const [uploadedFile, setUploadedFile] = useState(null);
    const [showAssessment, setShowAssessment] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const startTest = () => {
        setActiveItems(shuffleArray(items));
        setStatus('running');
        setCurrentItem(0);
        setResponses({});
        if (testType === 'tat') {
            setPhase('observing');
            setTimeLeft(30); // 30s observation
        } else {
            setTimeLeft(itemDuration);
        }
    };

    useEffect(() => {
        if (status !== 'running') return;
        
        if (timeLeft <= 0) {
            if (testType === 'tat' && phase === 'observing') {
                setPhase('writing');
                setTimeLeft(4 * 60); // 4 minutes writing
                return;
            }

            if (currentItem < activeItems.length - 1) {
                setCurrentItem(prev => prev + 1);
                if (testType === 'tat') {
                    setPhase('observing');
                    setTimeLeft(30);
                } else {
                    setTimeLeft(itemDuration);
                }
            } else {
                setStatus('finished');
            }
        }
        const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [status, timeLeft, currentItem, activeItems.length, itemDuration, testType, phase]);

    const handleResponseChange = (e) => {
        setResponses(prev => ({...prev, [activeItems[currentItem]]: e.target.value }));
    };

    const handleSubmit = async () => {
        setIsLoading(true);
        const testResult: any = {
            date: new Date().toISOString(),
            responses: inputType === 'type' ? responses : { file: uploadedFile.name },
            inputType
        };
        
        let assessment;
        if (inputType === 'upload') {
            assessment = await getWrittenAssessment(testType.toUpperCase(), activeItems, { file: uploadedFile });
        } else {
            assessment = await getWrittenAssessment(testType.toUpperCase(), activeItems, { typed: responses });
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
            React.createElement("p", { className: 'test-instructions' }, testType === 'tat'
                ? `You will be shown ${items.length} pictures. For each picture, you'll have 30 seconds to observe it, after which it will disappear and you'll have 4 minutes to write a story.`
                : `You will be shown ${items.length} ${stimulus.type}. You will have ${itemDuration} seconds for each.`
            ),
            React.createElement("h3", null, "Choose your input method:"),
            React.createElement("div", { className: 'input-method-choice' },
                React.createElement("button", { className: `btn ${inputType === 'type' ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setInputType('type') }, "Type Answers"),
                React.createElement("button", { className: `btn ${inputType === 'upload' ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setInputType('upload') }, "Upload Handwritten Sheet")
            ),
            React.createElement("button", { className: "btn btn-primary", style: { marginTop: '2rem' }, onClick: startTest }, "Start Test")
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

    const currentStimulus = activeItems[currentItem];
    const isObservingTAT = testType === 'tat' && phase === 'observing';

    return React.createElement("div", { className: "test-runner-container" },
        React.createElement("div", { className: "timer" }, timeLeft),
        React.createElement("p", { style: { fontFamily: 'var(--font-display)', color: 'var(--neutral-light)'}}, isObservingTAT ? "OBSERVE" : (testType === 'tat' ? "WRITE" : "")),
        React.createElement("div", { className: "test-progress-bar" }, React.createElement("div", { className: "test-progress-bar-inner", style: { width: `${((currentItem + 1) / activeItems.length) * 100}%` } })),
        React.createElement("div", { className: "test-stimulus" },
            stimulus.type === 'image' && (testType !== 'tat' || phase === 'observing') && React.createElement("img", { id: 'tat-image', src: currentStimulus, alt: `TAT Image ${currentItem + 1}` }),
            stimulus.type === 'image' && testType === 'tat' && phase === 'writing' && React.createElement("div", { className: "transcript-placeholder" }, React.createElement("h2", null, "Start writing your story.")),
            stimulus.type === 'word' && React.createElement("h2", { id: 'wat-word' }, currentStimulus),
        ),
        inputType === 'type' && React.createElement("textarea", {
            placeholder: stimulus.placeholder,
            value: responses[currentStimulus] || '',
            onChange: handleResponseChange,
            disabled: isObservingTAT
        } as any)
    );
};

const TATRunner = (props) => React.createElement(PsychTestRunner, { ...props, testType: 'tat', items: props.images, stimulus: { type: 'image', placeholder: "Write your story here..." }, itemDuration: 30 }); // itemDuration is now observation time
const WATRunner = (props) => React.createElement(PsychTestRunner, { ...props, testType: 'wat', items: props.words, stimulus: { type: 'word', placeholder: "Write your sentence here..." }, itemDuration: 15 });

const SRTRunner = ({ user, updateUser, unlockBadge, setPage, scenarios }) => {
    const [status, setStatus] = useState('idle'); // idle, running, finished
    const [activeScenarios, setActiveScenarios] = useState([]);
    const [currentSituationIndex, setCurrentSituationIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes
    const [showAssessment, setShowAssessment] = useState(false);
    const [assessmentResult, setAssessmentResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (status !== 'running') return;
        if (timeLeft <= 0) {
            handleSubmit();
        }
        const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [status, timeLeft]);

    const startTest = () => {
        setActiveScenarios(shuffleArray(scenarios));
        setStatus('running');
    };

    const handleAnswerChange = (index, value) => {
        setAnswers(prev => ({ ...prev, [index]: value }));
    };

    const handleSubmit = async () => {
        setStatus('finished');
        setIsLoading(true);

        const responsesForAI = activeScenarios.map((scenario, index) => ({
            situation: scenario,
            response: answers[index] || "Not Answered"
        }));
        
        const typedResponses = Object.fromEntries(responsesForAI.map(r => [r.situation, r.response]));
        const assessment = await getWrittenAssessment('SRT', activeScenarios, { typed: typedResponses });
        setAssessmentResult(assessment);

        const testResult = {
            date: new Date().toISOString(),
            responses: answers,
            assessment: assessment
        };

        const updatedUser = {
            ...user,
            tests: {
                ...user.tests,
                srt: [...(user.tests?.srt || []), testResult]
            }
        };
        updateUser(updatedUser);
        unlockBadge('first_step');
        setIsLoading(false);
        setShowAssessment(true);
    };

    if (isLoading) return React.createElement(LoadingSpinner, { text: `Generating your SRT assessment...` });
    if (showAssessment) return React.createElement(WrittenAssessmentViewer, { assessment: assessmentResult, onClose: () => setPage('dashboard') });

    if (status === 'idle') {
        return React.createElement("div", null,
            React.createElement("h1", { className: "page-header" }, "Situation Reaction Test (SRT)"),
            React.createElement("div", { className: "card text-center" },
                React.createElement("p", { style:{marginBottom: '1.5rem'} }, `This is a full-length SRT. You will have 30 minutes to respond to ${scenarios.length} situations.`),
                React.createElement("button", { onClick: startTest, className: "btn btn-primary" }, "Start Test")
            )
        );
    }
    
    const currentSituation = activeScenarios[currentSituationIndex];
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return React.createElement("div", null,
        React.createElement("div", { className: "page-header", style:{alignItems: 'baseline'} },
            React.createElement("h1", null, `SRT`),
            React.createElement("div", { className: "timer" }, `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`)
        ),
         React.createElement("div", { className: "test-progress-bar" }, React.createElement("div", { className: "test-progress-bar-inner", style: { width: `${((currentSituationIndex + 1) / activeScenarios.length) * 100}%` } })),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "oir-question-container" },
                React.createElement("h3", null, `Situation ${currentSituationIndex + 1}:`),
                React.createElement("p", { className: 'srt-situation' }, currentSituation)
            ),
            React.createElement("textarea", {
                placeholder: "Write your reaction here...",
                value: answers[currentSituationIndex] || '',
                onChange: (e) => handleAnswerChange(currentSituationIndex, e.target.value),
                style: {minHeight: '150px'}
            } as any),
            React.createElement("div", { className: 'oir-controls' },
                React.createElement("button", { className: "btn btn-secondary", onClick: () => setCurrentSituationIndex(p => Math.max(0, p - 1)), disabled: currentSituationIndex === 0 }, "Previous"),
                currentSituationIndex < activeScenarios.length - 1
                    ? React.createElement("button", { className: "btn btn-primary", onClick: () => setCurrentSituationIndex(p => Math.min(activeScenarios.length - 1, p + 1)) }, "Next")
                    : React.createElement("button", { className: "btn btn-primary", onClick: handleSubmit }, "Finish Test")
            )
        )
    );
};

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
    const [status, setStatus] = useState('idle'); // idle, running, finished
    const [testType, setTestType] = useState(null); // 'verbal' or 'non-verbal'
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState({});
    const [timeLeft, setTimeLeft] = useState(30 * 60); // 30 minutes
    const [feedback, setFeedback] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (status !== 'running') return;
        if (timeLeft === 0) {
            handleSubmit();
        }
        const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
    }, [status, timeLeft]);

    const startTest = (type) => {
        setTestType(type);
        setQuestions(shuffleArray(type === 'verbal' ? verbalQuestions : nonVerbalQuestions));
        setStatus('running');
        setAnswers({});
        setCurrentQuestionIndex(0);
        setTimeLeft(30 * 60);
    };

    const handleAnswerSelect = (questionIndex, answer) => {
        setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
    };

    const handleSubmit = async () => {
        setStatus('finished');
        setIsLoading(true);
        const results = questions.map((q, i) => ({
            question: q,
            userAnswer: answers[i] || "Not Answered",
            isCorrect: (answers[i] || "") === q.answer
        }));

        const feedbackResult = await getAIAssessment('OIR', { testType, results });
        const correctCount = results.filter(r => r.isCorrect).length;
        if (feedbackResult && !feedbackResult.error) {
            feedbackResult.score_percentage = (correctCount / questions.length) * 100;
        }
        setFeedback(feedbackResult);

        const testResult = { date: new Date().toISOString(), testType, results, feedback: feedbackResult };
        const updatedUser = { ...user, tests: { ...user.tests, oir: [...(user.tests?.oir || []), testResult] } };
        updateUser(updatedUser);
        unlockBadge('first_step');
        if (feedbackResult.score_percentage === 100) {
            unlockBadge('perfect_oir');
        }
        setIsLoading(false);
    };

    if (isLoading) return React.createElement(LoadingSpinner, { text: `Analyzing your ${testType} test results...` });
    if (status === 'finished' && feedback) return React.createElement(FeedbackModal, { feedback, testType: `OIR ${testType}`, onClose: () => setPage('dashboard') });

    if (status === 'idle') {
        return React.createElement("div", null,
            React.createElement("h1", { className: "page-header" }, "Officer Intelligence Rating (OIR) Test"),
            React.createElement("div", { className: "card text-center" },
                React.createElement("p", { style:{marginBottom: '1.5rem'} }, "Choose which OIR test you would like to attempt. You will have 30 minutes to answer 50 questions."),
                React.createElement("div", { className: 'input-method-choice' },
                    React.createElement("button", { onClick: () => startTest('verbal'), className: "btn btn-primary" }, "Start Verbal OIR Test"),
                    React.createElement("button", { onClick: () => startTest('non-verbal'), className: "btn btn-primary" }, "Start Non-Verbal OIR Test")
                )
            )
        );
    }
    
    const currentQuestion = questions[currentQuestionIndex];
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return React.createElement("div", null,
        React.createElement("div", { className: "page-header", style:{alignItems: 'baseline'} },
            React.createElement("h1", null, `OIR Test: ${testType.charAt(0).toUpperCase() + testType.slice(1)}`),
            React.createElement("div", { className: "timer" }, `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`)
        ),
         React.createElement("div", { className: "test-progress-bar" }, React.createElement("div", { className: "test-progress-bar-inner", style: { width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` } })),
        React.createElement("div", { className: "card" },
            React.createElement("div", { className: "oir-question-container" },
                React.createElement("h3", null, `Question ${currentQuestionIndex + 1}: ${currentQuestion.question}`),
                currentQuestion.imageUrl && React.createElement("img", { src: currentQuestion.imageUrl, alt: "OIR Question Figure" })
            ),
            React.createElement("div", { className: `oir-options ${currentQuestion.type === 'non-verbal' ? 'image-options' : ''}` },
                currentQuestion.options.map((option, index) => (
                    React.createElement("label", { key: index, className: `oir-option ${answers[currentQuestionIndex] === option ? 'selected' : ''}` },
                        React.createElement("input", { type: "radio", name: `q${currentQuestionIndex}`, value: option, checked: answers[currentQuestionIndex] === option, onChange: () => handleAnswerSelect(currentQuestionIndex, option) } as any),
                        currentQuestion.type === 'verbal' ? option : React.createElement("img", { src: option, alt: `Option ${index + 1}` })
                    )
                ))
            ),
            React.createElement("div", { className: 'oir-controls' },
                React.createElement("button", { className: "btn btn-secondary", onClick: () => setCurrentQuestionIndex(p => Math.max(0, p - 1)), disabled: currentQuestionIndex === 0 }, "Previous"),
                currentQuestionIndex < questions.length - 1
                    ? React.createElement("button", { className: "btn btn-primary", onClick: () => setCurrentQuestionIndex(p => Math.min(questions.length - 1, p + 1)) }, "Next")
                    : React.createElement("button", { className: "btn btn-primary", onClick: handleSubmit }, "Finish Test")
            )
        )
    );
};

const Lecturerette = ({ user, updateUser, unlockBadge, setPage, topics }) => {
    const [status, setStatus] = useState('idle'); // idle, selecting, prep, speaking, assessing, complete
    const [randomTopics, setRandomTopics] = useState([]);
    const [selectedTopic, setSelectedTopic] = useState('');
    const [briefing, setBriefing] = useState('');
    const [transcript, setTranscript] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [timer, setTimer] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const recognitionRef = useRef(null);

    const beginSelection = () => {
        const { geopolitics, india, general, personal } = topics;
        const chosenTopics = shuffleArray([
            geopolitics[Math.floor(Math.random() * geopolitics.length)],
            india[Math.floor(Math.random() * india.length)],
            general[Math.floor(Math.random() * general.length)],
            personal[Math.floor(Math.random() * personal.length)],
        ]);
        setRandomTopics(chosenTopics);
        setStatus('selecting');
    };

    const startPrep = async (topic) => {
        setSelectedTopic(topic);
        setStatus('prep');
        setTimer(2.5 * 60); // 2.5 minutes
        setIsLoading(true);
        const briefingText = await getTopicBriefing(topic);
        setBriefing(briefingText);
        setIsLoading(false);
    };

    const startSpeech = () => {
        setStatus('speaking');
        setTimer(3 * 60); // 3 minutes
        handleListen();
    };
    
    const handleListen = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition not supported in this browser.");
            return;
        }
        
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.interimResults = true;
        recognitionRef.current.lang = 'en-US';

        recognitionRef.current.onstart = () => setIsListening(true);
        recognitionRef.current.onend = () => setIsListening(false);
        recognitionRef.current.onerror = (event) => console.error("Speech recognition error:", event.error);
        
        let finalTranscript = transcript;
        recognitionRef.current.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + '. ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setTranscript(finalTranscript + interimTranscript);
        };
        recognitionRef.current.start();
    };

    const finishSpeech = async () => {
        recognitionRef.current?.stop();
        setIsListening(false);
        setStatus('assessing');
        setIsLoading(true);
        const feedbackResult = await getAIAssessment('Lecturerette', { topic: selectedTopic, transcript });
        setFeedback(feedbackResult);
        const testResult = { date: new Date().toISOString(), topic: selectedTopic, transcript, feedback: feedbackResult };
        const updatedUser = { ...user, tests: { ...user.tests, lecturerette: [...(user.tests?.lecturerette || []), testResult] } };
        updateUser(updatedUser);
        unlockBadge('first_step');
        unlockBadge('orator_apprentice');
        setIsLoading(false);
        setStatus('complete');
    };

    useEffect(() => {
        if ((status === 'prep' || status === 'speaking') && timer > 0) {
            const t = setTimeout(() => setTimer(p => p - 1), 1000);
            return () => clearTimeout(t);
        } else if (timer <= 0 && status !== 'idle' && status !== 'selecting') {
            if (status === 'prep') startSpeech();
            if (status === 'speaking') finishSpeech();
        }
    }, [status, timer]);
    
    const formatTime = (seconds) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

    if (isLoading && status !== 'prep') return React.createElement(LoadingSpinner, { text: "Generating feedback..." });
    if (status === 'complete') return React.createElement(FeedbackModal, { feedback, testType: "Lecturerette", onClose: () => setPage('dashboard') });

    const renderContent = () => {
        switch(status) {
            case 'idle':
                return React.createElement("div", { className: 'text-center'},
                     React.createElement("p", { style: {marginBottom: '1.5rem'} }, "You will be given 4 random topics to choose from. You'll have 2.5 minutes to prepare and 3 minutes to speak."),
                     React.createElement("button", { className: 'btn btn-primary', onClick: beginSelection }, "Start")
                );
            case 'selecting':
                return React.createElement("div", null,
                    React.createElement("h2", { className: 'text-center' }, "Select a Topic"),
                    React.createElement("p", { className: 'text-center', style: {marginBottom: '1.5rem'} }, "Choose one of the following topics for your talk."),
                    React.createElement("div", { className: 'piq-form-grid' }, 
                        randomTopics.map(topic => React.createElement("button", { key: topic, className: 'btn btn-secondary', onClick: () => startPrep(topic) }, topic))
                    )
                );
            case 'prep':
                return React.createElement("div", null,
                    React.createElement("div", { className: 'timer' }, formatTime(timer)),
                    React.createElement("h2", { className: 'text-center' }, "Preparation Time"),
                    React.createElement("p", { className: 'text-center', style: {marginBottom: '1.5rem'} }, "Topic: ", React.createElement("strong", null, selectedTopic)),
                    isLoading ? React.createElement(LoadingSpinner, { text: 'Generating topic briefing...'}) : React.createElement("div", { className: 'briefer-content'}, briefing),
                    React.createElement("button", { onClick: startSpeech, className: 'btn btn-primary', style: {marginTop: '1.5rem'} }, "Start Speaking")
                );
            case 'speaking':
                 return React.createElement("div", null,
                    React.createElement("div", { className: 'timer' }, formatTime(timer)),
                    React.createElement("h2", { className: 'text-center' }, "Speaking: ", React.createElement("strong", null, selectedTopic)),
                    React.createElement("textarea", { readOnly: true, value: transcript, placeholder: 'Your speech will be transcribed here...', style: {minHeight: '250px', marginBottom: '1.5rem'}} as any),
                    React.createElement("button", { onClick: finishSpeech, className: 'btn btn-danger' }, "Finish Speech")
                );
        }
    };

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Lecturerette"),
        React.createElement("div", { className: "card" }, renderContent())
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
            React.createElement("fieldset", null,
                React.createElement("legend", null, "Personal Details"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Date of Birth"), React.createElement("input", { type: 'date', value: piqData.personal?.dob || '', onChange: e => handleChange('personal', 'dob', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Place of Birth"), React.createElement("input", { type: 'text', placeholder: "City, State", value: piqData.personal?.pob || '', onChange: e => handleChange('personal', 'pob', e.target.value) } as any)),
                    // FIX: Add `as any` to the props of the select and option elements to bypass TypeScript errors where `value` is not recognized. This is likely due to a misconfiguration in the type-checking environment.
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Marital Status"), React.createElement("select", { value: piqData.personal?.marital_status || '', onChange: e => handleChange('personal', 'marital_status', e.target.value) } as any, React.createElement("option", {value: ""} as any, "-- Select --"), React.createElement("option", {value: "Single"} as any, "Single"), React.createElement("option", {value: "Married"} as any, "Married"))),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Height (cm)"), React.createElement("input", { type: 'number', placeholder: "e.g., 175", value: piqData.personal?.height || '', onChange: e => handleChange('personal', 'height', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Weight (kg)"), React.createElement("input", { type: 'number', placeholder: "e.g., 70", value: piqData.personal?.weight || '', onChange: e => handleChange('personal', 'weight', e.target.value) } as any))
                )
            ),
             React.createElement("fieldset", null,
                React.createElement("legend", null, "Family Details"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Father's Name"), React.createElement("input", { type: 'text', value: piqData.family?.father_name || '', onChange: e => handleChange('family', 'father_name', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Father's Occupation"), React.createElement("input", { type: 'text', value: piqData.family?.father_occupation || '', onChange: e => handleChange('family', 'father_occupation', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Mother's Name"), React.createElement("input", { type: 'text', value: piqData.family?.mother_name || '', onChange: e => handleChange('family', 'mother_name', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Mother's Occupation"), React.createElement("input", { type: 'text', value: piqData.family?.mother_occupation || '', onChange: e => handleChange('family', 'mother_occupation', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group', style: {gridColumn: '1 / -1'} }, React.createElement("label", null, "Siblings' Details"), React.createElement("textarea", { placeholder: "Number of brothers and sisters, their age, education/occupation.", value: piqData.family?.siblings || '', onChange: e => handleChange('family', 'siblings', e.target.value) } as any))
                )
            ),
            React.createElement("fieldset", null,
                React.createElement("legend", null, "Educational Background"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "10th / Matriculation %"), React.createElement("input", { type: 'number', placeholder: "e.g., 85.5", value: piqData.education?.marks_10 || '', onChange: e => handleChange('education', 'marks_10', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "12th / Intermediate %"), React.createElement("input", { type: 'number', placeholder: "e.g., 82.0", value: piqData.education?.marks_12 || '', onChange: e => handleChange('education', 'marks_12', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Graduation % / CGPA"), React.createElement("input", { type: 'text', placeholder: "e.g., 7.8 or 78", value: piqData.education?.marks_grad || '', onChange: e => handleChange('education', 'marks_grad', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Highest Qualification"), React.createElement("input", { type: 'text', placeholder: "e.g., B.Tech CSE", value: piqData.education?.qualification || '', onChange: e => handleChange('education', 'qualification', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group', style: {gridColumn: '1 / -1'} }, React.createElement("label", null, "Sports / Games Participation"), React.createElement("textarea", { placeholder: "Mention sport, level of participation (School, College, District, State, National) and any achievements.", value: piqData.education?.sports || '', onChange: e => handleChange('education', 'sports', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group', style: {gridColumn: '1 / -1'} }, React.createElement("label", null, "Hobbies / Interests"), React.createElement("input", { type: 'text', placeholder: "e.g., Reading books, Playing football, Trekking", value: piqData.education?.hobbies || '', onChange: e => handleChange('education', 'hobbies', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group', style: {gridColumn: '1 / -1'} }, React.createElement("label", null, "NCC Experience"), React.createElement("textarea", { placeholder: "Mention Wing, Certificate obtained, and any rank/appointment held.", value: piqData.education?.ncc || '', onChange: e => handleChange('education', 'ncc', e.target.value) } as any))
                )
            ),
             React.createElement("fieldset", null,
                React.createElement("legend", null, "Employment Details (if any)"),
                React.createElement("div", { className: 'piq-form-grid' },
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Occupation / Designation"), React.createElement("input", { type: 'text', value: piqData.employment?.designation || '', onChange: e => handleChange('employment', 'designation', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Organization Name"), React.createElement("input", { type: 'text', value: piqData.employment?.organization || '', onChange: e => handleChange('employment', 'organization', e.target.value) } as any)),
                    React.createElement("div", { className: 'form-group' }, React.createElement("label", null, "Monthly Salary (INR)"), React.createElement("input", { type: 'number', placeholder: "e.g., 50000", value: piqData.employment?.salary || '', onChange: e => handleChange('employment', 'salary', e.target.value) } as any))
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

const RadarChart = ({ data }) => {
    const size = 500;
    const center = size / 2;
    const levels = 5;
    const radius = center - 50;
    const angleSlice = (Math.PI * 2) / OLQ_LIST.length;

    const points = OLQ_LIST.map((olq, i) => {
        const value = data[olq] || 0;
        const r = (value / 5) * radius;
        const x = center + r * Math.cos(angleSlice * i - Math.PI / 2);
        const y = center + r * Math.sin(angleSlice * i - Math.PI / 2);
        return `${x},${y}`;
    }).join(' ');

    return React.createElement("div", { className: 'radar-chart-container' },
        React.createElement("svg", { viewBox: `0 0 ${size} ${size}`, className: 'radar-chart-svg' },
            // Levels
            Array.from({ length: levels }).map((_, levelIndex) =>
                React.createElement("polygon", {
                    key: levelIndex,
                    className: 'radar-chart-level',
                    points: OLQ_LIST.map((_, i) => {
                        const r = (radius * (levelIndex + 1)) / levels;
                        const x = center + r * Math.cos(angleSlice * i - Math.PI / 2);
                        const y = center + r * Math.sin(angleSlice * i - Math.PI / 2);
                        return `${x},${y}`;
                    }).join(' '),
                    fill: 'none'
                })
            ),
            // Axes and Labels
            OLQ_LIST.map((olq, i) => {
                const x1 = center;
                const y1 = center;
                const r = radius;
                const x2 = center + r * Math.cos(angleSlice * i - Math.PI / 2);
                const y2 = center + r * Math.sin(angleSlice * i - Math.PI / 2);
                const labelX = center + (radius + 20) * Math.cos(angleSlice * i - Math.PI / 2);
                const labelY = center + (radius + 20) * Math.sin(angleSlice * i - Math.PI / 2);
                return React.createElement(React.Fragment, { key: olq },
                    React.createElement("line", { x1, y1, x2, y2, className: 'radar-chart-axis' }),
                    React.createElement("text", { x: labelX, y: labelY, dy: '0.35em', textAnchor: 'middle', className: 'radar-chart-label' }, olq)
                );
            }),
            // Data Area
            React.createElement("polygon", { points: points, className: 'radar-chart-area' })
        )
    );
};

const OLQDashboard = ({ user }) => {
    const olqScores = useMemo(() => {
        const scores = OLQ_LIST.reduce((acc, olq) => ({...acc, [olq]: 0}), {} as Record<string, number>);
        let testCount = 0;
        Object.values(user.tests || {}).forEach((testType: any[]) => {
            testType.forEach(test => {
                if(test.feedback && !test.feedback.error && test.feedback.olqs_demonstrated) {
                    test.feedback.olqs_demonstrated.forEach(olq => {
                        if (scores[olq] !== undefined) scores[olq]++;
                    });
                    testCount++;
                }
            });
        });
        
        // Normalize scores out of 5, giving a base score of 1 to avoid empty chart
        Object.keys(scores).forEach(olq => {
             scores[olq] = testCount > 0 ? 1 + (scores[olq] / testCount) * 4 : 0;
        });
        return scores;
    }, [user.tests]);
    
    const hasData = useMemo(() => Object.values(olqScores).some(score => score > 0), [olqScores]);

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "OLQ Analysis"),
        React.createElement("div", { className: "card" },
           hasData ? (
             React.createElement("div", { className: "olq-dashboard-container" },
                React.createElement("div", null,
                    React.createElement("h3", null, "Your OLQ Radar"),
                     React.createElement(RadarChart, { data: olqScores })
                ),
                React.createElement("div", null,
                    React.createElement("h3", null, "Interpretation"),
                    React.createElement("p", { style: {marginBottom: '1rem', color: 'var(--neutral-light)'}}, "This chart visualizes your Officer-Like Qualities based on AI analysis of your test performance. Scores are normalized on a scale of 0 to 5."),
                    React.createElement("table", {className: 'olq-interpretation-table'},
                        React.createElement("tbody", null,
                            Object.entries(olqScores).map(([olq, score]) => (
                                React.createElement("tr", { key: olq },
                                    React.createElement("td", null, React.createElement("strong", null, olq)),
                                    React.createElement("td", null, 
                                        React.createElement("div", { className: 'progress-bar-container', style: {height: '16px'} },
                                           React.createElement("div", { className: 'progress-bar-fill', style: { width: `${(score as number / 5) * 100}%` }})
                                        )
                                    )
                                )
                            ))
                        )
                    )
                )
            )
           ) : (
             React.createElement("div", {className: 'no-history' }, "Complete some tests with AI feedback to see your OLQ analysis here.")
           )
        )
    );
};

const CurrentAffairs = () => {
    const [news, setNews] = useState("");
    const [loading, setLoading] = useState(false);

    const fetchNews = useCallback(async () => {
        setLoading(true);
        const update = await getNewsUpdate();
        setNews(update);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchNews();
    }, [fetchNews]);

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Current Affairs Briefing"),
        React.createElement("div", { className: 'card news-card current-affairs-general' },
            React.createElement("div", { className: 'header-actions', style: { marginBottom: '1rem' } },
                React.createElement("h3", { style: { flexGrow: 1 } }, "Latest National & International Briefing"),
                React.createElement("button", { className: 'btn btn-secondary', onClick: fetchNews, disabled: loading }, "Refresh News")
            ),
            loading ? React.createElement(LoadingSpinner, {}) : React.createElement("div", { className: 'general-news-content' }, news || "Click to load latest updates.")
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
    const [currentTab, setCurrentTab] = useState('friends');
    const [selectedFriend, setSelectedFriend] = useState(null);
    const [message, setMessage] = useState('');

    const chatMessages = useMemo(() => {
        if (!selectedFriend || !chats) return [];
        const chatKey = [currentUser.rollNo, selectedFriend.rollNo].sort().join('_');
        return chats[chatKey] ? Object.values(chats[chatKey]) : [];
    }, [selectedFriend, chats, currentUser]);
    
    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!message.trim() || !selectedFriend) return;
        
        const chatKey = [currentUser.rollNo, selectedFriend.rollNo].sort().join('_');
        const newMessage = {
            sender: currentUser.rollNo,
            text: message,
            timestamp: new Date().toISOString()
        };
        
        const newChats = { ...chats, [chatKey]: { ...(chats[chatKey] || {}), [Date.now()]: newMessage }};
        saveData({ ...data, chats: newChats });
        setMessage('');
    };
    
    const ChatWindow = () => (
        React.createElement("div", { className: 'chat-and-profile-layout' },
            React.createElement("div", { className: 'chat-view' },
                React.createElement("div", { className: 'chat-history' },
                     chatMessages.length > 0 ? chatMessages.map((msg: ChatMessage) => (
                        React.createElement("div", { key: msg.timestamp, className: `chat-bubble ${msg.sender === currentUser.rollNo ? 'user' : 'friend'}` },
                            msg.text,
                            React.createElement("span", {className: 'chat-timestamp'}, new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}))
                        )
                    )) : React.createElement("div", {className: 'no-history' }, "Start the conversation!")
                ),
                React.createElement("form", { onSubmit: handleSendMessage, className: 'chat-input-form' },
                    React.createElement("input", { type: 'text', placeholder: 'Type a message...', value: message, onChange: e => setMessage(e.target.value) } as any),
                    React.createElement("button", { type: 'submit', className: 'btn btn-primary' }, "Send")
                )
            ),
            React.createElement("div", { className: 'friend-profile-view' },
                React.createElement("div", {className: 'card'},
                    React.createElement("div", { className: 'profile-photo-section' },
                        React.createElement("img", { src: selectedFriend.profilePic || DEFAULT_PROFILE_PIC, alt: selectedFriend.name, className: 'profile-picture' }),
                        React.createElement("h3", { style: {marginTop: '1rem', marginBottom: '0.5rem'}}, selectedFriend.name),
                        React.createElement("p", { style: { color: 'var(--neutral-light)'}}, selectedFriend.rollNo)
                    ),
                    React.createElement("hr", { style: { border: '1px solid var(--primary-light)', margin: '1rem 0'}}),
                     React.createElement("div", { className: "badges-section" },
                        React.createElement("h4", null, "Badges"),
                        React.createElement("div", { className: "badges-grid", style: {gap: 'var(--spacing-md)'} }, 
                            Object.entries(BADGES).map(([id, badge]) => 
                                React.createElement("div", { key: id, className: `badge ${selectedFriend.badges?.includes(id) ? 'unlocked' : ''}` },
                                    React.createElement("img", { src: badge.icon, alt: badge.name, className: "badge-icon", style: {width: '50px', height: '50px'} }),
                                    React.createElement("div", { className: "badge-tooltip" }, 
                                        React.createElement("strong", null, badge.name),
                                        React.createElement("p", null, badge.desc)
                                    )
                                )
                            )
                        )
                    )
                )
            )
        )
    );

    return React.createElement("div", null,
        React.createElement("h1", { className: "page-header" }, "Community Hub"),
        React.createElement("div", { className: "community-container" },
            React.createElement("div", { className: "community-sidebar" },
                React.createElement("div", { className: 'community-tabs' },
                    React.createElement("button", { className: currentTab === 'friends' ? 'active' : '', onClick: () => setCurrentTab('friends') }, "Friends"),
                    React.createElement("button", { className: currentTab === 'users' ? 'active' : '', onClick: () => setCurrentTab('users') }, "All Users"),
                    React.createElement("button", { className: currentTab === 'requests' ? 'active' : '', onClick: () => setCurrentTab('requests') }, `Requests (${currentUser.friendRequests?.length || 0})`)
                ),
                React.createElement("div", { className: 'community-list' },
                    currentTab === 'friends' && (currentUser.friends || []).map(rollNo => {
                        const friend = allUsers.find(u => u.rollNo === rollNo);
                        if (!friend) return null;
                        return React.createElement("div", { key: friend.rollNo, className: `community-list-item ${selectedFriend?.rollNo === friend.rollNo ? 'active' : ''}`, onClick: () => setSelectedFriend(friend) },
                            React.createElement("img", { src: friend.profilePic || DEFAULT_PROFILE_PIC, alt: friend.name }),
                            React.createElement("span", null, friend.name)
                        );
                    }),
                    currentTab === 'users' && allUsers.filter(u => u.rollNo !== currentUser.rollNo).map(user => (
                        React.createElement("div", { key: user.rollNo, className: 'community-list-item' },
                             React.createElement("img", { src: user.profilePic || DEFAULT_PROFILE_PIC, alt: user.name }),
                             React.createElement("span", null, user.name),
                             !currentUser.friends?.includes(user.rollNo) && !user.friendRequests?.includes(currentUser.rollNo) &&
                                React.createElement("button", { className: 'btn btn-secondary', style: {padding: '0.3rem 0.6rem', fontSize: '0.8rem'}, onClick: () => sendFriendRequest(currentUser, user) }, "Add")
                        )
                    )),
                    currentTab === 'requests' && (currentUser.friendRequests || []).map(rollNo => {
                        const requester = allUsers.find(u => u.rollNo === rollNo);
                        if (!requester) return null;
                        return React.createElement("div", { key: requester.rollNo, className: 'community-list-item request' },
                             React.createElement("img", { src: requester.profilePic || DEFAULT_PROFILE_PIC, alt: requester.name }),
                             React.createElement("span", null, requester.name),
                             React.createElement("div", {className: 'request-actions'},
                                React.createElement("button", { className: 'btn btn-primary', onClick: () => handleFriendRequest(currentUser, requester.rollNo, true) }, "Accept"),
                                React.createElement("button", { className: 'btn btn-danger', onClick: () => handleFriendRequest(currentUser, requester.rollNo, false) }, "Decline")
                             )
                        );
                    })
                )
            ),
            React.createElement("div", { className: "community-main" },
                selectedFriend ? React.createElement(ChatWindow, null) : React.createElement("div", { className: 'card no-history' }, "Select a friend to start chatting.")
            )
        )
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
    if (!currentUser) return React.createElement(LoginScreen, { onLogin: login, onSignup: signup, error: error });

    const lectureretteTopics = {
        geopolitics: data.content.lecturerette_topics_geopolitics,
        india: data.content.lecturerette_topics_india,
        general: data.content.lecturerette_topics_general,
        personal: data.content.lecturerette_topics_personal,
    };

    const PageComponent = {
        'dashboard': () => React.createElement(Dashboard, { user: currentUser, setPage: setCurrentPage }),
        'tat': () => React.createElement(TATRunner, { user: currentUser, updateUser, unlockBadge, images: data.content.tat_images, setPage: setCurrentPage }),
        'wat': () => React.createElement(WATRunner, { user: currentUser, updateUser, unlockBadge, words: WAT_WORDS_DEFAULT, setPage: setCurrentPage }),
        'srt': () => React.createElement(SRTRunner, { user: currentUser, updateUser, unlockBadge, scenarios: SRT_SCENARIOS_DEFAULT, setPage: setCurrentPage }),
        'sdt': () => React.createElement(SDTRunner, { user: currentUser, updateUser, unlockBadge, setPage: setCurrentPage }),
        'oir': () => React.createElement(OIRTestRunner, { user: currentUser, updateUser, unlockBadge, verbalQuestions: data.content.oir_verbal_questions, nonVerbalQuestions: data.content.oir_non_verbal_questions, setPage: setCurrentPage }),
        'lecturerette': () => React.createElement(Lecturerette, { user: currentUser, updateUser, unlockBadge, topics: lectureretteTopics, setPage: setCurrentPage }),
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
    const [openSubmenus, setOpenSubmenus] = useState<{ [key: string]: boolean }>({});
    const toggleSubmenu = (menu) => setOpenSubmenus(prev => ({ ...prev, [menu]: !prev[menu] }));

    const NavLink = ({ page, name, icon = null, isChild = false, hasSubmenu = false, submenuKey = '' }) => (
        React.createElement("a", { href: "#", className: `${isChild ? 'nav-link-child' : 'nav-link'} ${currentPage === page ? 'active' : ''}`, onClick: (e) => { e.preventDefault(); if (hasSubmenu) toggleSubmenu(submenuKey); else setPage(page); } },
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