"""Controlled drawings check code behavior, not real handwriting accuracy."""
import csv
import io
import json

import numpy as np
import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from sketch.app import create_app
from sketch.collection import Collection, png_bytes
from sketch.detection import crop, detect, load_image, preview
from sketch.inference import classify_candidates
from sketch.levels import reviewed_level


def drawing(size=(600, 400)):
    image = Image.new('RGB', size, 'white')
    draw = ImageDraw.Draw(image)
    draw.rectangle((30, 40, 150, 90), outline='black', width=4)
    draw.ellipse((230, 40, 290, 100), outline='black', width=4)
    draw.polygon([(350, 110), (400, 30), (450, 110)], outline='black', width=4)
    draw.text((60, 220), 'S', fill='black', font_size=60)
    draw.text((260, 220), 'G', fill='black', font_size=60)
    return image


@pytest.mark.parametrize('format', ['PNG', 'JPEG'])
def test_loading(format):
    data = io.BytesIO()
    drawing().save(data, format=format)
    assert load_image(data.getvalue()).size == (600, 400)


@pytest.mark.parametrize('data', [b'', b'bad', png_bytes(drawing())[:30], b'x' * (5*1024*1024+1)])
def test_bad_images(data):
    with pytest.raises(ValueError):
        load_image(data)


def test_orientation_and_transparency():
    image = Image.new('RGB', (80, 40), 'white')
    exif = Image.Exif(); exif[274] = 6
    data = io.BytesIO(); image.save(data, 'JPEG', exif=exif)
    assert load_image(data.getvalue()).size == (40, 80)
    assert detect(load_image(png_bytes(Image.new('RGBA', (100, 100), (0, 0, 0, 0))))) == []


@pytest.mark.parametrize('method', ['adaptive', 'otsu'])
def test_blank_single_multiple_noise(method):
    blank = Image.new('RGB', (600, 400), 'white')
    assert detect(blank, method) == []
    ImageDraw.Draw(blank).rectangle((30, 40, 150, 90), outline='black', width=4)
    assert len(detect(blank, method)) == 1
    image = drawing()
    ImageDraw.Draw(image).point((550, 300), fill='black')
    boxes = detect(image, method)
    assert len(boxes) == 5
    rectangle = min(boxes, key=lambda b: b['x'])
    assert rectangle['x'] <= 30 and rectangle['y'] <= 40
    assert preview(image, boxes).size == image.size
    for box in boxes:
        sample = crop(image, box)
        assert sample.size == (box['width'], box['height'])
        assert np.asarray(sample).min() == 0


@pytest.mark.parametrize('size', [(1200, 800), (600, 900), (300, 200)])
def test_scale_and_portrait(size):
    image = drawing().resize(size)
    boxes = detect(image, max_side=800)
    assert len(boxes) == 5
    for box in boxes:
        assert box['x'] + box['width'] <= size[0]
        assert box['y'] + box['height'] <= size[1]
    first = min(boxes, key=lambda b: b['x'])
    assert abs(first['x'] / size[0] - .05) < .025


def test_controlled_lighting_and_manual_region():
    image = drawing()
    pixels = np.asarray(image).astype(float)
    pixels *= np.linspace(.65, 1, image.width)[None, :, None]
    assert len(detect(Image.fromarray(pixels.astype('uint8')))) == 5
    boxes = detect(image, region=dict(x=20, y=20, width=150, height=100))
    assert len(boxes) == 1 and boxes[0]['x'] >= 20
    assert crop(image, dict(x=30, y=40, width=121, height=51)).size == (121, 51)
    for bad in [dict(x=-1,y=0,width=1,height=1),dict(x=0,y=0,width=601,height=1),dict(x=0.5,y=0,width=1,height=1)]:
        with pytest.raises(ValueError):
            crop(image, bad)


def test_collection_manifest_groups_and_duplicates(tmp_path):
    store = Collection(tmp_path)
    image = drawing(); boxes = detect(image)
    result = store.save(png_bytes(image), 'sheet1', 'writer1', 'coin', boxes[:2])
    assert result['saved'] == 2
    assert store.save(png_bytes(image), 'sheet1', 'writer1', 'coin', boxes[:2])['duplicates_skipped'] == 2
    for sid, person, label in [('sheet1', 'writer2', 'coin'), ('sheet2','writer1','coin'), ('../bad','writer1','coin')]:
        with pytest.raises(ValueError):
            store.save(png_bytes(image), sid, person, label, boxes)
    rows = list(csv.DictReader(io.StringIO(store.export())))
    assert len(rows) == 2
    assert {r['sheet_id'] for r in rows} == {'sheet1'}
    assert {r['contributor_id'] for r in rows} == {'writer1'}
    (tmp_path / 'metadata.csv').write_text(store.export())
    from ml.dataset import load_samples
    with pytest.raises(ValueError, match='all five classes'):
        load_samples(tmp_path / 'metadata.csv')
    assert len(list((tmp_path / 'originals').iterdir())) == 1
    assert len(list((tmp_path / 'processed').iterdir())) == 2


