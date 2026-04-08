import { useLocation, useNavigate, useParams } from "react-router-dom";
import TradeDetailModal from "../components/TradeDetailModal";
import LoadingState from "../components/ui/LoadingState";
import EmptyState from "../components/ui/EmptyState";
import useCachedAsyncResource from "../hooks/useCachedAsyncResource";
import tradeService from "../services/tradeService";

function TradeDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const prefetchedTrade = location.state?.trade ?? tradeService.peekTrade(id) ?? null;

  const {
    data: trade,
    loading,
    error
  } = useCachedAsyncResource({
    peek: () => tradeService.peekTrade(id),
    load: () => tradeService.getTrade(id),
    initialValue: prefetchedTrade,
    deps: [id]
  });

  if (loading && !trade) {
    return <LoadingState label="Loading trade..." panel className="min-h-[420px]" />;
  }

  if (error) {
    return <div className="ui-notice border-coral/20 bg-[#1b1012] text-coral">{error}</div>;
  }

  if (!trade) {
    return (
      <EmptyState
        title="Trade not found"
        description="This trade could not be loaded. It may have been deleted."
      />
    );
  }

  return (
    <TradeDetailModal
      trade={trade}
      pageMode
      onClose={() => navigate("/trades")}
    />
  );
}

export default TradeDetailPage;
