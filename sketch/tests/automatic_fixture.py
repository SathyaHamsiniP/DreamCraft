"""Test-only prototype weights for the existing CNN; never a recognition model.

No training is run. Fixed linear weights separate the five controlled drawings
using their pooled features. This checks plumbing, not handwriting accuracy.
"""
import argparse
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def scene(scale=1, gap=0):
    image = Image.new('RGB', (960, 540), 'white')
    d = ImageDraw.Draw(image)
    d.rectangle((20,460,940,480), outline='black', width=3)
    d.ellipse((290,410,314,434), outline='black', width=3)
    d.polygon([(590,448),(605,420),(620,448)], outline='black', width=3)
    font = ImageFont.load_default(size=48)
    d.text((65,412), 'S', fill='black', font=font, anchor='lt')
    d.text((860,412), 'G', fill='black', font=font, anchor='lt')
    return image.resize((round(960*scale), round(540*scale)))


def make_fixture(directory):
    import torch
    from ml import CLASSES
    from ml.model import SymbolCNN
    from ml.preprocess import preprocess
    from sketch.detection import detect, crop
    directory = Path(directory); directory.mkdir(parents=True, exist_ok=True)
    image = scene(); image.save(directory/'scene.png')
    image.save(directory/'scene.jpg', quality=95)
    portrait = Image.new('RGB', (960,1200), 'white'); portrait.paste(image, (0,600)); portrait.save(directory/'portrait.png')
    scene(1.5).save(directory/'large.png')
    scene(.75).save(directory/'small.png')
    scene(.75).save(directory/'small.jpg', quality=95)
    gap = image.copy(); d = ImageDraw.Draw(gap)
    d.rectangle((0,455,959,490), fill='white')
    d.rectangle((20,460,280,480), outline='black', width=3)
    d.rectangle((460,460,940,480), outline='black', width=3)
    gap.save(directory/'gap.png')
    high = image.copy(); d = ImageDraw.Draw(high); d.rectangle((850,400,940,455), fill='white')
    d.text((860,50), 'G', font=ImageFont.load_default(size=48), fill='black', anchor='lt'); high.save(directory/'high.png')
    blank = Image.new('RGB', (960,540), 'white'); blank.save(directory/'blank.png')
    touching = image.copy(); ImageDraw.Draw(touching).line((80,430,80,470), fill='black', width=4); touching.save(directory/'touching.png')
    config = {'model': {'channels': [8], 'hidden': 32, 'dropout': 0}, 'preprocessing': {'size': 64, 'threshold': True}}
    model = SymbolCNN(**config['model'])
    with torch.no_grad():
        for p in model.parameters(): p.zero_()
        kernels = torch.tensor([
            [[0,0,0],[0,1,0],[0,0,0]],
            [[-1,0,1],[-1,0,1],[-1,0,1]],
            [[1,0,-1],[1,0,-1],[1,0,-1]],
            [[-1,-1,-1],[0,0,0],[1,1,1]],
            [[1,1,1],[0,0,0],[-1,-1,-1]],
            [[0,-1,0],[-1,4,-1],[0,-1,0]],
            [[0,0,0],[0,1,0],[0,0,0]],
            [[1,1,1],[1,1,1],[1,1,1]],
        ], dtype=torch.float32)
        model.features[0].weight[:,0] = kernels
        model.classifier[1].weight.copy_(torch.eye(32))
        vectors = {}
        for b in detect(image):
            x = b['x']
            label = 'platform' if b['width'] > 800 else 'spawn' if x < 100 else 'coin' if x < 400 else 'spike' if x < 700 else 'goal'
            from PIL import ImageOps
            sample = crop(image,b)
            vectors[label] = torch.stack([model.features(preprocess(s).unsqueeze(0)).flatten() for s in (sample, ImageOps.expand(sample, border=2, fill='white'))]).mean(0)
        assert set(vectors) == set(CLASSES)
        for i, label in enumerate(CLASSES):
            v = vectors[label]
            model.classifier[-1].weight[i] = 4000*2*v
            model.classifier[-1].bias[i] = -4000*(v*v).sum()
    torch.save({'classes': list(CLASSES), 'config': config, 'model_state': model.state_dict()}, directory/'fixture.pt')
    return directory/'fixture.pt'


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--serve', type=int)
    args = parser.parse_args()
    import torch
    torch.set_num_threads(2)
    path = make_fixture(args.output)
    if args.serve:
        os.environ['DREAMCRAFT_CHECKPOINT'] = str(path)
        os.environ['DREAMCRAFT_DB'] = str(Path(args.output)/'levels.sqlite3')
        import uvicorn
        uvicorn.run('backend.app.main:app', host='127.0.0.1', port=args.serve)
