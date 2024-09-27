#!/usr/bin/make

SHELL = /bin/sh

UID := $(shell id -u)
GID := $(shell id -g)

export UID
export GID

up:
	UID=${UID} GID=${GID} docker compose up --build --remove-orphans

down:
	docker compose down --remove-orphans

shell:
	UID=${UID} GID=${GID} docker exec -u ${UID}:${GID} -it chat-node-app bash
