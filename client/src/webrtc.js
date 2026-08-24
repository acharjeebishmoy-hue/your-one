import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "./api.js";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.services.mozilla.com" },
];

// Adaptive polling intervals (ms)
const POLL_IDLE = 8000;      // 8s when no call — don't hammer server
const POLL_SETUP = 800;     // 800ms during call setup (ringing → answer)
const POLL_ACTIVE = 3000;   // 3s during active call (just for keepalive)

const MAX_RING_TIME = 40000; // 40s max ringing before auto-end
const ICE_RESTART_DELAY = 2000; // wait 2s after ICE failure before retry
const MAX_RETRIES = 2;       // auto-retry ICE up to 2 times

function log(...args) { console.log("[CALL]", ...args); }

export function useCall(userId) {
  const [activeCall, setActiveCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [connectionState, setConnectionState] = useState("idle"); // idle | connecting | ringing | connected | failed | ended

  const pcRef = useRef(null);
  const callIdRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const localStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const processedAnswerRef = useRef(false);
  const processedCandidatesRef = useRef(new Set());
  const retryCountRef = useRef(0);
  const ringingTimerRef = useRef(null);
  const peerRef = useRef(null); // the other user's ID we're calling/being called by
  const pollModeRef = useRef("idle"); // idle | setup | active
  const isCallerRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  function doCleanup() {
    log("cleanup");
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (ringingTimerRef.current) { clearTimeout(ringingTimerRef.current); ringingTimerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setCallDuration(0);
    setConnectionState("idle");
    startTimeRef.current = null;
    callIdRef.current = null;
    peerRef.current = null;
    isCallerRef.current = false;
    processedAnswerRef.current = false;
    processedCandidatesRef.current = new Set();
    retryCountRef.current = 0;
    pollModeRef.current = "idle";
  }

  useEffect(() => () => doCleanup(), []);

  // ---- Media ----
  async function getLocalMedia(video = false) {
    if (localStreamRef.current) {
      const s = localStreamRef.current;
      if (video && !s.getVideoTracks().length) {
        try {
          const vs = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
          s.addTrack(vs.getVideoTracks()[0]);
        } catch {}
      }
      return s;
    }
    log("requesting getUserMedia", { video });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { width: 640, height: 480, facingMode: "user" } : false,
    });
    log("got stream", stream.getTracks().map(t => t.kind).join(", "));
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  // ---- PeerConnection factory ----
  function createPC(isCaller) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const iceBuffer = [];
    let iceSendTimer = null;

    function flushIce() {
      if (iceBuffer.length && callIdRef.current) {
        const batch = [...iceBuffer];
        iceBuffer.length = 0;
        log("sending", batch.length, "ICE candidates");
        api.post(`/api/calls/${callIdRef.current}/candidate`, { candidates: batch }).catch(e => log("ICE send failed:", e));
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        iceBuffer.push(e.candidate.toJSON());
        if (!iceSendTimer) iceSendTimer = setTimeout(() => { iceSendTimer = null; flushIce(); }, 150);
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(iceSendTimer); iceSendTimer = null; flushIce(); }
      log("ICE gathering:", pc.iceGatheringState);
    };

    pc.ontrack = (e) => {
      log("!!! ontrack !!!", e.streams[0]?.getTracks().map(t => `${t.kind}:${t.enabled}:${t.readyState}`));
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        const s = new MediaStream([e.track]);
        setRemoteStream(s);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log("ICE state:", state);

      if (state === "connected" || state === "completed") {
        log("!!! ICE CONNECTED !!!");
        setConnectionState("connected");
        retryCountRef.current = 0; // reset retries on success
      }

      if (state === "failed") {
        log("!!! ICE FAILED !!! retry:", retryCountRef.current);
        if (retryCountRef.current < MAX_RETRIES) {
          retryCountRef.current++;
          setConnectionState("connecting"); // show "reconnecting" to user
          log("auto-restarting ICE in", ICE_RESTART_DELAY, "ms (attempt", retryCountRef.current, ")");
          setTimeout(() => restartICE(), ICE_RESTART_DELAY);
        } else {
          log("ICE failed after", MAX_RETRIES, "retries");
          setConnectionState("failed");
        }
      }

      if (state === "disconnected") {
        log("ICE disconnected — may reconnect");
        // Don't immediately end — ICE might recover
      }
    };

    pc.onconnectionstatechange = () => {
      log("connection state:", pc.connectionState);
    };

    pcRef.current = pc;
    return pc;
  }

  // ---- ICE restart ----
  async function restartICE() {
    const pc = pcRef.current;
    const id = callIdRef.current;
    if (!pc || !id) return;

    try {
      log("ICE restart: creating new offer");
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      processedCandidatesRef.current = new Set();
      processedAnswerRef.current = false;

      // Send the new offer to the server (the restart endpoint resets the call)
      await api.post(`/api/calls/${id}/restart`, { offer: pc.localDescription.toJSON() });
      log("ICE restart: new offer sent, waiting for answer");
    } catch (e) {
      log("ICE restart failed:", e);
      setConnectionState("failed");
    }
  }

  // ---- Start call (caller) ----
  async function startCall(calleeId, video = false) {
    log("startCall", calleeId);
    setConnectionState("connecting");
    const stream = await getLocalMedia(video);
    const pc = createPC(true);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const d = await api.post("/api/calls/start", { calleeId, offer: pc.localDescription.toJSON() });
    log("call created, id:", d.callId);
    callIdRef.current = d.callId;
    peerRef.current = calleeId;
    isCallerRef.current = true;
    processedAnswerRef.current = false;
    retryCountRef.current = 0;
    pollModeRef.current = "setup";
    setConnectionState("ringing");
    setActiveCall({ id: d.callId, status: "ringing", isCaller: true, video, otherUserId: calleeId });

    // Auto-end after MAX_RING_TIME
    ringingTimerRef.current = setTimeout(() => {
      if (activeCallRef.current?.status === "ringing" && activeCallRef.current?.isCaller) {
        log("call not answered in", MAX_RING_TIME / 1000, "s — auto-ending");
        endCall();
      }
    }, MAX_RING_TIME);
  }

  // ---- Answer call (callee) ----
  async function answerCall(callData, video = false) {
    log("answerCall", callData.id, "offer:", !!callData.offer);
    setConnectionState("connecting");
    const stream = await getLocalMedia(video);
    const pc = createPC(false);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    if (callData.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    }

    // Add any early ICE candidates from caller
    if (callData.candidates?.length) {
      log("adding", callData.candidates.length, "early candidates from caller");
      for (const c of callData.candidates) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await api.post(`/api/calls/${callData.id}/answer`, { answer: pc.localDescription.toJSON() });
    log("answer sent!");

    callIdRef.current = callData.id;
    peerRef.current = callData.callerId;
    isCallerRef.current = false;
    processedAnswerRef.current = true;
    retryCountRef.current = 0;
    startTimeRef.current = Date.now();
    pollModeRef.current = "active";
    startDurationTimer();
    setConnectionState("connecting"); // connecting until ICE completes

    setActiveCall({
      id: callData.id, status: "active", isCaller: false, video,
      otherUserId: callData.callerId,
      otherUser: callData.callerName ? { name: callData.callerName, avatar: callData.callerAvatar } : undefined,
    });
  }

  // ---- End call ----
  async function endCall() {
    log("endCall");
    const id = callIdRef.current;
    doCleanup();
    if (id) api.post(`/api/calls/${id}/end`).catch(() => {});
  }

  // ---- Upgrade audio → video ----
  async function upgradeToVideo() {
    if (!pcRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
      const vt = stream.getVideoTracks()[0];
      pcRef.current.addTrack(vt, localStreamRef.current);
      localStreamRef.current?.addTrack(vt);
      setLocalStream(Object.assign(Object.create(Object.getPrototypeOf(localStreamRef.current)), localStreamRef.current));
      setActiveCall(p => p ? { ...p, video: true } : p);
    } catch {}
  }

  function toggleMute() { const s = localStreamRef.current; if (s) { const t = s.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; } }
  function toggleCamera() { const s = localStreamRef.current; if (s) { const t = s.getVideoTracks()[0]; if (t) t.enabled = !t.enabled; } }

  function startDurationTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }

  // ---- POLLING: Adaptive interval ----
  useEffect(() => {
    if (!userId) return;
    log("polling system started for user", userId);
    let cancelled = false;
    let pollTimer = null;
    let lastPollMode = "idle";

    function getPollInterval() {
      const mode = pollModeRef.current;
      if (mode === "active") return POLL_ACTIVE;
      if (mode === "setup") return POLL_SETUP;
      return POLL_IDLE;
    }

    function schedulePoll() {
      if (pollTimer) clearTimeout(pollTimer);
      if (cancelled) return;
      const interval = getPollInterval();
      pollTimer = setTimeout(async () => {
        if (cancelled) return;
        await pollOnce();
        schedulePoll();
      }, interval);
    }

    async function pollOnce() {
      if (cancelled) return;
      try {
        const d = await api.get("/api/calls/poll");
        if (d.call) {
          const c = d.call;
          const cur = activeCallRef.current;
          const myId = callIdRef.current;

          // Case 1: Incoming call (not from us, not already handling)
          if (c.status === "ringing" && !c.isCaller && c.id !== myId) {
            log("POLL: incoming call", c.id, "from", c.callerName);
            callIdRef.current = c.id;
            peerRef.current = c.callerId;
            isCallerRef.current = false;
            processedAnswerRef.current = false;
            pollModeRef.current = "setup";
            setConnectionState("ringing");
            setActiveCall({
              id: c.id, status: "ringing", isCaller: false, video: false,
              otherUserId: c.callerId,
              otherUser: { name: c.callerName, avatar: c.callerAvatar },
              offer: c.offer, candidates: c.candidates || [],
            });
            // Pre-warm mic so answer is instant
            try {
              const s = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStreamRef.current = s;
              setLocalStream(s);
              log("mic pre-warmed");
            } catch { log("mic pre-warm failed"); }

          // Case 2: Our call was answered (caller receives answer)
          } else if (c.id === myId && c.status === "active" && !processedAnswerRef.current && c.answer) {
            log("POLL: call answered! Setting remote description...");
            if (pcRef.current?.signalingState === "have-local-offer") {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(c.answer));
              log("Remote description set! ICE state:", pcRef.current.iceConnectionState);
              processedAnswerRef.current = true;
              pollModeRef.current = "active";
              setConnectionState("connecting"); // wait for ICE to complete

              // Add callee's ICE candidates
              if (c.candidates?.length) {
                log("adding", c.candidates.length, "callee candidates");
                for (const cand of c.candidates) {
                  const key = JSON.stringify(cand);
                  if (!processedCandidatesRef.current.has(key)) {
                    try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)); processedCandidatesRef.current.add(key); } catch {}
                  }
                }
              }
              startTimeRef.current = startTimeRef.current || Date.now();
              startDurationTimer();
              const otherName = c.isCaller ? c.calleeName : c.callerName;
              const otherAvatar = c.isCaller ? c.calleeAvatar : c.callerAvatar;
              const otherUserId = c.isCaller ? c.calleeId : c.callerId;
              setActiveCall(p => p ? { ...p, status: "active", otherUser: { name: otherName, avatar: otherAvatar }, otherUserId } : p);
            }

          // Case 3: We answered and call became active (callee sees active)
          } else if (c.id === myId && c.status === "active" && cur?.status === "ringing" && !c.isCaller) {
            log("POLL: we answered, call is active");
            pollModeRef.current = "active";
            setActiveCall(p => p ? { ...p, status: "active" } : p);
          }

          // Case 5: Late ICE candidates (call already active, new candidates arrived)
          if (c.id === myId && c.status === "active" && c.candidates?.length && pcRef.current) {
            let added = 0;
            for (const cand of c.candidates) {
              const key = JSON.stringify(cand);
              if (!processedCandidatesRef.current.has(key)) {
                try {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                  processedCandidatesRef.current.add(key);
                  added++;
                } catch {}
              }
            }
            if (added > 0) log("added", added, "late ICE candidates");
          }
        } else if (!d.call && callIdRef.current) {
          log("POLL: call ended (null)");
          doCleanup();
        }
      } catch (e) { log("poll error:", e.message); }
    }

    schedulePoll();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [userId]);

  return {
    activeCall, localStream, remoteStream, callDuration, connectionState,
    startCall, answerCall, endCall, upgradeToVideo, toggleMute, toggleCamera,
  };
}

export function formatCallDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
