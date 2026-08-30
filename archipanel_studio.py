from __future__ import annotations

import argparse
import os
import threading
import webbrowser

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ArchiPanel Studio locally")
    parser.add_argument("--host", default=os.environ.get("ARCHIPANEL_HOST", "127.0.0.1"))
    parser.add_argument("--port", default=int(os.environ.get("PORT", os.environ.get("ARCHIPANEL_PORT", "8766"))), type=int)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not args.no_browser:
        threading.Timer(1.2, lambda: webbrowser.open(f"http://{args.host}:{args.port}/")).start()
    uvicorn.run("studio_server.app:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
