import { useState } from 'react';
import { Play } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { isYouTubeUrl, extractYouTubeVideoId, getYouTubeThumbnail, getYouTubeEmbedUrl } from '@/lib/youtube';

interface YouTubeThumbnailProps {
  url: string;
  alt?: string;
  className?: string;
  onClick?: () => void;
  showPlayButton?: boolean;
}

export function YouTubeThumbnail({ 
  url, 
  alt = 'Video thumbnail', 
  className = '',
  onClick,
  showPlayButton = true 
}: YouTubeThumbnailProps) {
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  
  const videoId = extractYouTubeVideoId(url);
  
  if (!videoId) {
    return null;
  }
  
  const thumbnailUrl = getYouTubeThumbnail(videoId, 'hq');
  const embedUrl = getYouTubeEmbedUrl(videoId);
  
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      setIsPlayerOpen(true);
    }
  };
  
  return (
    <>
      <div 
        className={`relative cursor-pointer group ${className}`}
        onClick={handleClick}
        data-testid="youtube-thumbnail"
      >
        <img 
          src={thumbnailUrl} 
          alt={alt}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.src = getYouTubeThumbnail(videoId, 'default');
          }}
        />
        {showPlayButton && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
              <Play className="w-6 h-6 sm:w-8 sm:h-8 text-white fill-white ml-1" />
            </div>
          </div>
        )}
      </div>
      
      <Dialog open={isPlayerOpen} onOpenChange={setIsPlayerOpen}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
          <div className="aspect-video w-full">
            <iframe
              src={embedUrl}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface MediaThumbnailProps {
  url: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  onClick?: () => void;
}

export function MediaThumbnail({ url, alt = 'Media', className = '', imgClassName = '', onClick }: MediaThumbnailProps) {
  const isVideo = isYouTubeUrl(url);
  
  if (isVideo) {
    return (
      <YouTubeThumbnail 
        url={url} 
        alt={alt} 
        className={className}
        onClick={onClick}
      />
    );
  }
  
  return (
    <img 
      src={url} 
      alt={alt}
      className={`${className} ${imgClassName}`}
      onClick={onClick}
    />
  );
}
