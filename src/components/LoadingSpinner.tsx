import { Loader2 } from 'lucide-react';

export const LoadingSpinner = () => {
  return (
    <div className="w-screen h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-20 w-20">
          <img
            src="/ThothBlueprint-icon.svg"
            alt="ThothBlueprint Logo"
            className="absolute inset-0 m-auto h-12 w-12"
          />
          <Loader2 className="h-20 w-20 animate-spin text-primary" />
        </div>
        <p className="text-muted-foreground tracking-widest">LOADING</p>
      </div>
    </div>
  );
};