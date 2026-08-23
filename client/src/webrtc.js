import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "./api.js";
import { POLL_MS } from "./perf.js";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function useCall(userId) {
  const [activeCall, setActiveCall] = useState(null); // { id, status, isCaller, otherUser, ... }
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const pcRef = useRef(null);
  const callIdRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const pollingRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    localStream?.getTracks().forEach((t) => t.stop());
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
    setLocalStream(stream);
    return stream;
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = async (e) => {
      if (e.candidate && callIdRef.current) {
        try {
          await api.post(`/api/calls/${callIdRef.current}/candidate`, {
            candidate: e.candidate.toJSON(),
          });
        } catch {}
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
    const pc = createPeerConnection();
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

    // Poll for answer
    startPolling();
  }

  // Answer a call (callee side)
  async function answerCall(callData, video = false) {
    const stream = await getLocalMedia(video);
    const pc = createPeerConnection();
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    if (callData.offer) {
      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
    }

    // Add any existing ICE candidates
    if (callData.candidates) {
      for (const c of callData.candidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(c));
        } catch {}
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

    setActiveCall({
      id: callData.id,
      status: "active",
      isCaller: false,
      video,
      otherUserId: callData.callerId,
    });
  }

  // End the current call
  async function endCall() {
    if (callIdRef.current) {
      try {
        await api.post(`/api/calls/${callIdRef.current}/end`);
      } catch {}
    }
    cleanup();
  }

  // Upgrade audio call to video
  async function upgradeToVideo() {
    if (!pcRef.current || !activeCall) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      const videoTrack = stream.getVideoTracks()[0];
      pcRef.current.addTrack(videoTrack, localStream);
      // Also add video track to local stream
      localStream?.addTrack(videoTrack);
      setLocalStream({ ...localStream });
      setActiveCall((prev) => ({ ...prev, video: true }));
    } catch {}
  }

  // Toggle mute
  function toggleMute() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
    }
  }

  // Toggle camera
  function toggleCamera() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
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

  // Poll for incoming calls / call state changes
  function startPolling() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const d = await api.get("/api/calls/poll");
        if (!d.call) {
          // Call ended
          if (callIdRef.current && activeCall?.status !== "ended") {
            cleanup();
          }
          return;
        }
        const c = d.call;
        callIdRef.current = c.id;

        if (c.status === "ringing" && !c.isCaller && !activeCall) {
          // Incoming call — show ring screen
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
        } else if (c.status === "active" && c.isCaller && activeCall?.status === "ringing") {
          // Call was answered — set up WebRTC
          if (c.answer && pcRef.current) {
            await pcRef.current.setRemoteDescription(
              new RTCSessionDescription(c.answer)
            );
            // Add callee's ICE candidates
            if (c.candidates) {
              for (const cand of c.candidates) {
                try {
                  await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
                } catch {}
              }
            }
            startTimeRef.current = startTimeRef.current || Date.now();
            startDurationTimer();
            setActiveCall((prev) => prev ? { ...prev, status: "active" } : prev);
          }
        } else if (c.status === "ended") {
          cleanup();
        }
      } catch {}
    }, POLL_MS / 2);
  }

  // Expose
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
    cleanup,
    startPolling,
  };
}

export function formatCallDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
