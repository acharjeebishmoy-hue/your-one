import { useRef, useEffect, useState, useCallback } from "react";
import { Avatar } from "./Avatar.jsx";
import { formatCallDuration } from "../webrtc.js";

function log(...a) { console.log("[CALL-AUDIO]", ...a); }

export function CallUI({
  call,
  localStream,
  remoteStream,
  callDuration,
  connectionState,
  onAnswer,
  onEnd,
  onUpgradeVideo,
  onToggleMute,
  onToggleCamera,
  onRetry,
}) {
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const localStreamRef = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(true); // Start as blocked until proven playing
  const ringIntervalRef = useRef(null);
  const audioCtxRef = useRef(null);

  // Keep refs in sync so the retry loop always has the latest streams
  useEffect(() => { remoteStreamRef.current = remoteStream; }, [remoteStream]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // Vibrate + ringtone when incoming call arrives
  useEffect(() => {
    const isRinging = call?.status === "ringing" && !call?.isCaller;
    if (!isRinging) {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
      }
      if (audioCtxRef.current) {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
      return;
    }
    // Vibrate in a pattern: buzz-pause-buzz-pause (like a real phone ring)
    const pattern = [300, 200, 300, 200, 300, 200];
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
      ringIntervalRef.current = setInterval(() => navigator.vibrate(pattern), 2000);
    }
    // Ringtone via Web Audio API
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      function playRing() {
        try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 440;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.3, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.5);
        } catch {}
      }
      playRing();
      const ringTone = setInterval(playRing, 1500);
      return () => {
        clearInterval(ringTone);
        if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
        try { ctx.close(); } catch {}
        audioCtxRef.current = null;
      };
    } catch {}
    return () => {
      if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
    };
  }, [call?.status, call?.isCaller]);

  // Stop vibration when call is answered or ended
  useEffect(() => {
    if (!call || call.status !== "ringing") {
      if (ringIntervalRef.current) {
        clearInterval(ringIntervalRef.current);
        ringIntervalRef.current = null;
        navigator.vibrate?.(0);
      }
    }
  }, [call?.status]);

  // CRITICAL FIX: Ensure local mic is always unmuted so other side can hear us
  useEffect(() => {
    if (!localStream) return;
    // Make sure all audio tracks are enabled (unmuted)
    localStream.getAudioTracks().forEach(t => {
      if (!t.enabled) {
        t.enabled = true;
        log("force-unmuted local audio track");
      }
    });
  }, [localStream, connectionState]);

  // CRITICAL FIX: Aggressive audio/video attachment with refs and faster retry
  // Uses refs so it always has the latest streams even if React hasn't re-rendered
  useEffect(() => {
    if (!remoteStream && !localStream) return;
    let cleared = false;

    function ensureAudioPlays() {
      const el = remoteAudioRef.current;
      const stream = remoteStreamRef.current;
      if (!el || !stream) return;

      // Make sure all remote audio tracks are enabled
      stream.getAudioTracks().forEach(t => {
        if (!t.enabled) {
          t.enabled = true;
          log("force-unmuted remote audio track");
        }
      });

      // Attach stream if changed
      if (el.srcObject !== stream) {
        el.srcObject = stream;
        log("audio srcObject attached, tracks:", stream.getTracks().map(t => t.kind + ":" + t.readyState + ":" + t.enabled));
      }

      // Always try to play
      if (el.paused || el.ended) {
        el.play().then(() => {
          if (!cleared) {
            setAudioBlocked(false);
            log("audio PLAYING!");
          }
        }).catch(() => {
          if (!cleared) setAudioBlocked(true);
        });
      } else {
        if (!cleared) setAudioBlocked(false);
      }
    }

    function ensureVideoPlays() {
      // Remote video
      const rvEl = remoteVideoRef.current;
      const rStream = remoteStreamRef.current;
      if (rvEl && rStream) {
        if (rvEl.srcObject !== rStream) {
          rvEl.srcObject = rStream;
          log("remote video attached, tracks:", rStream.getTracks().map(t => t.kind + ":" + t.readyState));
        }
        if (rvEl.paused || rvEl.ended || rvEl.readyState < 2) {
          rvEl.play().then(() => log("remote video PLAYING")).catch(() => {});
        }
      }
      // Local video
      const lvEl = localVideoRef.current;
      const lStream = localStreamRef.current;
      if (lvEl && lStream) {
        if (lvEl.srcObject !== lStream) {
          lvEl.srcObject = lStream;
          log("local video attached");
        }
      }
    }

    // Retry aggressively: every 100ms for the first 5s, then every 500ms
    ensureAudioPlays();
    ensureVideoPlays();
    let count = 0;
    const t = setInterval(() => {
      if (cleared) return;
      ensureAudioPlays();
      ensureVideoPlays();
      count++;
    }, count < 50 ? 100 : 500);
    return () => { cleared = true; clearInterval(t); };
  }, [remoteStream, localStream, call?.video, connectionState]);

  // Log state changes
  useEffect(() => {
    if (call) log("call state:", call.status, "isCaller:", call.isCaller, "connectionState:", connectionState);
  }, [call, connectionState]);

  // Auto-close failed calls after 3s so farmer never stares at an error screen
  useEffect(() => {
    if (connectionState === "failed") {
      const t = setTimeout(() => { if (onEnd) onEnd(); }, 3000);
      return () => clearTimeout(t);
    }
  }, [connectionState, onEnd]);

  // CRITICAL: handleUnmute also unmutes local mic so the OTHER side can hear
  const handleUnmute = useCallback(() => {
    // Unmute remote audio playback
    const el = remoteAudioRef.current;
    if (el) {
      el.muted = false;
      el.volume = 1;
      el.play().then(() => { setAudioBlocked(false); log("remote audio unmuted & playing"); }).catch(() => {});
    }
    // ALSO unmute local mic — this is the key fix for one-way audio
    const ls = localStreamRef.current;
    if (ls) {
      ls.getAudioTracks().forEach(t => {
        if (!t.enabled) {
          t.enabled = true;
          log("unmuted local mic via tap");
        }
        // Also ensure it's not muted at the track level
        if (t.muted) {
          log("track was muted, unmuting");
        }
      });
    }
    // Also try to ensure remote audio tracks are enabled
    const rs = remoteStreamRef.current;
    if (rs) {
      rs.getAudioTracks().forEach(t => {
        if (!t.enabled) {
          t.enabled = true;
          log("unmuted remote audio track via tap");
        }
      });
    }
    // Ensure video is playing too
    const rvEl = remoteVideoRef.current;
    if (rvEl && remoteStreamRef.current) {
      rvEl.srcObject = remoteStreamRef.current;
      rvEl.play().catch(() => {});
    }
    const lvEl = localVideoRef.current;
    if (lvEl && localStreamRef.current) {
      lvEl.srcObject = localStreamRef.current;
    }
  }, []);

  if (!call) return null;

  const isVideo = call.video && (remoteStream || localStream);
  const isRinging = call.status === "ringing";
  const isFailed = connectionState === "failed";
  const isConnecting = connectionState === "connecting";

  // Build the status text based on connection state
  let statusText = "";
  if (isFailed) {
    statusText = "Could not connect";
  } else if (isRinging && call.isCaller) {
    statusText = "Ringing...";
  } else if (isRinging && !call.isCaller) {
    statusText = "Incoming call";
  } else if (isConnecting) {
    statusText = "Connecting...";
  } else if (connectionState === "connected" && callDuration > 0) {
    statusText = formatCallDuration(callDuration);
  } else {
    statusText = call.otherUser?.name || "Call";
  }

  const otherName = call.otherUser?.name || (call.isCaller ? "Calling..." : "Incoming call");
  const otherAvatar = call.otherUser?.avatar;

  return (
    <>
      {/* Hidden audio — always renders, always plays remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline muted={false} style={{ position: "absolute", width: 1, height: 1, opacity: 0.01, pointerEvents: "none" }} />

      {/* Call overlay — entire screen is a tap target */}
      <div
        className={`call-overlay ${isVideo && !isRinging ? "call-video" : ""}`}
        onClick={handleUnmute}
        style={{ cursor: "pointer" }}
      >
        {isVideo && !isRinging ? (
          <div className="call-video-container">
            <video ref={remoteVideoRef} autoPlay playsInline className="call-remote-video" />
            <video ref={localVideoRef} autoPlay playsInline muted className="call-local-video" />
            <div className="call-video-info">
              <span className="call-video-name">{otherName}</span>
              <span className="call-video-time">{statusText}</span>
            </div>
          </div>
        ) : (
          <div className="call-audio-container">
            <div className="call-avatar-ring">
              <Avatar src={otherAvatar} username={otherName} size={120} />
            </div>
            <div className="call-name">{otherName}</div>
            <div className="call-status">{statusText}</div>
            {/* Show tap hint when connected but audio is blocked (mobile autoplay) */}
            {connectionState === "connected" && audioBlocked && (
              <div className="call-tap-hint" style={{
                color: '#fff',
                fontSize: 14,
                marginTop: 12,
                opacity: 0.8,
                animation: 'pulse 1.5s infinite',
                textShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}>
                Tap anywhere to hear
              </div>
            )}
          </div>
        )}

        <div className={`call-controls ${isVideo && !isRinging ? "call-controls-video" : ""}`}>
          {/* Callee: answer with video + answer audio + decline */}
          {isRinging && !call.isCaller && (
            <button className="call-btn call-answer-video" onClick={() => { handleUnmute(); onAnswer(call, true); }} title="Answer with video">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            </button>
          )}
          {isRinging && !call.isCaller && (
            <button className="call-btn call-answer" onClick={() => { handleUnmute(); onAnswer(call, false); }}>
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

          {/* Failed: retry + end */}
          {isFailed && (
            <button className="call-btn call-answer" onClick={() => { handleUnmute(); if (onRetry) onRetry(); }} title="Retry">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
          )}

          {/* Failed: end */}
          {isFailed && (
            <button className="call-btn call-decline" onClick={onEnd} title="End">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white" stroke="none">
                <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.956.956 0 0 1-.29-.7c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
              </svg>
            </button>
          )}

          {/* Active call: mute, camera, end */}
          {!isRinging && !isFailed && (
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
