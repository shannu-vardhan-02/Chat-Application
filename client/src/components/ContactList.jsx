import { useEffect } from "react";
import { useChatStore } from "../store/useChatStore";
import UsersLoadingSkeleton from "./UsersLoadingSkeleton";
import { useAuthStore } from "../store/useAuthStore";

function ContactList() {
  const { getAllContacts, allContacts, setSelectedUser, isUsersLoading, searchQuery } =
    useChatStore();
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
      <div className="py-8 text-center text-slate-400 text-xs">
        No contacts found matching &quot;{searchQuery}&quot;
      </div>
    );
  }

  return (
    <>
      {filteredContacts.map((contact) => {
        const isOnline = onlineUsers.includes(contact._id);
        return (
          <div
            key={contact._id}
            className="bg-slate-800/40 border border-slate-700/30 hover:border-cyan-500/30 p-3 rounded-xl cursor-pointer hover:bg-slate-800/80 transition-all group"
            onClick={() => setSelectedUser(contact)}
          >
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <img
                  src={contact.profilePic || "/avatar.png"}
                  alt={contact.fullName}
                  className="size-11 rounded-full object-cover border border-slate-700/50"
                />
                <span
                  className={`absolute bottom-0 right-0 size-3 rounded-full border-2 border-slate-900 ${
                    isOnline ? "bg-emerald-500" : "bg-slate-500"
                  }`}
                />
              </div>
              <div className="overflow-hidden">
                <h4 className="text-slate-100 font-medium text-sm truncate group-hover:text-cyan-400 transition-colors">
                  {contact.fullName}
                </h4>
                <p className="text-xs text-slate-400 truncate">{contact.email}</p>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
export default ContactList;

