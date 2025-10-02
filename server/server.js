// server/server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const API_BASE_URL = "https://api.firehydrant.io/v1";
const API_KEY = process.env.FH_API_KEY;

// Generic proxy function
app.use("/api/:entity", async (req, res) => {
  const { entity } = req.params;
  const method = req.method;
  const body = req.body;

  try {
    const response = await fetch(`${API_BASE_URL}/${entity}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: body && Object.keys(body).length ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => console.log("Proxy server running on port 5000"));
