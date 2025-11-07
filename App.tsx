import React, { useState, useCallback, useEffect } from 'react';
import { AppMode, AspectRatio } from './types';
import { ASPECT_RATIOS } from './constants';
import { generateImage, editImage, enhancePrompt } from './services/geminiService';
import { Icon } from './components/Icon';
import { Spinner } from './components/Spinner';

// -- Helper Components defined outside App to prevent re-creation on re-renders --

const Header: React.FC = () => (
    <header className="p-4 border-b border-gray-700 col-span-1 lg:col-span-2">
        <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-600 rounded-lg">
                <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.648l.21-1.049a3.375 3.375 0 00-2.456-2.456l-1.049-.21-.21 1.049a3.375 3.375 0 002.456 2.456l1.049.21z" className="w-6 h-6 text-white"/>
            </div>
            <h1 className="text-2xl font-bold text-white">AI Image Studio</h1>
        </div>
    </header>
);

interface ModeSwitcherProps {
    mode: AppMode;
    setMode: (mode: AppMode) => void;
}
const ModeSwitcher: React.FC<ModeSwitcherProps> = ({ mode, setMode }) => (
    <div className="flex bg-gray-800 rounded-lg p-1">
        <button onClick={() => setMode('generate')} className={`w-1/2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${mode === 'generate' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Generate</button>
        <button onClick={() => setMode('edit')} className={`w-1/2 py-2 px-4 rounded-md text-sm font-medium transition-colors ${mode === 'edit' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Edit</button>
    </div>
);

// -- Main App Component --

export default function App() {
    const [mode, setMode] = useState<AppMode>('generate');
    const [prompt, setPrompt] = useState<string>('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio['id']>(ASPECT_RATIOS[0].id);
    const [inputImage, setInputImage] = useState<{ file: File; previewUrl: string } | null>(null);
    const [outputImage, setOutputImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Cleanup object URL to prevent memory leaks
        return () => {
            if (inputImage) {
                URL.revokeObjectURL(inputImage.previewUrl);
            }
        };
    }, [inputImage]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.size > 4 * 1024 * 1024) { // 4MB limit
                setError('File size must be less than 4MB.');
                return;
            }
            if (inputImage) {
                 URL.revokeObjectURL(inputImage.previewUrl);
            }
            setError(null);
            setInputImage({
                file,
                previewUrl: URL.createObjectURL(file),
            });
        }
    };

    const handleDownload = () => {
        if (outputImage) {
            const link = document.createElement('a');
            link.href = outputImage;
            link.download = `ai_image_${new Date().getTime()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };
    
    const handleEnhancePrompt = useCallback(async () => {
        if (!prompt || isEnhancing || isLoading) return;

        setIsEnhancing(true);
        setError(null);
        try {
            const enhancedPrompt = await enhancePrompt(prompt);
            setPrompt(enhancedPrompt);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to enhance prompt.");
        } finally {
            setIsEnhancing(false);
        }
    }, [prompt, isEnhancing, isLoading]);

    const handleSubmit = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setOutputImage(null);

        try {
            let resultBase64: string;
            if (mode === 'generate') {
                if (!prompt) {
                    setError("Please enter a prompt for image generation.");
                    setIsLoading(false);
                    return;
                }
                resultBase64 = await generateImage(prompt, aspectRatio);
            } else { // 'edit' mode
                if (!prompt || !inputImage?.file) {
                    setError("Please provide an image and a prompt for editing.");
                    setIsLoading(false);
                    return;
                }
                resultBase64 = await editImage(prompt, inputImage.file);
            }
            setOutputImage(`data:image/png;base64,${resultBase64}`);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    }, [mode, prompt, aspectRatio, inputImage]);
    
    const isSubmitDisabled = isLoading || isEnhancing || (mode === 'generate' && !prompt) || (mode === 'edit' && (!prompt || !inputImage));

    return (
        <div className="min-h-screen bg-gray-900 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto,1fr] gap-4">
            <Header />

            {/* Controls Panel */}
            <aside className="p-6 flex flex-col space-y-6 bg-gray-900 lg:border-r lg:border-gray-800">
                <ModeSwitcher mode={mode} setMode={(newMode) => { setMode(newMode); setError(null); }} />

                {/* Prompt Input */}
                <div className="flex-grow flex flex-col space-y-2">
                    <div className="flex justify-between items-center">
                        <label htmlFor="prompt" className="text-sm font-medium text-gray-300">Your Prompt</label>
                        <button 
                            onClick={handleEnhancePrompt}
                            disabled={!prompt || isEnhancing || isLoading}
                            className="flex items-center space-x-1.5 py-1 px-2 rounded-md bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800/50 text-xs text-purple-400 hover:text-purple-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors"
                            title="Enhance your prompt for better results"
                        >
                            {isEnhancing ? <Spinner className="w-4 h-4 border-purple-400" /> : <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-4 h-4" />}
                            <span>Enhance</span>
                        </button>
                    </div>
                    <textarea
                        id="prompt"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={mode === 'generate' ? "e.g., A cinematic shot of a raccoon astronaut on Mars" : "e.g., Add a retro filter and a flying saucer in the sky"}
                        className="w-full h-32 p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    />
                </div>

                {/* Mode-specific controls */}
                <div className="flex-grow">
                    {mode === 'generate' ? (
                        <div>
                            <h3 className="text-sm font-medium text-gray-300 mb-2">Aspect Ratio</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {ASPECT_RATIOS.map((ratio) => (
                                    <button
                                        key={ratio.id}
                                        onClick={() => setAspectRatio(ratio.id)}
                                        className={`p-3 text-left rounded-lg transition-colors border-2 ${aspectRatio === ratio.id ? 'bg-purple-600/20 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-gray-500'}`}
                                    >
                                        <p className="font-semibold text-white">{ratio.label}</p>
                                        <p className="text-xs text-gray-400">{ratio.description}</p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <h3 className="text-sm font-medium text-gray-300 mb-2">Upload Image</h3>
                            <label htmlFor="image-upload" className="w-full p-6 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-800 hover:border-gray-500 transition-colors">
                                {inputImage ? (
                                    <img src={inputImage.previewUrl} alt="Upload preview" className="max-h-32 rounded-md object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" className="mx-auto h-10 w-10 text-gray-500" />
                                        <p className="mt-2 text-sm text-gray-400">Click to upload or drag & drop</p>
                                        <p className="text-xs text-gray-500">PNG, JPG, WEBP (Max 4MB)</p>
                                    </div>
                                )}
                            </label>
                            <input id="image-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleFileChange} />
                        </div>
                    )}
                </div>

                {error && <p className="text-sm text-red-400 bg-red-900/50 p-3 rounded-lg">{error}</p>}
                
                <button
                    onClick={handleSubmit}
                    disabled={isSubmitDisabled}
                    className="w-full flex items-center justify-center py-3 px-4 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all duration-300 ease-in-out"
                >
                    {isLoading ? <Spinner /> : <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-5 h-5 mr-2" />}
                    {mode === 'generate' ? 'Generate' : 'Edit Image'}
                </button>
            </aside>
            
            {/* Image Display Panel */}
            <main className="p-6 flex flex-col items-center justify-center bg-black/20 lg:bg-gray-900 relative">
                <div className="w-full h-full min-h-[40vh] lg:min-h-0 flex flex-col items-center justify-center bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700 relative overflow-hidden">
                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10">
                            <Spinner className="w-12 h-12" />
                            <p className="mt-4 text-lg text-gray-300">Conjuring pixels...</p>
                        </div>
                    )}
                    {outputImage ? (
                        <img src={outputImage} alt="Generated result" className="w-full h-full object-contain" />
                    ) : (
                        <div className="text-center text-gray-500">
                             <Icon path="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" className="mx-auto h-12 w-12"/>
                            <p className="mt-4 font-semibold">Your image will appear here</p>
                            <p className="text-sm">Enter a prompt and click generate to start</p>
                        </div>
                    )}
                </div>
                 {outputImage && !isLoading && (
                    <button onClick={handleDownload} className="absolute top-8 right-8 flex items-center py-2 px-4 bg-gray-800 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-700 transition-colors">
                        <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-5 h-5 mr-2" />
                        Download
                    </button>
                )}
            </main>
        </div>
    );
}