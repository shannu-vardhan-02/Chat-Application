function MessagesLoadingSkeleton() {
  const items = [
    { side: "start", width: "w-40" },
    { side: "end",   width: "w-52" },
    { side: "start", width: "w-32" },
    { side: "end",   width: "w-44" },
    { side: "start", width: "w-56" },
    { side: "end",   width: "w-36" },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-4 py-4 animate-pulse">
      {items.map((item, i) => (
        <div
          key={i}
          className={`flex items-end gap-2 ${item.side === "end" ? "flex-row-reverse" : ""}`}
        >
          {/* Avatar skeleton */}
          {item.side === "start" && (
            <div className="size-7 rounded-full bg-slate-800 flex-shrink-0" />
          )}
          {/* Bubble skeleton */}
          <div
            className={`h-9 ${item.width} rounded-2xl ${
              item.side === "end" ? "bg-cyan-900/40 rounded-tr-sm" : "bg-slate-800 rounded-tl-sm"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

export default MessagesLoadingSkeleton;
