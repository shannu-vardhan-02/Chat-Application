import { useEffect, useRef } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

function SearchBar() {
  const { searchQuery, setSearchQuery } = useChatStore();
  const inputRef = useRef(null);

  // Focus search input when user presses Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="px-3 py-2">
      <div className="relative flex items-center">
        <SearchIcon className="absolute left-3 size-4 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search or start new chat"
          className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl py-2 pl-9 pr-12 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-all"
        />

        {searchQuery ? (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <XIcon className="size-4" />
          </button>
        ) : (
          <kbd className="absolute right-3 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 bg-slate-700/50 border border-slate-600/50 rounded pointer-events-none">
            <span className="text-xs">⌘</span>K
          </kbd>
        )}
      </div>
    </div>
  );
}

export default SearchBar;
