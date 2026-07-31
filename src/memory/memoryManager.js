const fs = require("fs");
const path = require("path");

const memoryPath = path.join(__dirname, "conversations.json");

function readMemory() {

    if (!fs.existsSync(memoryPath)) {

        fs.writeFileSync(memoryPath, "{}");

    }

    const data = fs.readFileSync(memoryPath, "utf8");

    return JSON.parse(data);

}

function saveMemory(memory) {

    fs.writeFileSync(

        memoryPath,

        JSON.stringify(memory, null, 4)

    );

}

function addMessage(userId, role, message) {

    const memory = readMemory();

    if (!memory[userId]) {

        memory[userId] = [];

    }

    memory[userId].push({

        role,

        message,

        date: new Date().toISOString()

    });

    // Solo guardar los últimos 20 mensajes
    if (memory[userId].length > 20) {

        memory[userId] = memory[userId].slice(-20);

    }

    saveMemory(memory);

}

function getConversation(userId) {

    const memory = readMemory();

    return memory[userId] || [];

}

module.exports = {

    addMessage,

    getConversation

};