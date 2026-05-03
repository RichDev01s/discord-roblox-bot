# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Discord Bot (`artifacts/discord-bot`)

Bot de Discord para buscar servidores de Roblox con 0 o 1 jugadores.

### Comandos

| Comando | Juego |
|---|---|
| `gen sab` | Steal a Brainrot |
| `gen blox` | Blox Fruits |
| `gen sailor` | Sailor Piece |
| `gen tsunami` | Escapa del Tsunami por BRAINROTS |
| `gen kick` | Kick a Lucky Block |
| `gen info` | Muestra info de todos los comandos |

### IDs de juegos (Roblox)

Configurados en `artifacts/discord-bot/src/config.ts`:

- Steal a Brainrot: `17326402341`
- Blox Fruits: `2753915549`
- Sailor Piece: `6284583030`
- Escapa del Tsunami por BRAINROTS: `17311756083`
- Kick a Lucky Block: `1819717140`

### Secrets requeridos

- `DISCORD_TOKEN` — Token del bot de Discord
