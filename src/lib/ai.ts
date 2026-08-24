// Ligtas na hinuhugot ang token mula sa iyong .env file
// @ts-ignore
const OPENROUTER_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.VITE_OPENROUTER_API_KEY || "";

/**
 * 🧑‍🎓 FEATURE 1: Student Empathy Reflection Space
 * Messenger Chatbot Assistant Response Generator
 */
export async function generateStudentReflection(studentMessage: string): Promise<string> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173", // Site URL para sa tracking
        "X-Title": "OMSC Guidance Portal"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash", // Libre o napakamurang mabilis na model sa OpenRouter
        "messages": [
          {
            "role": "system",
            "content": "You are an elite, empathetic, and compassionate Guidance Counselor at Occidental Mindoro State College (OMSC). Provide a highly comforting, validating, and supportive response in Taglish. Do NOT give any medical or clinical diagnosis. Keep it warm, motivating, professional, and limit it to 3 to 4 sentences maximum."
          },
          {
            "role": "user",
            "content": studentMessage
          }
        ]
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("[OpenRouter Student Core Crash]:", error);
    return "Medyo marami po kaming pinoproseso ngayon sa Guidance Center. Huwag po kayong mag-alala, palaging handang makinig ang aming opisina sa inyo.";
  }
}

/**
 * 👩‍💼 FEATURE 2: Counselor Administrative Case Notes Summarizer
 */
export async function generateCounselorSummary(studentMessage: string): Promise<string> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "OMSC Guidance Portal"
      },
      body: JSON.stringify({
        "model": "google/gemini-2.5-flash",
        "messages": [
          {
            "role": "system",
            "content": "You are an expert data triage system for a university Guidance Office. Analyze the user's message context. Extract and summarize the core details into exactly three clean, strict markdown lines: - CORE ISSUE: (Determine main problem, e.g., Academic Burnout, Stress, Financial Pressure) - URGENCY LEVEL: (Strictly categorize as LOW, MEDIUM, or HIGH based on emotional weight) - REC ACTION: (Suggest a brief 1-sentence recommended counseling action)"
          },
          {
            "role": "user",
            "content": studentMessage
          }
        ]
      })
    });

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("[OpenRouter Counselor Core Crash]:", error);
    return "- CORE ISSUE: Error extracting data.\n- URGENCY LEVEL: UNKNOWN\n- REC ACTION: Manual verification required.";
  }
}