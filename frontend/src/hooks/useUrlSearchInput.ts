import { useEffect, useRef, useState, type ChangeEvent, type CompositionEvent } from "react";

const DEFAULT_SYNC_DELAY_MS = 150;

export function useUrlSearchInput(
  urlValue: string,
  commitUrlValue: (value: string) => void,
  delay = DEFAULT_SYNC_DELAY_MS,
) {
  const [value, setValue] = useState(urlValue);
  const [isComposing, setIsComposing] = useState(false);
  const commitRef = useRef(commitUrlValue);
  const compositionRef = useRef(false);
  const pendingUrlValueRef = useRef<string | null>(null);

  useEffect(() => {
    commitRef.current = commitUrlValue;
  }, [commitUrlValue]);

  useEffect(() => {
    if (urlValue === pendingUrlValueRef.current) {
      pendingUrlValueRef.current = null;
      return;
    }
    pendingUrlValueRef.current = null;
    if (!compositionRef.current) setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    if (isComposing || value === urlValue) return;
    const timeoutId = window.setTimeout(() => {
      pendingUrlValueRef.current = value;
      commitRef.current(value);
    }, delay);
    return () => window.clearTimeout(timeoutId);
  }, [delay, isComposing, urlValue, value]);

  return {
    inputProps: {
      value,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setValue(event.target.value),
      onCompositionStart: () => {
        compositionRef.current = true;
        setIsComposing(true);
      },
      onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
        compositionRef.current = false;
        setValue(event.currentTarget.value);
        setIsComposing(false);
      },
    },
    setValue,
    value,
  };
}
