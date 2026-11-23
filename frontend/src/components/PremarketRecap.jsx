import { Link } from "react-router-dom";

export default function PremarketRecap({ recap }) {
  return (
    <Link to={`/premarket?day=${recap.dayKey}&checkpoint=09%3A25`} className="block text-sm text-mist hover:text-white">
      Premarket 09:25 ET · {recap.heat ?? "Building baseline"} · {recap.breadth} up 10%+
      {recap.leader && ` · ${recap.leader.symbol} +${recap.leader.gain.toFixed(1)}%`}
    </Link>
  );
}
