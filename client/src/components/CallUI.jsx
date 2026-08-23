import { useRef, useEffect, useState } from "react";
import { Avatar } from "./Avatar.jsx";
import { formatCallDuration } from "../webrtc.js";

function log(...a) { console.log("[CALL-AUDIO]", ...a); }

export function CallUI({
  call,
  localStream,
  remoteStream,
  callDuration,
  onAnswer,
  onEnd,
  onUpgradeVideo,
  onToggleMute,
  onToggleCamera,
}) {
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // Attach remoteStream to audio — retry aggressively
  useEffect(() => {
    if (!remoteStream) { log("no remoteStream yet"); return; }
    log("remoteStream received, tracks:", remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`));

    function tryAttach() {
      const el = remoteAudioRef.current;
      if (!el) { log("audio ref not ready"); return; }
      el.srcObject = remoteStream;
      el.play().then(() => {
        log("audio PLAYING!");
        setAudioBlocked(false);
      }).catch(e => {
        log("audio play blocked:", e.message);
        setAudioBlocked(true);
      });
    }

    tryAttach();
    // Retry every 300ms — browsers block autoplay until user taps
    const t = setInterval(tryAttach, 300);
    return () => clearInterval(t);
  }, [remoteStream]);

  // Attach to video elements
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [remoteStream, localStream]);

  // Log call state changes
  useEffect(() => {
    if (call) log("call state:", call.status, "isCaller:", call.isCaller, "video:", call.video);
  }, [call]);

  // Unmute handler — user taps this to unlock audio
  function handleUnmute() {
    const el = remoteAudioRef.current;
    if (el) {
      el.muted = false;
      el.volume = 1;
      el.play().then(() => { setAudioBlocked(false); log("unmuted & playing"); }).catch(() => {});
    }
  }

  if (!call) return null;

  const isVideo = call.video && (remoteStream || localStream);
  const otherName = call.otherUser?.name || (call.isCaller ? "Calling..." : "Incoming call");
  const otherAvatar = call.otherUser?.avatar;
  const isRinging = call.status === "ringing";

  return (
    <>
      {/* HIDDEN AUDIO — always renders, always plays remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline muted={false} style={{ position: "absolute", width: 1, height: 1, opacity: 0.01, pointerEvents: "none" }} />

      {/* Tap-to-unmute banner — shown when autoplay blocks audio */}
      {audioBlocked && !isRinging && (
        <div
          onClick={handleUnmute}
          style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 10001,
            background: "#1a73e8", color: "white", textAlign: "center",
            padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer",
          }}
        >
          Tap here to enable sound
        </div>
      )}

      <div className={`call-overlay ${isVideo && !isRinging ? "call-video" : ""}`}>
        {isVideo && !isRinging ? (
          <div className="call-video-container">
            <video ref={remoteVideoRef} autoPlay playsInline className="call-remote-video" />
            <video ref={localVideoRef} autoPlay playsInline muted className="call-local-video" />
            <div className="call-video-info">
              <span className="call-video-name">{otherName}</span>
              {callDuration > 0 && <span className="call-video-time">{formatCallDuration(callDuration)}</span>}
            </div>
          </div>
        ) : (
          <div className="call-audio-container">
            <div className="call-avatar-ring">
              <Avatar src={otherAvatar} username={otherName} size={120} />
            </div>
            <div className="call-name">{otherName}</div>
            <div className="call-status">
              {isRinging ? (call.isCaller ? "Ringing..." : "Incoming call") : formatCallDuration(callDuration)}
            </div>
          </div>
        )}

        <div className={`call-controls ${isVideo && !isRinging ? "call-controls-video" : ""}`}>
          {/* Callee: answer + decline */}
          {isRinging && !call.isCaller && (
            <button className="call-btn call-answer" onClick={() => { handleUnmute(); onAnswer(call); }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z" />
              </svg>
            </button>
          )}
          {isRinging && !call.isCaller && (
            <button className="call-btn call-decline" onClick={onEnd}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          )}

          {/* Caller: cancel while ringing */}
          {isRinging && call.isCaller && (
            <button className="call-btn call-decline" onClick={onEnd}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          )}

          {/* Active call: mute, camera, end */}
          {!isRinging && (
            <>
              <button className="call-btn call-mute" onClick={onToggleMute} title="Mute">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
              {!call.video && (
                <button className="call-btn call-upgrade" onClick={onUpgradeVideo} title="Turn on camera">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </button>
              )}
              <button className="call-btn call-decline" onClick={onEnd} title="End call">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                  <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
