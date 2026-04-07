import Card from "./Card";

function StatCard({ label, value, accent = "mint" }) {
  const accentMap = {
    mint: "text-mint",
    coral: "text-[#8ebfa9]",
    gold: "text-phosphor"
  };

  return (
    <Card className="h-full">
      <p className="ui-title text-xs text-mist">{label}</p>
      <p className={`mt-4 text-4xl font-semibold tracking-[0.05em] ${accentMap[accent] || "text-phosphor"}`}>
        {value}
      </p>
    </Card>
  );
}

export default StatCard;
