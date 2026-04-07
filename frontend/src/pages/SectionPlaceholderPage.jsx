import Card from "../components/ui/Card";

function SectionPlaceholderPage({ title, description }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="ui-title text-xs text-mint">Workspace</p>
        <h1 className="ui-title mt-3 text-4xl text-phosphor">{title}</h1>
        <p className="mt-3 max-w-2xl text-lg text-mist">{description}</p>
      </div>

      <Card
        title={`${title} Coming Soon`}
        subtitle="We have the shell in place so we can expand this section next without reworking navigation."
      >
        <div className="border-2 border-dashed border-mint/18 bg-black/35 px-6 py-14 text-center">
          <p className="ui-title text-lg text-phosphor">{title} is ready for the next pass.</p>
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
