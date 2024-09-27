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

// Define a Message schema for one-to-one chat
const messageSchema = new mongoose.Schema({
  sender: { type: String, required: true },
  recipient: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  registeredAt: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);
const User = mongoose.model('User', userSchema);

// Map to store connected users and their WebSocket connections
const users = new Map();

// WebSocket connection event
wss.on('connection', (ws) => {
  console.log('New client connected');

  // When the client sends a message, handle the registration or chat message
  ws.on('message', async (data) => {
    const messageData = JSON.parse(data);

    // Handle user registration
    if (messageData.type === 'register') {
      const { username } = messageData;
      
      try {
        // Check if the user already exists in the database
        let user = await User.findOne({ username });
        
        if (!user) {
          // If the user does not exist, create a new user
          user = new User({ username });
          await user.save();
          console.log(`User ${username} registered and saved to the database`);
        } else {
          console.log(`User ${username} already exists in the database`);
        }

        // Register the user with their WebSocket
        users.set(username, ws); // Associate the WebSocket with the username
        console.log(`${username} connected`);

      } catch (err) {
        console.error(`Error registering user ${username}:`, err);
        ws.send(JSON.stringify({ type: 'error', message: 'Error registering user' }));
      }

      return; // Exit the function after registration
    }

    // Handle sending a message from one user to another
    if (messageData.sender && messageData.recipient && messageData.message) {
      try {
        // Save the message to MongoDB
        const newMessage = new Message({
          sender: messageData.sender,
          recipient: messageData.recipient,
          message: messageData.message
        });
        await newMessage.save();
        console.log('Message saved:', newMessage);

        // Send the message to the recipient if they are online
        const recipientWs = users.get(messageData.recipient);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify(newMessage)); // Send message to the recipient
        } else {
          console.log(`Recipient ${messageData.recipient} is offline`);
          ws.send(JSON.stringify({ type: 'info', message: `Recipient ${messageData.recipient} is offline` }));
        }
      } catch (err) {
        console.error('Error saving or sending message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Error processing message' }));
      }
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    // Remove the user from the users map when they disconnect
    for (const [username, connection] of users.entries()) {
      if (connection === ws) {
        users.delete(username);
        console.log(`${username} disconnected`);
        break;
      }
    }
  });
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});