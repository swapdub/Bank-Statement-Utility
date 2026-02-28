import { useState, useEffect } from "react";
import {
  ArrowLeftRight,
  Check,
  X,
  RotateCcw,
  Loader2,
  Unlink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
}

function TransferPairCard({
  link,
  actions,
}: {
  link: TransferLink;
  actions: React.ReactNode;
}) {
  const d = link.debit_txn;
  const c = link.credit_txn;
  return (
    <div className="rounded-lg border p-3">
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center mb-2">
        {/* Debit side */}
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            {d.bank_name} · {d.account_type}
          </p>
          <p className="text-sm font-medium truncate" title={d.description}>
            {d.description}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{formatDate(d.transaction_date)}</span>
            <span className="font-mono text-sm text-red-600">
              {d.debit_amount ? `−${formatINR(d.debit_amount)}` : ""}
            </span>
          </div>
        </div>
        {/* Arrow */}
        <div className="flex flex-col items-center gap-0.5">
          <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
          {link.confidence != null && (
            <span className="text-[10px] text-muted-foreground">
              {Math.round(link.confidence * 100)}%
            </span>
          )}
        </div>
        {/* Credit side */}
        <div className="space-y-0.5 text-right">
          <p className="text-xs text-muted-foreground">
            {c.bank_name} · {c.account_type}
          </p>
          <p className="text-sm font-medium truncate" title={c.description}>
            {c.description}
          </p>
          <div className="flex items-center justify-end gap-2">
            <span className="font-mono text-sm text-green-600">
              {c.credit_amount ? `+${formatINR(c.credit_amount)}` : ""}
            </span>
            <span className="text-xs text-muted-foreground">{formatDate(c.transaction_date)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t pt-2">
        {actions}
      </div>
    </div>
  );
}

export default function TransferReviewDialog({ open, onOpenChange, onChanged }: Props) {
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
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" />
            Transfer Links
          </DialogTitle>
          <DialogDescription>
            Review detected transfers between your accounts. Confirmed transfers are excluded from spending analytics.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
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
              <TabsContent value="suggested" className="space-y-3 mt-4">
                {suggestions.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">
                    No pending suggestions. Run detection to scan for transfers.
                  </p>
                ) : (
                  suggestions.map((link) => (
                    <TransferPairCard
                      key={link.id}
                      link={link}
                      actions={
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-600 hover:text-red-700"
                            disabled={actionLoading === link.id}
                            onClick={() => handleDeny(link.id)}
                          >
                            <X className="mr-1 h-3 w-3" /> Dismiss
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={actionLoading === link.id}
                            onClick={() => handleConfirm(link.id)}
                          >
                            {actionLoading === link.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="mr-1 h-3 w-3" />
                            )}
                            Confirm
                          </Button>
                        </>
                      }
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="confirmed" className="space-y-3 mt-4">
                {confirmed.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">
                    No confirmed transfers yet.
                  </p>
                ) : (
                  confirmed.map((link) => (
                    <TransferPairCard
                      key={link.id}
                      link={link}
                      actions={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-red-600 hover:text-red-700"
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

              <TabsContent value="denied" className="space-y-3 mt-4">
                {denied.length === 0 ? (
                  <p className="text-center py-6 text-sm text-muted-foreground">
                    No dismissed suggestions.
                  </p>
                ) : (
                  denied.map((link) => (
                    <TransferPairCard
                      key={link.id}
                      link={link}
                      actions={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
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
      </DialogContent>
    </Dialog>
  );
}
