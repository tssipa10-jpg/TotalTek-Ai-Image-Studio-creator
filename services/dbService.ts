import { GalleryImage } from '../types';

const DB_NAME = 'AIImageStudioDB';
const STORE_NAME = 'gallery';
const DB_VERSION = 1;

let db: IDBDatabase;

// Function to initialize the database
export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error("IndexedDB error:", request.error);
            reject("Error opening DB");
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const dbInstance = (event.target as IDBOpenDBRequest).result;
            if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };
    });
};

// Function to add an image to the store
export const addImageToGallery = (imageData: string): Promise<number> => {
    return new Promise(async (resolve, reject) => {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.add({ imageData });

        request.onsuccess = () => {
            resolve(request.result as number); // Returns the new key
        };

        request.onerror = () => {
            console.error('Error adding image:', request.error);
            reject('Could not add image to gallery.');
        };
    });
};

// Function to get all images from the store
export const getAllGalleryImages = (): Promise<GalleryImage[]> => {
    return new Promise(async (resolve, reject) => {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // IndexedDB returns newest last, we want newest first for the gallery view.
            resolve((request.result as GalleryImage[]).reverse());
        };
        
        request.onerror = () => {
            console.error('Error fetching images:', request.error);
            reject('Could not fetch images from gallery.');
        };
    });
};


// Function to delete an image from the store
export const deleteImageFromGallery = (id: number): Promise<void> => {
     return new Promise(async (resolve, reject) => {
        const db = await initDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);
        
        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
             console.error('Error deleting image:', request.error);
             reject('Could not delete image from gallery.');
        };
     });
};
