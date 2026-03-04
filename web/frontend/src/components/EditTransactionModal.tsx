import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Transaction } from "@/lib/types";
import { updateTransaction } from "@/lib/api";

interface Props {
  transaction: Transaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Transaction) => void;
}

interface FormState {
  transaction_date: string;
  description: string;
  debit_amount: string;
  credit_amount: string;
  closing_balance: string;
  value_date: string;
  cheque_ref_number: string;
}

function toFormState(t: Transaction): FormState {
  return {
    transaction_date: t.transaction_date ?? "",
    description: t.description ?? "",
    debit_amount: t.debit_amount != null ? String(t.debit_amount) : "",
    credit_amount: t.credit_amount != null ? String(t.credit_amount) : "",
    closing_balance: t.closing_balance != null ? String(t.closing_balance) : "",
    value_date: t.value_date ?? "",
    cheque_ref_number: t.cheque_ref_number ?? "",
  };
}

export function EditTransactionModal({ transaction, open, onOpenChange, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    transaction_date: "",
    description: "",
    debit_amount: "",
    credit_amount: "",
    closing_balance: "",
    value_date: "",
    cheque_ref_number: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      setForm(toFormState(transaction));
      setError(null);
    }
  }, [transaction]);

  function set(field: keyof FormState, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave() {
    if (!transaction) return;
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        transaction_date: form.transaction_date || null,
        description: form.description,
        debit_amount: form.debit_amount !== "" ? Number(form.debit_amount) : null,
        credit_amount: form.credit_amount !== "" ? Number(form.credit_amount) : null,
        closing_balance: form.closing_balance !== "" ? Number(form.closing_balance) : null,
        value_date: form.value_date || null,
        cheque_ref_number: form.cheque_ref_number || null,
        clear_debit: form.debit_amount === "",
        clear_credit: form.credit_amount === "",
        clear_balance: form.closing_balance === "",
        clear_value_date: form.value_date === "",
        clear_cheque_ref: form.cheque_ref_number === "",
      };
      const updated = await updateTransaction(transaction.id, payload);
      onSaved(updated);
      onOpenChange(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
        </DialogHeader>

        {/* Read-only info */}
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground space-y-0.5 mb-2">
          <div><span className="font-medium">Bank:</span> {transaction.bank_name}</div>
          <div><span className="font-medium">Account:</span> {transaction.account_type}</div>
        </div>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-date">Date</Label>
              <Input
                id="edit-date"
                type="date"
                value={form.transaction_date}
                onChange={(e) => set("transaction_date", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-value-date">Value Date</Label>
              <Input
                id="edit-value-date"
                type="date"
                value={form.value_date}
                onChange={(e) => set("value_date", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-desc">Description</Label>
            <textarea
              id="edit-desc"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="edit-debit">Debit</Label>
              <Input
                id="edit-debit"
                type="number"
                step="0.01"
                placeholder="–"
                value={form.debit_amount}
                onChange={(e) => set("debit_amount", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-credit">Credit</Label>
              <Input
                id="edit-credit"
                type="number"
                step="0.01"
                placeholder="–"
                value={form.credit_amount}
                onChange={(e) => set("credit_amount", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-balance">Balance</Label>
              <Input
                id="edit-balance"
                type="number"
                step="0.01"
                placeholder="–"
                value={form.closing_balance}
                onChange={(e) => set("closing_balance", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-cheque">Cheque / Ref No.</Label>
            <Input
              id="edit-cheque"
              placeholder="–"
              value={form.cheque_ref_number}
              onChange={(e) => set("cheque_ref_number", e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
