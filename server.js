console.log("ENV CHECK:");
console.log("TWILIO_SID:", process.env.TWILIO_SID);
console.log("TWILIO_AUTH:", process.env.TWILIO_AUTH);
console.log("FROM_NUMBER:", process.env.FROM_NUMBER);
import express from "express";
import axios from "axios";
import fs from "fs";

const app = express();

// Twilio sends x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Admin info
const ADMIN_NAME = "MK";
const ADMIN_NUMBER = "+18483735035";

// JSON file path
const GROUP_FILE = "./group.json";

// Load group from JSON file
let GROUP = [];
if (fs.existsSync(GROUP_FILE)) {
  GROUP = JSON.parse(fs.readFileSync(GROUP_FILE));
} else {
  fs.writeFileSync(GROUP_FILE, JSON.stringify([]));
}

// Save group to JSON file
function saveGroup() {
  fs.writeFileSync(GROUP_FILE, JSON.stringify(GROUP, null, 2));
}

// Find member by number
function findMember(number) {
  return GROUP.find(m => m.number === number);
}

// Handle #add (admin only)
function handleAdd(sender, text) {
  if (sender !== ADMIN_NUMBER) return;

  const parts = text.split(" ");
  if (parts.length < 3) return;

  const name = parts[1];
  const number = parts[2];

  GROUP.push({ name, number });
  saveGroup();

  console.log("Added:", name, number);
}

// Handle #remove (admin only)
function handleRemove(sender, text) {
  if (sender !== ADMIN_NUMBER) return;

  const parts = text.split(" ");
  if (parts.length < 2) return;

  const target = parts[1];

  GROUP = GROUP.filter(
    m => m.name !== target && m.number !== target
  );

  saveGroup();
  console.log("Removed:", target);
}

// Handle #list (everyone)
function handleList(sender) {
  let msg = "Group members:\n";
  for (const m of GROUP) {
    msg += `${m.name} - ${m.number}\n`;
  }
  return msg;
}

// Handle #rename (everyone)
function handleRename(sender, text) {
  const parts = text.split(" ");
  if (parts.length < 2) return;

  const newName = parts[1];
  const member = findMember(sender);

  if (member) {
    member.name = newName;
    saveGroup();
    console.log("Renamed:", sender, "to", newName);
  }
}

// Handle #exit (everyone)
function handleExit(sender) {
  GROUP = GROUP.filter(m => m.number !== sender);
  saveGroup();
  console.log("User exited:", sender);
}

// Handle #help (everyone)
function handleHelp() {
  return (
    "Commands:\n" +
    "#list - show group members\n" +
    "#rename [newName] - change your name\n" +
    "#exit - leave the group\n" +
    "#help - show commands\n" +
    "#add [name] [number] - admin only\n" +
    "#remove [name/number] - admin only\n" +
    "#admin - admin only"
  );
}

// Handle #admin (admin only)
function handleAdmin(sender) {
  if (sender !== ADMIN_NUMBER) return "Unauthorized";
  return `Admin: ${ADMIN_NAME} (${ADMIN_NUMBER})`;
}

// Twilio inbound webhook
app.post("/inbound-sms", async (req, res) => {
  try {
    const sender = req.body.From;
    const text = req.body.Body;

    console.log("Incoming:", sender, text);

    let reply = null;

    // Commands
    if (text.startsWith("#add")) handleAdd(sender, text);
    else if (text.startsWith("#remove")) handleRemove(sender, text);
    else if (text.startsWith("#list")) reply = handleList(sender);
    else if (text.startsWith("#rename")) handleRename(sender, text);
    else if (text.startsWith("#exit")) handleExit(sender);
    else if (text.startsWith("#help")) reply = handleHelp();
    else if (text.startsWith("#admin")) reply = handleAdmin(sender);

    // If command produced a reply → send only to sender
    if (reply) {
      await axios.post(
        `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
        new URLSearchParams({
          From: process.env.FROM_NUMBER,
          To: sender,
          Body: reply
        }),
        {
          auth: {
            username: process.env.TWILIO_SID,
            password: process.env.TWILIO_AUTH
          }
        }
      );

      return res.send("<Response></Response>");
    }

    // Normal message → broadcast to group
    for (const member of GROUP) {
      if (member.number !== sender) {
        await axios.post(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`,
          new URLSearchParams({
            From: process.env.FROM_NUMBER,
            To: member.number,
            Body: `${text}`
          }),
          {
            auth: {
              username: process.env.TWILIO_SID,
              password: process.env.TWILIO_AUTH
            }
          }
        );
      }
    }

    res.send("<Response></Response>");
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// List group members (HTTP)
app.get("/group/list", (req, res) => {
  res.json(GROUP);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
