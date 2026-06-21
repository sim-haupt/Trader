import { useEffect, useState } from "react";
import frontendPackage from "../../package.json";
import Card from "../components/ui/Card";
import LoadingState from "../components/ui/LoadingState";
import EmptyState from "../components/ui/EmptyState";
import authService from "../services/authService";
import tagService from "../services/tagService";
import setupService from "../services/setupService";
import tradeService from "../services/tradeService";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";

const appVersion = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : frontendPackage.version;
const buildSha = typeof __APP_BUILD_SHA__ !== "undefined" ? __APP_BUILD_SHA__ : "unknown";
const buildTime = typeof __APP_BUILD_TIME__ !== "undefined" ? __APP_BUILD_TIME__ : null;

function SettingsPage() {
  const { user, updateSettings, refreshSettings } = useAuth();
  const { notify, confirm } = useNotifications();
  const [backendMeta, setBackendMeta] = useState(null);
  const [activeSection, setActiveSection] = useState("account");
  const [tags, setTags] = useState(() => tagService.peekTags() || []);
  const [setups, setSetups] = useState(() => setupService.peekSetups() || []);
  const [newTag, setNewTag] = useState("");
  const [newSetup, setNewSetup] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [selectedSetupIds, setSelectedSetupIds] = useState([]);
  const [activeAccountScope, setActiveAccountScope] = useState(user?.activeAccountScope ?? "SIMULATOR");
  const [liveDataStartDate, setLiveDataStartDate] = useState(user?.liveDataStartDate ?? "");
  const [loading, setLoading] = useState(() => !tagService.peekTags() || !setupService.peekSetups());
  const [savingTag, setSavingTag] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [deletingAllTrades, setDeletingAllTrades] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingSetupId, setDeletingSetupId] = useState(null);
  const [bulkDeletingTags, setBulkDeletingTags] = useState(false);
  const [bulkDeletingSetups, setBulkDeletingSetups] = useState(false);
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

  async function loadSetups(options = {}) {
    if (!setupService.peekSetups() || options.forceRefresh) {
      setLoading(true);
    }

    setError("");

    try {
      const data = await setupService.getSetups(options);
      setSetups(data);
      setSelectedSetupIds((current) =>
        current.filter((id) => data.some((setup) => setup.id === id))
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTags();
    loadSetups();
    refreshSettings().catch(() => {});
    authService.getMeta().then(setBackendMeta).catch(() => {});
  }, []);

  useEffect(() => {
    setActiveAccountScope(user?.activeAccountScope ?? "SIMULATOR");
    setLiveDataStartDate(user?.liveDataStartDate ?? "");
  }, [user?.activeAccountScope, user?.liveDataStartDate]);

  async function handleSaveAccountSettings() {
    if (activeAccountScope === "LIVE" && !liveDataStartDate) {
      setError("Choose a live account start date before switching to Live.");
      return;
    }

    setSavingAccount(true);
    setError("");

    try {
      await updateSettings({
        activeAccountScope,
        liveDataStartDate: liveDataStartDate || null
      });
      notify({
        title: "Account updated",
        description: `${activeAccountScope === "LIVE" ? "Live" : "Simulator"} is now active.`,
        tone: "success"
      });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not update account", description: err.message, tone: "error" });
    } finally {
      setSavingAccount(false);
    }
  }

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

  async function handleCreateSetup() {
    const name = newSetup.trim();

    if (!name) {
      return;
    }

    setSavingSetup(true);
    setError("");

    try {
      await setupService.createSetup(name);
      setNewSetup("");
      notify({
        title: "Setup saved",
        description: `"${name}" is now available across the app.`,
        tone: "success"
      });
      await loadSetups({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not save setup", description: err.message, tone: "error" });
    } finally {
      setSavingSetup(false);
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

  async function handleDeleteSetup(setup) {
    const confirmed = await confirm({
      title: "Delete saved setup?",
      description: `"${setup.name}" will be removed from your saved setup list.`,
      confirmLabel: "Delete Setup",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setDeletingSetupId(setup.id);
    setError("");

    try {
      await setupService.deleteSetup(setup.id);
      notify({
        title: "Setup deleted",
        description: `"${setup.name}" was removed.`,
        tone: "success"
      });
      await loadSetups({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete setup", description: err.message, tone: "error" });
    } finally {
      setDeletingSetupId(null);
    }
  }

  async function handleBulkDeleteSetups() {
    if (selectedSetupIds.length === 0) {
      return;
    }

    const confirmed = await confirm({
      title: "Delete selected setups?",
      description: `This will remove ${selectedSetupIds.length} saved ${
        selectedSetupIds.length === 1 ? "setup" : "setups"
      } from your setup list.`,
      confirmLabel: "Delete Selected",
      tone: "error"
    });

    if (!confirmed) {
      return;
    }

    setBulkDeletingSetups(true);
    setError("");

    try {
      await setupService.deleteSetups(selectedSetupIds);
      setSelectedSetupIds([]);
      notify({
        title: "Setups deleted",
        description: `${selectedSetupIds.length} ${
          selectedSetupIds.length === 1 ? "setup was" : "setups were"
        } removed.`,
        tone: "success"
      });
      await loadSetups({ forceRefresh: true });
    } catch (err) {
      setError(err.message);
      notify({ title: "Could not delete setups", description: err.message, tone: "error" });
    } finally {
      setBulkDeletingSetups(false);
    }
  }

  function toggleTagSelection(tagId) {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    );
  }

  function toggleSetupSelection(setupId) {
    setSelectedSetupIds((current) =>
      current.includes(setupId)
        ? current.filter((id) => id !== setupId)
        : [...current, setupId]
    );
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
                onClick={() => setActiveSection("account")}
                className={`flex w-full items-center justify-between rounded-[6px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "account"
                    ? "border border-[var(--line)] bg-[#1f1f1f] text-white"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Account</span>
                <span className="text-white/40">{activeAccountScope === "LIVE" ? "Live" : "Sim"}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("library")}
                className={`flex w-full items-center justify-between rounded-[6px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "library"
                    ? "border border-[var(--line)] bg-[#1f1f1f] text-white"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Trade Library</span>
                <span className="text-white/40">{tags.length + setups.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("data")}
                className={`flex w-full items-center justify-between rounded-[6px] px-4 py-3 text-left text-sm transition ${
                  activeSection === "data"
                    ? "border border-[var(--line)] bg-[#1f1f1f] text-white"
                    : "border border-transparent text-white/64 hover:bg-white/[0.03] hover:text-white"
                }`}
              >
                <span>Data Management</span>
                <span className="text-white/40">1</span>
              </button>
            </div>
          </aside>

          {activeSection === "account" ? (
            <Card title="ACCOUNT MODE">
              <div className="space-y-6">
                <p className="text-sm text-white/58">
                  Switch between fully separated Simulator and Live workspaces. New imports and manual trades are always added to the currently active account.
                </p>

                <div className="grid max-w-[720px] gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setActiveAccountScope("SIMULATOR")}
                    className={`rounded-[6px] border px-4 py-4 text-left transition ${
                      activeAccountScope === "SIMULATOR"
                        ? "border-white/18 bg-[#1f1f1f] text-white"
                        : "border-[var(--line)] bg-black text-white/68 hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    <div className="text-sm font-medium text-white">Simulator</div>
                    <div className="mt-2 text-sm text-white/52">
                      Existing trades stay here by default. Use this space for replay, journaling, and paper trading.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveAccountScope("LIVE")}
                    className={`rounded-[6px] border px-4 py-4 text-left transition ${
                      activeAccountScope === "LIVE"
                        ? "border-white/18 bg-[#1f1f1f] text-white"
                        : "border-[var(--line)] bg-black text-white/68 hover:bg-white/[0.03] hover:text-white"
                    }`}
                  >
                    <div className="text-sm font-medium text-white">Live</div>
                    <div className="mt-2 text-sm text-white/52">
                      Keeps live trades completely separate. New live imports only appear here and start with an empty history.
                    </div>
                  </button>
                </div>

                <div className="grid max-w-[720px] gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/72">Active account</label>
                    <div className="ui-panel flex min-h-[46px] items-center px-4 text-sm text-white">
                      {activeAccountScope === "LIVE" ? "Live" : "Simulator"}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-white/72">Live data start date</label>
                    <input
                      type="date"
                      value={liveDataStartDate}
                      onChange={(event) => setLiveDataStartDate(event.target.value)}
                      className="ui-input"
                      disabled={activeAccountScope !== "LIVE"}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveAccountSettings}
                    disabled={savingAccount}
                    className="ui-button-solid px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingAccount ? "Saving..." : "Save"}
                  </button>
                  <span className="rounded-[6px] border border-[var(--line)] bg-black px-3 py-2 text-sm text-white/50">
                    Current mode: {user?.activeAccountScope === "LIVE" ? "Live" : "Simulator"}
                  </span>
                </div>
              </div>
            </Card>
          ) : activeSection === "library" ? (
            <Card title="TRADE LIBRARY">
              <div className="space-y-8">
                <div className="space-y-5">
                  <div className="ui-title text-[11px] text-white/60">Tags</div>
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

                <div className="border-t border-[var(--line)] pt-8">
                  <div className="space-y-5">
                    <div className="ui-title text-[11px] text-white/60">Setups</div>
                  <div className="flex flex-col gap-3 lg:flex-row">
                    <input
                      value={newSetup}
                      onChange={(event) => setNewSetup(event.target.value)}
                      placeholder="Add a new setup"
                      className="ui-input"
                    />
                    <button
                      type="button"
                      onClick={handleCreateSetup}
                      disabled={savingSetup || !newSetup.trim()}
                      className="ui-button whitespace-nowrap px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {savingSetup ? "Saving..." : "Add Setup"}
                    </button>
                  </div>

                  <p className="text-sm text-white/58">
                    Manage the shared setup list here. Trades can only select from this saved set.
                  </p>

                  {!!setups.length && (
                    <div className="ui-panel flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/62">
                        <span>{selectedSetupIds.length} selected</span>
                        <button
                          type="button"
                          onClick={() => setSelectedSetupIds(setups.map((setup) => setup.id))}
                          className="ui-chip"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedSetupIds([])}
                          className="ui-chip"
                          disabled={selectedSetupIds.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                    <button
                      type="button"
                      onClick={handleBulkDeleteSetups}
                      disabled={selectedSetupIds.length === 0 || bulkDeletingSetups}
                      className="ui-button-danger px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {bulkDeletingSetups
                        ? "Deleting..."
                        : `Delete${selectedSetupIds.length ? ` (${selectedSetupIds.length})` : ""}`}
                    </button>
                    </div>
                  )}

                  {loading ? (
                    <LoadingState label="Loading setups..." className="min-h-[180px]" />
                  ) : setups.length === 0 ? (
                    <EmptyState
                      title="No saved setups yet"
                      description="Create reusable setups here and they will be available from each trade."
                    />
                  ) : (
                    <div className="grid auto-rows-min items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {setups.map((setup) => (
                        <div
                          key={setup.id}
                          className={`ui-panel self-start flex items-center justify-between gap-3 rounded-[6px] px-4 py-3 transition ${
                            selectedSetupIds.includes(setup.id)
                              ? "border-[var(--line)] bg-[#1f1f1f]"
                              : ""
                          }`}
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedSetupIds.includes(setup.id)}
                              onChange={() => toggleSetupSelection(setup.id)}
                              className="h-4 w-4 rounded border border-[var(--line-strong)] bg-transparent accent-[var(--accent)]"
                            />
                            <span className="truncate text-sm text-white/82">{setup.name}</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteSetup(setup)}
                            disabled={deletingSetupId === setup.id || bulkDeletingSetups}
                            className="rounded-[6px] border border-coral/35 bg-coral/10 px-3 py-1.5 text-xs font-semibold text-coral transition hover:bg-coral/15 disabled:opacity-50"
                          >
                            {deletingSetupId === setup.id ? "..." : "Delete"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
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

        <div className="mt-8 border-t border-[var(--line)] pt-4 text-right">
          <div className="space-y-1 text-xs text-white/42">
            <div>
              Frontend {appVersion} · {buildSha}
              {buildTime
                ? ` · ${new Date(buildTime).toLocaleString("en-US", { hour12: false })}`
                : ""}
            </div>
            <div>
              Backend {backendMeta?.version || "unknown"} · {backendMeta?.sha || "unknown"}
              {backendMeta?.buildTime
                ? ` · ${new Date(backendMeta.buildTime).toLocaleString("en-US", {
                    hour12: false
                  })}`
                : ""}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
