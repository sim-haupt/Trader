import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import LoadingState from "../components/ui/LoadingState";
import EmptyState from "../components/ui/EmptyState";
import tagService from "../services/tagService";
import { useAuth } from "../context/AuthContext";

function SettingsPage() {
  const { user, updateSettings, refreshSettings } = useAuth();
  const [activeSection, setActiveSection] = useState("tags");
  const [tags, setTags] = useState(() => tagService.peekTags() || []);
  const [newTag, setNewTag] = useState("");
  const [defaultCommission, setDefaultCommission] = useState(String(user?.defaultCommission ?? 0));
  const [defaultFees, setDefaultFees] = useState(String(user?.defaultFees ?? 0));
  const [loading, setLoading] = useState(() => !tagService.peekTags());
  const [saving, setSaving] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTags();
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

    setSaving(true);
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
      setSaving(false);
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
                    disabled={saving || !newTag.trim()}
                    className="ui-button-solid whitespace-nowrap px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Add Tag"}
                  </button>
                </div>

                <p className="text-sm text-white/58">
                  Manage the shared tag list here. Trades can only select from this saved set.
                </p>

                {loading ? (
                  <LoadingState label="Loading tags..." className="min-h-[180px]" />
                ) : tags.length === 0 ? (
                  <EmptyState
                    title="No saved tags yet"
                    description="Create a few reusable tags here and they will be available from each trade."
                  />
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {tags.map((tag) => (
                      <div
                        key={tag.id}
                        className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/[0.035] px-4 py-2"
                      >
                        <span className="text-sm text-white/82">{tag.name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteTag(tag)}
                          disabled={deletingId === tag.id}
                          className="text-xs text-coral transition hover:text-coral/80 disabled:opacity-50"
                        >
                          {deletingId === tag.id ? "..." : "Delete"}
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
