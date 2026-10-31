# Backend

FastAPI connects level JSON, SQLite storage, recognition adapters and the playability checker. It runs locally without a trained CNN. Python 3.12 is the tested version.

## Setup and start

Run from the repository root in an activated virtual environment:

```bash
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

The interactive API guide is at `/docs` on that server. It includes the level schema and upload fields. CORS allows `http://localhost:5173` and `http://127.0.0.1:5173`, the local game addresses. Other origins are not allowed by the browser CORS policy. This is a local development API with no authentication; do not expose it publicly as a production service.

The default database is `backend/data/levels.sqlite3`. Set `DREAMCRAFT_DB` to choose another file. The parent directory and table are created when the app starts. Tests always use separate temporary files. SQLite operations use parameters and transactions; each operation closes its connection.

## Endpoints

| Method and path | What it does |
| --- | --- |
| `GET /api/health` | Returns `{"status":"ok"}`. |
| `POST /api/levels` | Validates and saves level JSON; returns 201 with its ID, level and timestamps. |
| `GET /api/levels` | Lists up to 100 records; use `?offset=100` for the next page. |
| `GET /api/levels/{id}` | Returns the saved record or 404. |
| `PUT /api/levels/{id}` | Validates and replaces the level; keeps its ID and creation timestamp. |
| `POST /api/levels/{id}/validate` | Runs the bounded playability search. It does not change the saved level. |
| `POST /api/levels/from-sketch` | Checks an uploaded image and calls the requested recognition mode. It does not automatically save the result. |

Save the sample level:

```bash
curl -X POST http://127.0.0.1:8000/api/levels \
  -H 'Content-Type: application/json' \
  --data-binary @contracts/examples/multi-jump.json
```

Copy the returned `id` into these commands:

```bash
curl http://127.0.0.1:8000/api/levels/LEVEL_ID
curl -X POST http://127.0.0.1:8000/api/levels/LEVEL_ID/validate
curl -X PUT http://127.0.0.1:8000/api/levels/LEVEL_ID \
  -H 'Content-Type: application/json' --data-binary @contracts/examples/flat.json
```

The game consumes the record's `level` field, not the whole storage record. In a frontend, fetch the record and pass `record.level` to `loadLevel`. The browser integration suite does exactly that, then replays a checker route through the game.

## Uploads and recognition

```bash
curl -X POST 'http://127.0.0.1:8000/api/levels/from-sketch?mode=mock&fixture=flat' \
  -F 'file=@path/to/sketch.png'
```

Replace the path with an actual JPEG or PNG. File content is checked with Pillow; an extension or MIME type alone is not trusted. Files may be at most 5 MiB, at most 4096 pixels on either side and at most 12 million pixels in total. The whole request is capped at 5 MiB plus 64 KiB before multipart parsing. Damaged files, unsupported image content and oversized images are rejected. Filenames are ignored and images are not saved, so uploaded paths cannot select a server file.

Mock mode returns a selected fixture: `flat`, `one-jump`, `multi-jump`, `coins` or `spikes`. Both the response and level metadata mark it as mock. `image_analyzed` is false. There are no invented model scores. A mock response is useful for connecting the API and game, not for checking drawing recognition.

`mode=real` returns 503 with an explanation that the object detector and trained checkpoint are not connected. It never falls back to mock mode.

`app/recognition.py` defines the adapter interface. Future real recognition should locate boxes with OpenCV, crop each box, classify crops with `ml.predict`, convert boxes using `contracts.coordinates.image_to_world`, and return the shared level format for review. The CNN alone cannot locate symbols. Keep the game independent of detector-specific output. Missing spawn/goal objects and incorrectly sized spawn markers need correction before a document can be saved as a playable level.

## Files and errors

- `app/main.py`: request validation, routes, upload limits and application startup.
- `app/storage.py`: SQLite reads and writes.
- `app/recognition.py`: explicit mock and unavailable-real adapters.
- `tests/test_api.py`: isolated API and storage integration tests.

Errors use `{"error":{"code":"...","message":"..."}}`. Invalid request data returns 422, missing levels return 404, oversized bodies return 413, and unavailable recognition/storage returns 503. Request-validation errors deliberately avoid echoing file paths or raw input. The default API documentation remains available at `/docs`.

Run tests from the repository root:

```bash
python -m pytest backend/tests -q
```

No uploaded images, databases, datasets or secrets belong in Git.
