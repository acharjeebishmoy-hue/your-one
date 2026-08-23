import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { POLL_MS } from "./perf.js";

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
  const activeCallRef = useRef(null); // FIX: track current activeCall in a ref to avoid stale closure

  // Keep ref in sync with state
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Poll for incoming calls ALWAYS when logged in
  useEffect(() => {
    if (!userId) return;
    pollForCalls();
    pollingRef.current = setInterval(pollForCalls, POLL_MS / 2);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => doCleanup();
  }, []);

  function doCleanup() {
    if (pcRef.current) {
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setActiveCall(null);
    setCallDuration(0);
    startTimeRef.current = null;
    callIdRef.current = null;
  }

  async function getLocalMedia(video = false) {
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
    pc.onicecandidate = (e) => {
      if (e.candidate && callIdRef.current) {
        api.post(`/api/calls/${callIdRef.current}/candidate`, {
          candidate: e.candidate.toJSON(),
        }).catch(() => {});
      }
    };
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        endCall();
      }
    };
    pcRef.current = pc;
    return pc;
  }

  // Start a call (caller side)
  async function startCall(calleeId, video = false) {
    const stream = await getLocalMedia(video);
    const pc = createPC();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const d = await api.post("/api/calls/start", {
      calleeId,
      offer: pc.localDescription.toJSON(),
    });
    callIdRef.current = d.callId;

    setActiveCall({
      id: d.callId,
      status: "ringing",
      isCaller: true,
      video,
      otherUserId: calleeId,
    });
  }

  // Answer a call (callee side) — called when user taps the green button
  async function answerCall(callData, video = false) {
    const stream = await getLocalMedia(video);
    const pc = createPC();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    if (callData.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    }

    // Add any existing ICE candidates
    if (callData.candidates?.length) {
      for (const c of callData.candidates) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
      }
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await api.post(`/api/calls/${callData.id}/answer`, {
      answer: pc.localDescription.toJSON(),
    });

    callIdRef.current = callData.id;
    startTimeRef.current = Date.now();
    startDurationTimer();

    setActiveCall((prev) => prev ? { ...prev, status: "active" } : {
      id: callData.id,
      status: "active",
      isCaller: false,
      video,
      otherUserId: callData.callerId,
    });
  }

  // End the current call
  async function endCall() {
    const id = callIdRef.current;
    doCleanup();
    if (id) {
      try { await api.post(`/api/calls/${id}/end`); } catch {}
    }
  }

  // Upgrade audio to video
  async function upgradeToVideo() {
    if (!pcRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      const videoTrack = stream.getVideoTracks()[0];
      pcRef.current.addTrack(videoTrack, localStreamRef.current);
      localStreamRef.current?.addTrack(videoTrack);
      setLocalStream(Object.assign(Object.create(Object.getPrototypeOf(localStreamRef.current)), localStreamRef.current));
      setActiveCall((prev) => prev ? { ...prev, video: true } : prev);
    } catch {}
  }

  function toggleMute() {
    const s = localStreamRef.current;
    if (s) {
      const track = s.getAudioTracks()[0];
      if (track) track.enabled = !track.enabled;
    }
  }

  function toggleCamera() {
    const s = localStreamRef.current;
    if (s) {
      const track = s.getVideoTracks()[0];
      if (track) track.enabled = !track.enabled;
    }
  }

  function startDurationTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
  }

  // Poll for calls — runs continuously
  async function pollForCalls() {
    try {
      const d = await api.get("/api/calls/poll");
      const current = activeCallRef.current; // FIX: use ref instead of stale closure

      if (!d.call) {
        // No active call on server — if we had one, it ended
        if (callIdRef.current && current) {
          doCleanup();
        }
        return;
      }
      const c = d.call;

      if (c.status === "ringing" && !c.isCaller) {
        // Incoming call — show ring screen (only if not already showing one)
        if (!current || current.id !== c.id) {
          setActiveCall({
            id: c.id,
            status: "ringing",
            isCaller: false,
            video: false,
            otherUserId: c.callerId,
            otherUser: { name: c.callerName, avatar: c.callerAvatar },
            offer: c.offer,
            candidates: c.candidates,
          });
        }
      } else if (c.status === "active" && c.isCaller && current?.status === "ringing") {
        // FIX: uses ref — our call was answered! Set up remote description
        if (c.answer && pcRef.current?.signalingState === "have-local-offer") {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(c.answer));
          if (c.candidates?.length) {
            for (const cand of c.candidates) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)); } catch {}
            }
          }
          startTimeRef.current = startTimeRef.current || Date.now();
          startDurationTimer();
          setActiveCall((prev) => prev ? { ...prev, status: "active" } : prev);
        }
      } else if (c.status === "ended") {
        if (callIdRef.current === c.id) {
          doCleanup();
        }
      }
    } catch {}
  }

  return {
    activeCall,
    localStream,
    remoteStream,
    callDuration,
    startCall,
    answerCall,
    endCall,
    upgradeToVideo,
    toggleMute,
    toggleCamera,
  };
}

export function formatCallDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
