#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# AEROKIN Remote Secrets Generator (Linux / macOS)
# Generates high-entropy cryptographic tokens for Coturn and Signaling
# ==============================================================================

echo "--- AEROKIN Cryptographic Secrets Generator ---"
echo ""

TURN_SECRET=$(openssl rand -hex 32)
AGENT_SECRET=$(openssl rand -hex 32)

echo "Generated Secrets (store securely in .env):"
echo "--------------------------------------------------------"
echo "TURN_SECRET=${TURN_SECRET}"
echo "AGENT_SECRET=${AGENT_SECRET}"
echo "--------------------------------------------------------"
echo ""
echo "To automatically write to signaling/.env:"
echo "  echo \"TURN_SECRET=${TURN_SECRET}\" >> signaling/.env"
