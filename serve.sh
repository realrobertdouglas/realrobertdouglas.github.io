#!/bin/bash

# Script to start or restart Jekyll server and open in browser
# Created: May 6, 2025

SITE_DIR="/Users/robertdouglas/_SYNC/github/personal-site/realrobertdouglas.github.io/live-site"
LOG_FILE="$SITE_DIR/jekyll-serve.log"
SITE_URL="http://localhost:4000"

# Function to check if Jekyll is running
is_jekyll_running() {
  pgrep -f "jekyll serve" > /dev/null
  return $?
}

# Function to open browser
open_browser() {
  echo "Opening site in browser..."
  sleep 3 # Give Jekyll a moment to start up
  open "$SITE_URL"
}

# Function to start Jekyll
start_jekyll() {
  echo "Starting Jekyll server..."
  cd "$SITE_DIR" || exit 1
  bundle exec jekyll serve > "$LOG_FILE" 2>&1 &
  echo "Jekyll server started. Logs at: $LOG_FILE"
  echo "Site available at: $SITE_URL"
  open_browser
}

# Function to stop Jekyll
stop_jekyll() {
  echo "Stopping Jekyll server..."
  pkill -f "jekyll serve"
  sleep 2
  if is_jekyll_running; then
    echo "Failed to stop Jekyll server gracefully. Forcing termination..."
    pkill -9 -f "jekyll serve"
  fi
  echo "Jekyll server stopped."
}

# Main script logic
echo "=== Jekyll Server Manager ==="
echo "Site directory: $SITE_DIR"

if is_jekyll_running; then
  echo "Jekyll server is already running."
  echo "Restarting Jekyll server..."
  stop_jekyll
  start_jekyll
  echo "Jekyll server restarted successfully."
else
  start_jekyll
  echo "Jekyll server started successfully."
fi

# If script is double-clicked, keep terminal window open
if [[ "$0" == "$BASH_SOURCE" ]]; then
  echo "Press Enter to close this window..."
  read -r
fi

echo "=== Done ==="
