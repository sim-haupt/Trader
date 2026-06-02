UPDATE "Trade"
SET
  "fees" = 0,
  "netPnl" = CASE
    WHEN "grossPnl" IS NULL THEN "netPnl"
    ELSE "grossPnl" - "commissions"
  END
WHERE "notes" = 'Imported from DAS Trader CSV';

