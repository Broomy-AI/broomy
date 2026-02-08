#!/bin/bash
# Fake Claude simulator for screenshot generation - "working" session
# Outputs rich Claude Code terminal output with ANSI colors for ~15s
# This keeps the session in "working" state past the 5s warmup threshold

# ANSI color codes matching real Claude Code output
ORANGE='\033[38;2;215;119;87m'
GREEN='\033[38;2;78;186;101m'
GRAY='\033[38;2;153;153;153m'
WHITE='\033[38;2;255;255;255m'
BLUE='\033[38;2;177;185;249m'
RED_BG='\033[38;2;220;90;90;48;2;61;1;0m'
GREEN_BG='\033[38;2;80;200;80;48;2;2;40;0m'
DIM='\033[2m'
BOLD='\033[1m'
UNDERLINE='\033[4m'
RESET='\033[0m'
PROMPT_BG='\033[38;2;80;80;80;48;2;55;55;55m'
DIM_LINE='\033[38;2;80;80;80;2m'

echo "FAKE_CLAUDE_READY"
sleep 0.3

# Claude welcome banner
echo ""
echo -e "${ORANGE}╭─── Claude Code ${GRAY}v2.1.29${ORANGE} ─────────────────────────────────────────────────────────────────────╮"
echo -e "│${RESET}                                                    ${ORANGE}${DIM}│${RESET} ${ORANGE}${BOLD}Tips for getting started${RESET}                    ${ORANGE}│"
echo -e "│${RESET}                  ${BOLD}Welcome back!${RESET}                    ${ORANGE}${DIM}│${RESET} Run /init to create a CLAUDE.md file           ${ORANGE}│"
echo -e "│${RESET}                                                    ${ORANGE}${DIM}│${RESET} ${ORANGE}${DIM}─────────────────────────────────────────${RESET}      ${ORANGE}│"
echo -e "│${RESET}                                                    ${ORANGE}${DIM}│${RESET} ${ORANGE}${BOLD}Recent activity${RESET}                                ${ORANGE}│"
echo -e "│${RESET}                      ${ORANGE} ▐${RESET}▛███▜${ORANGE}▌${RESET}                      ${ORANGE}${DIM}│${RESET} ${GRAY}Updated auth middleware${RESET}                     ${ORANGE}│"
echo -e "│${RESET}                      ${ORANGE}▝▜${RESET}█████${ORANGE}▛▘${RESET}                     ${ORANGE}${DIM}│${RESET} ${GRAY}Fixed JWT token refresh${RESET}                     ${ORANGE}│"
echo -e "│${RESET}                      ${ORANGE}  ▘▘ ▝▝  ${RESET}                     ${ORANGE}${DIM}│${RESET}                                                ${ORANGE}│"
echo -e "│${RESET}   ${GRAY}Opus 4.5 · Claude Max${RESET}                              ${ORANGE}${DIM}│${RESET}                                                ${ORANGE}│"
echo -e "│${RESET}             ${GRAY}~/backend-api${RESET}                            ${ORANGE}${DIM}│${RESET}                                                ${ORANGE}│"
echo -e "${ORANGE}╰─────────────────────────────────────────────────────────────────────────────────────────────╯${RESET}"
echo ""

sleep 1

# User prompt
echo -e "${PROMPT_BG}❯ ${WHITE}Add JWT authentication with session management and refresh token rotation${RESET}"
echo ""

sleep 0.5

# Thinking
echo -e "${WHITE}⏺${RESET} I'll implement JWT authentication with session management. Let me start by reading the existing"
echo -e "  auth setup and then add the necessary middleware and token handling."
echo ""

sleep 1

# Read files
echo -e "${GREEN}⏺${RESET} Read ${BOLD}4${RESET} files ${GRAY}(ctrl+o to expand)${RESET}"
echo ""

sleep 1.5

# Tool call - Update file
echo -e "${GRAY}⏺${RESET} ${BOLD}Update${RESET}(${UNDERLINE}src/middleware/auth.ts${RESET})"
echo ""

sleep 0.5

