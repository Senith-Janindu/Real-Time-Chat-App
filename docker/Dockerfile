FROM node:18
ARG UID GID
RUN usermod -u $UID node && \
    groupmod -g $GID node && \
    echo "node ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
WORKDIR /app
EXPOSE 3000
USER node
