import { useState, useRef } from "react";
import {
  XIcon,
  UserIcon,
  MailIcon,
  CameraIcon,
  LogOutIcon,
  Volume2Icon,
  VolumeOffIcon,
  ShieldCheckIcon,
  SaveIcon,
  LoaderIcon,
} from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import toast from "react-hot-toast";

const mouseClickSound = new Audio("/sounds/mouse-click.mp3");

function SettingsModal() {
  const { authUser, updateProfile, logout } = useAuthStore();
  const { isSettingsOpen, setIsSettingsOpen, isSoundEnabled, toggleSound } = useChatStore();

  const [fullName, setFullName] = useState(authUser?.fullName || "");
  const [selectedImg, setSelectedImg] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const fileInputRef = useRef(null);

  if (!isSettingsOpen) return null;

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      setSelectedImg(reader.result);
    };
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Full name cannot be empty");
      return;
    }

    setIsUpdating(true);
    try {
      const updateData = {};
      if (fullName.trim() !== authUser.fullName) {
        updateData.fullName = fullName.trim();
      }
      if (selectedImg) {
        updateData.profilePic = selectedImg;
      }

      if (Object.keys(updateData).length === 0) {
        toast("No changes to save");
        setIsUpdating(false);
        return;
      }

      await updateProfile(updateData);
      setSelectedImg(null);
    } catch (error) {
      console.log("Error updating profile:", error);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <h2 className="text-lg font-semibold text-slate-100">Account Settings</h2>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <XIcon className="size-5" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* PROFILE SECTION */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold tracking-wider uppercase text-cyan-400">
              Profile Information
            </h3>

            {/* AVATAR UPLOAD */}
            <div className="flex flex-col items-center justify-center py-2 space-y-3">
              <div className="relative group">
                <img
                  src={selectedImg || authUser?.profilePic || "/avatar.png"}
                  alt="Profile"
                  className="size-24 rounded-full object-cover border-2 border-cyan-500/40 shadow-md"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 p-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full shadow-lg transition-transform group-hover:scale-105"
                >
                  <CameraIcon className="size-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                />
              </div>
              <p className="text-xs text-slate-400">Click camera icon to change avatar</p>
            </div>

            {/* EDIT FULL NAME & EMAIL FORM */}
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    placeholder="Enter your name"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                  <input
                    type="email"
                    value={authUser?.email || ""}
                    disabled
                    className="w-full bg-slate-800/30 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isUpdating}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white py-2.5 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
              >
                {isUpdating ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <>
                    <SaveIcon className="size-4" />
                    <span>Save Profile Changes</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="h-px bg-slate-800" />

          {/* PREFERENCES SECTION */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold tracking-wider uppercase text-cyan-400">
              App Preferences
            </h3>

            <div className="flex items-center justify-between p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <div className="flex items-center space-x-3">
                {isSoundEnabled ? (
                  <Volume2Icon className="size-5 text-cyan-400" />
                ) : (
                  <VolumeOffIcon className="size-5 text-slate-400" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-200">Sound Notifications</p>
                  <p className="text-xs text-slate-400">Play sounds for typing & incoming messages</p>
                </div>
              </div>
              <button
                onClick={() => {
                  mouseClickSound.currentTime = 0;
                  mouseClickSound.play().catch(() => {});
                  toggleSound();
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  isSoundEnabled ? "bg-cyan-600" : "bg-slate-700"
                }`}
              >
                <span
                  className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
                    isSoundEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* SECURITY & INFO */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <ShieldCheckIcon className="size-4 text-emerald-400" />
              <span>End-to-End Encrypted Sessions</span>
            </div>
          </div>

          <div className="h-px bg-slate-800" />

          {/* LOGOUT BUTTON */}
          <div>
            <button
              onClick={() => {
                setIsSettingsOpen(false);
                logout();
              }}
              className="w-full flex items-center justify-center space-x-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 py-2.5 rounded-xl font-medium text-sm transition-colors"
            >
              <LogOutIcon className="size-4" />
              <span>Log Out of Charchalu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
