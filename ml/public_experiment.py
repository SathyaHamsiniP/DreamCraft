"""Train the existing CNN and record a public-data experiment."""
import argparse
import json
import time
from pathlib import Path

from PIL import Image, ImageDraw

from .dataset import load_samples
from .evaluate import evaluate
from .predict import predict
from .runtime import load_config
from .train import train
from sketch.inference import classify_candidates


def run(data, output, epochs=30):
    config = load_config('ml/config.yaml')
    config.update(data=str(data), output=str(output))
    config['training']['epochs'] = epochs
    started = time.monotonic()
    checkpoint = train(config)
    duration = time.monotonic() - started
    metrics = evaluate(checkpoint, output=Path(output)/'evaluation')
    examples = []
    grid = Image.new('RGB', (600, 800), 'white')
    draw = ImageDraw.Draw(grid)
    counts = {'correct': 0, 'incorrect': 0}
    from . import CLASSES
    test_samples = [s for s in load_samples(data) if s.split == 'test']
    scan = [s for label in range(5) for s in [t for t in test_samples if t.label == label][:20]]
    for sample in scan:
        result = predict(checkpoint, sample.path)
        expected = CLASSES[sample.label]
        kind = 'correct' if result['predicted_class'] == expected else 'incorrect'
        if counts[kind] >= 5:
            continue
        counts[kind] += 1
        i = len(examples)
        with Image.open(sample.path) as image:
            grid.paste(image.convert('RGB').resize((64,64)), (0,i*80))
        draw.text((75,i*80+10), f"{kind}: {expected} -> {result['predicted_class']}", fill='black')
        examples.append({'path': sample.image_id, 'expected': expected, **result})
    grid.save(Path(output)/'evaluation/examples.png')
    (Path(output)/'evaluation/examples.json').write_text(json.dumps(examples,indent=2))
    sample = load_samples(data)[0]
    with Image.open(sample.path) as image:
        adapter = classify_candidates(image, [dict(id='check',x=0,y=0,width=image.width,height=image.height)], checkpoint, review_threshold=1)
    report = {'training_seconds': duration, 'checkpoint': str(checkpoint), 'metrics': metrics,
              'adapter_check': adapter, 'config': config}
    (Path(output)/'experiment.json').write_text(json.dumps(report,indent=2))
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',default='ml/data/public/metadata.csv')
    parser.add_argument('--output',default='ml/runs/public')
    parser.add_argument('--epochs',type=int,default=30)
    args=parser.parse_args()
    if Path(args.output).exists() and any(Path(args.output).iterdir()):
        parser.error('Choose an empty run folder')
    print(json.dumps(run(**vars(args)),indent=2))


if __name__=='__main__':
    main()
