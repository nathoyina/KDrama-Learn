import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface VocabItem {
  word: string;
  reading: string;
  meaning: string;
  context: string;
  type: "slang" | "honorific" | "common" | "grammar";
}

export interface SceneAnalysis {
  transcript: string;
  translation: string;
  vocabulary: VocabItem[];
  culturalNotes: string;
}

export async function analyzeDramaScene(text: string): Promise<SceneAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this Korean drama dialogue/subtitle text: "${text}". 
    Provide a translation, extract key vocabulary (especially drama-specific slang or honorifics), and give cultural context.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
          translation: { type: Type.STRING },
          vocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reading: { type: Type.STRING },
                meaning: { type: Type.STRING },
                context: { type: Type.STRING },
                type: { 
                  type: Type.STRING,
                  enum: ["slang", "honorific", "common", "grammar"]
                }
              },
              required: ["word", "reading", "meaning", "context", "type"]
            }
          },
          culturalNotes: { type: Type.STRING }
        },
        required: ["transcript", "translation", "vocabulary", "culturalNotes"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Failed to analyze scene");
  }
}

export async function analyzeDramaAudio(audioBase64: string, mimeType: string): Promise<SceneAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        inlineData: {
          data: audioBase64,
          mimeType: mimeType
        }
      },
      {
        text: "Transcribe the Korean speech in this audio, translate it to English, extract key vocabulary (slang, honorifics, grammar), and provide cultural context. Return the result in the specified JSON format."
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
          translation: { type: Type.STRING },
          vocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                reading: { type: Type.STRING },
                meaning: { type: Type.STRING },
                context: { type: Type.STRING },
                type: { 
                  type: Type.STRING,
                  enum: ["slang", "honorific", "common", "grammar"]
                }
              },
              required: ["word", "reading", "meaning", "context", "type"]
            }
          },
          culturalNotes: { type: Type.STRING }
        },
        required: ["transcript", "translation", "vocabulary", "culturalNotes"]
      }
    }
  });

  try {
    return JSON.parse(response.text || "{}");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    throw new Error("Failed to analyze audio");
  }
}
