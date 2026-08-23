import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useCall(userId) {
  const [activeCall, setActiveCall] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef(null);
  const callIdRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pollingRef = useRef(null);
  const localStreamRef = useRef(null);

  function doCleanup() {
    if (pcRef.current) { try { pcRef.current.close(); } catch {} pcRef.current = null; }
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setCallDuration(0);
    startTimeRef.current = null;
    callIdRef.current = null;
  }

  useEffect(() => () => doCleanup(), []);

  async function getLocalMedia(video = false) {
    // Reuse pre-warmed stream if available (prevents double permission dialog)
    if (localStreamRef.current) {
      const s = localStreamRef.current;
      // Add video track if upgrading from audio-only
      if (video && !s.getVideoTracks().length) {
        try {
          const vs = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" } });
          s.addTrack(vs.getVideoTracks()[0]);
        } catch {}
      }
      return s;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: video ? { width: 640, height: 480, facingMode: "user" } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  function createPC() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const iceBuffer = [];
    let iceSendTimer = null;
    function flushIce() {
      if (iceBuffer.length && callIdRef.current) {
        const batch = [...iceBuffer];
        iceBuffer.length = 0;
        api.post(`/api/calls/${callIdRef.current}/candidate`, { candidates: batch }).catch(() => {});
      }
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        iceBuffer.push(e.candidate.toJSON());
        if (!iceSendTimer) iceSendTimer = setTimeout(() => { iceSendTimer = null; flushIce(); }, 200);
      }
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === "complete") { clearTimeout(iceSendTimer); iceSendTimer = null; flushIce(); }
    };
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") endCall();
    };
    pcRef.current = pc;
    return pc;
  }

  // ---- START CALL (caller) ----
  async function startCall(calleeId, video = false) {
    const stream = await getLocalMedia(video);
    const pc = createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const d = await api.post("/api/calls/start", { calleeId, offer: pc.localDescription.toJSON() });
    callIdRef.current = d.callId;
    setActiveCall({ id: d.callId, status: "ringing", isCaller: true, video, otherUserId: calleeId });
  }

  // ---- ANSWER CALL (callee) ----
  async function answerCall(callData, video = false) {
    // Get mic IMMEDIATELY — this is what takes 5-10 seconds on mobile
    const stream = await getLocalMedia(video);
    const pc = createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    if (callData.offer) await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    if (callData.candidates?.length) {
      for (const c of callData.candidates) { try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {} }
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await api.post(`/api/calls/${callData.id}/answer`, { answer: pc.localDescription.toJSON() });
    callIdRef.current = callData.id;
    startTimeRef.current = Date.now();
    startDurationTimer();
    setActiveCall({ id: callData.id, status: "active", isCaller: false, video, otherUserId: callData.callerId, otherUser: callData.callerName ? { name: callData.callerName, avatar: callData.callerAvatar } : undefined });
  }

  // ---- END CALL ----
  async function endCall() {
    const id = callIdRef.current;
    doCleanup();
    if (id) api.post(`/api/calls/${id}/end`).catch(() => {});
  }

  // ---- UPGRADE TO VIDEO ----
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

  function toggleMute() {
    const s = localStreamRef.current;
    if (s) { const t = s.getAudioTracks()[0]; if (t) t.enabled = !t.enabled; }
  }
  function toggleCamera() {
    const s = localStreamRef.current;
    if (s) { const t = s.getVideoTracks()[0]; if (t) t.enabled = !t.enabled; }
  }

  function startDurationTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
  }

  // ---- POLLING ----
  // Fast (200ms) when in a call, slow (5s) when idle
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function poll() {
      try {
        const d = await api.get("/api/calls/poll");
        if (cancelled) return;
        if (!d.call) {
          if (callIdRef.current) doCleanup();
          return;
        }
        const c = d.call;

        // CASE 1: Incoming call (we are callee, status is ringing)
        if (c.status === "ringing" && !c.isCaller) {
          if (callIdRef.current !== c.id) {
            callIdRef.current = c.id;
            setActiveCall({
              id: c.id, status: "ringing", isCaller: false, video: false,
              otherUserId: c.callerId,
              otherUser: { name: c.callerName, avatar: c.callerAvatar },
              offer: c.offer, candidates: c.candidates,
            });
            // Pre-warm mic so answer is instant
            try {
              const s = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStreamRef.current = s;
              setLocalStream(s);
            } catch {}
          }
          return;
        }

        // CASE 2: Our call was answered (we are caller)
        if (c.status === "active" && c.isCaller && callIdRef.current === c.id) {
          if (c.answer && pcRef.current?.signalingState === "have-local-offer") {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(c.answer));
            if (c.candidates?.length) {
              for (const cand of c.candidates) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)); } catch {} }
            }
            startTimeRef.current = startTimeRef.current || Date.now();
            startDurationTimer();
            setActiveCall(p => p ? { ...p, status: "active" } : p);
          }
          return;
        }

        // CASE 3: Call ended
        if (c.status === "ended" && callIdRef.current === c.id) {
          doCleanup();
          return;
        }

        // CASE 4: We answered (callee), status is now active
        if (c.status === "active" && !c.isCaller && callIdRef.current === c.id) {
          setActiveCall(p => p ? { ...p, status: "active" } : p);
          return;
        }
      } catch {}
    }

    // Poll slowly when idle, fast when in a call
    poll();
    function scheduleNext() {
      const interval = callIdRef.current ? 200 : 5000;
      pollingRef.current = setTimeout(async () => {
        await poll();
        scheduleNext();
      }, interval);
    }
    scheduleNext();
    return () => { cancelled = true; if (pollingRef.current) clearTimeout(pollingRef.current); };
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
