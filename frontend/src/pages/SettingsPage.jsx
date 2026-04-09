import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import LoadingState from "../components/ui/LoadingState";
import EmptyState from "../components/ui/EmptyState";
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
import tradeService from "../services/tradeService";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";

function SettingsPage() {
  const { user, updateSettings, refreshSettings } = useAuth();
  const { notify, confirm } = useNotifications();
  const [activeSection, setActiveSection] = useState("library");
  const [tags, setTags] = useState(() => tagService.peekTags() || []);
  const [strategies, setStrategies] = useState(() => strategyService.peekStrategies() || []);
  const [newTag, setNewTag] = useState("");
  const [newStrategy, setNewStrategy] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [selectedStrategyIds, setSelectedStrategyIds] = useState([]);
  const [defaultCommission, setDefaultCommission] = useState(String(user?.defaultCommission ?? 0));
  const [defaultFees, setDefaultFees] = useState(String(user?.defaultFees ?? 0));
  const [loading, setLoading] = useState(() => !tagService.peekTags() || !strategyService.peekStrategies());
  const [savingTag, setSavingTag] = useState(false);
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);
  const [deletingAllTrades, setDeletingAllTrades] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingStrategyId, setDeletingStrategyId] = useState(null);
  const [bulkDeletingTags, setBulkDeletingTags] = useState(false);
  const [bulkDeletingStrategies, setBulkDeletingStrategies] = useState(false);
  const [error, setError] = useState("");

  async function loadTags(options = {}) {
    if (!tagService.peekTags() || options.forceRefresh) {
      setLoading(true);
    }

    setError("");

    try {
      const data = await tagService.getTags(options);
      setTags(data);
      setSelectedTagIds((current) => current.filter((id) => data.some((tag) => tag.id === id)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadStrategies(options = {}) {
    if (!strategyService.peekStrategies() || options.forceRefresh) {
      setLoading(true);
    }

    setError("");

    try {
      const data = await strategyService.getStrategies(options);
      setStrategies(data);
      setSelectedStrategyIds((current) =>
        current.filter((id) => data.some((strategy) => strategy.id === id))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTags();
    loadStrategies();
    refreshSettings().catch(() => {});
  }, []);

  useEffect(() => {
    setDefaultCommission(String(user?.defaultCommission ?? 0));
    setDefaultFees(String(user?.defaultFees ?? 0));
  }, [user?.defaultCommission, user?.defaultFees]);

  async function handleCreateTag() {
    const name = newTag.trim();

    if (!name) {
      return;
    }

    setSavingTag(true);
    setError("");

    try {
      await tagService.createTag(name);
      setNewTag("");
      notify({ title: "Tag saved", description: `"${name}" is now available across the app.`, tone: "success" });
      await loadTags({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not save tag", description: err.message, tone: "error" });
    } finally {
      setSavingTag(false);
    }
  }

  async function handleCreateStrategy() {
    const name = newStrategy.trim();

    if (!name) {
      return;
    }

    setSavingStrategy(true);
    setError("");

    try {
      await strategyService.createStrategy(name);
      setNewStrategy("");
      notify({
        title: "Strategy saved",
        description: `"${name}" is now available across the app.`,
        tone: "success"
      });
      await loadStrategies({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not save strategy", description: err.message, tone: "error" });
    } finally {
      setSavingStrategy(false);
    }
  }

  async function handleDeleteTag(tag) {
    const confirmed = await confirm({
      title: "Delete saved tag?",
      description: `"${tag.name}" will be removed from your saved tag list.`,
      confirmLabel: "Delete Tag",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setDeletingId(tag.id);
    setError("");

    try {
      await tagService.deleteTag(tag.id);
      notify({ title: "Tag deleted", description: `"${tag.name}" was removed.`, tone: "success" });
      await loadTags({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete tag", description: err.message, tone: "error" });
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDeleteTags() {
    if (selectedTagIds.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: "Delete selected tags?",
      description: `This will remove ${selectedTagIds.length} saved ${
        selectedTagIds.length === 1 ? "tag" : "tags"
      } from your tag list.`,
      confirmLabel: "Delete Selected",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setBulkDeletingTags(true);
    setError("");

    try {
      await tagService.deleteTags(selectedTagIds);
      setSelectedTagIds([]);
      notify({
        title: "Tags deleted",
        description: `${selectedTagIds.length} ${
          selectedTagIds.length === 1 ? "tag was" : "tags were"
        } removed.`,
        tone: "success"
      });
      await loadTags({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete tags", description: err.message, tone: "error" });
    } finally {
      setBulkDeletingTags(false);
    }
  }

  async function handleDeleteStrategy(strategy) {
    const confirmed = await confirm({
      title: "Delete saved strategy?",
      description: `"${strategy.name}" will be removed from your saved strategy list.`,
      confirmLabel: "Delete Strategy",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setDeletingStrategyId(strategy.id);
    setError("");

    try {
      await strategyService.deleteStrategy(strategy.id);
      notify({
        title: "Strategy deleted",
        description: `"${strategy.name}" was removed.`,
        tone: "success"
      });
      await loadStrategies({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete strategy", description: err.message, tone: "error" });
    } finally {
      setDeletingStrategyId(null);
    }
  }

  async function handleBulkDeleteStrategies() {
    if (selectedStrategyIds.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: "Delete selected strategies?",
      description: `This will remove ${selectedStrategyIds.length} saved ${
        selectedStrategyIds.length === 1 ? "strategy" : "strategies"
      } from your strategy list.`,
      confirmLabel: "Delete Selected",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setBulkDeletingStrategies(true);
    setError("");

    try {
      await strategyService.deleteStrategies(selectedStrategyIds);
      setSelectedStrategyIds([]);
      notify({
        title: "Strategies deleted",
        description: `${selectedStrategyIds.length} ${
          selectedStrategyIds.length === 1 ? "strategy was" : "strategies were"
        } removed.`,
        tone: "success"
      });
      await loadStrategies({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete strategies", description: err.message, tone: "error" });
    } finally {
      setBulkDeletingStrategies(false);
    }
  }

  function toggleTagSelection(tagId) {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    );
  }

  function toggleStrategySelection(strategyId) {
    setSelectedStrategyIds((current) =>
      current.includes(strategyId)
        ? current.filter((id) => id !== strategyId)
        : [...current, strategyId]
    );
  }

  async function handleSaveCommission() {
    const commissionValue = Number(defaultCommission);
    const feeValue = Number(defaultFees);

    if (Number.isNaN(commissionValue) || commissionValue < 0) {
      setError("Default commission must be 0 or greater.");
      return;
    }

    if (Number.isNaN(feeValue) || feeValue < 0) {
      setError("Default fees must be 0 or greater.");
      return;
    }

    setSavingCommission(true);
    setError("");

    try {
      await updateSettings({
        defaultCommission: commissionValue,
        defaultFees: feeValue
      });
      notify({
        title: "Trade costs updated",
        description: "Default commission and fees were saved.",
        tone: "success"
      });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not save trade costs", description: err.message, tone: "error" });
    } finally {
      setSavingCommission(false);
    }
  }

  async function handleDeleteAllTrades() {
    const confirmed = await confirm({
      title: "Delete all trades?",
      description: "This will permanently remove all of your trades. This action cannot be undone.",
      confirmLabel: "Delete All Trades",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setDeletingAllTrades(true);
    setError("");

    try {
      const result = await tradeService.deleteAllTrades();
      notify({
        title: "All trades deleted",
        description: `Deleted ${result.deletedCount} ${result.deletedCount === 1 ? "trade" : "trades"}.`,
        tone: "success"
      });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete all trades", description: err.message, tone: "error" });
    } finally {
      setDeletingAllTrades(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>}

      <Card
        title="SETTINGS"
        subtitle="Manage reusable workspace values and account-wide defaults."
      >
        <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
          <aside className="ui-panel p-4">
            <div className="space-y-2">
              <div className="ui-title text-[11px] text-white/48">Navigation</div>
              <button
                type="button"
                onClick={() => setActiveSection("library")}
                className={`flex w-full items-center justify-between rounded-[6px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "library"
                    ? "border border-[var(--line)] bg-[#1f1f1f] text-white shadow-[inset_0_0_0_1px_rgb(31,31,31)]"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Trade Library</span>
                <span className="text-white/40">{tags.length + strategies.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("costs")}
                className={`flex w-full items-center justify-between rounded-[6px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "costs"
                    ? "border border-[var(--line)] bg-[#1f1f1f] text-white shadow-[inset_0_0_0_1px_rgb(31,31,31)]"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Trade Costs</span>
                <span className="text-white/40">
                  {(Number(user?.defaultCommission ?? 0) + Number(user?.defaultFees ?? 0)).toFixed(2)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("data")}
                className={`flex w-full items-center justify-between rounded-[6px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "data"
                    ? "border border-[var(--line)] bg-[#1f1f1f] text-white shadow-[inset_0_0_0_1px_rgb(31,31,31)]"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Data Management</span>
                <span className="text-white/40">1</span>
              </button>
            </div>
          </aside>

          {activeSection === "library" ? (
            <div className="space-y-6">
              <Card title="TAGS">
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <input
                      value={newTag}
                      onChange={(event) => setNewTag(event.target.value)}
                      placeholder="Add a new tag"
                      className="ui-input"
                    />
                    <button
                      type="button"
                      onClick={handleCreateTag}
                      disabled={savingTag || !newTag.trim()}
                      className="ui-button whitespace-nowrap px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingTag ? "Saving..." : "Add Tag"}
                    </button>
                  </div>

                  <p className="text-sm text-white/58">
                    Manage the shared tag list here. Trades can only select from this saved set.
                  </p>

                  {!!tags.length && (
                    <div className="ui-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/62">
                        <span>{selectedTagIds.length} selected</span>
                        <button
                          type="button"
                          onClick={() => setSelectedTagIds(tags.map((tag) => tag.id))}
                          className="ui-chip"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedTagIds([])}
                          className="ui-chip"
                          disabled={selectedTagIds.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                    <button
                      type="button"
                      onClick={handleBulkDeleteTags}
                      disabled={selectedTagIds.length === 0 || bulkDeletingTags}
                      className="ui-button-danger px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkDeletingTags ? "Deleting..." : `Delete${selectedTagIds.length ? ` (${selectedTagIds.length})` : ""}`}
                    </button>
                    </div>
                  )}

                  {loading ? (
                    <LoadingState label="Loading tags..." className="min-h-[180px]" />
                  ) : tags.length === 0 ? (
                    <EmptyState
                      title="No saved tags yet"
                      description="Create a few reusable tags here and they will be available from each trade."
                    />
                  ) : (
                    <div className="grid auto-rows-min items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {tags.map((tag) => (
                        <div
                          key={tag.id}
                          className={`ui-panel self-start flex items-center justify-between gap-3 rounded-[6px] px-4 py-3 transition ${
                            selectedTagIds.includes(tag.id)
                              ? "border-[var(--line)] bg-[#1f1f1f]"
                              : ""
                          }`}
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedTagIds.includes(tag.id)}
                              onChange={() => toggleTagSelection(tag.id)}
                              className="h-4 w-4 rounded border border-[var(--line-strong)] bg-transparent accent-[var(--accent)]"
                            />
                            <span className="truncate text-sm text-white/82">{tag.name}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(tag)}
                            disabled={deletingId === tag.id || bulkDeletingTags}
                            className="rounded-[6px] border border-coral/35 bg-coral/10 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/15 disabled:opacity-50"
                          >
                            {deletingId === tag.id ? "..." : "Delete"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>

              <Card title="STRATEGIES">
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <input
                      value={newStrategy}
                      onChange={(event) => setNewStrategy(event.target.value)}
                      placeholder="Add a new strategy"
                      className="ui-input"
                    />
                    <button
                      type="button"
                      onClick={handleCreateStrategy}
                      disabled={savingStrategy || !newStrategy.trim()}
                      className="ui-button whitespace-nowrap px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingStrategy ? "Saving..." : "Add Strategy"}
                    </button>
                  </div>

                  <p className="text-sm text-white/58">
                    Manage the shared strategy list here. Trades can only select from this saved set.
                  </p>

                  {!!strategies.length && (
                    <div className="ui-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/62">
                        <span>{selectedStrategyIds.length} selected</span>
                        <button
                          type="button"
                          onClick={() => setSelectedStrategyIds(strategies.map((strategy) => strategy.id))}
                          className="ui-chip"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedStrategyIds([])}
                          className="ui-chip"
                          disabled={selectedStrategyIds.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                    <button
                      type="button"
                      onClick={handleBulkDeleteStrategies}
                      disabled={selectedStrategyIds.length === 0 || bulkDeletingStrategies}
                      className="ui-button-danger px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkDeletingStrategies
                        ? "Deleting..."
                        : `Delete${selectedStrategyIds.length ? ` (${selectedStrategyIds.length})` : ""}`}
                    </button>
                    </div>
                  )}

                  {loading ? (
                    <LoadingState label="Loading strategies..." className="min-h-[180px]" />
                  ) : strategies.length === 0 ? (
                    <EmptyState
                      title="No saved strategies yet"
                      description="Create reusable strategies here and they will be available from each trade."
                    />
                  ) : (
                    <div className="grid auto-rows-min items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {strategies.map((strategy) => (
                        <div
                          key={strategy.id}
                          className={`ui-panel self-start flex items-center justify-between gap-3 rounded-[6px] px-4 py-3 transition ${
                            selectedStrategyIds.includes(strategy.id)
                              ? "border-[var(--line)] bg-[#1f1f1f]"
                              : ""
                          }`}
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedStrategyIds.includes(strategy.id)}
                              onChange={() => toggleStrategySelection(strategy.id)}
                              className="h-4 w-4 rounded border border-[var(--line-strong)] bg-transparent accent-[var(--accent)]"
                            />
                            <span className="truncate text-sm text-white/82">{strategy.name}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteStrategy(strategy)}
                            disabled={deletingStrategyId === strategy.id || bulkDeletingStrategies}
                            className="rounded-[6px] border border-coral/35 bg-coral/10 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/15 disabled:opacity-50"
                          >
                            {deletingStrategyId === strategy.id ? "..." : "Delete"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          ) : activeSection === "costs" ? (
            <Card title="TRADE COSTS">
                <div className="space-y-5">
                  <p className="text-sm text-white/58">
                    Set default fallback trade costs. These are used whenever a trade does not already contain explicit fees from imports or manual entry.
                  </p>

                  <div className="grid max-w-[720px] gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-medium text-white/72">Default commission per trade</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={defaultCommission}
                        onChange={(event) => setDefaultCommission(event.target.value)}
                        className="ui-input"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-medium text-white/72">Default fees per trade</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={defaultFees}
                        onChange={(event) => setDefaultFees(event.target.value)}
                        className="ui-input"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveCommission}
                      disabled={savingCommission}
                      className="ui-button-solid px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingCommission ? "Saving..." : "Save"}
                    </button>
                    <span className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-sm text-white/50">
                      Current total: $
                      {(
                        Number(user?.defaultCommission ?? 0) + Number(user?.defaultFees ?? 0)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>
              </Card>
          ) : (
              <Card title="WORKSPACE DATA">
                <div className="space-y-5">
                  <p className="text-sm text-white/58">
                    Permanently remove all trades from your workspace. This action cannot be undone.
                  </p>

                  <button
                    type="button"
                    onClick={handleDeleteAllTrades}
                    disabled={deletingAllTrades}
                    className="ui-button-danger px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingAllTrades ? "Deleting..." : "Delete All Trades"}
                  </button>
                </div>
              </Card>
          )}
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
