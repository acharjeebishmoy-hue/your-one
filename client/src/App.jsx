import { useEffect, useState } from "react";
import { POLL_MS, SKIP_PRESENCE } from "./perf.js";
import { Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api.js";
import { useAuth } from "./auth.jsx";
import { Navbar } from "./components/Navbar.jsx";
import { BottomNav } from "./components/BottomNav.jsx";
import { DesktopRail } from "./components/DesktopPanels.jsx";
import { DesktopRightPanel } from "./components/DesktopRightPanel.jsx";
import { Composer } from "./components/Composer.jsx";
import { MessageToast } from "./components/MessageToast.jsx";
import { PushBanner } from "./components/PushBanner.jsx";
import { PostModal } from "./components/PostModal.jsx";
import { NameModal } from "./components/NameModal.jsx";
import { CallUI } from "./components/CallUI.jsx";
import { useCall } from "./webrtc.js";
import { Feed } from "./pages/Feed.jsx";
import { Explore } from "./pages/Explore.jsx";
import { SearchPage } from "./pages/SearchPage.jsx";
import { MessagesPage } from "./pages/MessagesPage.jsx";
import { Events } from "./pages/Events.jsx";
import { HashtagPage } from "./pages/HashtagPage.jsx";
import { Profile } from "./pages/Profile.jsx";

export default function App() {
  const { user, loading } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);
  const [feedView, setFeedView] = useState("everyone");
  const [nameOpen, setNameOpen] = useState(false);
  const [feedVersion, setFeedVersion] = useState(0);
  const call = useCall(user?.id);

  useEffect(() => {
    const open = () => setNameOpen(true);
    window.addEventListener("need-name", open);
    return () => window.removeEventListener("need-name", open);
  }, []);

  // Presence heartbeat — friends see you as online.
  useEffect(() => {
    if (!user?.name || SKIP_PRESENCE) return;
    const ping = () => api.post("/api/presence").catch(() => {});
    ping();
    const t = setInterval(ping, POLL_MS * 3);
    return () => clearInterval(t);
  }, [user?.name]);

  useEffect(() => {
    if (!loading && user && !user.name && !nameOpen) setNameOpen(true);
  }, [loading, user, nameOpen]);

  if (loading) return <div className="spin" />;

  return (
    <>
      <Navbar onEditName={() => setNameOpen(true)} />
      <PushBanner />
      <div className="app-body">
        <DesktopRail onCompose={() => setComposerOpen(true)} onEditName={() => setNameOpen(true)} />
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Feed view={feedView} setView={setFeedView} version={feedVersion} onCompose={() => setComposerOpen(true)} />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/messages" element={<MessagesPage call={call} />} />
            <Route path="/events" element={<Events />} />
            <Route path="/hashtag/:tag" element={<HashtagPage />} />
            <Route path="/u/:name" element={<Profile />} />
            <Route path="/p/:id" element={<PostModal />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <DesktopRightPanel />
      </div>

      <MessageToast />
      <CallUI
        call={call.activeCall}
        localStream={call.localStream}
        remoteStream={call.remoteStream}
        callDuration={call.callDuration}
        onAnswer={() => {
          if (call.activeCall?.offer) {
            call.answerCall({
              id: call.activeCall.id,
              callerId: call.activeCall.otherUserId,
              offer: call.activeCall.offer,
              candidates: call.activeCall.candidates || [],
            });
          }
        }}
        onEnd={call.endCall}
        onUpgradeVideo={call.upgradeToVideo}
        onToggleMute={call.toggleMute}
        onToggleCamera={call.toggleCamera}
      />
      {composerOpen && (
        <Composer
          onClose={() => setComposerOpen(false)}
          onCreated={() => setFeedVersion((v) => v + 1)}
        />
      )}
      {nameOpen && <NameModal onClose={() => setNameOpen(false)} />}
      <BottomNav onCompose={() => setComposerOpen(true)} />
    </>
  );
}
