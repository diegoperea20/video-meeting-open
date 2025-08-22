/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
"use client";
import React, { useEffect, useRef, useState, ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Copy,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Phone,
  MessageCircle,
  MoreVertical,
  LayoutGrid,
  Grid,
  Square,
  Sidebar,
  Users,
  Settings,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
} from "lucide-react";
import io, { Socket as SocketIOClient } from "socket.io-client";
import { useTheme } from "@/context/ThemeContext";

const peerConnectionConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

interface Message {
  sender: string;
  data: string;
}

interface RemoteStream {
  id: string;
  stream: MediaStream;
}

interface User {
  id: string;
  name: string;
}

// Hook to persist preference in localStorage
function useLocalStorage<T>(key: string, initialValue: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  }, [key, value]);
  return [value, setValue];
}

const LAYOUTS = [
  {
    key: "auto",
    label: "Automático (dinámico)",
    icon: <LayoutGrid className="w-5 h-5" />,
  },
  {
    key: "mosaic",
    label: "Mosaico (heredado)",
    icon: <Grid className="w-5 h-5" />,
  },
  { key: "focus", label: "En foco", icon: <Square className="w-5 h-5" /> },
  {
    key: "sidebar",
    label: "Barra lateral",
    icon: <Sidebar className="w-5 h-5" />,
  },
];

