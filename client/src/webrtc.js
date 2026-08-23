import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
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

  // Keep activeCallRef in sync
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
      log("ICE gathering:", pc.iceGatheringState);
    };
    pc.ontrack = (e) => {
      log("ontrack!", e.streams[0]?.getTracks().map(t => t.kind));
      setRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      log("connection state:", pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") endCall();
    };
    pcRef.current = pc;
    return pc;
  }

  async function startCall(calleeId, video = false) {
    log("startCall", calleeId);
    const stream = await getLocalMedia(video);
    const pc = createPC();
    stream.getTracks().forEach(t => pc.addTrack(t, stream));
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const d = await api.post("/api/calls/start", { calleeId, offer: pc.localDescription.toJSON() });
    log("call created, id:", d.callId);
    callIdRef.current = d.callId;
    setActiveCall({ id: d.callId, status: "ringing", isCaller: true, video, otherUserId: calleeId });
  }

  async function answerCall(callData, video = false) {
    log("answerCall", callData.id, "offer:", !!callData.offer);
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
    log("answer sent!");
    callIdRef.current = callData.id;
    startTimeRef.current = Date.now();
    startDurationTimer();
    setActiveCall({ id: callData.id, status: "active", isCaller: false, video, otherUserId: callData.callerId, otherUser: callData.callerName ? { name: callData.callerName, avatar: callData.callerAvatar } : undefined });
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

  // ---- SIGNALING: SSE + Polling fallback ----
  // SSE dies after ~30s on Render free tier, so polling catches what SSE misses.
  useEffect(() => {
    if (!userId) return;
    log("starting signaling for user", userId);
    let cancelled = false;
    let retryTimer = null;
    let pollTimer = null;

    // --- SSE connection (fast path — instant notifications) ---
    function connectSSE() {
      if (cancelled) return;
      const es = new EventSource(`/api/calls/stream?userId=${userId}`);
      es.onmessage = async (e) => {
        if (cancelled) return;
        try {
          const data = JSON.parse(e.data);
          await handleSignal(data);
        } catch {}
      };
      es.onerror = () => {
        log("SSE error, reconnecting in 3s...");
        es.close();
        if (!cancelled) retryTimer = setTimeout(connectSSE, 3000);
      };
      return es;
    }

    let eventSource = connectSSE();

    // --- Polling fallback (slow but reliable — catches what SSE misses) ---
    async function pollOnce() {
      if (cancelled) return;
      try {
        const d = await api.get("/api/calls/poll");
        if (d.call) {
          const c = d.call;
          const cur = activeCallRef.current;
          const myId = callIdRef.current;

          // Case 1: Incoming call (not from us)
          if (c.status === "ringing" && !c.isCaller && c.id !== myId) {
            log("POLL: incoming call", c.id);
            callIdRef.current = c.id;
            setActiveCall({
              id: c.id, status: "ringing", isCaller: false, video: false,
              otherUserId: c.callerId,
              otherUser: { name: c.callerName, avatar: c.callerAvatar },
              offer: c.offer, candidates: c.candidates || [],
            });
            try {
              const s = await navigator.mediaDevices.getUserMedia({ audio: true });
              localStreamRef.current = s;
              setLocalStream(s);
            } catch {}

          // Case 2: Our call was answered
          } else if (c.id === myId && c.status === "active" && cur?.status === "ringing" && c.answer) {
            log("POLL: call answered!");
            if (pcRef.current?.signalingState === "have-local-offer") {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(c.answer));
              if (c.candidates?.length) {
                for (const cand of c.candidates) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)); } catch {} }
              }
              startTimeRef.current = startTimeRef.current || Date.now();
              startDurationTimer();
              setActiveCall(p => p ? { ...p, status: "active" } : p);
            }

          // Case 3: We answered someone's call (they polled, we're now active)
          } else if (c.id === myId && c.status === "active" && cur?.status === "ringing" && !c.isCaller) {
            log("POLL: we are active (answered via SSE)");
            setActiveCall(p => p ? { ...p, status: "active" } : p);

          // Case 4: Call ended
          } else if (!c.call && myId) {
            log("POLL: call ended");
            doCleanup();
          }
        } else if (!d.call && callIdRef.current) {
          log("POLL: call ended (null)");
          doCleanup();
        }
      } catch {}
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(pollOnce, 1500);
      log("polling started (1.5s)");
    }

    // Start polling immediately — SSE may die, polling is the safety net
    startPolling();

    async function handleSignal(data) {
      log("SSE signal:", data.type, data.callId);
      if (data.type === "incoming") {
        log("INCOMING CALL from", data.callerName);
        callIdRef.current = data.callId;
        setActiveCall({
          id: data.callId, status: "ringing", isCaller: false, video: false,
          otherUserId: data.callerId,
          otherUser: { name: data.callerName, avatar: data.callerAvatar },
          offer: data.offer, candidates: data.candidates || [],
        });
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          localStreamRef.current = s;
          setLocalStream(s);
          log("mic pre-warmed");
        } catch { log("mic pre-warm failed"); }

      } else if (data.type === "answered") {
        log("CALL ANSWERED via SSE");
        if (data.answer && pcRef.current?.signalingState === "have-local-offer") {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          if (data.candidates?.length) {
            for (const cand of data.candidates) { try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)); } catch {} }
          }
          startTimeRef.current = startTimeRef.current || Date.now();
          startDurationTimer();
          setActiveCall(p => p ? { ...p, status: "active" } : p);
        }

      } else if (data.type === "ended") {
        log("CALL ENDED via SSE");
        doCleanup();

      } else if (data.type === "active") {
        log("CALL NOW ACTIVE via SSE");
        setActiveCall(p => p ? { ...p, status: "active" } : p);
      }
    }

    return () => {
      cancelled = true;
      if (eventSource) eventSource.close();
      if (retryTimer) clearTimeout(retryTimer);
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
