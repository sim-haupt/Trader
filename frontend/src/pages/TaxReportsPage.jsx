import { useEffect, useMemo, useState } from "react";
import Card from "../components/ui/Card";
import LoadingState from "../components/ui/LoadingState";
import EmptyState from "../components/ui/EmptyState";
import taxReportService from "../services/taxReportService";
import { formatCurrency, formatDate } from "../utils/formatters";
import { useNotifications } from "../context/NotificationContext";

const tabs = [
  "Overview",
  "Preview",
  "Settings"
];

const defaultFilters = {
  from: "",
  to: "",
  periodType: "custom",
  account: "all"
};

function eur(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function usd(value) {
  return formatCurrency(Number(value || 0));
}

function isoDate(value) {
  return value ? String(value).slice(0, 10) : "";
}

function numberValue(value) {
  return Number(value || 0);
}

function Stat({ label, value, tone = "text-white" }) {
  return (
    <div className="ui-metric-tile">
      <div className="ui-title text-[10px] text-white/48">{label}</div>
      <div className={`mt-2 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function Disclaimer({ text }) {
  return (
    <div className="ui-notice border-warning/20 bg-warning/10 text-white/76">
      {text}
    </div>
  );
}

function PeriodControls({ filters, onChange }) {
  return (
    <div className="grid gap-3 md:grid-cols-[180px_1fr_1fr_180px]">
      <select
        className="ui-input"
        value={filters.periodType}
        onChange={(event) => onChange({ ...filters, periodType: event.target.value })}
      >
        <option value="month">One month</option>
        <option value="year">Calendar year</option>
        <option value="custom">Custom range</option>
      </select>
      <input
        className="ui-input"
        type="date"
        value={filters.from}
        onChange={(event) => onChange({ ...filters, from: event.target.value })}
      />
      <input
        className="ui-input"
        type="date"
        value={filters.to}
        onChange={(event) => onChange({ ...filters, to: event.target.value })}
      />
      <select
        className="ui-input"
        value={filters.account}
        onChange={(event) => onChange({ ...filters, account: event.target.value })}
      >
        <option value="all">All accounts</option>
      </select>
    </div>
  );
}

function TaxReportsPage() {
  const { notify } = useNotifications();
  const [activeTab, setActiveTab] = useState("Overview");
  const [settings, setSettings] = useState(null);
  const [statements, setStatements] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [overview, setOverview] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [transactionFilters, setTransactionFilters] = useState({});
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadMeta, setUploadMeta] = useState({ brokerName: "", brokerAccount: "", currency: "USD" });
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [error, setError] = useState("");

  async function loadAll() {
    setLoading(true);
    setError("");

    try {
      const [nextSettings, nextStatements, nextTransactions, nextOverview] = await Promise.all([
        taxReportService.getSettings(),
        taxReportService.getStatements(),
        taxReportService.getTransactions(transactionFilters),
        taxReportService.getOverview(filters)
      ]);
      setSettings(nextSettings);
      setUploadMeta((current) => ({
        ...current,
        brokerName: current.brokerName || nextSettings.brokerName || "",
        brokerAccount: current.brokerAccount || nextSettings.brokerAccount || "",
        currency: current.currency || nextSettings.baseCurrency || "USD"
      }));
      setStatements(nextStatements);
      setTransactions(nextTransactions);
      setOverview(nextOverview);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    taxReportService.getOverview(filters).then(setOverview).catch((err) => setError(err.message));
  }, [filters]);

  useEffect(() => {
    taxReportService.getTransactions(transactionFilters).then(setTransactions).catch((err) => setError(err.message));
  }, [transactionFilters]);

  async function handleUpload(event) {
    event.preventDefault();

    if (!uploadFile) {
      notify({ title: "No file selected", description: "Choose the broker statement first.", tone: "warning" });
      return;
    }

    setIsUploading(true);
    setError("");

    try {
      const statement = await taxReportService.uploadStatement({
        file: uploadFile,
        ...uploadMeta
      });
      notify({
        title: "Statement imported",
        description: `${statement.importedTradeCount} trades imported, ${statement.duplicateCount} duplicates skipped. ${statement.exchangeRateResult ? `${statement.exchangeRateResult.fetched || 0} FX rates fetched, ${statement.exchangeRateResult.updated || 0} trades updated.` : "No FX rates applied."}`,
        tone: statement.rejectedRowCount || statement.exchangeRateResult?.missing ? "warning" : "success"
      });
      setUploadFile(null);
      setIsUploadOpen(false);
      await loadAll();
    } catch (err) {
      setError(err.message);
      notify({ title: "Import failed", description: err.message, tone: "error" });
    } finally {
      setIsUploading(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setIsSavingSettings(true);

    try {
      const next = await taxReportService.updateSettings(settings);
      setSettings(next);
      notify({ title: "Tax settings saved", tone: "success" });
    } catch (err) {
      notify({ title: "Could not save settings", description: err.message, tone: "error" });
    } finally {
      setIsSavingSettings(false);
    }
  }

  const summary = overview?.summary || {};
  const disclaimer = settings?.disclaimer || overview?.disclaimer || "";

  const reportParams = useMemo(() => ({
    periodType: filters.periodType,
    from: filters.from,
    to: filters.to,
    account: filters.account
  }), [filters]);
  const latestMetadata = statements[0]?.sourceMetadata || {};
  const reconciliation = overview?.reconciliation || {};

  if (loading) {
    return (
      <div className="tax-reports-page">
        <LoadingState label="Loading tax reports..." panel />
      </div>
    );
  }

  return (
    <div className="tax-reports-page space-y-6">
      {error ? <div className="ui-notice border-coral/20 bg-coral/10 text-coral">{error}</div> : null}
      <Disclaimer text={disclaimer} />

      <Card
        title="TAX REPORTS"
        action={
          <button className="ui-button-solid px-4 py-2 text-sm" type="button" onClick={() => setIsUploadOpen(true)}>
            Upload statement
          </button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className="ui-button px-4 py-2 text-sm"
              data-active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </Card>

      {isUploadOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 px-4" onMouseDown={() => setIsUploadOpen(false)}>
          <div className="w-full max-w-[560px]" onMouseDown={(event) => event.stopPropagation()}>
            <Card
              title="UPLOAD STATEMENT"
              action={
                <button className="ui-button px-3 py-1.5 text-xs" type="button" onClick={() => setIsUploadOpen(false)}>
                  Close
                </button>
              }
            >
              <form className="space-y-4" onSubmit={handleUpload}>
                <input
                  className="ui-input"
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                />
                <input className="ui-input" placeholder="Broker name" value={uploadMeta.brokerName} onChange={(event) => setUploadMeta((current) => ({ ...current, brokerName: event.target.value }))} />
                <input className="ui-input" placeholder="Broker account" value={uploadMeta.brokerAccount} onChange={(event) => setUploadMeta((current) => ({ ...current, brokerAccount: event.target.value }))} />
                <select className="ui-input" value={uploadMeta.currency} onChange={(event) => setUploadMeta((current) => ({ ...current, currency: event.target.value }))}>
                  <option value="USD">USD</option>
                </select>
                <button className="ui-button-solid w-full" type="submit" disabled={isUploading}>
                  {isUploading ? "Importing and fetching FX..." : "Upload and import"}
                </button>
              </form>
              <div className="ui-notice mt-4 text-white/70">
                Supported inputs: CSV, XLS and XLSX. FX rates are fetched automatically after import.
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "Overview" && (
        <div className="space-y-6">
          <Card title="REPORTING PERIOD">
            <PeriodControls filters={filters} onChange={setFilters} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Stat label="Uploaded statements" value={summary.uploadedStatements || 0} />
            <Stat label="Completed trades" value={summary.completedTrades || 0} />
            <Stat label="Trading days" value={summary.tradingDays || 0} />
            <Stat label="Report status" value={summary.reportStatus || "BLOCKED"} tone={summary.reportStatus === "READY" ? "text-mint" : "text-warning"} />
            <Stat label="Gross gains USD" value={usd(summary.grossGainsUsd)} tone="text-mint" />
            <Stat label="Gross losses USD" value={usd(summary.grossLossesUsd)} tone="text-coral" />
            <Stat label="Gross gains EUR" value={eur(summary.grossGainsEur)} tone="text-mint" />
            <Stat label="Gross losses EUR" value={eur(summary.grossLossesEur)} tone="text-coral" />
            <Stat label="Total fees USD" value={usd(summary.totalFeesUsd)} />
            <Stat label="Total fees EUR" value={eur(summary.totalFeesEur)} />
            <Stat label="Net realized USD" value={usd(summary.netRealizedUsd)} tone={Number(summary.netRealizedUsd || 0) >= 0 ? "text-mint" : "text-coral"} />
            <Stat label="Net realized EUR" value={eur(summary.netRealizedEur)} tone={Number(summary.netRealizedEur || 0) >= 0 ? "text-mint" : "text-coral"} />
            <Stat label="Profitable trades" value={summary.profitableTrades || 0} />
            <Stat label="Losing trades" value={summary.losingTrades || 0} />
            <Stat label="Break-even trades" value={summary.breakEvenTrades || 0} />
            <Stat label="Distinct symbols" value={summary.distinctSymbols || 0} />
            <Stat label="Total shares" value={summary.totalQuantityBought || 0} />
            <Stat label="Rejected rows" value={summary.rejectedRows || 0} tone={summary.rejectedRows ? "text-coral" : "text-white"} />
            <Stat label="Missing FX rates" value={summary.missingExchangeRates || 0} tone={summary.missingExchangeRates ? "text-coral" : "text-white"} />
            <Stat label="Ignored rows" value={Object.values(latestMetadata.structuralRows || {}).reduce((sum, value) => sum + Number(value || 0), 0)} />
            <Stat label="Reconciliation" value={reconciliation.status || "Review required"} tone={reconciliation.status === "Passed" ? "text-mint" : "text-warning"} />
            <Stat label="Net diff USD" value={usd(reconciliation.netDifferenceUsd)} tone={Math.abs(Number(reconciliation.netDifferenceUsd || 0)) > 0.01 ? "text-warning" : "text-white"} />
            <Stat label="Date range" value={`${summary.earliestTradeDate || "-"} → ${summary.latestTradeDate || "-"}`} />
          </div>

          <Card title="UPLOADED STATEMENTS">
            {statements.length === 0 ? (
              <EmptyState title="No statements uploaded" description="Use Upload statement to import a broker trade-history file." />
            ) : (
              <div className="ui-table-shell overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="ui-widget-heading-bg ui-title text-left text-[11px] text-white/58">
                    <tr>
                      <th className="px-4 py-3">File</th>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Broker</th>
                      <th className="px-4 py-3">Trades</th>
                      <th className="px-4 py-3">Duplicates</th>
                      <th className="px-4 py-3">Rejected</th>
                      <th className="px-4 py-3">Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {statements.map((statement) => (
                      <tr key={statement.id}>
                        <td className="px-4 py-3 text-white">{statement.originalFilename}</td>
                        <td className="px-4 py-3 text-white/70">{isoDate(statement.statementStartDate)} to {isoDate(statement.statementEndDate)}</td>
                        <td className="px-4 py-3 text-white/70">{statement.brokerName}</td>
                        <td className="px-4 py-3 text-white/70">{statement.importedTradeCount}</td>
                        <td className="px-4 py-3 text-white/70">{statement.duplicateCount}</td>
                        <td className="px-4 py-3 text-white/70">{statement.rejectedRowCount}</td>
                        <td className="px-4 py-3">
                          <button className="ui-button px-3 py-1.5 text-xs" type="button" onClick={() => taxReportService.downloadStatement(statement.id, statement.originalFilename)}>
                            Download
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="IMPORT SUMMARY">
            <div className="grid gap-3 text-sm text-white/72 md:grid-cols-2">
              <div>Broker format: <span className="text-white">{latestMetadata.detectedBrokerFormat || "-"}</span></div>
              <div>File type: <span className="text-white">{latestMetadata.fileFormat || "-"}</span></div>
              <div>Parsed rows: <span className="text-white">{latestMetadata.parsedRowCount || 0}</span></div>
              <div>Currency: <span className="text-white">{latestMetadata.currency || "USD"}</span></div>
              <div>Directions: <span className="text-white">{(latestMetadata.directionsFound || []).join(", ") || "-"}</span></div>
              <div>Instrument types: <span className="text-white">{(latestMetadata.instrumentTypesFound || []).join(", ") || "-"}</span></div>
            </div>
            <div className="ui-notice mt-4 text-white/70">{latestMetadata.importerAssumption || "Each accepted source row is treated as a completed long stock round-trip trade."}</div>
          </Card>

          <Card title="REPORT EXPORTS">
            <div className="flex flex-wrap gap-3">
              <button className="ui-button-solid" type="button" onClick={() => taxReportService.downloadPdf(reportParams)}>Download PDF</button>
              <button className="ui-button" type="button" onClick={() => taxReportService.downloadWorkbook(reportParams)}>Download XLSX</button>
              <button className="ui-button" type="button" onClick={() => taxReportService.downloadTransactionsCsv(reportParams)}>Download CSV</button>
              <button className="ui-button" type="button" onClick={() => taxReportService.downloadEvidenceZip(reportParams)}>Download ZIP evidence package</button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "Preview" && (
        <Card title="IMPORTED TRANSACTIONS">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <input className="ui-input" type="date" value={transactionFilters.from || ""} onChange={(event) => setTransactionFilters((current) => ({ ...current, from: event.target.value }))} />
            <input className="ui-input" type="date" value={transactionFilters.to || ""} onChange={(event) => setTransactionFilters((current) => ({ ...current, to: event.target.value }))} />
            <input className="ui-input" placeholder="Symbol" value={transactionFilters.symbol || ""} onChange={(event) => setTransactionFilters((current) => ({ ...current, symbol: event.target.value }))} />
          </div>

          <div className="ui-table-shell overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="ui-widget-heading-bg ui-title text-left text-[11px] text-white/58">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Statement</th>
                  <th className="px-4 py-3">Symbol</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">FX</th>
                  <th className="px-4 py-3">Total fees USD</th>
                  <th className="px-4 py-3">Total fees EUR</th>
                  <th className="px-4 py-3">Gross USD</th>
                  <th className="px-4 py-3">Gross EUR</th>
                  <th className="px-4 py-3">Net USD</th>
                  <th className="px-4 py-3">Net EUR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="px-4 py-3 text-white/70">{transaction.tradeDate ? formatDate(transaction.tradeDate) : "-"}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.statement?.originalFilename}</td>
                    <td className="px-4 py-3 text-white">{transaction.stockSymbol || "-"}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.quantity || "-"}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.pricePerShare || "-"}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.exchangeRateToEur || "missing"}</td>
                    <td className="px-4 py-3 text-white/70">{usd(numberValue(transaction.commission) + numberValue(transaction.otherFees))}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.eurFees ? eur(transaction.eurFees) : "-"}</td>
                    <td className="px-4 py-3 text-white/70">{usd(transaction.grossAmount)}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.eurGrossAmount ? eur(transaction.eurGrossAmount) : "-"}</td>
                    <td className="px-4 py-3 text-white/70">{usd(transaction.netAmount)}</td>
                    <td className="px-4 py-3 text-white/70">{transaction.eurNetAmount ? eur(transaction.eurNetAmount) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === "Settings" && settings && (
        <Card title="TAX SETTINGS">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveSettings}>
            <input className="ui-input" placeholder="Taxpayer/report owner name" value={settings.taxpayerName || ""} onChange={(event) => setSettings((current) => ({ ...current, taxpayerName: event.target.value }))} />
            <input className="ui-input" type="number" placeholder="German tax year" value={settings.germanTaxYear || ""} onChange={(event) => setSettings((current) => ({ ...current, germanTaxYear: Number(event.target.value) }))} />
            <input className="ui-input" placeholder="Broker name" value={settings.brokerName || ""} onChange={(event) => setSettings((current) => ({ ...current, brokerName: event.target.value }))} />
            <input className="ui-input" placeholder="Broker account" value={settings.brokerAccount || ""} onChange={(event) => setSettings((current) => ({ ...current, brokerAccount: event.target.value }))} />
            <input className="ui-input" placeholder="Base currency" value={settings.baseCurrency || "USD"} onChange={(event) => setSettings((current) => ({ ...current, baseCurrency: event.target.value }))} />
            <input className="ui-input" placeholder="Exchange-rate source" value={settings.exchangeRateSource || ""} onChange={(event) => setSettings((current) => ({ ...current, exchangeRateSource: event.target.value }))} />
            <select className="ui-input" value={settings.exchangeRateFallbackRule || "previous_available"} onChange={(event) => setSettings((current) => ({ ...current, exchangeRateFallbackRule: event.target.value }))}>
              <option value="previous_available">Most recent previous available rate</option>
              <option value="manual_required">Manual rate required</option>
            </select>
            <select className="ui-input" value={settings.matchingMethod || "COMPLETED_ROUND_TRIP"} onChange={(event) => setSettings((current) => ({ ...current, matchingMethod: event.target.value }))}>
              <option value="COMPLETED_ROUND_TRIP">Completed round-trip rows</option>
              <option value="FIFO">FIFO for future raw execution importers</option>
            </select>
            <input className="ui-input" type="number" step="0.01" placeholder="Reconciliation tolerance" value={settings.reconciliationTolerance || ""} onChange={(event) => setSettings((current) => ({ ...current, reconciliationTolerance: event.target.value }))} />
            <select className="ui-input" value={settings.reportLanguage || "de"} onChange={(event) => setSettings((current) => ({ ...current, reportLanguage: event.target.value }))}>
              <option value="de">German</option>
              <option value="en">English</option>
            </select>
            <textarea className="ui-input md:col-span-2" rows={3} placeholder="Tax adviser notes" value={settings.taxAdviserNotes || ""} onChange={(event) => setSettings((current) => ({ ...current, taxAdviserNotes: event.target.value }))} />
            <textarea className="ui-input md:col-span-2" rows={4} placeholder="Disclaimer" value={settings.disclaimer || ""} onChange={(event) => setSettings((current) => ({ ...current, disclaimer: event.target.value }))} />
            <button className="ui-button-solid md:col-span-2" disabled={isSavingSettings} type="submit">
              {isSavingSettings ? "Saving..." : "Save settings"}
            </button>
          </form>
        </Card>
      )}
    </div>
  );
}

export default TaxReportsPage;
