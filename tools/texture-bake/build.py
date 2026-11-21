import sys, copy
from glb import load, save
NEW, OLD, TEX, OUT = sys.argv[1:5]
j, b = load(NEW); oj, ob = load(OLD)
def add_bytes(data):
    global b
    while len(b) % 4: b += b'\x00'
    off = len(b); b += data
    j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
    return len(j['bufferViews']) - 1
# textura de cor
img = open(TEX, 'rb').read()
j['images'].append({'name': 'basecolor', 'mimeType': 'image/jpeg', 'bufferView': add_bytes(img)})
j['textures'].append({'sampler': 0, 'source': len(j['images']) - 1})
m = j['materials'][0]
m['pbrMetallicRoughness'] = {'baseColorTexture': {'index': len(j['textures']) - 1}, 'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0, 'roughnessFactor': 0.9}
m['name'] = 'survivor'
# animação Attack do modelo antigo
names = {n.get('name'): i for i, n in enumerate(j['nodes'])}
for a in oj['animations']:
    if a['name'] != 'Attack': continue
    na = {'name': 'Attack', 'samplers': [], 'channels': []}
    acc_map = {}
    def copy_acc(i):
        if i in acc_map: return acc_map[i]
        a0 = copy.deepcopy(oj['accessors'][i]); bv = oj['bufferViews'][a0['bufferView']]
        start = bv.get('byteOffset', 0); data = bytes(ob[start:start + bv['byteLength']])
        a0['bufferView'] = add_bytes(data)
        j['accessors'].append(a0); acc_map[i] = len(j['accessors']) - 1
        return acc_map[i]
    for ch in a['channels']:
        tname = oj['nodes'][ch['target']['node']].get('name')
        if tname not in names: continue
        s = a['samplers'][ch['sampler']]
        na['samplers'].append({'input': copy_acc(s['input']), 'output': copy_acc(s['output']), 'interpolation': s.get('interpolation', 'LINEAR')})
        na['channels'].append({'sampler': len(na['samplers']) - 1, 'target': {'node': names[tname], 'path': ch['target']['path']}})
    j['animations'].append(na)
    print('Attack channels', len(na['channels']), 'of', len(a['channels']))
save(OUT, j, b)
print([x['name'] for x in j['animations']])
