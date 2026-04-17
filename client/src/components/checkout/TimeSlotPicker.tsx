import { useState } from 'react';
import { Clock, Check, Shield, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

export interface PickupSlot {
  id: string;
  date: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  guaranteed: boolean;
  locked?: boolean;
}

interface TimeSlotPickerProps {
  slots: PickupSlot[];
  selectedSlot: PickupSlot | null;
  onSelectSlot: (slot: PickupSlot) => void;
  isLoading?: boolean;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-US', { 
    weekday: 'short', 
    month: 'short', 
    day: 'numeric' 
  });
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function TimeSlotPicker({ slots, selectedSlot, onSelectSlot, isLoading }: TimeSlotPickerProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const groupedSlots = slots.reduce((acc, slot) => {
    if (!acc[slot.date]) {
      acc[slot.date] = [];
    }
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, PickupSlot[]>);

  const dates = Object.keys(groupedSlots).sort();
  const currentDate = selectedDate || dates[0];
  const currentIndex = dates.indexOf(currentDate);

  const goToPrevDate = () => {
    if (currentIndex > 0) {
      setSelectedDate(dates[currentIndex - 1]);
    }
  };

  const goToNextDate = () => {
    if (currentIndex < dates.length - 1) {
      setSelectedDate(dates[currentIndex + 1]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-5 h-5" />
          <span className="font-medium">Loading pickup times...</span>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-20 bg-muted rounded-lg"></div>
          <div className="h-12 bg-muted rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-5 h-5" />
          <span className="font-medium">Select pickup time</span>
        </div>
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No pickup times available</p>
            <p className="text-sm">No pickup windows right now. Check back later!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Clock className="w-5 h-5" />
          <span className="font-medium">Select pickup time</span>
        </div>
        <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50">
          <Shield className="w-3 h-3" />
          48-hour guarantee
        </Badge>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={goToPrevDate}
              disabled={currentIndex === 0}
              data-testid="button-prev-date"
            >
              <ChevronLeft className="w-5 h-5" />
            </Button>
            
            <div className="text-center">
              <div className="font-semibold text-lg" data-testid="text-current-date">
                {formatDate(currentDate)}
              </div>
              <div className="text-sm text-muted-foreground">
                {new Date(currentDate + 'T00:00:00').toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="icon"
              onClick={goToNextDate}
              disabled={currentIndex === dates.length - 1}
              data-testid="button-next-date"
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>

          <div className="flex justify-center gap-1">
            {dates.map((date, i) => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  date === currentDate 
                    ? 'bg-primary' 
                    : 'bg-muted hover:bg-muted-foreground/30'
                }`}
                data-testid={`button-date-dot-${i}`}
              />
            ))}
          </div>

          <div className="grid gap-2">
            {groupedSlots[currentDate]?.map(slot => (
              <Button
                key={slot.id}
                variant={selectedSlot?.id === slot.id ? 'default' : 'outline'}
                className="w-full justify-between h-auto py-3 px-4"
                onClick={() => onSelectSlot(slot)}
                data-testid={`button-slot-${slot.id}`}
              >
                <span className="flex items-center gap-2">
                  {selectedSlot?.id === slot.id && <Check className="w-4 h-4" />}
                  <span className="font-medium">
                    {formatTime(slot.startTime)} - {formatTime(slot.endTime)}
                  </span>
                </span>
                <Badge variant="outline" className="text-xs gap-1">
                  <Lock className="w-3 h-3" />
                  Locked In
                </Badge>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selectedSlot && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
          <Check className="w-5 h-5 text-primary" />
          <div>
            <div className="font-medium text-sm">
              {formatDate(selectedSlot.date)}, {formatTime(selectedSlot.startTime)} - {formatTime(selectedSlot.endTime)}
            </div>
            <div className="text-xs text-muted-foreground">
              This time is locked in - the host cannot change it
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
