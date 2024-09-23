const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config(); // Load environment variables from .env

// Express setup
const app = express();
const server = http.createServer(app);

// CORS configuration using environment variable
const corsOptions = {
    origin: process.env.CORS_ORIGIN || 'http://localhost:8000', // Allow your Laravel app
    credentials: true, // Allow credentials (like cookies, authorization headers, etc.)
    optionsSuccessStatus: 200 // For older browsers
};

// Use CORS middleware
app.use(cors(corsOptions));

// Middleware to parse JSON requests
app.use(express.json());

// WebSocket setup
const wss = new WebSocket.Server({ server });

// MongoDB connection using environment variable
const mongoURI = process.env.MONGO_URI || "mongodb://mongo:27017/chatdb";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('Error connecting to MongoDB:', err));

// Define a Message schema for one-to-one chat
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  edited: { type: Boolean, default: false } // Add this line
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  registeredAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
const User = mongoose.model('User', userSchema);

// Map to store connected users and their WebSocket connections
const users = new Map();

wss.on('connection', (ws) => {

  console.log('MongoDB URI:', process.env.MONGO_URI);
  console.log('CORS Origin:', process.env.CORS_ORIGIN);
  console.log('Server Port:', process.env.PORT);
  console.log('New client connected');

  ws.on('message', async (data) => {
    const messageData = JSON.parse(data);

    // Handle user registration
    if (messageData.type === 'register') {
      const { username } = messageData;

      try {
        let user = await User.findOne({ username });
        if (!user) {
          user = new User({ username });
          await user.save();
        }
        users.set(username, ws);
        console.log(`${username} connected`);
      } catch (err) {
        console.error(`Error registering user ${username}:`, err);
        ws.send(JSON.stringify({ type: 'error', message: 'Error registering user' }));
      }

      return;
    }

    // Handle typing status
    
    if (messageData.type === 'typing' || messageData.type === 'stopTyping') {
      const recipientWs = users.get(messageData.recipient);
      if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
        recipientWs.send(JSON.stringify({
          type: messageData.type,
          sender: messageData.sender,
          recipient: messageData.recipient
        }));
      }
      return;
    }

    // Handle chat messages
    if (messageData.sender && messageData.recipient && messageData.message) {
      try {
        // Create and save the new message
        const newMessage = await new Message({
          sender: messageData.sender,
          recipient: messageData.recipient,
          message: messageData.message
        }).save();

        // Log the message ID to confirm that it exists
        console.log('New message saved with ID:', newMessage._id);

        // Send the message to the recipient's WebSocket client
        const recipientWs = users.get(messageData.recipient);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify(newMessage)); // Send the full message object with _id
        } else {
          ws.send(JSON.stringify({ type: 'info', message: `Recipient ${messageData.recipient} is offline` }));
        }

        // Send the message back to the sender's WebSocket client as well
        const senderWs = users.get(messageData.sender);
        if (senderWs && senderWs.readyState === WebSocket.OPEN) {
          senderWs.send(JSON.stringify(newMessage)); // Send the full message object with _id
        }
      } catch (err) {
        console.error('Error saving or sending message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Error processing message' }));
      }
    }

    // Handle edit messages
    if (messageData.type === 'edit' && messageData.messageId) {
      try {
        const editedMessage = await Message.findByIdAndUpdate(
          messageData.messageId,
          { message: messageData.newMessage, edited: true },
          { new: true } // This ensures the updated document is returned
        );

        if (editedMessage) {
          console.log('Edited message:', editedMessage); // Debug to ensure _id is present

          const recipientWs = users.get(messageData.recipient);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify({ type: 'edit', message: editedMessage }));
          }

          const senderWs = users.get(messageData.sender);
          if (senderWs && senderWs.readyState === WebSocket.OPEN) {
            senderWs.send(JSON.stringify({ type: 'edit', message: editedMessage }));
          }
        }
      } catch (err) {
        console.error('Error editing message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Error editing message' }));
      }
      return;
    }

  });

  ws.on('close', () => {
    for (const [username, connection] of users.entries()) {
      if (connection === ws) {
        users.delete(username);
        console.log(`${username} disconnected`);
        break;
      }
    }
  });
});

// API endpoint to fetch conversations (example)
app.get('/api/conversations/:username', async (req, res) => {
  const username = req.params.username;

  try {
    const conversations = await Message.find({
      $or: [
        { sender: username },
        { recipient: username }
      ]
    }).sort({ timestamp: -1 }).limit(50); // Limit to the last 50 messages

    res.json(conversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start the server Use environment variable for the port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
