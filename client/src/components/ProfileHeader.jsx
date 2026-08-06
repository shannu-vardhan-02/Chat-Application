import { LogOutIcon, VolumeOffIcon, Volume2Icon, MessageSquareIcon } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const mouseClickSound = new Audio("/sounds/mouse-click.mp3");

function ProfileHeader() {
  const { logout, authUser } = useAuthStore();
  const { isSoundEnabled, toggleSound, setIsSettingsOpen } = useChatStore();

  return (
    <div className="px-3 py-3 border-b border-slate-800/60 bg-slate-900/90 flex items-center justify-between gap-2">
      {/* Brand + profile */}
      <div
        id="open-profile-btn"
        onClick={() => setIsSettingsOpen(true)}
        className="flex items-center gap-2.5 cursor-pointer group min-w-0"
      >
        {/* App icon */}
        <div className="flex-shrink-0 size-8 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-700/20 border border-cyan-500/20 flex items-center justify-center">
          <MessageSquareIcon className="size-4 text-cyan-400" />
        </div>

        {/* Name + status */}
        <div className="min-w-0 overflow-hidden">
          <p className="text-[10px] font-bold tracking-widest uppercase text-cyan-500/70 leading-none mb-0.5">
            Charchalu
          </p>
          <h3 className="text-slate-200 font-semibold text-sm truncate group-hover:text-cyan-400 transition-colors leading-tight">
            {authUser?.fullName}
          </h3>
        </div>

        {/* Avatar */}
        <div className="relative flex-shrink-0 ml-auto">
          <img
            src={authUser?.profilePic || "/avatar.png"}
            alt="Profile"
            className="size-8 rounded-full object-cover border border-slate-700/60 group-hover:border-cyan-500/50 transition-colors"
          />
          <span className="absolute bottom-0 right-0 size-2 bg-emerald-400 rounded-full border border-slate-900" />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        {/* Sound toggle */}
        <button
          id="toggle-sound-btn"
          onClick={() => {
            mouseClickSound.currentTime = 0;
            mouseClickSound.play().catch(() => {});
            toggleSound();
          }}
          title={isSoundEnabled ? "Disable sounds" : "Enable sounds"}
          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
        >
          {isSoundEnabled ? (
            <Volume2Icon className="size-4 text-cyan-400" />
          ) : (
            <VolumeOffIcon className="size-4" />
          )}
        </button>

        {/* Logout */}
        <button
          id="logout-btn"
          onClick={logout}
          title="Logout"
          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
        >
          <LogOutIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

export default ProfileHeader;
