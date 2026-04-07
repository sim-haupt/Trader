import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import tagService from "../services/tagService";
import { useAuth } from "../context/AuthContext";

function SettingsPage() {
  const { user, updateSettings, refreshSettings } = useAuth();
  const [activeSection, setActiveSection] = useState("tags");
  const [tags, setTags] = useState(() => tagService.peekTags() || []);
  const [newTag, setNewTag] = useState("");
  const [defaultCommission, setDefaultCommission] = useState(String(user?.defaultCommission ?? 0));
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
  }, [user?.defaultCommission]);

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
    const value = Number(defaultCommission);

    if (Number.isNaN(value) || value < 0) {
      setError("Default commission must be 0 or greater.");
      return;
    }

    setSavingCommission(true);
    setError("");
    setMessage("");

    try {
      await updateSettings({
        defaultCommission: value
      });
      setMessage("Default commission updated.");
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

      <Card title="SETTINGS">
        <div className="grid gap-6 xl:grid-cols-[240px_1fr]">
          <aside className="rounded-[18px] border border-[#e5e7eb42] bg-white/[0.03] p-4">
            <div className="space-y-2">
              <div className="ui-title text-[11px] text-white/48">Navigation</div>
              <button
                type="button"
                onClick={() => setActiveSection("tags")}
                className={`flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left text-sm ${
                  activeSection === "tags" ? "bg-white/[0.06] text-white" : "text-white/64 hover:bg-white/[0.03]"
                }`}
              >
                <span>Tags</span>
                <span className="text-white/40">{tags.length}</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSection("commissions")}
                className={`flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-left text-sm ${
                  activeSection === "commissions" ? "bg-white/[0.06] text-white" : "text-white/64 hover:bg-white/[0.03]"
                }`}
              >
                <span>Commissions</span>
                <span className="text-white/40">{Number(user?.defaultCommission ?? 0).toFixed(2)}</span>
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
                  <div className="text-sm text-mist">Loading tags...</div>
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
                        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2"
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
                  Set the default commission applied per trade when imported or saved trades do not already have explicit fees.
                </p>

                <div className="max-w-[320px]">
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

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveCommission}
                    disabled={savingCommission}
                    className="ui-button-solid px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingCommission ? "Saving..." : "Save Commission"}
                  </button>
                  <span className="text-sm text-white/44">
                    Current: ${Number(user?.defaultCommission ?? 0).toFixed(2)}
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
