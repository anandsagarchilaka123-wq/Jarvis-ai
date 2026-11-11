 
const http = require("http");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GROQ_API_KEY;

const server = http.createServer(async (req, res) => {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "success",
      message: "JARVIS AI Backend is running!"
    }));
  }

  if (req.method === "POST" && req.url === "/chat") {

    if (!API_KEY) {
      res.writeHead(500);
      return res.end(JSON.stringify({
        error: "GROQ_API_KEY is not configured"
      }));
    }

    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 100000) {
        res.writeHead(413);
        res.end(JSON.stringify({
          error: "Message is too large"
        }));
        req.destroy();
      }
    });

    req.on("end", async () => {
      if (res.writableEnded) return;

      try {
        const data = JSON.parse(body);
        const message = data.message;

        if (!message || typeof message !== "string") {
          res.writeHead(400);
          return res.end(JSON.stringify({
            error: "Please enter a message"
          }));
        }

        const response = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
              model: "openai/gpt-oss-20b",
              messages: [
                {
                  role: "system",
                  content:
                    "You are JARVIS, a friendly AI voice assistant. Reply naturally in Telugu or English according to the user's language. Keep answers clear and conversational."
                },
                {
                  role: "user",
                  content: message
                }
              ],
              temperature: 0.7,
              max_completion_tokens: 1024
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error?.message || "Groq AI request failed"
          );
        }

        const reply =
          result.choices?.[0]?.message?.content;

        if (!reply) {
          throw new Error("Empty response from Groq AI");
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          reply: reply
        }));

      } catch (error) {
        console.error("JARVIS Error:", error.message);

        if (!res.writableEnded) {
          res.writeHead(500);
          res.end(JSON.stringify({
            error: error.message
          }));
        }
      }
    });

    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({
    error: "Not Found"
  }));
});

server.listen(PORT, () => {
  console.log(`JARVIS AI running on port ${PORT}`);
});
