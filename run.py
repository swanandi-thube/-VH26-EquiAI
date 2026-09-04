"""
ADAPTIVECACHE Platform Launcher
Starts the backend server and opens the real-time Observability Dashboard in the browser.
"""

import sys
import subprocess
import webbrowser
import threading
import time
import os

def open_browser():
    time.sleep(1.8)
    url = "http://localhost:8000/"
    print(f"\nOpening ADAPTIVECACHE Observability Console at: {url}\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")

def main():
    port = 8000
    print("=" * 70)
    print("  ADAPTIVECACHE: Application-Aware Intelligent Caching Platform")
    print("=" * 70)
    print(f"  ✓ Dashboard & API:   http://localhost:{port}/")
    print(f"  ✓ Live Stream:       ws://localhost:{port}/ws")
    print(f"  ✓ Prometheus:        http://localhost:{port}/metrics")
    print("=" * 70)

    # Launch browser thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Start Backend server via npm start --prefix backend
    backend_dir = os.path.join(os.path.dirname(__file__), "backend")
    
    # Run dev server
    subprocess.run(["npx", "ts-node", "src/server.ts"], cwd=backend_dir, shell=True)

if __name__ == "__main__":
    main()
