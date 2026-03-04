import { useState, useEffect } from "react";
import {
  ArrowLeftRight,
  Check,
  X,
  RotateCcw,
  Loader2,
  Unlink,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import type { TransferLink } from "@/lib/types";
import { formatINR, formatDate } from "@/lib/format";
import {
  getTransferSuggestions,
  getConfirmedTransfers,
  getDeniedTransfers,
  confirmTransfer,
  denyTransfer,
  restoreTransfer,
  unlinkTransfer,
} from "@/lib/api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void; // refresh transactions after actions
  onGoToTransaction?: (txnId: number, txnDate: string) => void;
}

/** A single transaction side (debit or credit) inside the pair card. */
function TxnSide({
  txn,
  type,
  onView,
}: {
  txn: TransferLink["debit_txn"];
  type: "debit" | "credit";
  onView?: () => void;
}) {
  return (
    <div className="rounded-md bg-muted/40 p-3 space-y-1.5 min-w-0">
      <div className="flex items-center gap-1.5 flex-wrap justify-between">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none">
            {txn.bank_name}
          </span>
          <span className="text-[11px] text-muted-foreground">{txn.account_type}</span>
        </div>
        {onView && (
          <button
            onClick={onView}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            title="View in Transactions"
          >
            <ExternalLink className="h-3 w-3" /> View
          </button>
        )}
      </div>
      {/* Description — wraps, never truncates */}
      <p className="text-sm font-medium leading-snug break-words">{txn.description}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">{formatDate(txn.transaction_date)}</span>
        {type === "debit" && txn.debit_amount != null && (
          <span className="font-mono text-sm font-semibold text-red-600">
            −{formatINR(txn.debit_amount)}
          </span>
        )}
        {type === "credit" && txn.credit_amount != null && (
          <span className="font-mono text-sm font-semibold text-green-600">
            +{formatINR(txn.credit_amount)}
          </span>
        )}
      </div>
    </div>
  );
}

function TransferPairCard({
  link,
  actions,
  onGoToTransaction,
}: {
  link: TransferLink;
  actions: React.ReactNode;
  onGoToTransaction?: (txnId: number, txnDate: string) => void;
}) {
  return (
    <div className="rounded-lg border bg-card">
      {/* Transaction pair */}
      <div className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-stretch gap-2">
          {/* Debit side */}
          <div className="flex-1 min-w-0">
            <TxnSide
              txn={link.debit_txn}
              type="debit"
              onView={onGoToTransaction ? () => onGoToTransaction(link.debit_txn.id, link.debit_txn.transaction_date) : undefined}
            />
          </div>
          {/* Arrow + confidence */}
          <div className="flex sm:flex-col items-center justify-center gap-1 py-1 sm:py-0 sm:px-1">
            <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            {link.confidence != null && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {Math.round(link.confidence * 100)}% match
              </span>
            )}
          </div>
          {/* Credit side */}
          <div className="flex-1 min-w-0">
            <TxnSide
              txn={link.credit_txn}
              type="credit"
              onView={onGoToTransaction ? () => onGoToTransaction(link.credit_txn.id, link.credit_txn.transaction_date) : undefined}
            />
          </div>
        </div>
      </div>
      {/* Actions footer */}
      <div className="flex items-center justify-end gap-2 border-t px-4 py-2.5 bg-muted/20 rounded-b-lg">
        {actions}
      </div>
    </div>
  );
}

export default function TransferReviewDialog({ open, onOpenChange, onChanged, onGoToTransaction }: Props) {
  const [tab, setTab] = useState<"suggested" | "confirmed" | "denied">("suggested");
  const [suggestions, setSuggestions] = useState<TransferLink[]>([]);
  const [confirmed, setConfirmed] = useState<TransferLink[]>([]);
  const [denied, setDenied] = useState<TransferLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, c, d] = await Promise.all([
        getTransferSuggestions(),
        getConfirmedTransfers(),
        getDeniedTransfers(),
      ]);
      setSuggestions(s);
      setConfirmed(c);
      setDenied(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadData();
  }, [open]);

  const handleConfirm = async (linkId: number) => {
    setActionLoading(linkId);
    try {
      await confirmTransfer(linkId);
      toast.success("Transfer confirmed");
      await loadData();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeny = async (linkId: number) => {
    setActionLoading(linkId);
    try {
      await denyTransfer(linkId);
      toast.success("Suggestion dismissed");
      await loadData();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deny");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestore = async (linkId: number) => {
    setActionLoading(linkId);
    try {
      await restoreTransfer(linkId);
      toast.success("Suggestion restored");
      await loadData();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlink = async (linkId: number) => {
    setActionLoading(linkId);
    try {
      await unlinkTransfer(linkId);
      toast.success("Transfer unlinked");
      await loadData();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl flex flex-col max-h-[90vh] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Transfer Links
          </DialogTitle>
          <DialogDescription>
            Review detected transfers between your accounts. Confirmed transfers are excluded from spending analytics.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6 flex flex-col flex-1 min-h-0 overflow-hidden">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="suggested">
              Suggestions{suggestions.length > 0 && ` (${suggestions.length})`}
            </TabsTrigger>
            <TabsTrigger value="confirmed">
              Confirmed{confirmed.length > 0 && ` (${confirmed.length})`}
            </TabsTrigger>
            <TabsTrigger value="denied">
              Dismissed{denied.length > 0 && ` (${denied.length})`}
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <TabsContent value="suggested" className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
                {suggestions.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">
                    No pending suggestions. Run detection to scan for transfers.
                  </p>
                ) : (
                  suggestions.map((link) => (
                    <TransferPairCard
                      key={link.id}
                      link={link}
                      onGoToTransaction={onGoToTransaction}
                      actions={
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs text-red-600 hover:text-red-700"
                            disabled={actionLoading === link.id}
                            onClick={() => handleDeny(link.id)}
                          >
                            <X className="mr-1 h-3 w-3" /> Dismiss
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={actionLoading === link.id}
                            onClick={() => handleConfirm(link.id)}
                          >
                            {actionLoading === link.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-3 w-3" />
                            )}
                            Confirm Transfer
                          </Button>
                        </>
                      }
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="confirmed" className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
                {confirmed.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">
                    No confirmed transfers yet.
                  </p>
                ) : (
                  confirmed.map((link) => (
                    <TransferPairCard
                      key={link.id}
                      link={link}
                      onGoToTransaction={onGoToTransaction}
                      actions={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-red-600 hover:text-red-700"
                          disabled={actionLoading === link.id}
                          onClick={() => handleUnlink(link.id)}
                        >
                          {actionLoading === link.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Unlink className="mr-1 h-3 w-3" />
                          )}
                          Unlink
                        </Button>
                      }
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="denied" className="flex-1 overflow-y-auto mt-4 space-y-3 pr-1">
                {denied.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">
                    No dismissed suggestions.
                  </p>
                ) : (
                  denied.map((link) => (
                    <TransferPairCard
                      key={link.id}
                      link={link}
                      onGoToTransaction={onGoToTransaction}
                      actions={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          disabled={actionLoading === link.id}
                          onClick={() => handleRestore(link.id)}
                        >
                          {actionLoading === link.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="mr-1 h-3 w-3" />
                          )}
                          Restore
                        </Button>
                      }
                    />
                  ))
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
