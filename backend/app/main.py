"""Run the local level API with: uvicorn backend.app.main:app --reload."""
import io
import os
import sqlite3
import warnings
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import RootModel, model_validator
from starlette.exceptions import HTTPException as StarletteHTTPException

from contracts import SCHEMA, validate_level
from .recognition import MockRecognizer, RealRecognizer, RecognitionUnavailable
from .storage import LevelStore

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_BODY_BYTES = MAX_FILE_BYTES + 65536
MAX_DIMENSION = 4096
MAX_PIXELS = 12_000_000


def error(status, code, message):
    return JSONResponse(status_code=status, content={'error': {'code': code, 'message': message}})


class BodyLimit:
    """Reject large request bodies before multipart parsing creates temporary files."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in ('POST', 'PUT'):
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            message = await receive()
            if message['type'] == 'http.disconnect':
                return
            size += len(message.get('body', b''))
            if size > MAX_BODY_BYTES:
                return await error(413, 'request_too_large', 'Request is larger than the upload limit')(scope, receive, send)
            chunks.append(message.get('body', b''))
            if not message.get('more_body'):
                break
        body = b''.join(chunks)
        delivered = False

        async def replay():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {'type': 'http.request', 'body': body, 'more_body': False}
            return await receive()
        await self.app(scope, replay, send)


class LevelBody(RootModel[dict]):
    model_config = {'json_schema_extra': SCHEMA}

    @model_validator(mode='after')
    def check(self):
        validate_level(self.root)
        return self


def read_image(data):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in ('JPEG', 'PNG'):
                    raise ValueError('Only JPEG and PNG image content is accepted')
                if max(source.size) > MAX_DIMENSION or source.width * source.height > MAX_PIXELS:
                    raise ValueError('Image dimensions exceed the limit')
                source.verify()
            with Image.open(io.BytesIO(data)) as source:
                return ImageOps.exif_transpose(source).convert('RGB')
    except (OSError, UnidentifiedImageError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError('Image is damaged or cannot be read') from exc


def create_app(db_path=None):
    store = LevelStore(db_path or os.environ.get('DREAMCRAFT_DB', 'backend/data/levels.sqlite3'))

    @asynccontextmanager
    async def lifespan(app):
        store.initialize()
        yield

    app = FastAPI(title='DreamCraft API', version='0.1.0', lifespan=lifespan)
    app.add_middleware(BodyLimit)
    app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'], allow_methods=['GET', 'POST', 'PUT'], allow_headers=['Content-Type'])

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request, exc):
        return error(exc.status_code, 'request_error', str(exc.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return error(422, 'invalid_request', 'Request data is invalid. Check the level schema, required fields and query values.')

    @app.exception_handler(sqlite3.Error)
    async def database_error(request, exc):
        return error(503, 'storage_unavailable', 'Level storage is temporarily unavailable')

    @app.exception_handler(Exception)
    async def unexpected_error(request, exc):
        return error(500, 'server_error', 'The request could not be completed')

    @app.get('/api/health')
    def health():
        return {'status': 'ok'}

    @app.post('/api/levels', status_code=201, summary='Save a level')
    def save(level: LevelBody):
        return store.save(level.root)

    @app.get('/api/levels', summary='List up to 100 saved levels')
    def list_levels(offset: int = Query(default=0, ge=0)):
        return store.list(offset)

    @app.post('/api/levels/from-sketch', summary='Use a mock fixture or request real recognition')
    async def from_sketch(mode: Literal['mock', 'real'] = 'mock', fixture: Literal['flat', 'one-jump', 'multi-jump', 'coins', 'spikes'] = 'flat', file: UploadFile = File(...)):
        try:
            data = await file.read(MAX_FILE_BYTES + 1)
        finally:
            await file.close()
        if len(data) > MAX_FILE_BYTES:
            raise HTTPException(413, 'Image must be at most 5 MiB')
        try:
            with read_image(data) as image:
                recognizer = MockRecognizer() if mode == 'mock' else RealRecognizer()
                return {'mode': mode, 'image_analyzed': False, 'level': recognizer.recognize(image, fixture)}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        except RecognitionUnavailable as exc:
            raise HTTPException(503, str(exc)) from exc

    def get_or_404(level_id):
        record = store.get(level_id)
        if record is None:
            raise HTTPException(404, 'Level not found')
        return record

    @app.get('/api/levels/{level_id}')
    def get_level(level_id: str):
        return get_or_404(level_id)

    @app.put('/api/levels/{level_id}')
    def update(level_id: str, level: LevelBody):
        result = store.save(level.root, level_id)
        if result is None:
            raise HTTPException(404, 'Level not found')
        return result

    @app.post('/api/levels/{level_id}/validate', summary='Search for a path to the goal')
    def validate(level_id: str):
        from playability.validator import check_playability
        return check_playability(get_or_404(level_id)['level'])

    return app


app = create_app()
