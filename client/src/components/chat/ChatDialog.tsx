import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChat } from '@/lib/store';

interface ChatDialogProps {
  orderId: string;
  orderLabel: string;
  currentUserType: 'buyer' | 'node';
  currentUserName: string;
  otherPartyName: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerSize?: 'default' | 'sm' | 'lg' | 'icon';
  triggerClassName?: string;
}

export function ChatDialog({
  orderId,
  orderLabel,
  currentUserType,
  currentUserName,
  otherPartyName,
  triggerVariant = 'outline',
  triggerSize = 'sm',
  triggerClassName = '',
}: ChatDialogProps) {
  const [open, setOpen] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const { messages, sendMessage } = useChat(orderId);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const handleSend = () => {
    if (newMessage.trim()) {
      sendMessage(currentUserType, currentUserName, newMessage.trim());
      setNewMessage('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString();
  };

  let lastDate = '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          data-testid={`button-chat-${orderId}`}
        >
          <MessageCircle className="w-4 h-4 mr-2" />
          Contact {currentUserType === 'buyer' ? 'Node Host' : 'Buyer'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Chat - {orderLabel}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col h-[400px]">
          <div className="text-sm text-muted-foreground mb-2 px-1">
            Chatting with: <span className="font-medium text-foreground">{otherPartyName}</span>
          </div>
          
          <ScrollArea className="flex-1 border rounded-lg p-3 mb-3" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No messages yet. Start the conversation!
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => {
                  const msgDate = formatDate(msg.timestamp);
                  const showDate = msgDate !== lastDate;
                  lastDate = msgDate;

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="text-center text-xs text-muted-foreground my-2">
                          {msgDate}
                        </div>
                      )}
                      <div
                        className={`flex ${msg.senderType === currentUserType ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 ${
                            msg.senderType === currentUserType
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                          data-testid={`message-${msg.id}`}
                        >
                          <div className="text-xs opacity-70 mb-1">
                            {msg.senderName} • {formatTime(msg.timestamp)}
                          </div>
                          <div className="text-sm">{msg.message}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="flex gap-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button
              onClick={handleSend}
              disabled={!newMessage.trim()}
              size="icon"
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
