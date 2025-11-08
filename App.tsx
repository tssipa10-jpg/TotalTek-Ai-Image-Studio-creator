import React, { useState, useCallback, useEffect } from 'react';
import { AppMode, AspectRatio, ActiveTab, GalleryImage } from './types';
import { ASPECT_RATIOS } from './constants';
// Fix: Aliased the imported `mergeImages` function to `mergeImagesService` to avoid a name collision with the state variable.
import { generateImage, editImage, enhancePrompt, generateWithReference, createThumbnail, mergeImages as mergeImagesService } from './services/geminiService';
import { initDB, getAllGalleryImages, addImageToGallery, deleteImageFromGallery } from './services/dbService';
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
        <button onClick={() => setMode('generate')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'generate' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Generate</button>
        <button onClick={() => setMode('edit')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'edit' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Edit</button>
        <button onClick={() => setMode('merge')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'merge' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Merge</button>
        <button onClick={() => setMode('thumbnail')} className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${mode === 'thumbnail' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}>Thumbnail</button>
    </div>
);

// Helper function to convert a data URL to a File object
async function dataUrlToFile(dataUrl: string, fileName: string): Promise<File> {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], fileName, { type: blob.type });
}

// -- Main App Component --

export default function App() {
    const [mode, setMode] = useState<AppMode>('generate');
    const [activeTab, setActiveTab] = useState<ActiveTab>('result');
    const [prompt, setPrompt] = useState<string>('');
    const [aspectRatio, setAspectRatio] = useState<AspectRatio['id']>(ASPECT_RATIOS[0].id);
    const [inputImage, setInputImage] = useState<{ file: File; previewUrl: string } | null>(null);
    const [thumbnailBackground, setThumbnailBackground] = useState<{ file: File; previewUrl: string } | null>(null);
    const [thumbnailForeground, setThumbnailForeground] = useState<{ file: File; previewUrl: string } | null>(null);
    const [mergeImages, setMergeImages] = useState<{ file: File; previewUrl: string; id: number }[]>([]);
    const [outputImage, setOutputImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [galleryImages, setGalleryImages] = useState<GalleryImage[]>([]);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);

    // Load gallery from IndexedDB on initial render
    useEffect(() => {
        const loadGallery = async () => {
            try {
                await initDB();
                const images = await getAllGalleryImages();
                setGalleryImages(images);
            } catch (e) {
                console.error("Failed to load gallery from IndexedDB:", e);
                setError("Could not load the image gallery.");
            }
        };
        loadGallery();
    }, []);
    
    useEffect(() => {
        // Cleanup object URLs to prevent memory leaks
        return () => {
            if (inputImage?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(inputImage.previewUrl);
            if (thumbnailBackground?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailBackground.previewUrl);
            if (thumbnailForeground?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(thumbnailForeground.previewUrl);
            mergeImages.forEach(img => {
                if (img.previewUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(img.previewUrl);
                }
            });
        };
    }, [inputImage, thumbnailBackground, thumbnailForeground, mergeImages]);

    const createInputFileHandler = (
        setter: React.Dispatch<React.SetStateAction<{ file: File; previewUrl: string; } | null>>,
        currentImage: { file: File; previewUrl: string; } | null
    ) => (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            if (file.size > 4 * 1024 * 1024) { // 4MB limit
                setError('File size must be less than 4MB.');
                return;
            }
            if (currentImage?.previewUrl.startsWith('blob:')) {
                 URL.revokeObjectURL(currentImage.previewUrl);
            }
            setError(null);
            setter({
                file,
                previewUrl: URL.createObjectURL(file),
            });
        }
    };

    const handleEditFileChange = createInputFileHandler(setInputImage, inputImage);
    const handleThumbnailBgChange = createInputFileHandler(setThumbnailBackground, thumbnailBackground);
    const handleThumbnailFgChange = createInputFileHandler(setThumbnailForeground, thumbnailForeground);

    const handleMergeFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files) return;

        setError(null);

        const currentImageCount = mergeImages.length;
        const availableSlots = 6 - currentImageCount;

        if (files.length > availableSlots) {
            setError(`You can only add ${availableSlots} more image(s).`);
        }

        const newImages: { file: File; previewUrl: string; id: number }[] = [];
        for (let i = 0; i < Math.min(files.length, availableSlots); i++) {
            const file = files[i];
            if (file.size > 4 * 1024 * 1024) { // 4MB limit
                setError(`File '${file.name}' is too large (max 4MB).`);
                continue; // Skip this file
            }
            newImages.push({
                file,
                previewUrl: URL.createObjectURL(file),
                id: Date.now() + Math.random(), // Unique ID
            });
        }

        setMergeImages(prev => [...prev, ...newImages]);
    };

    const handleRemoveMergeImage = (idToRemove: number) => {
        setMergeImages(prev => {
            const imageToRemove = prev.find(img => img.id === idToRemove);
            if (imageToRemove?.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(imageToRemove.previewUrl);
            }
            return prev.filter(img => img.id !== idToRemove);
        });
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
        setActiveTab('result');

        const defaultStyle = "An ultra-realistic image, like a high-resolution photo with a completely natural human texture of a real person. The entire image, including the environment and background, should have the same ultra-realistic, photographic characteristics. ";

        try {
            let resultBase64: string;
            if (mode === 'generate') {
                if (!prompt) {
                    setError("Please enter a prompt for image generation.");
                    setIsLoading(false);
                    return;
                }
                const styledPrompt = defaultStyle + prompt;
                if (referenceImage) {
                    resultBase64 = await generateWithReference(styledPrompt, referenceImage);
                } else {
                    resultBase64 = await generateImage(styledPrompt, aspectRatio);
                }
            } else if (mode === 'edit') {
                if (!prompt || !inputImage?.file) {
                    setError("Please provide an image and a prompt for editing.");
                    setIsLoading(false);
                    return;
                }
                 const styledPrompt = defaultStyle + prompt;
                resultBase64 = await editImage(styledPrompt, inputImage.file);
            } else if (mode === 'merge') {
                if (!prompt || mergeImages.length < 2) {
                    setError("Please provide a prompt and at least 2 images to merge.");
                    setIsLoading(false);
                    return;
                }
                // Fix: Called the aliased `mergeImagesService` function instead of the state variable.
                resultBase64 = await mergeImagesService(prompt, mergeImages.map(img => img.file));
            } else { // 'thumbnail' mode
                if (!thumbnailBackground?.file || !thumbnailForeground?.file) {
                    setError("Please provide both a background and a foreground image for the thumbnail.");
                    setIsLoading(false);
                    return;
                }
                resultBase64 = await createThumbnail(prompt, thumbnailBackground.file, thumbnailForeground.file);
            }
            setOutputImage(`data:image/png;base64,${resultBase64}`);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    }, [mode, prompt, aspectRatio, inputImage, referenceImage, thumbnailBackground, thumbnailForeground, mergeImages]);
    
    const handleSaveToGallery = useCallback(async () => {
        if (outputImage) {
            // Prevent duplicates by checking against existing image data
            if (galleryImages.some(img => img.imageData === outputImage)) {
                return;
            }
            try {
                const newId = await addImageToGallery(outputImage);
                // Optimistically update UI by adding to the top of the list
                setGalleryImages(prev => [{ id: newId, imageData: outputImage }, ...prev]);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to save image to gallery.");
            }
        }
    }, [outputImage, galleryImages]);


    const handleSetReference = useCallback((imageUrl: string) => {
        setReferenceImage(imageUrl);
        setMode('generate');
        setActiveTab('result');
    }, []);
    
    const handleClearReference = () => setReferenceImage(null);

    const handleDeleteFromGallery = async (idToDelete: number) => {
        if (!idToDelete) return;
        try {
            await deleteImageFromGallery(idToDelete);
            setGalleryImages(prev => prev.filter(img => img.id !== idToDelete));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to delete image from gallery.");
        }
    };

    const handleUseFromGalleryForEdit = useCallback(async (imageUrl: string) => {
        try {
            const file = await dataUrlToFile(imageUrl, `gallery_image_${Date.now()}.png`);
            if (inputImage?.previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(inputImage.previewUrl);
            }
            setMode('edit');
            setInputImage({
                file,
                previewUrl: imageUrl,
            });
            setActiveTab('result');
            setError(null);
        } catch (e) {
            setError("Failed to load image from gallery for editing.");
            console.error(e);
        }
    }, [inputImage]);

    const isSubmitDisabled = isLoading || isEnhancing || (mode === 'generate' && !prompt) || (mode === 'edit' && (!prompt || !inputImage)) || (mode === 'merge' && (!prompt || mergeImages.length < 2)) || (mode === 'thumbnail' && (!thumbnailBackground || !thumbnailForeground));
    
    const getButtonText = () => {
        switch (mode) {
            case 'generate': return 'Generate';
            case 'edit': return 'Edit Image';
            case 'merge': return 'Merge Images';
            case 'thumbnail': return 'Create Thumbnail';
        }
    }

    return (
        <div className="min-h-screen bg-gray-900 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto,1fr] gap-4">
            <Header />

            {/* Controls Panel */}
            <aside className="p-6 flex flex-col space-y-6 bg-gray-900 lg:border-r lg:border-gray-800">
                <ModeSwitcher mode={mode} setMode={(newMode) => { setMode(newMode); setError(null); }} />
                
                {referenceImage && mode === 'generate' && (
                    <div className="p-3 bg-gray-800 rounded-lg border border-purple-500/50">
                        <h3 className="text-sm font-medium text-gray-300 mb-2">Character Consistency Active</h3>
                        <div className="flex items-center space-x-3">
                            <img src={referenceImage} alt="Character reference" className="w-16 h-16 rounded-md object-cover" />
                            <div className="flex-grow">
                                <p className="text-xs text-gray-400">New images will be generated based on this character.</p>
                                <button onClick={handleClearReference} className="text-xs text-red-400 hover:text-red-300 font-semibold mt-1">
                                    Clear Reference
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Prompt Input */}
                <div className="flex flex-col space-y-2">
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
                        placeholder={
                            mode === 'generate' ? "e.g., A cinematic shot of a raccoon astronaut on Mars" : 
                            mode === 'edit' ? "e.g., Add a retro filter and a flying saucer in the sky" :
                            mode === 'merge' ? "e.g., A fantasy landscape with the character from image 1 and the castle from image 2" :
                            "e.g., Make the person look surprised, add vibrant text"
                        }
                        className="w-full h-24 p-3 bg-gray-800 border border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                    />
                </div>

                {/* Mode-specific controls */}
                <div className="flex-grow space-y-4">
                    {mode === 'generate' && !referenceImage && (
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
                    )}
                    {mode === 'edit' && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-300 mb-2">Upload Image</h3>
                            <label htmlFor="image-upload" className="w-full p-4 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-800 hover:border-gray-500 transition-colors">
                                {inputImage ? (
                                    <img src={inputImage.previewUrl} alt="Upload preview" className="max-h-24 rounded-md object-contain" />
                                ) : (
                                    <div className="text-center">
                                        <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" className="mx-auto h-8 w-8 text-gray-500" />
                                        <p className="mt-2 text-xs text-gray-400">Click to upload or drag & drop</p>
                                        <p className="text-xs text-gray-500">PNG, JPG, WEBP (Max 4MB)</p>
                                    </div>
                                )}
                            </label>
                            <input id="image-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleEditFileChange} />
                        </div>
                    )}
                    {mode === 'merge' && (
                        <div>
                            <h3 className="text-sm font-medium text-gray-300 mb-2">Upload Images (2-6 required)</h3>
                            <div className="grid grid-cols-3 gap-2">
                                {mergeImages.map((image) => (
                                    <div key={image.id} className="relative group aspect-square">
                                        <img src={image.previewUrl} alt="Merge preview" className="w-full h-full object-cover rounded-md" />
                                        <button
                                            onClick={() => handleRemoveMergeImage(image.id)}
                                            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                            aria-label="Remove image"
                                        >
                                            <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                {mergeImages.length < 6 && (
                                    <label htmlFor="merge-upload" className="w-full aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-800 hover:border-gray-500 transition-colors">
                                        <Icon path="M12 4.5v15m7.5-7.5h-15" className="h-8 w-8 text-gray-500" />
                                        <p className="mt-1 text-xs text-gray-400">Add Image</p>
                                    </label>
                                )}
                            </div>
                            <input id="merge-upload" type="file" multiple className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleMergeFilesChange} disabled={mergeImages.length >= 6} />
                        </div>
                    )}
                    {mode === 'thumbnail' && (
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <h3 className="text-sm font-medium text-gray-300 mb-2">Background Image</h3>
                                <label htmlFor="thumb-bg-upload" className="w-full p-2 h-32 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-800 hover:border-gray-500 transition-colors">
                                    {thumbnailBackground ? (
                                        <img src={thumbnailBackground.previewUrl} alt="Background preview" className="max-h-28 rounded-md object-contain" />
                                    ) : (
                                        <div className="text-center">
                                            <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" className="mx-auto h-8 w-8 text-gray-500" />
                                            <p className="mt-1 text-xs text-gray-400">Upload</p>
                                        </div>
                                    )}
                                </label>
                                <input id="thumb-bg-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleThumbnailBgChange} />
                            </div>
                            <div>
                                <h3 className="text-sm font-medium text-gray-300 mb-2">Foreground Image</h3>
                                <label htmlFor="thumb-fg-upload" className="w-full p-2 h-32 flex flex-col items-center justify-center border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:bg-gray-800 hover:border-gray-500 transition-colors">
                                    {thumbnailForeground ? (
                                        <img src={thumbnailForeground.previewUrl} alt="Foreground preview" className="max-h-28 rounded-md object-contain" />
                                    ) : (
                                        <div className="text-center">
                                            <Icon path="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" className="mx-auto h-8 w-8 text-gray-500" />
                                            <p className="mt-1 text-xs text-gray-400">Upload Person/Object</p>
                                        </div>
                                    )}
                                </label>
                                <input id="thumb-fg-upload" type="file" className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleThumbnailFgChange} />
                            </div>
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
                    {getButtonText()}
                </button>
            </aside>
            
            {/* Display Panel with Tabs */}
            <main className="p-6 flex flex-col bg-black/20 lg:bg-gray-900">
                 <div className="flex border-b border-gray-700 mb-4">
                    <button onClick={() => setActiveTab('result')} className={`py-2 px-4 text-sm font-medium transition-colors ${activeTab === 'result' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                        Result
                    </button>
                    <button onClick={() => setActiveTab('gallery')} className={`py-2 px-4 text-sm font-medium transition-colors ${activeTab === 'gallery' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400 hover:text-white'}`}>
                        Gallery ({galleryImages.length})
                    </button>
                </div>

                {/* Result Tab */}
                {activeTab === 'result' && (
                    <div className="flex-grow flex flex-col">
                        <div className="w-full flex-grow min-h-[40vh] lg:min-h-0 flex flex-col items-center justify-center bg-gray-800/50 rounded-lg border-2 border-dashed border-gray-700 relative overflow-hidden">
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
                            <div className="flex items-center justify-center space-x-2 sm:space-x-4 mt-4">
                                <button onClick={handleDownload} className="flex items-center py-2 px-4 bg-gray-800 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-700 transition-colors text-sm">
                                    <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-5 h-5 mr-2" />
                                    Download
                                </button>
                                <button onClick={handleSaveToGallery} className="flex items-center py-2 px-4 bg-gray-800 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-700 transition-colors text-sm">
                                    <Icon path="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.321l5.584.532a.562.562 0 01.314.953l-4.118 3.994a.563.563 0 00-.163.582l1.04 5.549a.562.562 0 01-.82.624l-4.99-2.733a.563.563 0 00-.54 0l-4.99 2.733a.562.562 0 01-.82-.624l1.04-5.549a.563.563 0 00-.163-.582l-4.118-3.994a.562.562 0 01.314-.953l5.584-.532a.563.563 0 00.475-.321L11.48 3.5z" className="w-5 h-5 mr-2" />
                                    Save to Gallery
                                </button>
                                <button onClick={() => handleSetReference(outputImage)} className="flex items-center py-2 px-4 bg-gray-800 text-white font-semibold rounded-lg shadow-lg hover:bg-gray-700 transition-colors text-sm">
                                    <Icon path="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" className="w-5 h-5 mr-2" />
                                    Use for Character
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Gallery Tab */}
                {activeTab === 'gallery' && (
                    <div className="flex-grow overflow-y-auto">
                        {galleryImages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                                <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" className="h-12 w-12 mb-4" />
                                <h3 className="text-lg font-semibold">Your Gallery is Empty</h3>
                                <p className="text-sm">Generated images that you save will appear here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {galleryImages.map((image) => (
                                    <div key={image.id} className="group relative rounded-lg overflow-hidden aspect-square">
                                        <img src={image.imageData} alt={`Gallery image ${image.id}`} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 space-y-2">
                                            <button onClick={() => handleUseFromGalleryForEdit(image.imageData)} className="flex items-center text-xs py-1.5 px-3 bg-gray-200 text-gray-900 rounded-full hover:bg-white w-full justify-center">
                                                <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" className="w-4 h-4 mr-1.5" /> Edit
                                            </button>
                                            <button onClick={() => handleSetReference(image.imageData)} className="flex items-center text-xs py-1.5 px-3 bg-gray-200 text-gray-900 rounded-full hover:bg-white w-full justify-center">
                                                 <Icon path="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" className="w-4 h-4 mr-1.5" /> Character
                                            </button>
                                             <button onClick={() => handleDeleteFromGallery(image.id!)} className="flex items-center text-xs py-1.5 px-3 bg-red-600 text-white rounded-full hover:bg-red-500 w-full justify-center">
                                                <Icon path="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12.548 0A48.108 48.108 0 016.25 5.392m7.5 0a48.667 48.667 0 00-7.5 0" className="w-4 h-4 mr-1.5" /> Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}