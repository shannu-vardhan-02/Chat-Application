import { useChatStore } from "../store/useChatStore";

function ActiveTabSwitch() {
  const { activeTab, setActiveTab } = useChatStore();

  return (
    <div className="px-3 py-2">
      <div className="flex bg-slate-800/60 rounded-xl p-1 gap-1">
        <button
          id="tab-chats"
          onClick={() => setActiveTab("chats")}
          className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "chats"
              ? "bg-gradient-to-r from-cyan-600/80 to-cyan-500/80 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Chats
        </button>
        <button
          id="tab-contacts"
          onClick={() => setActiveTab("contacts")}
          className={`flex-1 py-1.5 px-3 text-xs font-semibold rounded-lg transition-all ${
            activeTab === "contacts"
              ? "bg-gradient-to-r from-cyan-600/80 to-cyan-500/80 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Contacts
        </button>
      </div>
    </div>
  );
}

export default ActiveTabSwitch;
