"""Independent stdlib XML oracle. Emit a digest only, never fixture data."""
import gzip
import hashlib
import json
import sys
import xml.etree.ElementTree as ET

try:
    root = ET.fromstring(gzip.decompress(sys.stdin.buffer.read()))
    samples = []
    for ref in root.findall('.//SampleRef/FileRef'):
        def val(name):
            el = ref.find(name)
            return el.get('Value') if el is not None else None
        samples.append([val('Path') or None, val('RelativePath') or None, val('RelativePathType')])
    tempos = []
    for track in ['MainTrack', 'MasterTrack']:
        el = root.find('./LiveSet/' + track + '/DeviceChain/Mixer/Tempo/Manual')
        if el is not None:
            tempos.append(float(el.get('Value')))
    # Stringify tempo separately to avoid Python/JS integer float formatting differences.
    payload = [root.get('Creator'), root.get('MinorVersion'), samples]
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    print(json.dumps({'digest': digest, 'tempo': tempos[0] if len(tempos) == 1 else None}))
except Exception:
    print('Independent XML oracle failed', file=sys.stderr)
    sys.exit(1)
