import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DollarSign, Copy, Trash2, ExternalLink, Loader2, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export default function PaymentLinksSection() {
  const queryClient = useQueryClient();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const { data: paymentLinks = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/payment-links'],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { amount: string; memo: string; customerEmail: string }) => {
      const res = await fetch('/api/payment-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create');
      return res.json();
    },
    onSuccess: (link) => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-links'] });
      setShowCreateDialog(false);
      setAmount('');
      setMemo('');
      setCustomerEmail('');
      if (link.url) {
        navigator.clipboard.writeText(link.url);
        toast.success('Payment link created and copied to clipboard!');
      } else {
        toast.success('Payment link created!');
      }
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to create payment link');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/payment-links/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/payment-links'] });
      toast.success('Payment link deleted');
    },
  });

  const handleCreate = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    createMutation.mutate({ amount, memo, customerEmail });
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard!');
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge data-testid="badge-status-paid" className="bg-green-100 text-green-800">Paid</Badge>;
      case 'expired':
        return <Badge data-testid="badge-status-expired" variant="secondary">Expired</Badge>;
      case 'cancelled':
        return <Badge data-testid="badge-status-cancelled" variant="destructive">Cancelled</Badge>;
      default:
        return <Badge data-testid="badge-status-pending" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
    }
  };

  return (
    <Card data-testid="card-payment-links">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Payment Links
        </CardTitle>
        <Button
          data-testid="button-create-payment-link"
          size="sm"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Generate Link
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : paymentLinks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No payment links yet. Generate one to send to a customer.
          </div>
        ) : (
          <div className="space-y-3">
            {paymentLinks.map((link: any) => (
              <div
                key={link.id}
                data-testid={`row-payment-link-${link.id}`}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-lg" data-testid={`text-amount-${link.id}`}>
                      ${parseFloat(link.amount).toFixed(2)}
                    </span>
                    {statusBadge(link.status)}
                  </div>
                  {link.memo && (
                    <p className="text-sm text-muted-foreground mt-0.5" data-testid={`text-memo-${link.id}`}>
                      {link.memo}
                    </p>
                  )}
                  {link.customerEmail && (
                    <p className="text-xs text-muted-foreground">
                      {link.customerEmail}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Created: {new Date(link.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    {link.paidAt && (
                      <span className="text-green-600">
                        Paid: {new Date(link.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {link.url && link.status === 'pending' && (
                    <>
                      <Button
                        data-testid={`button-copy-link-${link.id}`}
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => copyLink(link.url)}
                        title="Copy link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        data-testid={`button-open-link-${link.id}`}
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(link.url, '_blank')}
                        title="Open link"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    data-testid={`button-delete-link-${link.id}`}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => deleteMutation.mutate(link.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Payment Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="pl-amount">Amount ($) *</Label>
              <Input
                id="pl-amount"
                data-testid="input-payment-link-amount"
                type="number"
                step="0.01"
                min="0.50"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pl-memo">Memo / Description</Label>
              <Input
                id="pl-memo"
                data-testid="input-payment-link-memo"
                placeholder="e.g., Order #ABC123 payment"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pl-email">Customer Email (optional)</Label>
              <Input
                id="pl-email"
                data-testid="input-payment-link-email"
                type="email"
                placeholder="customer@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              data-testid="button-submit-payment-link"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <DollarSign className="h-4 w-4 mr-1" />
              )}
              Generate & Copy Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
