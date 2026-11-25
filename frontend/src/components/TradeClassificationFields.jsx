import { useEffect, useId, useRef, useState } from "react";
import setupService from "../services/setupService";
import tagService from "../services/tagService";
import { tradeSetups, tradeTags, uniqueLabels } from "../utils/tradeClassifications";
import EntryGradeFields, { entryGradePayload, isEntryGradeReady, SavedEntryGrade } from "./EntryGradeFields";

export function classificationDraft(trade) {
  return { setups: tradeSetups(trade), tags: tradeTags(trade), grade: null };
}

export function classificationPayload(draft) {
  return {
    setups: draft.setups,
    tags: draft.tags.join(", "),
    tagsMode: "replace",
    ...(draft.grade && { entryGrade: entryGradePayload(draft.grade) })
  };
}

export function classificationReady(draft) {
  return draft.tags.join(", ").length <= 500 && draft.setups.length <= 30
    && (!draft.grade || isEntryGradeReady(draft.grade));
}

function LabelPicker({ heading, noun, items, selected, onChange, busy, limit, valid, primary, error }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const search = useRef(null);
  const trigger = useRef(null);
  const id = useId();
  const name = query.trim();
  const lower = name.toLowerCase();
  const exact = items.find((item) => item.toLowerCase() === lower);
  const alreadySelected = selected.some((item) => item.toLowerCase() === lower);
  const matches = items.filter((item) => item.toLowerCase().includes(lower) && !selected.some((value) => value.toLowerCase() === item.toLowerCase()));
  const canAdd = (item) => item.length <= 100 && selected.length < limit && valid([...selected, item]);
  const canCreate = name && !exact && !alreadySelected && canAdd(name);

  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);

  function add(item) {
    onChange([...selected, item]);
    setQuery("");
    search.current?.focus();
  }

  function close() {
    setOpen(false);
    setQuery("");
    trigger.current?.focus();
  }

  return <section className="min-w-0" aria-labelledby={`${id}-heading`}>
    <div className="flex items-center justify-between gap-2">
      <h3 id={`${id}-heading`} className="text-sm font-medium">{heading}</h3>
      <button ref={trigger} type="button" className="ui-button min-h-11 px-3 text-sm" disabled={busy}
        aria-expanded={open} aria-controls={id} onClick={() => open ? close() : setOpen(true)}>
        {open ? "Done" : `+ Add ${noun}`}
      </button>
    </div>
    <div className="mt-1 flex flex-wrap gap-1.5">
      {selected.map((item, index) => <button type="button" key={item} aria-label={`Remove ${noun} ${item}`}
        className="ui-chip-removable min-h-11 max-w-full gap-1.5" disabled={busy}
        onClick={() => onChange(selected.filter((value) => value !== item))}>
        <span className="min-w-0 whitespace-normal break-words">{item}{primary && selected.length > 1 && index === 0 && <span className="ml-1.5 text-xs text-mist">Primary</span>}</span>
        <span aria-hidden="true">×</span>
      </button>)}
      {!selected.length && <p className="py-2 text-sm text-mist">No {heading.toLowerCase()} selected</p>}
    </div>
    {primary && selected.length > 1 && <label className="mt-2 block text-xs text-mist">Primary setup for reports
      <select className="ui-input mt-1 min-h-11" value={selected[0]} disabled={busy}
        onChange={(event) => onChange([event.target.value, ...selected.filter((item) => item !== event.target.value)])}>
        {selected.map((item) => <option key={item}>{item}</option>)}
      </select>
    </label>}
    {open && <div id={id} className="mt-2 space-y-2 rounded border border-white/10 bg-white/[0.03] p-2"
      onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <input ref={search} className="ui-input min-h-11" value={query} maxLength={100} disabled={busy}
        aria-label={`Find or create ${noun}`} placeholder={`Search or type a new ${noun}`}
        onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          if (exact && !alreadySelected && canAdd(exact)) add(exact);
          else if (canCreate) add(name);
        }} />
      {matches.length > 0 && <ul aria-label={`Saved ${heading.toLowerCase()}`} className="max-h-40 overflow-y-auto">
        {matches.map((item) => <li key={item}>
          <button type="button" disabled={busy || !canAdd(item)} className="min-h-11 w-full break-words rounded px-2 text-left text-sm hover:bg-white/10 disabled:opacity-50"
            onClick={() => add(item)}>{item}</button>
        </li>)}
      </ul>}
      {canCreate && <button type="button" className="ui-button min-h-11 w-full whitespace-normal break-words px-2 text-left text-sm" disabled={busy}
        onClick={() => add(name)}>Create “{name}”</button>}
      {alreadySelected && <p className="px-2 text-xs text-mist">Already selected.</p>}
      {name && !alreadySelected && !canAdd(exact || name) && <p className="px-2 text-xs text-mist">
        {noun === "tag" && name.includes(",") ? "Enter one tag at a time, without commas." : `This ${noun} would exceed the trade’s limit.`}
      </p>}
      {!name && !matches.length && <p className="px-2 text-xs text-mist">Type a name to create a {noun}.</p>}
      {error && <p role="status" className="px-2 text-xs text-mist">Saved {heading.toLowerCase()} could not be loaded.</p>}
    </div>}
  </section>;
}

