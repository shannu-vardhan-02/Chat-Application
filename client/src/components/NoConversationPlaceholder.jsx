import { MessageCircleIcon, ArrowRightIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

const NoConversationPlaceholder = () => {
  const { setActiveTab } = useChatStore();

  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center px-6 select-none"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 40%, rgba(6,182,212,0.04) 0%, transparent 70%)",
      }}
    >
      {/* Icon ring */}
      <div className="relative mb-6">
        <div className="size-24 rounded-full bg-gradient-to-br from-cyan-500/10 to-cyan-700/5 border border-cyan-500/10 flex items-center justify-center animate-pulse">
          <div className="size-16 rounded-full bg-gradient-to-br from-cyan-500/15 to-cyan-600/10 flex items-center justify-center">
            <MessageCircleIcon className="size-8 text-cyan-400/80" />
          </div>
        </div>
        {/* Floating dot decorations */}
        <span className="absolute top-1 right-1 size-2 rounded-full bg-cyan-500/40" />
        <span className="absolute bottom-2 left-0 size-1.5 rounded-full bg-cyan-400/30" />
      </div>

      <h3 className="text-xl font-semibold text-slate-200 mb-2">
        Your messages live here
      </h3>
      <p className="text-slate-500 text-sm max-w-xs leading-relaxed mb-6">
        Select a conversation from the sidebar or start a new one by finding a contact.
      </p>

      <button
        id="find-contacts-placeholder-btn"
        onClick={() => setActiveTab("contacts")}
        className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 rounded-xl hover:bg-cyan-500/20 hover:border-cyan-500/30 transition-all"
      >
        Find contacts
        <ArrowRightIcon className="size-4" />
      </button>

      {/* Decorative lines */}
      <div className="mt-10 flex items-center gap-3 opacity-20">
        <div className="h-px w-16 bg-gradient-to-r from-transparent to-cyan-500" />
        <div className="size-1 rounded-full bg-cyan-500" />
        <div className="h-px w-16 bg-gradient-to-l from-transparent to-cyan-500" />
      </div>
    </div>
  );
};

export default NoConversationPlaceholder;
