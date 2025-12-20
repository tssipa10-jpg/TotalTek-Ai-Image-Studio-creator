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
            <h1 className="text-2xl font-bold text-white">TotalTek AI Image Studio <span className="text-xs bg-purple-800 px-2 py-1 rounded text-purple-200 ml-2">Gemini Pro</span></h1>
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
    const [negativePrompt, setNegativePrompt] = useState<string>('');
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
    const [focusedImage, setFocusedImage] = useState<GalleryImage | null>(null);

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
            if (file.size > 6 * 1024 * 1024) { // 6MB limit
                setError('File size must be less than 6MB.');
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
            if (file.size > 6 * 1024 * 1024) { // 6MB limit
                setError(`File '${file.name}' is too large (max 6MB).`);
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

    const handleDownload = (imageUrl?: string) => {
        const urlToDownload = imageUrl || outputImage;
        if (urlToDownload) {
            const link = document.createElement('a');
            link.href = urlToDownload;
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

        // Updated prompt style for Gemini 3 models which are more capable
        const defaultStyle = "High quality, photorealistic, 8k resolution. ";

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
                    resultBase64 = await generateWithReference(styledPrompt, referenceImage, negativePrompt);
                } else {
                    resultBase64 = await generateImage(styledPrompt, aspectRatio, negativePrompt);
                }
            } else if (mode === 'edit') {
                if (!prompt || !inputImage?.file) {
                    setError("Please provide an image and a prompt for editing.");
                    setIsLoading(false);
                    return;
                }
                 const styledPrompt = defaultStyle + prompt;
                resultBase64 = await editImage(styledPrompt, inputImage.file, aspectRatio, negativePrompt);
            } else if (mode === 'merge') {
                if (!prompt || mergeImages.length < 2) {
                    setError("Please provide a prompt and at least 2 images to merge.");
                    setIsLoading(false);
                    return;
                }
                // Fix: Called the aliased `mergeImagesService` function instead of the state variable.
                resultBase64 = await mergeImagesService(prompt, mergeImages.map(img => img.file), aspectRatio, negativePrompt);
            } else { // 'thumbnail' mode
                if (!thumbnailBackground?.file || !thumbnailForeground?.file) {
                    setError("Please provide both a background and a foreground image for the thumbnail.");
                    setIsLoading(false);
                    return;
                }
                resultBase64 = await createThumbnail(prompt, thumbnailBackground.file, thumbnailForeground.file, aspectRatio, negativePrompt);
            }
            setOutputImage(`data:image/png;base64,${resultBase64}`);
        } catch (e) {
            console.error(e);
            setError(e instanceof Error ? e.message : "An unknown error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [mode, prompt, negativePrompt, aspectRatio, inputImage, referenceImage, thumbnailBackground, thumbnailForeground, mergeImages]);
    
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
            case 'generate': return 'Generate with Gemini';
            case 'edit': return 'Edit with Gemini';
            case 'merge': return 'Merge with Gemini';
            case 'thumbnail': return 'Create Thumbnail';
        }
    }

    return (
        <div className="min-h-screen bg-gray-900 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-[auto,1fr] gap-4">
            <Header />

            {/* Controls Panel */}
            <aside className="p-6 flex flex-col space-y-6 bg-gray-900 lg:border-r lg:border-gray-800">
                <ModeSwitcher mode={mode} setMode={setMode} />
                
                <div className='flex flex-col space-y-4'>
                    {/* Prompt Textarea */}
                    <div className="relative">
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={
                                mode === 'generate' ? "Describe the image you want to create..." :
                                mode === 'edit' ? "Describe the edits you want to make..." :
                                mode === 'merge' ? "Describe the final merged scene..." :
                                "Add text or describe adjustments for the thumbnail..."
                            }
                            className="w-full h-32 p-4 bg-gray-800 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors placeholder-gray-500 text-white resize-none"
                            aria-label="Prompt for AI image generation"
                        />
                         <button
                            onClick={handleEnhancePrompt}
                            disabled={isEnhancing || isLoading || !prompt}
                            className="absolute bottom-3 right-3 flex items-center space-x-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-1.5 px-3 rounded-md text-xs font-semibold hover:from-purple-500 hover:to-indigo-500 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                            title="Enhance prompt with more detail"
                        >
                            {isEnhancing ? <Spinner className="w-4 h-4" /> : <Icon path="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" className="w-4 h-4" />}
                            <span>Enhance</span>
                        </button>
                    </div>
                    {/* Negative Prompt Textarea */}
                     <div>
                        <label htmlFor="negative-prompt" className="block text-sm font-medium mb-2 text-gray-400">Negative Prompt (Optional)</label>
                        <textarea
                            id="negative-prompt"
                            value={negativePrompt}
                            onChange={(e) => setNegativePrompt(e.target.value)}
                            placeholder="Describe what you want to avoid in the image..."
                            className="w-full h-20 p-3 bg-gray-800 border-2 border-gray-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors placeholder-gray-500 text-white resize-none"
                            aria-label="Negative prompt to avoid elements in the image"
                        />
                    </div>
                </div>

                {/* Mode-specific Inputs */}
                {mode === 'generate' && (
                    <>
                    {referenceImage && (
                        <div className="bg-gray-800 p-3 rounded-lg border border-purple-500">
                            <p className="text-sm font-medium mb-2 text-purple-300">Using Reference Image:</p>
                            <div className="flex items-center space-x-3">
                                <img src={referenceImage} alt="Reference" className="w-16 h-16 rounded-md object-cover" />
                                <div className="flex-1">
                                    <p className="text-xs text-gray-400">The generated image will be based on the character in this image.</p>
                                    <button onClick={handleClearReference} className="text-xs text-red-400 hover:underline mt-1">Clear Reference</button>
                                </div>
                            </div>
                        </div>
                    )}
                    </>
                )}

                {mode === 'edit' && (
                    <div>
                        <label className="block text-sm font-medium mb-2 text-gray-300">Upload Image to Edit</label>
                         <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                {inputImage?.previewUrl ? (
                                    <img src={inputImage.previewUrl} alt="Preview" className="mx-auto h-24 w-auto rounded-lg object-contain"/>
                                ) : (
                                    <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" className="mx-auto h-12 w-12 text-gray-500"/>
                                )}
                                <div className="flex text-sm text-gray-500 justify-center">
                                <label htmlFor="edit-file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-purple-400 hover:text-purple-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 focus-within:ring-purple-500">
                                    <span>{inputImage ? 'Change file' : 'Upload a file'}</span>
                                    <input id="edit-file-upload" name="edit-file-upload" type="file" className="sr-only" onChange={handleEditFileChange} accept="image/png, image/jpeg, image/webp"/>
                                </label>
                                </div>
                                <p className="text-xs text-gray-600">PNG, JPG, WEBP up to 6MB</p>
                            </div>
                        </div>
                    </div>
                )}

                {mode === 'thumbnail' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-300">Background Image</label>
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md h-full">
                                <div className="space-y-1 text-center flex flex-col justify-center">
                                    {thumbnailBackground?.previewUrl ? (
                                        <img src={thumbnailBackground.previewUrl} alt="BG Preview" className="mx-auto h-16 w-auto rounded-lg object-contain"/>
                                    ) : (
                                        <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" className="mx-auto h-10 w-10 text-gray-500"/>
                                    )}
                                    <div className="flex text-sm text-gray-500 justify-center">
                                        <label htmlFor="thumb-bg-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-purple-400 hover:text-purple-300">
                                            <span>{thumbnailBackground ? 'Change' : 'Upload'}</span>
                                            <input id="thumb-bg-upload" type="file" className="sr-only" onChange={handleThumbnailBgChange} accept="image/png, image/jpeg, image/webp"/>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm font-medium mb-2 text-gray-300">Foreground Subject</label>
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md h-full">
                               <div className="space-y-1 text-center flex flex-col justify-center">
                                    {thumbnailForeground?.previewUrl ? (
                                        <img src={thumbnailForeground.previewUrl} alt="FG Preview" className="mx-auto h-16 w-auto rounded-lg object-contain"/>
                                    ) : (
                                        <Icon path="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" className="mx-auto h-10 w-10 text-gray-500"/>
                                    )}
                                    <div className="flex text-sm text-gray-500 justify-center">
                                        <label htmlFor="thumb-fg-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-purple-400 hover:text-purple-300">
                                            <span>{thumbnailForeground ? 'Change' : 'Upload'}</span>
                                            <input id="thumb-fg-upload" type="file" className="sr-only" onChange={handleThumbnailFgChange} accept="image/png, image/jpeg, image/webp"/>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                {mode === 'merge' && (
                    <div>
                        <label className="block text-sm font-medium mb-2 text-gray-300">Upload Images to Merge (2-6)</label>
                        <div className="grid grid-cols-3 gap-3">
                            {mergeImages.map((img) => (
                                <div key={img.id} className="relative group">
                                    <img src={img.previewUrl} alt="Merge preview" className="w-full h-24 object-cover rounded-md" />
                                    <button
                                        onClick={() => handleRemoveMergeImage(img.id)}
                                        className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                        aria-label="Remove image"
                                    >
                                        <Icon path="M6 18L18 6M6 6l12 12" className="w-3 h-3"/>
                                    </button>
                                </div>
                            ))}
                            {mergeImages.length < 6 && (
                                <label htmlFor="merge-file-upload" className="flex items-center justify-center w-full h-24 border-2 border-gray-600 border-dashed rounded-md cursor-pointer hover:border-purple-500 transition-colors">
                                    <div className="text-center">
                                        <Icon path="M12 4.5v15m7.5-7.5h-15" className="mx-auto h-8 w-8 text-gray-500"/>
                                        <span className="mt-2 block text-xs font-medium text-gray-400">Add Image(s)</span>
                                        <input id="merge-file-upload" type="file" className="sr-only" multiple onChange={handleMergeFilesChange} accept="image/png, image/jpeg, image/webp"/>
                                    </div>
                                </label>
                            )}
                        </div>
                    </div>
                )}


                {/* Aspect Ratio Selector */}
                <div>
                    <label className="block text-sm font-medium mb-2 text-gray-300">Aspect Ratio</label>
                    <div className="grid grid-cols-5 gap-2">
                        {ASPECT_RATIOS.map((ratio) => (
                            <button
                                key={ratio.id}
                                onClick={() => setAspectRatio(ratio.id)}
                                className={`p-2 border-2 rounded-lg text-center transition-colors ${aspectRatio === ratio.id ? 'bg-purple-600 border-purple-500' : 'bg-gray-800 border-gray-700 hover:border-purple-600'}`}
                                title={ratio.description}
                            >
                                <span className="block font-semibold text-sm">{ratio.label}</span>
                                <span className="block text-xs text-gray-400">{ratio.description}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Submit Button */}
                <div className="pt-4 border-t border-gray-800">
                     <button
                        onClick={handleSubmit}
                        disabled={isSubmitDisabled}
                        className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl hover:from-purple-500 hover:to-indigo-500 font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center space-x-3"
                    >
                        {isLoading && <Spinner />}
                        <span>{isLoading ? 'Processing...' : getButtonText()}</span>
                    </button>
                    {error && <p className="text-red-400 text-sm mt-3 text-center">{error}</p>}
                </div>
            </aside>

            {/* Output Panel */}
            <main className="p-6 bg-gray-800/50 rounded-lg flex flex-col">
                <div className="flex border-b border-gray-700 mb-4">
                    <button onClick={() => setActiveTab('result')} className={`py-2 px-4 text-sm font-medium ${activeTab === 'result' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400'}`}>Result</button>
                    <button onClick={() => setActiveTab('gallery')} className={`py-2 px-4 text-sm font-medium ${activeTab === 'gallery' ? 'border-b-2 border-purple-500 text-white' : 'text-gray-400'}`}>Gallery</button>
                </div>
                
                <div className="flex-grow flex items-center justify-center">
                    {activeTab === 'result' && (
                        <div className="w-full h-full flex flex-col items-center justify-center text-center">
                            {isLoading && (
                                <div className="flex flex-col items-center">
                                    <Spinner className="w-10 h-10 border-4 mb-4" />
                                    <p className="text-lg font-medium text-gray-300">Generating your masterpiece...</p>
                                    <p className="text-sm text-gray-500">This may take a moment.</p>
                                </div>
                            )}
                            {!isLoading && outputImage && (
                                <>
                                    <img src={outputImage} alt="Generated output" className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-2xl" />
                                    <div className="mt-6 flex space-x-4">
                                        <button onClick={() => handleDownload()} className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                            <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-5 h-5"/>
                                            <span>Download</span>
                                        </button>
                                         <button onClick={handleSaveToGallery} className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                            <Icon path="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" className="w-5 h-5"/>
                                            <span>Save to Gallery</span>
                                        </button>
                                    </div>
                                </>
                            )}
                             {!isLoading && !outputImage && (
                                <div className="text-center text-gray-500">
                                    <Icon path="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" className="mx-auto h-20 w-20 opacity-50"/>
                                    <p className="mt-4 text-lg">Your generated image will appear here.</p>
                                    <p className="text-sm">Let your creativity flow!</p>
                                </div>
                            )}
                        </div>
                    )}
                    {activeTab === 'gallery' && (
                        <div className="w-full h-full">
                            {galleryImages.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto max-h-[80vh] p-1">
                                    {galleryImages.map(image => (
                                        <div key={image.id} className="relative group aspect-square">
                                            <img
                                                src={image.imageData}
                                                alt="Gallery item"
                                                className="w-full h-full object-cover rounded-lg shadow-md cursor-pointer transition-transform group-hover:scale-105"
                                                onClick={() => setFocusedImage(image)}
                                            />
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation(); // Prevent modal from opening
                                                    if (image.id) handleDeleteFromGallery(image.id);
                                                }}
                                                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-red-600/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Delete image"
                                            >
                                                <Icon path="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center text-gray-500">
                                    <Icon path="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" className="mx-auto h-20 w-20 opacity-50"/>
                                    <p className="mt-4 text-lg">Your gallery is empty.</p>
                                    <p className="text-sm">Saved images will appear here.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Focused Image Viewer Modal */}
            {focusedImage && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
                    onClick={() => setFocusedImage(null)} // Close on backdrop click
                >
                    <div
                        className="relative bg-gray-800 border border-gray-700 p-6 rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
                    >
                        <div className="flex-grow flex items-center justify-center overflow-hidden">
                            <img
                                src={focusedImage.imageData}
                                alt="Focused gallery item"
                                className="w-auto h-auto max-w-full max-h-full object-contain rounded-md"
                            />
                        </div>
                        
                        <div className="mt-6 pt-4 border-t border-gray-700 flex flex-wrap justify-center gap-4">
                            <button
                                onClick={() => handleDownload(focusedImage.imageData)}
                                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                            >
                               <Icon path="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" className="w-5 h-5"/>
                               <span>Download</span>
                            </button>
                             <button onClick={() => { handleSetReference(focusedImage.imageData); setFocusedImage(null); }} className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                <Icon path="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.324l5.584.532a.562.562 0 01.314.953l-4.218 3.902a.563.563 0 00-.162.524l1.28 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 21.54a.562.562 0 01-.84-.61l1.28-5.385a.563.563 0 00-.162-.524l-4.218-3.902a.562.562 0 01.314-.953l5.584-.532a.563.563 0 00.475-.324L11.48 3.5z" className="w-5 h-5"/>
                                <span>Use as Reference</span>
                            </button>
                            <button onClick={() => { handleUseFromGalleryForEdit(focusedImage.imageData); setFocusedImage(null); }} className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                                <Icon path="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" className="w-5 h-5"/>
                                <span>Use for Editing</span>
                            </button>
                        </div>

                        <button
                            onClick={() => setFocusedImage(null)}
                            className="absolute top-3 right-3 p-2 bg-black/40 rounded-full text-white hover:bg-gray-700 transition-colors"
                            aria-label="Close"
                        >
                            <Icon path="M6 18L18 6M6 6l12 12" className="w-5 h-5"/>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}