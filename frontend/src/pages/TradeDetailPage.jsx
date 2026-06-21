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
    return (
      <div className="trade-detail-page">
        <LoadingState label="Loading trade..." panel className="min-h-[420px]" />
      </div>
    );
  }

  if (error) {
    return <div className="trade-detail-page ui-notice border-coral/20 bg-coral/10 text-coral">{error}</div>;
  }

  if (!trade) {
    return (
      <div className="trade-detail-page">
        <EmptyState
          title="Trade not found"
          description="This trade could not be loaded. It may have been deleted."
        />
      </div>
    );
  }

  return (
    <div className="trade-detail-page w-full">
      <TradeDetailModal
        trade={trade}
        pageMode
        onClose={() => navigate("/trades")}
      />
    </div>
  );
}

export default TradeDetailPage;
