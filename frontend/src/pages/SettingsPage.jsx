import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import LoadingState from "../components/ui/LoadingState";
import EmptyState from "../components/ui/EmptyState";
import tagService from "../services/tagService";
import strategyService from "../services/strategyService";
import { useAuth } from "../context/AuthContext";

function SettingsPage() {
  const { user, updateSettings, refreshSettings } = useAuth();
  const [activeSection, setActiveSection] = useState("tags");
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
  const [deletingId, setDeletingId] = useState(null);
  const [deletingStrategyId, setDeletingStrategyId] = useState(null);
  const [bulkDeletingTags, setBulkDeletingTags] = useState(false);
  const [bulkDeletingStrategies, setBulkDeletingStrategies] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
    setMessage("");

    try {
      await tagService.createTag(name);
      setNewTag("");
      setMessage("Tag saved.");
      await loadTags({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
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
    setMessage("");

    try {
      await strategyService.createStrategy(name);
      setNewStrategy("");
      setMessage("Strategy saved.");
      await loadStrategies({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingStrategy(false);
    }
  }

  async function handleDeleteTag(tag) {
    const confirmed = window.confirm(`Delete saved tag "${tag.name}" from your tag list?`);

    if (!confirmed) {
      return;
    }

    setDeletingId(tag.id);
    setError("");
    setMessage("");

    try {
      await tagService.deleteTag(tag.id);
      setMessage("Tag deleted.");
      await loadTags({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDeleteTags() {
    if (selectedTagIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedTagIds.length} saved ${selectedTagIds.length === 1 ? "tag" : "tags"} from your tag list?`
    );

    if (!confirmed) {
      return;
    }

    setBulkDeletingTags(true);
    setError("");
    setMessage("");

    try {
      await tagService.deleteTags(selectedTagIds);
      setSelectedTagIds([]);
      setMessage(
        `${selectedTagIds.length} ${selectedTagIds.length === 1 ? "tag" : "tags"} deleted.`
      );
      await loadTags({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkDeletingTags(false);
    }
  }

  async function handleDeleteStrategy(strategy) {
    const confirmed = window.confirm(`Delete saved strategy "${strategy.name}" from your strategy list?`);

    if (!confirmed) {
      return;
    }

    setDeletingStrategyId(strategy.id);
    setError("");
    setMessage("");

    try {
      await strategyService.deleteStrategy(strategy.id);
      setMessage("Strategy deleted.");
      await loadStrategies({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingStrategyId(null);
    }
  }

  async function handleBulkDeleteStrategies() {
    if (selectedStrategyIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedStrategyIds.length} saved ${
        selectedStrategyIds.length === 1 ? "strategy" : "strategies"
      } from your strategy list?`
    );

    if (!confirmed) {
      return;
    }

    setBulkDeletingStrategies(true);
    setError("");
    setMessage("");

    try {
      await strategyService.deleteStrategies(selectedStrategyIds);
      setSelectedStrategyIds([]);
      setMessage(
        `${selectedStrategyIds.length} ${
          selectedStrategyIds.length === 1 ? "strategy" : "strategies"
        } deleted.`
      );
      await loadStrategies({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
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
    setMessage("");

    try {
      await updateSettings({
        defaultCommission: commissionValue,
        defaultFees: feeValue
      });
      setMessage("Default trade costs updated.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingCommission(false);
    }
  }

  return (
    <div className="space-y-6">
      {message && <div className="ui-notice">{message}</div>}
      {error && <div className="ui-notice border-coral/30 bg-[#2a1111] text-coral">{error}</div>}

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
                onClick={() => setActiveSection("tags")}
                className={`flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "tags"
                    ? "border border-[var(--line-strong)] bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Tags</span>
                <span className="text-white/40">{tags.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("commissions")}
                className={`flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "commissions"
                    ? "border border-[var(--line-strong)] bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Commissions</span>
                <span className="text-white/40">
                  {(Number(user?.defaultCommission ?? 0) + Number(user?.defaultFees ?? 0)).toFixed(2)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("strategies")}
                className={`flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "strategies"
                    ? "border border-[var(--line-strong)] bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Strategies</span>
                <span className="text-white/40">{strategies.length}</span>
              </button>
            </div>
          </aside>

          {activeSection === "tags" ? (
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
                    className="ui-button-solid whitespace-nowrap px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
                      {bulkDeletingTags ? "Deleting..." : `Delete Selected${selectedTagIds.length ? ` (${selectedTagIds.length})` : ""}`}
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
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {tags.map((tag) => (
                      <div
                        key={tag.id}
                        className={`ui-panel flex items-center justify-between gap-3 rounded-[16px] px-4 py-3 transition ${
                          selectedTagIds.includes(tag.id)
                            ? "border-[var(--accent)] bg-[rgba(124,92,255,0.08)]"
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
                          className="ui-chip text-coral disabled:opacity-50"
                        >
                          {deletingId === tag.id ? "..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ) : activeSection === "strategies" ? (
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
                    className="ui-button-solid whitespace-nowrap px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
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
                        : `Delete Selected${selectedStrategyIds.length ? ` (${selectedStrategyIds.length})` : ""}`}
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
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {strategies.map((strategy) => (
                      <div
                        key={strategy.id}
                        className={`ui-panel flex items-center justify-between gap-3 rounded-[16px] px-4 py-3 transition ${
                          selectedStrategyIds.includes(strategy.id)
                            ? "border-[var(--accent)] bg-[rgba(124,92,255,0.08)]"
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
                          className="ui-chip text-coral disabled:opacity-50"
                        >
                          {deletingStrategyId === strategy.id ? "..." : "Delete"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card title="COMMISSIONS">
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
                    {savingCommission ? "Saving..." : "Save Costs"}
                  </button>
                  <span className="rounded-[12px] border border-[var(--line)] bg-white/[0.03] px-3 py-2 text-sm text-white/50">
                    Current total: $
                    {(
                      Number(user?.defaultCommission ?? 0) + Number(user?.defaultFees ?? 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
