"""Start the local collection tool with python -m sketch.app."""
import argparse
import base64
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response

from backend.app.main import BodyLimit
from .api import router
from .collection import Collection, png_bytes
from .detection import MAX_BYTES, detect, load_image


def create_app(root='ml/data/collected'):
    store = Collection(root)
    app = FastAPI(title='DreamCraft sheet collection')
    app.add_middleware(BodyLimit)
    app.include_router(router)

    @app.get('/', response_class=HTMLResponse)
    def index():
        return (Path(__file__).parent / 'collection.html').read_text()

    @app.post('/collection/detect')
    async def upload(file: UploadFile = File(...), method: str = Form('adaptive'), region: str = Form('null')):
        import json
        try:
            data = await file.read(MAX_BYTES + 1)
            image = load_image(data)
            boxes = detect(image, method=method, region=json.loads(region))
            return {'width': image.width, 'height': image.height, 'boxes': boxes,
                    'image': 'data:image/png;base64,' + base64.b64encode(png_bytes(image)).decode()}
        except (ValueError, TypeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        finally:
            await file.close()

    @app.post('/collection/save')
    async def save(file: UploadFile = File(...), sheet_id: str = Form(...), contributor_id: str = Form(...), label: str = Form(...), boxes: str = Form(...)):
        import json
        try:
            data = await file.read(MAX_BYTES + 1)
            return store.save(data, sheet_id, contributor_id, label, json.loads(boxes))
        except (ValueError, TypeError, KeyError) as exc:
            raise HTTPException(422, str(exc)) from exc
        finally:
            await file.close()

    @app.get('/collection/metadata.csv')
    def export():
        return Response(store.export(), media_type='text/csv', headers={'Content-Disposition': 'attachment; filename="metadata.csv"'})

    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', default='ml/data/collected')
    parser.add_argument('--port', type=int, default=7860)
    args = parser.parse_args()
    import uvicorn
    print(f'Dataset folder: {Path(args.data).resolve()}')
    uvicorn.run(create_app(args.data), host='127.0.0.1', port=args.port)


if __name__ == '__main__':
    main()
