import { SettingsIcon } from "lucide-react";
import { useChatStore } from "../store/useChatStore";

import ProfileHeader from "../components/ProfileHeader";
import SearchBar from "../components/SearchBar";
import ActiveTabSwitch from "../components/ActiveTabSwitch";
import ChatsList from "../components/ChatsList";
import ContactList from "../components/ContactList";
import ChatContainer from "../components/ChatContainer";
import NoConversationPlaceholder from "../components/NoConversationPlaceholder";
import SettingsModal from "../components/SettingsModal";

function ChatPage() {
  const { activeTab, selectedUser, setIsSettingsOpen } = useChatStore();

  return (
    <div className="flex h-screen w-full bg-slate-950 overflow-hidden relative">
      {/* ── LEFT SIDEBAR ────────────────────────────────────────────────────
          On mobile: shown full-width when no chat is selected, hidden when
          a chat is open. On md+: always shown at fixed width.
      ────────────────────────────────────────────────────────────────────── */}
      <div
        className={`
          flex-shrink-0 flex flex-col h-full
          bg-slate-900/95 border-r border-slate-800/60
          transition-all duration-300 ease-in-out
          w-full md:w-80 lg:w-96
          ${selectedUser ? "hidden md:flex" : "flex"}
        `}
      >
        {/* App brand + profile */}
        <ProfileHeader />

        {/* Search */}
        <SearchBar />

        {/* Tab switcher: Chats / Contacts */}
        <ActiveTabSwitch />

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {activeTab === "chats" ? <ChatsList /> : <ContactList />}
        </div>

        {/* Settings button at bottom */}
        <div className="p-3 border-t border-slate-800/60 bg-slate-900/80">
          <button
            id="settings-btn"
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 transition-all text-sm font-medium group"
          >
            <SettingsIcon className="size-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* ── RIGHT CHAT PANEL ─────────────────────────────────────────────────
          On mobile: shown full-width when a chat is selected.
          On md+: fills remaining space.
      ────────────────────────────────────────────────────────────────────── */}
      <div
        className={`
          flex-1 flex-col h-full bg-slate-950 relative overflow-hidden
          ${selectedUser ? "flex" : "hidden md:flex"}
        `}
      >
        {selectedUser ? <ChatContainer /> : <NoConversationPlaceholder />}
      </div>

      {/* Settings Modal */}
      <SettingsModal />
    </div>
  );
}

export default ChatPage;
