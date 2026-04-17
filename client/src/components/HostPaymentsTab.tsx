import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, DollarSign, Calendar, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface HostPayment {
  id: string;
  nodeId: string;
  amount: string;
  method: string;
  memo: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string;
  createdAt: string;
}

interface NodeInfo {
  id: string;
  name: string;
  userId: string;
}

export default function HostPaymentsTab() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<HostPayment | null>(null);
  const [filterNodeId, setFilterNodeId] = useState<string>('all');

  const [formData, setFormData] = useState({
    nodeId: '',
    amount: '',
    method: 'etransfer',
    memo: '',
    periodStart: '',
    periodEnd: '',
    paidAt: new Date().toISOString().split('T')[0],
  });

  const { data: payments = [] } = useQuery<HostPayment[]>({
    queryKey: ['/api/host-payments'],
    queryFn: async () => {
      const res = await fetch('/api/host-payments');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const { data: allNodes = [] } = useQuery<NodeInfo[]>({
    queryKey: ['/api/nodes'],
    queryFn: async () => {
      const res = await fetch('/api/nodes');
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch('/api/host-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/host-payments'] });
      toast.success('Payment logged');
      resetForm();
    },
    onError: () => toast.error('Failed to log payment'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`/api/host-payments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/host-payments'] });
      toast.success('Payment updated');
      resetForm();
    },
    onError: () => toast.error('Failed to update payment'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/host-payments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/host-payments'] });
      toast.success('Payment deleted');
    },
    onError: () => toast.error('Failed to delete payment'),
  });

  const resetForm = () => {
    setFormData({
      nodeId: '',
      amount: '',
      method: 'etransfer',
      memo: '',
      periodStart: '',
      periodEnd: '',
      paidAt: new Date().toISOString().split('T')[0],
    });
    setEditingPayment(null);
    setShowDialog(false);
  };

  const handleSubmit = () => {
    if (!formData.nodeId || !formData.amount) {
      toast.error('Please select a host and enter an amount');
      return;
    }

    const payload = {
      nodeId: formData.nodeId,
      amount: formData.amount,
      method: formData.method,
      memo: formData.memo || null,
      periodStart: formData.periodStart || null,
      periodEnd: formData.periodEnd || null,
      paidAt: formData.paidAt ? new Date(formData.paidAt).toISOString() : new Date().toISOString(),
    };

    if (editingPayment) {
      updateMutation.mutate({ id: editingPayment.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const startEdit = (payment: HostPayment) => {
    setEditingPayment(payment);
    setFormData({
      nodeId: payment.nodeId,
      amount: payment.amount,
      method: payment.method,
      memo: payment.memo || '',
      periodStart: payment.periodStart || '',
      periodEnd: payment.periodEnd || '',
      paidAt: payment.paidAt ? new Date(payment.paidAt).toISOString().split('T')[0] : '',
    });
    setShowDialog(true);
  };

  const getNodeName = (nodeId: string) => {
    const node = allNodes.find(n => n.id === nodeId);
    return node?.name || 'Unknown';
  };

  const methodLabels: Record<string, string> = {
    etransfer: 'e-Transfer',
    cash: 'Cash',
    cheque: 'Cheque',
    direct_deposit: 'Direct Deposit',
    other: 'Other',
  };

  const filteredPayments = filterNodeId === 'all'
    ? payments
    : payments.filter(p => p.nodeId === filterNodeId);

  const totalPaid = filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

  const uniqueNodes = [...new Set(payments.map(p => p.nodeId))];
  const nodePaymentTotals = uniqueNodes.map(nodeId => ({
    nodeId,
    name: getNodeName(nodeId),
    total: payments.filter(p => p.nodeId === nodeId).reduce((sum, p) => sum + parseFloat(p.amount), 0),
    count: payments.filter(p => p.nodeId === nodeId).length,
  })).sort((a, b) => b.total - a.total);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" data-testid="text-payments-title">Host Payments</h2>
          <p className="text-sm text-muted-foreground">Track payments made to node hosts</p>
        </div>
        <Button onClick={() => { resetForm(); setShowDialog(true); }} data-testid="button-log-payment">
          <Plus className="w-4 h-4 mr-1" />
          Log Payment
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-paid">${totalPaid.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Hosts Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-hosts-paid">{uniqueNodes.length}</div>
            <p className="text-xs text-muted-foreground">unique host{uniqueNodes.length !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-payment">
              ${filteredPayments.length > 0 ? (totalPaid / filteredPayments.length).toFixed(2) : '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">per payment</p>
          </CardContent>
        </Card>
      </div>

      {nodePaymentTotals.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payment Summary by Host</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {nodePaymentTotals.map(({ nodeId, name, total, count }) => (
                <div key={nodeId} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">{count} payment{count !== 1 ? 's' : ''}</span>
                    <span className="font-semibold">${total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Label className="text-sm whitespace-nowrap">Filter by host:</Label>
        <Select value={filterNodeId} onValueChange={setFilterNodeId}>
          <SelectTrigger className="w-[200px]" data-testid="select-filter-node">
            <SelectValue placeholder="All hosts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All hosts</SelectItem>
            {allNodes.map(node => (
              <SelectItem key={node.id} value={node.id}>{node.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredPayments.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No payments logged yet</p>
          <p className="text-sm">Click "Log Payment" to record a payment to a host</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Host</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Memo</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map(payment => (
                <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                  <TableCell className="whitespace-nowrap">
                    {new Date(payment.paidAt).toLocaleDateString('en-CA')}
                  </TableCell>
                  <TableCell className="font-medium">{getNodeName(payment.nodeId)}</TableCell>
                  <TableCell className="font-semibold text-green-700">${parseFloat(payment.amount).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {methodLabels[payment.method] || payment.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {payment.periodStart && payment.periodEnd
                      ? `${payment.periodStart} – ${payment.periodEnd}`
                      : payment.periodStart || payment.periodEnd || '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                    {payment.memo || '—'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(payment)} data-testid={`button-edit-payment-${payment.id}`}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700"
                        onClick={() => {
                          if (confirm('Delete this payment record?')) {
                            deleteMutation.mutate(payment.id);
                          }
                        }}
                        data-testid={`button-delete-payment-${payment.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPayment ? 'Edit Payment' : 'Log Payment'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Host *</Label>
              <Select value={formData.nodeId} onValueChange={v => setFormData(prev => ({ ...prev, nodeId: v }))}>
                <SelectTrigger data-testid="select-payment-node">
                  <SelectValue placeholder="Select host" />
                </SelectTrigger>
                <SelectContent>
                  {allNodes.map(node => (
                    <SelectItem key={node.id} value={node.id}>{node.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Amount ($) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                data-testid="input-payment-amount"
              />
            </div>

            <div>
              <Label>Method</Label>
              <Select value={formData.method} onValueChange={v => setFormData(prev => ({ ...prev, method: v }))}>
                <SelectTrigger data-testid="select-payment-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="etransfer">e-Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="direct_deposit">Direct Deposit</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Date Paid</Label>
              <Input
                type="date"
                value={formData.paidAt}
                onChange={e => setFormData(prev => ({ ...prev, paidAt: e.target.value }))}
                data-testid="input-payment-date"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Period Start</Label>
                <Input
                  type="date"
                  value={formData.periodStart}
                  onChange={e => setFormData(prev => ({ ...prev, periodStart: e.target.value }))}
                  data-testid="input-period-start"
                />
              </div>
              <div>
                <Label>Period End</Label>
                <Input
                  type="date"
                  value={formData.periodEnd}
                  onChange={e => setFormData(prev => ({ ...prev, periodEnd: e.target.value }))}
                  data-testid="input-period-end"
                />
              </div>
            </div>

            <div>
              <Label>Memo</Label>
              <Input
                placeholder="e.g., January hosting fee"
                value={formData.memo}
                onChange={e => setFormData(prev => ({ ...prev, memo: e.target.value }))}
                data-testid="input-payment-memo"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-payment"
              >
                {editingPayment ? 'Update' : 'Log Payment'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
