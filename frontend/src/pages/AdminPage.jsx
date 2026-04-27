import { useCallback, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import LoadingState from "../components/ui/LoadingState";
import StatCard from "../components/ui/StatCard";
import UploadCSV from "../components/UploadCSV";
import TradeTextImport from "../components/TradeTextImport";
import AdminTradeTable from "../components/AdminTradeTable";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";

function AdminPage() {
  const { user } = useAuth();
  const { notify, confirm } = useNotifications();
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const loadTrades = useCallback(async () => tradeService.getAllTrades(), [user?.activeAccountScope]);
  const {
    data: trades,
    setData: setTrades,
    loading,
    error,
    setError,
    reload: reloadTrades
  } = useCachedAsyncResource({
    peek: () => tradeService.peekAllTrades(),
    load: loadTrades,
    initialValue: [],
    deps: [loadTrades]
  });

  function toggleSelection(tradeId) {
    setSelectedIds((current) =>
      current.includes(tradeId)
        ? current.filter((id) => id !== tradeId)
        : [...current, tradeId]
    );
  }

  function toggleAll(visibleTrades, shouldSelectAll) {
    setSelectedIds(shouldSelectAll ? visibleTrades.map((trade) => trade.id) : []);
  }

  async function handleSave(tradeId, payload) {
    setIsSaving(true);
    setError("");

    try {
      await tradeService.updateTrade(tradeId, payload);
      notify({ title: "Trade updated", description: "The trade was updated successfully.", tone: "success" });
      const data = await reloadTrades();
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not update trade", description: err.message, tone: "error" });
      throw err;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tradeId) {
    const confirmed = await confirm({
      title: "Delete trade?",
      description: "This trade will be removed from the system.",
      confirmLabel: "Delete Trade",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      await tradeService.deleteTrade(tradeId);
      setSelectedIds((current) => current.filter((id) => id !== tradeId));
      notify({ title: "Trade deleted", description: "The trade was removed.", tone: "success" });
      const data = await reloadTrades();
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete trade", description: err.message, tone: "error" });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: "Delete selected trades?",
      description: `This will permanently remove ${selectedIds.length} selected ${
        selectedIds.length === 1 ? "trade" : "trades"
      }.`,
      confirmLabel: "Delete Selected",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const result = await tradeService.bulkDeleteTrades(selectedIds);
      setSelectedIds([]);
      notify({
        title: "Trades deleted",
        description: `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "trade" : "trades"}.`,
        tone: "success"
      });
      const data = await reloadTrades();
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete selected trades", description: err.message, tone: "error" });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteAll() {
    const confirmed = await confirm({
      title: "Delete all trades?",
      description: "This will permanently remove all trades in the system. This cannot be undone.",
      confirmLabel: "Delete All",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");

    try {
      const result = await tradeService.deleteAllTrades("all");
      setSelectedIds([]);
      notify({
        title: "All trades deleted",
        description: `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "trade" : "trades"}.`,
        tone: "success"
      });
      await reloadTrades();
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete all trades", description: err.message, tone: "error" });
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleUpload(file) {
    setIsUploading(true);
    setError("");

    try {
      const result = await tradeService.importTrades(file);
      notify({
        title: "CSV import complete",
        description: `Imported ${result.insertedCount} trades${
          result.errorCount ? ` with ${result.errorCount} row errors` : ""
        }.`,
        tone: result.errorCount ? "warning" : "success"
      });
      const data = await reloadTrades();
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
      notify({ title: "CSV import failed", description: err.message, tone: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTextImport(text) {
    setIsUploading(true);
    setError("");

    try {
      const result = await tradeService.importTradesFromText(text);
      notify({
        title: "Text import complete",
        description: `Imported ${result.insertedCount} trades${
          result.errorCount ? ` with ${result.errorCount} row errors` : ""
        }.`,
        tone: result.errorCount ? "warning" : "success"
      });
      const data = await reloadTrades();
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
      notify({ title: "Text import failed", description: err.message, tone: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard label="Admin Role" value={user?.role || "ADMIN"} accent="gold" />
        <StatCard label="Visible Trades" value={trades.length} accent="mint" />
        <StatCard label="Selected" value={selectedIds.length} accent="coral" />
      </div>

      <Card
        title="Manual CSV Upload"
        subtitle="Import trades from a CSV using the same authenticated upload flow as the journal workspace."
      >
        <UploadCSV onUpload={handleUpload} isUploading={isUploading} />
      </Card>

      <Card
        title="Text Trade Import"
        subtitle="Paste raw execution lines and let the importer collapse fills into completed trades."
      >
        <TradeTextImport onImport={handleTextImport} isImporting={isUploading} />
      </Card>

      <Card
        title="Admin Panel"
        subtitle="Review all trades, edit rows inline, remove entries, or bulk delete selected trades."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleBulkDelete}
              disabled={selectedIds.length === 0 || isDeleting}
              className="ui-button border-coral/35 bg-[linear-gradient(180deg,#452222,#2d1616)] text-sm text-coral hover:brightness-110"
            >
              {isDeleting ? "Deleting..." : `Bulk Delete (${selectedIds.length})`}
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={isDeleting || trades.length === 0}
              className="ui-button border-coral/35 bg-[linear-gradient(180deg,#452222,#2d1616)] text-sm text-coral hover:brightness-110"
            >
              Delete All Trades
            </button>
          </div>
        }
      >
        {error && <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>}

        {loading ? (
          <LoadingState label="Loading admin data..." className="min-h-[220px]" />
        ) : trades.length === 0 ? (
          <EmptyState
            title="No trades available"
            description="Trades will appear here once users start journaling or uploading CSV history."
          />
        ) : (
          <AdminTradeTable
            trades={trades}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
            onToggleAll={toggleAll}
            onSave={handleSave}
            onDelete={handleDelete}
            isSaving={isSaving}
            isDeleting={isDeleting}
          />
        )}
      </Card>
    </div>
  );
}

export default AdminPage;
