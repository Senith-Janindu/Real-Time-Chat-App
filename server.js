const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');

// Express setup
const app = express();
const server = http.createServer(app);

// WebSocket setup
const wss = new WebSocket.Server({ server });

// MongoDB connection
const mongoURI = "mongodb://mongo:27017/chatdb";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('Error connecting to MongoDB:', err));

// Define a Message schema
const messageSchema = new mongoose.Schema({
  username: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Serve static files (for frontend)
app.use(express.static('public'));

// WebSocket connection event
wss.on('connection', async (ws) => {
  console.log('New client connected');

  try {
    // Fetch and send the chat history to the newly connected client
    const messages = await Message.find().sort({ timestamp: 1 }).limit(100);
    ws.send(JSON.stringify({ type: 'history', data: messages }));
  } catch (err) {
    console.error('Error fetching messages:', err);
  }

  // Handle incoming messages from the client
  ws.on('message', async (data) => {
    const messageData = JSON.parse(data);

    // Check if the message is a typing indicator
    if (messageData.type === 'typing') {
      // Broadcast typing indicator to all clients except the one who is typing
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'typing', username: messageData.username }));
        }
      });
    } else {
      // Validate incoming message
      if (!messageData.username || !messageData.message) {
        console.error('Invalid message data');
        return;
      }

      // Save the actual message to MongoDB
      try {
        const newMessage = new Message({
          username: messageData.username,
          message: messageData.message
        });
        await newMessage.save();
        console.log('Message saved:', newMessage);
      } catch (err) {
        console.error('Error saving message:', err);
        return;
      }

      // Broadcast the message to all connected clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            username: messageData.username,
            message: messageData.message,
            timestamp: new Date()  // Broadcast with the timestamp
          }));
        }
      });
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
