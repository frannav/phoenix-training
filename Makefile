SHELL := /bin/sh

BUN ?= bun

.DEFAULT_GOAL := help
.NOTPARALLEL: setup db-setup check

.PHONY: help install setup dev dev-front dev-back start \
	db-generate db-migrate db-seed db-load db-setup \
	typecheck test build check

help: ## Muestra los comandos disponibles
	@awk 'BEGIN {FS = ":.*##"; printf "Uso: make <objetivo>\n\nObjetivos:\n"} /^[a-zA-Z0-9_-]+:.*##/ {printf "  %-18s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Instala las dependencias del monorepo
	$(BUN) install --frozen-lockfile

setup: install db-migrate db-seed db-load ## Prepara una instalación local desde cero

dev: ## Arranca frontend y backend en modo desarrollo
	$(BUN) run dev

dev-front: ## Arranca únicamente el frontend
	$(BUN) run dev:front

dev-back: ## Arranca únicamente el backend
	$(BUN) run dev:back

start: ## Arranca el backend en modo producción
	$(BUN) run start

db-generate: ## Genera una migración de Drizzle
	$(BUN) run db:generate

db-migrate: ## Aplica las migraciones pendientes
	$(BUN) run db:migrate

db-seed: ## Crea la cuenta local de prueba
	$(BUN) run db:seed

db-load: ## Carga el catálogo de ejercicios
	$(BUN) run db:load

db-setup: db-migrate db-seed db-load ## Migra, siembra y carga la base de datos

typecheck: ## Comprueba los tipos de frontend y backend
	$(BUN) run typecheck

test: ## Ejecuta todos los tests
	$(BUN) run test

build: ## Construye el frontend para producción
	$(BUN) run build

check: typecheck test build ## Ejecuta todas las comprobaciones antes de entregar
