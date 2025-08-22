const express = require("express");
const http = require("http");
const cors = require("cors");
const xss = require("xss");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

app.set("port", process.env.PORT || 4001);

let connections = {};
let messages = {};
let timeOnline = {};
let userNames = {};

io.on("connection", (socket) => {
  socket.on("join-call", (data) => {
    const path = typeof data === "string" ? data : data.url;
    const name = typeof data === "string" ? "Anon" : xss(data.name || "Anon");
    if (!connections[path]) connections[path] = [];
    connections[path].push(socket.id);
    timeOnline[socket.id] = new Date();
    userNames[socket.id] = name;
    for (const id of connections[path]) {
      io.to(id).emit(
        "user-joined",
        socket.id,
        connections[path],
        connections[path].map((id2) => ({ id: id2, name: userNames[id2] }))
      );
    }
    io.to(socket.id).emit(
      "user-list",
      connections[path].map((id2) => ({ id: id2, name: userNames[id2] }))
    );
    if (messages[path]) {
      for (const msg of messages[path]) {
        io.to(socket.id).emit(
          "chat-message",
          msg.data,
          msg.sender,
          msg["socket-id-sender"]
        );
      }
    }
  });
  socket.on("signal", (toId, message) => {
    io.to(toId).emit("signal", socket.id, message);
  });
  socket.on("chat-message", (data, sender) => {
    data = xss(data);
    sender = xss(sender);
    let key;
    let ok = false;
    for (const [k, v] of Object.entries(connections)) {
      if (v.includes(socket.id)) {
        key = k;
        ok = true;
        break;
      }
    }
    if (ok && key) {
      if (!messages[key]) messages[key] = [];
      messages[key].push({ sender, data, "socket-id-sender": socket.id });
      for (const id of connections[key]) {
        io.to(id).emit("chat-message", data, sender, socket.id);
      }
    }
  });

  socket.on("track-change", (data) => {
    let key;
    for (const [k, v] of Object.entries(connections)) {
      if (v.includes(socket.id)) {
        key = k;
        break;
      }
    }
    if (key) {
      // Notificar a todos los usuarios en la misma sala sobre el cambio de track
      for (const id of connections[key]) {
        if (id !== socket.id) {
          io.to(id).emit("track-change", socket.id, data);
        }
      }
    }
  });
  socket.on("leave-call", () => {
    let key;
    for (const [k, v] of Object.entries(connections)) {
      if (v.includes(socket.id)) {
        key = k;
        for (const id of connections[key]) {
          io.to(id).emit(
            "user-left",
            socket.id,
            connections[key]
              .filter((id2) => id2 !== socket.id)
              .map((id2) => ({ id: id2, name: userNames[id2] }))
          );
        }
        connections[key] = v.filter((id) => id !== socket.id);
        if (connections[key].length === 0) delete connections[key];
        break;
      }
    }
    delete userNames[socket.id];
    delete timeOnline[socket.id];
  });
  socket.on("disconnect", () => {
    let key;
    for (const [k, v] of Object.entries(connections)) {
      if (v.includes(socket.id)) {
        key = k;
        for (const id of connections[key]) {
          io.to(id).emit(
            "user-left",
            socket.id,
            connections[key]
              .filter((id2) => id2 !== socket.id)
              .map((id2) => ({ id: id2, name: userNames[id2] }))
          );
        }
        connections[key] = v.filter((id) => id !== socket.id);
        if (connections[key].length === 0) delete connections[key];
        break;
      }
    }
    delete userNames[socket.id];
    delete timeOnline[socket.id];
  });
});

server.listen(app.get("port"), () => {
  console.log("listening on", app.get("port"));
});
