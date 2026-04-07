import Card from "./Card";

function StatCard({ label, value, accent = "mint" }) {
  const accentMap = {
    mint: "text-mint",
    coral: "text-coral",
    gold: "text-cyan",
    neutral: "text-phosphor"
  };

  return (
    <Card className="h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4">
        <p className="ui-title text-xs text-mist">{label}</p>
        <div className="h-2 w-16 bg-[linear-gradient(90deg,#6b7dff,#8c6cff,#ffb84d)]" />
      </div>
      <p className={`mt-4 text-4xl font-semibold tracking-[0.05em] ${accentMap[accent] || "text-phosphor"}`}>
        {value}
      </p>
    </Card>
  );
}

export default StatCard;
