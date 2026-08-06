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
      {/* LEFT SIDEBAR — Responsive behavior: full width on mobile when no chat is selected */}
      <div
        className={`w-full md:w-80 lg:w-96 bg-slate-900/95 border-r border-slate-800/80 flex flex-col h-full flex-shrink-0 transition-all ${
          selectedUser ? "hidden md:flex" : "flex"
        }`}
      >
        {/* SIDEBAR HEADER */}
        <ProfileHeader />

        {/* SEARCH BAR (Matches design image: "Search or start new chat") */}
        <SearchBar />

        {/* TAB SWITCHER (Chats / Contacts) */}
        <ActiveTabSwitch />

        {/* LIST AREA */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activeTab === "chats" ? <ChatsList /> : <ContactList />}
        </div>

        {/* SIDEBAR BOTTOM SETTINGS BUTTON (Matches design image: "⚙️ Settings") */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-900/90">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-slate-100 hover:bg-slate-800/80 transition-colors text-sm font-medium"
          >
            <SettingsIcon className="size-5 text-slate-400" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* RIGHT MAIN CHAT WINDOW — Responsive behavior: full width on mobile when a chat is selected */}
      <div
        className={`flex-1 flex-col h-full bg-slate-950 relative overflow-hidden ${
          selectedUser ? "flex" : "hidden md:flex"
        }`}
      >
        {selectedUser ? <ChatContainer /> : <NoConversationPlaceholder />}
      </div>

      {/* SETTINGS MODAL */}
      <SettingsModal />
    </div>
  );
}

export default ChatPage;



