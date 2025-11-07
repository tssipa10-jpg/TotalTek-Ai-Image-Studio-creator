import { GoogleGenAI, Modality } from "@google/genai";

// Utility to convert File to base64
export const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = (error) => reject(error);
    });
};

const getGenAI = () => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable is not set.");
    }
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const enhancePrompt = async (simplePrompt: string): Promise<string> => {
    const ai = getGenAI();
    try {
        const systemInstruction = `You are a creative assistant and an expert in prompt engineering for AI image generation models. 
        Your task is to take a user's simple idea and expand it into a rich, detailed, and highly effective prompt. 
        The prompt should include details about the subject, setting, art style, lighting, camera angle, and mood. 
        The final output should be ONLY the prompt itself, without any introductory text, titles, or explanations.
        For example, if the user provides "a cat in space", you should return something like: 
        "A cinematic, ultra-realistic photograph of a fluffy ginger cat wearing a retro-style bubble helmet, floating serenely in the vast emptiness of space. The Earth is a beautiful, glowing blue and white marble in the background. The lighting is dramatic, with the sun casting long shadows and highlighting the texture of the cat's fur. The composition is a medium shot, capturing the cat's curious expression. The mood is one of awe and wonder. Shot on a DSLR with a prime lens, f/1.8, high shutter speed, photorealistic, 8k."`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: simplePrompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.8,
            }
        });

        return response.text.trim();

    } catch (error) {
        console.error("Error in enhancePrompt:", error);
        throw new Error("Failed to enhance prompt. Please try again.");
    }
};

export const generateImage = async (prompt: string, aspectRatio: string): Promise<string> => {
    const ai = getGenAI();
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            return response.generatedImages[0].image.imageBytes;
        }
        throw new Error("Image generation failed or returned no images.");
    } catch (error) {
        console.error("Error in generateImage:", error);
        throw new Error("Failed to generate image. Please check your prompt and API key.");
    }
};

export const editImage = async (prompt: string, imageFile: File): Promise<string> => {
    const ai = getGenAI();
    try {
        const base64Image = await fileToBase64(imageFile);
        
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: imageFile.type,
            },
        };

        const textPart = {
            text: prompt,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [imagePart, textPart],
            },
            config: {
                responseModalities: [Modality.IMAGE],
            },
        });
        
        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
        }

        throw new Error("Image editing failed or returned no image data.");
    } catch (error) {
        console.error("Error in editImage:", error);
        throw new Error("Failed to edit image. Please check your image, prompt, and API key.");
    }
};