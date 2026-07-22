"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchResult } from "@/lib/actions/search";
import { SearchIcon } from "./icons";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();

    // Below the minimum length there's nothing to search — `showDropdown`
    // already hides any stale `results` in that case, so no setState is
    // needed here (avoids calling setState synchronously in the effect body).
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestId.current += 1;
      return;
    }

    const currentRequest = ++requestId.current;

    const timeout = setTimeout(async () => {
      setIsLoading(true);
      const found = await globalSearch(trimmed);
      // Ignore stale responses from an earlier, slower request.
      if (currentRequest === requestId.current) {
        setResults(found);
        setIsLoading(false);
        setHighlightedIndex(-1);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function goToResult(result: SearchResult) {
    if (result.href) {
      router.push(result.href);
    }
    setIsOpen(false);
    setQuery("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }
    if (!isOpen || results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      goToResult(results[highlightedIndex]);
    }
  }

  const trimmedQuery = query.trim();
  const showDropdown = isOpen && trimmedQuery.length >= MIN_QUERY_LENGTH;

  return (
    <div ref={containerRef} className="relative w-full sm:w-64 lg:w-80">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search cases, customers..."
        className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-700
          placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none
          focus:ring-1 focus:ring-emerald-500"
      />

      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {isLoading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">Searching...</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">No results found.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map((result, index) => (
                <li key={`${result.type}-${result.id}`}>
                  <button
                    type="button"
                    onClick={() => goToResult(result)}
                    disabled={!result.href}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors ${
                      index === highlightedIndex ? "bg-slate-50" : ""
                    } ${result.href ? "hover:bg-slate-50" : "cursor-default opacity-70"}`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{result.primaryLabel}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        {result.type}
                      </span>
                    </span>
                    {result.secondaryLabel && (
                      <span className="truncate text-xs text-slate-500">{result.secondaryLabel}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
