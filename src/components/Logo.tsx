import React from 'react';
import { Heart, Fingerprint } from 'lucide-react';

export default function Logo({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center ${className}`}>
      <img 
        src="https://i.ibb.co/L6V2yq9/logo.png" 
        alt="بصمة خير" 
        className="w-full h-full object-contain filter drop-shadow-md"
        onError={(e) => {
          // Fallback if the link expires or fails
          (e.target as HTMLImageElement).src = 'https://cdn-icons-png.flaticon.com/512/2513/2513076.png';
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
