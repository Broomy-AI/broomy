#!/bin/bash
# Fake Claude simulator for screenshot generation - "idle" session
# Outputs briefly (~5s) then goes idle, creating the "unread" state

ORANGE='\033[38;2;215;119;87m'
GREEN='\033[38;2;78;186;101m'
GRAY='\033[38;2;153;153;153m'
WHITE='\033[38;2;255;255;255m'
BOLD='\033[1m'
RESET='\033[0m'

echo "FAKE_CLAUDE_READY"
sleep 0.3

# Brief Claude output
echo ""
echo -e "${ORANGE}╭─── Claude Code ${GRAY}v2.1.29${ORANGE} ───────────────────────────────────╮"
echo -e "│${RESET}                  ${BOLD}Welcome back!${RESET}                    ${ORANGE}│"
echo -e "│${RESET}                      ${ORANGE} ▐${RESET}▛███▜${ORANGE}▌${RESET}                      ${ORANGE}│"
echo -e "│${RESET}                      ${ORANGE}▝▜${RESET}█████${ORANGE}▛▘${RESET}                     ${ORANGE}│"
echo -e "│${RESET}                      ${ORANGE}  ▘▘ ▝▝  ${RESET}                     ${ORANGE}│"
echo -e "${ORANGE}╰──────────────────────────────────────────────────────╯${RESET}"
echo ""

sleep 1

echo -e "${GREEN}⏺${RESET} Read ${BOLD}3${RESET} files ${GRAY}(ctrl+o to expand)${RESET}"
echo ""
sleep 0.5
echo -e "${WHITE}⏺${RESET} Done! All changes applied successfully."
echo ""
sleep 0.5
echo -e "${GREEN}✓${RESET} Task completed."
echo ""

echo "FAKE_CLAUDE_IDLE"

# Keep running but idle
sleep 999999
