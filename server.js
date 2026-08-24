import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import fs from "fs";

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// ENV check
console.log("ENV CHECK:");
console.log("TWILIO_SID:", process.env.TWILIO_SID);
console.log("TWILIO_AUTH:", process.env.TWILIO_AUTH);
console.log("FROM_NUMBER:", process.env.FROM_NUMBER);

// JSON file path
const GROUP_FILE = "./group.json";
const ADMIN_FILE = "./admins.json";

// Load group from JSON
let GROUP = [];
let ADMINS = [];

// Load group file
if (fs.existsSync(GROUP_FILE)) {
  GROUP = JSON.parse(fs.readFileSync(GROUP_FILE));
} else {
  fs.writeFileSync(GROUP_FILE, JSON.stringify([]));
}

// Load admin file
if (fs.existsSync(ADMIN_FILE)) {
  ADMINS = JSON.parse(fs.readFileSync(ADMIN_FILE));
} else {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify([]));
}

// Save group
function saveGroup() {
  fs.writeFileSync(GROUP_FILE, JSON.stringify(GROUP, null, 2));
}

// Save admins
function saveAdmins() {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(ADMINS, null, 2));
}

// Send SMS via Twilio
async function sendMessage(to, message) {
  try {
    const authString = Buffer.from(
      `${process.env.TWILIO_SID}:${process.env.TWILIO_AUTH}`
    ).toString("base64");

    const payload = new URLSearchParams({
      From: process.env.FROM_NUMBER,
      To: to,
      Body: message
    });

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
      payload,
      {
        headers: {
          Authorization: `Basic ${authString}`,
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );
  } catch (error) {
    console.error("Twilio Error:", error);
  }
}

// Broadcast message to group
async function broadcast(sender, text) {
  for (const member of GROUP) {
    if (member.number !== sender) {
      await sendMessage(member.number, text);
    }
  }
}

// Handle commands
function parseCommand(from, body) {
  const parts = body.trim().split(" ");
  const cmd = parts[0].toLowerCase();

  const sender = GROUP.find(m => m.number === from);

  if (cmd === "#list") {
    return GROUP.map(m => `${m.name}: ${m.number}`).join("\n");
  }

  if (cmd === "#rename") {
    const newName = parts.slice(1).join(" ");
    if (!sender) return "You are not in the group.";
    sender.name = newName;
    saveGroup();
    return `Your name has been updated to ${newName}`;
  }

  if (cmd === "#exit") {
    GROUP = GROUP.filter(m => m.number !== from);
    saveGroup();
    return "You have left the group.";
  }

  if (cmd === "#admin") {
    if (!ADMINS.includes(from)) return "Admin only.";
    return "Admin panel:\n#add [name] [number]\n#remove [name/number]\n#promote [number]";
  }

  if (cmd === "#add") {
    if (!ADMINS.includes(from)) return "Admin only.";
    const name = parts[1];
    const number = parts[2];
    if (!name || !number) return "Usage: #add [name] [number]";
    GROUP.push({ name, number });
    saveGroup();
    return `${name} added to group.`;
  }

  if (cmd === "#remove") {
    if (!ADMINS.includes(from)) return "Admin only.";
    const target = parts[1];
    GROUP = GROUP.filter(
      m => m.name !== target && m.number !== target
    );
    saveGroup();
    return `${target} removed from group.`;
  }

  if (cmd === "#promote") {
    if (!ADMINS.includes(from)) return "Admin only.";
    const number = parts[1];
    if (!number) return "Usage: #promote [number]";
    if (!ADMINS.includes(number)) {
      ADMINS.push(number);
      saveAdmins();
      return `${number} is now an admin.`;
    }
    return `${number} is already an admin.`;
  }

  return null;
}

// Twilio webhook
app.post("/sms", async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body;

  console.log("Incoming:", from, body);

  // Auto-add sender if not in group
  if (!GROUP.find(m => m.number === from)) {
    GROUP.push({ name: from, number: from });
    saveGroup();
  }

  // Check for command
  const result = parseCommand(from, body);

  if (result) {
    await sendMessage(from, result);
  } else {
    await broadcast(from, body);
  }

  res.send("<Response></Response>");
});

// Start server
app.listen(3000, () => {
  console.log("Server running on port 3000");
});
