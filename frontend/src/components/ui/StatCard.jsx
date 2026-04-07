import Card from "./Card";

function StatCard({ label, value, accent = "mint" }) {
  const accentMap = {
    mint: "text-mint",
    coral: "text-coral",
    gold: "text-gold"
  };

  return (
    <Card className="h-full">
      <p className="text-xs uppercase tracking-[0.32em] text-mist">{label}</p>
      <p className={`mt-3 text-3xl font-semibold tracking-[0.04em] ${accentMap[accent] || "text-phosphor"}`}>
        {value}
      </p>
    </Card>
  );
}

export default StatCard;
