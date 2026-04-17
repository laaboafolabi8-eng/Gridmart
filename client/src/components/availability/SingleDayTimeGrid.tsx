import { useState, useRef, useCallback, useEffect, Fragment } from 'react';
import { cn } from '@/lib/utils';

interface TimeBlock {
  startTime: string;
  endTime: string;
}

interface SingleDayTimeGridProps {
  windows: TimeBlock[];
  onChange: (windows: TimeBlock[]) => void;
  startHour?: number;
  endHour?: number;
  intervalMinutes?: number;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function formatTimeDisplay(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
}

export function SingleDayTimeGrid({
  windows,
  onChange,
  startHour = 0,
  endHour = 24,
  intervalMinutes = 15,
}: SingleDayTimeGridProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartSlot, setDragStartSlot] = useState<number | null>(null);
  const [dragEndSlot, setDragEndSlot] = useState<number | null>(null);
  const [isErasing, setIsErasing] = useState(false);

  const totalSlots = ((endHour - startHour) * 60) / intervalMinutes;
  const slotsPerHour = 60 / intervalMinutes;
  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const minutes = startHour * 60 + i * intervalMinutes;
    return minutesToTime(minutes);
  });

  const isSlotSelected = useCallback((slotIndex: number): boolean => {
    const slotStart = startHour * 60 + slotIndex * intervalMinutes;
    const slotEnd = slotStart + intervalMinutes;
    
    return windows.some(block => {
      const blockStart = timeToMinutes(block.startTime);
      const blockEnd = timeToMinutes(block.endTime);
      return slotStart >= blockStart && slotEnd <= blockEnd;
    });
  }, [windows, startHour, intervalMinutes]);

  const handleMouseDown = (slotIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const isCurrentlySelected = isSlotSelected(slotIndex);
    setIsDragging(true);
    setDragStartSlot(slotIndex);
    setDragEndSlot(slotIndex);
    setIsErasing(isCurrentlySelected);
  };

  const handleMouseEnter = (slotIndex: number) => {
    if (isDragging) {
      setDragEndSlot(slotIndex);
    }
  };

  const handleMouseUp = useCallback(() => {
    if (!isDragging || dragStartSlot === null || dragEndSlot === null) {
      setIsDragging(false);
      return;
    }

    const minSlot = Math.min(dragStartSlot, dragEndSlot);
    const maxSlot = Math.max(dragStartSlot, dragEndSlot);
    
    const newStartMinutes = startHour * 60 + minSlot * intervalMinutes;
    const newEndMinutes = startHour * 60 + (maxSlot + 1) * intervalMinutes;
    const newBlock = {
      startTime: minutesToTime(newStartMinutes),
      endTime: minutesToTime(newEndMinutes),
    };

    let updatedBlocks: TimeBlock[];

    if (isErasing) {
      updatedBlocks = [];
      windows.forEach(block => {
        const blockStart = timeToMinutes(block.startTime);
        const blockEnd = timeToMinutes(block.endTime);
        
        if (blockEnd <= newStartMinutes || blockStart >= newEndMinutes) {
          updatedBlocks.push(block);
        } else {
          if (blockStart < newStartMinutes) {
            updatedBlocks.push({
              startTime: block.startTime,
              endTime: minutesToTime(newStartMinutes),
            });
          }
          if (blockEnd > newEndMinutes) {
            updatedBlocks.push({
              startTime: minutesToTime(newEndMinutes),
              endTime: block.endTime,
            });
          }
        }
      });
    } else {
      const merged: TimeBlock[] = [];
      let newBlockMerged = { ...newBlock };
      
      windows.forEach(block => {
        const blockStart = timeToMinutes(block.startTime);
        const blockEnd = timeToMinutes(block.endTime);
        const newStart = timeToMinutes(newBlockMerged.startTime);
        const newEnd = timeToMinutes(newBlockMerged.endTime);
        
        if (blockEnd < newStart || blockStart > newEnd) {
          merged.push(block);
        } else {
          newBlockMerged = {
            startTime: minutesToTime(Math.min(blockStart, newStart)),
            endTime: minutesToTime(Math.max(blockEnd, newEnd)),
          };
        }
      });
      
      merged.push(newBlockMerged);
      merged.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
      updatedBlocks = merged;
    }

    onChange(updatedBlocks);

    setIsDragging(false);
    setDragStartSlot(null);
    setDragEndSlot(null);
  }, [isDragging, dragStartSlot, dragEndSlot, windows, onChange, startHour, intervalMinutes, isErasing]);

  useEffect(() => {
    const handleGlobalMouseUp = () => handleMouseUp();
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [handleMouseUp]);

  const getDragPreview = (slotIndex: number): 'add' | 'remove' | null => {
    if (!isDragging || dragStartSlot === null || dragEndSlot === null) {
      return null;
    }
    const minSlot = Math.min(dragStartSlot, dragEndSlot);
    const maxSlot = Math.max(dragStartSlot, dragEndSlot);
    if (slotIndex >= minSlot && slotIndex <= maxSlot) {
      return isErasing ? 'remove' : 'add';
    }
    return null;
  };

  return (
    <div className="select-none">
      <div className="text-xs text-gray-500 mb-1">
        Drag to select custom times for this day
      </div>
      
      <div 
        className="border rounded-lg overflow-hidden overflow-x-auto"
        onMouseLeave={() => {
          if (isDragging) {
            handleMouseUp();
          }
        }}
      >
        <div className="flex" style={{ minWidth: `${totalSlots * 8}px` }}>
          {slots.map((time, slotIndex) => {
            const isSelected = isSlotSelected(slotIndex);
            const dragPreview = getDragPreview(slotIndex);
            const isHourMark = slotIndex % slotsPerHour === 0;
            return (
              <div
                key={slotIndex}
                className="flex flex-col items-center flex-shrink-0"
                style={{ width: `${Math.max(8, 24 / (slotsPerHour / 2))}px` }}
              >
                <div className="text-[8px] text-gray-400 h-4 flex items-center whitespace-nowrap overflow-hidden">
                  {isHourMark ? (() => {
                    const [h] = time.split(':').map(Number);
                    const period = h >= 12 ? 'p' : 'a';
                    const hour = h % 12 || 12;
                    return `${hour}${period}`;
                  })() : ''}
                </div>
                <div
                  className={cn(
                    "w-full h-8 cursor-pointer transition-colors",
                    isHourMark ? "border-l border-gray-300" : "border-l border-gray-100",
                    isSelected && !dragPreview && "bg-teal-500",
                    !isSelected && !dragPreview && (slotIndex % slotsPerHour < slotsPerHour / 2 ? "bg-gray-50" : "bg-white"),
                    dragPreview === 'add' && "bg-teal-300",
                    dragPreview === 'remove' && "bg-red-200",
                  )}
                  onMouseDown={(e) => handleMouseDown(slotIndex, e)}
                  onMouseEnter={() => handleMouseEnter(slotIndex)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {windows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {windows.map((block, i) => (
            <span key={i} className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded">
              {formatTimeDisplay(block.startTime)} - {formatTimeDisplay(block.endTime)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
