const { default: makeWASocket, useMultiFileAuthState, delay } = require("@whiskeysockets/baileys");
const { GoogleGenAI } = require("@google/genai");
const pino = require("pino");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// Render/Koyeb hosting ko 24/7 active rakhne ke liye web panel entry
app.get("/", (req, res) => res.send("🔥 Prime AI Bot is Running 24/7!"));
app.listen(PORT, () => console.log(`Web Server started on port ${PORT}`));

// --- GEMINI AI SETUP ---
const GEMINI_API_KEY = "AIzaSyBEp0sZYK6vvjrmas4KfyfoaJqPJ825U_U";
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function startBot() {
    // Session save karne ke liye folder banega
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false // Pairing code active karne ke liye false rakha hai
    });

    // 8-Digit Pairing Code Request (Agar pehle se link nahi hai)
    if (!sock.authState.creds.registered) {
        // Aapka set kiya hua real number
        const phoneNumber = "923209725835"; 
        
        console.log(`\n[!] Connecting to ${phoneNumber} for pairing code...`);
        await delay(6000); // Connection setup ka wait
        try {
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`\n==================================================`);
            console.log(`🔥 APNA WHATSAPP LINK KARNE KE LIYE YEH CODE USE KARO:`);
            console.log(`👉  ${code}  👈`);
            console.log(`==================================================\n`);
        } catch (err) {
            console.log("Pairing code generate karne mein error aaya: ", err);
        }
    }

    sock.ev.on('creds.update', saveCreds);

    // Jab koi message aaye
    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        // Agar message khali hai, ya hamari apni taraf se gaya hai, to ignore karo
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        // Text nikalne ka tareeqa (Simple text ya reply text)
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (text) {
            console.log(`📬 Message Received: "${text}" from ${from}`);

            try {
                // Gemini AI se reply generate karwana
                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: text,
                    // Bot ka behavior set karne ke liye system instruction
                    config: {
                        systemInstruction: "You are a helpful, friendly assistant. Keep your answers natural, clear, and to the point. Prefer answering in Roman Urdu/Urdu if the user speaks in Urdu/Hindi."
                    }
                });

                const aiReply = response.text;

                // WhatsApp par response bhejna
                await sock.sendMessage(from, { text: aiReply });
                console.log(`🚀 AI Reply Sent successfully.`);

            } catch (aiError) {
                console.log("AI Response generate karne mein masla aaya: ", aiError);
                // Fallback reply agar AI key mein koi masla ho
                await sock.sendMessage(from, { text: "Sorry, abhi mera AI brain thoda busy hai. Kuch der baad try karein!" });
            }
        }
    });

    // Agar connection toot jaye to auto-restart
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== 401;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ WHATSAPP BOT IS SUCCESSFULLY CONNECTED AND LIVE!');
        }
    });
}

// Bot shuru karein
startBot().catch(err => console.log("Main Error: ", err));