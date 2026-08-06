import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { useAuthStore } from "../store/useAuthStore";

function ContactList() {
  const {
    getAllContacts,
    allContacts,
    setSelectedUser,
    selectedUser,
    isUsersLoading,
    searchQuery,
  } = useChatStore();
  const { onlineUsers } = useAuthStore();

  useEffect(() => {
    getAllContacts();
  }, [getAllContacts]);

  if (isUsersLoading) return <UsersLoadingSkeleton />;

  const filteredContacts = allContacts.filter(
    (contact) =>
      contact.fullName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
      contact.email.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  if (filteredContacts.length === 0 && searchQuery) {
    return (
      <div className="py-8 text-center text-slate-500 text-xs">
        No contacts matching <span className="text-slate-400">&quot;{searchQuery}&quot;</span>
      </div>
    );
  }

  if (filteredContacts.length === 0) {
    return (
      <div className="py-8 text-center text-slate-500 text-xs">
        No contacts yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {filteredContacts.map((contact) => {
        const isOnline   = onlineUsers.includes(contact._id);
        const isSelected = selectedUser?._id === contact._id;
        return (
          <div
            key={contact._id}
            id={`contact-item-${contact._id}`}
            onClick={() => setSelectedUser(contact)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all
              ${isSelected
                ? "bg-cyan-600/15 border border-cyan-500/25"
                : "hover:bg-slate-800/60 border border-transparent hover:border-slate-700/30"}
            `}
          >
            <div className="relative flex-shrink-0">
              <img
                src={contact.profilePic || "/avatar.png"}
                alt={contact.fullName}
                className={`size-11 rounded-full object-cover border transition-all ${
                  isSelected ? "border-cyan-500/50" : "border-slate-700/50"
                }`}
              />
              <span
                className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-slate-900 transition-colors ${
                  isOnline ? "bg-emerald-400" : "bg-slate-600"
                }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <h4
                  className={`font-medium text-sm truncate transition-colors ${
                    isSelected ? "text-cyan-400" : "text-slate-200"
                  }`}
                >
                  {contact.fullName}
                </h4>
                {isOnline && (
                  <span className="text-[10px] text-emerald-400 font-medium flex-shrink-0 ml-1">
                    Online
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">{contact.email}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ContactList;
