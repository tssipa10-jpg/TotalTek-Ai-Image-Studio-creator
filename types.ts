
export type AppMode = 'generate' | 'edit' | 'thumbnail';
export type ActiveTab = 'result' | 'gallery';

export interface AspectRatio {
  id: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  label: string;
  description: string;
}