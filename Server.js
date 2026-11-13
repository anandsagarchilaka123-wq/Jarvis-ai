
const http = require("http");

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const SKETCHFAB_API_TOKEN = process.env.SKETCHFAB_API_TOKEN || "";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const SKETCHFAB_URL =
  "https://api.sketchfab.com/v3/search";

const server = http.createServer(async (req, res) => {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const path = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  ).pathname;

  function send(status, data) {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && path === "/") {
    return send(200, {
      status: "success",
      assistant: "JARVIS AI",
      features: [
        "AI Chat",
        "Internet Search",
        "3D Model Search",
        "Interactive 3D Viewer",
        "Telugu Voice Explanation"
      ]
    });
  }

  if (req.method === "GET" && path === "/health") {
    return send(200, {
      status: "online",
      groq: GROQ_API_KEY ? "configured" : "missing",
      sketchfab: SKETCHFAB_API_TOKEN
        ? "configured"
        : "token not configured",
      assistant: "JARVIS AI"
    });
  }

  // SEARCH 3D MODELS
  async function search3DModel(query) {

    const searchUrl =
      "https://sketchfab.com/search?type=models&q=" +
      encodeURIComponent(query);

    try {
      const headers = {
        "Accept": "application/json"
      };

      if (SKETCHFAB_API_TOKEN) {
        headers["Authorization"] =
          `Token ${SKETCHFAB_API_TOKEN}`;
      }

      const response = await fetch(
        `${SKETCHFAB_URL}?type=models&q=${encodeURIComponent(query)}&count=5`,
        {
          method: "GET",
          headers: headers,
          signal: AbortSignal.timeout(15000)
        }
      );

      if (!response.ok) {
        return {
          found: false,
          searchUrl,
          message: "3D model search needs API access or authentication"
        };
      }

      const data = await response.json();

      const models = (data.results || [])
        .filter(item => item.uid && item.name)
        .slice(0, 5)
        .map(item => ({
          name: item.name,
          uid: item.uid,
          viewerUrl:
            item.embedUrl ||
            `https://sketchfab.com/models/${item.uid}/embed`,
          modelUrl:
            `https://sketchfab.com/3d-models/${item.uid}`,
          thumbnail:
            item.thumbnails?.images?.[0]?.url || "",
          license: item.license || "Check model license",
          downloadable: item.isDownloadable === true
        }));

      return {
        found: models.length > 0,
        searchUrl,
        models
      };

    } catch (error) {
      console.error("3D SEARCH ERROR:", error.message);

      return {
        found: false,
        searchUrl,
        message: "Unable to search 3D models right now"
      };
    }
  }

  // CHECK IF USER WANTS A 3D MODEL
  function wants3D(text) {
    return /(3d|three dimensional|model|show me|display|visualize|చూపించు|చూపించండి|3డి|మోడల్|బొమ్మ|చూపించవా)/i
      .test(text);
  }

  // REMOVE COMMAND WORDS FROM SEARCH QUERY
  function getModelQuery(text) {
    return text
      .replace(/hey jarvis/gi, "")
      .replace(/jarvis/gi, "")
      .replace(/3d|three dimensional|model|show me|display|visualize/gi, "")
      .replace(/చూపించు|చూపించండి|3డి|మోడల్|బొమ్మ|చూపించవా/g, "")
      .replace(/[?!.,]/g, "")
      .trim();
  }

  // CHAT + 3D SEARCH
  if (req.method === "POST" && path === "/chat") {

    if (!GROQ_API_KEY) {
      return send(500, {
        error: "GROQ_API_KEY is missing in Render"
      });
    }

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 100000) {
        send(413, {
          error: "Message is too large"
        });
        req.destroy();
      }
    });

    req.on("end", async () => {

      if (res.writableEnded) return;

      try {
        const data = JSON.parse(body);
        const message = data.message;

        if (!message || typeof message !== "string") {
          return send(400, {
            error: "Please enter a message"
          });
        }

        const show3D = wants3D(message);
        const modelQuery = getModelQuery(message);

        // RUN AI AND 3D SEARCH TOGETHER
        const modelPromise = show3D && modelQuery
          ? search3DModel(modelQuery)
          : Promise.resolve(null);

        const aiPromise = fetch(GROQ_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`
          },
          body: JSON.stringify({

            model: "openai/gpt-oss-20b",

            messages: [
              {
                role: "system",
                content:
                  "You are JARVIS, a friendly personal AI assistant. " +
                  "Reply in Telugu when the user speaks Telugu. " +
                  "Reply in English when the user speaks English. " +
                  "Explain things naturally, clearly and accurately. " +
                  "When a user asks to see a 3D object, explain what it is " +
                  "and describe its important features in Telugu. " +
                  "Keep the answer suitable for Android Text To Speech. " +
                  "Never claim that a 3D model was displayed unless the app confirms it."
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
          }),
          signal: AbortSignal.timeout(60000)
        });

        const [aiResponse, modelResult] = await Promise.all([
          aiPromise,
          modelPromise
        ]);

        const aiData = await aiResponse.json();

        if (!aiResponse.ok) {
          throw new Error(
            aiData.error?.message || "Groq API failed"
          );
        }

        const reply =
          aiData.choices?.[0]?.message?.content?.trim();

        if (!reply) {
          throw new Error("AI reply is empty");
        }

        return send(200, {
          status: "success",
          reply: reply,

          voice: {
            language: "te-IN",
            text: reply
          },

          show3D: show3D,

          model: modelResult
            ? modelResult
            : null
        });

      } catch (error) {

        console.error("JARVIS ERROR:", error.message);

        if (!res.writableEnded) {
          return send(500, {
            status: "error",
            error: error.message
          });
        }
      }
    });

    return;
  }

  // DIRECT 3D SEARCH ENDPOINT
  if (req.method === "GET" && path === "/model-search") {

    const query = new URL(
      req.url,
      `http://${req.headers.host || "localhost"}`
    ).searchParams.get("q");

    if (!query) {
      return send(400, {
        error: "Please provide a model search query"
      });
    }

    const result = await search3DModel(query);

    return send(200, result);
  }

  return send(404, {
    error: "Route not found"
  });

});

server.listen(PORT, () => {
  console.log("================================");
  console.log("JARVIS AI SERVER STARTED");
  console.log("PORT:", PORT);
  console.log("GROQ:", GROQ_API_KEY ? "READY" : "MISSING");
  console.log(
    "SKETCHFAB:",
    SKETCHFAB_API_TOKEN ? "READY" : "NOT CONFIGURED"
  );
  console.log("3D SEARCH: ENABLED");
  console.log("================================");
});
