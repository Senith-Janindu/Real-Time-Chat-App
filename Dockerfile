# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy the current directory to the working directory inside the container
COPY . .

# Expose the port that the app runs on
EXPOSE 3000

# Command to start the Node.js app
CMD ["node", "server.js"]