def test_missing_checkpoint_and_real_predict_interface(tmp_path, monkeypatch):
    image = drawing(); boxes = detect(image)
    result = classify_candidates(image, boxes, tmp_path/'missing.pt')
    assert result['model_status'] == 'unavailable'
    assert all('confidence' not in b and b['review_required'] for b in result['candidates'])
    # A test double checks arguments only; its output is not a recognition result.
    import ml.predict
    calls = []
    def prediction(checkpoint, sample):
        calls.append(sample.size)
        return dict(predicted_class='coin', confidence=.6, scores={})
    monkeypatch.setattr(ml.predict, 'predict', prediction)
    checkpoint = tmp_path/'provided.pt'; checkpoint.touch()
    result = classify_candidates(image, boxes, checkpoint)
    assert len(calls) == len(boxes)
    assert calls[0] == crop(image, boxes[0]).size
    assert result['candidates'][0]['review_required']


def reviewed_objects():
    return [dict(id='floor',type='platform',x=0,y=460,width=960,height=20,reviewed=True),
            dict(id='spawn',type='spawn',x=50,y=430,width=20,height=30,reviewed=True),
            dict(id='goal',type='goal',x=850,y=424,width=24,height=36,reviewed=True)]


def test_reviewed_level_and_fixed_player():
    level = reviewed_level(960,540,reviewed_objects(),960,540)
    assert level['objects'][1]['width'] == 20
    larger = [{**o, **{k:o[k]*2 for k in ('x','y','width','height')}} for o in reviewed_objects()]
    assert reviewed_level(1920,1080,larger,960,540) == level
    for objects in [[],reviewed_objects()[:1],[{**o,'reviewed':False} for o in reviewed_objects()]]:
        with pytest.raises(ValueError):
            reviewed_level(960,540,objects,960,540)
    objects=reviewed_objects();objects[1].update(x=0,width=1)
    with pytest.raises(ValueError):
        reviewed_level(960,540,objects,960,540)


def test_api_and_collection(tmp_path):
    with TestClient(create_app(tmp_path)) as client:
        assert 'Drag on the image' in client.get('/').text
        files={'file':('sheet.png',png_bytes(drawing()),'image/png')}
        response=client.post('/api/sketch/candidates',files=files)
        assert response.status_code==200
        data=response.json()
        assert data['stage']=='candidates' and data['model_status']=='unavailable'
        assert len(data['candidates'])==5 and 'level' not in data
        assert 'confidence' not in json.dumps(data)
        assert client.post('/api/sketch/candidates',files={'file':('bad',b'bad')}).status_code==422
        assert client.post('/api/sketch/candidates?method=wrong',files=files).status_code==422
        detected=client.post('/collection/detect',files=files).json()
        assert len(detected['boxes'])==5
        saved=client.post('/collection/save',files=files,data=dict(sheet_id='s1',contributor_id='w1',label='coin',boxes=json.dumps(detected['boxes'][:1])))
        assert saved.status_code==200 and saved.json()['saved']==1
        assert 's1,w1' in client.get('/collection/metadata.csv').text
        assert client.post('/collection/save',files=files,data=dict(sheet_id='s1',contributor_id='w1',label='coin',boxes='[]')).status_code==422
        body=dict(image_width=960,image_height=540,world_width=960,world_height=540,objects=reviewed_objects())
        assert client.post('/api/sketch/reviewed-level',json=body).status_code==200
        body['objects']=[]
        assert client.post('/api/sketch/reviewed-level',json=body).status_code==422


def test_export_loads_all_classes(tmp_path):
    from ml import CLASSES
    from ml.dataset import load_samples
    store = Collection(tmp_path)
    image = drawing()
    for index, (label, box) in enumerate(zip(CLASSES, detect(image))):
        # Different borders make each source sheet distinct, like separate uploads.
        sheet = image.copy()
        ImageDraw.Draw(sheet).point((599, index), fill='black')
        store.save(png_bytes(sheet), f'sheet{index}', f'writer{index}', label, [box])
    (tmp_path/'metadata.csv').write_text(store.export())
    samples = load_samples(tmp_path/'metadata.csv')
    assert len(samples) == 5
    assert len({s.sheet_id for s in samples}) == 5


def test_real_model_adapter_uses_checkpoint_preprocessing(tmp_path):
    import torch
    from ml import CLASSES
    from ml.model import SymbolCNN
    from ml.predict import predict
    config = {'model': {'channels': [4], 'hidden': 8, 'dropout': 0},
              'preprocessing': {'size': 32, 'threshold': False}}
    model = SymbolCNN(**config['model'])
    checkpoint = tmp_path/'test_only_untrained.pt'
    torch.save({'classes': list(CLASSES), 'config': config, 'model_state': model.state_dict()}, checkpoint)
    image=drawing(); boxes=detect(image)[:1]
    expected=predict(checkpoint,crop(image,boxes[0]))
    actual=classify_candidates(image,boxes,checkpoint)['candidates'][0]
    assert actual['scores'] == expected['scores']
    assert actual['confidence'] == expected['confidence']
    assert actual['x'] == boxes[0]['x']