# Show diff block
echo -e "${BLUE}───────────────────────────────────────────────────────────────────────────────────────────────"
echo -e "${RESET} ${BLUE}${BOLD}Edit file${RESET}"
echo -e " ${GRAY}src/middleware/auth.ts${RESET}"
echo -e "${DIM_LINE}╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌"
echo -e "${DIM}  1 ${RESET} import { Request, Response, NextFunction } from 'express'"
echo -e "${DIM}  2 ${RESET} import jwt from 'jsonwebtoken'"
echo -e "${RED_BG}  3 -${RESET} // TODO: Add proper token validation"
echo -e "${GREEN_BG}  3 +${RESET} import { TokenService } from '../services/token'"
echo -e "${GREEN_BG}  4 +${RESET} import { SessionStore } from '../services/session'"
echo -e "${GREEN_BG}  5 +${RESET}"
echo -e "${GREEN_BG}  6 +${RESET} const tokenService = new TokenService({"
echo -e "${GREEN_BG}  7 +${RESET}   accessTokenTTL: '15m',"
echo -e "${GREEN_BG}  8 +${RESET}   refreshTokenTTL: '7d',"
echo -e "${GREEN_BG}  9 +${RESET}   rotateRefreshTokens: true,"
echo -e "${GREEN_BG} 10 +${RESET} })"
echo -e "${DIM} 11 ${RESET}"
echo -e "${RED_BG} 12 -${RESET} export function authenticate(req: Request, res: Response, next: NextFunction) {"
echo -e "${RED_BG} 13 -${RESET}   const token = req.headers.authorization?.split(' ')[1]"
echo -e "${RED_BG} 14 -${RESET}   if (!token) return res.status(401).json({ error: 'No token' })"
echo -e "${GREEN_BG} 12 +${RESET} export async function authenticate(req: Request, res: Response, next: NextFunction) {"
echo -e "${GREEN_BG} 13 +${RESET}   try {"
echo -e "${GREEN_BG} 14 +${RESET}     const accessToken = req.headers.authorization?.split(' ')[1]"
echo -e "${GREEN_BG} 15 +${RESET}     if (!accessToken) return res.status(401).json({ error: 'Missing token' })"
echo -e "${GREEN_BG} 16 +${RESET}"
echo -e "${GREEN_BG} 17 +${RESET}     const payload = await tokenService.verifyAccessToken(accessToken)"
echo -e "${GREEN_BG} 18 +${RESET}     const session = await SessionStore.get(payload.sessionId)"
echo -e "${GREEN_BG} 19 +${RESET}     if (!session || session.revoked) {"
echo -e "${GREEN_BG} 20 +${RESET}       return res.status(401).json({ error: 'Session revoked' })"
echo -e "${GREEN_BG} 21 +${RESET}     }"
echo -e "${DIM_LINE}╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌"
echo -e "${RESET}"

sleep 2

# More tool calls to keep working status
echo -e "${GRAY}⏺${RESET} ${BOLD}Write${RESET}(${UNDERLINE}src/services/token.ts${RESET})"
echo ""

sleep 2

echo -e "${GRAY}⏺${RESET} ${BOLD}Write${RESET}(${UNDERLINE}src/services/session.ts${RESET})"
echo ""

sleep 2

echo -e "${WHITE}⏺${RESET} Now let me add the refresh token endpoint and update the routes."
echo ""

sleep 2

echo -e "${GRAY}⏺${RESET} ${BOLD}Update${RESET}(${UNDERLINE}src/routes/auth.ts${RESET})"
echo ""

sleep 2

echo -e "${GREEN}⏺${RESET} Read ${BOLD}2${RESET} files ${GRAY}(ctrl+o to expand)${RESET}"
echo ""

sleep 2

echo -e "${GRAY}⏺${RESET} ${BOLD}Update${RESET}(${UNDERLINE}src/routes/auth.ts${RESET})"
echo ""

# Keep outputting periodically to stay "working"
while true; do
  sleep 3
  echo -e "${WHITE}⏺${RESET} Verifying token rotation logic and session cleanup..."
  sleep 3
  echo -e "${GRAY}⏺${RESET} ${BOLD}Update${RESET}(${UNDERLINE}tests/auth.test.ts${RESET})"
  sleep 3
  echo -e "${GREEN}⏺${RESET} Read ${BOLD}1${RESET} file ${GRAY}(ctrl+o to expand)${RESET}"
done
