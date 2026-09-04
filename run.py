"""
EquiAI Application Launcher
Starts the Python FastAPI backend server on http://localhost:8000/ and opens the Observability Console in the default browser.
"""

import sys
import webbrowser
import threading
import time
import uvicorn


def open_browser():
    time.sleep(1.2)
    url = "http://localhost:8000/"
    print(f"\nOpening EquiAI Observability Console at: {url}\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"Could not open browser automatically: {e}")


def main():
    port = 8000
    host = "0.0.0.0"

    print("=" * 70)
    print("EquiAI - Adaptive, Application-Aware Cache Management System")
    print("=" * 70)
    print(f"Backend FastAPI Server starting at: http://localhost:{port}/")
    print(f"WebSocket Live Stream: ws://localhost:{port}/ws")
    print(f"Observability Dashboard: http://localhost:{port}/")
    print("=" * 70)

    # Launch browser thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Run Uvicorn server
    uvicorn.run("backend.app:app", host=host, port=port, reload=False, log_level="info")


if __name__ == "__main__":
    main()
