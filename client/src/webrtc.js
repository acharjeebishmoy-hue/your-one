import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.ekiga.net" },
  { urls: "stun:stun.ideasip.com" },
  { urls: "stun:stun.schlund.de" },
  { urls: "stun:stun.voiparound.com" },
  { urls: "stun:stun.voipbuster.com" },
  { urls: "stun:stun.voipstunt.com" },
  { urls: "stun:stun.services.mozilla.com" },
];

function log(...args) { console.log("[CALL]", ...args); }

export function useCall(userId) {
  const [activeCall, setActiveCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef(null);
  const callIdRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const localStreamRef = useRef(null);
  const activeCallRef = useRef(null);
  const processedAnswerRef = useRef(false);
  const processedCandidatesRef = useRef(new Set());

  // Keep refs in sync
  useEffect(() => { activeCallRef.current = activeCall; }, [activeCall]);

  function doCleanup() {
    log("cleanup");
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setCallDuration(0);
    startTimeRef.current = null;
    callIdRef.current = null;
    processedAnswerRef.current = false;
    processedCandidatesRef.current = new Set();
  }

  useEffect(() => () => doCleanup(), []);

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
      log("remote audio tracks:", e.streams[0]?.getAudioTracks().length);
      if (e.streams[0]) {
        setRemoteStream(e.streams[0]);
      } else {
        // Some browsers send tracks without a stream wrapper
        log("No stream on track, creating one");
        const s = new MediaStream([e.track]);
        setRemoteStream(s);
      }
    };

    pc.oniceconnectionstatechange = () => {
      log("ICE state:", pc.iceConnectionState);
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
        log("!!! ICE CONNECTED !!!");
      }
      if (pc.iceConnectionState === "failed") {
        log("!!! ICE FAILED — no sound possible without TURN server !!!");
      }
    };

    pc.onconnectionstatechange = () => {
      log("connection state:", pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        log("connection lost, ending call");
        endCall();
      }
    };

    // Diagnostic timeout
    setTimeout(() => {
      if (pcRef.current === pc) {
        log("=== DIAGNOSTIC after 15s ===");
        log("signaling:", pc.signalingState);
        log("ICE:", pc.iceConnectionState);
        log("gathering:", pc.iceGatheringState);
        log("remote streams:", pc.getRemoteStreams().length);
        log("local streams:", pc.getLocalStreams().length);
        log("remoteDescription:", !!pc.remoteDescription);
        log("localDescription:", !!pc.localDescription);
        if (pc.getRemoteStreams().length > 0) {
          const tracks = pc.getRemoteStreams()[0].getTracks();
          log("remote tracks:", tracks.map(t => `${t.kind}:${t.enabled}:${t.readyState}`));
        }
        log("=== END DIAGNOSTIC ===");
      }
    }, 15000);

    pcRef.current = pc;
    return pc;
  }

  async function startCall(calleeId, video = false) {
    log("startCall", calleeId);
    const stream = await getLocalMedia(video);
    const pc = createPC(true);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const d = await api.post("/api/calls/start", { calleeId, offer: pc.localDescription.toJSON() });
    log("call created, id:", d.callId);
    callIdRef.current = d.callId;
    processedAnswerRef.current = false;
    // We don't know the callee's name yet — it will be filled in when the call becomes active
    setActiveCall({ id: d.callId, status: "ringing", isCaller: true, video, otherUserId: calleeId });
  }

  async function answerCall(callData, video = false) {
    log("answerCall", callData.id, "offer:", !!callData.offer);
    const stream = await getLocalMedia(video);
    const pc = createPC(false);
    stream.getTracks().forEach(t => { log("adding track:", t.kind, t.enabled); pc.addTrack(t, stream); });
    log("PC signaling after tracks:", pc.signalingState);
    if (callData.offer) await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    if (callData.candidates?.length) {
      log("adding", callData.candidates.length, "early candidates from caller");
      for (const c of callData.candidates) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) { log("candidate error:", e.message); } }
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await api.post(`/api/calls/${callData.id}/answer`, { answer: pc.localDescription.toJSON() });
    log("answer sent!");
    callIdRef.current = callData.id;
    processedAnswerRef.current = true;
    startTimeRef.current = Date.now();
    startDurationTimer();
    setActiveCall({
      id: callData.id, status: "active", isCaller: false, video,
      otherUserId: callData.callerId,
      otherUser: callData.callerName ? { name: callData.callerName, avatar: callData.callerAvatar } : undefined,
    });
  }

  async function endCall() {
    log("endCall");
    const id = callIdRef.current;
    doCleanup();
    if (id) api.post(`/api/calls/${id}/end`).catch(() => {});
  }

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

  // ---- SIGNALING: Polling only (SSE dies after 30s on Render free tier) ----
  useEffect(() => {
    if (!userId) return;
    log("starting polling for user", userId);
    let cancelled = false;
    let pollTimer = null;

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
            log("POLL: incoming call", c.id);
            callIdRef.current = c.id;
            processedAnswerRef.current = false;
            setActiveCall({
              id: c.id, status: "ringing", isCaller: false, video: false,
              otherUserId: c.callerId,
              otherUser: { name: c.callerName, avatar: c.callerAvatar },
              offer: c.offer, candidates: c.candidates || [],
            });
            // Pre-warm mic
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
              // Add callee's candidates
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

          // Case 3: We answered and call is active (callee already answered)
          } else if (c.id === myId && c.status === "active" && cur?.status === "ringing" && !c.isCaller) {
            log("POLL: we are active");
            setActiveCall(p => p ? { ...p, status: "active" } : p);
          }

          // Case 5: Late ICE candidates (call already active, but candidates arrived after answer)
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

    // Start polling immediately — 1s interval for fast detection
    pollTimer = setInterval(pollOnce, 1000);
    log("polling started (1s)");

    // Also do an immediate first poll
    pollOnce();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [userId]);

  return {
    activeCall, localStream, remoteStream, callDuration,
    startCall, answerCall, endCall, upgradeToVideo, toggleMute, toggleCamera,
  };
}

export function formatCallDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
