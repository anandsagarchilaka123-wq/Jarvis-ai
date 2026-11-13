
const http = require("http");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GROQ_API_KEY;

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const path = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  ).pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && path === "/") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "success",
      message: "JARVIS AI Backend is running!"
    }));
  }

  if (req.method === "GET" && path === "/health") {
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: "online",
      assistant: "JARVIS",
      provider: "Groq",
      webSearch: "enabled"
    }));
  }

  if (req.method === "POST" && path === "/chat") {
    if (!API_KEY) {
      res.writeHead(500);
      return res.end(JSON.stringify({
        error: "GROQ_API_KEY is missing in Render"
      }));
    }

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

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
                    "You are JARVIS, a helpful personal AI voice assistant. " +
                    "Search the web for current information before answering. " +
                    "Reply in Telugu when the user speaks Telugu and in English " +
                    "when the user speaks English. " +
                    "Explain answers clearly and naturally, suitable for speech. " +
                    "Do not invent facts. If information cannot be verified, say so."
                },
                {
                  role: "user",
                  content: message
                }
              ],

              tools: [
                {
                  type: "browser_search"
                }
              ],

              tool_choice: "required",
              reasoning_effort: "low",
              max_completion_tokens: 1200,
              stream: false
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error?.message || "Groq API request failed"
          );
        }

        const reply =
          result.choices?.[0]?.message?.content?.trim();

        if (!reply) {
          throw new Error("No reply received from Groq");
        }

        res.writeHead(200);
        res.end(JSON.stringify({
          reply: reply
        }));

      } catch (error) {
        console.error("JARVIS ERROR:", error.message);

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
    error: "Not Found",
    requestedPath: path
  }));
});

server.listen(PORT, () => {
  console.log("JARVIS AI SERVER STARTED");
  console.log("PORT:", PORT);
  console.log("GROQ API:", API_KEY ? "CONFIGURED" : "MISSING");
});
