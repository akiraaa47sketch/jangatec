import json, struct, numpy as np
CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def load(path):
    f = open(path, 'rb').read()
    clen, = struct.unpack('<I', f[12:16]); j = json.loads(f[20:20 + clen])
    off = 20 + clen; blen, = struct.unpack('<I', f[off:off + 4]); binb = f[off + 8: off + 8 + blen]
    return j, bytearray(binb)
def acc(j, b, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]; n = NC[a['type']]; start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride'); isz = np.dtype(dt).itemsize * n
    if stride and stride != isz:
        raw = np.frombuffer(bytes(b), np.uint8)
        rows = np.stack([raw[start + k * stride: start + k * stride + isz] for k in range(a['count'])])
        arr = rows.view(dt).reshape(a['count'], n)
    else:
        arr = np.frombuffer(bytes(b), dt, a['count'] * n, start).reshape(a['count'], n)
    if a.get('normalized'): arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr
def save(path, j, b):
    while len(b) % 4: b += b'\x00'
    j['buffers'] = [{'byteLength': len(b)}]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(b))
    out += struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(b), b'BIN\x00') + bytes(b)
    open(path, 'wb').write(out)
