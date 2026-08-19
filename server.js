import express from "express";
import bodyParser from "body-parser";
import axios from "axios";

const app = express();
app.use(bodyParser.json());

const GROUP = [
  "+12345678901",
  "+19876543210"
];

const TELNYX_API_KEY = process.env.TELNYX_API_KEY;
const FROM_NUMBER = process.env.FROM_NUMBER;

app.post("/inbound-sms", async (req, res) => {
  try {
    const data = req.body.data?.payload;

    const sender = data.from.phone_number;
    const text = data.text;
    const media = data.media || [];

    console.log("Incoming:", sender, text, media);

    for (const member of GROUP) {
      if (member !== sender) {
        await axios.post(
          "https://api.telnyx.com/v2/messages",
          {
            from: FROM_NUMBER,
            to: member,
            text: text,
            media_urls: media
          },
          {
            headers: {
              Authorization: `Bearer ${TELNYX_API_KEY}`
            }
          }
        );
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});