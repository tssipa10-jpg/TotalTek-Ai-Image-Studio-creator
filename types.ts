
export type AppMode = 'generate' | 'edit';

export interface AspectRatio {
  id: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  label: string;
  description: string;
}
