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
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <Card title="TAGS">
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  placeholder="Add a saved tag"
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
                Saved tags appear in the trade detail view so you can apply them without typing each time.
              </p>
            </div>
          </Card>

          <Card title="SAVED TAGS">
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
          </Card>
        </div>
      </Card>
    </div>
  );
}

export default SettingsPage;
