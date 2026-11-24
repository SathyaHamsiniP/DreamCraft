"""Attached shapes and jump-sized hazards use controlled, non-private scenes."""
import json

import pytest
from PIL import Image, ImageDraw

from contracts import ROOT
from sketch.detection import detect
from sketch.automatic import generate, repair_level
from sketch.tests.automatic_fixture import scene, make_fixture


def joined(scale=1, count=1):
    image = Image.new('RGB', (900,500), 'white')
    d=ImageDraw.Draw(image)
    d.rectangle((100,350,800,400), outline='black', width=6)
    for x in ([440] if count == 1 else [350,600]):
        d.polygon([(x-50,350),(x,260),(x+50,350)], outline='black', width=6)
    return image.resize((round(900*scale),round(500*scale)))


@pytest.mark.parametrize('scale', [.6,1,2])
def test_touching_triangle_and_platform_are_separate_without_class_labels(scale):
    image=joined(scale)
    assert len(detect(image)) == 1
    boxes=detect(image,separate_attached=True)
    assert len(boxes) == 2
    assert all(b['separation']=='triangle_on_platform' for b in boxes)
    assert all('predicted_class' not in b for b in boxes)
    assert abs(boxes[0]['x']/scale-390)<8
    assert abs(boxes[1]['y']/scale-350)<8


def test_two_supported_triangles_and_other_nearby_symbols_stay_separate():
    assert len(detect(joined(count=2),separate_attached=True))==3
    image=scene();d=ImageDraw.Draw(image)
    d.rectangle((578,410,635,453),fill='white')
    d.polygon([(565,460),(605,377),(645,460)],outline='black',width=6)
    assert len(detect(image,separate_attached=True))==5


def test_letters_and_circles_touching_platform_are_not_invented_triangles():
    for shape in ['circle','letter']:
        image=Image.new('RGB',(900,500),'white');d=ImageDraw.Draw(image)
        d.rectangle((100,350,800,400),outline='black',width=6)
        if shape=='circle': d.ellipse((400,270,480,352),outline='black',width=6)
        else: d.line([(440,270),(400,300),(480,330),(440,350)],fill='black',width=6)
        assert len(detect(image,separate_attached=True))==1


def test_full_scene_runs_real_test_cnn_without_separating_by_hand(tmp_path,monkeypatch):
    import torch
    torch.set_num_threads(2)
    monkeypatch.setenv('DREAMCRAFT_CHECKPOINT',str(make_fixture(tmp_path)))
    image=scene();d=ImageDraw.Draw(image)
    d.rectangle((578,410,635,453),fill='white');d.polygon([(565,460),(605,377),(645,460)],outline='black',width=6)
    result=generate(image)
    assert result['status']=='awaiting_phaser',result['issues']
    assert not any(c.get('label_source')=='user' for c in result['candidates'])
    hazard=next(o for o in result['level']['objects'] if o['type']=='spike')
    assert hazard['height']<=24 and hazard['width']<=48
    assert any(c['kind']=='fit_hazard' and c['before']['height']>69 for c in result['changes'])
    disabled=generate(image,allow_repairs=False)
    assert disabled['status']=='needs_correction'
    assert not disabled['changes']


def test_two_gaps_get_two_bounded_bridges():
    level=json.loads((ROOT/'examples'/'flat.json').read_text())
    floor=next(o for o in level['objects'] if o['type']=='platform');floor['width']=240
    level['objects'] += [dict(floor,id='middle',x=430,width=200),dict(floor,id='last',x=820,width=140)]
    result=repair_level(level)
    assert result['assessment']['status']=='reachable'
    assert sum(c['kind']=='add_bridge' for c in result['changes'])==2
    assert len(result['attempts'])==3
