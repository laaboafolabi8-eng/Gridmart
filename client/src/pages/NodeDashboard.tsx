import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Link } from 'wouter';
import { 
  Package, Calendar, DollarSign, Clock, Bell, 
  CheckCircle, AlertCircle, TrendingUp, Settings,
  ChevronRight, ChevronDown, MapPin, Eye, Plus, Trash2, Lock, XCircle, Send, Loader2, Tag, Copy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { ChatDialog } from '@/components/chat/ChatDialog';
import { TimeBlockGrid } from '@/components/availability/TimeBlockGrid';
import { SingleDayTimeGrid } from '@/components/availability/SingleDayTimeGrid';
import { useNodeAvailability } from '@/lib/store';
import { formatCurrency, formatDate, formatTime, type Product, type Node } from '@/lib/mockData';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const defaultNode: Node = {
  id: 'loading',
  name: 'Loading...',
  address: '',
  city: '',
  rating: '4.5',
  totalHandoffs: 0,
  earningsPerHandoff: '2.50',
  status: 'inactive',
  availabilityNoticeHours: 48,
};

interface TimeWindow {
  id: string;
  startTime: string;
  endTime: string;
}

interface DefaultSchedule {
  [day: string]: TimeWindow[];
}

interface DayOverride {
  date: string;
  type: 'default' | 'custom' | 'closed';
  windows: TimeWindow[];
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_OPTIONS: string[] = [];
for (let h = 0; h < 24; h++) {
  for (let m = 0; m < 60; m += 15) {
    TIME_OPTIONS.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
}

const formatTimeDisplay = (time: string) => {
  const [hours, mins] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${(mins || 0).toString().padStart(2, '0')} ${ampm}`;
};

const formatTimeRange = (start: string, end: string) => {
  return `${formatTimeDisplay(start)} - ${formatTimeDisplay(end)}`;
};

const getMinimumEndTime = (startTime: string) => {
  const [hours, mins] = startTime.split(':').map(Number);
  const totalMins = hours * 60 + (mins || 0) + 120;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const isValidWindow = (window: TimeWindow) => {
  const [startHour, startMin] = window.startTime.split(':').map(Number);
  const [endHour, endMin] = window.endTime.split(':').map(Number);
  return (endHour * 60 + (endMin || 0)) - (startHour * 60 + (startMin || 0)) >= 120;
};

const getAvailabilityStatus = (defaultSchedule: { [day: string]: TimeWindow[] }, overrides: Record<string, { type: string; windows: TimeWindow[] }>) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const dayName = DAYS[now.getDay() === 0 ? 6 : now.getDay() - 1];
  const currentHour = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinutes;
  
  const override = overrides[today];
  let windows: TimeWindow[] = [];
  
  if (override) {
    if (override.type === 'closed') windows = [];
    else if (override.type === 'custom') windows = override.windows;
  } else {
    windows = defaultSchedule[dayName] || [];
  }
  
  const isAvailable = windows.some(window => {
    const [startHour, startMin] = window.startTime.split(':').map(Number);
    const [endHour, endMin] = window.endTime.split(':').map(Number);
    const startTime = startHour * 60 + (startMin || 0);
    const endTime = endHour * 60 + (endMin || 0);
    return currentTime >= startTime && currentTime < endTime;
  });
  
  if (isAvailable) {
    return { available: true, nextWindow: null };
  }
  
  // Find next available window
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const checkDate = new Date(now);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const checkDateStr = checkDate.toISOString().split('T')[0];
    const checkDayName = DAYS[checkDate.getDay() === 0 ? 6 : checkDate.getDay() - 1];
    
    const dayOverride = overrides[checkDateStr];
    let dayWindows: TimeWindow[] = [];
    
    if (dayOverride) {
      if (dayOverride.type === 'custom') dayWindows = dayOverride.windows;
    } else {
      dayWindows = defaultSchedule[checkDayName] || [];
    }
    
    for (const window of dayWindows) {
      const [startHour, startMin] = window.startTime.split(':').map(Number);
      const windowStart = startHour * 60 + (startMin || 0);
      
      if (dayOffset === 0 && windowStart <= currentTime) continue;
      
      return { 
        available: false, 
        nextWindow: { 
          day: dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : checkDayName,
          time: formatTimeDisplay(window.startTime)
        }
      };
    }
  }
  
  return { available: false, nextWindow: null };
};

const getNext7Days = (noticeHours: number = 48) => {
  const days = [];
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    
    // Calculate if this day is editable based on notice hours
    // A day is editable if the END of that day is more than noticeHours from now
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const hoursUntilEndOfDay = (endOfDay.getTime() - now.getTime()) / (1000 * 60 * 60);
    const isEditable = hoursUntilEndOfDay >= noticeHours;
    
    days.push({
      date: date.toISOString().split('T')[0],
      dayName: DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1],
      dayOfWeek: date.getDay(),
      displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      isEditable,
    });
  }
  return days;
};

const getDayName = (date: Date) => {
  return DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
};

interface CrateAssignment {
  id: string;
  crateId: string;
  nodeId: string;
  status: string;
  assignedAt: string;
  completedAt: string | null;
  crate: {
    id: string;
    name: string;
    description: string | null;
    items: { productId: string; productName: string; productCode: string | null; quantity: number; variantCount: number; image?: string }[];
    rawItems: { id: string; productId: string; quantity: number; productName: string; productCode: string | null }[];
  } | null;
}

export default function NodeDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [availableNodes, setAvailableNodes] = useState<Node[]>([]);
  const [currentNode, setCurrentNode] = useState<Node>(defaultNode);
  const [nodeCrateAssignments, setNodeCrateAssignments] = useState<CrateAssignment[]>([]);
  const [groupByProduct, setGroupByProduct] = useState(true);
  const [smsGiftCouponId, setSmsGiftCouponId] = useState<string | null>(null);
  const [smsGiftPhone, setSmsGiftPhone] = useState('');
  const [smsGiftSending, setSmsGiftSending] = useState(false);
  const { availability, toggleSlot } = useNodeAvailability(currentNode.id);
  
  // Fetch orders from API for this node
  const { data: nodeOrders = [] } = useQuery({
    queryKey: ['nodeOrders', currentNode.id],
    queryFn: async () => {
      if (currentNode.id === 'loading') return [];
      const res = await fetch(`/api/orders?nodeId=${currentNode.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentNode.id !== 'loading',
    refetchInterval: 10000,
  });

  const { data: prepTimeData } = useQuery({
    queryKey: ['prepTime', currentNode.id],
    queryFn: async () => {
      if (currentNode.id === 'loading') return null;
      const res = await fetch(`/api/nodes/${currentNode.id}/prep-time`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: currentNode.id !== 'loading',
    refetchInterval: 30000,
  });
  
  const { data: nodeCoupons = [] } = useQuery<any[]>({
    queryKey: ['nodeCoupons', currentNode.id],
    queryFn: async () => {
      if (currentNode.id === 'loading') return [];
      const res = await fetch(`/api/nodes/${currentNode.id}/coupons`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: currentNode.id !== 'loading',
  });

  const { data: myNotifications = [] } = useQuery<any[]>({
    queryKey: ['myNotifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
    refetchInterval: 30000,
  });
  const unreadNotifications = myNotifications.filter((n: any) => !n.read);

  // Mutation to update order status
  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update order status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nodeOrders', currentNode.id] });
    },
  });
  
  const updateOrderStatus = (orderId: string, status: string) => {
    updateOrderStatusMutation.mutate({ orderId, status });
  };
  
  // Fetch available nodes - admins see all nodes, node users see their own
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchNodes = async () => {
      try {
        // Admins can see all nodes
        if (user.type === 'admin') {
          const res = await fetch('/api/nodes');
          if (res.ok) {
            const nodes = await res.json();
            setAvailableNodes(nodes);
            // Set first node as default if none selected
            if (nodes.length > 0 && currentNode.id === 'loading') {
              setCurrentNode(nodes[0]);
            }
          }
        } else {
          // Regular node users see their own node
          const res = await fetch(`/api/nodes/by-user/${user.id}`);
          if (res.ok) {
            const node = await res.json();
            setAvailableNodes([node]);
            setCurrentNode(node);
          }
        }
      } catch (error) {
        console.error('Failed to fetch nodes:', error);
      }
    };
    
    fetchNodes();
  }, [user?.id, user?.type]);
  
  // Fetch crate assignments when node is loaded and refresh periodically
  const fetchCrateAssignments = async () => {
    if (currentNode.id === 'loading') return;
    try {
      const res = await fetch(`/api/nodes/${currentNode.id}/crates`);
      const assignments = await res.json();
      setNodeCrateAssignments(assignments);
    } catch (error) {
      console.error('Failed to fetch crate assignments:', error);
    }
  };
  
  useEffect(() => {
    fetchCrateAssignments();
    
    // Poll every 10 seconds for new crate assignments
    const pollInterval = setInterval(fetchCrateAssignments, 10000);
    return () => clearInterval(pollInterval);
  }, [currentNode.id]);
  
  const handleCompleteCrate = async (assignmentId: string) => {
    try {
      await fetch(`/api/crate-assignments/${assignmentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      // Refresh assignments
      const res = await fetch(`/api/nodes/${currentNode.id}/crates`);
      const assignments = await res.json();
      setNodeCrateAssignments(assignments);
    } catch (error) {
      console.error('Failed to complete crate:', error);
    }
  };
  
  const handleDeleteCrateAssignment = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to delete this crate assignment?')) {
      return;
    }
    try {
      await fetch(`/api/crate-assignments/${assignmentId}`, {
        method: 'DELETE',
      });
      // Refresh assignments
      const res = await fetch(`/api/nodes/${currentNode.id}/crates`);
      const assignments = await res.json();
      setNodeCrateAssignments(assignments);
    } catch (error) {
      console.error('Failed to delete crate assignment:', error);
    }
  };
  
  
  // Default weekly schedule - recurring every week
  const [defaultSchedule, setDefaultSchedule] = useState<DefaultSchedule>({
    Monday: [],
    Tuesday: [],
    Wednesday: [],
    Thursday: [],
    Friday: [],
    Saturday: [],
    Sunday: [],
  });
  
  // Load saved availability from database on mount
  // Overrides for specific dates
  const [overrides, setOverrides] = useState<Record<string, DayOverride>>({});
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  
  useEffect(() => {
    if (currentNode.id && currentNode.id !== 'loading') {
      fetch(`/api/nodes/${currentNode.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.availability && Array.isArray(data.availability)) {
            // Convert flat array to schedule object
            const schedule: DefaultSchedule = {
              Monday: [],
              Tuesday: [],
              Wednesday: [],
              Thursday: [],
              Friday: [],
              Saturday: [],
              Sunday: [],
            };
            data.availability.forEach((entry: any) => {
              const day = entry.dayOfWeek as keyof DefaultSchedule;
              // Only add enabled entries to the schedule
              if (schedule[day] && entry.enabled !== false) {
                schedule[day].push({
                  id: entry.id || Date.now().toString() + Math.random(),
                  startTime: entry.startTime,
                  endTime: entry.endTime,
                });
              }
            });
            setDefaultSchedule(schedule);
          }
          
          // Load date-specific overrides
          if (data.availabilityOverrides && typeof data.availabilityOverrides === 'object') {
            setOverrides(data.availabilityOverrides);
          }
        })
        .catch(console.error);
    }
  }, [currentNode.id]);
  
  // UI state for editing
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [showDefaultEditor, setShowDefaultEditor] = useState(false);

  const isNodeActive = currentNode.status === 'active';
  const noticeHours = currentNode.availabilityNoticeHours ?? 48;
  const effectiveLockHours = isNodeActive ? noticeHours : 0;
  const next7Days = getNext7Days(effectiveLockHours);

  // Get effective schedule for a specific date
  const getEffectiveSchedule = (date: string, dayName: string) => {
    const override = overrides[date];
    if (override) {
      if (override.type === 'closed') return { type: 'closed' as const, windows: [] };
      if (override.type === 'custom') return { type: 'custom' as const, windows: override.windows };
    }
    return { type: 'default' as const, windows: defaultSchedule[dayName] || [] };
  };

  // Update override for a specific date
  const setDayType = (date: string, type: 'default' | 'custom' | 'closed', dayName: string) => {
    if (type === 'default') {
      const newOverrides = { ...overrides };
      delete newOverrides[date];
      setOverrides(newOverrides);
    } else if (type === 'closed') {
      setOverrides({ ...overrides, [date]: { date, type: 'closed', windows: [] } });
    } else {
      // Custom - copy from default as starting point
      const defaultWindows = defaultSchedule[dayName] || [];
      setOverrides({ 
        ...overrides, 
        [date]: { 
          date, 
          type: 'custom', 
          windows: defaultWindows.map(w => ({ ...w, id: Date.now().toString() + Math.random() }))
        } 
      });
    }
  };

  // Add window to a custom override
  const addCustomWindow = (date: string) => {
    const override = overrides[date];
    if (override && override.type === 'custom') {
      setOverrides({
        ...overrides,
        [date]: {
          ...override,
          windows: [...override.windows, { id: Date.now().toString(), startTime: '09:00', endTime: '11:00' }]
        }
      });
    }
  };

  // Remove window from custom override
  const removeCustomWindow = (date: string, windowId: string) => {
    const override = overrides[date];
    if (override && override.type === 'custom') {
      setOverrides({
        ...overrides,
        [date]: {
          ...override,
          windows: override.windows.filter(w => w.id !== windowId)
        }
      });
    }
  };

  // Update window in custom override
  const updateCustomWindow = (date: string, windowId: string, field: 'startTime' | 'endTime', value: string) => {
    const override = overrides[date];
    if (override && override.type === 'custom') {
      setOverrides({
        ...overrides,
        [date]: {
          ...override,
          windows: override.windows.map(w => {
            if (w.id !== windowId) return w;
            const updated = { ...w, [field]: value };
            if (field === 'startTime') {
              const minEnd = getMinimumEndTime(value);
              if (updated.endTime < minEnd) updated.endTime = minEnd;
            }
            return updated;
          })
        }
      });
    }
  };

  // Default schedule management
  const addDefaultWindow = (day: string) => {
    setDefaultSchedule({
      ...defaultSchedule,
      [day]: [...(defaultSchedule[day] || []), { id: Date.now().toString(), startTime: '09:00', endTime: '11:00' }]
    });
  };

  const removeDefaultWindow = (day: string, windowId: string) => {
    setDefaultSchedule({
      ...defaultSchedule,
      [day]: defaultSchedule[day].filter(w => w.id !== windowId)
    });
  };

  const updateDefaultWindow = (day: string, windowId: string, field: 'startTime' | 'endTime', value: string) => {
    setDefaultSchedule({
      ...defaultSchedule,
      [day]: defaultSchedule[day].map(w => {
        if (w.id !== windowId) return w;
        const updated = { ...w, [field]: value };
        if (field === 'startTime') {
          const minEnd = getMinimumEndTime(value);
          if (updated.endTime < minEnd) updated.endTime = minEnd;
        }
        return updated;
      })
    });
  };

  const totalDefaultHours = Object.values(defaultSchedule).flat().reduce((total, window) => {
    const [startH, startM] = window.startTime.split(':').map(Number);
    const [endH, endM] = window.endTime.split(':').map(Number);
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);
    return total + (endMinutes - startMinutes) / 60;
  }, 0);
  const minimumHoursRequired = (currentNode as any).minimumAvailabilityHours ?? 4;
  const hasMinimumHours = totalDefaultHours >= minimumHoursRequired;
  
  const [isSavingAvailability, setIsSavingAvailability] = useState(false);
  const [isClearingAvailability, setIsClearingAvailability] = useState(false);
  
  // Helper to check for overlapping windows
  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const checkOverlaps = (windows: Array<{ startTime: string; endTime: string }>): string | null => {
    if (windows.length < 2) return null;
    
    const sorted = [...windows].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const currentEnd = timeToMinutes(sorted[i].endTime);
      const nextStart = timeToMinutes(sorted[i + 1].startTime);
      
      if (currentEnd > nextStart) {
        return `${sorted[i].startTime}-${sorted[i].endTime} overlaps with ${sorted[i + 1].startTime}-${sorted[i + 1].endTime}`;
      }
    }
    return null;
  };
  
  // Real-time overlap detection
  const overlapWarnings = useMemo(() => {
    const warnings: string[] = [];
    
    // Check default schedule for overlaps
    for (const [day, windows] of Object.entries(defaultSchedule)) {
      const overlap = checkOverlaps(windows);
      if (overlap) {
        warnings.push(`${day}: ${overlap}`);
      }
    }
    
    // Check overrides for overlaps
    for (const [date, override] of Object.entries(overrides)) {
      if (override.type === 'custom') {
        const overlap = checkOverlaps(override.windows);
        if (overlap) {
          warnings.push(`${date}: ${overlap}`);
        }
      }
    }
    
    return warnings;
  }, [defaultSchedule, overrides]);
  
  const hasOverlaps = overlapWarnings.length > 0;
  
  const handleSaveAvailability = async () => {
    setIsSavingAvailability(true);
    try {
      // Helper to convert time string to minutes
      const timeToMinutes = (time: string): number => {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
      };
      const minutesToTime = (minutes: number): string => {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      };
      
      // Convert defaultSchedule to flat array of entries, merging overlaps per day
      const schedule: Array<{ dayOfWeek: string; startTime: string; endTime: string; enabled: boolean }> = [];
      for (const [day, windows] of Object.entries(defaultSchedule)) {
        // Sort windows by start time
        const sorted = [...windows].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        
        // Merge overlapping windows
        const merged: { startTime: string; endTime: string }[] = [];
        for (const window of sorted) {
          if (merged.length === 0) {
            merged.push({ startTime: window.startTime, endTime: window.endTime });
          } else {
            const last = merged[merged.length - 1];
            const lastEnd = timeToMinutes(last.endTime);
            const windowStart = timeToMinutes(window.startTime);
            if (windowStart <= lastEnd) {
              // Overlapping or adjacent - merge
              last.endTime = minutesToTime(Math.max(lastEnd, timeToMinutes(window.endTime)));
            } else {
              merged.push({ startTime: window.startTime, endTime: window.endTime });
            }
          }
        }
        
        for (const window of merged) {
          schedule.push({
            dayOfWeek: day,
            startTime: window.startTime,
            endTime: window.endTime,
            enabled: true
          });
        }
      }
      
      const res = await fetch(`/api/nodes/${currentNode.id}/availability/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save availability');
      }
      
      // Save date overrides
      const overridesRes = await fetch(`/api/nodes/${currentNode.id}/availability/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides })
      });
      
      if (!overridesRes.ok) {
        const data = await overridesRes.json();
        throw new Error(data.error || 'Failed to save date overrides');
      }
      
      alert('Availability schedule saved successfully!');
    } catch (error: any) {
      console.error('Save availability error:', error);
      alert(error.message || 'Failed to save availability. Please try again.');
    } finally {
      setIsSavingAvailability(false);
    }
  };

  const handleClearAllAvailability = async () => {
    const lockMessage = effectiveLockHours > 0 
      ? `Days within the next ${effectiveLockHours} hours will be preserved (they are locked). Clear all other availability?`
      : 'Are you sure you want to clear ALL availability? This will remove all pickup windows from the database.';
    if (!confirm(lockMessage)) {
      return;
    }
    
    setIsClearingAvailability(true);
    try {
      // Clear local state (server will preserve locked days)
      const emptySchedule: DefaultSchedule = {
        Monday: [],
        Tuesday: [],
        Wednesday: [],
        Thursday: [],
        Friday: [],
        Saturday: [],
        Sunday: [],
      };
      setDefaultSchedule(emptySchedule);
      setOverrides({});
      
      // Save empty schedule to database
      const res = await fetch(`/api/nodes/${currentNode.id}/availability/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: [] })
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to clear availability');
      }
      
      // Clear date overrides
      const overridesRes = await fetch(`/api/nodes/${currentNode.id}/availability/overrides`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: {} })
      });
      
      if (!overridesRes.ok) {
        const data = await overridesRes.json();
        throw new Error(data.error || 'Failed to clear date overrides');
      }
      
      alert('All availability has been cleared!');
    } catch (error: any) {
      console.error('Clear availability error:', error);
      alert(error.message || 'Failed to clear availability. Please try again.');
    } finally {
      setIsClearingAvailability(false);
    }
  };
  
  const pendingOrders = nodeOrders.filter((o: any) => o.status === 'paid' || o.status === 'confirmed');
  const readyOrders = nodeOrders.filter((o: any) => o.status === 'ready');
  const completedOrders = nodeOrders.filter((o: any) => 
    o.status === 'picked_up' || o.status === 'cancelled' || o.status === 'canceled'
  );

  const earningsPerHandoff = parseFloat(String(currentNode.earningsPerHandoff || '2.50'));
  const handoffTiers = Array.isArray((currentNode as any).handoffTiers) ? (currentNode as any).handoffTiers as Array<{minQty: number; fee: number}> : null;

  const calculateOrderEarnings = (order: any): number => {
    const itemCount = (order.items || []).reduce((sum: number, item: any) => sum + item.quantity, 0);
    if (!handoffTiers || handoffTiers.length === 0) {
      return earningsPerHandoff;
    }
    const sorted = [...handoffTiers].sort((a, b) => b.minQty - a.minQty);
    const tier = sorted.find(t => itemCount >= t.minQty) || sorted[sorted.length - 1];
    return itemCount * tier.fee;
  };

  const pickedUpOrders = completedOrders.filter((o: any) => o.status === 'picked_up');
  const monthlyEarnings = pickedUpOrders.reduce((sum: number, o: any) => sum + calculateOrderEarnings(o), 0);
  const pendingEarnings = [...pendingOrders, ...readyOrders].reduce((sum: number, o: any) => sum + calculateOrderEarnings(o), 0);

  const manualSales = nodeOrders.filter((o: any) => o.saleSource && o.saleSource !== 'online');
  const manualSalesTotal = manualSales.reduce((sum: number, o: any) => sum + (parseFloat(o.total) || 0), 0);

  const groupedSlots = availability.reduce((acc, slot) => {
    if (!acc[slot.date]) {
      acc[slot.date] = [];
    }
    acc[slot.date].push(slot);
    return acc;
  }, {} as Record<string, typeof availability>);

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-16 relative z-10">
            <div>
              <h1 className="font-display text-3xl font-bold" data-testid="text-dashboard-title">
                Host Dashboard
              </h1>
              <div className="flex items-center gap-2 text-muted-foreground mt-2">
                <MapPin className="w-4 h-4 shrink-0" />
                {availableNodes.length > 1 ? (
                  <Select 
                    value={currentNode.id} 
                    onValueChange={(nodeId) => {
                      const node = availableNodes.find(n => n.id === nodeId);
                      if (node) setCurrentNode(node);
                    }}
                  >
                    <SelectTrigger className="w-auto h-auto p-0 border-0 shadow-none text-muted-foreground hover:text-foreground" data-testid="select-node">
                      <SelectValue placeholder="Select a node" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableNodes.map(node => (
                        <SelectItem key={node.id} value={node.id} data-testid={`select-node-${node.id}`}>
                          {node.name} • {node.address}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span>{currentNode.name} • {currentNode.address}</span>
                )}
              </div>
            </div>
            <Link href="/node-settings">
              <Button variant="outline" className="gap-2" data-testid="button-node-settings">
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 mt-4">
            <Card className="animate-slide-up overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                    <Bell className="w-5 h-5 text-orange-600" />
                  </div>
                  <Badge variant="secondary">{pendingOrders.length}</Badge>
                </div>
                <div className="text-2xl font-display font-bold">{pendingOrders.length}</div>
                <div className="text-sm text-muted-foreground">Pending Orders</div>
              </CardContent>
            </Card>

            <Card className="animate-slide-up overflow-hidden" style={{ animationDelay: '0.05s' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Package className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div className="text-2xl font-display font-bold">{readyOrders.length}</div>
                <div className="text-sm text-muted-foreground">Ready for Pickup</div>
              </CardContent>
            </Card>

            <Card className="animate-slide-up overflow-hidden" style={{ animationDelay: '0.1s' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="text-2xl font-display font-bold">{completedOrders.length}</div>
                <div className="text-sm text-muted-foreground">Completed This Month</div>
              </CardContent>
            </Card>

            <Card className="animate-slide-up overflow-hidden" style={{ animationDelay: '0.15s' }}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-accent" />
                  </div>
                </div>
                <div className="text-2xl font-display font-bold">{formatCurrency(monthlyEarnings)}</div>
                <div className="text-sm text-muted-foreground">
                  Earned ({formatCurrency(pendingEarnings)} pending)
                </div>
              </CardContent>
            </Card>
            {prepTimeData && prepTimeData.totalOrders > 0 && (
              <Card className={cn(
                "animate-slide-up overflow-hidden",
                prepTimeData.exceedsThreshold ? "border-red-300" : ""
              )} style={{ animationDelay: '0.2s' }}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center",
                      prepTimeData.exceedsThreshold ? "bg-red-100" : "bg-blue-100"
                    )}>
                      <Clock className={cn(
                        "w-5 h-5",
                        prepTimeData.exceedsThreshold ? "text-red-600" : "text-blue-600"
                      )} />
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground max-w-[120px]">How fast you prepare orders after they come in</div>
                      {prepTimeData.exceedsThreshold && (
                        <AlertCircle className="w-4 h-4 text-red-500 ml-auto mt-1" />
                      )}
                    </div>
                  </div>
                  <div className={cn(
                    "text-2xl font-display font-bold",
                    prepTimeData.exceedsThreshold ? "text-red-600" : ""
                  )}>
                    {prepTimeData.avgMinutes} min
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Prep Time</div>
                  <div className={cn("text-xs mt-0.5 font-medium", prepTimeData.exceedsThreshold ? "text-red-600" : "text-muted-foreground")}>
                    Target: under 30 min
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {prepTimeData?.exceedsThreshold && (
            <Card className="mb-4 border-red-300 bg-red-50/50" data-testid="prep-time-warning">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <div className="font-medium text-red-800">Prep Time Needs Improvement</div>
                    <div className="text-sm text-red-700">
                      Your average prep time is {prepTimeData.avgMinutes} minutes. Try to keep it under 30 minutes so customers get their orders quickly. Preparing orders as soon as you're notified helps keep pickup times short.
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="mb-8 border-green-200 bg-green-50/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <div className="font-medium">Monthly Host Rent</div>
                    <div className="text-sm text-muted-foreground">
                      You will receive {formatCurrency(parseFloat(String(currentNode.monthlyFee || '55')))} on the 1st
                    </div>
                    {currentNode.kitCount != null && Number(currentNode.kitCount) > 0 && currentNode.kitFee ? (
                      <div className="text-xs text-green-700">
                        {currentNode.kitCount} crate{Number(currentNode.kitCount) !== 1 ? 's' : ''} × {formatCurrency(parseFloat(String(currentNode.kitFee)))} per crate
                      </div>
                    ) : (
                      <div className="text-xs text-green-700">
                        For hosting an active GridMart Node
                      </div>
                    )}
                  </div>
                </div>
                {(() => {
                  const status = getAvailabilityStatus(defaultSchedule, overrides);
                  if (status.available) {
                    return (
                      <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                        Available Now
                      </Badge>
                    );
                  } else if (status.nextWindow) {
                    return (
                      <Badge variant="outline" className="border-gray-300 text-gray-600 bg-gray-50">
                        <Clock className="w-3 h-3 mr-2" />
                        Opens {status.nextWindow.day} {status.nextWindow.time}
                      </Badge>
                    );
                  } else {
                    return (
                      <Badge variant="outline" className="border-gray-300 text-gray-500 bg-gray-50">
                        No Schedule Set
                      </Badge>
                    );
                  }
                })()}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="orders" className="space-y-6">
            <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
              <TabsList className="w-max md:w-auto">
                <TabsTrigger value="orders" data-testid="tab-orders">
                  Orders
                </TabsTrigger>
                <TabsTrigger value="crates" data-testid="tab-crates">
                  Crates
                </TabsTrigger>
                <TabsTrigger value="availability" data-testid="tab-availability">
                  Availability
                </TabsTrigger>
                <TabsTrigger value="notifications" data-testid="tab-notifications">
                  Notifications {unreadNotifications.length > 0 && <Badge variant="destructive" className="ml-1 text-xs px-1.5">{unreadNotifications.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="coupons" data-testid="tab-coupons">
                  Coupons {nodeCoupons.length > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5">{nodeCoupons.length}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="manual-sales" data-testid="tab-manual-sales">
                  Manual Sales {manualSales.length > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5">{manualSales.length}</Badge>}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="orders" className="space-y-4">
              <h3 className="font-display font-semibold text-lg">Incoming Orders</h3>
              
              {pendingOrders.length === 0 && readyOrders.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h4 className="font-display font-semibold mb-2">No pending orders</h4>
                    <p className="text-sm text-muted-foreground">
                      New orders will appear here when buyers select your Node
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {[...pendingOrders, ...readyOrders].map((order: any) => (
                    <Card key={order.id} data-testid={`card-node-order-${order.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-display font-semibold">{order.pickupCode || order.id}</span>
                              <Badge className={order.status === 'ready' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>
                                {order.status === 'ready' ? 'Ready for Pickup' : 'New'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {order.buyerName} • {order.buyerEmail}
                            </div>
                            {order.createdAt && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Ordered: {new Date(order.createdAt).toLocaleString('en-US', { 
                                  timeZone: 'America/Toronto',
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true
                                })}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">
                              {(order.items || []).reduce((sum: number, item: any) => sum + item.quantity, 0)} items
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-sm mb-4">
                          {order.pickupDate && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              <span>
                                {formatDate(order.pickupDate)}{order.pickupTime ? `, ${order.pickupTime}` : ''}
                              </span>
                            </div>
                          )}
                          <Badge variant="outline">
                            Code: {order.pickupCode}
                          </Badge>
                        </div>

                        {(order.readyAt || order.customerArrivedAt) && (
                          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                            {order.readyAt && (
                              <span>Ready: {new Date(order.readyAt).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                            )}
                            {order.customerArrivedAt && (
                              <span>HERE: {new Date(order.customerArrivedAt).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                            )}
                            {order.readyAt && order.customerArrivedAt && (
                              <span className="font-medium text-foreground">
                                Ready→HERE: {Math.round((new Date(order.customerArrivedAt).getTime() - new Date(order.readyAt).getTime()) / 60000)} min
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-sm mb-4">
                          {(order.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 bg-muted/50 rounded-lg px-2 py-1">
                              <span className="font-mono font-bold text-primary">
                                {item.product?.productCode || 'GM-XXX'}
                              </span>
                              <span className="text-muted-foreground">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2">
                          {(order.status === 'paid' || order.status === 'confirmed') && (
                            <Button
                              size="sm"
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              data-testid={`button-mark-ready-${order.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Mark Ready for Pickup
                            </Button>
                          )}
                          {order.status === 'ready' && (
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700"
                              onClick={() => updateOrderStatus(order.id, 'picked_up')}
                              data-testid={`button-mark-picked-up-${order.id}`}
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Mark as Picked Up
                            </Button>
                          )}
                          <ChatDialog
                            orderId={order.id}
                            orderLabel={order.pickupCode || order.id}
                            currentUserType="node"
                            currentUserName={currentNode.name}
                            otherPartyName={order.buyerName}
                            triggerSize="sm"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Completed Orders Section */}
              <div className="mt-8 pt-8 border-t">
                <h3 className="font-display font-semibold text-lg mb-4">Completed Orders</h3>
                
                {completedOrders.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <CheckCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Completed orders will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {completedOrders.map((order: any) => {
                      const isCancelled = order.status === 'cancelled' || order.status === 'canceled';
                      return (
                      <Collapsible key={order.id}>
                        <Card className={isCancelled ? "bg-red-50/30 border-red-200" : "bg-muted/30"} data-testid={`card-completed-order-${order.id}`}>
                          <CollapsibleTrigger asChild>
                            <CardContent className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCancelled ? 'bg-red-100' : 'bg-green-100'}`}>
                                    {isCancelled ? (
                                      <XCircle className="w-4 h-4 text-red-600" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4 text-green-600" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold">{order.pickupCode || order.id}</span>
                                      <Badge className={isCancelled ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}>
                                        {isCancelled ? 'Cancelled' : 'Picked Up'}
                                      </Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      {order.buyerName} • {(order.items || []).reduce((sum: number, item: any) => sum + item.quantity, 0)} items
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  {!isCancelled && (
                                    <span className="font-semibold text-green-600">
                                      +${calculateOrderEarnings(order).toFixed(2)}
                                    </span>
                                  )}
                                  <span className="text-sm text-muted-foreground">
                                    {order.pickupDate && formatDate(order.pickupDate)}
                                  </span>
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </div>
                            </CardContent>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="px-4 pb-4 border-t pt-3">
                              <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                                <div>
                                  <span className="text-muted-foreground">Customer:</span>
                                  <p className="font-medium">{order.buyerName}</p>
                                  <p className="text-muted-foreground">{order.buyerEmail}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Pickup Time:</span>
                                  <p className="font-medium">{order.pickupTime || 'N/A'}</p>
                                </div>
                              </div>
                              {(order.readyAt || order.customerArrivedAt || order.pickedUpAt) && (
                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-3 bg-muted/50 rounded-lg p-2">
                                  {order.readyAt && (
                                    <span>Ready: {new Date(order.readyAt).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                  )}
                                  {order.customerArrivedAt && (
                                    <span>HERE: {new Date(order.customerArrivedAt).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                  )}
                                  {order.pickedUpAt && (
                                    <span>Pickup: {new Date(order.pickedUpAt).toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                  )}
                                  {order.readyAt && order.customerArrivedAt && (
                                    <span className="font-medium text-foreground">Ready→HERE: {Math.round((new Date(order.customerArrivedAt).getTime() - new Date(order.readyAt).getTime()) / 60000)} min</span>
                                  )}
                                </div>
                              )}
                              <div className="text-sm">
                                <span className="text-muted-foreground">Products:</span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {(order.items || []).map((item: any, idx: number) => (
                                    <div key={idx} className="flex items-center gap-2 bg-muted rounded-lg px-2 py-1">
                                      <span className="font-mono font-bold text-primary">
                                        {item.product?.productCode || 'GM-XXX'}
                                      </span>
                                      <span className="text-muted-foreground">×{item.quantity}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    );
                    })}
                  </div>
                )}
              </div>

            </TabsContent>

            <TabsContent value="crates" className="space-y-4">
              <div>
                <h3 className="font-display font-semibold text-lg">Assigned Crates</h3>
                <p className="text-sm text-muted-foreground">
                  Crates assigned to your node containing products to fulfill
                </p>
              </div>
              
              {nodeCrateAssignments.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h4 className="font-display font-semibold mb-2">No crates assigned</h4>
                    <p className="text-sm text-muted-foreground">
                      Crates will appear here when assigned by admin
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {/* Active Crates */}
                  {nodeCrateAssignments.filter(a => a.status === 'active').length > 0 && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Active</h4>
                      {nodeCrateAssignments
                        .filter(a => a.status === 'active')
                        .map(assignment => (
                          <Card key={assignment.id} data-testid={`card-crate-${assignment.id}`} className="border-primary/30">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-display font-semibold">{assignment.crate?.name || 'Crate'}</h4>
                                  {assignment.crate?.description && (
                                    <p className="text-sm text-muted-foreground">{assignment.crate.description}</p>
                                  )}
                                </div>
                                <Badge className="bg-primary text-primary-foreground">Active</Badge>
                              </div>
                              {assignment.crate && (
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground mb-2">
                                      <ChevronDown className="w-4 h-4" />
                                      {assignment.crate.items.length} product{assignment.crate.items.length !== 1 ? 's' : ''} in crate
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    {(() => {
                                      const items = assignment.crate.items;
                                      const maxLen = Math.max(...items.map(item => 
                                        ((item.productCode || 'N/A') + ' x' + item.quantity).length
                                      ));
                                      const colWidth = Math.max(maxLen * 0.6 + 1.5, 6);
                                      return (
                                        <div 
                                          className="grid gap-1.5 mb-3"
                                          style={{ 
                                            gridTemplateColumns: `repeat(5, ${colWidth}rem)`,
                                          }}
                                        >
                                          {items.map((item) => (
                                            <div 
                                              key={item.productCode || item.productId} 
                                              className="text-xs font-mono bg-muted/50 border rounded px-2 py-1 text-center whitespace-nowrap"
                                            >
                                              {item.productCode || 'N/A'} <span className="text-muted-foreground">x{item.quantity}</span>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  Assigned {new Date(assignment.assignedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}
                  
                  {/* Inactive (Assigned but not yet activated) */}
                  {nodeCrateAssignments.filter(a => a.status === 'inactive').length > 0 && (
                    <div className="space-y-4">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Assigned – Pending Activation</h4>
                      {nodeCrateAssignments
                        .filter(a => a.status === 'inactive')
                        .map(assignment => (
                          <Card key={assignment.id} data-testid={`card-crate-inactive-${assignment.id}`} className="border-dashed border-muted-foreground/30 opacity-80">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div>
                                  <h4 className="font-display font-semibold">{assignment.crate?.name || 'Crate'}</h4>
                                  {assignment.crate?.description && (
                                    <p className="text-sm text-muted-foreground">{assignment.crate.description}</p>
                                  )}
                                </div>
                                <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
                              </div>
                              {assignment.crate && (
                                <Collapsible>
                                  <CollapsibleTrigger asChild>
                                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground mb-2">
                                      <ChevronDown className="w-4 h-4" />
                                      {assignment.crate.items.length} product{assignment.crate.items.length !== 1 ? 's' : ''} in crate
                                    </Button>
                                  </CollapsibleTrigger>
                                  <CollapsibleContent>
                                    {(() => {
                                      const items = assignment.crate.items;
                                      const maxLen = Math.max(...items.map(item => 
                                        ((item.productCode || 'N/A') + ' x' + item.quantity).length
                                      ));
                                      const colWidth = Math.max(maxLen * 0.6 + 1.5, 6);
                                      return (
                                        <div 
                                          className="grid gap-1.5 mb-3"
                                          style={{ 
                                            gridTemplateColumns: `repeat(5, ${colWidth}rem)`,
                                          }}
                                        >
                                          {items.map((item) => (
                                            <div 
                                              key={item.productCode || item.productId} 
                                              className="text-xs font-mono bg-muted/50 border rounded px-2 py-1 text-center whitespace-nowrap"
                                            >
                                              {item.productCode || 'N/A'} <span className="text-muted-foreground">x{item.quantity}</span>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </CollapsibleContent>
                                </Collapsible>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">
                                  Assigned {new Date(assignment.assignedAt).toLocaleDateString()}
                                </span>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}

                  {/* Completed Crates */}
                  {nodeCrateAssignments.filter(a => a.status === 'completed').length > 0 && (
                    <div className="space-y-4 mt-6">
                      <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">Completed</h4>
                      {nodeCrateAssignments
                        .filter(a => a.status === 'completed')
                        .map(assignment => (
                          <Card key={assignment.id} className="opacity-75" data-testid={`card-crate-completed-${assignment.id}`}>
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h4 className="font-display font-medium">{assignment.crate?.name || 'Crate'}</h4>
                                  <span className="text-xs text-muted-foreground">
                                    Completed {assignment.completedAt && new Date(assignment.completedAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <Badge variant="secondary">Completed</Badge>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="availability" className="space-y-6">
              <div>
                <h3 className="font-display font-semibold text-lg">Weekly Availability</h3>
                <p className="text-sm text-muted-foreground">
                  Set your pickup windows for each day by dragging across time slots.
                </p>
              </div>

              <TimeBlockGrid
                schedule={defaultSchedule}
                onChange={(newSchedule) => {
                  const converted: DefaultSchedule = {
                    Monday: [],
                    Tuesday: [],
                    Wednesday: [],
                    Thursday: [],
                    Friday: [],
                    Saturday: [],
                    Sunday: [],
                  };
                  for (const [day, blocks] of Object.entries(newSchedule)) {
                    converted[day as keyof DefaultSchedule] = blocks.map((b) => ({
                      id: `${day}-${b.startTime}-${b.endTime}`,
                      startTime: b.startTime,
                      endTime: b.endTime,
                    }));
                  }
                  setDefaultSchedule(converted);
                }}
                lockHours={effectiveLockHours}
              />

              <div className="flex items-center gap-2">
                <Badge variant={hasMinimumHours ? 'default' : 'destructive'}>
                  {totalDefaultHours} hour{totalDefaultHours !== 1 ? 's' : ''}/week
                </Badge>
                {!hasMinimumHours && (
                  <span className="text-sm text-destructive">Minimum {minimumHoursRequired} hours required</span>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  data-testid="button-save-availability"
                  onClick={handleSaveAvailability}
                  disabled={isSavingAvailability || isClearingAvailability || !hasMinimumHours}
                >
                  {isSavingAvailability ? 'Saving...' : 'Save Availability'}
                </Button>
                <Button 
                  variant="destructive"
                  data-testid="button-clear-all-availability"
                  onClick={handleClearAllAvailability}
                  disabled={isSavingAvailability || isClearingAvailability}
                >
                  {isClearingAvailability ? 'Clearing...' : 'Clear All'}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4">
              <h3 className="font-display font-semibold text-lg">Notifications</h3>
              {myNotifications.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Bell className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <h4 className="font-display font-semibold mb-2">No notifications</h4>
                    <p className="text-sm">Messages from admin will appear here</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {myNotifications.map((notif: any) => (
                    <Card key={notif.id} className={notif.read ? 'opacity-60' : 'border-primary/30 bg-primary/5'} data-testid={`notification-${notif.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{notif.title}</span>
                              {!notif.read && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">New</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{notif.message}</p>
                            <span className="text-xs text-muted-foreground mt-2 block">
                              {new Date(notif.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {!notif.read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                try {
                                  await fetch(`/api/notifications/${notif.id}/read`, { method: 'PATCH' });
                                  queryClient.invalidateQueries({ queryKey: ['myNotifications'] });
                                } catch {}
                              }}
                              data-testid={`mark-read-${notif.id}`}
                            >
                              Mark Read
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="coupons" className="space-y-4">
              <h3 className="font-display font-semibold text-lg">Your Coupons</h3>
              <p className="text-sm text-muted-foreground">
                Share these coupon codes with friends and family. They can enter the code at checkout to receive a discount.
                Check the box next to each code once you've given it to someone.
              </p>
              
              {nodeCoupons.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h4 className="font-display font-semibold mb-2">No coupons yet</h4>
                    <p className="text-sm text-muted-foreground">
                      When the admin assigns coupons to you, they'll appear here for you to share
                    </p>
                  </CardContent>
                </Card>
              ) : (() => {
                const batchGroups: Record<string, any[]> = {};
                const standalone: any[] = [];
                nodeCoupons.forEach((c: any) => {
                  if (c.batchId) {
                    if (!batchGroups[c.batchId]) batchGroups[c.batchId] = [];
                    batchGroups[c.batchId].push(c);
                  } else {
                    standalone.push(c);
                  }
                });
                const batchEntries = Object.entries(batchGroups);

                const renderCouponCard = (coupon: any, isBatched = false) => {
                  const isExpired = coupon.validTo && new Date(coupon.validTo) < new Date();
                  const isMaxedOut = coupon.maxUses && coupon.usedCount >= coupon.maxUses;
                  const isRedeemed = coupon.usedCount > 0;
                  const isActive = coupon.status === 'active' && !isExpired && !isMaxedOut;

                  const discountLabel = [
                    coupon.discountType === 'percentage' ? `${coupon.discountValue}% off` : '',
                    coupon.discountType === 'fixed' ? `$${parseFloat(coupon.discountValue).toFixed(2)} off` : '',
                    coupon.discountType === 'free_gift' ? 'Free gift included' : '',
                    coupon.discountType === 'gift_choice' ? 'Choose a free gift' : '',
                    coupon.discountType === 'combo' ? 'Combo deal' : '',
                  ].filter(Boolean).join('');
                  const minLabel = coupon.minOrderAmount ? ` (min $${parseFloat(coupon.minOrderAmount).toFixed(2)})` : '';

                  return (
                    <Card key={coupon.id} className={!isActive ? 'opacity-60' : ''} data-testid={`coupon-card-${coupon.id}`}>
                      <CardContent className="p-3 md:p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Tag className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-medium">{discountLabel}{minLabel}</span>
                          {coupon.validTo && <span className="text-xs ml-auto">Exp: {new Date(coupon.validTo).toLocaleDateString()}</span>}
                        </div>

                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!coupon.givenOut}
                            disabled={isRedeemed}
                            onCheckedChange={async (checked) => {
                              try {
                                const res = await fetch(`/api/promo-codes/${coupon.id}/given-out`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ givenOut: !!checked }),
                                });
                                if (!res.ok) throw new Error('Failed to update');
                                queryClient.invalidateQueries({ queryKey: ['nodeCoupons', currentNode.id] });
                              } catch {
                                toast.error('Failed to update coupon status');
                              }
                            }}
                            data-testid={`given-out-${coupon.id}`}
                          />
                          <div className={`px-2.5 py-1 rounded-md text-sm font-mono font-bold tracking-wider flex-1 truncate ${
                            isActive ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {coupon.code}
                          </div>
                          {!isBatched && coupon.name && (
                            <span className="text-xs text-muted-foreground truncate max-w-[120px]">{coupon.name}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          {isRedeemed ? (
                            <Badge variant="default" className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-xs">Redeemed</Badge>
                          ) : coupon.givenOut ? (
                            <Badge variant="default" className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-xs">Given Out</Badge>
                          ) : isActive ? (
                            <Badge variant="default" className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">Available</Badge>
                          ) : isExpired ? (
                            <Badge variant="secondary" className="text-xs">Expired</Badge>
                          ) : isMaxedOut ? (
                            <Badge variant="secondary" className="text-xs">Used Up</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                          {coupon.maxUses && (
                            <span className="text-xs text-muted-foreground">{coupon.usedCount || 0}/{coupon.maxUses} uses</span>
                          )}
                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => {
                                navigator.clipboard.writeText(coupon.code);
                                toast.success('Coupon code copied!');
                              }}
                              data-testid={`copy-coupon-${coupon.id}`}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </Button>
                            {isActive && !isRedeemed && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs px-2"
                                onClick={() => {
                                  setSmsGiftCouponId(smsGiftCouponId === coupon.id ? null : coupon.id);
                                  setSmsGiftPhone('');
                                }}
                                data-testid={`sms-gift-${coupon.id}`}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                SMS
                              </Button>
                            )}
                          </div>
                        </div>

                        {smsGiftCouponId === coupon.id && (
                          <div className="flex gap-2 items-center">
                            <Input
                              placeholder="Phone number (e.g. 6471234567)"
                              value={smsGiftPhone}
                              onChange={(e) => setSmsGiftPhone(e.target.value)}
                              className="flex-1 text-sm h-8"
                              data-testid={`sms-phone-${coupon.id}`}
                            />
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={smsGiftSending || !smsGiftPhone.trim()}
                              onClick={async () => {
                                setSmsGiftSending(true);
                                try {
                                  const res = await fetch(`/api/promo-codes/${coupon.id}/send-sms`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ phone: smsGiftPhone.trim() }),
                                  });
                                  const data = await res.json();
                                  if (!res.ok) throw new Error(data.error || 'Failed to send');
                                  toast.success('Coupon sent via SMS!');
                                  setSmsGiftCouponId(null);
                                  setSmsGiftPhone('');
                                  queryClient.invalidateQueries({ queryKey: ['nodeCoupons', currentNode.id] });
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to send SMS');
                                } finally {
                                  setSmsGiftSending(false);
                                }
                              }}
                              data-testid={`sms-send-${coupon.id}`}
                            >
                              {smsGiftSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                            </Button>
                          </div>
                        )}

                        {coupon.description && (
                          <div className="text-xs text-muted-foreground">{coupon.description}</div>
                        )}
                      </CardContent>
                    </Card>
                  );
                };

                return (
                  <div className="space-y-6">
                    {batchEntries.map(([batchId, codes]) => {
                      const givenCount = codes.filter((c: any) => c.givenOut).length;
                      const redeemedCount = codes.filter((c: any) => c.usedCount > 0).length;
                      return (
                        <div key={batchId} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <h4 className="font-display font-semibold text-sm">{codes[0]?.name || 'Batch Codes'}</h4>
                              <Badge variant="outline" className="text-xs">{codes.length} codes</Badge>
                            </div>
                            <div className="flex gap-3 text-xs text-muted-foreground">
                              <span>{givenCount} given out</span>
                              <span>{redeemedCount} redeemed</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {codes.map((c: any) => renderCouponCard(c, true))}
                          </div>
                        </div>
                      );
                    })}
                    {standalone.length > 0 && batchEntries.length > 0 && (
                      <Separator />
                    )}
                    {standalone.length > 0 && (
                      <div className="space-y-2">
                        {batchEntries.length > 0 && (
                          <h4 className="font-display font-semibold text-sm">Individual Codes</h4>
                        )}
                        {standalone.map(renderCouponCard)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </TabsContent>

            <TabsContent value="manual-sales" className="space-y-4">
              <h3 className="font-display font-semibold text-lg">Manual Sales</h3>
              <p className="text-sm text-muted-foreground">
                Offline sales recorded by the admin and assigned to your node for payment tracking.
              </p>

              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-muted-foreground">Total Manual Sales</div>
                      <div className="text-2xl font-display font-bold">{formatCurrency(manualSalesTotal)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">Sales Count</div>
                      <div className="text-2xl font-display font-bold">{manualSales.length}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {manualSales.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <DollarSign className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h4 className="font-display font-semibold mb-2">No manual sales</h4>
                    <p className="text-sm text-muted-foreground">
                      Manual sales assigned to your node will appear here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {manualSales
                    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                    .map((sale: any) => (
                    <Card key={sale.id} data-testid={`card-manual-sale-${sale.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-display font-semibold">{sale.pickupCode || sale.id.slice(0, 8)}</span>
                              <Badge variant="outline" className="text-xs">
                                {sale.saleSource === 'facebook' ? 'Facebook' : sale.saleSource === 'kijiji' ? 'Kijiji' : sale.saleSource === 'manual' ? 'Manual' : sale.saleSource || 'Manual'}
                              </Badge>
                            </div>
                            {sale.buyerName && sale.buyerName !== 'Cash Customer' && (
                              <div className="text-sm text-muted-foreground mt-1">{sale.buyerName}</div>
                            )}
                            {(sale.buyerPhone || sale.buyerEmail) && (
                              <div className="text-xs text-muted-foreground">
                                {sale.buyerPhone && <span>{sale.buyerPhone}</span>}
                                {sale.buyerPhone && sale.buyerEmail && <span> · </span>}
                                {sale.buyerEmail && <span>{sale.buyerEmail}</span>}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-display font-bold text-lg">{formatCurrency(parseFloat(sale.total) || 0)}</div>
                            <div className="text-xs text-muted-foreground">
                              {sale.paymentMethod === 'cash' ? 'Cash' : sale.paymentMethod === 'e_transfer' ? 'E-Transfer' : sale.paymentMethod || 'N/A'}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                          {(sale.items || []).map((item: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-1 bg-muted/50 rounded px-2 py-0.5">
                              <span className="font-mono text-xs font-bold text-primary">
                                {item.product?.productCode || 'GM-XXX'}
                              </span>
                              <span className="text-muted-foreground text-xs">×{item.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{new Date(sale.createdAt).toLocaleDateString('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          {sale.saleNotes && <span className="italic">"{sale.saleNotes}"</span>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
