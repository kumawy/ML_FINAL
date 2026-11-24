#!/usr/bin/env python3
"""Assemble the offline fifteen-scene cockpit presentation from authored parts."""
from __future__ import annotations

from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
IDS = ['cover','question','data','eda-price','eda-mileage','protocol','supervised','clusters','pca','ann','comparison','errors','proposal','conclusion','thanks']
PARTS = ['approved-pilot.html','evidence.html','methods.html','synthesis.html','pca.html']


def island(value):
    return json.dumps(value, ensure_ascii=False, indent=2).replace('</', '<\\/')


def manifest():
    path = ROOT / 'assets/data/pilot-manifest.json'
    data = json.loads(path.read_text())
    scenes = data if isinstance(data, list) else data.get('scenes', data.get('slides'))
    if not isinstance(scenes, list) or [x.get('sceneId') for x in scenes] != IDS:
        raise ValueError('Expected authored fifteen-scene order: ' + ', '.join(IDS))
    for i, scene in enumerate(scenes):
        if scene.get('start') != i * 20 or scene.get('duration') != 20:
            raise ValueError(f'{scene["sceneId"]}: expected start={i*20}, duration=20')
        scene.setdefault('notes', scene.get('notesRU', ''))
        if not scene['notes'].strip():
            raise ValueError('Missing authored speaker notes for ' + scene['sceneId'])
    return scenes


class SceneParts(HTMLParser):
    """Locate whole section elements without modifying nested chart markup."""
    def __init__(self, text):
        super().__init__(convert_charrefs=False)
        self.text = text
        self.offsets = [0]
        for line in text.splitlines(keepends=True):
            self.offsets.append(self.offsets[-1] + len(line))
        self.matches = []
        self.start = None
        self.scene_id = None
        self.depth = 0
        self.feed(text)
        self.close()
        if self.start is not None:
            raise ValueError('Unclosed scene section: ' + str(self.scene_id))

    def char_offset(self):
        row, column = self.getpos()
        return self.offsets[row - 1] + column

    def handle_starttag(self, tag, attrs):
        if tag != 'section':
            return
        values = dict(attrs)
        if self.start is not None:
            self.depth += 1
        elif 'data-scene-id' in values:
            self.start, self.scene_id, self.depth = self.char_offset(), values['data-scene-id'], 1

    def handle_endtag(self, tag):
        if tag != 'section' or self.start is None:
            return
        self.depth -= 1
        if self.depth == 0:
            end = self.text.index('>', self.char_offset()) + 1
            self.matches.append((self.scene_id, self.start, end))
            self.start = self.scene_id = None


def set_attribute(tag, name, value):
    pattern = rf'\b{re.escape(name)}\s*=\s*([\"\']).*?\1'
    attr = f'{name}="{value}"'
    if re.search(pattern, tag, flags=re.I | re.S):
        return re.sub(pattern, lambda _: attr, tag, count=1, flags=re.I | re.S)
    return tag[:-1] + ' ' + attr + '>'


def assemble(scenes):
    blocks, shared = {}, []
    for name in PARTS:
        path = ROOT / 'source/parts' / name
        if not path.exists():
            raise FileNotFoundError('Authored scene part not ready: ' + str(path))
        text = path.read_text()
        parsed = SceneParts(text)
        previous = 0
        for scene_id, start, end in parsed.matches:
            if scene_id in blocks:
                raise ValueError('Duplicate authored scene: ' + scene_id)
            blocks[scene_id] = text[start:end]
            shared.append(text[previous:start])
            previous = end
        shared.append(text[previous:])
    if set(blocks) != set(IDS):
        raise ValueError('Scene mismatch: missing=' + str(sorted(set(IDS)-set(blocks))) + '; extra=' + str(sorted(set(blocks)-set(IDS))))
    ordered = []
    for scene in scenes:
        block = blocks[scene['sceneId']]
        end = block.index('>') + 1
        opening = block[:end]
        for attr, value in [('data-composition-id',scene['sceneId']),('data-start',scene['start']),('data-duration',scene['duration'])]:
            opening = set_attribute(opening, attr, value)
        ordered.append(opening + block[end:])
    markup = '\n'.join(x.strip() for x in shared if x.strip()) + '\n\n' + '\n\n'.join(ordered) + '\n'
    (ROOT / 'composition/slides.html').write_text(markup)
    return markup


def build():
    scenes = manifest()
    slides = assemble(scenes)
    entries = []
    for scene in scenes:
        row = {k:scene[k] for k in ['sceneId','notes','fragments','hotspots','autoplay'] if k in scene}
        row.update(startTime=scene['start'],endTime=scene['start']+scene['duration'])
        if scene['sceneId'] in ('cover', 'thanks'):
            row.setdefault('autoplay', True)
        entries.append(row)
    data_scripts = '\n'.join(f'  <script src="../assets/data/{name}"></script>' for name in ['deck-data.js','evidence-data.js','pilot-data.js','pilot-content.js'] if (ROOT / 'assets/data' / name).exists())
    extra_styles = '\n'.join(f'  <link rel="stylesheet" href="{name}.css">' for name in ['evidence','methods','synthesis','pca-3d','cinematic','finale-type'] if (ROOT / 'composition' / (name+'.css')).exists())
    hud_scripts = '\n'.join(f'  <script src="{name}.js"></script>' for name in ['hud','evidence','methods','synthesis','pca-3d','finale-type','cinematic'] if (ROOT / 'composition' / (name+'.js')).exists())
    values = {'{{SLIDESHOW_ISLAND}}':island({'slides':entries}), '{{SCENE_MANIFEST}}':island(scenes), '{{SLIDES}}':slides, '{{DATA_SCRIPTS}}':data_scripts, '{{EXTRA_STYLES}}':extra_styles, '{{HUD_SCRIPT}}':hud_scripts}
    for template, output in [('index.template.html','index.html'),('composition/index.template.html','composition/index.html')]:
        text = (ROOT / template).read_text()
        for marker, value in values.items():
            text = text.replace(marker, value)
        if re.search(r'\{\{[A-Z_]+\}\}', text):
            raise ValueError('Unresolved template in ' + template)
        (ROOT / output).write_text(text)
    return {'slides':len(scenes),'duration':scenes[-1]['start']+scenes[-1]['duration'],'output':str(ROOT / 'index.html')}


if __name__ == '__main__':
    print(json.dumps(build(),ensure_ascii=False))
