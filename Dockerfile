# Use an official lightweight Node.js image
FROM node:22-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the application files
COPY . .

# Install production dependencies
RUN npm ci --production

# Expose the port Fastify will listen on
EXPOSE 5000

# Start the Fastify app using app.js
CMD ["node", "src/app.js"]
