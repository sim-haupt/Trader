import Card from "../components/ui/Card";

function SectionPlaceholderPage({ title, description }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-mint">Workspace</p>
        <h1 className="mt-3 text-4xl font-semibold text-white">{title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-mist">{description}</p>
      </div>

      <Card
        title={`${title} Coming Soon`}
        subtitle="We have the shell in place so we can expand this section next without reworking navigation."
      >
        <div className="rounded-3xl border border-dashed border-white/10 bg-slate-950/30 px-6 py-14 text-center">
          <p className="text-lg font-semibold text-white">{title} is ready for the next pass.</p>
          <p className="mx-auto mt-3 max-w-xl text-sm text-mist">
            The layout now matches the broader journal experience. We can add detailed widgets,
            reports, and workflows here next.
          </p>
        </div>
      </Card>
    </div>
  );
}

export default SectionPlaceholderPage;
