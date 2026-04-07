import { useEffect, useRef, useState } from "react";

function useCachedAsyncResource({
  peek,
  load,
  initialValue,
  enabled = true,
  deps = []
}) {
  const hasCachedValue = () => {
    const value = peek?.();
    return value !== null && value !== undefined;
  };

  const [data, setData] = useState(() => {
    const cached = peek?.();
    return cached ?? initialValue;
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(() => enabled && !hasCachedValue());
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let active = true;

    async function run() {
      const cached = peek?.();

      if (cached !== null && cached !== undefined) {
        setData(cached);
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError("");

      try {
        const nextData = await load();

        if (active && mountedRef.current) {
          setData(nextData);
        }
      } catch (nextError) {
        if (active && mountedRef.current) {
          setError(nextError.message);
        }
      } finally {
        if (active && mountedRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    run();

    return () => {
      active = false;
    };
  }, deps);

  async function reload() {
    if (!enabled) {
      return data;
    }

    const cached = peek?.();

    if (cached !== null && cached !== undefined) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const nextData = await load();
      if (mountedRef.current) {
        setData(nextData);
      }
      return nextData;
    } catch (nextError) {
      if (mountedRef.current) {
        setError(nextError.message);
      }
      throw nextError;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  return {
    data,
    setData,
    error,
    setError,
    loading,
    refreshing,
    reload
  };
}

export default useCachedAsyncResource;
