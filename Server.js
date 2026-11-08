
const http = require("http");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;

const server = http.createServer(async (req, res) => {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "success",
      message: "JARVIS AI Backend is running!"
    }));
  }

  if (req.method === "POST" && req.url === "/chat") {

    if (!API_KEY) {
      res.writeHead(500);
      return res.end(JSON.stringify({
        error: "API key is not configured"
      }));
    }

    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 100000) {
        req.destroy();
      }
    });

    req.on("end", async () => {
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
          "https://api.openai.com/v1/responses",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
              model: "gpt-5.5",
              instructions:
                "You are JARVIS, a friendly AI voice assistant. Reply naturally in Telugu or English according to the user's language.",
              input: message
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error?.message || "AI request failed"
          );
        }

        res.writeHead(200, {
          "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
          reply: result.output_text
        }));

      } catch (error) {
        res.writeHead(500, {
          "Content-Type": "application/json"
        });

        res.end(JSON.stringify({
          error: error.message
        }));
      }
    });

    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(PORT, () => {
  console.log(`JARVIS AI running on port ${PORT}`);
});
