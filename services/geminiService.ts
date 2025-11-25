import { GoogleGenAI } from "@google/genai";

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

// Helper to parse data URL
const parseDataUrl = (dataUrl: string): { mimeType: string; data: string } => {
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!match) {
        // Fallback for when the data URL doesn't have the MIME type prefix
        if (dataUrl.length > 0) {
            return { mimeType: 'image/png', data: dataUrl };
        }
        throw new Error("Invalid data URL format");
    }
    return { mimeType: match[1], data: match[2] };
};


export const enhancePrompt = async (simplePrompt: string): Promise<string> => {
    const ai = getGenAI();
    try {
        const systemInstruction = `You are a creative assistant and an expert in prompt engineering for AI image generation models. 
        Your task is to take a user's simple idea and expand it into a rich, detailed, and highly effective prompt.
        The final prompt MUST describe an ultra-realistic, high-resolution photograph. Emphasize natural human textures, cinematic lighting, and a photorealistic look for the entire scene, including environment and background.
        Include details about the subject, setting, art style (which should be photographic/realistic), lighting, camera angle, and mood.
        The final output should be ONLY the prompt itself, without any introductory text, titles, or explanations.
        For example, if the user provides "a cat in space", you should return something like: 
        "A cinematic, ultra-realistic photograph of a fluffy ginger cat wearing a retro-style bubble helmet, floating serenely in the vast emptiness of space. The Earth is a beautiful, glowing blue and white marble in the background. The lighting is dramatic, with the sun casting long shadows and highlighting the texture of the cat's fur. The composition is a medium shot, capturing the cat's curious expression. The mood is one of awe and wonder. Shot on a DSLR with a prime lens, f/1.8, high shutter speed, photorealistic, 8k."`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
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
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: prompt }],
            },
            config: {
                imageConfig: {
                    aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
                },
            },
        });

        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
        }
        throw new Error("Image generation failed or returned no images.");
    } catch (error) {
        console.error("Error in generateImage:", error);
        throw new Error("Failed to generate image. Please check your prompt and API key.");
    }
};

export const generateWithReference = async (prompt: string, referenceImage: string): Promise<string> => {
    const ai = getGenAI();
    try {
        const { mimeType, data: base64Image } = parseDataUrl(referenceImage);
        
        const imagePart = {
            inlineData: {
                data: base64Image,
                mimeType: mimeType,
            },
        };

        const textPart = {
            text: `Given the reference image of a character, create a new scene described by the following prompt, maintaining the character's appearance. Prompt: "${prompt}"`,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [imagePart, textPart],
            },
        });
        
        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
        }

        throw new Error("Image generation with reference failed or returned no image data.");
    } catch (error) {
        console.error("Error in generateWithReference:", error);
        throw new Error("Failed to generate with reference. Please check your image, prompt, and API key.");
    }
};

export const editImage = async (prompt: string, imageFile: File, aspectRatio: string): Promise<string> => {
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
            text: `Your primary task is to regenerate the provided image into a new composition that strictly fits a ${aspectRatio} aspect ratio. The original aspect ratio MUST be completely discarded. After re-framing the image to ${aspectRatio}, apply the following edits based on the user's instructions: "${prompt}". The final output must be a single image with the new aspect ratio.`,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [imagePart, textPart],
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


export const createThumbnail = async (prompt: string, backgroundImage: File, foregroundImage: File, aspectRatio: string): Promise<string> => {
    const ai = getGenAI();
    try {
        const [backgroundBase64, foregroundBase64] = await Promise.all([
            fileToBase64(backgroundImage),
            fileToBase64(foregroundImage)
        ]);

        const backgroundPart = {
            inlineData: { data: backgroundBase64, mimeType: backgroundImage.type },
        };
        const foregroundPart = {
            inlineData: { data: foregroundBase64, mimeType: foregroundImage.type },
        };
        const textPart = {
            text: `Your primary task is to create a new composite image that strictly fits a ${aspectRatio} aspect ratio. The original aspect ratios of the input images MUST be completely discarded. To create this new image, use the first image as the background. Extract the person/main subject from the second image and seamlessly merge them into the background. The final composite image must be ultra-realistic, resembling a high-resolution photograph with natural lighting and textures. Pay attention to making the merged subject look natural in the new environment. Also, apply these additional user instructions: "${prompt}". The final output must be a single image with the new ${aspectRatio} aspect ratio.`,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [backgroundPart, foregroundPart, textPart],
            },
        });

        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
        }

        throw new Error("Thumbnail creation failed or returned no image data.");
    } catch (error) {
        console.error("Error in createThumbnail:", error);
        throw new Error("Failed to create thumbnail. Please check your images, prompt, and API key.");
    }
};

export const mergeImages = async (prompt: string, imageFiles: File[], aspectRatio: string): Promise<string> => {
    const ai = getGenAI();
    try {
        const imageParts = await Promise.all(
            imageFiles.map(async (file) => {
                const base64Image = await fileToBase64(file);
                return {
                    inlineData: {
                        data: base64Image,
                        mimeType: file.type,
                    },
                };
            })
        );
        
        const textPart = {
            text: `Your primary task is to create a single, new, cohesive image that strictly fits a ${aspectRatio} aspect ratio. The original aspect ratios of all input images MUST be completely discarded. To create this new image, merge elements from all the provided images into a new, ultra-realistic photographic scene. The composition, style, and subject matter should be guided by the user's prompt: "${prompt}". The final output must be a single image with the new ${aspectRatio} aspect ratio.`,
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [...imageParts, textPart],
            },
        });

        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    return part.inlineData.data;
                }
            }
        }

        throw new Error("Image merging failed or returned no image data.");
    } catch (error) {
        console.error("Error in mergeImages:", error);
        throw new Error("Failed to merge images. Please check your images, prompt, and API key.");
    }
};