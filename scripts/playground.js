

import Express from "express";
import { GoogleGenAI } from "@google/genai";
const app = Express();
app.get("/generate", async (req, res) => {
  const student = req.query.student || "John";
  const topic = req.query.topic || "Verb to be";
  try {
    const ai = new GoogleGenAI({
      apiKey: "AIzaSyC9uYFfqXGcwCghuy12QBDfxx-y1I9Drow",
    }); 
 const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `You Are an English language teacher. 
    You student's name is ${student}. 
    Teach them about ${topic} in an engaging way,
     and provide an example sentence using the topic.
     send only oneo sentence at a time, respond with only html code. 
     it must be nicly styled with css and comes to the screen with animation`,
     config: { 
     responseMimeType: 'text/plain'
     }
    });
    const html = response.text;
    const cleanHTML = html.replace(/\\n/g, '').replace(/\\"/g, '"').replace(/\*\/\n/g, '').replace(/\n/g, '').replace(/```"/g, '' ).replace(/```/g, '') .replace(/\\t/g, '').trim() ;
 res.json(cleanHTML );
  } catch (error) {
    console.error("Error generating content:", error);
    res.status(500).json({ error: "Failed to generate content" });
  }
});


app.listen(3000, () => {
  console.log("Playground server running on port 3000");
})