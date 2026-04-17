import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TimeBlock {
  startTime: string;
  endTime: string;
}

interface TimeBlockGridProps {
  schedule: Record<string, TimeBlock[]>;
  onChange: (schedule: Record<string, TimeBlock[]>) => void;
  defaultDays?: Record<string, boolean>;
  onDefaultDaysChange?: (defaultDays: Record<string, boolean>) => void;
  startHour?: number;
  endHour?: number;
  intervalMinutes?: number;
  lockHours?: number;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

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
  return `${hour}${period}`;
}

export function TimeBlockGrid({
  schedule,
  onChange,
  defaultDays,
  onDefaultDaysChange,
  startHour = 0,
  endHour = 24,
  intervalMinutes = 15,
  lockHours = 48,
}: TimeBlockGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragDay, setDragDay] = useState<string | null>(null);
  const [dragStartSlot, setDragStartSlot] = useState<number | null>(null);
  const [dragEndSlot, setDragEndSlot] = useState<number | null>(null);
  const [isErasing, setIsErasing] = useState(false);

  const totalSlots = ((endHour - startHour) * 60) / intervalMinutes;
  const slotsPerHour = 60 / intervalMinutes;
  const slots = Array.from({ length: totalSlots }, (_, i) => {
    const minutes = startHour * 60 + i * intervalMinutes;
    return minutesToTime(minutes);
  });

  const isSlotSelected = useCallback((day: string, slotIndex: number): boolean => {
    const slotStart = startHour * 60 + slotIndex * intervalMinutes;
    const slotEnd = slotStart + intervalMinutes;
    const dayBlocks = schedule[day] || [];
    
    return dayBlocks.some(block => {
      const blockStart = timeToMinutes(block.startTime);
      const blockEnd = timeToMinutes(block.endTime);
      return slotStart >= blockStart && slotEnd <= blockEnd;
    });
  }, [schedule, startHour, intervalMinutes]);

  const handleMouseDown = (day: string, slotIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    const isCurrentlySelected = isSlotSelected(day, slotIndex);
    setIsDragging(true);
    setDragDay(day);
    setDragStartSlot(slotIndex);
    setDragEndSlot(slotIndex);
    setIsErasing(isCurrentlySelected);
  };

  const handleMouseEnter = (day: string, slotIndex: number) => {
    if (isDragging && day === dragDay && !isSlotLocked(day, slotIndex)) {
      setDragEndSlot(slotIndex);
    }
  };

  const handleMouseUp = useCallback(() => {
    if (!isDragging || dragDay === null || dragStartSlot === null || dragEndSlot === null) {
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

    const currentBlocks = schedule[dragDay] || [];
    let newBlocks: TimeBlock[];

    if (isErasing) {
      newBlocks = currentBlocks.flatMap(block => {
        const blockStart = timeToMinutes(block.startTime);
        const blockEnd = timeToMinutes(block.endTime);
        const eraseStart = newStartMinutes;
        const eraseEnd = newEndMinutes;

        if (eraseEnd <= blockStart || eraseStart >= blockEnd) {
          return [block];
        }

        const result: TimeBlock[] = [];
        if (blockStart < eraseStart) {
          result.push({
            startTime: block.startTime,
            endTime: minutesToTime(eraseStart),
          });
        }
        if (blockEnd > eraseEnd) {
          result.push({
            startTime: minutesToTime(eraseEnd),
            endTime: block.endTime,
          });
        }
        return result;
      });
    } else {
      const merged: TimeBlock[] = [];
      let current = newBlock;

      const allBlocks = [...currentBlocks, newBlock].sort((a, b) => 
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );

      for (const block of allBlocks) {
        if (merged.length === 0) {
          merged.push({ ...block });
        } else {
          const last = merged[merged.length - 1];
          const lastEnd = timeToMinutes(last.endTime);
          const blockStart = timeToMinutes(block.startTime);
          
          if (blockStart <= lastEnd) {
            last.endTime = minutesToTime(Math.max(lastEnd, timeToMinutes(block.endTime)));
          } else {
            merged.push({ ...block });
          }
        }
      }
      newBlocks = merged;
    }

    onChange({
      ...schedule,
      [dragDay]: newBlocks,
    });

    setIsDragging(false);
    setDragDay(null);
    setDragStartSlot(null);
    setDragEndSlot(null);
  }, [isDragging, dragDay, dragStartSlot, dragEndSlot, isErasing, schedule, onChange, startHour, intervalMinutes]);

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

  const getDragPreview = (day: string, slotIndex: number): 'add' | 'remove' | null => {
    if (!isDragging || day !== dragDay || dragStartSlot === null || dragEndSlot === null) {
      return null;
    }
    const minSlot = Math.min(dragStartSlot, dragEndSlot);
    const maxSlot = Math.max(dragStartSlot, dragEndSlot);
    if (slotIndex >= minSlot && slotIndex <= maxSlot) {
      return isErasing ? 'remove' : 'add';
    }
    return null;
  };


  const isSlotLocked = useCallback((day: string, slotIndex: number): boolean => {
    if (lockHours === 0) return false;
    
    const now = new Date();
    const lockEndTime = new Date(now.getTime() + lockHours * 60 * 60 * 1000);
    
    const dayIndex = DAYS.indexOf(day);
    const todayIndex = (now.getDay() + 6) % 7;
    
    let daysUntil = dayIndex - todayIndex;
    if (daysUntil < 0) daysUntil += 7;
    
    const slotDate = new Date(now);
    slotDate.setDate(now.getDate() + daysUntil);
    
    const slotMinutes = startHour * 60 + slotIndex * intervalMinutes;
    const slotHour = Math.floor(slotMinutes / 60);
    const slotMin = slotMinutes % 60;
    slotDate.setHours(slotHour, slotMin, 0, 0);
    
    return slotDate < lockEndTime;
  }, [lockHours, startHour, intervalMinutes]);

  return (
    <div className="select-none">
      <div className="text-sm text-gray-500 mb-3">
        Drag to select time slots.{lockHours > 0 && <> Faded slots are within the next {lockHours}h and cannot be changed.</>}
      </div>
      
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${Math.max(600, totalSlots * 6 + 64)}px` }}>
          <div className="flex mb-1">
            <div className="w-16 shrink-0" />
            <div className="flex-1 flex">
              {slots.map((time, i) => {
                const isHourMark = i % slotsPerHour === 0;
                return (
                  <div 
                    key={time} 
                    className="text-[9px] text-gray-400 overflow-hidden"
                    style={{ width: `${100 / totalSlots}%` }}
                  >
                    {isHourMark ? formatTimeDisplay(time) : ''}
                  </div>
                );
              })}
            </div>
          </div>

          <div 
            ref={gridRef}
            className="space-y-1"
            onMouseLeave={() => {
              if (isDragging) {
                handleMouseUp();
              }
            }}
          >
            {DAYS.map(day => {
              return (
                <div 
                  key={day} 
                  className="flex items-center rounded-lg border transition-all"
                >
                  <div className="w-16 shrink-0 px-2 py-2 text-sm font-medium">
                    <span>{day.slice(0, 3)}</span>
                  </div>
                  
                  <div className="flex-1 flex h-8">
                    {slots.map((_, slotIndex) => {
                      const isSelected = isSlotSelected(day, slotIndex);
                      const dragPreview = getDragPreview(day, slotIndex);
                      const isLocked = isSlotLocked(day, slotIndex);
                      const isHourBorder = slotIndex % slotsPerHour === 0;
                      
                      return (
                        <div
                          key={slotIndex}
                          className={cn(
                            "flex-1 border-r last:border-r-0 transition-colors",
                            isHourBorder ? "border-l border-gray-200" : "border-l border-gray-100",
                            isLocked && !isSelected && "bg-gray-100 cursor-not-allowed",
                            isLocked && isSelected && "bg-teal-200 cursor-not-allowed",
                            !isLocked && !isSelected && !dragPreview && "bg-gray-50 hover:bg-gray-100 cursor-pointer",
                            !isLocked && isSelected && !dragPreview && "bg-teal-500 cursor-pointer",
                            !isLocked && dragPreview === 'add' && "bg-teal-300 cursor-pointer",
                            !isLocked && dragPreview === 'remove' && "bg-red-200 cursor-pointer",
                          )}
                          onMouseDown={(e) => !isLocked && handleMouseDown(day, slotIndex, e)}
                          onMouseEnter={() => handleMouseEnter(day, slotIndex)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
