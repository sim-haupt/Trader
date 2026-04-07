import { useEffect, useState } from "react";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";
import tagService from "../services/tagService";

function SettingsPage() {
  const [tags, setTags] = useState(() => tagService.peekTags() || []);
  const [newTag, setNewTag] = useState("");
  const [loading, setLoading] = useState(() => !tagService.peekTags());
  const [saving, setSaving] = useState(false);
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
  }, []);

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
                className="flex w-full items-center justify-between rounded-[14px] bg-white/[0.06] px-4 py-3 text-left text-sm text-white"
              >
                <span>Tags</span>
                <span className="text-white/40">{tags.length}</span>
              </button>
            </div>
          </aside>

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
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
