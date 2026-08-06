import { LogOutIcon, VolumeOffIcon, Volume2Icon } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";

const mouseClickSound = new Audio("/sounds/mouse-click.mp3");

function ProfileHeader() {
  const { logout, authUser } = useAuthStore();
  const { isSoundEnabled, toggleSound, setIsSettingsOpen } = useChatStore();

  return (
    <div className="p-4 border-b border-slate-800/80 bg-slate-900/80 flex items-center justify-between">
      <div
        onClick={() => setIsSettingsOpen(true)}
        className="flex items-center gap-3 cursor-pointer group"
      >
        {/* AVATAR WITH ONLINE DOT */}
        <div className="relative">
          <img
            src={authUser?.profilePic || "/avatar.png"}
            alt="Profile"
            className="size-11 rounded-full object-cover border border-slate-700/60 group-hover:border-cyan-500 transition-colors"
          />
          <span className="absolute bottom-0 right-0 size-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
        </div>

        {/* USERNAME & ONLINE TEXT */}
        <div className="overflow-hidden">
          <h3 className="text-slate-100 font-semibold text-sm truncate max-w-[140px] group-hover:text-cyan-400 transition-colors">
            {authUser?.fullName}
          </h3>
          <p className="text-emerald-400 text-xs font-medium">Online</p>
        </div>
      </div>

      {/* HEADER ACTION BUTTONS */}
      <div className="flex items-center space-x-1">
        {/* LOGOUT BUTTON */}
        <button
          onClick={logout}
          title="Logout"
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
        >
          <LogOutIcon className="size-5" />
        </button>

        {/* SOUND TOGGLE BUTTON */}
        <button
          onClick={() => {
            mouseClickSound.currentTime = 0;
            mouseClickSound.play().catch(() => {});
            toggleSound();
          }}
          title={isSoundEnabled ? "Disable sounds" : "Enable sounds"}
          className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors"
        >
          {isSoundEnabled ? (
            <Volume2Icon className="size-5 text-cyan-400" />
          ) : (
            <VolumeOffIcon className="size-5" />
          )}
        </button>
      </div>
    </div>
  );
}

export default ProfileHeader;

