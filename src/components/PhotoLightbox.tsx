import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Download, ExternalLink, Image as ImageIcon } from 'lucide-react';

interface PhotoLightboxProps {
  photoUrl: string | null;
  caption?: string;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photoUrl, caption, onClose }) => {
  const [scale, setScale] = useState(1);
  const [imgError, setImgError] = useState(false);

  if (!photoUrl) return null;

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.3, 0.7));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-4"
      onClick={onClose}
    >
      {/* Top action bar */}
      <div
        className="flex items-center justify-between text-white py-2 px-4 max-w-5xl mx-auto w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs text-slate-300 font-medium truncate max-w-[60%]">
          {caption || 'Inspection Photo View'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <a
            href={photoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Open original"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition-colors ml-2"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 flex items-center justify-center overflow-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {imgError ? (
          <div className="flex flex-col items-center justify-center p-8 bg-slate-900 border border-slate-800 rounded-xl text-slate-400">
            <ImageIcon className="w-12 h-12 text-slate-600 mb-2" />
            <p className="text-sm font-medium">Failed to load high-resolution image</p>
            <a
              href={photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 text-xs text-emerald-400 underline"
            >
              Attempt direct open: {photoUrl}
            </a>
          </div>
        ) : (
          <img
            src={photoUrl}
            alt={caption || 'Inspection photo'}
            onError={() => setImgError(true)}
            style={{ transform: `scale(${scale})`, transition: 'transform 0.2s ease-out' }}
            className="max-h-[80vh] max-w-[90vw] object-contain rounded-md shadow-2xl select-none"
          />
        )}
      </div>

      {/* Footer Info */}
      {caption && (
        <div className="text-center py-2 text-xs text-slate-400 max-w-xl mx-auto">
          {caption}
        </div>
      )}
    </div>
  );
};
