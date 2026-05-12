// @ts-nocheck
import React, { useState, useRef } from 'react';
import { Plus, X, Loader2, FileCheck, UploadCloud } from 'lucide-react';
import imageCompression from 'browser-image-compression';

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

export interface FileAttachment {
  url: string;
  name: string;
  path?: string;
}

interface FileUploadSlotProps {
  label: string;
  onUpload: (updater: FileAttachment[] | ((prev: FileAttachment[]) => FileAttachment[])) => void;
  values?: FileAttachment[];
  caseName?: string;
  storagePath?: string;
}

export default function FileUploadSlot({
  label,
  onUpload,
  values = [],
  caseName = 'بدون_اسم',
  storagePath = 'general/docs',
}: FileUploadSlotProps) {
  const [activeUploads, setActiveUploads] = useState<Record<string, { name: string; progress: number }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    for (const file of files) {
      let fileToUpload: File | Blob = file;

      if (file.type.startsWith('image/')) {
        try {
          fileToUpload = await imageCompression(file, {
            maxSizeMB: 0.8,
            maxWidthOrHeight: 1920,
            useWebWorker: true,
          });
        } catch (err) {
          console.error('Image compression failed, using original:', err);
        }
      }

      if ((fileToUpload as Blob).size > 20 * 1024 * 1024) {
        alert(`الملف ${file.name} كبير جداً (الحد الأقصى 20 ميجابايت)`);
        continue;
      }

      const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setActiveUploads(prev => ({ ...prev, [fileId]: { name: file.name, progress: 30 } }));

      try {
        const form = new FormData();
        form.append('file', fileToUpload, file.name);
        form.append('fileName', file.name);
        form.append('storagePath', storagePath);
        form.append('caseName', caseName);

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upload-image`, {
          method: 'POST',
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: form,
        });

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.url) {
          const errorMessage = result?.error || 'تعذر رفع الملف';
          console.error('Upload function error:', result || response.statusText);
          alert(`فشل رفع ${file.name}: ${errorMessage}`);
          setActiveUploads(prev => {
            const next = { ...prev };
            delete next[fileId];
            return next;
          });
          continue;
        }

        setActiveUploads(prev => ({ ...prev, [fileId]: { name: file.name, progress: 90 } }));

        onUpload((prev: FileAttachment[]) => [...prev, { url: result.url, name: file.name, path: result.path }]);

        setActiveUploads(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      } catch (err: any) {
        alert(`خطأ في الرفع: ${err.message}`);
        setActiveUploads(prev => {
          const next = { ...prev };
          delete next[fileId];
          return next;
        });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isUploading = Object.keys(activeUploads).length > 0;

  return (
    <div className={cn(
      "p-4 rounded-2xl border-2 border-dashed flex flex-col gap-2 transition-all min-h-[140px]",
      values.length > 0 || isUploading ? "bg-emerald-50 border-emerald-500 text-emerald-600" : "bg-stone-50 border-emerald-100 text-emerald-400"
    )}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-black">{label}</span>
        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1 hover:bg-emerald-100 rounded-lg">
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin text-emerald-500" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      <input type="file" className="hidden" ref={fileInputRef} onChange={handleFileChange} multiple accept="image/*,.pdf" />

      <div className="flex flex-col gap-2 mt-2">
        <div className="flex flex-wrap gap-2">
          {values.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-white border border-emerald-100 px-3 py-1 rounded-xl text-[10px] font-bold">
              <FileCheck className="w-3 h-3 text-emerald-500" />
              <a href={file.url} target="_blank" rel="noreferrer" className="truncate max-w-[100px] hover:underline">{file.name}</a>
              <button type="button" onClick={() => onUpload((prev: FileAttachment[]) => prev.filter((_, i) => i !== idx))} className="text-rose-500">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {Object.entries(activeUploads).map(([id, task]: [string, any]) => (
          <div key={id} className="space-y-1">
            <div className="flex justify-between text-[10px] font-bold">
              <span className="truncate max-w-[150px]">{task.name}</span>
              <span>{Math.round(task.progress)}%</span>
            </div>
            <div className="w-full bg-emerald-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full transition-all duration-300" style={{ width: `${task.progress}%` }} />
            </div>
          </div>
        ))}
      </div>

      {!isUploading && values.length === 0 && (
        <div className="flex-grow flex flex-col items-center justify-center text-stone-300 gap-1 opacity-50">
          <UploadCloud className="w-6 h-6" />
          <span className="text-[10px] font-bold">لم يتم رفع ملفات</span>
        </div>
      )}
    </div>
  );
}
