import { useCallback, useEffect, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import StatCard from "../components/ui/StatCard";
import UploadCSV from "../components/UploadCSV";
import TradeTextImport from "../components/TradeTextImport";
import AdminTradeTable from "../components/AdminTradeTable";
import tradeService from "../services/tradeService";
import { useAuth } from "../context/AuthContext";

function AdminPage() {
  const { user } = useAuth();
  const [trades, setTrades] = useState(() => tradeService.peekAllTrades() || []);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(() => !tradeService.peekAllTrades());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const loadTrades = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const data = await tradeService.getAllTrades();
      setTrades(data);
      setSelectedIds((current) => current.filter((id) => data.some((trade) => trade.id === id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrades();
  }, [loadTrades]);

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
    setMessage("");

    try {
      await tradeService.updateTrade(tradeId, payload);
      setMessage("Trade updated successfully.");
      await loadTrades();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(tradeId) {
    const confirmed = window.confirm("Delete this trade?");

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setMessage("");

    try {
      await tradeService.deleteTrade(tradeId);
      setSelectedIds((current) => current.filter((id) => id !== tradeId));
      setMessage("Trade deleted successfully.");
      await loadTrades();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(`Delete ${selectedIds.length} selected trades?`);

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.bulkDeleteTrades(selectedIds);
      setSelectedIds([]);
      setMessage(`Deleted ${result.deletedCount} trades.`);
      await loadTrades();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleDeleteAll() {
    const confirmed = window.confirm("Delete all trades in the system? This cannot be undone.");

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.deleteAllTrades("all");
      setSelectedIds([]);
      setMessage(`Deleted ${result.deletedCount} trades.`);
      await loadTrades();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleUpload(file) {
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.importTrades(file);
      setMessage(
        `Imported ${result.insertedCount} trades${result.errorCount ? ` with ${result.errorCount} row errors` : ""}.`
      );
      await loadTrades();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTextImport(text) {
    setIsUploading(true);
    setError("");
    setMessage("");

    try {
      const result = await tradeService.importTradesFromText(text);
      setMessage(
        `Imported ${result.insertedCount} trades${result.errorCount ? ` with ${result.errorCount} row errors` : ""}.`
      );
      await loadTrades();
    } catch (err) {
      setError(err.message);
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
              className="ui-button border-coral/35 bg-coral/10 text-sm text-coral hover:bg-coral/20"
            >
              {isDeleting ? "Deleting..." : `Bulk Delete (${selectedIds.length})`}
            </button>
            <button
              type="button"
              onClick={handleDeleteAll}
              disabled={isDeleting || trades.length === 0}
              className="ui-button border-coral/35 bg-coral/10 text-sm text-coral hover:bg-coral/20"
            >
              Delete All Trades
            </button>
          </div>
        }
      >
        {message && <div className="ui-notice mb-4">{message}</div>}
        {error && <div className="ui-notice border-coral/30 bg-coral/10 text-coral">{error}</div>}

        {loading ? (
          <div className="text-sm text-mist">Loading admin data...</div>
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