const pickerSources = [
  { key: "setups", heading: "Setups", noun: "setup", peek: () => setupService.peekSetups(), load: () => setupService.getSetups(), limit: 30, valid: () => true, primary: true },
  { key: "tags", heading: "Tags", noun: "tag", peek: () => tagService.peekTags(), load: () => tagService.getTags(), limit: Infinity,
    valid: (values) => !values.at(-1).includes(",") && values.join(", ").length <= 500 }
];

export default function TradeClassificationFields({ draft, onChange, review, busy }) {
  const [catalogs, setCatalogs] = useState(() => Object.fromEntries(pickerSources.map(({ key, peek }) => [key, { values: peek() ?? [] }])));
  const gradeId = useId();
  useEffect(() => {
    let active = true;
    for (const { key, load } of pickerSources) {
      load().then((values) => {
        if (active) setCatalogs((current) => ({ ...current, [key]: { values } }));
      }).catch(() => {
        if (active) setCatalogs((current) => ({ ...current, [key]: { ...current[key], error: true } }));
      });
    }
    return () => { active = false; };
  }, []);

  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      {pickerSources.map(({ key, heading, noun, limit, valid, primary }) => <LabelPicker key={key}
        {...{ heading, noun, limit, valid, primary, busy }} items={uniqueLabels(catalogs[key].values.map(({ name }) => name))}
        error={catalogs[key].error} selected={draft[key]} onChange={(values) => onChange({ ...draft, [key]: values })} />)}
    </div>
    <section className="border-t border-white/10 pt-3" aria-label="Entry grade">
      {review && !draft.grade && <SavedEntryGrade review={review} />}
      {(!review || review.source === "MANUAL") && <button type="button" className={`ui-button min-h-11 px-3 text-sm ${review ? "mt-3" : ""}`}
        aria-expanded={Boolean(draft.grade)} aria-controls={gradeId} disabled={busy}
        onClick={() => onChange({ ...draft, grade: draft.grade ? null : (review ?? {}) })}>
        {draft.grade ? "Discard grade changes" : review ? "Edit entry grade" : "+ Add entry grade"}
      </button>}
      {draft.grade && <div id={gradeId} className="mt-3 max-w-xl space-y-3">
        <p className="text-sm text-mist">Manual entry grade · score the entry you took.</p>
        <EntryGradeFields value={draft.grade} onChange={(grade) => onChange({ ...draft, grade })} busy={busy} />
      </div>}
    </section>
  </div>;
}
