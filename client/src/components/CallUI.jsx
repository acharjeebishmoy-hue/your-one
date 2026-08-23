import { useRef, useEffect } from "react";
import { Avatar } from "./Avatar.jsx";
import { formatCallDuration } from "../webrtc.js";

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

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    // FIX: hidden audio element plays sound for audio-only calls
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (!call) return null;

  const isVideo = call.video && (remoteStream || localStream);
  const otherName = call.otherUser?.name || (call.isCaller ? "..." : "...");
  const otherAvatar = call.otherUser?.avatar;
  const isRinging = call.status === "ringing";

  return (
    <div className={`call-overlay ${isVideo && !isRinging ? "call-video" : ""}`}>
      {/* Hidden audio element for audio-only calls */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{display:'none'}} />
      {isVideo && !isRinging ? (
        /* Video call layout */
        <div className="call-video-container">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="call-remote-video"
          />
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="call-local-video"
          />
          <div className="call-video-info">
            <span className="call-video-name">{otherName}</span>
            {callDuration > 0 && (
              <span className="call-video-time">{formatCallDuration(callDuration)}</span>
            )}
          </div>
        </div>
      ) : (
        /* Audio call / ringing layout */
        <div className="call-audio-container">
          <div className="call-avatar-ring">
            <Avatar src={otherAvatar} username={otherName} size={120} />
          </div>
          <div className="call-name">{otherName}</div>
          <div className="call-status">
            {isRinging
              ? call.isCaller
                ? "Ringing..."
                : "Incoming call"
              : formatCallDuration(callDuration)}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={`call-controls ${isVideo && !isRinging ? "call-controls-video" : ""}`}>
        {isRinging && !call.isCaller && (
          <button className="call-btn call-answer" onClick={onAnswer}>
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

        {call.isCaller && isRinging && (
          <button className="call-btn call-decline" onClick={onEnd}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        )}

        {!isRinging && (
          <>
            <button
              className="call-btn call-mute"
              onClick={onToggleMute}
              title="Mute"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>

            {!call.video && (
              <button
                className="call-btn call-upgrade"
                onClick={onUpgradeVideo}
                title="Turn on camera"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
              </button>
            )}

            {call.video && (
              <button
                className="call-btn call-mute"
                onClick={onToggleCamera}
                title="Toggle camera"
              >
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
  );
}
