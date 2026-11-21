import numpy as np, json, copy, sys
from scipy.spatial import cKDTree
from glb import load, acc, save
SRC, TEMPLATE, COLOR, OUT = sys.argv[1:5]
P = np.load('fbx_P.npy'); N = np.load('fbx_N.npy')
N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9
UV = np.fromfile('fbx_uv.bin', np.float32).reshape(-1, 2).copy(); UV[:, 1] = 1 - UV[:, 1]  # three -> glTF
I = np.fromfile('fbx_idx.bin', np.uint32)
j, b = load(SRC); pr = j['meshes'][0]['primitives'][0]
Q = acc(j, b, pr['attributes']['POSITION']).astype(np.float64)
QN = acc(j, b, pr['attributes']['NORMAL']).astype(np.float64)
QJ = acc(j, b, pr['attributes']['JOINTS_0']).astype(np.int64)
QW = acc(j, b, pr['attributes']['WEIGHTS_0']).astype(np.float64)
nj = len(j['skins'][0]['joints'])
tree = cKDTree(Q); K = 8
d, nb = tree.query(P, K)
agree = (QN[nb] * N[:, None, :]).sum(2) > 0.2
agree[:, 0] |= ~agree.any(1)                       # sem vizinho compatível: usa o mais próximo
w = agree / (d + 1e-4) ** 2
W = np.zeros((len(P), nj))
for k in range(K):
    for c in range(4):
        np.add.at(W, (np.arange(len(P)), QJ[nb[:, k], c]), w[:, k] * QW[nb[:, k], c])
top = np.argsort(-W, 1)[:, :4]
TW = np.take_along_axis(W, top, 1); TW /= TW.sum(1, keepdims=True)
print('verts', len(P), 'max influences used', (TW > 0.01).sum(1).max())

t, tb = load(TEMPLATE)  # castaway-survivor.glb: esqueleto, skin, 4 animações
newb = bytearray(); views = []; accs = []
def add_view(data, target=None):
    global newb
    while len(newb) % 4: newb += b'\x00'
    v = {'buffer': 0, 'byteOffset': len(newb), 'byteLength': len(data)}
    if target: v['target'] = target
    newb += data; views.append(v); return len(views) - 1
def add_acc(arr, ctype, typ, target=None, minmax=False):
    a = {'bufferView': add_view(arr.tobytes(), target), 'componentType': ctype, 'count': len(arr), 'type': typ}
    if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
    accs.append(a); return len(accs) - 1
def copy_acc(i):
    a = copy.deepcopy(t['accessors'][i]); bv = t['bufferViews'][a['bufferView']]
    st = bv.get('byteOffset', 0); a['bufferView'] = add_view(bytes(tb[st:st + bv['byteLength']]))
    accs.append(a); return len(accs) - 1
prim = {'attributes': {
    'POSITION': add_acc(P.astype(np.float32), 5126, 'VEC3', 34962, True),
    'NORMAL': add_acc(N.astype(np.float32), 5126, 'VEC3', 34962),
    'TEXCOORD_0': add_acc(UV.astype(np.float32), 5126, 'VEC2', 34962),
    'JOINTS_0': add_acc(top.astype(np.uint16), 5123, 'VEC4', 34962),
    'WEIGHTS_0': add_acc(TW.astype(np.float32), 5126, 'VEC4', 34962)},
    'indices': add_acc(I.astype(np.uint32), 5125, 'SCALAR', 34963), 'material': 0}
skin = copy.deepcopy(t['skins'][0]); skin['inverseBindMatrices'] = copy_acc(skin['inverseBindMatrices'])
anims = []
for a in t['animations']:
    na = {'name': a['name'], 'channels': a['channels'], 'samplers': []}
    for s in a['samplers']:
        na['samplers'].append({'input': copy_acc(s['input']), 'output': copy_acc(s['output']), 'interpolation': s.get('interpolation', 'LINEAR')})
    anims.append(na)
img = add_view(open(COLOR, 'rb').read())
out = {
    'asset': {'version': '2.0', 'generator': 'jangatec texture-bake/transfer.py'},
    'scene': 0, 'scenes': t['scenes'], 'nodes': t['nodes'],
    'meshes': [{'name': 'survivor', 'primitives': [prim]}], 'skins': [skin], 'animations': anims,
    'materials': [{'name': 'survivor', 'doubleSided': True, 'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 0.9}}],
    'textures': [{'sampler': 0, 'source': 0}], 'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
    'images': [{'name': 'Color', 'mimeType': 'image/jpeg', 'bufferView': img}],
    'accessors': accs, 'bufferViews': views,
}
save(OUT, out, newb)
print('anims', [a['name'] for a in anims])