// Component to display each camera box with options menu
function VideoBox({
  name,
  videoRef,
  stream,
  isLocal = false,
  openMenuId,
  setOpenMenuId,
  id,
}: {
  name: string;
  videoRef?: React.RefObject<HTMLVideoElement>;
  stream?: MediaStream;
  isLocal?: boolean;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  id: string;
}) {
  // Visual options per user (pin, size)
  const [pinned, setPinned] = useLocalStorage<boolean>(
    `video-pinned-${id}`,
    false
  );
  const [size, setSize] = useLocalStorage<string>(`video-size-${id}`, "medium");
  // Size classes
  const sizeClass =
    size === "small"
      ? "h-32 md:h-40"
      : size === "large"
      ? "h-72 md:h-96"
      : size === "full"
      ? "h-[60vh] md:h-[80vh] col-span-full row-span-full"
      : "h-48 md:h-60"; // medium por defecto
  return (
    <div
      className={`relative rounded-lg border aspect-video bg-black w-full flex items-center justify-center transition-all duration-200 ${sizeClass} ${
        pinned ? "ring-4 ring-primary" : ""
      }`}
      style={pinned ? { zIndex: 20 } : {}}
    >
      {/* Video or name */}
      {isLocal ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="rounded-lg border aspect-video bg-black w-full h-full object-contain"
        />
      ) : stream ? (
        <RemoteVideo stream={stream} />
      ) : (
        <span className="text-white text-lg">{name}</span>
      )}
      {/*  Name */}
      <span className="absolute bottom-2 left-2 text-xs text-white bg-black/60 px-2 py-1 rounded">
        {name}
      </span>
      {/* Button three dots */}
      <button
        className="absolute top-2 right-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white"
        onClick={() => setOpenMenuId(openMenuId === id ? null : id)}
        aria-label="Options"
      >
        <MoreVertical className="w-5 h-5" />
      </button>
      {/* Contextual menu */}
      {openMenuId === id && (
        <div className="absolute top-10 right-2 bg-card border rounded-lg shadow-lg z-50 p-2 min-w-[180px]">
          <div className="font-semibold mb-2">Options</div>
          <button
            className={`w-full text-left px-2 py-1 rounded hover:bg-accent ${
              pinned ? "font-bold text-primary" : ""
            }`}
            onClick={() => {
              setPinned(!pinned);
              setOpenMenuId(null);
            }}
          >
            {pinned ? "Desfijar" : "Fijar"}
          </button>
          <div className="mt-2 mb-1 text-xs text-muted-foreground">Tamaño</div>
          {["small", "medium", "large", "full"].map((sz) => (
            <button
              key={sz}
              className={`w-full text-left px-2 py-1 rounded hover:bg-accent ${
                size === sz ? "font-bold text-primary" : ""
              }`}
              onClick={() => {
                setSize(sz);
                setOpenMenuId(null);
              }}
            >
              {sz === "small"
                ? "Pequeño"
                : sz === "medium"
                ? "Mediano"
                : sz === "large"
                ? "Grande"
                : "Tamaño completo"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RoomPage() {
  const router = useRouter();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [username, setUsername] = useState<string>("");
  const [askForUsername, setAskForUsername] = useState(true);
  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);
  const [screen, setScreen] = useState(false);
  const [screenAvailable, setScreenAvailable] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [newMessages, setNewMessages] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [connections, setConnections] = useState<{
    [id: string]: RTCPeerConnection;
  }>({});
  // Use the correct type for the socket:
  type SocketType = ReturnType<typeof io>;
  const [socket, setSocket] = useState<SocketType | null>(null);
  const [socketId, setSocketId] = useState<string>("");
  const [remoteStreams, setRemoteStreams] = useState<RemoteStream[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [copied, setCopied] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const [serverUrl, setServerUrl] = useState<string>("http://localhost:4001");
  const [layout, setLayout] = useLocalStorage<string>("meeting-layout", "auto");
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null); // Para menú de tres puntos
  const [showParticipants, setShowParticipants] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { theme } = useTheme();

  // Buffer of pending ICE candidates by peerId
  const pendingCandidatesRef = useRef<{
    [peerId: string]: RTCIceCandidateInit[];
  }>({});

  // Ref to save the previous camera state before sharing screen
  const prevVideoStateRef = useRef<boolean>(video);

  // --- NEW: Keep the local video always synchronized ---
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      // If the srcObject is not the same, reassign it
      if (localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
        // Optional: debug
        // console.log('Synchronizing local video with local stream');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setServerUrl(
        window.location.hostname === "localhost"
          ? "http://localhost:4001"
          : window.location.origin
      );
    }
  }, []);

  // Only connect when the user puts their name and clicks connect
  useEffect(() => {
    if (!askForUsername && serverUrl) {
      getPermissions();
    }
    // eslint-disable-next-line
  }, [askForUsername, serverUrl]);

  const updateLocalStream = (stream: MediaStream) => {
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      //console.log("Stream local updated in video element");
    }

    // Update tracks in all connections
    Object.values(connections).forEach((pc) => {
      if (pc.connectionState !== "closed") {
        stream.getTracks().forEach((track) => {
          const sender = pc
            .getSenders()
            .find((s) => s.track && s.track.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
            //console.log(`Track ${track.kind} reemplazado en peer connection`);
          } else {
            pc.addTrack(track, stream);
            //console.log(`Track ${track.kind} agregado a peer connection`);
          }
        });
      }
    });
  };

  // Function to verify video state
  const checkVideoState = () => {
    if (localVideoRef.current && localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      /* console.log("Video state:", {
        videoEnabled: video,
        trackExists: !!videoTrack,
        trackEnabled: videoTrack?.enabled,
        videoElementReady: !!localVideoRef.current.srcObject,
        streamActive: localStreamRef.current.active,
      }); */
    }
  };

  // Function to notify track changes to peers
  const notifyTrackChange = (kind: "video" | "audio", enabled: boolean) => {
    if (socket) {
      socket.emit("track-change", { kind, enabled });
      //console.log(`Notifying ${kind} change: ${enabled}`);
    }
  };

  const updateTrackState = (kind: "video" | "audio", enabled: boolean) => {
    if (!localStreamRef.current) return;

    const track =
      kind === "video"
        ? localStreamRef.current.getVideoTracks()[0]
        : localStreamRef.current.getAudioTracks()[0];

    if (track) {
      //console.log(`${kind} track ${enabled ? "enabled" : "disabled"}`);

      // Only change the enabled state, DO NOT stop the track
      track.enabled = enabled;

      // Notify all peers about the track change
      Object.values(connections).forEach((pc) => {
        if (pc.connectionState !== "closed") {
          const sender = pc
            .getSenders()
            .find((s) => s.track && s.track.kind === kind);
          if (sender && sender.track) {
            // The track already exists, just update its status
            sender.track.enabled = enabled;
            //console.log(`Updated ${kind} track in peer connection`);
          }
        }
      });

      // Notify the change to the server
      notifyTrackChange(kind, enabled);
    } else {
      //console.log(`No ${kind} track found to update`);
    }
  };

  const getPermissions = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      updateLocalStream(stream);
      if (typeof navigator.mediaDevices.getDisplayMedia === "function")
        setScreenAvailable(true);
      connectToSocketServer(stream);
    } catch (e) {
      setVideo(false);
      setAudio(false);
    }
  };

  const connectToSocketServer = (stream: MediaStream) => {
    if (!serverUrl) return;
    const s: SocketType = io(serverUrl);
    setSocket(s);

    s.on("connect", () => {
      //console.log("Connected to Socket.IO server with ID:", s.id);
      setSocketId(s.id);
      s.emit("join-call", { url: window.location.href, name: username });
    });

    s.on("connect_error", (error: Error) => {
      console.error("Error connecting to Socket.IO:", error);
    });
    s.on("signal", (fromId: string, message: string) => {
     /*  console.log(
        "Signal received from:",
        fromId,
        "type:",
        JSON.parse(message).sdp?.type || "ice"
      ); */
      gotMessageFromServer(fromId, message, s);
    });
    s.on(
      "chat-message",
      (data: string, sender: string, socketIdSender: string) => {
        setMessages((prev) => [...prev, { sender, data }]);
        // Only increment if the chat is not open and the message is not from us
        setNewMessages((n) => {
          if (socketIdSender !== s.id && !showChat) return n + 1;
          return n;
        });
      }
    );
    s.on("user-list", (userList: User[]) => {
      setUsers(userList);
    });
    s.on("user-joined", (id: string, clients: string[], userList: User[]) => {
      /* console.log("User joined:", id, "Total clients:", clients.length); */
      setUsers(userList);

      // Only create connections for users that are not ourselves
      const otherClients = clients.filter((clientId) => clientId !== s.id);

      setConnections((prevConnections) => {
        const newConnections: { [id: string]: RTCPeerConnection } = {};

        otherClients.forEach((socketListId) => {
          if (!prevConnections[socketListId]) {
            /* console.log("Creating new connection for:", socketListId); */
            const pc = new RTCPeerConnection(peerConnectionConfig);

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                /* console.log("Sending ICE candidate to:", socketListId); */
                s.emit(
                  "signal",
                  socketListId,
                  JSON.stringify({ ice: event.candidate })
                );
              }
            };

            pc.ontrack = (event) => {
              /* console.log("Track received from:", socketListId); */
              setRemoteStreams((prev) => {
                if (prev.some((r) => r.id === socketListId)) return prev;
                return [
                  ...prev,
                  { id: socketListId, stream: event.streams[0] },
                ];
              });
            };

            pc.onconnectionstatechange = () => {
              /* console.log(
                "Connection state changed for",
                socketListId,
                ":",
                pc.connectionState
              ); */
            };

            pc.onsignalingstatechange = () => {
              /* console.log(
                "Signaling state changed for",
                socketListId,
                ":",
                pc.signalingState
              ); */
            };

            // Add local tracks if available
            if (localStreamRef.current) {
              localStreamRef.current.getTracks().forEach((track) => {
                /* console.log(
                  "Adding track:",
                  track.kind,
                  "a conexión:",
                  socketListId
                ); */
                pc.addTrack(track, localStreamRef.current!);
              });
            }

            newConnections[socketListId] = pc;
          }
        });

        const updatedConnections = { ...prevConnections, ...newConnections };

        // ONLY the new user (id === s.id) creates the offer
        if (id === s.id) {
          Object.entries(newConnections).forEach(([socketListId, pc]) => {
            /* console.log("Starting the offer process for:", socketListId); */
            createOfferForConnection(pc, socketListId, s);
          });
        }

        return updatedConnections;
      });
    });
    s.on("user-left", (id: string, userList: User[]) => {
      setConnections((prev) => {
        const copy = { ...prev };
        if (copy[id]) {
          copy[id].close();
          delete copy[id];
        }
        return copy;
      });
      setRemoteStreams((prev) => prev.filter((r) => r.id !== id));
      setUsers(userList);
    });

    s.on(
      "track-change",
      (fromId: string, data: { kind: string; enabled: boolean }) => {
        /* console.log("Track change received from:", fromId, data); */
        // Here you could update the UI to show the status of other users' tracks
        // For example, show a microphone/video off icon for other users
      }
    );
  };

  const handleOffer = async (
    pc: RTCPeerConnection,
    sdp: any,
    fromId: string,
    s: SocketType
  ) => {
    try {
      if (pc.signalingState !== "stable") {
        // Only accept the offer if we are in stable, if not, ignore it
        //console.warn("Ignoring offer, signalingState:", pc.signalingState);
        return;
      }
      //console.log("Processing offer from:", fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      //console.log("Remote description set for:", fromId);

      const answer = await pc.createAnswer();
      //console.log("Answer created for:", fromId);

      await pc.setLocalDescription(answer);
      //console.log("Local description set for:", fromId);

      s.emit("signal", fromId, JSON.stringify({ sdp: pc.localDescription }));
      //console.log("Answer sent to:", fromId);

      // Apply pending ICE candidates
      const pending = pendingCandidatesRef.current[fromId] || [];
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          //console.log("ICE candidate applied for:", fromId);
        } catch (e) {
           console.error(
            "Error applying ICE candidate for",
            fromId,
            e
          ); 
        }
      }
      pendingCandidatesRef.current[fromId] = [];
    } catch (error) {
      console.error("Error processing offer from", fromId, ":", error);
    }
  };

  const handleAnswer = async (
    pc: RTCPeerConnection,
    sdp: any,
    fromId: string,
    s: SocketType
  ) => {
    try {
      if (pc.signalingState !== "have-local-offer") {
        //console.warn(
        //  "Ignoring answer - incorrect state:",
        //  pc.signalingState,
        //  "for:",
        //  fromId
        //);
        return;
      }
      //console.log("Processing answer from:", fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      //console.log("Answer set for:", fromId);

      // Apply pending ICE candidates
      const pending = pendingCandidatesRef.current[fromId] || [];
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          //console.log("ICE candidate applied for:", fromId);
        } catch (e) {
          console.error(
            "Error applying ICE candidate for",
            fromId,
            e
          );
        }
      }
      pendingCandidatesRef.current[fromId] = [];
    } catch (error) {
      console.error("Error processing answer from", fromId, ":", error);
    }
  };

  const handleIceCandidate = async (
    pc: RTCPeerConnection,
    ice: any,
    fromId: string
  ) => {
    try {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(ice));
        //console.log("ICE candidate added for:", fromId);
      } else {
        // Buffer ICE candidate hasta que se aplique la remoteDescription
        if (!pendingCandidatesRef.current[fromId]) {
          pendingCandidatesRef.current[fromId] = [];
        }
        pendingCandidatesRef.current[fromId].push(ice);
        //console.log("ICE candidate buffered for:", fromId);
      }
    } catch (error) {
      console.error("Error adding ICE candidate for", fromId, ":", error);
    }
  };

  const createOfferForConnection = async (
    pc: RTCPeerConnection,
    socketId: string,
    s: SocketType
  ) => {
    try {
      /* console.log(
        "Creating offer for:",
        socketId,
        "state:",
        pc.signalingState
      ); */

      if (pc.signalingState !== "stable") {
        /* console.log("Waiting for stable state for:", socketId); */
        return;
      }

      // Verificar que tengamos tracks locales
      if (
        !localStreamRef.current ||
        localStreamRef.current.getTracks().length === 0
      ) {
        //console.log("There are no local tracks to create an offer.");
        return;
      }

      const offer = await pc.createOffer();
      /* console.log("Offer created for:", socketId); */

      await pc.setLocalDescription(offer);
      /* console.log("Local description set for:", socketId); */

      s.emit("signal", socketId, JSON.stringify({ sdp: pc.localDescription }));
      /* console.log("Offer sent to:", socketId); */
    } catch (error) {
      console.error("Error creating offer for", socketId, ":", error);
    }
  };

  const cleanupConnection = (fromId: string) => {
    setConnections((prevConnections) => {
      const pc = prevConnections[fromId];
      if (pc) {
        //console.log("Cleaning connection for:", fromId); 
        pc.close();
        delete prevConnections[fromId];
      }
      return prevConnections;
    });
    setRemoteStreams((prev) => prev.filter((r) => r.id !== fromId));
  };

  const resetConnection = (fromId: string, s: SocketType) => {
     //console.log("Resetting connection for:", fromId); 

    // Clear existing connection
    cleanupConnection(fromId);

    // Create new connection after a delay
    setTimeout(() => {
      setConnections((prevConnections) => {
        // Check if connection already exists
        if (prevConnections[fromId]) {
          //console.log("Connection already exists for:", fromId); 
          return prevConnections;
        }

        const newPc = new RTCPeerConnection(peerConnectionConfig);

        newPc.onicecandidate = (event) => {
          if (event.candidate) {
            //console.log("Enviando ICE candidate a:", fromId); 
            s.emit("signal", fromId, JSON.stringify({ ice: event.candidate }));
          }
        };

        newPc.ontrack = (event) => {
          //console.log("Track received from:", fromId); 
          setRemoteStreams((prev) => {
            if (prev.some((r) => r.id === fromId)) return prev;
            return [...prev, { id: fromId, stream: event.streams[0] }];
          });
        };

        newPc.onconnectionstatechange = () => {
          /* console.log(
            "Connection status changed for",
            fromId,
            ":",
            newPc.connectionState
          ); */
        };

        newPc.onsignalingstatechange = () => {
          /* console.log(
            "Signaling state changed to",
            fromId,
            ":",
            newPc.signalingState
          ); */
        };

        if (localStreamRef.current) {
          localStreamRef.current
            .getTracks()
            .forEach((track) => newPc.addTrack(track, localStreamRef.current!));
        }

        const updatedConnections = { ...prevConnections, [fromId]: newPc };

        // Create offer immediately
        createOfferForConnection(newPc, fromId, s);

        return updatedConnections;
      });
    }, 100);
  };

  const gotMessageFromServer = (
    fromId: string,
    message: string,
    s: SocketType
  ) => {
    try {
      const signal = JSON.parse(message);
      if (fromId !== socketId) {
        setConnections((prevConnections) => {
          const pc = prevConnections[fromId];
          if (!pc) {
            //console.log("No connection found for:", fromId); 
            return prevConnections;
          }

          if (pc.connectionState === "closed") {
            //console.log("Connection closed for:", fromId);
            return prevConnections;
          }

          if (signal.sdp) {
            /* console.log(
              "Signal received from:",
              fromId,
              "type:",
              signal.sdp.type,
              "estado actual:",
              pc.signalingState
            ); */

            // Manejar offers
            if (signal.sdp.type === "offer") {
              handleOffer(pc, signal.sdp, fromId, s);
            }
            // Manejar answers
            else if (signal.sdp.type === "answer") {
              handleAnswer(pc, signal.sdp, fromId, s);
            }
          }

          if (signal.ice) {
            handleIceCandidate(pc, signal.ice, fromId);
          }

          return prevConnections;
        });
      }
    } catch (error) {
      console.error("Error processing signal:", error);
    }
  };

  const handleUsername = (e: ChangeEvent<HTMLInputElement>) =>
    setUsername(e.target.value);
  const connect = () => setAskForUsername(false);

  // Turn camera on/off
  const handleVideo = async () => {
    if (!localStreamRef.current) {
      //console.log("No hay stream local disponible");
      return;
    }

    try {
      //console.log("Handling video, current status:", video); 

      if (video) {
        // Turn off camera - stop the track completely
        //console.log("Turning off camera...");
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
          // Stop the track to turn off the camera LED
          videoTrack.stop();
          localStreamRef.current.removeTrack(videoTrack);

          // Create a black canvas to maintain connection
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          const blackStream = canvas.captureStream();
          const blackTrack = blackStream.getVideoTracks()[0];
          blackTrack.enabled = false; // Track silencioso
          localStreamRef.current.addTrack(blackTrack);

          // Update the local video
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }

          // Notify all peers about the change
          Object.values(connections).forEach((pc) => {
            if (pc.connectionState !== "closed") {
              const sender = pc
                .getSenders()
                .find((s) => s.track && s.track.kind === "video");
              if (sender) {
                sender.replaceTrack(blackTrack);
              }
            }
          });
        }
        setVideo(false);
        notifyTrackChange("video", false);
        checkVideoState(); // Verify state after turning off
      } else {
        // Turn on camera
        //console.log("Encendiendo cámara...");

        // Get new video stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        const newVideoTrack = stream.getVideoTracks()[0];

        // Remover track negro si existe
        const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (currentVideoTrack) {
          localStreamRef.current.removeTrack(currentVideoTrack);
        }

        // Agregar el nuevo track de video
        localStreamRef.current.addTrack(newVideoTrack);

        // Actualizar el video local
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }

        // Notificar a todos los peers sobre el cambio
        Object.values(connections).forEach((pc) => {
          if (pc.connectionState !== "closed") {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender) {
              sender.replaceTrack(newVideoTrack);
            } else {
              pc.addTrack(newVideoTrack, localStreamRef.current!);
            }
          }
        });

        setVideo(true);
        notifyTrackChange("video", true);
        checkVideoState(); // Verify state after turning on
      }
    } catch (error) {
      console.error("Error handling video:", error);
    }
  };

  // Turn on/off microphone
  const handleAudio = async () => {
    if (!localStreamRef.current) {
      /* console.log("No hay stream local disponible"); */
      return;
    }

    try {
      /* console.log("Manejando audio, estado actual:", audio); */

      if (audio) {
        // Turn off microphone - stop the track completely
        /* console.log("Apagando micrófono..."); */
        const audioTrack = localStreamRef.current.getAudioTracks()[0];
        if (audioTrack) {
          // Stop the track to turn off the microphone
          audioTrack.stop();
          localStreamRef.current.removeTrack(audioTrack);

          // Crear un track de audio silencioso para mantener la conexión
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const destination = oscillator.connect(
            audioContext.createMediaStreamDestination()
          );
          oscillator.start();
          const silenceStream = (destination as MediaStreamAudioDestinationNode)
            .stream;
          const silenceTrack = silenceStream.getAudioTracks()[0];
          silenceTrack.enabled = false; // Track silencioso
          localStreamRef.current.addTrack(silenceTrack);

          // Notificar a todos los peers sobre el cambio
          Object.values(connections).forEach((pc) => {
            if (pc.connectionState !== "closed") {
              const sender = pc
                .getSenders()
                .find((s) => s.track && s.track.kind === "audio");
              if (sender) {
                sender.replaceTrack(silenceTrack);
              }
            }
          });
        }
        setAudio(false);
        notifyTrackChange("audio", false);
      } else {
        // Turn on microphone
        //console.log("Encendiendo micrófono...");

        // Get new audio stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        const newAudioTrack = stream.getAudioTracks()[0];

        // Remover track silencioso si existe
        const currentAudioTrack = localStreamRef.current.getAudioTracks()[0];
        if (currentAudioTrack) {
          localStreamRef.current.removeTrack(currentAudioTrack);
        }

        // Agregar el nuevo track de audio
        localStreamRef.current.addTrack(newAudioTrack);

        // Notificar a todos los peers sobre el cambio
        Object.values(connections).forEach((pc) => {
          if (pc.connectionState !== "closed") {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "audio");
            if (sender) {
              sender.replaceTrack(newAudioTrack);
            } else {
              pc.addTrack(newAudioTrack, localStreamRef.current!);
            }
          }
        });

        setAudio(true);
        notifyTrackChange("audio", true);
      }
    } catch (error) {
      console.error("Error manejando audio:", error);
    }
  };

  // Share screen
  const handleScreen = async () => {
    if (!screen) {
      try {
        // Save previous video state
        prevVideoStateRef.current = video;
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack && localStreamRef.current) {
          Object.values(connections).forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender) sender.replaceTrack(screenTrack);
          });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = displayStream;
          }
          screenTrack.onended = async () => {
            if (localStreamRef.current) {
              if (prevVideoStateRef.current) {
                // If the camera was active before, we reactivate it
                const camStream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                });
                const camTrack = camStream.getVideoTracks()[0];
                Object.values(connections).forEach((pc) => {
                  const sender = pc
                    .getSenders()
                    .find((s) => s.track && s.track.kind === "video");
                  if (camTrack && sender) sender.replaceTrack(camTrack);
                });
                // Update the local video
                if (localVideoRef.current) {
                  localVideoRef.current.srcObject = localStreamRef.current;
                }
                setScreen(false);
              } else {
                // If the camera was off before, put a black track
                // (like in the camera mute)
                const canvas = document.createElement("canvas");
                canvas.width = 640;
                canvas.height = 480;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.fillStyle = "black";
                  ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                const blackStream = canvas.captureStream();
                const blackTrack = blackStream.getVideoTracks()[0];
                blackTrack.enabled = false;
                Object.values(connections).forEach((pc) => {
                  const sender = pc
                    .getSenders()
                    .find((s) => s.track && s.track.kind === "video");
                  if (blackTrack && sender) sender.replaceTrack(blackTrack);
                });
                if (localVideoRef.current) {
                  localVideoRef.current.srcObject = blackStream;
                }
                setScreen(false);
              }
            }
          };
          setScreen(true);
        }
      } catch (e) {
        setScreen(false);
      }
    } else {
      if (localStreamRef.current) {
        // If screen sharing is manually canceled, restore according to the previous state
        if (prevVideoStateRef.current) {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: true,
          });
          const camTrack = camStream.getVideoTracks()[0];
          Object.values(connections).forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (camTrack && sender) sender.replaceTrack(camTrack);
          });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        } else {
          // If the camera was off before, put a black track
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          const blackStream = canvas.captureStream();
          const blackTrack = blackStream.getVideoTracks()[0];
          blackTrack.enabled = false;
          Object.values(connections).forEach((pc) => {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (blackTrack && sender) sender.replaceTrack(blackTrack);
          });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = blackStream;
          }
        }
        setScreen(false);
      }
    }
  };

  const handleEndCall = () => {
    if (socket) {
      socket.emit("leave-call");
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    Object.values(connections).forEach((pc) => pc.close());
    setConnections({});
    setRemoteStreams([]);
    router.push("/");
  };
  // Open chat and mark messages as read
  const openChat = () => {
    setShowChat(true);
    setNewMessages(0); // Reset counter when opening chat
  };
  const handleMessage = (e: ChangeEvent<HTMLInputElement>) =>
    setMessage(e.target.value);
  const sendMessage = () => {
    if (socket && message.trim()) {
      socket.emit("chat-message", message, username);
      setMessage("");
    }
  };

  const copyUrl = async () => {
    if (typeof window !== "undefined") {
      const text = window.location.href;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback para navegadores inseguros o sin clipboard API
          const textArea = document.createElement("textarea");
          textArea.value = text;
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        alert("No se pudo copiar el enlace.");
      }
    }
  };

  // Reset counter if the user closes and opens the chat
  useEffect(() => {
    if (showChat) setNewMessages(0);
  }, [showChat]);

  if (askForUsername) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="bg-card rounded-lg shadow-lg p-8 w-full max-w-md text-center border">
          <h2 className="text-2xl font-bold mb-4 text-foreground">
              Enter your username
          </h2>
          <Input
            placeholder="Username"
            value={username}
            onChange={handleUsername}
          />
          <Button onClick={connect} className="w-full mt-4">
            Connect
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Header compact */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-black/20 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2">
          <div className="flex items-center gap-2 sm:gap-4">
            <h1 className="text-sm sm:text-lg font-semibold">Meeting</h1>
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-300">
              <Users className="w-3 h-3" />
              <span>{users.length}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowParticipants(!showParticipants)}
              className="text-white hover:bg-white/10 h-8 px-2 sm:px-3"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Participants</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowChat(!showChat)}
              className="text-white hover:bg-white/10 h-8 px-2 sm:px-3 relative"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline ml-2">Chat</span>
              {newMessages > 0 && (
                <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {newMessages > 9 ? "9+" : newMessages}
                </div>
              )}
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 pt-12">
        {/* Main video area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video grid */}
          <div className="flex-1 p-2 sm:p-4">
            <div
              className={`grid gap-2 sm:gap-3 h-full ${
                users.length <= 1
                  ? "grid-cols-1 place-items-center"
                  : users.length <= 2
                  ? "grid-cols-1 sm:grid-cols-2"
                  : users.length <= 4
                  ? "grid-cols-2"
                  : users.length <= 6
                  ? "grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              }`}
            >
              {/* Local video */}
              <div
                className={`relative group ${
                  users.length <= 1 ? "w-full max-w-md sm:max-w-lg" : ""
                }`}
              >
                <div className="relative rounded-lg overflow-hidden bg-slate-800 aspect-video shadow-lg border border-white/10">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                  {/* Status indicators */}
                  <div className="absolute top-2 left-2 flex gap-1">
                    {!video && (
                      <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-1">
                        <VideoOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    {!audio && (
                      <div className="bg-red-500/90 backdrop-blur-sm rounded-full p-1">
                        <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </div>
                    )}
                    {screen && (
                      <div className="bg-blue-500/90 backdrop-blur-sm rounded-full p-1">
                        <Monitor className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                      </div>
                    )}
                  </div>

                  {/* User name */}
                  <div className="absolute bottom-2 left-2">
                    <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                      {username}
                    </div>
                  </div>
                </div>
              </div>

              {/* Remote videos */}
              {users
                .filter((u) => u.id !== socketId)
                .map((u) => {
                  const remote = remoteStreams.find((r) => r.id === u.id);
                  return (
                    <div key={u.id} className="relative group">
                      <div className="relative rounded-lg overflow-hidden bg-slate-800 aspect-video shadow-lg border border-white/10">
                        {remote?.stream ? (
                          <RemoteVideo stream={remote.stream} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <div className="text-center">
                              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-sm sm:text-lg font-bold mb-2 mx-auto">
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                              <p className="text-gray-300 text-xs sm:text-sm">
                                {u.name}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                        <div className="absolute bottom-2 left-2">
                          <div className="bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium">
                            {u.name}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* More compact lower controls */}
          <div className="bg-black/30 backdrop-blur-sm border-t border-white/10 p-3 sm:p-4">
            <div className="flex items-center justify-center gap-2 sm:gap-3 mb-3">
              <Button
                variant={video ? "default" : "destructive"}
                size="sm"
                onClick={handleVideo}
                className="rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0"
              >
                {video ? (
                  <Video className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </Button>

              <Button
                variant={audio ? "default" : "destructive"}
                size="sm"
                onClick={handleAudio}
                className="rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0"
              >
                {audio ? (
                  <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                ) : (
                  <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
                )}
              </Button>

              {screenAvailable && (
                <Button
                  variant={screen ? "default" : "outline"}
                  size="sm"
                  onClick={handleScreen}
                  className="rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0"
                >
                  {screen ? (
                    <Monitor
                      className={`w-4 h-4 sm:w-5 sm:h-5 ${
                        theme === "light" ? "text-black" : "text-white"
                      }`}
                    />
                  ) : (
                    <MonitorOff
                      className={`w-4 h-4 sm:w-5 sm:h-5 ${
                        theme === "light" ? "text-black" : "text-white"
                      }`}
                    />
                  )}
                </Button>
              )}

              <Button
                variant="destructive"
                size="sm"
                onClick={handleEndCall}
                className="rounded-full w-10 h-10 sm:w-12 sm:h-12 p-0 bg-red-600 hover:bg-red-700"
              >
                <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>

            {/* More compact URL */}
            <div className="flex items-center gap-2 max-w-sm mx-auto">
              <Input
                value={
                  typeof window !== "undefined" ? window.location.href : ""
                }
                readOnly
                className="bg-white/10 border-white/20 text-white placeholder-gray-400 text-xs h-8"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={copyUrl}
                className="border-white/20 text-white hover:bg-white/10 h-8 px-2"
              >
                <Copy
                  className={`w-3 h-3 ${
                    theme === "light" ? "text-black" : "text-white"
                  }`}
                />
                {copied && <span className="ml-1 text-xs">✔️​</span>}
              </Button>
            </div>
          </div>
        </div>

        {/* Participants Sidebar */}
        {showParticipants && (
          <div className="w-64 sm:w-72 bg-black/40 backdrop-blur-sm border-l border-white/10 flex flex-col">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <Users className="w-4 h-4" />
                Participants ({users.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowParticipants(false)}
                className="text-white hover:bg-white/10 h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{u.name}</p>
                    <p className="text-xs text-gray-400">
                      {u.id === socketId ? "You" : "Participant"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {u.id === socketId ? (
                      <>
                        {video ? (
                          <Video className="w-3 h-3 text-green-400" />
                        ) : (
                          <VideoOff className="w-3 h-3 text-red-400" />
                        )}
                        {audio ? (
                          <Mic className="w-3 h-3 text-green-400" />
                        ) : (
                          <MicOff className="w-3 h-3 text-red-400" />
                        )}
                      </>
                    ) : (
                      <>
                        <Video className="w-3 h-3 text-green-400" />
                        <Mic className="w-3 h-3 text-green-400" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sidebar chat */}
        {showChat && (
          <div className="w-64 sm:w-80 bg-black/40 backdrop-blur-sm border-l border-white/10 flex flex-col">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Chat
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowChat(false)}
                className="text-white hover:bg-white/10 h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.length > 0 ? (
                messages.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <div className="text-xs text-gray-400">{item.sender}</div>
                    <div className="bg-slate-700/50 rounded-lg p-2 text-sm">
                      {item.data}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-400 py-8">
                  <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No messages</p>
                  <p className="text-xs">Write something to start</p>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-white/10">
              <div className="flex gap-2">
                <Input
                  placeholder="Write your message..."
                  value={message}
                  onChange={handleMessage}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendMessage();
                  }}
                  className="bg-slate-800/50 border-slate-600 text-white placeholder-gray-400 text-sm h-8"
                />
                <Button
                  onClick={sendMessage}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 h-8 px-3"
                >
                  <span className="hidden sm:inline">Send</span>
                  <span className="sm:hidden">→</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      className="rounded-lg border aspect-video bg-black w-full"
    />
  );
}
