import { useMemo } from "react";
import analysisService from "../services/analysisService";
import useCachedAsyncResource from "./useCachedAsyncResource";

export default function usePremarketRecaps({ from, to, userId }) {
  const { data } = useCachedAsyncResource({
    load: () => analysisService.getRecaps({ from, to }),
    enabled: Boolean(from && to && userId),
    initialValue: [],
    deps: [from, to, userId]
  });

  return useMemo(() => new Map(data
    .filter((row) => from && to && row.dayKey >= from && row.dayKey <= to)
    .map((row) => [row.dayKey, row])), [data, from, to]);
}
